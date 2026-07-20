import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { rolesWith } from "@/lib/roles";
import { guarded } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";

// ─────────────────────────────────────────────────────────────────────────────
// PA update link — issue / revoke (approved 2026-07-20).
//
// The field flow this serves: an MR standing in the chamber generates the
// link, hands it to the PA ("bookmark this, tap when OPD opens"), and from
// then on the chamber keeps its own status fresh — no account, no login.
//
// Who may issue: the same people who may set status (central RBAC), with the
// same ownership rule — a doctor only for their own card. Every issue/revoke
// lands in the audit trail. Issuing always ROTATES: the old link dies the
// moment a new one exists, which is the whole revocation story.
// ─────────────────────────────────────────────────────────────────────────────

const CAN_SET_STATUS = rolesWith("set_doctor_status");

async function authorize(id: string) {
  const { user, response } = await requireUser(CAN_SET_STATUS);
  if (!user) return { user: null, doctor: null, response };
  const doctor = await prisma.doctor.findUnique({
    where: { id },
    select: { id: true, name: true, userId: true, statusKey: true },
  });
  if (!doctor) {
    return {
      user: null,
      doctor: null,
      response: NextResponse.json({ error: "Doctor not found." }, { status: 404 }),
    };
  }
  // Same ownership rule as the status route.
  if (user.role === "doctor" && doctor.userId !== user.id) {
    return {
      user: null,
      doctor: null,
      response: NextResponse.json(
        { error: "You can only manage your own update link." },
        { status: 403 }
      ),
    };
  }
  return { user, doctor, response: null };
}

export const POST = guarded(async (
  _request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const { id } = await context.params;
  const { user, doctor, response } = await authorize(id);
  if (!user || !doctor) return response!;

  if (!rateLimit(`pakey:${user.id}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Too many link requests. Please slow down." },
      { status: 429 }
    );
  }

  // 24 random bytes → 32 URL-safe chars. Unguessable; the URL is the secret.
  const key = randomBytes(24).toString("base64url");

  await prisma.doctor.update({
    where: { id },
    data: {
      statusKey: key,
      statusKeyIssuedAt: new Date(),
      updates: {
        create: {
          userId: user.id,
          userName: user.name ?? null,
          userEmail: user.email ?? null,
          role: user.role,
          changes: {
            pa_link: { from: doctor.statusKey ? "active" : "none", to: "issued" },
          },
        },
      },
    },
  });

  // Path only — the client composes the absolute URL from its own origin,
  // same pattern the status board uses for its share link.
  return NextResponse.json({ path: `/update/${key}`, rotated: !!doctor.statusKey });
});

export const DELETE = guarded(async (
  _request: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const { id } = await context.params;
  const { user, doctor, response } = await authorize(id);
  if (!user || !doctor) return response!;

  if (!doctor.statusKey) {
    return NextResponse.json({ ok: true }); // nothing to revoke
  }

  await prisma.doctor.update({
    where: { id },
    data: {
      statusKey: null,
      statusKeyIssuedAt: null,
      updates: {
        create: {
          userId: user.id,
          userName: user.name ?? null,
          userEmail: user.email ?? null,
          role: user.role,
          changes: { pa_link: { from: "active", to: "revoked" } },
        },
      },
    },
  });
  return NextResponse.json({ ok: true });
});
