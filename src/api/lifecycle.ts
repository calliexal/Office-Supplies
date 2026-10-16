import type { RequestStatus, ReviewStatus } from './schemas';

export const NEXT_STATUSES: Record<RequestStatus, readonly ReviewStatus[]> = {
  pending: ['approved', 'rejected'],
  approved: ['ready_for_pickup'],
  ready_for_pickup: [],
  in_delivery: ['finished'],
  rejected: [],
  finished: [],
};

export const canTransition = (from: RequestStatus, to: ReviewStatus) => NEXT_STATUSES[from].includes(to);

export const canMarkPickedUp = (status: RequestStatus) => status === 'ready_for_pickup';

export const canConfirmReceived = (status: RequestStatus) => status === 'in_delivery';

export const REJECTION_REASON_MAX = 500;
