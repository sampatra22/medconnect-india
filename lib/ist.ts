// One source of truth for IST calendar days — the whole app runs on them.
// Everything here is a pure function of a Date, so callers can pass an explicit
// "now" in tests instead of depending on the wall clock.

const DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const CLOCK_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Kolkata",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const WEEKDAY_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
});

/** IST calendar day of any instant, "YYYY-MM-DD". */
export function istDay(d: Date = new Date()): string {
  return DAY_FMT.format(d);
}

/** IST wall-clock time of any instant, e.g. "10:15 AM". */
export function istClock(d: Date = new Date()): string {
  return CLOCK_FMT.format(d);
}

/** IST weekday key of any instant, e.g. "mon" — matches weeklyTimetable keys. */
export function istDayKey(d: Date = new Date()): string {
  return WEEKDAY_FMT.format(d).toLowerCase();
}

/** Today's IST calendar day, "YYYY-MM-DD". */
export function istToday(): string {
  return istDay(new Date());
}

/** Current IST wall-clock time, e.g. "10:15 AM". */
export function istTimeNow(): string {
  return istClock(new Date());
}
