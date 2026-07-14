import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { rolesWith } from "@/lib/roles";
import { serializeCallRequest } from "@/lib/serialize";
import { guarded } from "@/lib/api";

// Module 5 · Call MR — the receiving MR moves a request through its states.
const CAN_RECEIVE = rolesWith("receive_call_requests");
const STATUSES = ["pending", "seen", "done"];

export const PUT = guarded(async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => {
  const { user, response } = await requireUser(CAN_RECEIVE);
  if (!user) return response;

  const { id } = await context.params;
  const b = await request.json().catch(() => ({} as Record<string, unknown>));
  const status = (b?.status ?? "").toString();
  if (!STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const cr = await prisma.callRequest.findUnique({ where: { id } });
  if (!cr) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }
  // Only the MR it was sent to (or admin) can update it.
  if (user.role !== "admin" && cr.mrId !== user.id) {
    return NextResponse.json(
      { error: "This request was not sent to you." },
      { status: 403 }
    );
  }

  const updated = await prisma.callRequest.update({
    where: { id },
    data: { status },
  });
  return NextResponse.json({ request: serializeCallRequest(updated) });
});
