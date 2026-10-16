import { toDayKey } from '@/lib/format';
import { ApiError } from '../errors';
import { canTransition, REJECTION_REASON_MAX } from '../lifecycle';
import { REQUEST_NOTE_MAX } from '../schemas';
import type {
  AdminRequestListItem,
  AppNotification,
  NotificationKind,
  RequestDetail,
  RequestListItem,
  RequestQuery,
  RequestStatus,
  Supply,
  SupplyQuery,
  User,
} from '../schemas';
import type { AtkApi } from '../types';
import { createMockRequests, createMockSupplies, MOCK_PASSWORD, mockUsers, PICKUP_LOCATION, type MockRequest } from './data';

const SESSION_KEY = 'atk.mock.session';
const MAX_FAILED_LOGINS = 5;

type MockOptions = { latencyMs?: number; storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null };

const safeStorage = (): MockOptions['storage'] => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

const paginate = <T>(rows: T[], page = 1, pageSize = 20) => ({
  data: rows.slice((page - 1) * pageSize, page * pageSize),
  meta: { page, pageSize, total: rows.length },
});

const toDetail = ({ requesterId: _owner, ...detail }: MockRequest): RequestDetail => structuredClone(detail);

const toListItem = ({ id, code, createdAt, itemCount, totalQuantity, pickupLocation, status }: MockRequest): RequestListItem => ({
  id,
  code,
  createdAt,
  itemCount,
  totalQuantity,
  pickupLocation,
  status,
});

const toAdminListItem = (req: MockRequest): AdminRequestListItem => ({ ...toListItem(req), requester: { ...req.requester } });

const abortable = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });

export const createMockApi = ({ latencyMs = 350, storage = safeStorage() }: MockOptions = {}): AtkApi => {
  const supplies: Supply[] = createMockSupplies();
  const requests: MockRequest[] = createMockRequests();
  const idempotency = new Map<string, MockRequest>();
  const failedLogins = new Map<string, number>();

  const notifications: Array<AppNotification & { recipientId: string }> = [];
  const listeners = new Set<() => void>();
  let notificationSeq = 0;

  const notify = (recipientId: string, req: MockRequest, kind: NotificationKind, title: string, body: string, at = new Date()) => {
    notificationSeq += 1;
    notifications.unshift({
      id: `ntf_${notificationSeq}`,
      recipientId,
      kind,
      title,
      body,
      requestId: req.id,
      createdAt: at.toISOString(),
      readAt: null,
    });
    listeners.forEach((listener) => listener());
  };

  const notifyAdminsOfSubmission = (req: MockRequest, at?: Date) =>
    mockUsers
      .filter((user) => user.role === 'admin' && user.id !== req.requesterId)
      .forEach((admin) =>
        notify(
          admin.id,
          req,
          'request_submitted',
          `New request ${req.code}`,
          `${req.requester.name} requested ${req.itemCount} ${req.itemCount === 1 ? 'item' : 'items'} (${req.totalQuantity} qty).` +
            (req.note ? ` Note: "${req.note.slice(0, 200)}"` : ' Waiting for your review.'),
          at,
        ),
      );

  const notifyRequester = (req: MockRequest, reviewerId: string) => {
    if (reviewerId === req.requesterId) return;
    if (req.status === 'approved') {
      notify(req.requesterId, req, 'request_approved', `${req.code} approved`, 'General Affair approved your request. You will be notified when it is ready for pickup.');
    } else if (req.status === 'rejected') {
      notify(req.requesterId, req, 'request_rejected', `${req.code} rejected`, `Reason: ${req.rejectionReason ?? '-'}`);
    } else if (req.status === 'ready_for_pickup') {
      notify(req.requesterId, req, 'request_ready', `${req.code} ready for pickup`, `Your items are ready. Collect them at ${req.pickupLocation}.`);
    }
  };

  requests
    .filter((req) => req.status === 'pending')
    .forEach((req) => notifyAdminsOfSubmission(req, new Date(req.createdAt)));

  const delay = (signal?: AbortSignal) => abortable(latencyMs, signal);

  const currentUser = (): User => {
    const id = storage?.getItem(SESSION_KEY);
    const user = mockUsers.find((candidate) => candidate.id === id);
    if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has ended. Please log in again.');
    return user;
  };

  const requireAdmin = (): User => {
    const user = currentUser();
    if (user.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Only General Affair admins can review requests.');
    return user;
  };

  const filterSupplies = ({ search, inStockOnly, sort = 'name_asc' }: SupplyQuery) => {
    const term = search?.trim().toLowerCase() ?? '';
    return supplies
      .filter((supply) => (!term || supply.name.toLowerCase().includes(term)) && (!inStockOnly || supply.stock > 0))
      .sort((a, b) => (sort === 'stock_desc' ? b.stock - a.stock : a.name.localeCompare(b.name)));
  };

  const filterRequests = (
    { search, status, dateFrom, dateTo, sort = 'newest' }: RequestQuery,
    { ownerId, matchRequester }: { ownerId: string | null; matchRequester: boolean },
  ) => {
    const term = search?.trim().toLowerCase() ?? '';
    const matches = (req: MockRequest) =>
      req.code.toLowerCase().includes(term) ||
      req.items.some((i) => i.name.toLowerCase().includes(term)) ||
      (matchRequester && req.requester.name.toLowerCase().includes(term));
    return requests
      .filter((req) => {
        const day = toDayKey(req.createdAt);
        return (
          (ownerId === null || req.requesterId === ownerId) &&
          (!term || matches(req)) &&
          (!status || req.status === status) &&
          (!dateFrom || day >= dateFrom) &&
          (!dateTo || day <= dateTo)
        );
      })
      .sort((a, b) => (sort === 'oldest' ? 1 : -1) * a.createdAt.localeCompare(b.createdAt));
  };

  const countBy = (rows: MockRequest[], ...statuses: RequestStatus[]) => rows.filter((r) => statuses.includes(r.status)).length;

  const nextCode = (now: Date) => {
    const day = toDayKey(now).replace(/-/g, '');
    const sameDay = requests.filter((req) => req.code.startsWith(`REQ-${day}`)).length;
    return `REQ-${day}-${String(sameDay + 1).padStart(3, '0')}`;
  };

  const findRequest = (id: string) => {
    const found = requests.find((req) => req.id === id);
    if (!found) throw new ApiError(404, 'NOT_FOUND', 'This request no longer exists.');
    return found;
  };

  return {
    auth: {
      login: async ({ email, password }) => {
        await delay();
        const normalized = email.trim().toLowerCase();
        if ((failedLogins.get(normalized) ?? 0) >= MAX_FAILED_LOGINS) {
          throw new ApiError(423, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again in 15 minutes.');
        }
        const user = mockUsers.find((candidate) => candidate.email === normalized);
        if (!user || password !== MOCK_PASSWORD) {
          failedLogins.set(normalized, (failedLogins.get(normalized) ?? 0) + 1);
          throw new ApiError(401, 'INVALID_CREDENTIALS', 'The email or password is incorrect.');
        }
        failedLogins.delete(normalized);
        storage?.setItem(SESSION_KEY, user.id);
        return user;
      },
      logout: async () => {
        await delay();
        storage?.removeItem(SESSION_KEY);
      },
      me: async (opts) => {
        await delay(opts?.signal);
        return currentUser();
      },
    },

    supplies: {
      list: async (query, opts) => {
        await delay(opts?.signal);
        currentUser();
        return paginate(filterSupplies(query).map((s) => ({ ...s })), query.page, query.pageSize);
      },
    },

    requests: {
      summary: async (opts) => {
        await delay(opts?.signal);
        const user = currentUser();
        const mine = requests.filter((r) => r.requesterId === user.id);
        return {
          total: mine.length,
          pending: countBy(mine, 'pending'),
          approved: countBy(mine, 'approved', 'ready_for_pickup', 'finished'),
          rejected: countBy(mine, 'rejected'),
        };
      },
      list: async (query, opts) => {
        await delay(opts?.signal);
        const user = currentUser();
        return paginate(filterRequests(query, { ownerId: user.id, matchRequester: false }).map(toListItem), query.page, query.pageSize);
      },
      get: async (id, opts) => {
        await delay(opts?.signal);
        const user = currentUser();
        const found = findRequest(id);
        if (found.requesterId !== user.id && user.role !== 'admin') {
          throw new ApiError(403, 'FORBIDDEN', "You don't have access to this request.");
        }
        return toDetail(found);
      },
      create: async ({ items, idempotencyKey, note }) => {
        await delay();
        const user = currentUser();
        const replay = idempotency.get(`${user.id}:${idempotencyKey}`);
        if (replay) return toDetail(replay);

        const trimmedNote = note?.trim() || null;
        if (trimmedNote && trimmedNote.length > REQUEST_NOTE_MAX) {
          throw new ApiError(422, 'VALIDATION_FAILED', `Keep the note under ${REQUEST_NOTE_MAX} characters.`, {
            note: `Keep the note under ${REQUEST_NOTE_MAX} characters.`,
          });
        }

        if (items.length === 0) throw new ApiError(422, 'VALIDATION_FAILED', 'Add at least one item.', { items: 'Add at least one item.' });
        const fields: Record<string, string> = {};
        const resolved = items.map(({ supplyId, quantity }) => {
          const supply = supplies.find((s) => s.id === supplyId);
          if (!supply) throw new ApiError(422, 'VALIDATION_FAILED', 'One of the items is no longer available.');
          if (!Number.isInteger(quantity) || quantity < 1) fields[supplyId] = 'Quantity must be at least 1.';
          else if (quantity > supply.stock) fields[supplyId] = `Only ${supply.stock} ${supply.unit} of ${supply.name} left.`;
          return { supply, quantity };
        });
        if (Object.keys(fields).length > 0) {
          throw new ApiError(409, 'INSUFFICIENT_STOCK', Object.values(fields)[0] ?? 'Not enough stock.', fields);
        }

        resolved.forEach(({ supply, quantity }) => {
          supply.stock -= quantity;
        });
        const now = new Date();
        const created: MockRequest = {
          id: `req_${now.getTime()}`,
          code: nextCode(now),
          createdAt: now.toISOString(),
          itemCount: resolved.length,
          totalQuantity: resolved.reduce((sum, { quantity }) => sum + quantity, 0),
          pickupLocation: PICKUP_LOCATION,
          status: 'pending',
          requester: { name: user.name, department: user.department },
          requesterId: user.id,
          items: resolved.map(({ supply, quantity }) => ({ supplyId: supply.id, name: supply.name, quantity })),
          rejectionReason: null,
          note: trimmedNote,
          reviewedAt: null,
          reviewedBy: null,
        };
        requests.unshift(created);
        idempotency.set(`${user.id}:${idempotencyKey}`, created);
        notifyAdminsOfSubmission(created);
        return toDetail(created);
      },
    },

    admin: {
      summary: async (opts) => {
        await delay(opts?.signal);
        requireAdmin();
        return {
          total: requests.length,
          pending: countBy(requests, 'pending'),
          approved: countBy(requests, 'approved'),
          readyForPickup: countBy(requests, 'ready_for_pickup'),
          rejected: countBy(requests, 'rejected'),
          finished: countBy(requests, 'finished'),
        };
      },
      listRequests: async (query, opts) => {
        await delay(opts?.signal);
        requireAdmin();
        return paginate(filterRequests(query, { ownerId: null, matchRequester: true }).map(toAdminListItem), query.page, query.pageSize);
      },
      updateStatus: async ({ id, status, reason }) => {
        await delay();
        const admin = requireAdmin();
        const found = findRequest(id);
        if (!canTransition(found.status, status)) {
          throw new ApiError(
            409,
            'INVALID_TRANSITION',
            `This request is already ${found.status.replace(/_/g, ' ')}. Refresh to see the latest status.`,
          );
        }
        const trimmed = reason?.trim() ?? '';
        if (status === 'rejected') {
          if (!trimmed) throw new ApiError(422, 'VALIDATION_FAILED', 'Give a reason for the rejection.', { reason: 'Give a reason for the rejection.' });
          if (trimmed.length > REJECTION_REASON_MAX) {
            throw new ApiError(422, 'VALIDATION_FAILED', `Keep the reason under ${REJECTION_REASON_MAX} characters.`);
          }
          found.items.forEach(({ supplyId, quantity }) => {
            const supply = supplies.find((s) => s.id === supplyId);
            if (supply) supply.stock += quantity;
          });
          found.rejectionReason = trimmed;
        }
        found.status = status;
        found.reviewedAt = new Date().toISOString();
        found.reviewedBy = admin.name;
        notifyRequester(found, admin.id);
        return toDetail(found);
      },
    },

    notifications: {
      list: async (opts) => {
        await delay(opts?.signal);
        const user = currentUser();
        const mine = notifications.filter((n) => n.recipientId === user.id);
        return {
          data: mine.slice(0, 20).map(({ recipientId: _r, ...n }) => ({ ...n })),
          unread: mine.filter((n) => n.readAt === null).length,
        };
      },
      markRead: async (ids) => {
        await delay();
        const user = currentUser();
        const now = new Date().toISOString();
        notifications
          .filter((n) => n.recipientId === user.id && n.readAt === null && (!ids || ids.length === 0 || ids.includes(n.id)))
          .forEach((n) => {
            n.readAt = now;
          });
      },
      subscribe: (onNew) => {
        listeners.add(onNew);
        return () => {
          listeners.delete(onNew);
        };
      },
    },
  };
};
