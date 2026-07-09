import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const doctorsFile = path.join(process.cwd(), "data", "doctors.json");

const VALID_STATUSES = ["available", "no_mr_today", "opd_closed"];
const ALLOWED_ROLES = ["doctor", "clinic_staff", "mr", "admin"];

const MAX_HISTORY = 30;

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { status, patients_left, role, userId, userName, userEmail } = body;

  // Must be logged in with an allowed role
  if (!role || !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json(
      { error: "You must be logged in as a doctor, clinic staff, MR, or admin to update status." },
      { status: 403 }
    );
  }

  // Every edit must be attributable to a real logged-in account, not just a role.
  if (!userId || !userName) {
    return NextResponse.json(
      { error: "Could not identify your account. Please log in again." },
      { status: 403 }
    );
  }

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status value." }, { status: 400 });
  }

  // Doctors can update status only — not patient counts
  if (role === "doctor" && patients_left !== undefined) {
    return NextResponse.json(
      { error: "Doctors can update status only, not patient counts." },
      { status: 403 }
    );
  }

  const doctors = JSON.parse(fs.readFileSync(doctorsFile, "utf-8"));
  const doctor = doctors.find((d: any) => String(d.id) === String(id));

  if (!doctor) {
    return NextResponse.json({ error: "Doctor not found." }, { status: 404 });
  }

  const changes: Record<string, { from: unknown; to: unknown }> = {};

  if (status !== undefined && status !== doctor.status) {
    changes.status = { from: doctor.status, to: status };
    doctor.status = status;
  }

  if (patients_left !== undefined) {
    const nextValue =
      patients_left === null ? null : Math.max(0, parseInt(patients_left, 10) || 0);
    if (nextValue !== doctor.patients_left) {
      changes.patients_left = { from: doctor.patients_left, to: nextValue };
    }
    doctor.patients_left = nextValue;
    doctor.patients_source =
      patients_left === null ? null : role === "mr" ? "mr_estimate" : "clinic_staff";
  }

  const now = new Date().toISOString();
  const displayRole = role === "mr" ? "medical_representative" : role;

  doctor.status_updated_at = now;
  doctor.status_updated_by_role = displayRole;
  doctor.status_updated_by_name = userName;
  doctor.status_updated_by_id = userId;

  // Only log an audit entry when something actually changed.
  if (Object.keys(changes).length > 0) {
    const entry = {
      timestamp: now,
      user_id: userId,
      user_name: userName,
      user_email: userEmail ?? null,
      role: displayRole,
      changes,
    };
    doctor.updateHistory = [entry, ...(doctor.updateHistory ?? [])].slice(0, MAX_HISTORY);
  }

  fs.writeFileSync(doctorsFile, JSON.stringify(doctors, null, 2));

  return NextResponse.json({ success: true, doctor });
}
