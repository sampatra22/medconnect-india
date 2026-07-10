import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { ROLE_TO_UI, UI_TO_ROLE } from "@/lib/roles";

// Admin-only user management. Passwords are hashed and never returned.

async function allUsers() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: ROLE_TO_UI[u.role],
    created_at: u.createdAt.toISOString(),
  }));
}

export async function GET() {
  const { user, response } = await requireUser(["admin"]);
  if (!user) return response;
  return NextResponse.json({ users: await allUsers() });
}

export async function POST(req: NextRequest) {
  const { user, response } = await requireUser(["admin"]);
  if (!user) return response;

  const { name, email, password, role } = await req.json();
  const cleanName = String(name ?? "").trim();
  const cleanEmail = String(email ?? "").toLowerCase().trim();
  const pwd = String(password ?? "");

  if (!cleanName || !cleanEmail || !pwd) {
    return NextResponse.json(
      { error: "Name, email and password are required." },
      { status: 400 }
    );
  }
  if (pwd.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  const exists = await prisma.user.findUnique({ where: { email: cleanEmail } });
  if (exists) {
    return NextResponse.json({ error: "Email already exists." }, { status: 409 });
  }

  await prisma.user.create({
    data: {
      name: cleanName,
      email: cleanEmail,
      password: await bcrypt.hash(pwd, 10),
      role: UI_TO_ROLE[String(role ?? "").toLowerCase()] ?? "MEDICAL_REP",
    },
  });
  return NextResponse.json({ users: await allUsers() });
}

export async function DELETE(req: NextRequest) {
  const { user, response } = await requireUser(["admin"]);
  if (!user) return response;

  const { id } = await req.json();
  if (String(id) === user.id) {
    return NextResponse.json(
      { error: "You cannot delete your own account." },
      { status: 400 }
    );
  }
  await prisma.user.delete({ where: { id: String(id) } }).catch(() => null);
  return NextResponse.json({ users: await allUsers() });
}
