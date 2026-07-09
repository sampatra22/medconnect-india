import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const usersFile = path.join(process.cwd(), "data", "users.json");

export async function POST(request: Request) {
  try {
    const { name, email, password } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, email and password are required." },
        { status: 400 }
      );
    }

    const users = JSON.parse(fs.readFileSync(usersFile, "utf-8"));

    const exists = users.find(
      (u: any) => u.email.toLowerCase() === email.toLowerCase()
    );
    if (exists) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const newUser = {
      id: Date.now().toString(),
      name,
      email,
      password,
      role: "mr",
    };

    users.push(newUser);
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));

    return NextResponse.json({ success: true, role: "mr" });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}