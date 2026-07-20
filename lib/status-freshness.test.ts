import { test } from "node:test";
import assert from "node:assert/strict";
import {
  statusFreshness,
  describeAge,
  timetableFallback,
  statusHasQueue,
  FRESH_MINUTES,
} from "@/lib/status-freshness";

// IST is UTC+5:30 — these UTC instants are chosen so the IST wall clock is
// exact and the day-boundary cases are unambiguous.
const istInstant = (utc: string) => new Date(utc);

const NOON = istInstant("2026-07-19T06:30:00Z"); // 19 Jul, 12:00 PM IST
const minutesBefore = (d: Date, m: number) => new Date(d.getTime() - m * 60_000);

test("never confirmed is stale, never a silent 'available'", () => {
  const f = statusFreshness("available", null, "doctor", NOON);
  assert.equal(f.confidence, "stale");
  assert.equal(f.isLive, false);
  assert.equal(f.ageMinutes, null);
});

test("a garbled timestamp degrades to stale rather than throwing", () => {
  const f = statusFreshness("available", "not-a-date", "doctor", NOON);
  assert.equal(f.confidence, "stale");
  assert.equal(f.isLive, false);
});

test("just-confirmed status is fresh and live", () => {
  const f = statusFreshness("available", minutesBefore(NOON, 5), "doctor", NOON);
  assert.equal(f.confidence, "fresh");
  assert.equal(f.isLive, true);
  assert.equal(f.ageMinutes, 5);
});

test("moment-scoped status is fresh right up to the threshold", () => {
  const f = statusFreshness(
    "available",
    minutesBefore(NOON, FRESH_MINUTES),
    "doctor",
    NOON
  );
  assert.equal(f.confidence, "fresh");
});

test("moment-scoped status ages just past the threshold but stays live", () => {
  const f = statusFreshness(
    "available",
    minutesBefore(NOON, FRESH_MINUTES + 1),
    "doctor",
    NOON
  );
  assert.equal(f.confidence, "ageing");
  assert.equal(f.isLive, true);
  assert.equal(f.asOf, "8:59 AM"); // caveat the card with the real IST clock
});

test("day-scoped status holds all day without re-tapping", () => {
  // 'No MR today' said at 6 AM is still true at noon — nagging the doctor to
  // re-confirm a whole-day decision is how a status feature dies.
  const f = statusFreshness("no_mr_today", minutesBefore(NOON, 360), "doctor", NOON);
  assert.equal(f.confidence, "fresh");
  assert.equal(f.isLive, true);
});

test("day-scoped status still expires at the IST day boundary", () => {
  const f = statusFreshness("opd_closed", minutesBefore(NOON, 60 * 20), "doctor", NOON);
  assert.equal(f.confidence, "stale");
  assert.equal(f.isLive, false);
});

test("yesterday's 'Available' is never live today", () => {
  // The bug this whole module exists to kill.
  const f = statusFreshness("available", minutesBefore(NOON, 60 * 26), "doctor", NOON);
  assert.equal(f.confidence, "stale");
  assert.equal(f.isLive, false);
  assert.equal(f.confirmedOn, "2026-07-18");
});

test("IST midnight rollover: 15 minutes old but a different day is stale", () => {
  const at = istInstant("2026-07-19T18:20:00Z"); // 19 Jul, 11:50 PM IST
  const now = istInstant("2026-07-19T18:35:00Z"); // 20 Jul, 12:05 AM IST
  const f = statusFreshness("available", at, "doctor", now);
  assert.equal(f.ageMinutes, 15);
  assert.equal(f.confidence, "stale", "a new IST day means a new OPD");
  assert.equal(f.isLive, false);
});

test("late-evening status is still fresh before midnight", () => {
  const at = istInstant("2026-07-19T18:00:00Z"); // 11:30 PM IST
  const now = istInstant("2026-07-19T18:20:00Z"); // 11:50 PM IST, same IST day
  assert.equal(statusFreshness("available", at, "doctor", now).confidence, "fresh");
});

test("source ladder: doctor's own word is the gold standard", () => {
  const f = statusFreshness("available", minutesBefore(NOON, 5), "doctor", NOON);
  assert.equal(f.sourceTier, "doctor");
  assert.equal(f.isVerifiedSource, true);
});

test("source ladder: clinic staff and admin are verified", () => {
  for (const role of ["clinic_staff", "admin"]) {
    const f = statusFreshness("available", minutesBefore(NOON, 5), role, NOON);
    assert.equal(f.sourceTier, "verified", role);
    assert.equal(f.isVerifiedSource, true, role);
  }
});

test("source ladder: an MR is second-hand, never 'verified'", () => {
  const f = statusFreshness("available", minutesBefore(NOON, 5), "mr", NOON);
  assert.equal(f.sourceTier, "reported");
  assert.equal(f.isVerifiedSource, false);
});

test("clock skew can never produce a status from the future", () => {
  const f = statusFreshness("available", new Date(NOON.getTime() + 60_000), "doctor", NOON);
  assert.equal(f.ageMinutes, 0);
});

test("timetable fallback returns the day's hours, or null to show nothing", () => {
  const tt = { mon: "10 AM – 1 PM", tue: "   " };
  assert.equal(timetableFallback(tt, "mon"), "10 AM – 1 PM");
  assert.equal(timetableFallback(tt, "tue"), null, "whitespace is not hours");
  assert.equal(timetableFallback(tt, "wed"), null);
  assert.equal(timetableFallback(null, "mon"), null);
});

test("fallback drops to general OPD hours when no timetable exists", () => {
  // 205 of 206 real doctors have no weekly timetable but DO have consulting
  // hours. Showing those beats "Not confirmed today" over an empty card.
  assert.equal(timetableFallback(null, "mon", "10 AM - 2 PM"), "10 AM - 2 PM");
  assert.equal(timetableFallback({}, "mon", "10 AM - 2 PM"), "10 AM - 2 PM");
  // A day-specific timetable entry is more precise, so it still wins.
  assert.equal(
    timetableFallback({ mon: "6 - 9 PM" }, "mon", "10 AM - 2 PM"),
    "6 - 9 PM"
  );
  // Timetable exists but says nothing about today → general hours.
  assert.equal(
    timetableFallback({ tue: "6 - 9 PM" }, "mon", "10 AM - 2 PM"),
    "10 AM - 2 PM"
  );
  // Nothing known anywhere stays null — never invent hours.
  assert.equal(timetableFallback(null, "mon", "   "), null);
  assert.equal(timetableFallback(null, "mon", null), null);
});

test("age is phrased identically everywhere", () => {
  assert.equal(describeAge(null), null);
  assert.equal(describeAge(0), "just now");
  assert.equal(describeAge(45), "45 min ago");
  assert.equal(describeAge(120), "2 hrs ago");
  assert.equal(describeAge(60), "1 hr ago");
  assert.equal(describeAge(60 * 26), "1 day ago");
  assert.equal(describeAge(60 * 24 * 3), "3 days ago");
});

test("only a sitting doctor can have a queue", () => {
  // The bug this pins: "OPD Closed · 3 patients left" reached a real card.
  // A queue cannot outlive the sitting, so these statuses clear the count.
  for (const s of ["available", "busy", "token_full"]) {
    assert.equal(statusHasQueue(s), true, `${s} should allow a queue`);
  }
  for (const s of ["opd_closed", "holiday", "no_mr_today"]) {
    assert.equal(statusHasQueue(s), false, `${s} must not carry a queue`);
  }
  // Unknown/absent status is treated as "no queue" — the safe direction.
  assert.equal(statusHasQueue(null), false);
  assert.equal(statusHasQueue(undefined), false);
  assert.equal(statusHasQueue("something_new"), false);
});
