import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireUser } from "@/lib/authz";
import { rolesWith } from "@/lib/roles";
import { serializeDoctor } from "@/lib/serialize";
import { guarded } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { istToday } from "@/lib/ist";

// Module 6: MRs (and admins) can add doctors they actually visit.
const CAN_ADD = rolesWith("add_doctor");

// Clamp free-text input: trim + hard length cap, so nobody can store
// megabytes of junk in a name/address field.
const clamp = (v: unknown, max = 120) => (v ?? "").toString().trim().slice(0, max);

// "Dr.  Ananya Sen " → "ananya sen" — normalised form for duplicate checks.
const normName = (s: string) =>
  s.toLowerCase().replace(/^dr\.?\s*/i, "").replace(/\s+/g, " ").trim();

// Public directory: anyone can read VERIFIED doctors. Unverified profiles
// (MR-added, awaiting admin approval) are visible only to their creator and
// admins — so bad data never reaches the public before a human checks it.
export const GET = guarded(async () => {
  const session = await auth();
  const u = session?.user as { id?: string; role?: string } | undefined;
  const where =
    u?.role === "admin"
      ? {}
      : u?.id
        ? { OR: [{ verified: true }, { addedById: u.id }] }
        : { verified: true };
  // NO `updates` here. History is 20 audit rows × every doctor (~4,000 rows
  // at 206 doctors) to power a panel most visitors never open — and it carries
  // editor emails, which have no business in a public payload. The directory
  // lazy-loads one doctor's history from GET /api/doctors/[id] on demand.
  const doctors = await prisma.doctor.findMany({
    where,
    include: {
      dayPlans: { where: { date: istToday(), shared: true }, take: 1 },
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(doctors.map(serializeDoctor));
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
