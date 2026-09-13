import { HebrewCalendar, flags } from "@hebcal/core";
import { format } from "date-fns";
import type { Holiday } from "./holidays";

/**
 * Israeli holidays in a date range. Server-only: @hebcal/core pulls in
 * temporal-polyfill and friends, which we don't ship to the browser.
 */
export function computeHolidays(start: Date, end: Date): Holiday[] {
  const events = HebrewCalendar.calendar({
    start,
    end,
    il: true,               // every room is in Israel — never the diaspora schedule
    noRoshChodesh: true,
    noSpecialShabbat: true,
    noMinorFast: true,      // Ta'anit Esther, Tzom Gedaliah — not closures
    sedrot: false,
    omer: false,
    molad: false,
  });

  // A single day can carry several events (e.g. Ta'anit Bechorot + Erev Pesach).
  // The row shows one label per day, preferring the yom tov, and the tooltip
  // carries every name.
  const byDate = new Map<string, Holiday>();
  for (const ev of events) {
    const date = format(ev.getDate().greg(), "yyyy-MM-dd");
    const chag = (ev.getFlags() & flags.CHAG) !== 0;
    const full = ev.render("en");
    const existing = byDate.get(date);

    if (!existing) {
      byDate.set(date, { date, name: ev.basename(), full, chag });
    } else {
      existing.full = `${existing.full} · ${full}`;
      if (chag && !existing.chag) {
        existing.chag = true;
        existing.name = ev.basename();
      }
    }
  }

  return [...byDate.values()];
}
