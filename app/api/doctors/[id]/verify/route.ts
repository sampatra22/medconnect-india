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
      select: { id: true, verified: true, consentGiven: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Doctor not found." }, { status: 404 });
    }
    if (existing.verified) {
      return NextResponse.json({ error: "Already verified." }, { status: 409 });
    }

    // The consent gate. Approving is what makes a profile PUBLIC, so it is the
    // right place to enforce it — and it must live on the server, because a
    // hidden button is not a control. Profiles predating the consent rule have
    // NULL and land here too: an admin confirms explicitly (see below), which
    // records who vouched for it and when.
    const body = await _request.json().catch(() => ({} as Record<string, unknown>));
    const confirmingNow = body?.confirm_consent === true;
    if (!existing.consentGiven && !confirmingNow) {
      return NextResponse.json(
        {
          error:
            "This profile has no recorded consent. Confirm the doctor agreed to be listed before making it public.",
          needs_consent: true,
        },
        { status: 409 }
      );
    }

    const doctor = await prisma.doctor.update({
      where: { id },
      data: {
        verified: true,
        // An admin vouching at approval time is itself a consent record.
        ...(existing.consentGiven
          ? {}
          : {
              consentGiven: true,
              consentAt: new Date(),
              consentByName: user.name ?? user.email ?? "Admin",
              consentNote: "confirmed by admin at approval",
            }),
        // Approval is an audited action like any other edit.
        updates: {
          create: {
            userId: user.id,
            userName: user.name ?? null,
            userEmail: user.email ?? null,
            role: user.role,
            changes: {
              verified: { from: false, to: true },
              ...(existing.consentGiven
                ? {}
                : { consent: { from: "not recorded", to: "confirmed by admin" } }),
            },
          },
        },
      },
      include: { updates: { orderBy: { createdAt: "desc" }, take: 20 } },
    });
    return NextResponse.json({ doctor: serializeDoctor(doctor) });
  }
);
