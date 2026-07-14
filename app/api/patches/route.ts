import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { rolesWith } from "@/lib/roles";
import { serializePatch } from "@/lib/serialize";
import { guarded } from "@/lib/api";

// Phase 3 · MR Tools — call patches.
// A patch is a named group of doctors (usually one area/route) that the MR
// covers together in a day. "Load today" copies a patch into today's plan.
const CAN_PLAN = rolesWith("plan_visits");
const MAX_PATCHES = 40; // sanity cap per MR

function istToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()); // "YYYY-MM-DD"
}

async function patchesFor(mrId: string) {
  const patches = await prisma.patch.findMany({
    where: { mrId },
    include: { doctors: true },
    orderBy: { createdAt: "asc" },
  });
  return patches.map(serializePatch);
}

export const GET = guarded(async () => {
  const { user, response } = await requireUser(CAN_PLAN);
  if (!user) return response;
  return NextResponse.json(await patchesFor(user.id));
});

// Create a patch.
export const POST = guarded(async (request: NextRequest) => {
  const { user, response } = await requireUser(CAN_PLAN);
  if (!user) return response;

  const b = await request.json().catch(() => ({} as Record<string, unknown>));
  const name = (b?.name ?? "").toString().trim().slice(0, 60);
  if (!name) return NextResponse.json({ error: "Patch name is required." }, { status: 400 });

  const count = await prisma.patch.count({ where: { mrId: user.id } });
  if (count >= MAX_PATCHES) {
    return NextResponse.json({ error: `You can have at most ${MAX_PATCHES} patches.` }, { status: 400 });
  }

  const existing = await prisma.patch.findFirst({ where: { mrId: user.id, name } });
  if (existing) {
    return NextResponse.json({ error: "You already have a patch with this name." }, { status: 409 });
  }

  await prisma.patch.create({ data: { mrId: user.id, name } });
  return NextResponse.json(await patchesFor(user.id), { status: 201 });
});

// Rename a patch, or load its doctors into today's plan.
export const PATCH = guarded(async (request: NextRequest) => {
  const { user, response } = await requireUser(CAN_PLAN);
  if (!user) return response;

  const b = await request.json().catch(() => ({} as Record<string, unknown>));
  const id = (b?.id ?? "").toString().slice(0, 40);
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  // Ownership check.
  const patch = await prisma.patch.findFirst({
    where: { id, mrId: user.id },
    include: { doctors: true },
  });
  if (!patch) return NextResponse.json({ error: "Patch not found." }, { status: 404 });

  // Load every doctor in this patch into today's plan (skips ones already there).
  if ((b?.action ?? "") === "load_today") {
    const date = istToday();
    const [existing, last] = await Promise.all([
      prisma.planItem.findMany({ where: { mrId: user.id, date }, select: { doctorId: true } }),
      prisma.planItem.findFirst({ where: { mrId: user.id, date }, orderBy: { order: "desc" } }),
    ]);
    const already = new Set(existing.map((p) => p.doctorId));
    const toAdd = patch.doctors.filter((d) => !already.has(d.doctorId));

    let order = last?.order ?? 0;
    if (toAdd.length > 0) {
      await prisma.planItem.createMany({
        data: toAdd.map((d) => ({ mrId: user.id, date, doctorId: d.doctorId, order: ++order })),
        skipDuplicates: true, // double-click safe: unique (mrId, date, doctorId)
      });
    }
    return NextResponse.json({ added: toAdd.length, skipped: patch.doctors.length - toAdd.length });
  }

  const name = (b?.name ?? "").toString().trim().slice(0, 60);
  if (!name) return NextResponse.json({ error: "Patch name is required." }, { status: 400 });

  const clash = await prisma.patch.findFirst({ where: { mrId: user.id, name, NOT: { id: patch.id } } });
  if (clash) {
    return NextResponse.json({ error: "You already have a patch with this name." }, { status: 409 });
  }

  await prisma.patch.update({ where: { id: patch.id }, data: { name } });
  return NextResponse.json(await patchesFor(user.id));
});

// Delete a patch — its doctors stay on the MR's list, just unassigned.
export const DELETE = guarded(async (request: NextRequest) => {
  const { user, response } = await requireUser(CAN_PLAN);
  if (!user) return response;

  const id = (request.nextUrl.searchParams.get("id") || "").slice(0, 40);
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const patch = await prisma.patch.findFirst({ where: { id, mrId: user.id } });
  if (!patch) return NextResponse.json({ error: "Patch not found." }, { status: 404 });

  await prisma.patch.delete({ where: { id: patch.id } });
  return NextResponse.json(await patchesFor(user.id));
});
