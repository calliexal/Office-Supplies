import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../errors';
import { adminRequestPageSchema, notificationFeedSchema, requestDetailSchema, requestPageSchema, supplyPageSchema } from '../schemas';
import type { AtkApi } from '../types';
import { MOCK_PASSWORD, mockUsers } from './data';
import { createMockApi } from './mockAdapter';

const memoryStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
};

const email = mockUsers[0]!.email;
let api: AtkApi;

beforeEach(() => {
  api = createMockApi({ latencyMs: 0, storage: memoryStorage() });
});

describe('mock API honours the contract', () => {
  it('rejects unauthenticated calls with 401', async () => {
    await expect(api.supplies.list({})).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  });

  it('rejects a wrong password without revealing which field was wrong', async () => {
    await expect(api.auth.login({ email, password: 'nope', remember: false })).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('locks the account after 5 failed attempts', async () => {
    for (let i = 0; i < 5; i += 1) await api.auth.login({ email, password: 'x', remember: false }).catch(() => undefined);
    await expect(api.auth.login({ email, password: MOCK_PASSWORD, remember: false })).rejects.toMatchObject({ status: 423 });
  });

  describe('when logged in', () => {
    beforeEach(async () => {
      await api.auth.login({ email: email.toUpperCase(), password: MOCK_PASSWORD, remember: true });
    });

    it('returns payloads that pass the zod schemas', async () => {
      expect(supplyPageSchema.safeParse(await api.supplies.list({})).success).toBe(true);
      expect(requestPageSchema.safeParse(await api.requests.list({})).success).toBe(true);
    });

    it('filters supplies by search and stock', async () => {
      const page = await api.supplies.list({ search: 'marker', inStockOnly: true });
      expect(page.data.every((s) => s.name.toLowerCase().includes('marker') && s.stock > 0)).toBe(true);
    });

    it('creates a request, decrements stock, and replays on the same idempotency key', async () => {
      const before = (await api.supplies.list({ search: 'Gel Pen' })).data.find((s) => s.name === 'Gel Pen')!;
      const input = { idempotencyKey: 'k-1', items: [{ supplyId: before.id, quantity: 3 }] };
      const first = await api.requests.create(input);
      const replay = await api.requests.create(input);

      expect(requestDetailSchema.safeParse(first).success).toBe(true);
      expect(first.status).toBe('pending');
      expect(replay.id).toBe(first.id);
      const after = (await api.supplies.list({ search: 'Gel Pen' })).data.find((s) => s.id === before.id)!;
      expect(after.stock).toBe(before.stock - 3);
    });

    it('returns 409 INSUFFICIENT_STOCK with per-item field errors', async () => {
      const paper = (await api.supplies.list({ search: 'A4' })).data.find((s) => s.name === 'A4 75gsm')!;
      const error = await api.requests.create({ idempotencyKey: 'k-2', items: [{ supplyId: paper.id, quantity: paper.stock + 1 }] }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 409, code: 'INSUFFICIENT_STOCK' });
      expect((error as ApiError).fields[paper.id]).toMatch(/left/);
    });

    it('filters history by status and sorts oldest first', async () => {
      const page = await api.requests.list({ status: 'pending' });
      expect(page.data.every((r) => r.status === 'pending')).toBe(true);
      const oldest = await api.requests.list({ sort: 'oldest' });
      expect(oldest.data[0]!.createdAt <= oldest.data.at(-1)!.createdAt).toBe(true);
    });

    it('saves a trimmed note with the request and rejects one that is too long', async () => {
      const pen = (await api.supplies.list({ search: 'Gel Pen' })).data[0]!;
      const created = await api.requests.create({ idempotencyKey: 'k-note', items: [{ supplyId: pen.id, quantity: 1 }], note: '  For the Monday training ' });
      expect((await api.requests.get(created.id)).note).toBe('For the Monday training');
      await expect(
        api.requests.create({ idempotencyKey: 'k-note-long', items: [{ supplyId: pen.id, quantity: 1 }], note: 'x'.repeat(501) }),
      ).rejects.toMatchObject({ status: 422, fields: { note: expect.any(String) } });
    });

    it('shows an employee only their own requests', async () => {
      const page = await api.requests.list({ pageSize: 100 });
      const details = await Promise.all(page.data.map((row) => api.requests.get(row.id)));
      expect(details.every((d) => d.requester.name === mockUsers[0]!.name)).toBe(true);
    });

    it('refuses delivery actions to an employee', async () => {
      await expect(api.deliveries.list({})).rejects.toMatchObject({ status: 403 });
      const { data } = await api.requests.list({ status: 'ready_for_pickup' });
      await expect(api.deliveries.markPickedUp(data[0]!.id)).rejects.toMatchObject({ status: 403 });
    });

    it('refuses every review action to an employee with 403', async () => {
      const { data } = await api.requests.list({ status: 'pending' });
      await expect(api.admin.summary()).rejects.toMatchObject({ status: 403 });
      await expect(api.admin.listRequests({})).rejects.toMatchObject({ status: 403 });
      await expect(api.admin.updateStatus({ id: data[0]!.id, status: 'approved' })).rejects.toMatchObject({ status: 403 });
      expect((await api.requests.get(data[0]!.id)).status).toBe('pending');
    });
  });

  describe('as General Affair admin', () => {
    const admin = mockUsers.find((u) => u.role === 'admin')!;

    beforeEach(async () => {
      await api.auth.login({ email: admin.email, password: MOCK_PASSWORD, remember: false });
    });

    const firstPending = async () => (await api.admin.listRequests({ status: 'pending', sort: 'oldest' })).data[0]!;

    it("lists everyone's requests with the requester and searches by name", async () => {
      const page = await api.admin.listRequests({ pageSize: 100 });
      expect(adminRequestPageSchema.safeParse(page).success).toBe(true);
      expect(new Set(page.data.map((r) => r.requester.name)).size).toBeGreaterThan(1);
      const budi = await api.admin.listRequests({ search: 'budi' });
      expect(budi.data.length).toBeGreaterThan(0);
      expect(budi.data.every((r) => r.requester.name === 'Budi Santoso')).toBe(true);
    });

    it('approves, prepares and finishes a request, recording the reviewer', async () => {
      const { id } = await firstPending();
      const approved = await api.admin.updateStatus({ id, status: 'approved' });
      expect(approved).toMatchObject({ status: 'approved', reviewedBy: admin.name });
      expect(approved.reviewedAt).not.toBeNull();
      await api.admin.updateStatus({ id, status: 'ready_for_pickup' });
      await expect(api.admin.updateStatus({ id, status: 'finished' })).rejects.toMatchObject({ status: 409 });
    });

    it('hands ready items to logistics, who deliver them until the employee confirms receipt', async () => {
      const courier = mockUsers.find((u) => u.role === 'logistics')!;
      const dinda = mockUsers.find((u) => u.email === 'dinda@example.com')!;
      const { id } = (await api.admin.listRequests({ status: 'approved' })).data[0]!;
      await api.admin.updateStatus({ id, status: 'ready_for_pickup' });
      await expect(api.deliveries.markPickedUp(id)).resolves.toMatchObject({ status: 'in_delivery' });
      await expect(api.deliveries.markPickedUp(id)).rejects.toMatchObject({ status: 409 });

      await api.auth.login({ email: courier.email, password: MOCK_PASSWORD, remember: false });
      const queue = await api.deliveries.list({ status: 'ready_for_pickup' });
      expect(queue.data.every((r) => r.status === 'ready_for_pickup')).toBe(true);
      expect((await api.notifications.list()).data.some((n) => n.kind === 'delivery_ready' && n.requestId === id)).toBe(true);
      await expect(api.admin.summary()).rejects.toMatchObject({ status: 403 });
      const anySupply = (await api.supplies.list({ page: 1, pageSize: 1 })).data[0]!;
      await expect(
        api.requests.create({ items: [{ supplyId: anySupply.id, quantity: 1 }], idempotencyKey: 'logistics-key-0001' }),
      ).rejects.toMatchObject({ status: 403 });

      await api.auth.login({ email: dinda.email, password: MOCK_PASSWORD, remember: false });
      const feed = await api.notifications.list();
      expect(feed.data[0]).toMatchObject({ kind: 'request_in_delivery', requestId: id });
      const done = await api.requests.confirmReceived(id);
      expect(done.status).toBe('finished');
      expect(done.receivedAt).not.toBeNull();
      await expect(api.requests.confirmReceived(id)).rejects.toMatchObject({ status: 409 });
    });

    it('refuses a stale or skipped transition with 409', async () => {
      const { id } = await firstPending();
      await expect(api.admin.updateStatus({ id, status: 'finished' })).rejects.toMatchObject({ status: 409 });
      await api.admin.updateStatus({ id, status: 'approved' });
      await expect(api.admin.updateStatus({ id, status: 'rejected', reason: 'late' })).rejects.toMatchObject({ status: 409 });
    });

    it('requires a reason to reject and returns the reserved stock', async () => {
      const pending = await firstPending();
      const detail = await api.requests.get(pending.id);
      const item = detail.items[0]!;
      const stockOf = async () => (await api.supplies.list({ pageSize: 100 })).data.find((s) => s.id === item.supplyId)!.stock;
      const before = await stockOf();

      const error = await api.admin.updateStatus({ id: pending.id, status: 'rejected', reason: '   ' }).catch((e: unknown) => e);
      expect(error).toMatchObject({ status: 422 });
      expect((error as ApiError).fields.reason).toBeTruthy();

      const rejected = await api.admin.updateStatus({ id: pending.id, status: 'rejected', reason: ' Budget frozen ' });
      expect(rejected).toMatchObject({ status: 'rejected', rejectionReason: 'Budget frozen' });
      expect(await stockOf()).toBe(before + item.quantity);
    });

    it('gets notified about new requests and the employee gets notified about the decision', async () => {
      const dinda = mockUsers.find((u) => u.email === 'dinda@example.com')!;
      const startAdmin = await api.notifications.list();
      expect(notificationFeedSchema.safeParse(startAdmin).success).toBe(true);
      expect(startAdmin.data.every((n) => n.kind === 'request_submitted')).toBe(true);

      await api.auth.login({ email: dinda.email, password: MOCK_PASSWORD, remember: false });
      const seen: string[] = [];
      const stop = api.notifications.subscribe(() => seen.push('new'));
      const paper = (await api.supplies.list({ search: 'Gel Pen' })).data[0]!;
      const created = await api.requests.create({ idempotencyKey: 'k-notify', items: [{ supplyId: paper.id, quantity: 2 }] });
      expect((await api.notifications.list()).data.some((n) => n.requestId === created.id)).toBe(false);

      await api.auth.login({ email: admin.email, password: MOCK_PASSWORD, remember: false });
      const adminFeed = await api.notifications.list();
      expect(adminFeed.unread).toBe(startAdmin.unread + 1);
      expect(adminFeed.data[0]).toMatchObject({ kind: 'request_submitted', requestId: created.id, readAt: null });
      expect(adminFeed.data[0]!.body).toContain(dinda.name);
      await api.notifications.markRead([adminFeed.data[0]!.id]);
      expect((await api.notifications.list()).unread).toBe(startAdmin.unread);
      await api.admin.updateStatus({ id: created.id, status: 'rejected', reason: 'Out of budget' });
      stop();
      expect(seen.length).toBe(2);

      await api.auth.login({ email: dinda.email, password: MOCK_PASSWORD, remember: false });
      const dindaFeed = await api.notifications.list();
      expect(dindaFeed.data[0]).toMatchObject({ kind: 'request_rejected', requestId: created.id, body: 'Reason: Out of budget' });
      await api.notifications.markRead();
      expect((await api.notifications.list()).unread).toBe(0);
    });

    it('counts the whole organisation', async () => {
      const summary = await api.admin.summary();
      const statuses = summary.pending + summary.approved + summary.readyForPickup + summary.inDelivery + summary.rejected + summary.finished;
      expect(statuses).toBe(summary.total);
      expect(summary.pending).toBeGreaterThan(1);
    });
  });
});
