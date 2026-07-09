import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const usersFile = path.join(process.cwd(), "data", "users.json");

// Public-safe profile lookup. Never return the password field.
// Used to verify that a name credited in an audit trail belongs to a
// real, currently-registered account rather than a spoofed/anonymous entry.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const users = JSON.parse(fs.readFileSync(usersFile, "utf-8"));
  const user = users.find((u: any) => String(u.id) === String(id));

  if (!user) {
    return NextResponse.json(
      { verified: false, error: "No account found with this ID." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    verified: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
}
