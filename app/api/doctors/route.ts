import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { serializeDoctor } from "@/lib/serialize";

// Public directory: anyone can read doctor availability.
export async function GET() {
  const doctors = await prisma.doctor.findMany({
    include: { updates: { orderBy: { createdAt: "desc" }, take: 20 } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(doctors.map(serializeDoctor));
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser(["mr", "admin"]);
  if (!user) return response;

  const b = await request.json().catch(() => ({}));
  const name = (b?.name ?? "").toString().trim();
  if (!name) {
    return NextResponse.json({ error: "Doctor name is required." }, { status: 400 });
  }

  const doctor = await prisma.doctor.create({
    data: {
      name,
      specialty: (b?.specialty ?? "").toString().trim() || "General",
      qualification: (b?.qualification ?? "").toString().trim(),
      hospital: (b?.hospital ?? "").toString().trim(),
      chamberAddress: (b?.chamber_address ?? "").toString().trim(),
      phone: (b?.phone ?? "").toString().trim(),
      consultationTiming: (b?.consultation_timing ?? "").toString().trim(),
      mrVisitingTime: (b?.mr_visiting_time ?? "").toString().trim() || null,
      languages: Array.isArray(b?.languages)
        ? b.languages.join(", ")
        : (b?.languages ?? "").toString(),
      experience: Number.isFinite(Number(b?.experience))
        ? Math.max(0, Math.trunc(Number(b.experience)))
        : 0,
      status: "available",
    },
    include: { updates: true },
  });
  return NextResponse.json(serializeDoctor(doctor), { status: 201 });
}
