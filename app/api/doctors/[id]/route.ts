import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { serializeDoctor } from "@/lib/serialize";
import { guarded } from "@/lib/api";
import { istToday } from "@/lib/ist";
import { rolesWith } from "@/lib/roles";
import { rateLimit } from "@/lib/rate-limit";

// Single doctor WITH audit history. Sign-in required on the server, not just
// hidden in the UI: history names editors with their emails, so it is never
// served anonymously. The public list endpoint deliberately omits history —
// the directory calls this lazily when someone opens one card's panel.
export const GET = guarded(async (
  _request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const { user, response } = await requireUser(); // any signed-in role
  if (!user) return response;

  const { id } = await context.params;
  const doctor = await prisma.doctor.findUnique({
    where: { id },
    include: {
      updates: { orderBy: { createdAt: "desc" }, take: 20 },
      dayPlans: { where: { date: istToday(), shared: true }, take: 1 },
    },
  });
  // Same visibility rule as the list: unverified profiles exist only for
  // their creator and admins. Everyone else gets the same 404 as "no such
  // doctor" — no probing which ids exist.
  if (
    !doctor ||
    (!doctor.verified && doctor.addedById !== user.id && user.role !== "admin")
  ) {
    return NextResponse.json({ error: "Doctor not found." }, { status: 404 });
  }
  return NextResponse.json({ doctor: serializeDoctor(doctor) });
});

// Editable profile fields: request key → { column, max length }. Status,
// consent, verification and attribution are deliberately NOT here — each has
// its own guarded route, and a general-purpose editor must never become a
// backdoor into them.
const EDITABLE = {
  name: { col: "name", max: 100 },
  specialty: { col: "specialty", max: 60 },
  qualification: { col: "qualification", max: 100 },
  hospital: { col: "hospital", max: 120 },
  chamber_address: { col: "chamberAddress", max: 200 },
  phone: { col: "phone", max: 20 },
  secretary_contact: { col: "secretaryContact", max: 20 },
  consultation_timing: { col: "consultationTiming", max: 60 },
  mr_visiting_time: { col: "mrVisitingTime", max: 60 },
  mr_visiting_days: { col: "mrVisitingDays", max: 60 },
  languages: { col: "languages", max: 120 },
} as const;

const CAN_EDIT = rolesWith("add_doctor"); // whoever may create may correct

/**
 * Correct a doctor's details. Field data entry produces typos — a wrong phone
 * number is a patient calling a stranger — and until now the only remedy was
 * deleting the profile, which also destroys its visit history and audit trail.
 *
 * Who may edit: an MR may correct a profile THEY added; admins may correct
 * any. Every change is written to the audit trail field by field, so a
 * correction is as accountable as a status update.
 */
export const PATCH = guarded(async (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const { user, response } = await requireUser(CAN_EDIT);
  if (!user) return response;

  if (!rateLimit(`docedit:${user.id}`, 60, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many edits. Please slow down." }, { status: 429 });
  }

  const { id } = await context.params;
  const doctor = await prisma.doctor.findUnique({ where: { id } });
  if (!doctor) {
    return NextResponse.json({ error: "Doctor not found." }, { status: 404 });
  }

  // An MR is accountable for what they entered, not for other people's work.
  if (user.role !== "admin" && doctor.addedById !== user.id) {
    return NextResponse.json(
      { error: "You can only edit doctors you added. Ask an admin to correct this one." },
      { status: 403 }
    );
  }

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  // Prisma's Json input type wants primitives, so from/to are stored as
  // strings or null — the same shape the other audit writers use.
  const changes: Record<string, { from: string | null; to: string | null }> = {};
  const current = doctor as unknown as Record<string, unknown>;

  for (const [key, spec] of Object.entries(EDITABLE)) {
    if (b[key] === undefined) continue;
    const next = String(b[key] ?? "").trim().slice(0, spec.max);
    const prev = (current[spec.col] ?? "") as string;
    if (next === prev) continue;
    if (key === "name" && !next) {
      return NextResponse.json({ error: "A doctor needs a name." }, { status: 400 });
    }
    // Nullable columns store null rather than "" so "no number" stays absent
    // rather than becoming an empty string the UI has to special-case.
    data[spec.col] = next || (["name", "specialty", "phone"].includes(key) ? next : null);
    changes[key] = { from: prev || null, to: next || null };
  }

  // Photo: a small client-downscaled data URL, or null/"" to remove it.
  // Validated by shape and size — this field must never become a blob dump.
  if (b.photo !== undefined) {
    const p = b.photo === null ? "" : String(b.photo);
    if (p === "") {
      if (doctor.photo) {
        data.photo = null;
        changes.photo = { from: "set", to: null };
      }
    } else if (/^data:image\/(jpeg|png|webp);base64,/.test(p) && p.length <= 60_000) {
      if (p !== doctor.photo) {
        data.photo = p;
        changes.photo = { from: doctor.photo ? "set" : null, to: "updated" };
      }
    } else {
      return NextResponse.json(
        { error: "Photo must be a small JPEG/PNG image." },
        { status: 400 }
      );
    }
  }

  // Coordinates ride along with a chosen address (from the map lookup). They
  // are never user-typed, so they're validated as a pair and bounded.
  const lat = Number(b.latitude);
  const lon = Number(b.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    if (lat !== doctor.latitude || lon !== doctor.longitude) {
      data.latitude = lat;
      data.longitude = lon;
      changes.location = { from: doctor.latitude ? "set" : "none", to: "updated" };
    }
  }

  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ doctor: serializeDoctor(doctor) });
  }

  const updated = await prisma.doctor.update({
    where: { id },
    data: {
      ...data,
      updates: {
        create: {
          userId: user.id,
          userName: user.name ?? null,
          userEmail: user.email ?? null,
          role: user.role,
          changes,
        },
      },
    },
    include: { updates: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
  return NextResponse.json({ doctor: serializeDoctor(updated) });
});

// Deleting a doctor wipes their visit history and audit trail (cascade),
// so it is ADMIN-ONLY. MRs manage their own list via /api/my-doctors instead.
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireUser(["admin"]);
  if (!user) return response;

  const { id } = await context.params;
  try {
    // Visits and audit entries cascade-delete with the doctor.
    await prisma.doctor.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "Doctor not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
