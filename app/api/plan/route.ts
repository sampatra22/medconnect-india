import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { rolesWith } from "@/lib/roles";
import { serializePlanItem } from "@/lib/serialize";

// Who can use the daily planner — from the central role config.
const CAN_PLAN = rolesWith("plan_visits");

function istNow() {
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(now);
  return { date, time };
}

// The MR's plan for a date, in order, with live doctor status attached.
async function planFor(mrId: string, date: string) {
  const items = await prisma.planItem.findMany({
    where: { mrId, date },
    include: { doctor: true },
    orderBy: { order: "asc" },
  });
  return items.map(serializePlanItem);
}

export async function GET(request: NextRequest) {
  const { user, response } = await requireUser(CAN_PLAN);
  if (!user) return response;

  const date = request.nextUrl.searchParams.get("date") || istNow().date;
  return NextResponse.json(await planFor(user.id, date));
}

// Add a doctor to today's plan (appended at the end).
export async function POST(request: NextRequest) {
  const { user, response } = await requireUser(CAN_PLAN);
  if (!user) return response;

  const b = await request.json().catch(() => ({} as Record<string, unknown>));
  const doctorId = (b?.doctor_id ?? "").toString();
  if (!doctorId) {
    return NextResponse.json({ error: "doctor_id is required." }, { status: 400 });
  }

  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor) {
    return NextResponse.json({ error: "Doctor not found." }, { status: 404 });
  }

  const { date } = istNow();
  const existing = await prisma.planItem.findFirst({
    where: { mrId: user.id, date, doctorId },
  });
  if (existing) {
    return NextResponse.json(
      { error: "This doctor is already in today's plan." },
      { status: 409 }
    );
  }

  const last = await prisma.planItem.findFirst({
    where: { mrId: user.id, date },
    orderBy: { order: "desc" },
  });

  await prisma.planItem.create({
    data: {
      mrId: user.id,
      date,
      doctorId,
      order: (last?.order ?? 0) + 1,
      plannedTime: (b?.planned_time ?? "").toString().trim() || null,
    },
  });

  return NextResponse.json(await planFor(user.id, date), { status: 201 });
}

// Rearrange (move up/down), set a planned time, or change item status.
// Marking "done" writes the permanent Visit record and flips the doctor's
// live status — same effect as the Mark Visit button on the Doctors tab.
export async function PATCH(request: NextRequest) {
  const { user, response } = await requireUser(CAN_PLAN);
  if (!user) return response;

  const b = await request.json().catch(() => ({} as Record<string, unknown>));
  const id = (b?.id ?? "").toString();
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  // Ownership check: MRs can only touch their own plan items.
  const item = await prisma.planItem.findFirst({
    where: { id, mrId: user.id },
    include: { doctor: true },
  });
  if (!item) {
    return NextResponse.json({ error: "Plan item not found." }, { status: 404 });
  }

  const action = (b?.action ?? "").toString();
  if (action === "up" || action === "down") {
    const neighbour = await prisma.planItem.findFirst({
      where: {
        mrId: user.id,
        date: item.date,
        order: action === "up" ? { lt: item.order } : { gt: item.order },
      },
      orderBy: { order: action === "up" ? "desc" : "asc" },
    });
    if (neighbour) {
      await prisma.$transaction([
        prisma.planItem.update({ where: { id: item.id }, data: { order: neighbour.order } }),
        prisma.planItem.update({ where: { id: neighbour.id }, data: { order: item.order } }),
      ]);
    }
    return NextResponse.json(await planFor(user.id, item.date));
  }

  if (b?.planned_time !== undefined) {
    await prisma.planItem.update({
      where: { id: item.id },
      data: { plannedTime: (b.planned_time ?? "").toString().trim() || null },
    });
    return NextResponse.json(await planFor(user.id, item.date));
  }

  const status = (b?.status ?? "").toString();
  if (!["planned", "done", "skipped"].includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  if (status === "done") {
    const { date, time } = istNow();
    const alreadyVisited = await prisma.visit.findFirst({
      where: { doctorId: item.doctorId, date },
    });

    // One transaction: permanent Visit record + live doctor status + plan tick.
    await prisma.$transaction([
      ...(alreadyVisited
        ? []
        : [
            prisma.visit.create({
              data: {
                doctorId: item.doctorId,
                date,
                time,
                status: "Visit Done",
                mrId: user.id,
                mrName: user.name ?? null,
                mrEmail: user.email ?? null,
              },
            }),
            prisma.doctor.update({
              where: { id: item.doctorId },
              data: {
                status: "no_mr_today",
                statusUpdatedAt: new Date(),
                statusUpdatedById: user.id,
                statusUpdatedByName: user.name ?? null,
                statusUpdatedByRole: user.role,
                updates: {
                  create: {
                    userId: user.id,
                    userName: user.name ?? null,
                    userEmail: user.email ?? null,
                    role: user.role,
                    changes: { status: { from: item.doctor.status, to: "no_mr_today" } },
                  },
                },
              },
            }),
          ]),
      prisma.planItem.update({ where: { id: item.id }, data: { status: "done" } }),
    ]);
    return NextResponse.json(await planFor(user.id, item.date));
  }

  await prisma.planItem.update({ where: { id: item.id }, data: { status } });
  return NextResponse.json(await planFor(user.id, item.date));
}

// Remove a doctor from the plan.
export async function DELETE(request: NextRequest) {
  const { user, response } = await requireUser(CAN_PLAN);
  if (!user) return response;

  const id = request.nextUrl.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const item = await prisma.planItem.findFirst({ where: { id, mrId: user.id } });
  if (!item) {
    return NextResponse.json({ error: "Plan item not found." }, { status: 404 });
  }

  await prisma.planItem.delete({ where: { id: item.id } });
  return NextResponse.json(await planFor(user.id, item.date));
}
