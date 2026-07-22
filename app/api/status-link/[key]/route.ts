import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guarded } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { statusFreshness, statusHasQueue, timetableFallback } from "@/lib/status-freshness";
import { bumpMetric } from "@/lib/metrics";
import { istDayKey } from "@/lib/ist";

// ─────────────────────────────────────────────────────────────────────────────
// PA update link — the no-login endpoint behind /update/[key].
//
// Possession of the key IS the authorization (approved trade-off): it is a
// 32-char unguessable secret, scoped to ONE doctor, able to touch NOTHING but
// live status + patient count, and dies the moment anyone with real
// permissions rotates or revokes it. Updates attribute as the chamber's own
// word ("clinic_staff") — that is exactly what this link is: the chamber
// speaking for its own doctor, which the trust ladder ranks as verified.
// ─────────────────────────────────────────────────────────────────────────────

const STATUSES = ["available", "busy", "holiday", "no_mr_today", "token_full", "opd_closed"];

function ipOf(request: NextRequest): string {
  return (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
}

// Minimal payload: exactly what the PA page renders, nothing more.
function view(d: {
  name: string;
  specialty: string;
  hospital: string;
  status: string;
  patientsLeft: number | null;
  patientsSource: string | null;
  statusUpdatedAt: Date | null;
  statusUpdatedByRole: string | null;
  statusUpdatedByName: string | null;
  weeklyTimetable: unknown;
  consultationTiming: string;
  phone: string;
  secretaryContact: string | null;
}) {
  const tt = (d.weeklyTimetable ?? null) as Record<string, string> | null;
  return {
    name: d.name,
    specialty: d.specialty,
    hospital: d.hospital,
    status: d.status,
    patients_left: d.patientsLeft,
    patients_source: d.patientsSource,
    status_updated_at: d.statusUpdatedAt ? d.statusUpdatedAt.toISOString() : null,
    // The PA page is unauthenticated → same MR-anonymity rule as the public.
    status_updated_by_name: ["mr", "medical_representative"].includes(d.statusUpdatedByRole ?? "")
      ? null
      : d.statusUpdatedByName,
    freshness: statusFreshness(d.status, d.statusUpdatedAt, d.statusUpdatedByRole),
    today_hours: timetableFallback(tt, istDayKey(), d.consultationTiming),
    // For the PA's share card — the number that answers (desk first). These
    // numbers are public on the directory already; nothing new leaks.
    call_number: (d.secretaryContact ?? "").trim() || (d.phone ?? "").trim() || null,
  };
}

export const GET = guarded(async (
  request: NextRequest,
  context: { params: Promise<{ key: string }> }
) => {
  if (!rateLimit(`palink-read:${ipOf(request)}`, 60, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const { key } = await context.params;
  const doctor = key
    ? await prisma.doctor.findUnique({ where: { statusKey: key } })
    : null;
  if (!doctor) {
    // Same 404 for wrong and revoked keys — nothing to probe.
    return NextResponse.json({ error: "This link is no longer active." }, { status: 404 });
  }
  return NextResponse.json({ doctor: view(doctor) });
});

export const PUT = guarded(async (
  request: NextRequest,
  context: { params: Promise<{ key: string }> }
) => {
  const { key } = await context.params;
  // Two windows: per-key covers a shared chamber phone; per-IP covers scripts.
  if (
    !rateLimit(`palink:${key}`, 30, 10 * 60 * 1000) ||
    !rateLimit(`palink-ip:${ipOf(request)}`, 60, 10 * 60 * 1000)
  ) {
    return NextResponse.json(
      { error: "Too many updates. Please slow down." },
      { status: 429 }
    );
  }

  const doctor = key
    ? await prisma.doctor.findUnique({ where: { statusKey: key } })
    : null;
  if (!doctor) {
    return NextResponse.json({ error: "This link is no longer active." }, { status: 404 });
  }

  const b = await request.json().catch(() => ({} as Record<string, unknown>));
  const changes: Record<string, { from: string | number | null; to: string | number | null }> = {};
  const data: Record<string, unknown> = {};

  if (b.status !== undefined) {
    if (typeof b.status !== "string" || !STATUSES.includes(b.status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    if (b.status !== doctor.status) {
      changes.status = { from: doctor.status, to: b.status };
      data.status = b.status;
    }
  }

  if (b.patients_left !== undefined) {
    const n =
      b.patients_left === null
        ? null
        : Math.min(500, Math.max(0, Math.trunc(Number(b.patients_left))));
    if (n !== null && !Number.isFinite(n)) {
      return NextResponse.json({ error: "Invalid patient count." }, { status: 400 });
    }
    if (n !== doctor.patientsLeft) {
      changes.patients_left = { from: doctor.patientsLeft, to: n };
      data.patientsLeft = n;
      // The chamber's own count — the trusted source, no "~".
      data.patientsSource = "clinic_staff";
    }
  }

  // Same rule as the signed-in route: a queue cannot outlive the sitting.
  // The PA taps "OPD Closed" and the leftover count disappears with it.
  const nextStatus = (data.status as string | undefined) ?? doctor.status;
  if (!statusHasQueue(nextStatus) && doctor.patientsLeft !== null) {
    changes.patients_left = { from: doctor.patientsLeft, to: null };
    data.patientsLeft = null;
    data.patientsSource = null;
  }

  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ doctor: view(doctor) });
  }

  // Atomic guard on the KEY, not the id: if the link is rotated or revoked
  // between our read and this write, count is 0 and the update dies with it.
  const result = await prisma.doctor.updateMany({
    where: { statusKey: key },
    data: {
      ...data,
      statusUpdatedAt: new Date(),
      statusUpdatedById: null,
      statusUpdatedByName: "Chamber staff",
      statusUpdatedByRole: "clinic_staff",
      statusUpdatedByCompany: null,
    },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "This link is no longer active." }, { status: 404 });
  }

  // Audit row (updateMany cannot create relations) — every edit stays named,
  // here by the instrument since there is no account behind it.
  await prisma.doctorUpdate.create({
    data: {
      doctorId: doctor.id,
      userId: null,
      userName: "Chamber staff (PA link)",
      userEmail: null,
      role: "clinic_staff",
      changes,
    },
  });

  const fresh = await prisma.doctor.findUnique({ where: { id: doctor.id } });
  // Chamber-made updates are the supply-side metric that matters most.
  void bumpMetric("pa_status_update");
  return NextResponse.json({ doctor: view(fresh!) });
});
