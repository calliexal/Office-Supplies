import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatHeaderDate,
  formatRelative,
  formatShortDate,
  formatTime,
  initialsOf,
  pluralize,
  startOfDayIso,
  startOfNextDayIso,
  toDayKey,
} from './format';

const iso = '2026-07-25T02:15:00.000Z';

describe('format (Asia/Jakarta)', () => {
  it('matches the Figma copy', () => {
    expect(formatDate(iso)).toBe('July 25, 2026');
    expect(formatTime(iso)).toBe('09:15 AM');
    expect(formatShortDate('2026-08-27T03:00:00.000Z')).toBe('27-Aug-2026');
    expect(formatHeaderDate(new Date('2026-08-27T03:00:00.000Z'))).toBe('Thu, 27th August 2026');
  });

  it('uses the local day, not the UTC day, for filters', () => {
    expect(toDayKey('2026-07-24T18:00:00.000Z')).toBe('2026-07-25');
  });

  it('turns Jakarta calendar days into a half-open UTC range', () => {
    expect(startOfDayIso('2026-07-25')).toBe('2026-07-24T17:00:00.000Z');
    expect(startOfNextDayIso('2026-07-25')).toBe('2026-07-25T17:00:00.000Z');
    expect(startOfNextDayIso('2026-12-31')).toBe('2026-12-31T17:00:00.000Z');
    expect(() => startOfDayIso('25/07/2026')).toThrow(RangeError);
  });

  it('ordinals and helpers', () => {
    expect(formatHeaderDate(new Date('2026-08-01T03:00:00Z'))).toContain('1st');
    expect(formatHeaderDate(new Date('2026-08-12T03:00:00Z'))).toContain('12th');
    expect(formatHeaderDate(new Date('2026-08-22T03:00:00Z'))).toContain('22nd');
    expect(initialsOf('Dinda Putri Ramadani')).toBe('DP');
    expect(pluralize(1, 'Item')).toBe('1 Item');
    expect(pluralize(5, 'Item')).toBe('5 Items');
  });

  it('describes notification times relative to now', () => {
    const now = new Date('2026-10-15T10:00:00.000Z');
    expect(formatRelative('2026-10-15T09:59:40.000Z', now)).toBe('just now');
    expect(formatRelative('2026-10-15T09:55:00.000Z', now)).toBe('5 minutes ago');
    expect(formatRelative('2026-10-15T07:00:00.000Z', now)).toBe('3 hours ago');
    expect(formatRelative('2026-10-14T10:00:00.000Z', now)).toBe('yesterday');
    expect(formatRelative('2026-09-01T10:00:00.000Z', now)).toBe('September 1, 2026');
  });
});
