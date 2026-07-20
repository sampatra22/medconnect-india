import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { rolesWith } from "@/lib/roles";
import { guarded } from "@/lib/api";
import { SPECIALTIES, QUALIFICATIONS } from "@/lib/medical-vocab";

// Data-entry vocabulary: the curated seed lists MERGED with what the directory
// already contains, so the suggestions reflect real local practice (a Kolkata
// area or a specialty an MR added last week shows up for the next MR) instead
// of a list frozen at build time.
//
// Sign-in required and limited to roles that can add doctors — this is an
// internal data-entry aid, not public data.
const CAN_ADD = rolesWith("add_doctor");

export const GET = guarded(async () => {
  const { user, response } = await requireUser(CAN_ADD);
  if (!user) return response;

  const rows = await prisma.doctor.findMany({
    select: { specialty: true, qualification: true, chamberAddress: true, hospital: true },
  });

  const clean = (v: string | null | undefined) => (v ?? "").trim();
  const uniqSorted = (xs: string[]) =>
    [...new Map(xs.filter(Boolean).map((x) => [x.toLowerCase(), x])).values()].sort();

  // Areas: the segment before the city ("Salt Lake, Kolkata" → "Salt Lake"),
  // plus the full address, so an MR can pick either granularity.
  const areas: string[] = [];
  for (const r of rows) {
    const addr = clean(r.chamberAddress);
    if (!addr) continue;
    areas.push(addr);
    const parts = addr.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) areas.push(parts.slice(-2).join(", "));
  }

  return NextResponse.json({
    specialties: uniqSorted([...SPECIALTIES, ...rows.map((r) => clean(r.specialty))]),
    qualifications: uniqSorted([...QUALIFICATIONS, ...rows.map((r) => clean(r.qualification))]),
    addresses: uniqSorted(areas),
    hospitals: uniqSorted(rows.map((r) => clean(r.hospital))),
  });
});
