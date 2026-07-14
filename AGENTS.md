<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# MedConnect India — engineering principles (owner: Sam)

This platform is a trust network for the pharma industry (MRs, doctors, clinic
staff, chemists, stockists, companies). Every line of code must earn trust:
**secure, reliable, efficient — no shortcuts.** Current data is placeholder;
we are building the STRUCTURE first, so get the skeleton right rather than
polishing demo content.

Non-negotiable conventions (all exist — reuse, never reinvent):

- **Roles & permissions** live ONLY in `lib/roles.ts` (`rolesWith(permission)`).
  Never hard-code role lists in routes or UI.
- **Identity comes from the session** (`requireUser` in `lib/authz.ts`), never
  from the request body. Ownership checks (e.g. `doctor.userId === user.id`)
  gate personal resources; admin may override.
- **Every API route is wrapped in `guarded()`** (`lib/api.ts`) so failures
  return clean JSON 500s, and **write endpoints get `rateLimit()`**
  (`lib/rate-limit.ts`) keyed by user id or IP.
- **Every data edit is audited** via `DoctorUpdate` (or an equivalent trail):
  who, what, when — no anonymous changes, ever. Surface freshness + editor in
  the UI ("12m ago by Clinic Staff").
- **Clamp all free-text input** (trim + hard length cap) before storing.
- **Concurrency-sensitive writes must be atomic** (e.g. `updateMany` with a
  guard condition, unique constraints) — never check-then-write.
- **Dates are IST calendar days** ("YYYY-MM-DD") via `lib/ist.ts`.
- **API JSON is snake_case** through `lib/serialize.ts` serializers only.
- Passwords: bcrypt. Security headers: `next.config.ts`. Self-signup creates
  MR accounts only; other roles are admin-created. Doctor accounts link to
  profiles through the one-time atomic claim flow.
- Prefer boring, proven patterns over clever ones. Small, verifiable steps;
  run `npx tsc --noEmit` before declaring anything done.
