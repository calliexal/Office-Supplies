import { describe, expect, it } from 'vitest';
import { canConfirmReceived, canMarkPickedUp, canTransition, NEXT_STATUSES } from './lifecycle';

describe('request lifecycle', () => {
  it('lets General Affair approve or reject a pending request only', () => {
    expect(NEXT_STATUSES.pending).toEqual(['approved', 'rejected']);
    expect(canTransition('pending', 'finished')).toBe(false);
  });

  it('hands prepared items to logistics instead of closing them directly', () => {
    expect(canTransition('approved', 'ready_for_pickup')).toBe(true);
    expect(canTransition('ready_for_pickup', 'finished')).toBe(false);
    expect(canMarkPickedUp('ready_for_pickup')).toBe(true);
    expect(canMarkPickedUp('approved')).toBe(false);
  });

  it('finishes a delivery when the employee confirms receipt (GA can close it too)', () => {
    expect(canConfirmReceived('in_delivery')).toBe(true);
    expect(canConfirmReceived('ready_for_pickup')).toBe(false);
    expect(canTransition('in_delivery', 'finished')).toBe(true);
  });

  it('treats rejected and finished as final', () => {
    expect(NEXT_STATUSES.rejected).toHaveLength(0);
    expect(NEXT_STATUSES.finished).toHaveLength(0);
  });
});
