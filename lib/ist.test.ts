import { test } from "node:test";
import assert from "node:assert/strict";
import { istDay, istDayStartUtc } from "@/lib/ist";
import { liveSince, statusFreshness } from "@/lib/status-freshness";

// IST is UTC+5:30. These instants bracket the IST midnight boundary tightly,
// because the day boundary is the rule everything else leans on.

test("istDayStartUtc: IST midnight expressed as a UTC instant", () => {
  // 19 Jul 23:59 IST = 18:29 UTC → day started 18 Jul 18:30 UTC.
  const lateNight = new Date("2026-07-19T18:29:00Z");
  assert.equal(istDayStartUtc(lateNight).toISOString(), "2026-07-18T18:30:00.000Z");
  // Two minutes later it is 20 Jul 00:01 IST → new day start, 19 Jul 18:30 UTC.
  const justAfterMidnight = new Date("2026-07-19T18:31:00Z");
  assert.equal(istDayStartUtc(justAfterMidnight).toISOString(), "2026-07-19T18:30:00.000Z");
});

test("istDayStartUtc lands inside its own IST day", () => {
  for (const iso of [
    "2026-07-19T18:29:00Z",
    "2026-07-19T18:31:00Z",
    "2026-01-01T00:00:00Z",
    "2026-12-31T23:59:59Z",
  ]) {
    const d = new Date(iso);
    assert.equal(istDay(istDayStartUtc(d)), istDay(d));
  }
});

test("liveSince agrees with statusFreshness.isLive at the day boundary", () => {
  // The SQL translation (statusUpdatedAt >= liveSince(now)) must match the
  // trust rule exactly, or a WHERE clause would promise what the badge denies.
  const now = new Date("2026-07-19T12:00:00Z"); // 19 Jul, 5:30 PM IST
  const bound = liveSince(now);
  const justBefore = new Date(bound.getTime() - 1000); // yesterday IST
  const justAfter = new Date(bound.getTime() + 1000); // today IST
  assert.equal(statusFreshness("available", justBefore, "doctor", now).isLive, false);
  assert.equal(statusFreshness("available", justAfter, "doctor", now).isLive, true);
  // The bound itself is today's first instant — live.
  assert.equal(statusFreshness("available", bound, "doctor", now).isLive, true);
});
