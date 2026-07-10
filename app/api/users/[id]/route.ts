import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { ROLE_TO_UI } from "@/lib/roles";

// Profile lookup for audit-trail verification. Signed-in users only.
// Never returns the password field.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  const found = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true },
  });

  if (!found) {
    return NextResponse.json(
      { verified: false, error: "No account found with this ID." },
      { status: 404 }
    );
  }
  return NextResponse.json({
    verified: true,
    user: { ...found, role: ROLE_TO_UI[found.role] },
  });
}
