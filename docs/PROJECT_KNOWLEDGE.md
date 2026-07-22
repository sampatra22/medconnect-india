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
- **Done 2026-07-21 (8): typed-entry quality on Add Doctor.**
  `components/combo-box.tsx` — suggests but NEVER restricts (free text always
  wins; native `<datalist>` rejected: no async merge, inconsistent on Android).
  `lib/medical-vocab.ts` — curated India specialty/qualification lists +
  `rankSuggestions` (prefix > word-start > contains; 6 unit tests, "ort" →
  Orthopedics). `GET /api/vocab` merges those lists with values already in the
  directory, so vocabulary grows with field use (add_doctor roles only).
  `GET /api/geo/search` proxies **OpenStreetMap Nominatim** (free, no key, no
  billing; India-only, 4s timeout, rate-limited, required User-Agent set) —
  verified good Kolkata coverage. Swapping to Google Places later = this one
  file. **Discoverability fix:** the create button was invisible because it sat
  on the third tab labelled "＋ Add Doctor" while two other tabs had "＋ Add
  Doctors" (pickers for EXISTING doctors). Renamed to "＋ New doctor (not in
  list)" and surfaced at the dead end — empty search results now offer
  `＋ Add "<what you typed>" to the directory`, prefilling the name.
  **Still missing here: the consent checkbox** (pre-launch blocker 2).

- **Done 2026-07-22 (25): accessibility + polish pass.** Global font swapped
  to **Atkinson Hyperlegible** (Braille Institute's low-vision typeface —
  distinct I/l/1, O/0; tall x-height) via `--font-app-sans`; also fixed a
  self-referential `--font-sans: var(--font-sans)` in globals that had been
  silently falling back to a system font. Directory cards: bigger name
  (base→lg), specialty (→base semibold), darker secondary text (gray-500/400 →
  600/700/900) for contrast, roomier line spacing. **Meaningful motion:** a
  soft "breathing" ring (`.mc-live`, CSS keyframe) on the status dot — applied
  ONLY to fresh, doctor/clinic-confirmed statuses (the strongest "in right
  now" cue; ageing/MR-reported stay a plain dot). Tactile `.mc-card-hover`
  lift. Both wrapped in `prefers-reduced-motion: reduce` so motion-sensitive
  users opt out automatically. Font weights 400/700 verified against Next's
  font-data before use.

- **Done 2026-07-22 (24): SEO/GEO/AEO behind a launch gate.** `lib/site.ts`
  `SITE_LAUNCHED` (env `NEXT_PUBLIC_SITE_LAUNCHED`, default false). While
  false: EVERY page carries `robots noindex` (root + doctor pages), robots.txt
  returns `Disallow: /`, sitemap returns [], `/llms.txt` declines to describe
  the product. **Launch = set `NEXT_PUBLIC_SITE_LAUNCHED=true` in Vercel +
  redeploy; nothing else changes.** Built (all live once launched):
  • SEO — root keywords, per-doctor canonical/OG/Twitter, `MedicalOrganization`
    + `WebSite` (with SearchAction) on homepage, `Physician` + `BreadcrumbList`
    graph on doctor pages, sitemap lists every VERIFIED doctor only.
  • AEO — visible "Common questions" FAQ on the homepage + `FAQPage` JSON-LD
    from one shared array (`lib/structured-data.ts`) so text and schema can't
    drift; answer-engine-friendly factual Q&A.
  • GEO — `/llms.txt` describing the product, canonical pages, and "not to be
    represented" guardrails for AI answer-engines.
  Only public (verified) doctor data is ever exposed; MR identity and private
  fields stay out. Gate flip verified both directions.

- **Done 2026-07-22 (23): per-doctor public pages (SEO + share targets).**
  `/doctors/[slug]` — server-rendered (Google indexes it fully), slug =
  `name-<id>`, id is the last hyphen segment (CUIDs have no hyphens;
  `lib/doctor-slug.ts` + 4 tests). **Verified-only → 404 otherwise** (an
  unverified profile must never be discoverable). generateMetadata
  (title/description/canonical/OG/Twitter) + Physician JSON-LD (rich result).
  Interactive strip (live badge + call/directions/share) split into a client
  child so the page stays a server component. MR identity withheld (public =
  anonymous). **Share links + card "share" now point to the doctor's own page,
  not `?q=` search** — a WhatsApp forward lands on ONE doctor. Detail panel
  gains "Open full page ↗". `sitemap.ts` now async, lists every verified
  doctor (degrades to static on DB error). This is the patient-acquisition
  compounder: search + forwards both resolve to a live, indexable page.

- **Fixed 2026-07-22 (22): "log in twice" race — all roles.** `signIn(redirect:
  false)` sets the cookie, but the client `SessionProvider` (read by every
  dashboard's `useSession`) hadn't refetched it, so `router.push` landed on a
  dashboard still seeing "unauthenticated" → its guard bounced back to /login;
  the 2nd click worked because the provider had caught up. Fix in BOTH
  `/login` page and the homepage `LoginModal`: after reading the fresh session
  server-side, navigate with `window.location.assign(homeFor(role))` — a full
  page load whose provider sees the cookie from the first byte. One click,
  every role.

- **Done 2026-07-22 (21): usage analytics (zero-PII).** `Metric` model +
  migration `20260722120000_usage_metrics` (**apply before deploy**): one row
  per IST day per event, atomic upsert-increment. NO sessions/user-ids/IPs —
  a COUNT can't leak privacy, needs no cookie banner. `lib/metrics.bumpMetric`
  (server, fire-and-forget) counts truth events from the status + PA-link
  routes (`status_update`, `pa_status_update`). `lib/track` (client,
  sendBeacon so tel:/maps/wa.me navigations still register) + public
  `POST /api/metrics` (whitelisted events only, per-IP capped) count
  directory/board views, detail opens, call/directions/share taps, PA-page
  views. `/admin/stats` — 14-day grid split SUPPLY (doctors kept fresh) vs
  DEMAND (patients acting) + live doctor/MR totals, linked in admin nav
  ("📊 Usage"). This makes the Phase-1 gate (~50 weekly-active MRs, dense
  coverage) measurable instead of guessed.

- **Done 2026-07-22 (20): E2E test campaign — 45/45 green against production.**
  `scripts/e2e-smoke.mjs <base-url>` plays six personas with real HTTP +
  cookie jars: anonymous patient, two fresh MR signups, the doctor account,
  admin, and an account-less PA. Covers: public surface (paging, name search,
  available-now filter, **MR anonymity verified live**), guest attack
  boundaries (401/403s), signup/dup/login/wrong-pw, MR add/edit + ownership
  (MR2 blocked from MR1's doctor), consent-refusal on create, status trust
  (mr_estimate, queue-clear on OPD close, junk rejected, doctor own-card
  only), full PA-link lifecycle (issue→use→rotate kills old→revoke kills
  all→garbage 404), bulk import row classification, admin consent gate
  (409 needs_consent → vouch approves + records), verify/re-verify,
  pending-count, password change end-to-end. Creates only ZZTEST data and
  deletes all of it (verified 200s). Stays inside every rate limit. Run after
  each deploy. NOT covered: visual rendering, real-phone behaviour, WhatsApp
  link previews — those stay manual.

- **Done 2026-07-22 (19): doctor photos + MR public anonymity.**
  `Doctor.photo` (migration `20260722100000_doctor_photo`, **apply before
  deploy**): client-side canvas cover-crop to 96px JPEG (~few KB) in the MR
  form, server validates data-URL shape + ≤60KB. `DoctorAvatar` component:
  photo, else initials-on-gradient — on every directory card + detail panel.
  **PRIVACY REVERSAL (Sam's call, 2026-07-22):** public/anonymous readers no
  longer see an MR's name+company in attribution — serializer `publicView`
  option nulls them for guests; UI says "Reported by an MR". Signed-in users
  (any role) still see full identity; audit trail unchanged. PA-link payload
  anonymizes the same way. Accountability = peers/admins; privacy = public.

- **Fixed 2026-07-22 (18): MR Doctors-tab search = name only.** The search box
  matched name+specialty+hospital+ADDRESS in one string, so results felt
  random ("kar" matched street names across half the directory). Now the same
  rule as the public directory: search means the name; specialty/plan status
  are the dropdowns. Placeholder matches ("Search doctor by name…"). The two
  picker modals (Add to Plan / My Doctors) keep multi-field matching — there
  it's useful ("pick all my Ortho doctors") and the placeholder says so.

- **Fixed 2026-07-22 (17): bulk import vs the real world.** Sam's actual
  portal export failed: it is an **ASP.NET GridView HTML page saved as .xls**
  (extremely common for Indian pharma portals), with report-title rows above
  the table and headers like "Listed Doctor Name", "Qual.", "Territory".
  Parsing moved to React-free `lib/import-parse.ts` (6 unit tests on a
  synthetic GridView fixture): `looksLikeHtml` sniff → regex `<table>`
  extraction (entity decode, span unwrap; no DOMParser so Node can test it);
  `findHeaderRow` scans the first 30 rows for the best-mapping row instead of
  assuming row 1; fuzzy header fallback (contains-matching) behind exact
  aliases; Territory/City append to the address. **Verified against Sam's
  real file: 114 doctors parse cleanly.** Note: portal specialty CODES
  ("ORT", "SUR") import as-is — MR/admin edit can normalize them later.

- **Done 2026-07-22 (16): bulk doctor import (parking-lot spec, plain code, no
  AI).** MR dashboard → "📄 Import list": company-portal CSV/XLS/XLSX parsed
  IN THE BROWSER (SheetJS `xlsx`, dynamic import so the bundle stays lean —
  the file never reaches our server). Header auto-detection against real
  portal spellings ("Doctor Name", "Speciality", "Mobile No", "Hospital/
  Clinic"; City column folds into the address); rows pre-classified
  New / Already listed / No name with a review table BEFORE anything is
  created. `POST /api/doctors/bulk` (max 100/batch, client loops; 5 batches/hr)
  revalidates every row with single-create clamps, one batched duplicate-guard
  read, audit row per doctor. **Consent stance: bulk rows import with
  consentGiven NULL and verified false, always** — a portal export is not a
  doctor's agreement; they land in the approvals queue showing "⚠ No consent
  recorded" and the MR collects consent on normal visits. Parse+detection
  verified against a synthetic portal-style workbook.

- **Done 2026-07-21 (15): patient detail panel (parking-lot spec delivered).**
  Tap anywhere on a directory card (real controls excluded via closest())
  → in-place bottom-sheet (mobile) / modal (desktop), no page load. Contents
  in patient question order: badge + attribution + fresh-only queue count;
  "Today: <hours>" via the fallback ladder; hospital + address; big **📞 Call**
  (desk-first) beside **🧭 Directions** — Google Maps `dir/?api=1` with the
  device's own location as origin (we never request geolocation permission);
  destination = saved GPS pin when present, else geocoded address text, so it
  works for all 206 today and sharpens as coords fill in. Share link + full
  weekly timetable + "call before travelling" caveat. `serializeDoctor` now
  ships `latitude/longitude` (public — the address already is).

- **Done 2026-07-21 (14): patient-first directory card + mobile filters.**
  Sam's directive: "if a patient gets benefited then this is more valuable for
  all." Card reading order is now the patient's question order: name → status
  badge (own full-width row under the name — no more name-vs-chip wrapping) →
  hours → call. Hours dedupe: the OPD-hours fallback had made cards show the
  same times up to 3× (chip + emerald today-line + OPD line); now ONE line
  answers "when do I go" — emerald timetable line only while live, OPD line
  only when it adds info (`opdDiffers && (live || todayHours)`).
  Mobile filters: search keeps the full row, the three dropdowns share one
  compact row (was: four stacked controls filling the first screen).
  Card padding p-4 on phones.

- **Done 2026-07-21 (13): self-service password change.** `PUT
  /api/account/password` — any signed-in role, requires the CURRENT password
  (a stolen session alone can't lock out the owner), min 8 chars, 5 attempts /
  15 min. `/account` page (gated via proxy matcher) linked from: MR header
  ("Hi, name" chip), doctor dashboard, admin nav ("🔐 Account"), generic
  dashboard quick actions. **"Forgot password" deliberately NOT built** — no
  email channel exists; admins recreate accounts instead, and the page says
  so. **Sam's action: change the admin password from sam123 now.**

- **Done 2026-07-21 (12): audit-driven build — fallback, edit, GPS.**
  Audit of live data found: only **1 of 206** doctors had a weekly timetable,
  so 205 fell through to "Not confirmed today" every morning while their OPD
  hours sat unused on the same card. `timetableFallback()` now takes a third
  argument and drops to `consultationTiming` (all 206 have it) — day-specific
  timetable still wins; nothing known still returns null. Applied to the badge
  AND the share message so a WhatsApp post can't say "timing not confirmed"
  while the card shows hours.
  **Edit was impossible** (create/approve/delete only) — a field typo meant
  deleting the profile and its history. New `PATCH /api/doctors/[id]`:
  whitelisted fields only (status/consent/verification deliberately excluded —
  each has its own guarded route), MR may correct what THEY added, admin any,
  every field change written to the audit trail. UI: "✏️ Edit" in the MR
  detail modal (shown only where the server would allow it) reusing the add
  form in edit mode (consent block hidden — it was recorded at creation), and
  inline editing in the admin approvals queue, which is where typos actually
  get noticed. Also added the missing `secretary_contact` + `consultation_timing`
  fields to the form (**92 of 206 doctors have no chamber number**, so
  tap-to-call falls back to the personal mobile that doesn't answer).
  **GPS**: Nominatim already returned lat/lon and we discarded it; the combobox
  now has an `onPick` hook, the MR dashboard caches coordinates by label, and
  both create and PATCH persist them (bounds-checked). 0 of 206 had coords —
  Directions was impossible without this.

- **Fixed 2026-07-21 (11): auth-state bugs across public pages.** Reported:
  signed in as admin, the homepage still offered "Log in / Sign Up", showed no
  identity, and gave no way back. Root cause: every public page rendered its
  own header and none knew about the session. Fixes:
  `components/site-header.tsx` — ONE session-aware header (identity chip +
  role → their dashboard, Log out; skeleton while the session resolves so it
  never flashes "Log in" at a signed-in user). Applied to home, `/doctors`,
  `/status-board`, `/privacy`, `/terms` (all previously dead-ended on a
  "← MedConnect India" text link). `components/mr-door-cta.tsx` — the
  homepage's "MR Login →" becomes "Go to my dashboard →" when signed in.
  Swept for the same class and found more: **`/login` hard-coded admins to
  `/admin/users`**, silently contradicting the admin-home move (now uses
  `homeFor()`, per AGENTS.md's no-hard-coded-roles rule); `/login` and
  `/signup` did not bounce an already-signed-in user; `/dashboard` hard-coded
  its role redirects the same way; the MR dashboard had NO exit to the public
  site (brand is now a home link + "👁 Public view", matching the doctor
  dashboard which already had one).

- **Fixed 2026-07-21 (10): "OPD Closed · 3 patients left".** A queue survived
  a status change to a non-sitting status — nothing ever cleared
  `patientsLeft`. Contradictions like this cost trust on the one surface whose
  whole value is trust. `statusHasQueue()` now lives in
  `lib/status-freshness.ts` (tested): only available/busy/token_full may carry
  a count; unknown statuses default to no-queue. **Both** write paths
  (`/api/doctors/[id]/status` and the PA link) clear `patientsLeft` +
  `patientsSource` at the source when the status can't have one, so no screen
  and no WhatsApp message has to remember to hide it. Also fixed the MR
  dashboard detail modal, which showed the count with no freshness guard at
  all. 3 contradictory rows in production were cleared.

- **Done 2026-07-21 (9): admin approvals queue.** The approve action existed
  only as a small button on a card inside `/doctors` among 206 others, while
  the admin area contained ONLY `/admin/users` with no nav — so an admin
  looking for approvals correctly concluded the feature didn't exist. Added
  `/admin/doctors`: full submission shown (hospital, chamber, phone, OPD, MR
  visiting) with consent state as a chip, Approve / Delete per row, empty
  state. `components/admin-nav.tsx` links the admin sections + Directory and
  carries a **pending badge** (`GET /api/admin/pending-count`). Admin `home`
  in `lib/roles.ts` moved `/admin/users` → `/admin/doctors`, because approvals
  are the time-sensitive job (a pending doctor is invisible to the public).

## Pre-launch checklist (raised 2026-07-21)

Launch splits in two. **A one-chamber field pilot needs none of the below** —
one PA, one known doctor. **Before any patient who isn't a personal contact
sees the site**, these are blockers:

- 🔲 **BLOCKER 1 — production holds 206 SEED doctors.** Fake names/numbers
  (Dr. Rajesh Kumar, Delhi/Mumbai/Pune). A patient tapping Call reaches a
  stranger — the exact wasted trip the product exists to prevent. Purge to
  only field-verified doctors before patient traffic, even if that's 12.
  (`prisma/seed.mjs`, `seed-demo.mjs` created these.)
- ✅ **BLOCKER 2 — consent capture DONE 2026-07-21.** Migration
  `20260721120000_doctor_listing_consent` (**apply before deploying**):
  `consentGiven/At/ByName/Note` on Doctor, all nullable. MR form has a required
  unticked amber checkbox ("The doctor agreed to be listed") + optional "who
  said yes" note; `POST /api/doctors` **rejects** without `consent_given: true`
  (not defaulted — a silent true would be a lie, a silent false would create
  unapprovable profiles). Approval is gated server-side in the verify route:
  no consent → 409 `needs_consent`; an admin may still approve via
  `confirm_consent: true`, which records consent under THEIR name in the audit
  trail. Pending cards show "✓ Consent recorded — <who>" or "⚠ No consent
  recorded" before the Approve button. **The 206 seed doctors all have NULL
  consent** — which is correct: they're fake and shouldn't be approved anyway
  (blocker 1). Takedown path remains the email route in /privacy + /terms.
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
