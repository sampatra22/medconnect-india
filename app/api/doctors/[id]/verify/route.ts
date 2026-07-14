import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { serializeDoctor } from "@/lib/serialize";
import { guarded } from "@/lib/api";

// Module 6: admin approves an MR-added doctor → profile goes public.
// PUT /api/doctors/[id]/verify
export const PUT = guarded(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const { user, response } = await requireUser(["admin"]);
    if (!user) return response;

    const { id } = await context.params;
    const existing = await prisma.doctor.findUnique({
      where: { id },
      select: { id: true, verified: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Doctor not found." }, { status: 404 });
    }
    if (existing.verified) {
      return NextResponse.json({ error: "Already verified." }, { status: 409 });
    }

    const doctor = await prisma.doctor.update({
      where: { id },
      data: {
        verified: true,
        // Approval is an audited action like any other edit.
        updates: {
          create: {
            userId: user.id,
            userName: user.name ?? null,
            userEmail: user.email ?? null,
            role: user.role,
            changes: { verified: { from: false, to: true } },
          },
        },
      },
      include: { updates: { orderBy: { createdAt: "desc" }, take: 20 } },
    });
    return NextResponse.json({ doctor: serializeDoctor(doctor) });
  }
);
