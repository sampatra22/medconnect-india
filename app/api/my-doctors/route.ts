import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { rolesWith } from "@/lib/roles";
import { serializeMyDoctor } from "@/lib/serialize";
import { guarded } from "@/lib/api";
import { istToday } from "@/lib/ist";

// Phase 3 · MR Tools — the MR's personal doctor list.
// Each entry = a doctor the company assigned to this MR, with a monthly visit
// frequency (core doctors 3×, others 2×, etc.). Sum of frequencies = the MR's
// monthly call target.
const CAN_PLAN = rolesWith("plan_visits");

function istMonth() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).format(new Date()); // "YYYY-MM"
}

// The MR's full list with live doctor info + this month's coverage per doctor.
async function listFor(mrId: string) {
  const [items, visitCounts] = await Promise.all([
    prisma.mrDoctor.findMany({
      where: { mrId },
      include: {
        // Module 4: carry the doctor's shared day plan for MR cross-checking.
        doctor: {
          include: { dayPlans: { where: { date: istToday(), shared: true }, take: 1 } },
        },
        patch: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.visit.groupBy({
      by: ["doctorId"],
      where: { mrId, date: { startsWith: istMonth() } },
      _count: { _all: true },
    }),
  ]);
  const counts = new Map(visitCounts.map((v) => [v.doctorId, v._count._all]));
  return items.map((m) => serializeMyDoctor(m, counts.get(m.doctorId) ?? 0));
}

export const GET = guarded(async () => {
  const { user, response } = await requireUser(CAN_PLAN);
  if (!user) return response;
  return NextResponse.json(await listFor(user.id));
});

// Add a doctor from the directory to my list.
export const POST = guarded(async (request: NextRequest) => {
  const { user, response } = await requireUser(CAN_PLAN);
  if (!user) return response;

  const b = await request.json().catch(() => ({} as Record<string, unknown>));
  const doctorId = (b?.doctor_id ?? "").toString().slice(0, 40);
  if (!doctorId) {
    return NextResponse.json({ error: "doctor_id is required." }, { status: 400 });
  }

  const frequency = Number(b?.frequency ?? 2);
  if (!Number.isInteger(frequency) || frequency < 1 || frequency > 4) {
    return NextResponse.json({ error: "Frequency must be 1–4 visits per month." }, { status: 400 });
  }

  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor) {
    return NextResponse.json({ error: "Doctor not found." }, { status: 404 });
  }

  const existing = await prisma.mrDoctor.findFirst({ where: { mrId: user.id, doctorId } });
  if (existing) {
    return NextResponse.json({ error: "This doctor is already on your list." }, { status: 409 });
  }

  await prisma.mrDoctor.create({ data: { mrId: user.id, doctorId, frequency } });
  return NextResponse.json(await listFor(user.id), { status: 201 });
});

// Change frequency or move a doctor into / out of a patch.
export const PATCH = guarded(async (request: NextRequest) => {
  const { user, response } = await requireUser(CAN_PLAN);
  if (!user) return response;

  const b = await request.json().catch(() => ({} as Record<string, unknown>));
  const id = (b?.id ?? "").toString().slice(0, 40);
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  // Ownership check: MRs can only touch their own list.
  const item = await prisma.mrDoctor.findFirst({ where: { id, mrId: user.id } });
  if (!item) {
    return NextResponse.json({ error: "Doctor not found on your list." }, { status: 404 });
  }

  const data: { frequency?: number; patchId?: string | null } = {};

  if (b?.frequency !== undefined) {
    const frequency = Number(b.frequency);
    if (!Number.isInteger(frequency) || frequency < 1 || frequency > 4) {
      return NextResponse.json({ error: "Frequency must be 1–4 visits per month." }, { status: 400 });
    }
    data.frequency = frequency;
  }

  if (b?.patch_id !== undefined) {
    const patchId = b.patch_id === null || b.patch_id === "" ? null : String(b.patch_id).slice(0, 40);
    if (patchId) {
      // Ownership check: the patch must belong to this MR too.
      const patch = await prisma.patch.findFirst({ where: { id: patchId, mrId: user.id } });
      if (!patch) return NextResponse.json({ error: "Patch not found." }, { status: 404 });
    }
    data.patchId = patchId;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  await prisma.mrDoctor.update({ where: { id: item.id }, data });
  return NextResponse.json(await listFor(user.id));
});

// Remove a doctor from my list (the directory itself is untouched).
export const DELETE = guarded(async (request: NextRequest) => {
  const { user, response } = await requireUser(CAN_PLAN);
  if (!user) return response;

  const id = (request.nextUrl.searchParams.get("id") || "").slice(0, 40);
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const item = await prisma.mrDoctor.findFirst({ where: { id, mrId: user.id } });
  if (!item) {
    return NextResponse.json({ error: "Doctor not found on your list." }, { status: 404 });
  }

  await prisma.mrDoctor.delete({ where: { id: item.id } });
  return NextResponse.json(await listFor(user.id));
});
