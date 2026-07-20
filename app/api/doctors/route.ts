import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireUser } from "@/lib/authz";
import { rolesWith } from "@/lib/roles";
import { serializeDoctor } from "@/lib/serialize";
import { guarded } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { istToday } from "@/lib/ist";
import { liveSince } from "@/lib/status-freshness";

// Module 6: MRs (and admins) can add doctors they actually visit.
const CAN_ADD = rolesWith("add_doctor");

// Clamp free-text input: trim + hard length cap, so nobody can store
// megabytes of junk in a name/address field.
const clamp = (v: unknown, max = 120) => (v ?? "").toString().trim().slice(0, max);

// "Dr.  Ananya Sen " → "ananya sen" — normalised form for duplicate checks.
const normName = (s: string) =>
  s.toLowerCase().replace(/^dr\.?\s*/i, "").replace(/\s+/g, " ").trim();

// Statuses a caller may filter by — anything else in ?status= is ignored.
const FILTERABLE_STATUSES = new Set([
  "available", "busy", "token_full", "no_mr_today", "holiday", "opd_closed",
]);

// Public directory: anyone can read VERIFIED doctors. Unverified profiles
// (MR-added, awaiting admin approval) are visible only to their creator and
// admins — so bad data never reaches the public before a human checks it.
//
// Search, filters and paging live HERE, not in the browser: at 206 doctors
// (and growing) shipping the whole directory to filter it client-side taxes
// exactly the users core rule #2 protects — MRs on 4G between chambers.
// Response: { doctors, total, page, per, has_more } + on page 1 the filter
// options { cities, specialties } so dropdowns cover ALL doctors, not one page.
export const GET = guarded(async (request: NextRequest) => {
  const session = await auth();
  const u = session?.user as { id?: string; role?: string } | undefined;
  const visibility: Prisma.DoctorWhereInput =
    u?.role === "admin"
      ? {}
      : u?.id
        ? { OR: [{ verified: true }, { addedById: u.id }] }
        : { verified: true };

  const sp = request.nextUrl.searchParams;
  const q = clamp(sp.get("q"), 80);
  const city = clamp(sp.get("city"), 60);
  const specialty = clamp(sp.get("specialty"), 60);
  const status = clamp(sp.get("status"), 30);
  const page = Math.max(1, Math.trunc(Number(sp.get("page")) || 1));
  // Default one screenful; 500 cap lets internal views (status board, MR
  // dashboard) fetch everything in one call at today's scale.
  const per = Math.min(500, Math.max(1, Math.trunc(Number(sp.get("per")) || 24)));

  const and: Prisma.DoctorWhereInput[] = [visibility];
  if (q) and.push({ name: { contains: q, mode: "insensitive" } });
  // City is the last comma-segment of the address; `contains` is the
  // pragmatic SQL for it and tolerates spacing/case variance.
  if (city) and.push({ chamberAddress: { contains: city, mode: "insensitive" } });
  if (specialty) and.push({ specialty: { equals: specialty, mode: "insensitive" } });
  if (FILTERABLE_STATUSES.has(status)) {
    // "Show available NOW", not "raw field says available". liveSince() is the
    // trust rule's own DB bound (lib/status-freshness.ts) — a two-day-old
    // 'available' must not match here, same as the badge refuses to show it.
    and.push({ status, statusUpdatedAt: { gte: liveSince() } });
  }
  const where: Prisma.DoctorWhereInput = { AND: and };

  const [total, doctors] = await Promise.all([
    prisma.doctor.count({ where }),
    prisma.doctor.findMany({
      where,
      // NO `updates` here. History is 20 audit rows × every doctor to power a
      // panel most visitors never open — and it carries editor emails, which
      // have no business in a public payload. The directory lazy-loads one
      // doctor's history from GET /api/doctors/[id] on demand.
      include: {
        dayPlans: { where: { date: istToday(), shared: true }, take: 1 },
      },
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * per,
      take: per,
    }),
  ]);

  // Dropdowns need every doctor's city/specialty, not this page's slice. A
  // two-column select across the visible set is cheap; page 1 only.
  let facets: { cities: string[]; specialties: string[] } | null = null;
  if (page === 1) {
    const rows = await prisma.doctor.findMany({
      where: visibility,
      select: { chamberAddress: true, specialty: true },
    });
    const cityOf = (addr: string) => addr.split(",").pop()?.trim() ?? "";
    facets = {
      cities: [...new Set(rows.map((r) => cityOf(r.chamberAddress)).filter(Boolean))].sort(),
      specialties: [...new Set(rows.map((r) => r.specialty).filter(Boolean))].sort(),
    };
  }

  return NextResponse.json({
    doctors: doctors.map(serializeDoctor),
    total,
    page,
    per,
    has_more: page * per < total,
    ...(facets ?? {}),
  });
});

export const POST = guarded(async (request: NextRequest) => {
  const { user, response } = await requireUser(CAN_ADD);
  if (!user) return response;

  // Generous cap: an MR typing in their whole 100-doctor list in one sitting
  // is the HAPPY path. A script hammering the endpoint is not.
  if (!rateLimit(`adddoc:${user.id}`, 100, 60 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Too many new doctors at once. Please try again later." },
      { status: 429 }
    );
  }

  const b = await request.json().catch(() => ({}));
  const name = clamp(b?.name, 100);
  if (!name) {
    return NextResponse.json({ error: "Doctor name is required." }, { status: 400 });
  }
  const hospital = clamp(b?.hospital, 120);

  // Duplicate guard: same person at the same hospital already listed?
  // (Same name at a DIFFERENT hospital is allowed — doctors move around.)
  const core = normName(name);
  if (core) {
    const lastToken = core.split(" ").pop() ?? core;
    const candidates = await prisma.doctor.findMany({
      where: { name: { contains: lastToken, mode: "insensitive" } },
      select: { id: true, name: true, hospital: true },
      take: 50,
    });
    const dupe = candidates.find(
      (c) =>
        normName(c.name) === core &&
        c.hospital.toLowerCase().trim() === hospital.toLowerCase().trim()
    );
    if (dupe) {
      return NextResponse.json(
        {
          error: `${dupe.name}${dupe.hospital ? ` (${dupe.hospital})` : ""} is already in the directory — search for them instead.`,
          existing_id: dupe.id,
        },
        { status: 409 }
      );
    }
  }

  // Consent to be listed. Required at entry — the person filling this form is
  // the only one who knows whether the doctor actually agreed, and asking
  // later never happens. Rejected rather than defaulted: a silent false would
  // create profiles that can never be approved, and a silent true would be a
  // lie about a real person's data.
  if (b?.consent_given !== true) {
    return NextResponse.json(
      {
        error:
          "Please confirm the doctor agreed to be listed. We publish their name, chamber and phone number publicly.",
      },
      { status: 400 }
    );
  }

  // Admin entries are trusted immediately; MR entries wait for approval.
  const verified = user.role === "admin";

  const doctor = await prisma.doctor.create({
    data: {
      name,
      specialty: clamp(b?.specialty, 60) || "General",
      qualification: clamp(b?.qualification, 100),
      hospital,
      chamberAddress: clamp(b?.chamber_address, 200),
      phone: clamp(b?.phone, 20),
      consultationTiming: clamp(b?.consultation_timing, 60),
      mrVisitingTime: clamp(b?.mr_visiting_time, 60) || null,
      mrVisitingDays: clamp(b?.mr_visiting_days, 60) || null,
      languages: Array.isArray(b?.languages)
        ? clamp(b.languages.join(", "), 120)
        : clamp(b?.languages, 120),
      experience: Number.isFinite(Number(b?.experience))
        ? Math.min(70, Math.max(0, Math.trunc(Number(b.experience))))
        : 0,
      status: "available",
      // Module 6: attribution — every profile knows who brought it in.
      addedById: user.id,
      addedByName: user.name ?? user.email ?? "Unknown",
      addedByRole: user.role,
      verified,
      consentGiven: true,
      consentAt: new Date(),
      consentByName: user.name ?? user.email ?? "Unknown",
      consentNote: clamp(b?.consent_note, 120) || null,
      // The audit trail starts at birth, same pattern as status edits.
      updates: {
        create: {
          userId: user.id,
          userName: user.name ?? null,
          userEmail: user.email ?? null,
          role: user.role,
          changes: { doctor_added: { from: null, to: name } },
        },
      },
    },
    include: { updates: true },
  });
  return NextResponse.json(serializeDoctor(doctor), { status: 201 });
});
