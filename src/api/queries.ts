import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { isApiError } from './errors';
import { api } from './index';
import type {
  AdminRequestQuery,
  CreateRequestInput,
  NotificationFeed,
  RequestQuery,
  SupplyQuery,
  UpdateRequestStatusInput,
} from './schemas';

export const queryKeys = {
  me: ['auth', 'me'] as const,
  supplies: (query: SupplyQuery) => ['supplies', query] as const,
  requestSummary: ['requests', 'summary'] as const,
  requestList: (query: RequestQuery) => ['requests', 'list', query] as const,
  requestDetail: (id: string) => ['requests', 'detail', id] as const,
  adminSummary: ['admin', 'summary'] as const,
  adminRequestList: (query: AdminRequestQuery) => ['admin', 'requests', query] as const,
  notifications: ['notifications'] as const,
};

const ADMIN_POLL_MS = 60_000;
const NOTIFICATION_POLL_MS = 30_000;

export const useNotifications = () =>
  useQuery({
    queryKey: queryKeys.notifications,
    queryFn: ({ signal }) => api.notifications.list({ signal }),
    refetchInterval: NOTIFICATION_POLL_MS,
  });

export const useLiveNotifications = () => {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      api.notifications.subscribe(() => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
        void queryClient.invalidateQueries({ queryKey: ['requests'] });
        void queryClient.invalidateQueries({ queryKey: ['admin'] });
        void queryClient.invalidateQueries({ queryKey: ['supplies'] });
      }),
    [queryClient],
  );
};

export const useMarkNotificationsRead = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => api.notifications.markRead(ids),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications });
      const previous = queryClient.getQueryData<NotificationFeed>(queryKeys.notifications);
      if (previous) {
        const now = new Date().toISOString();
        const targets = ids && ids.length > 0 ? new Set(ids) : null;
        const isTarget = (n: NotificationFeed['data'][number]) => n.readAt === null && (!targets || targets.has(n.id));
        const newlyRead = previous.data.filter(isTarget).length;
        const data = previous.data.map((n) => (isTarget(n) ? { ...n, readAt: now } : n));
        queryClient.setQueryData<NotificationFeed>(queryKeys.notifications, {
          data,
          unread: targets ? Math.max(0, previous.unread - newlyRead) : 0,
        });
      }
      return { previous };
    },
    onError: (_error, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.notifications, context.previous);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
  });
};

export const useSupplies = (query: SupplyQuery) =>
  useQuery({
    queryKey: queryKeys.supplies(query),
    queryFn: ({ signal }) => api.supplies.list(query, { signal }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

export const useRequestSummary = () =>
  useQuery({
    queryKey: queryKeys.requestSummary,
    queryFn: ({ signal }) => api.requests.summary({ signal }),
  });

export const useRequests = (query: RequestQuery) =>
  useQuery({
    queryKey: queryKeys.requestList(query),
    queryFn: ({ signal }) => api.requests.list(query, { signal }),
    placeholderData: keepPreviousData,
  });

export const useRequestDetail = (id: string | null) =>
  useQuery({
    queryKey: queryKeys.requestDetail(id ?? ''),
    queryFn: ({ signal }) => api.requests.get(id as string, { signal }),
    enabled: id !== null,
  });

export const useCreateRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRequestInput) => api.requests.create(input),
    onSuccess: (created) => {
      queryClient.setQueryData(queryKeys.requestDetail(created.id), created);
      void queryClient.invalidateQueries({ queryKey: ['requests'] });
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
      void queryClient.invalidateQueries({ queryKey: ['supplies'] });
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: ['supplies'] });
    },
  });
};

export const useAdminSummary = ({ enabled = true }: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: queryKeys.adminSummary,
    queryFn: ({ signal }) => api.admin.summary({ signal }),
    enabled,
    refetchInterval: enabled ? ADMIN_POLL_MS : false,
  });

export const useAdminRequests = (query: AdminRequestQuery) =>
  useQuery({
    queryKey: queryKeys.adminRequestList(query),
    queryFn: ({ signal }) => api.admin.listRequests(query, { signal }),
    placeholderData: keepPreviousData,
    refetchInterval: ADMIN_POLL_MS,
  });

export const useUpdateRequestStatus = () => {
  const queryClient = useQueryClient();
  const refreshEverything = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin'] });
    void queryClient.invalidateQueries({ queryKey: ['requests'] });
    void queryClient.invalidateQueries({ queryKey: ['supplies'] });
  };
  return useMutation({
    mutationFn: (input: UpdateRequestStatusInput) => api.admin.updateStatus(input),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.requestDetail(updated.id), updated);
      refreshEverything();
    },
    onError: (error, input) => {
      if (isApiError(error) && (error.status === 409 || error.status === 404)) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.requestDetail(input.id) });
        refreshEverything();
      }
    },
  });
};
