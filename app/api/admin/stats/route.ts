import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { guarded } from "@/lib/api";
import { istDay } from "@/lib/ist";

// Admin dashboard data: the last 14 IST days of every counter, plus a couple
// of live totals from the real tables (not the metric counters) so the two
// can be sanity-checked against each other.
export const GET = guarded(async () => {
  const { user, response } = await requireUser(["admin"]);
  if (!user) return response;

  // 14-day window of day-keys, oldest → newest.
  const days: string[] = [];
  for (let i = 13; i >= 0; i--) {
    days.push(istDay(new Date(Date.now() - i * 86400000)));
  }

  const metrics = await prisma.metric.findMany({
    where: { day: { in: days } },
    select: { day: true, event: true, count: true },
  });

  // { event: { day: count } }
  const byEvent: Record<string, Record<string, number>> = {};
  for (const m of metrics) {
    (byEvent[m.event] ??= {})[m.day] = m.count;
  }

  const [totalDoctors, verifiedDoctors, pendingDoctors, mrCount] = await Promise.all([
    prisma.doctor.count(),
    prisma.doctor.count({ where: { verified: true } }),
    prisma.doctor.count({ where: { verified: false } }),
    prisma.user.count({ where: { role: "MEDICAL_REP" } }),
  ]);

  return NextResponse.json({
    days,
    byEvent,
    totals: { totalDoctors, verifiedDoctors, pendingDoctors, mrCount },
  });
});
