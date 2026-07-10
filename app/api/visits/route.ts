import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { serializeVisit } from "@/lib/serialize";

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

const doctorLite = { select: { name: true, specialty: true, hospital: true } };

export async function GET(request: NextRequest) {
  const { user, response } = await requireUser(["mr", "admin"]);
  if (!user) return response;

  const sp = request.nextUrl.searchParams;
  const date = sp.get("date");
  const month = sp.get("month");
  const doctorId = sp.get("doctor_id");

  const where: Prisma.VisitWhereInput = {};
  if (date) where.date = date;
  else if (month) where.date = { startsWith: month };
  if (doctorId) where.doctorId = doctorId;

  const visits = await prisma.visit.findMany({
    where,
    include: { doctor: doctorLite },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(visits.map(serializeVisit));
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser(["mr", "admin"]);
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

  const { date, time } = istNow();

  const already = await prisma.visit.findFirst({
    where: { doctorId, date },
    include: { doctor: doctorLite },
  });
  if (already) {
    return NextResponse.json(
      { error: "This doctor is already marked visited today.", visit: serializeVisit(already) },
      { status: 409 }
    );
  }

  // The MR identity is taken from the session, so visits can't be spoofed.
  const [visit] = await prisma.$transaction([
    prisma.visit.create({
      data: {
        doctorId,
        date,
        time,
        status: "Visit Done",
        notes: (b?.notes ?? "").toString().trim() || null,
        mrId: user.id,
        mrName: user.name ?? null,
        mrEmail: user.email ?? null,
      },
      include: { doctor: doctorLite },
    }),
    prisma.doctor.update({
      where: { id: doctorId },
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
            changes: { status: { from: doctor.status, to: "no_mr_today" } },
          },
        },
      },
    }),
  ]);

  return NextResponse.json(serializeVisit(visit), { status: 201 });
}
