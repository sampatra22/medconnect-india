import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const usersFile = path.join(process.cwd(), "data", "users.json");

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  const users = JSON.parse(fs.readFileSync(usersFile, "utf-8"));

  const user = users.find(
    (u: any) => u.email === email && u.password === password
  );

  if (!user) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 }
    );
  }

  return NextResponse.json({
    success: true,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}