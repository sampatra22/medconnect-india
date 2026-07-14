import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { rolesWith } from "@/lib/roles";
import { serializeCallRequest } from "@/lib/serialize";
import { guarded } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";

// Module 5 · Call MR — create a request, or list your own side of them.
const CAN_CALL = rolesWith("call_mr");
const CAN_RECEIVE = rolesWith("receive_call_requests");

const clamp = (v: unknown, max = 120) => (v ?? "").toString().trim().slice(0, max);

// GET /api/call-requests            → MR inbox (requests sent TO me)
// GET /api/call-requests?sent=1     → requester view (requests sent BY me)
export const GET = guarded(async (request: NextRequest) => {
  const sent = request.nextUrl.searchParams.get("sent") === "1";

  if (sent) {
    const { user, response } = await requireUser(CAN_CALL);
    if (!user) return response;
    const list = await prisma.callRequest.findMany({
      where: { fromUserId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    // Attach target MR names so the requester sees who each request went to.
    const mrIds = [...new Set(list.map((c) => c.mrId))];
    const mrs = await prisma.user.findMany({
      where: { id: { in: mrIds } },
      select: { id: true, name: true },
    });
    const names = new Map(mrs.map((m) => [m.id, m.name]));
    return NextResponse.json(
      list.map((c) => ({ ...serializeCallRequest(c), mr_name: names.get(c.mrId) ?? "MR" }))
    );
  }

  const { user, response } = await requireUser(CAN_RECEIVE);
  if (!user) return response;
  const list = await prisma.callRequest.findMany({
    where: { mrId: user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return NextResponse.json(list.map(serializeCallRequest));
});

// POST { mr_id, note? } — the notification lands on that MR's dashboard.
export const POST = guarded(async (request: NextRequest) => {
  const { user, response } = await requireUser(CAN_CALL);
  if (!user) return response;

  // Abuse guard: a real person doesn't need to request more than this.
  if (!rateLimit(`callreq:${user.id}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Too many call requests. Please try again later." },
      { status: 429 }
    );
  }

  const b = await request.json().catch(() => ({} as Record<string, unknown>));
  const mrId = clamp(b?.mr_id, 40);
  if (!mrId) {
    return NextResponse.json({ error: "mr_id is required." }, { status: 400 });
  }

  // Target must be a real MR account — never trust the id blindly.
  const mr = await prisma.user.findUnique({
    where: { id: mrId },
    select: { id: true, role: true, name: true },
  });
  if (!mr || mr.role !== "MEDICAL_REP") {
    return NextResponse.json({ error: "MR not found." }, { status: 404 });
  }

  // No duplicate spam: one open request per requester→MR pair.
  const open = await prisma.callRequest.findFirst({
    where: { fromUserId: user.id, mrId, status: { in: ["pending", "seen"] } },
  });
  if (open) {
    return NextResponse.json(
      { error: `You already have an open request to ${mr.name}. They'll call you back.` },
      { status: 409 }
    );
  }

  // If the requester is a linked doctor, attach the profile for context.
  const doctor =
    user.role === "doctor"
      ? await prisma.doctor.findUnique({ where: { userId: user.id }, select: { id: true } })
      : null;

  const created = await prisma.callRequest.create({
    data: {
      mrId,
      fromUserId: user.id,
      fromName: user.name ?? user.email ?? "Unknown",
      fromRole: user.role,
      doctorId: doctor?.id ?? null,
      note: clamp(b?.note, 200) || null,
    },
  });
  return NextResponse.json({ request: serializeCallRequest(created) }, { status: 201 });
});
