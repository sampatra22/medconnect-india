import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit } from "@/lib/rate-limit";

// Self-service signup always creates a Medical Representative account.
// Other roles (doctor, chemist, company, …) are created by the admin only —
// this is what stops anyone from signing themselves up as admin.
export async function POST(request: Request) {
  try {
    // Abuse guard: max 5 signups per IP per hour.
    if (!rateLimit(`signup:${clientIp(request)}`, 5, 60 * 60 * 1000)) {
      return NextResponse.json(
        { error: "Too many signups from this device. Please try again later." },
        { status: 429 }
      );
    }

    const { name, email, password } = await request.json();
    const cleanName = String(name ?? "").trim().slice(0, 80);
    const cleanEmail = String(email ?? "").toLowerCase().trim().slice(0, 120);
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
    if (pwd.length < 8 || pwd.length > 100) {
      return NextResponse.json(
        { error: "Password must be 8–100 characters." },
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
