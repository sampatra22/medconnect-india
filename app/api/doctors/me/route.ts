import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { rolesWith } from "@/lib/roles";
import { serializeDoctor } from "@/lib/serialize";
import { istToday } from "@/lib/ist";
import { guarded } from "@/lib/api";

// Module 4: the signed-in doctor's OWN profile (with today's plan, shared or
// not — it's theirs). If the account isn't linked to a profile yet, return
// the unclaimed profiles so the dashboard can offer the one-tap claim flow.
const CAN_SHARE = rolesWith("share_day_plan");

export const GET = guarded(async () => {
  const { user, response } = await requireUser(CAN_SHARE);
  if (!user) return response;

  const doctor = await prisma.doctor.findUnique({
    where: { userId: user.id },
    include: {
      updates: { orderBy: { createdAt: "desc" }, take: 20 },
      dayPlans: { where: { date: istToday() }, take: 1 },
    },
  });

  if (doctor) {
    return NextResponse.json({ linked: true, doctor: serializeDoctor(doctor) });
  }

  // Not linked yet → offer unclaimed profiles (name/specialty only, no PII dump).
  const unclaimed = await prisma.doctor.findMany({
    where: { userId: null },
    select: { id: true, name: true, specialty: true, hospital: true, chamberAddress: true },
    orderBy: { name: "asc" },
    take: 300,
  });
  return NextResponse.json({ linked: false, doctor: null, unclaimed });
});
