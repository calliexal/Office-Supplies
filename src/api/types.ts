import type {
  AdminRequestPage,
  AdminRequestQuery,
  AdminRequestSummary,
  CreateRequestInput,
  LoginInput,
  NotificationFeed,
  RequestDetail,
  RequestPage,
  RequestQuery,
  RequestSummary,
  SupplyPage,
  SupplyQuery,
  UpdateRequestStatusInput,
  User,
} from './schemas';

type Opts = { signal?: AbortSignal };

export type AtkApi = {
  auth: {
    login: (input: LoginInput) => Promise<User>;
    logout: () => Promise<void>;
    me: (opts?: Opts) => Promise<User>;
  };
  supplies: {
    list: (query: SupplyQuery, opts?: Opts) => Promise<SupplyPage>;
  };
  requests: {
    summary: (opts?: Opts) => Promise<RequestSummary>;
    list: (query: RequestQuery, opts?: Opts) => Promise<RequestPage>;
    get: (id: string, opts?: Opts) => Promise<RequestDetail>;
    create: (input: CreateRequestInput) => Promise<RequestDetail>;
  };
  admin: {
    summary: (opts?: Opts) => Promise<AdminRequestSummary>;
    listRequests: (query: AdminRequestQuery, opts?: Opts) => Promise<AdminRequestPage>;
    updateStatus: (input: UpdateRequestStatusInput) => Promise<RequestDetail>;
  };
  notifications: {
    list: (opts?: Opts) => Promise<NotificationFeed>;
    markRead: (ids?: string[]) => Promise<void>;
    subscribe: (onNew: () => void) => () => void;
  };
};
