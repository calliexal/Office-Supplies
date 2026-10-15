import { describe, expect, it } from 'vitest';
import { canTransition, NEXT_STATUSES } from './lifecycle';

describe('request lifecycle', () => {
  it('lets a pending request be approved or rejected only', () => {
    expect(NEXT_STATUSES.pending).toEqual(['approved', 'rejected']);
    expect(canTransition('pending', 'finished')).toBe(false);
  });

  it('moves approved requests forward one step at a time', () => {
    expect(canTransition('approved', 'ready_for_pickup')).toBe(true);
    expect(canTransition('approved', 'rejected')).toBe(false);
    expect(canTransition('ready_for_pickup', 'finished')).toBe(true);
  });

  it('treats rejected and finished as final', () => {
    expect(NEXT_STATUSES.rejected).toHaveLength(0);
    expect(NEXT_STATUSES.finished).toHaveLength(0);
  });
});
