import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { guarded } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";

// ─────────────────────────────────────────────────────────────────────────────
// Change your own password. Any signed-in role — the seeded name123 passwords
// (including the admin's) had no way to be retired before this existed.
//
// Proving knowledge of the CURRENT password is the whole security model here:
// a stolen session alone must not be enough to lock the real owner out by
// setting a new password. "Forgot password" is deliberately NOT built — it
// needs an email channel we don't have yet; until then an admin resets
// accounts by recreating them, which is honest about what we can verify.
// ─────────────────────────────────────────────────────────────────────────────

export const PUT = guarded(async (request: Request) => {
  const { user, response } = await requireUser(); // any signed-in role
  if (!user) return response;

  // Tight window: a password endpoint is a brute-force target even when it
  // requires a session.
  if (!rateLimit(`pwchange:${user.id}`, 5, 15 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a few minutes." },
      { status: 429 }
    );
  }

  const b = (await request.json().catch(() => ({}))) as {
    current_password?: unknown;
    new_password?: unknown;
  };
  const current = String(b.current_password ?? "");
  const next = String(b.new_password ?? "");

  if (next.length < 8) {
    return NextResponse.json(
      { error: "New password must be at least 8 characters." },
      { status: 400 }
    );
  }
  if (next === current) {
    return NextResponse.json(
      { error: "The new password must be different from the current one." },
      { status: 400 }
    );
  }

  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, password: true },
  });
  if (!account || !(await bcrypt.compare(current, account.password))) {
    return NextResponse.json(
      { error: "Current password is incorrect." },
      { status: 403 }
    );
  }

  await prisma.user.update({
    where: { id: account.id },
    data: { password: await bcrypt.hash(next, 10) },
  });

  return NextResponse.json({ ok: true });
});
