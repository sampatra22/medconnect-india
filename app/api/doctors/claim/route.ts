import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { rolesWith } from "@/lib/roles";
import { serializeDoctor } from "@/lib/serialize";
import { istToday } from "@/lib/ist";
import { guarded } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";

// Module 4: a doctor account claims its directory profile — once. After this,
// only that account (or an admin) can edit the profile's timetable & day plan.
const CAN_SHARE = rolesWith("share_day_plan");

export const POST = guarded(async (request: NextRequest) => {
  const { user, response } = await requireUser(CAN_SHARE);
  if (!user) return response;

  // Claiming is personal — admins fix links via DB/admin tools, not by claiming.
  if (user.role !== "doctor") {
    return NextResponse.json(
      { error: "Only doctor accounts can claim a profile." },
      { status: 403 }
    );
  }

  // Abuse guard: claiming is a once-ever action — 5 attempts/hour is plenty.
  if (!rateLimit(`claim:${user.id}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Too many claim attempts. Please try again later." },
      { status: 429 }
    );
  }

  const b = await request.json().catch(() => ({} as Record<string, unknown>));
  const doctorId = (b?.doctor_id ?? "").toString();
  if (!doctorId) {
    return NextResponse.json({ error: "doctor_id is required." }, { status: 400 });
  }

  // One profile per account.
  const already = await prisma.doctor.findUnique({ where: { userId: user.id } });
  if (already) {
    return NextResponse.json(
      { error: `Your account is already linked to ${already.name}.` },
      { status: 409 }
    );
  }

  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor) {
    return NextResponse.json({ error: "Doctor not found." }, { status: 404 });
  }

  // Atomic claim: only succeeds if the profile is STILL unclaimed — two
  // accounts racing for the same profile can't both win.
  const won = await prisma.doctor.updateMany({
    where: { id: doctorId, userId: null },
    data: { userId: user.id },
  });
  if (won.count === 0) {
    return NextResponse.json(
      { error: "This profile is already claimed by another account." },
      { status: 409 }
    );
  }

  // Claiming is audited like every other edit — no anonymous changes.
  const updated = await prisma.doctor.update({
    where: { id: doctorId },
    data: {
      updates: {
        create: {
          userId: user.id,
          userName: user.name ?? null,
          userEmail: user.email ?? null,
          role: user.role,
          changes: { profile_claimed: { from: null, to: user.email ?? user.id } },
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
