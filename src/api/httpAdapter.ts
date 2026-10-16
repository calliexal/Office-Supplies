import { request } from './http';
import {
  adminRequestPageSchema,
  adminRequestSummarySchema,
  notificationFeedSchema,
  requestDetailSchema,
  requestPageSchema,
  requestSummarySchema,
  sessionSchema,
  supplyPageSchema,
} from './schemas';
import type { AtkApi } from './types';

export const createHttpApi = (): AtkApi => ({
  auth: {
    login: async ({ email, password, remember }) => {
      const session = await request('/auth/login', {
        method: 'POST',
        body: { email: email.trim().toLowerCase(), password, remember },
        schema: sessionSchema,
      });
      return session.user;
    },
    logout: () => request('/auth/logout', { method: 'POST' }),
    me: async (opts) => (await request('/auth/me', { schema: sessionSchema, signal: opts?.signal })).user,
  },
  supplies: {
    list: (query, opts) =>
      request('/supplies', {
        query: {
          search: query.search,
          inStock: query.inStockOnly ? true : undefined,
          sort: query.sort,
          page: query.page,
          pageSize: query.pageSize,
        },
        schema: supplyPageSchema,
        signal: opts?.signal,
      }),
  },
  requests: {
    summary: (opts) => request('/requests/summary', { schema: requestSummarySchema, signal: opts?.signal }),
    list: (query, opts) =>
      request('/requests', { query: { ...query }, schema: requestPageSchema, signal: opts?.signal }),
    get: (id, opts) =>
      request(`/requests/${encodeURIComponent(id)}`, { schema: requestDetailSchema, signal: opts?.signal }),
    create: ({ items, idempotencyKey, note }) =>
      request('/requests', {
        method: 'POST',
        body: { items, note: note?.trim() || null },
        headers: { 'Idempotency-Key': idempotencyKey },
        schema: requestDetailSchema,
      }),
    confirmReceived: (id) =>
      request(`/requests/${encodeURIComponent(id)}/received`, { method: 'POST', schema: requestDetailSchema }),
  },
  deliveries: {
    list: (query, opts) => request('/deliveries', { query: { ...query }, schema: adminRequestPageSchema, signal: opts?.signal }),
    markPickedUp: (id) =>
      request(`/deliveries/${encodeURIComponent(id)}/picked-up`, { method: 'POST', schema: requestDetailSchema }),
  },
  admin: {
    summary: (opts) => request('/admin/requests/summary', { schema: adminRequestSummarySchema, signal: opts?.signal }),
    listRequests: (query, opts) =>
      request('/admin/requests', { query: { ...query }, schema: adminRequestPageSchema, signal: opts?.signal }),
    updateStatus: ({ id, status, reason }) =>
      request(`/admin/requests/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: status === 'rejected' ? { status, reason } : { status },
        schema: requestDetailSchema,
      }),
  },
  notifications: {
    list: (opts) => request('/notifications', { schema: notificationFeedSchema, signal: opts?.signal }),
    markRead: (ids) => request('/notifications/read', { method: 'POST', body: { ids: ids ?? null } }),
    subscribe: () => () => undefined,
  },
});
