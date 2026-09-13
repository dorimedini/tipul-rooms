/**
 * Shape of a holiday indicator. Deliberately free of any @hebcal import so
 * client components can use the type without pulling the library (and its
 * polyfills) into the browser bundle — it stays server-side, in /api/holidays.
 */
export type Holiday = {
  date: string;   // yyyy-MM-dd
  name: string;   // short label for the calendar row, e.g. "Sukkot"
  full: string;   // precise name(s) for the tooltip, e.g. "Sukkot VII (Hoshana Raba)"
  chag: boolean;  // yom tov — businesses closed, as opposed to erev/chol hamoed/minor
};
