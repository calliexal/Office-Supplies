import { z } from 'zod';

export const REQUEST_STATUSES = [
  'pending',
  'approved',
  'ready_for_pickup',
  'rejected',
  'finished',
] as const;

export const requestStatusSchema = z.enum(REQUEST_STATUSES);
export type RequestStatus = z.infer<typeof requestStatusSchema>;

export const USER_ROLES = ['employee', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const userSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  email: z.string().email(),
  position: z.string(),
  department: z.string(),
  role: z.enum(USER_ROLES).default('employee'),
  unreadNotifications: z.number().int().nonnegative().default(0),
  unreadMessages: z.number().int().nonnegative().default(0),
});
export type User = z.infer<typeof userSchema>;

export const sessionSchema = z.object({ user: userSchema });

export const pageMetaSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});
export type PageMeta = z.infer<typeof pageMetaSchema>;

const paginated = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ data: z.array(item), meta: pageMetaSchema });

export const supplySchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  stock: z.number().int().nonnegative(),
  unit: z.string().default('pcs'),
  imageUrl: z.string().min(1).nullable(),
});
export type Supply = z.infer<typeof supplySchema>;
export const supplyPageSchema = paginated(supplySchema);
export type SupplyPage = z.infer<typeof supplyPageSchema>;

export const requestListItemSchema = z.object({
  id: z.string(),
  code: z.string(),
  createdAt: z.string().datetime({ offset: true }),
  itemCount: z.number().int().nonnegative(),
  totalQuantity: z.number().int().nonnegative(),
  pickupLocation: z.string(),
  status: requestStatusSchema,
});
export type RequestListItem = z.infer<typeof requestListItemSchema>;
export const requestPageSchema = paginated(requestListItemSchema);
export type RequestPage = z.infer<typeof requestPageSchema>;

export const requestDetailSchema = requestListItemSchema.extend({
  requester: z.object({ name: z.string(), department: z.string() }),
  items: z.array(
    z.object({
      supplyId: z.string(),
      name: z.string(),
      quantity: z.number().int().positive(),
    }),
  ),
  rejectionReason: z.string().nullable().default(null),
  note: z.string().nullable().default(null),
  reviewedAt: z.string().datetime({ offset: true }).nullable().default(null),
  reviewedBy: z.string().nullable().default(null),
});
export type RequestDetail = z.infer<typeof requestDetailSchema>;

export const requestSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  approved: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
});
export type RequestSummary = z.infer<typeof requestSummarySchema>;

export const adminRequestListItemSchema = requestListItemSchema.extend({
  requester: z.object({ name: z.string(), department: z.string() }),
});
export type AdminRequestListItem = z.infer<typeof adminRequestListItemSchema>;
export const adminRequestPageSchema = paginated(adminRequestListItemSchema);
export type AdminRequestPage = z.infer<typeof adminRequestPageSchema>;

const count = z.number().int().nonnegative();
export const adminRequestSummarySchema = z.object({
  total: count,
  pending: count,
  approved: count,
  readyForPickup: count,
  rejected: count,
  finished: count,
});
export type AdminRequestSummary = z.infer<typeof adminRequestSummarySchema>;

export const NOTIFICATION_KINDS = ['request_submitted', 'request_approved', 'request_rejected', 'request_ready'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const notificationSchema = z.object({
  id: z.string(),
  kind: z.enum(NOTIFICATION_KINDS),
  title: z.string(),
  body: z.string(),
  requestId: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }),
  readAt: z.string().datetime({ offset: true }).nullable(),
});
export type AppNotification = z.infer<typeof notificationSchema>;

export const notificationFeedSchema = z.object({
  data: z.array(notificationSchema),
  unread: z.number().int().nonnegative(),
});
export type NotificationFeed = z.infer<typeof notificationFeedSchema>;

export const apiErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fields: z.record(z.string()).optional(),
  }),
});

export type LoginInput = { email: string; password: string; remember: boolean };

export type SupplySort = 'name_asc' | 'stock_desc';
export type SupplyQuery = {
  search?: string;
  inStockOnly?: boolean;
  sort?: SupplySort;
  page?: number;
  pageSize?: number;
};

export type RequestSort = 'newest' | 'oldest';
export type RequestQuery = {
  search?: string;
  status?: RequestStatus;
  dateFrom?: string;
  dateTo?: string;
  sort?: RequestSort;
  page?: number;
  pageSize?: number;
};

export type CreateRequestInput = {
  items: Array<{ supplyId: string; quantity: number }>;
  idempotencyKey: string;
  note?: string;
};

export const REQUEST_NOTE_MAX = 500;

export type AdminRequestQuery = RequestQuery;

export type ReviewStatus = Exclude<RequestStatus, 'pending'>;
export type UpdateRequestStatusInput = { id: string; status: ReviewStatus; reason?: string };
