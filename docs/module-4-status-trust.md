# Module 4 · Status Trust Rules

_Added 2026-07-19. Supersedes the ad-hoc freshness logic that previously lived
in three different files._

## The problem this solves

A live status had no expiry. A doctor who tapped **Available** on Monday still
showed a bright green **Available** badge on Thursday. Three separate surfaces
each had their own idea of "fresh":

| Surface | Old rule |
|---|---|
| Doctor directory | none — showed the raw status forever |
| WhatsApp status board | "updated within 24 hours" |
| MR dashboard | none — showed the raw status forever |

The 24-hour rule was the most dangerous, because that message gets **forwarded
into WhatsApp groups**. A status set at 6 PM Monday still counted as fresh at
10 AM Tuesday and would be broadcast as today's news.

On a product whose entire moat is the live-status layer, a stale green badge is
the fastest way to lose the directory's credibility — one wasted trip is enough.

## The rule

All of it lives in `lib/status-freshness.ts`. Nothing re-implements it.

| Confidence | When | How it renders |
|---|---|---|
| `fresh` | Confirmed today (IST), within 3 hours | Full-colour badge, ✓ if doctor/clinic confirmed |
| `ageing` | Confirmed today, more than 3 hours ago | Muted badge + "as of 10:15 AM" |
| `stale` | Confirmed on an earlier IST day, or never | **No status badge.** Falls back to "Usually 10 AM – 1 PM" from the weekly timetable, or "Not confirmed today" |

Two rules sit on top:

1. **The IST day boundary dominates.** A status set at 11:50 PM is stale at
   12:05 AM — fifteen minutes old, but a new day means a new OPD, new tokens,
   new plan.
2. **Whole-day statuses don't decay through the day.** `No MR Today`,
   `OPD Closed` and `Holiday` hold until midnight without re-tapping. Nagging a
   doctor to re-confirm a decision they already made is how a status feature
   dies. `Available` / `Busy` / `Token Full` are moment-scoped and do decay.

## Source ladder

Who confirmed it is a trust ladder, not a formality:

| Tier | Roles | Renders as |
|---|---|---|
| `doctor` | the doctor's own word | solid badge + ✓ |
| `verified` | clinic staff, admin | solid badge + ✓ |
| `reported` | MR | **dashed** badge, no ✓, labelled "MR-reported" |

An MR's report is genuinely useful — it is also second-hand, and a patient
deserves to tell the difference. This resolves the open question the knowledge
file had flagged as "RECOMMENDED — pending Sam's confirm".

## MR company attribution

`User.company` is captured at MR signup and denormalized onto
`Doctor.statusUpdatedByCompany` at write time, so the directory can show
**"Reported by Ramesh, Sun Pharma · 20 min ago"**.

- Denormalized (not joined) so a past attribution stays truthful if the MR
  later changes company or leaves.
- The company is **public in this attribution context only**. Phone number and
  every other MR profile field stay private.
- Cleared explicitly when a doctor confirms their own status, so the doctor's
  word is never credited to whichever MR last touched the card.

## Knock-on effects

- **Filters.** Selecting "Available now" matches only doctors who are live AND
  available. Matching the raw field would surface a two-day-old "available" —
  the same false promise the badge refuses to make.
- **Patient counts.** Shown only while the status behind them is `fresh`.
  Yesterday's "3 patients left" is noise.
- **WhatsApp message.** Carries only statuses confirmed today, labels
  MR-reported entries, and drops stale patient counts.
- **Doctor dashboard.** When a doctor's status has gone stale they see
  "Your status isn't showing to patients right now" with a one-tap fix. The
  decay rule is what gives a doctor a reason to open the app daily — confirmed
  doctors are the ones patients can actually find.

## Testing

`npm test` runs `lib/status-freshness.test.ts` against the real module
(no copies) via Node's built-in test runner — 16 cases covering the day
boundary, the ageing threshold, the source ladder, clock skew and bad input.

`npm run check` = `tsc --noEmit` + tests.

## Deliberately not built yet

- **Multi-day holidays.** A `holiday` status goes stale the next day like
  anything else, because there is no end date to know better. Needs a date
  range on the status before it can be honest about "back on the 25th".
- **Statistical projection** (parking lot) must reuse `Confidence` rather than
  inventing a fourth style — it is a probability, and the whole point of this
  module is that only confirmed-now gets to look confirmed-now.
