import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const { name, email, password } = await request.json();
    const cleanName = String(name ?? "").trim();
    const cleanEmail = String(email ?? "").toLowerCase().trim();
    const pwd = String(password ?? "");

    if (!cleanName || !cleanEmail || !pwd) {
      return NextResponse.json(
        { error: "Name, email and password are required." },
        { status: 400 }
      );
    }
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (pwd.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    const exists = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (exists) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const user = await prisma.user.create({
      data: {
        name: cleanName,
        email: cleanEmail,
        password: await bcrypt.hash(pwd, 10),
        role: "MEDICAL_REP",
      },
      select: { id: true, name: true, email: true, role: true },
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not create the account." }, { status: 500 });
  }
}
