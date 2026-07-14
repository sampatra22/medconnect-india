import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";

// Deleting a doctor wipes their visit history and audit trail (cascade),
// so it is ADMIN-ONLY. MRs manage their own list via /api/my-doctors instead.
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireUser(["admin"]);
  if (!user) return response;

  const { id } = await context.params;
  try {
    // Visits and audit entries cascade-delete with the doctor.
    await prisma.doctor.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "Doctor not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
