import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { rolesWith } from "@/lib/roles";
import { serializeDayPlan, type DayPlanItem } from "@/lib/serialize";
import { istToday } from "@/lib/ist";
import { auth } from "@/auth";
import { guarded } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";

// Module 4 · Layer 2: the doctor's day-wise shared plan / to-do list.
// The doctor starts their day and posts the plan ("10–1 OPD", "2–4 rounds",
// "6–9 evening chamber"). Patients & MRs read it publicly, plan their visit,
// and cross-check the live status against it from their side.
const CAN_SHARE = rolesWith("share_day_plan");
const clamp = (v: unknown, max = 120) => (v ?? "").toString().trim().slice(0, max);

function sanitizeItems(raw: unknown): DayPlanItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 20).flatMap((it, i) => {
    const o = (it ?? {}) as Record<string, unknown>;
    const activity = clamp(o.activity, 120);
    if (!activity) return [];
    return [
      {
        id: clamp(o.id, 40) || `item-${Date.now()}-${i}`,
        time: clamp(o.time, 40),
        activity,
        done: o.done === true,
      },
    ];
  });
}

// Public read: anyone can see a doctor's SHARED plan for a date.
// The owning doctor (or admin) also sees it while unshared.
export const GET = guarded(async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => {
  const { id } = await context.params;
  const date = request.nextUrl.searchParams.get("date") || istToday();

  const plan = await prisma.doctorDayPlan.findUnique({
    where: { doctorId_date: { doctorId: id, date } },
    include: { doctor: { select: { userId: true } } },
  });
  if (!plan) return NextResponse.json({ plan: null });

  if (!plan.shared) {
    const session = await auth();
    const u = session?.user as { id?: string; role?: string } | undefined;
    const isOwner = !!u?.id && plan.doctor.userId === u.id;
    if (!isOwner && u?.role !== "admin") return NextResponse.json({ plan: null });
  }
  return NextResponse.json({ plan: serializeDayPlan(plan) });
});

// Write: the doctor's own plan only (or admin). Upserts the day row.
// { items?, shared?, start_day?, date? } — start_day also flips the live
// status to "available", so one tap opens the doctor's whole day.
export const PUT = guarded(async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => {
  const { user, response } = await requireUser(CAN_SHARE);
  if (!user) return response;

  // Generous — ticking items through the day is normal; bot loops are not.
  if (!rateLimit(`dayplan:${user.id}`, 60, 10 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Too many plan updates. Please slow down." },
      { status: 429 }
    );
  }

  const { id } = await context.params;
  const doctor = await prisma.doctor.findUnique({ where: { id } });
  if (!doctor) {
    return NextResponse.json({ error: "Doctor not found." }, { status: 404 });
  }
  if (user.role !== "admin" && doctor.userId !== user.id) {
    return NextResponse.json(
      { error: "You can only share your own day plan." },
      { status: 403 }
    );
  }

  const b = await request.json().catch(() => ({} as Record<string, unknown>));
  const date = clamp(b?.date, 10) || istToday();
  const startDay = b?.start_day === true;

  const existing = await prisma.doctorDayPlan.findUnique({
    where: { doctorId_date: { doctorId: id, date } },
  });

  const items =
    b?.items !== undefined
      ? sanitizeItems(b.items)
      : ((existing?.items ?? []) as DayPlanItem[]);
  const shared = b?.shared !== undefined ? b.shared === true : existing?.shared ?? true;
  const startedAt = startDay ? new Date() : existing?.startedAt ?? null;

  const plan = await prisma.doctorDayPlan.upsert({
    where: { doctorId_date: { doctorId: id, date } },
    create: { doctorId: id, date, items, shared, startedAt },
    update: { items, shared, startedAt },
  });

  // Audit + (on day start) flip live status to available in one action.
  const changes: Record<string, { from: string | null; to: string | null }> = {
    day_plan: {
      from: existing ? `${((existing.items ?? []) as DayPlanItem[]).length} item(s)` : null,
      to: `${items.length} item(s)${shared ? ", shared" : ", private"}`,
    },
  };
  if (startDay) changes.day_started = { from: null, to: date };

  await prisma.doctor.update({
    where: { id },
    data: {
      ...(startDay
        ? {
            status: "available",
            statusUpdatedAt: new Date(),
            statusUpdatedById: user.id,
            statusUpdatedByName: user.name ?? null,
            statusUpdatedByRole: user.role,
          }
        : {}),
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
  });

  return NextResponse.json({ plan: serializeDayPlan(plan) });
});
