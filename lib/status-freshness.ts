import { istClock, istDay, istDayStartUtc } from "@/lib/ist";

// ─────────────────────────────────────────────────────────────────────────────
// Module 4 · Status confidence — the trust rule for the whole platform.
//
// A live status is a CLAIM WITH AN AGE, never a permanent fact. A doctor who
// tapped "Available" on Monday is not available on Thursday, and showing that
// in confident green is the single fastest way to lose a patient's trust in
// the directory. This module is the ONE place that decides how much a status
// is still worth. UI never re-derives these rules — it reads them from here.
//
// Same principle the vision doc applies to statistical projection: anything
// that is not confirmed-now must not be dressed up as confirmed-now.
// ─────────────────────────────────────────────────────────────────────────────

export type DoctorStatus =
  | "available"
  | "busy"
  | "holiday"
  | "no_mr_today"
  | "token_full"
  | "opd_closed";

/**
 * How much weight the UI may give a status.
 *  fresh  — confirmed recently. Show at full strength.
 *  ageing — still today's word, but old enough to caveat with "as of 10:15 AM".
 *  stale  — from a previous IST day (or never set). NOT live. UI must fall
 *           back to the weekly timetable instead of showing a colour badge.
 */
export type Confidence = "fresh" | "ageing" | "stale";

/**
 * Who confirmed it. This is a trust ladder, not a formality:
 *  doctor   — the doctor's own word. The gold standard worth earning.
 *  verified — clinic staff or admin. Trusted, on-site.
 *  reported — an MR passing through. Useful, but a second-hand estimate and
 *             must never be presented as the doctor's own confirmation.
 */
export type SourceTier = "doctor" | "verified" | "reported" | "unknown";

export type StatusFreshness = {
  confidence: Confidence;
  /** false ⇒ the UI must NOT present this status as current. */
  isLive: boolean;
  /** Minutes since confirmation; null when never set. */
  ageMinutes: number | null;
  /** IST clock of the confirmation ("10:15 AM"), for the "as of" caveat. */
  asOf: string | null;
  /** IST day of the confirmation ("YYYY-MM-DD"), for "last confirmed Monday". */
  confirmedOn: string | null;
  sourceTier: SourceTier;
  /** doctor/clinic/admin confirmed. MR-reported is deliberately excluded. */
  isVerifiedSource: boolean;
};

/**
 * Statuses that describe the WHOLE DAY rather than a moment.
 * "No MR today" said at 9 AM is still true at 5 PM — it does not decay through
 * the day the way "Available" does. Treating these identically would nag
 * doctors to re-tap a decision they already made, which is how a status
 * feature dies. They still go stale at the IST day boundary.
 */
const DAY_SCOPED: ReadonlySet<string> = new Set([
  "no_mr_today",
  "opd_closed",
  "holiday",
]);

/**
 * A moment-scoped status stays at full confidence this long. Three hours is
 * roughly one OPD sitting: long enough that an honest doctor is not punished
 * for not re-tapping, short enough that a morning tap never speaks for the
 * evening chamber.
 */
export const FRESH_MINUTES = 180;

function tierOf(role: string | null | undefined): SourceTier {
  switch (role) {
    case "doctor":
      return "doctor";
    case "clinic_staff":
    case "admin":
      return "verified";
    case "mr":
    case "medical_representative":
      return "reported";
    default:
      return "unknown";
  }
}

/** Nothing confirmed — the honest zero state, not a silent "available". */
const NEVER: StatusFreshness = {
  confidence: "stale",
  isLive: false,
  ageMinutes: null,
  asOf: null,
  confirmedOn: null,
  sourceTier: "unknown",
  isVerifiedSource: false,
};

/**
 * The single decision point. `now` is injectable so behaviour at the IST
 * midnight boundary is testable rather than hoped-for.
 */
export function statusFreshness(
  status: string | null | undefined,
  updatedAt: string | Date | null | undefined,
  updatedByRole: string | null | undefined,
  now: Date = new Date()
): StatusFreshness {
  if (!updatedAt) return NEVER;

  const at = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  if (Number.isNaN(at.getTime())) return NEVER;

  const sourceTier = tierOf(updatedByRole);
  const isVerifiedSource = sourceTier === "doctor" || sourceTier === "verified";
  const confirmedOn = istDay(at);
  const asOf = istClock(at);
  // Clamped at 0: a clock skew must never read as a status from the future.
  const ageMinutes = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60000));

  const base = { ageMinutes, asOf, confirmedOn, sourceTier, isVerifiedSource };

  // The day boundary dominates every other rule. A status set at 11 PM is
  // worthless at 12:05 AM despite being five minutes old — a new day means
  // a new OPD, new tokens, new plan.
  if (confirmedOn !== istDay(now)) {
    return { ...base, confidence: "stale", isLive: false };
  }

  // Set today, and describes the whole day — holds until midnight.
  if (DAY_SCOPED.has(status ?? "")) {
    return { ...base, confidence: "fresh", isLive: true };
  }

  return ageMinutes <= FRESH_MINUTES
    ? { ...base, confidence: "fresh", isLive: true }
    : { ...base, confidence: "ageing", isLive: true };
}

/**
 * Statuses where a queue can exist, because the doctor is actually sitting.
 * "OPD Closed" with "3 patients left" is a contradiction a reader has to
 * resolve, and every contradiction costs trust — so the count is CLEARED at
 * the source when the status can't have one, rather than hidden per screen.
 */
const QUEUE_STATUSES: ReadonlySet<string> = new Set(["available", "busy", "token_full"]);

/** Can this status have a patients-waiting count at all? */
export function statusHasQueue(status: string | null | undefined): boolean {
  return QUEUE_STATUSES.has(status ?? "");
}

/**
 * The isLive rule expressed as a database bound: a status is live exactly when
 * `statusUpdatedAt >= liveSince(now)` — i.e. confirmed within today's IST day.
 * This exists so a WHERE clause (e.g. the directory's "available now" filter)
 * can apply the trust rule without re-deriving it. If the day-boundary rule in
 * `statusFreshness` ever changes, this must change with it — the unit tests
 * assert the two agree at the boundary.
 */
export function liveSince(now: Date = new Date()): Date {
  return istDayStartUtc(now);
}

/**
 * What the card should say when a status has gone stale: the doctor's usual
 * hours, clearly labelled as a pattern rather than a confirmation.
 *
 * Two sources, most specific first:
 *  1. the doctor's own weekly timetable for THIS day — the good data, but
 *     only a doctor can maintain it, so in practice almost nobody has one;
 *  2. the profile's general consulting timing — free text like "10 AM – 2 PM",
 *     entered for every doctor at data entry.
 *
 * Before (2) existed here, 205 of 206 doctors fell through to "Not confirmed
 * today" every morning while their OPD hours sat unused two lines below on the
 * same card. A weaker answer that is true beats a blank.
 *
 * Returns null only when we genuinely know nothing — then showing nothing is
 * the honest move.
 */
export function timetableFallback(
  timetable: Record<string, string> | null | undefined,
  dayKey: string,
  consultationTiming?: string | null
): string | null {
  const today = timetable?.[dayKey]?.trim();
  if (today) return today;
  const general = consultationTiming?.trim();
  return general ? general : null;
}

/** "Updated 2 hr ago" — shared so every surface phrases age identically. */
export function describeAge(ageMinutes: number | null): string | null {
  if (ageMinutes === null) return null;
  if (ageMinutes < 1) return "just now";
  if (ageMinutes < 60) return `${ageMinutes} min ago`;
  const hrs = Math.round(ageMinutes / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}
