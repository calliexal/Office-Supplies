import { z } from 'zod';
import { startOfDayIso, startOfNextDayIso } from '@/lib/format';
import { ApiError } from '../errors';
import {
  adminRequestListItemSchema,
  adminRequestSummarySchema,
  NOTIFICATION_KINDS,
  notificationSchema,
  requestDetailSchema,
  requestListItemSchema,
  requestSummarySchema,
  supplySchema,
  USER_ROLES,
  userSchema,
  type PageMeta,
  type RequestDetail,
  type RequestQuery,
  type User,
} from '../schemas';
import { notifyUnauthorized } from '../session';
import type { AtkApi } from '../types';
import { getSupabase, setRememberSession } from './client';
import { authToApiError, postgrestToApiError, type PostgrestErrorLike } from './errors';

const SUPPLY_IMAGE_BUCKET = 'supply-images';
const MAX_PAGE_SIZE = 100;
const SESSION_ENDED = 'Your session has ended. Please log in again.';

const PROFILE_COLUMNS = 'id, email, name, position, department, role, unread_notifications, unread_messages';
const SUPPLY_COLUMNS = 'id, name, stock, unit, image_url';
const REQUEST_LIST_COLUMNS = 'id, code, created_at, item_count, total_quantity, pickup_location, status';
const ADMIN_REQUEST_LIST_COLUMNS = `${REQUEST_LIST_COLUMNS}, requester_name, requester_department`;
const REQUEST_DETAIL_COLUMNS =
  'id, code, created_at, status, pickup_location, rejection_reason, decided_at, ' +
  'requester:profiles!supply_requests_requester_id_fkey(name, department), ' +
  'reviewer:profiles!supply_requests_decided_by_fkey(name), ' +
  'items:supply_request_items(supply_id, name, quantity)';

const NOTIFICATION_COLUMNS = 'id, kind, title, body, request_id, created_at, read_at';
const NOTIFICATION_LIMIT = 20;

const notificationFromRow = z
  .object({
    id: z.string(),
    kind: z.enum(NOTIFICATION_KINDS),
    title: z.string(),
    body: z.string(),
    request_id: z.string().nullable(),
    created_at: z.string(),
    read_at: z.string().nullable(),
  })
  .transform((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    requestId: row.request_id,
    createdAt: row.created_at,
    readAt: row.read_at,
  }))
  .pipe(notificationSchema);

type QueryResult = { data: unknown; error: PostgrestErrorLike | null; status: number; count?: number | null };
type Abortable<Q> = { abortSignal: (signal: AbortSignal) => Q };
type Page<T> = { data: T[]; meta: PageMeta };

const userFromRow = z
  .object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    position: z.string(),
    department: z.string(),
    role: z.enum(USER_ROLES),
    unread_notifications: z.number(),
    unread_messages: z.number(),
  })
  .transform((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    position: row.position,
    department: row.department,
    role: row.role,
    unreadNotifications: row.unread_notifications,
    unreadMessages: row.unread_messages,
  }))
  .pipe(userSchema);

const requestListItemFromRow = z
  .object({
    id: z.string(),
    code: z.string(),
    created_at: z.string(),
    item_count: z.number(),
    total_quantity: z.number(),
    pickup_location: z.string(),
    status: z.string(),
  })
  .transform((row) => ({
    id: row.id,
    code: row.code,
    createdAt: row.created_at,
    itemCount: row.item_count,
    totalQuantity: row.total_quantity,
    pickupLocation: row.pickup_location,
    status: row.status,
  }))
  .pipe(requestListItemSchema);

const adminRequestListItemFromRow = z
  .object({
    id: z.string(),
    code: z.string(),
    created_at: z.string(),
    item_count: z.number(),
    total_quantity: z.number(),
    pickup_location: z.string(),
    status: z.string(),
    requester_name: z.string(),
    requester_department: z.string(),
  })
  .transform((row) => ({
    id: row.id,
    code: row.code,
    createdAt: row.created_at,
    itemCount: row.item_count,
    totalQuantity: row.total_quantity,
    pickupLocation: row.pickup_location,
    status: row.status,
    requester: { name: row.requester_name, department: row.requester_department },
  }))
  .pipe(adminRequestListItemSchema);

const adminSummaryFromRow = z
  .object({
    total: z.number(),
    pending: z.number(),
    approved: z.number(),
    ready_for_pickup: z.number(),
    rejected: z.number(),
    finished: z.number(),
  })
  .transform(({ ready_for_pickup, ...rest }) => ({ ...rest, readyForPickup: ready_for_pickup }))
  .pipe(adminRequestSummarySchema);

const requestDetailFromRow = z
  .object({
    id: z.string(),
    code: z.string(),
    created_at: z.string(),
    status: z.string(),
    pickup_location: z.string(),
    rejection_reason: z.string().nullable(),
    decided_at: z.string().nullable(),
    requester: z.object({ name: z.string(), department: z.string() }),
    reviewer: z.object({ name: z.string() }).nullable(),
    items: z.array(z.object({ supply_id: z.string(), name: z.string(), quantity: z.number() })),
  })
  .transform((row) => {
    const items = [...row.items]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((item) => ({ supplyId: item.supply_id, name: item.name, quantity: item.quantity }));
    return {
      id: row.id,
      code: row.code,
      createdAt: row.created_at,
      itemCount: items.length,
      totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
      pickupLocation: row.pickup_location,
      status: row.status,
      requester: row.requester,
      items,
      rejectionReason: row.rejection_reason,
      reviewedAt: row.decided_at,
      reviewedBy: row.reviewer?.name ?? null,
    };
  })
  .pipe(requestDetailSchema);

const supplyRow = z.object({
  id: z.string(),
  name: z.string(),
  stock: z.number(),
  unit: z.string(),
  image_url: z.string().nullable(),
});

const parseResponse = <T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown, what: string): T => {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  console.error(`[supabase] ${what} did not match the expected shape`, parsed.error.flatten());
  throw new ApiError(500, 'INVALID_RESPONSE', 'Unexpected response from server');
};

const withSignal = <Q extends Abortable<Q>>(query: Q, signal?: AbortSignal): Q => (signal ? query.abortSignal(signal) : query);

const pageWindow = (page: number, pageSize: number) => {
  const size = Math.min(Math.max(Math.trunc(pageSize) || 1, 1), MAX_PAGE_SIZE);
  const current = Math.max(Math.trunc(page) || 1, 1);
  const from = (current - 1) * size;
  return { from, to: from + size - 1, meta: { page: current, pageSize: size } };
};

const escapeLike = (term: string) => term.replace(/[\\%_]/g, (char) => `\\${char}`);

const sanitizeForOrFilter = (term: string) => term.replace(/[,()"*\\%:]/g, ' ').replace(/\s+/g, ' ').trim();

export const createSupabaseApi = (): AtkApi => {
  let listeningForSignOut = false;
  let signingOut = false;

  const sb = () => {
    const client = getSupabase();
    if (!listeningForSignOut) {
      listeningForSignOut = true;
      client.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT' && !signingOut) notifyUnauthorized();
      });
    }
    return client;
  };

  const fail = (result: QueryResult, signal?: AbortSignal): never => {
    if (signal?.aborted) throw signal.reason;
    const error = postgrestToApiError(result.error ?? { message: 'Unknown error' }, result.status);
    if (error.status === 401) notifyUnauthorized();
    throw error;
  };

  const dataOf = (result: QueryResult, signal?: AbortSignal): unknown => (result.error ? fail(result, signal) : result.data);

  const toPage = <T>(
    result: QueryResult,
    rowSchema: z.ZodType<T, z.ZodTypeDef, unknown>,
    meta: Omit<PageMeta, 'total'>,
    signal: AbortSignal | undefined,
    what: string,
  ): Page<T> => {
    if (result.error?.code === 'PGRST103') return { data: [], meta: { ...meta, total: 0 } };
    const rows = dataOf(result, signal);
    return { data: parseResponse(z.array(rowSchema), rows, what), meta: { ...meta, total: result.count ?? 0 } };
  };

  const requireUserId = async (): Promise<string> => {
    const { data, error } = await sb().auth.getSession();
    if (error) throw authToApiError(error);
    const userId = data.session?.user.id;
    if (!userId) {
      notifyUnauthorized();
      throw new ApiError(401, 'UNAUTHENTICATED', SESSION_ENDED);
    }
    return userId;
  };

  const loadProfile = async (userId: string, signal?: AbortSignal): Promise<User> => {
    const result = await withSignal(sb().from('profiles').select(PROFILE_COLUMNS).eq('id', userId), signal).maybeSingle();
    const row = dataOf(result, signal);
    if (row === null) {
      throw new ApiError(403, 'PROFILE_MISSING', "Your account isn't set up for this app yet. Contact General Affair.");
    }
    return parseResponse(userFromRow, row, 'profile');
  };

  const signOutQuietly = async () => {
    signingOut = true;
    try {
      await sb().auth.signOut({ scope: 'local' });
    } finally {
      signingOut = false;
    }
  };

  const resolveImageUrl = (value: string | null): string | null => {
    if (!value) return null;
    if (/^https?:\/\//i.test(value) || value.startsWith('/')) return value;
    return sb().storage.from(SUPPLY_IMAGE_BUCKET).getPublicUrl(value).data.publicUrl;
  };

  const supplyFromRow = supplyRow
    .transform((row) => ({ id: row.id, name: row.name, stock: row.stock, unit: row.unit, imageUrl: resolveImageUrl(row.image_url) }))
    .pipe(supplySchema);

  const listRequestRows = async (
    columns: string,
    { search, status, dateFrom, dateTo, sort = 'newest', page = 1, pageSize = 20 }: RequestQuery,
    searchColumns: string[],
    requesterId: string | null,
    signal?: AbortSignal,
  ) => {
    const { from, to, meta } = pageWindow(page, pageSize);
    let query = sb().from('supply_request_list').select(columns, { count: 'exact' });
    if (requesterId) query = query.eq('requester_id', requesterId);
    const term = search ? sanitizeForOrFilter(search) : '';
    if (term) query = query.or(searchColumns.map((column) => `${column}.ilike.*${term}*`).join(','));
    if (status) query = query.eq('status', status);
    if (dateFrom) query = query.gte('created_at', startOfDayIso(dateFrom));
    if (dateTo) query = query.lt('created_at', startOfNextDayIso(dateTo));
    query = query.order('created_at', { ascending: sort === 'oldest' }).order('id');
    const rows = await withSignal(query.range(from, to), signal);
    return { rows, meta };
  };

  const getRequest = async (id: string, signal?: AbortSignal): Promise<RequestDetail> => {
    await requireUserId();
    const result = await withSignal(sb().from('supply_requests').select(REQUEST_DETAIL_COLUMNS).eq('id', id), signal).maybeSingle();
    const row = dataOf(result, signal);
    if (row === null) throw new ApiError(404, 'NOT_FOUND', 'This request no longer exists.');
    return parseResponse(requestDetailFromRow, row, 'request detail');
  };

  return {
    auth: {
      login: async ({ email, password, remember }) => {
        setRememberSession(remember);
        const { data, error } = await sb().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
        if (error) throw authToApiError(error);
        try {
          return await loadProfile(data.user.id);
        } catch (profileError) {
          await signOutQuietly();
          throw profileError;
        }
      },
      logout: signOutQuietly,
      me: async (opts) => {
        const { data, error } = await sb().auth.getSession();
        if (error) throw authToApiError(error);
        if (!data.session) throw new ApiError(401, 'UNAUTHENTICATED', SESSION_ENDED);
        return loadProfile(data.session.user.id, opts?.signal);
      },
    },

    supplies: {
      list: async ({ search, inStockOnly, sort = 'name_asc', page = 1, pageSize = 24 }, opts) => {
        await requireUserId();
        const { from, to, meta } = pageWindow(page, pageSize);
        let query = sb().from('supplies').select(SUPPLY_COLUMNS, { count: 'exact' }).eq('is_active', true);
        const term = search?.trim();
        if (term) query = query.ilike('name', `%${escapeLike(term)}%`);
        if (inStockOnly) query = query.gt('stock', 0);
        query = sort === 'stock_desc' ? query.order('stock', { ascending: false }).order('name') : query.order('name');
        const result = await withSignal(query.range(from, to), opts?.signal);
        return toPage(result, supplyFromRow, meta, opts?.signal, 'supplies');
      },
    },

    requests: {
      summary: async (opts) => {
        await requireUserId();
        const result = await withSignal(sb().rpc('my_request_summary'), opts?.signal);
        return parseResponse(requestSummarySchema, dataOf(result, opts?.signal), 'request summary');
      },

      list: async (query, opts) => {
        const userId = await requireUserId();
        const result = await listRequestRows(REQUEST_LIST_COLUMNS, query, ['code', 'item_names'], userId, opts?.signal);
        return toPage(result.rows, requestListItemFromRow, result.meta, opts?.signal, 'request list');
      },

      get: (id, opts) => getRequest(id, opts?.signal),

      create: async ({ items, idempotencyKey }) => {
        await requireUserId();
        const result = await sb().rpc('create_supply_request', {
          p_items: items.map(({ supplyId, quantity }) => ({ supply_id: supplyId, quantity })),
          p_idempotency_key: idempotencyKey,
        });
        const id = parseResponse(z.string().uuid(), dataOf(result), 'created request id');
        return getRequest(id);
      },
    },

    admin: {
      summary: async (opts) => {
        await requireUserId();
        const result = await withSignal(sb().rpc('admin_request_summary'), opts?.signal);
        return parseResponse(adminSummaryFromRow, dataOf(result, opts?.signal), 'admin request summary');
      },

      listRequests: async (query, opts) => {
        await requireUserId();
        const result = await listRequestRows(
          ADMIN_REQUEST_LIST_COLUMNS,
          query,
          ['code', 'item_names', 'requester_name'],
          null,
          opts?.signal,
        );
        return toPage(result.rows, adminRequestListItemFromRow, result.meta, opts?.signal, 'admin request list');
      },

      updateStatus: async ({ id, status, reason }) => {
        await requireUserId();
        const result = await sb().rpc('update_supply_request_status', {
          p_request_id: id,
          p_status: status,
          p_reason: status === 'rejected' ? (reason?.trim() ?? '') : null,
        });
        dataOf(result);
        return getRequest(id);
      },
    },

    notifications: {
      list: async (opts) => {
        const userId = await requireUserId();
        const [rows, unread] = await Promise.all([
          withSignal(
            sb()
              .from('notifications')
              .select(NOTIFICATION_COLUMNS)
              .eq('recipient_id', userId)
              .order('created_at', { ascending: false })
              .limit(NOTIFICATION_LIMIT),
            opts?.signal,
          ),
          withSignal(
            sb().from('notifications').select('id', { count: 'exact', head: true }).eq('recipient_id', userId).is('read_at', null),
            opts?.signal,
          ),
        ]);
        const data = parseResponse(z.array(notificationFromRow), dataOf(rows, opts?.signal), 'notifications');
        dataOf(unread, opts?.signal);
        return { data, unread: unread.count ?? 0 };
      },

      markRead: async (ids) => {
        await requireUserId();
        const result = await sb().rpc('mark_notifications_read', { p_ids: ids && ids.length > 0 ? ids : null });
        dataOf(result);
      },

      subscribe: (onNew) => {
        let closed = false;
        let teardown: (() => void) | null = null;
        void sb()
          .auth.getSession()
          .then(({ data }) => {
            const userId = data.session?.user.id;
            if (closed || !userId) return;
            const client = sb();
            const channel = client
              .channel(`notifications:${userId}`)
              .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
                () => onNew(),
              )
              .subscribe();
            teardown = () => void client.removeChannel(channel);
          });
        return () => {
          closed = true;
          teardown?.();
        };
      },
    },
  };
};
