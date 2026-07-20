# MedConnect India — Project Knowledge

_Last updated: 2026-07-19. Supersedes `medconnect_knowledge_update.md` (also
dated 2026-07-19) and every file before it._

_Written by reading the repo, not by editing the previous knowledge file. Where
the two disagree, this one is right — see "Corrections" below._

---

## How to use this file

Replace the project-knowledge file in **project settings** with this one, then
launch Cowork from inside the project so it inherits the update. Cowork reads
project knowledge files, not chat history.

Keep this file honest about what is **built**, not what is **planned**. The
previous file drifted about ten days behind the code, and a session that starts
from a stale picture wastes its first half rediscovering the present.

---

## Corrections to the previous knowledge file

The previous file was materially wrong in three ways. Worth reading once so the
same assumptions don't come back:

| Previous file said | Reality in the repo |
|---|---|
| "flat-file `data/users.json`" | **PostgreSQL (Neon) + Prisma.** No code path reads those JSON files. |
| "Module 4 — Live Doctor Status ← ACTIVE. Next thing to build." | Module 4 was **already built and committed** (`a88e1e1`), and Modules 5 and 6 are substantially built on top of it. |
| Build order implies 4 → 5 → 6 still ahead | Modules 4, 5 and 6 all have schema, API routes and UI in place. What remains is depth and hardening, not greenfield. |

`data/doctors.json`, `data/users.json` and `data/visits.json` are **dead files**
from the flat-file era. Nothing imports them. They are the most likely cause of
the confusion above — worth deleting once you've confirmed nothing local needs
them.

---

## Stack (as built)

- **Next.js 16.2.10** (Turbopack) · React 19 · TypeScript · Tailwind v4
- **PostgreSQL on Neon** via **Prisma 5.22** — 10 migrations applied
- **Auth.js (next-auth v5 beta)**, JWT sessions, bcrypt passwords
- Deploy target: Vercel

Note for agents: `AGENTS.md` warns this Next.js version has breaking changes
versus training data. Read `node_modules/next/dist/docs/` before writing routing
or config code.

---

## Real build state

### Done and in use

- **Module 1 — Homepage** (`app/page.tsx`), plus `/welcome`
- **Module 2 — Auth.** Login, signup, JWT sessions, bcrypt. Self-signup creates
  **MR accounts only**; every other role is admin-created. Doctors link to a
  profile through a one-time atomic **claim flow** (`/api/doctors/claim`).
- **Module 3 — Doctor Directory** (`app/doctors`) — search, city/specialty/
  status filters, public read.
- **Module 4 — Live Doctor Status.** Two layers as specced: weekly timetable
  (doctor-owned, public) and live status. Plus a third the old file didn't
  record: **`DoctorDayPlan`**, the doctor's shared day-wise plan with a
  "Start My Day" action. Full audit trail via `DoctorUpdate`.
- **Module 5 — Call MR.** `CallRequest` model, `/api/call-requests`, wired into
  both the doctor dashboard (request) and MR dashboard (inbox).
- **Module 6 — MR tools.** `MrDoctor` (personal doctor list with monthly visit
  frequency), `Patch` (named area groups, load a patch to fill a day's plan),
  `PlanItem` (ordered daily visit plan with rearrange), `Visit` tracking,
  MR-added doctors with admin verification queue.
- **Admin panel** — `/admin/users`, role management.
- **WhatsApp Status Board** (`/status-board`) — turns today's confirmed statuses
  into a shareable message. This is the Phase-1 marketing engine.
- **MR field SOS** (`components/sos-button.tsx`).

### Roles — 7, centrally configured

`admin · mr · doctor · clinic_staff · chemist · stockist · company`

All permissions live in **`lib/roles.ts`** (`rolesWith(permission)`). Recruiter
was deleted; Company absorbed its functions. Never hard-code a role list
anywhere else.

### Scale (as of 2026-07-19)

206 doctors · 10 users (all 7 roles represented) · 9 visits · 2 call requests.

Worth internalising: the vision doc says "design for the 12 real doctors, not
the imagined 12,000." That's now **206**. Directory features that felt fine at
12 — no pagination, loading every doctor's full 20-entry audit history on every
page load — deserve a second look before this grows again.

---

## Three core rules — baked into every module

Unchanged. These are yours and they still hold.

1. **Security — target 4/5 by launch, not 5/5.** Passwords hashed; input
   validated and length-clamped on every route; secrets in env only; Prisma
   parameterized queries; DB never exposed to the open internet; Neon
   point-in-time backup is the real recovery mechanism. Heavy layers (WAF,
   DDoS, pen-testing) wait for real traffic.
   **Your own action, outside code:** 2FA on GitHub, Vercel and Neon. Most
   small-project breaches are stolen credentials, not code flaws.
2. **Speed — MRs must never feel lag.** Security and speed don't conflict;
   hashing runs once at login. Real slowness comes from wasteful queries and
   over-fetching. Fetch only what's needed, use loading skeletons, don't
   micro-optimise before measuring.
3. **Modular, maintainable code.** Build the doctor card once and reuse it.
   Keep business logic out of UI. One endpoint, one concern. Avoid speculative
   abstraction.

`AGENTS.md` holds the enforceable engineering conventions (guarded routes, rate
limits, audit trails, IST dates, snake_case API, status-freshness rule).

---

## Module 4 — status trust rules (decided 2026-07-19)

Full detail in **`docs/module-4-status-trust.md`**. The short version:

A live status is **a claim with an age, never a standing fact.**

| Confidence | When | Renders as |
|---|---|---|
| fresh | confirmed today (IST), within 3 hours | full colour, ✓ if doctor/clinic |
| ageing | confirmed today, over 3 hours ago | muted + "as of 10:15 AM" |
| stale | earlier IST day, or never | **no badge** — falls back to "Usually 10 AM – 1 PM" from the timetable |

- **The IST day boundary dominates.** A status set at 11:50 PM is stale at
  12:05 AM. New day, new OPD, new tokens.
- **Whole-day statuses don't decay through the day.** `No MR Today`,
  `OPD Closed`, `Holiday` hold until midnight without re-tapping. Nagging a
  doctor to re-confirm a decision they already made is how a status feature
  dies. `Available` / `Busy` / `Token Full` are moment-scoped and do decay.
- **One implementation only:** `lib/status-freshness.ts`, rendered through
  `components/doctor-status.tsx`. Before this, three screens each had their own
  definition of "fresh" and the status board's 24-hour rule was shipping
  day-old statuses into WhatsApp groups.

### Resolved decisions

- **MR-estimate distinction — CONFIRMED YES** (was "pending Sam's confirm").
  MR-reported status renders dashed with no tick and is labelled "MR-reported".
  Doctor/clinic-confirmed gets a solid badge and a tick.
- **MR attribution now carries company.** `User.company` captured at signup,
  denormalized to `Doctor.statusUpdatedByCompany` at write time → "Reported by
  Ramesh, Sun Pharma · 20 min ago". Denormalized so a past attribution stays
  truthful if the MR changes company. Company is public **only** in this
  attribution context; phone stays private. Cleared explicitly when a doctor
  confirms their own status, so the doctor's word is never credited to whichever
  MR last touched the card.
- **Location-free by design.** Status is a manual one-tap update from doctor /
  clinic staff / MR. **Never GPS.** Doctors won't grant location permission;
  manual tap is the reliable path. This is intentional, not a shortcut.

### Who edits what

- Doctor: own timetable, own day plan, own live status
- Clinic staff: their clinic's live status + patient counts
- MR: any doctor's live status (`patients_source: "mr_estimate"`)
- Admin: anything
- **No "patient" role.** A patient is a guest browsing the public directory.

---

## Doctor card blueprint

Minimalist business-profile card — no biography, no filler. Top to bottom:

1. 50×50 photo (placeholder space if none)
2. Name, qualification, specialty
3. Hospitals
4. Locations / areas (Laketown, Baguiati, Airport, Nagerbazar…)
5. Chamber / OPD boxes — chamber name, days, time range ("Healthy Diagnostics,
   Mon-Wed-Fri, 5–7pm"). This is the weekly timetable.
6. Phone — **sensitive, conditional**

**Discipline:** only chambers the doctor *regularly* visits appear.

**Phone handling:** doctor's own number if given; else a nearby chamber /
institution number; if the doctor wants no public number, the phone section
doesn't render at all.

**Structured for search, not just display:** days and times stored as clean
separate fields so "which doctors are available today (Sunday)?" is a query,
not a string match.

---

## MR profile — built vs not

**Built:** `name`, `email`, `role`, `company`.

**Not built:** `age`, `territory`, `segment`, `phone`, `total experience`. The
previous file described these as done. They are not. They are additive fields on
the existing `User` record when you want them — no rebuild, no conflict with
doctor data.

Everything except `company` is **private** — visible only to that MR after
login, plus admin for support. `company` is public only inside status
attribution.

**Still open:** are `territory` and `segment` free text or a fixed dropdown?
Dropdown keeps data clean and makes future search/filter and MR-to-MR discovery
work properly — recommended, still awaiting your call.

---

## Parking lot — specced, deliberately not built

- **Statistical projection.** Once there are weeks of visit data, show an
  expected pattern ("usually here ~10 AM Tuesdays"). Must reuse the `Confidence`
  type from `lib/status-freshness.ts` and render in its own lighter style —
  **never** styled like a confirmed status. It's a probability, not a fact.
- **Multi-day holidays.** A `holiday` status currently goes stale the next day
  like anything else, because there's no end date to know better. Needs a date
  range before it can honestly say "back on the 25th". _(New — surfaced by the
  freshness work.)_
- **Bulk doctor import.** MR uploads Excel/CSV/PDF of their doctor list; system
  matches against existing doctors, splits "already in system" vs "new", auto-
  creates clean rows, shows a review table for ambiguous ones. **Plain-code
  parsing first — no AI needed for structured files.** An AI layer (Anthropic
  API) comes only for messy normalisation ("MD medicine" / "M.D.(Gen)" / "md" →
  one form). Birthday captured, shown to **MRs only**, never to patients.
- **MR-to-MR discovery.** Search other MRs by segment/area. Viewing another MR
  shows **only name + company** — never phone.
- **Patient search + profile.** Search by name / specialty / location plus an
  "available now" toggle. Row list → click opens the full public profile
  **in-place** (panel, no page load). Call button surfaces a context-aware
  number based on time + current chamber. Direction button uses saved chamber
  coordinates → Google Maps.
- **E-commerce (chemist orders).** Patient need routes to a nearby chemist,
  riding the same status network. New `Order` model alongside existing ones —
  nothing rebuilt.

---

## Value proposition / moat

The live-status layer is the differentiator; a plain job-board or directory
competitor can't replicate it. The real moat is what that data enables —
crowd-sourced "best time to catch", territory conflict-avoidance, MR reliability
scoring, chemist/stockist demand signals.

But the moat is only worth anything if the status is **believable**. That's why
the freshness work took priority over new modules: a directory that shows a
two-day-old "Available" in confident green teaches people to stop trusting it,
and no amount of downstream cleverness recovers from that.

---

## Known debt / next candidates

Not a decision — options, with the reasoning:

1. **Delete `data/*.json`.** Dead files actively misleading anyone (human or
   agent) reading the repo. Five minutes.
2. **Directory performance at 206 doctors.** `GET /api/doctors` returns every
   doctor with 20 audit entries each, and the page renders them all. Fine at 12,
   questionable at 206, bad at 1,000. Pagination or trimming the audit payload.
3. **MR profile fields** (`territory`, `segment`) — needed before MR-to-MR
   discovery or smarter patch planning. Blocked on the dropdown-vs-free-text
   question above.
4. **Multi-day holidays** — smallest honest win in the status layer.
5. **Module 5 depth** — Call MR exists end to end but is thin; notifications
   (email/push/SMS) are specced platform-wide and not built at all.

My read: **1 and 2 first** — they're cheap and both get worse with time — then
resolve the territory/segment question so 3 can proceed.

---

## Brand voice

Kept separately in `.claude/brand-voice-guidelines.md`. Short version:
practical and outcome-focused, warm and role-specific (name MRs, doctors,
chemists explicitly), confident with real numbers, plain-spoken Indian English,
India-first context. Not visionary, not corporate-distant, not
superlative-stuffed. Emoji in-product only, never in marketing copy. Medical and
regulatory content stays factual and CDSCO-accurate — hard rule until legal
review says otherwise.

---

## State at 2026-07-20 (Cowork session)

- **`e98351f` on `main`** — status-trust layer committed: `lib/status-freshness.ts`
  (+16 unit tests), `components/doctor-status.tsx`, MR **name + company** public
  attribution (schema + migration `20260719120000_status_attribution_company`),
  signup collects company, all five surfaces render through the shared badge.
  `npm run check` green in-session. **Not pushed** — Sam pushes.
- **Migration CONFIRMED applied to Neon** (checked in console 2026-07-20:
  `_prisma_migrations` row finished 2026-07-19; `Doctor.statusUpdatedByCompany`
  present). DB healthy, 206 doctors. **`migrate deploy` is NOT needed.**
  Sam's local P1001 = his network blocking outbound TCP 5432 (console over
  HTTPS works fine) — test with:
  `Test-NetConnection ep-hidden-mouse-afot2zle-pooler.c-2.us-west-2.aws.neon.tech -Port 5432`,
  and try a phone hotspot / disable VPN-firewall if it fails.
- **Dead files pending deletion:** `data/{doctors,users,visits}.json` — zero code
  references; `git rm` blocked in the VM (no unlink). Delete locally:
  `git rm data/doctors.json data/users.json data/visits.json && git commit -m "Remove dead flat-file era data"`
## Pre-launch checklist (raised 2026-07-21)

Launch splits in two. **A one-chamber field pilot needs none of the below** —
one PA, one known doctor. **Before any patient who isn't a personal contact
sees the site**, these are blockers:

- 🔲 **BLOCKER 1 — production holds 206 SEED doctors.** Fake names/numbers
  (Dr. Rajesh Kumar, Delhi/Mumbai/Pune). A patient tapping Call reaches a
  stranger — the exact wasted trip the product exists to prevent. Purge to
  only field-verified doctors before patient traffic, even if that's 12.
  (`prisma/seed.mjs`, `seed-demo.mjs` created these.)
- 🔲 **BLOCKER 2 — no doctor consent capture, no takedown UI.** Real names,
  chamber addresses and phones are published. DPDP Act 2023 applies; the
  sharper risk is relational (one angry doctor = a lost territory). Needs a
  consent step in the MR add-doctor flow. Email takedown path now exists
  (see below) but it is manual.
- ✅ **Legal pages — DONE 2026-07-21.** `/privacy`, `/terms` (medical
  disclaimer leads, in amber), shared `components/site-footer.tsx` on home,
  `/doctors`, `/status-board` carrying the short disclaimer + removal path.
  Contact address centralized in `lib/contact.ts` (override with
  `NEXT_PUBLIC_CONTACT_EMAIL`) — **it must be an inbox Sam reads; a bouncing
  takedown address is worse than none.** Old footer pointed at
  support@medconnectindia.com, which does not exist.
- ✅ **Share metadata — DONE 2026-07-21.** OG/Twitter tags + generated
  `app/opengraph-image.tsx` card, `robots.ts` (disallows `/update/`, dashboards,
  APIs), `sitemap.ts`. Site description repositioned patient-first. Set
  `NEXT_PUBLIC_SITE_URL` on Vercel if the domain changes.
- 🔲 Can wait: in-memory rate limiting (per-instance on serverless), no CSP,
  no analytics.

---

- **Done 2026-07-20 (7): per-doctor share card.** `lib/doctor-share.ts`
  (React-free, 3 unit tests): live status speaks in present tense with queue
  count (fresh only, "~" = MR estimate); stale falls back to "Usually today:
  <hours>" — never fakes now. Includes chamber number + deep link
  `/doctors?q=<name>`. Surfaced twice: small "Share this doctor" link under
  every card's call button, and a big "Post today's status on WhatsApp"
  button on the PA page right after the save flash — the PA's natural next
  tap puts the status on the doctor's own WhatsApp Status.
- **Done 2026-07-20 (6): tap-to-call.** Every directory card gets a prominent
  `tel:` button — chamber desk (`secretaryContact`) preferred over the
  doctor's own number; label is freshness-aware ("Call chamber" when live,
  "Call to check today's timing" when stale); hidden when no number exists
  (sensitive-by-absence rule). Full per-chamber context-aware numbers stay in
  the parking lot behind structured chamber data.
- **Done 2026-07-20 (5): PA update link** (approved trade-off: possession of
  link = authorization). `Doctor.statusKey` (unique, nullable, never
  serialized) + migration `20260720190000_pa_status_update_link` (**apply
  before deploying** — new Prisma client selects the column). Issue/rotate/
  revoke: `POST|DELETE /api/doctors/[id]/status-key` (set_doctor_status roles,
  doctor-own rule; rotation = revocation). Public: `/update/[key]` page +
  `GET|PUT /api/status-link/[key]` — status + patients only, rate-limited
  per-key AND per-IP, atomic updateMany on the key, attributes as
  `clinic_staff` ("Chamber staff"), audit row per change. MR flow: directory
  card → "PA update link" → confirm → link on clipboard → hand to PA.
  Next per Sam's answers: tap-to-call number-that-answers, then per-doctor
  share card.
- **DEPLOYED 2026-07-20: https://medconnect-india.vercel.app is LIVE.**
  Vercel project `medconnect-india` (team sampatra22s-projects), git-connected,
  auto-deploys `main`. Env vars in Vercel: `DATABASE_URL`, `AUTH_SECRET`
  (Production+Preview, sensitive). Verified live: /api/doctors returns all 206
  doctors with freshness verdicts; /doctors renders trust badges; /status-board
  area chips + URL params work. **History:** the project had existed since
  Jul 2 but EVERY build after the skeleton failed silently — fixed by the
  "Vercel prep" commit (`prisma generate` in build + `rhel-openssl-3.0.x`
  binary target). Env vars were the second blocker (paste `KEY=value` into the
  Key box — it auto-splits; the value alone in Key fails validation).
- **Done 2026-07-20 (4):** board is bookmarkable per beat —
  `/status-board?city=…&area=…` read on mount, chips mirror into the URL
  (replaceState), "🔗 Copy board link" button. Pin one link per WhatsApp group.
- **Done 2026-07-20 (3):** Status Board targets the beat, not the city — area
  chips (second-to-last address segment, e.g. "Salt Lake"), message header
  "Doctor Status — Salt Lake, Kolkata", "…and N more confirmed today" when the
  15-line cap cuts, and "~" on patient counts only for MR estimates (clinic
  counts are exact), matching the directory.
- **Done 2026-07-20 (2):** directory search/filter/paging moved server-side —
  `GET /api/doctors` takes `q/city/specialty/status/page/per` (default 24,
  cap 500), returns `{ doctors, total, page, per, has_more }` + `cities`/
  `specialties` facets on page 1. "Available now" uses `liveSince()` — the
  trust rule's own DB bound in `lib/status-freshness.ts` (tested). Status
  board + MR dashboard fetch `?per=500` and read `.doctors`.
- **Done 2026-07-20:** directory over-fetch fixed — the `/api/doctors` list no
  longer joins 20 audit rows per doctor (~4,000 rows at 206 doctors); history
  (which carries editor emails) is now signed-in-only via a new
  `GET /api/doctors/[id]`, lazy-loaded when a card's panel opens.
