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

export const DURATION_OPTIONS = Array.from({ length: 19 }, (_, i) => 30 + i * 5);
// 30, 35, 40, ..., 120

export const START_TIMES: string[] = [];
for (let h = 7; h <= 22; h++) {
  for (let m = 0; m < 60; m += 15) {
    if (h === 22 && m > 0) break;
    START_TIMES.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
}

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
