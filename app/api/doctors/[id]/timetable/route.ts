import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { rolesWith } from "@/lib/roles";
import { serializeDoctor } from "@/lib/serialize";
import { istToday } from "@/lib/ist";
import { guarded } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";

// Module 4 · Layer 1: the doctor's recurring weekly timetable.
// Edited by the DOCTOR THEMSELVES only (or admin) — this is the whole point:
// the doctor shares their own hours, everyone else just reads them.
const CAN_SHARE = rolesWith("share_day_plan");
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

const clamp = (v: unknown, max = 120) => (v ?? "").toString().trim().slice(0, max);

export const PUT = guarded(async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => {
  const { user, response } = await requireUser(CAN_SHARE);
  if (!user) return response;

  // Abuse guard: honest editing never needs more than this.
  if (!rateLimit(`timetable:${user.id}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Too many timetable updates. Please slow down." },
      { status: 429 }
    );
  }

  const { id } = await context.params;
  const doctor = await prisma.doctor.findUnique({ where: { id } });
  if (!doctor) {
    return NextResponse.json({ error: "Doctor not found." }, { status: 404 });
  }

  // Ownership: a doctor edits only their own timetable; admin can fix anything.
  if (user.role !== "admin" && doctor.userId !== user.id) {
    return NextResponse.json(
      { error: "You can only edit your own timetable." },
      { status: 403 }
    );
  }

  const b = await request.json().catch(() => ({} as Record<string, unknown>));
  const raw = (b?.timetable ?? {}) as Record<string, unknown>;
  const timetable: Record<string, string> = {};
  for (const day of DAYS) {
    const v = clamp(raw[day]);
    if (v) timetable[day] = v;
  }

  const filledDays = Object.keys(timetable).length;
  const updated = await prisma.doctor.update({
    where: { id },
    data: {
      weeklyTimetable: timetable, // empty object = timetable cleared
      updates: {
        create: {
          userId: user.id,
          userName: user.name ?? null,
          userEmail: user.email ?? null,
          role: user.role,
          changes: {
            timetable: {
              from: doctor.weeklyTimetable ? "previous timetable" : null,
              to: `${filledDays} day(s) set`,
            },
          },
        },
      },
    },
    include: {
      updates: { orderBy: { createdAt: "desc" }, take: 20 },
      dayPlans: { where: { date: istToday() }, take: 1 },
    },
  });
  return NextResponse.json({ doctor: serializeDoctor(updated) });
});
