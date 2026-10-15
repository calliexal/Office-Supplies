export const APP_TIMEZONE: string = import.meta.env.VITE_TIMEZONE ?? 'Asia/Jakarta';

const dateFmt = new Intl.DateTimeFormat('en-US', { timeZone: APP_TIMEZONE, month: 'long', day: 'numeric', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: APP_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: true });
const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const shortParts = new Intl.DateTimeFormat('en-GB', { timeZone: APP_TIMEZONE, day: '2-digit', month: 'short', year: 'numeric' });
const headerParts = new Intl.DateTimeFormat('en-US', { timeZone: APP_TIMEZONE, weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });

export const formatDate = (iso: string) => dateFmt.format(new Date(iso));

export const formatTime = (iso: string) => timeFmt.format(new Date(iso));

export const formatShortDate = (iso: string) => {
  const parts = Object.fromEntries(shortParts.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.day}-${parts.month}-${parts.year}`;
};

export const toDayKey = (date: Date | string) => dayKeyFmt.format(typeof date === 'string' ? new Date(date) : date);

const offsetPartsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIMEZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const zoneOffsetMinutes = (utcMs: number) => {
  const p = Object.fromEntries(offsetPartsFmt.formatToParts(new Date(utcMs)).map((part) => [part.type, part.value]));
  const wallClockAsUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return Math.round((wallClockAsUtc - utcMs) / 60_000);
};

const parseDayKey = (day: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new RangeError(`Expected YYYY-MM-DD, got "${day}"`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
};

export const startOfDayIso = (day: string) => {
  const { y, m, d } = parseDayKey(day);
  const midnightAsUtc = Date.UTC(y, m - 1, d);
  let instant = midnightAsUtc - zoneOffsetMinutes(midnightAsUtc) * 60_000;
  instant = midnightAsUtc - zoneOffsetMinutes(instant) * 60_000;
  return new Date(instant).toISOString();
};

export const startOfNextDayIso = (day: string) => {
  const { y, m, d } = parseDayKey(day);
  return startOfDayIso(new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10));
};

const ordinal = (day: number) => {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  const suffix = ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] ?? 'th';
  return `${day}${suffix}`;
};

export const formatHeaderDate = (date: Date) => {
  const parts = Object.fromEntries(headerParts.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.weekday}, ${ordinal(Number(parts.day))} ${parts.month} ${parts.year}`;
};

const relativeFmt = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });
const RELATIVE_STEPS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
];

export const formatRelative = (iso: string, now: Date = new Date()) => {
  let value = Math.round((new Date(iso).getTime() - now.getTime()) / 60_000);
  if (Math.abs(value) < 1) return 'just now';
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(value) < size) return relativeFmt.format(value, unit);
    value = Math.round(value / size);
  }
  return formatDate(iso);
};

export const pluralize = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

export const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

export const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] ?? name;
