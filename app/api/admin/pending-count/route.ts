import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { guarded } from "@/lib/api";

// Badge count for the admin nav. Cheap COUNT, admin-only.
export const GET = guarded(async () => {
  const { user, response } = await requireUser(["admin"]);
  if (!user) return response;
  const pending = await prisma.doctor.count({ where: { verified: false } });
  return NextResponse.json({ pending });
});
