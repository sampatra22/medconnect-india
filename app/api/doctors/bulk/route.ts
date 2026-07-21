import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { rolesWith } from "@/lib/roles";
import { guarded } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";

// ─────────────────────────────────────────────────────────────────────────────
// Bulk doctor import — the parking-lot spec, plain code, no AI.
//
// An MR's company portal exports their doctor list as Excel/CSV; nobody should
// retype 100 rows. The FILE never reaches this server: the browser parses it
// (SheetJS) and sends clean JSON rows here. This endpoint validates each row
// with the same clamps as single-create, re-runs the duplicate guard
// authoritatively, and creates the clean ones.
//
// Two deliberate differences from single-create:
//  · consentGiven stays NULL ("not recorded") — a portal export is not a
//    doctor's agreement. Imports land in the admin approvals queue showing
//    "⚠ No consent recorded"; the MR collects consent on their normal visits.
//  · verified is ALWAYS false, admin or not — nobody bulk-publishes 100
//    unreviewed rows to patients.
// ─────────────────────────────────────────────────────────────────────────────

const CAN_ADD = rolesWith("add_doctor");
const MAX_ROWS = 100; // per request — client loops batches; serverless stays inside its time budget

const clamp = (v: unknown, max = 120) => (v ?? "").toString().trim().slice(0, max);
const normName = (s: string) =>
  s.toLowerCase().replace(/^dr\.?\s*/i, "").replace(/\s+/g, " ").trim();

type RowResult =
  | { row: number; status: "created"; id: string; name: string }
  | { row: number; status: "duplicate"; name: string; existing_name: string }
  | { row: number; status: "invalid"; reason: string };

export const POST = guarded(async (request: Request) => {
  const { user, response } = await requireUser(CAN_ADD);
  if (!user) return response;

  // A whole territory list in one sitting is the happy path; a runaway script
  // is not. 5 batches of 100 per hour = 500 doctors/hour ceiling.
  if (!rateLimit(`bulkdoc:${user.id}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Import limit reached for now. Please try again in an hour." },
      { status: 429 }
    );
  }

  const b = (await request.json().catch(() => ({}))) as { rows?: unknown };
  if (!Array.isArray(b.rows) || b.rows.length === 0) {
    return NextResponse.json({ error: "No rows to import." }, { status: 400 });
  }
  if (b.rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `At most ${MAX_ROWS} rows per batch.` },
      { status: 400 }
    );
  }

  // One read for the whole batch's duplicate guard — not one query per row.
  const existing = await prisma.doctor.findMany({
    select: { name: true, hospital: true },
  });
  const seen = new Set(
    existing.map((d) => `${normName(d.name)}|${d.hospital.toLowerCase().trim()}`)
  );

  const results: RowResult[] = [];

  for (let i = 0; i < b.rows.length; i++) {
    const r = (b.rows[i] ?? {}) as Record<string, unknown>;
    const name = clamp(r.name, 100);
    if (!name || !normName(name)) {
      results.push({ row: i, status: "invalid", reason: "Missing doctor name" });
      continue;
    }
    const hospital = clamp(r.hospital, 120);
    const key = `${normName(name)}|${hospital.toLowerCase().trim()}`;
    if (seen.has(key)) {
      results.push({ row: i, status: "duplicate", name, existing_name: name });
      continue;
    }
    seen.add(key); // also dedupes WITHIN the uploaded file

    const created = await prisma.doctor.create({
      data: {
        name,
        specialty: clamp(r.specialty, 60) || "General",
        qualification: clamp(r.qualification, 100),
        hospital,
        chamberAddress: clamp(r.chamber_address, 200),
        phone: clamp(r.phone, 20),
        secretaryContact: clamp(r.secretary_contact, 20) || null,
        consultationTiming: clamp(r.consultation_timing, 60),
        mrVisitingTime: clamp(r.mr_visiting_time, 60) || null,
        mrVisitingDays: clamp(r.mr_visiting_days, 60) || null,
        languages: clamp(r.languages, 120),
        experience: Number.isFinite(Number(r.experience))
          ? Math.min(70, Math.max(0, Math.trunc(Number(r.experience))))
          : 0,
        status: "available",
        addedById: user.id,
        addedByName: user.name ?? user.email ?? "Unknown",
        addedByRole: user.role,
        verified: false, // bulk NEVER auto-publishes
        // consentGiven deliberately left NULL — see header comment.
        updates: {
          create: {
            userId: user.id,
            userName: user.name ?? null,
            userEmail: user.email ?? null,
            role: user.role,
            changes: { doctor_added: { from: null, to: `${name} (bulk import)` } },
          },
        },
      },
      select: { id: true, name: true },
    });
    results.push({ row: i, status: "created", id: created.id, name: created.name });
  }

  const created = results.filter((x) => x.status === "created").length;
  const duplicates = results.filter((x) => x.status === "duplicate").length;
  const invalid = results.filter((x) => x.status === "invalid").length;
  return NextResponse.json({ created, duplicates, invalid, results });
});
