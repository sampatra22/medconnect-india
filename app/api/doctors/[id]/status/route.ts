import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { serializeDoctor } from "@/lib/serialize";
import { rolesWith } from "@/lib/roles";
import { guarded } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { statusHasQueue } from "@/lib/status-freshness";
import { bumpMetric } from "@/lib/metrics";

const STATUSES = ["available", "busy", "holiday", "no_mr_today", "token_full", "opd_closed"];
// Role lists come from the central config in lib/roles.ts — never hard-code them.
const CAN_SET_STATUS = rolesWith("set_doctor_status");
const CAN_SET_PATIENTS = rolesWith("set_patient_count");

export const PUT = guarded(async (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  // Identity comes from the session — never from the request body.
  const { user, response } = await requireUser(CAN_SET_STATUS);
  if (!user) return response;

  // Abuse guard: an MR updating a full day's beat stays well inside this.
  if (!rateLimit(`status:${user.id}`, 60, 10 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Too many status updates. Please slow down." },
      { status: 429 }
    );
  }

  const { id } = await context.params;
  const b = await request.json().catch(() => ({} as Record<string, unknown>));

  const doctor = await prisma.doctor.findUnique({ where: { id } });
  if (!doctor) {
    return NextResponse.json({ error: "Doctor not found." }, { status: 404 });
  }

  // Module 4 spec: a doctor updates only THEIR OWN live status.
  // MRs and clinic staff report on any doctor; admin can fix anything.
  if (user.role === "doctor" && doctor.userId !== user.id) {
    return NextResponse.json(
      { error: "You can only update your own live status." },
      { status: 403 }
    );
  }

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
    if (!CAN_SET_PATIENTS.includes(user.role)) {
      return NextResponse.json(
        { error: "Only MRs, clinic staff or admins can update patient counts." },
        { status: 403 }
      );
    }
    const n =
      b.patients_left === null ? null : Math.max(0, Math.trunc(Number(b.patients_left)));
    if (n !== null && !Number.isFinite(n)) {
      return NextResponse.json({ error: "Invalid patient count." }, { status: 400 });
    }
    if (n !== doctor.patientsLeft) {
      changes.patients_left = { from: doctor.patientsLeft, to: n };
      data.patientsLeft = n;
      data.patientsSource = user.role === "mr" ? "mr_estimate" : "clinic_staff";
    }
  }

  // A queue cannot outlive the sitting. When the status becomes one that
  // can't have patients waiting (OPD closed, holiday, no MR today), the count
  // is cleared here — at the source — so no screen has to remember to hide it
  // and no WhatsApp message can carry "OPD Closed · 3 patients left".
  const nextStatus = (data.status as string | undefined) ?? doctor.status;
  if (!statusHasQueue(nextStatus) && doctor.patientsLeft !== null) {
    changes.patients_left = { from: doctor.patientsLeft, to: null };
    data.patientsLeft = null;
    data.patientsSource = null;
  }

  if (Object.keys(changes).length === 0) {
    const fresh = await prisma.doctor.findUnique({
      where: { id },
      include: { updates: { orderBy: { createdAt: "desc" }, take: 20 } },
    });
    return NextResponse.json({ doctor: serializeDoctor(fresh!) });
  }

  // Trust attribution: an MR's word carries their company in public
  // ("confirmed by Ramesh, Sun Pharma"). Denormalized here rather than joined
  // at read time so the record stays truthful if the MR later changes company.
  // Fetched only on the real write path — the no-op case above costs nothing.
  const editor = await prisma.user.findUnique({
    where: { id: user.id },
    select: { company: true },
  });

  const updated = await prisma.doctor.update({
    where: { id },
    data: {
      ...data,
      statusUpdatedAt: new Date(),
      statusUpdatedById: user.id,
      statusUpdatedByName: user.name ?? null,
      statusUpdatedByRole: user.role,
      statusUpdatedByCompany: editor?.company ?? null,
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
  // The Phase-1 pulse: how many statuses got confirmed today. Fire-and-forget.
  void bumpMetric("status_update");
  return NextResponse.json({ doctor: serializeDoctor(updated) });
});
