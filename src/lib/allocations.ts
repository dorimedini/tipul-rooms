import { addDays, addWeeks, format, parseISO, isAfter, isBefore, isEqual } from "date-fns";

export function generateOccurrences(
  startDate: Date,
  endDate: Date,
  dayOfWeek: number
): Date[] {
  const dates: Date[] = [];
  // find first occurrence on or after startDate with the given dayOfWeek
  let current = new Date(startDate);
  while (current.getDay() !== dayOfWeek) {
    current = addDays(current, 1);
  }
  while (!isAfter(current, endDate)) {
    dates.push(new Date(current));
    current = addWeeks(current, 1);
  }
  return dates;
}

export function minutesToTimeLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function doTimesOverlap(
  startA: string,
  durationA: number,
  startB: string,
  durationB: number
): boolean {
  const sA = timeToMinutes(startA);
  const eA = sA + durationA;
  const sB = timeToMinutes(startB);
  const eB = sB + durationB;
  return sA < eB && sB < eA;
}

export function formatDateForDB(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

// 15 min → 4 h in 15-minute steps (matches drag snapping)
export const DURATION_OPTIONS = Array.from({ length: 16 }, (_, i) => (i + 1) * 15);

export const START_TIMES: string[] = [];
for (let h = 7; h <= 22; h++) {
  for (let m = 0; m < 60; m += 15) {
    if (h === 22 && m > 0) break;
    START_TIMES.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
}

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type OpeningHours = { day_of_week: number; open_time: string; close_time: string };

/**
 * Why a booking does not fit the room's opening hours, or null if it does.
 * A weekday with no row is closed all day.
 */
export function hoursViolation(
  hours: OpeningHours[],
  dayOfWeek: number,
  startTime: string,
  durationMinutes: number
): string | null {
  const row = hours.find(h => h.day_of_week === dayOfWeek);
  if (!row) return `the room is closed on ${DAY_NAMES[dayOfWeek]}`;
  const open = timeToMinutes(row.open_time);
  const close = timeToMinutes(row.close_time);
  const start = timeToMinutes(startTime);
  if (start < open || start + durationMinutes > close) {
    return `${DAY_NAMES[dayOfWeek]} hours are ${minutesToTime(open)}–${minutesToTime(close)}`;
  }
  return null;
}

/** Closed [from, to) minute ranges for one weekday, clamped to the calendar window. */
export function closedRanges(
  hours: OpeningHours[],
  dayOfWeek: number,
  windowStart: number,
  windowEnd: number
): Array<[number, number]> {
  const row = hours.find(h => h.day_of_week === dayOfWeek);
  if (!row) return [[windowStart, windowEnd]];
  const open = Math.min(Math.max(timeToMinutes(row.open_time), windowStart), windowEnd);
  const close = Math.max(Math.min(timeToMinutes(row.close_time), windowEnd), windowStart);
  const ranges: Array<[number, number]> = [];
  if (open > windowStart) ranges.push([windowStart, open]);
  if (close < windowEnd) ranges.push([close, windowEnd]);
  return ranges;
}
