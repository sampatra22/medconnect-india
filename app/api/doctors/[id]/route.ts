import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { serializeDoctor } from "@/lib/serialize";
import { guarded } from "@/lib/api";
import { istToday } from "@/lib/ist";

// Single doctor WITH audit history. Sign-in required on the server, not just
// hidden in the UI: history names editors with their emails, so it is never
// served anonymously. The public list endpoint deliberately omits history —
// the directory calls this lazily when someone opens one card's panel.
export const GET = guarded(async (
  _request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const { user, response } = await requireUser(); // any signed-in role
  if (!user) return response;

  const { id } = await context.params;
  const doctor = await prisma.doctor.findUnique({
    where: { id },
    include: {
      updates: { orderBy: { createdAt: "desc" }, take: 20 },
      dayPlans: { where: { date: istToday(), shared: true }, take: 1 },
    },
  });
  // Same visibility rule as the list: unverified profiles exist only for
  // their creator and admins. Everyone else gets the same 404 as "no such
  // doctor" — no probing which ids exist.
  if (
    !doctor ||
    (!doctor.verified && doctor.addedById !== user.id && user.role !== "admin")
  ) {
    return NextResponse.json({ error: "Doctor not found." }, { status: 404 });
  }
  return NextResponse.json({ doctor: serializeDoctor(doctor) });
});

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
