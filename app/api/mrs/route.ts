import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { rolesWith } from "@/lib/roles";
import { guarded } from "@/lib/api";

// Module 5 · Call MR: name suggestions for the "call an MR" search box.
// Only roles that can request calls may search, and only safe fields leave
// the server (id + name — no emails or phone numbers in a suggestion list).
const CAN_CALL = rolesWith("call_mr");

export const GET = guarded(async (request: NextRequest) => {
  const { user, response } = await requireUser(CAN_CALL);
  if (!user) return response;

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return NextResponse.json([]); // type at least 2 chars

  const mrs = await prisma.user.findMany({
    where: { role: "MEDICAL_REP", name: { contains: q, mode: "insensitive" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 8,
  });
  return NextResponse.json(mrs);
});
