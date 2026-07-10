import type { Doctor, DoctorUpdate, PlanItem, Visit } from "@prisma/client";

// Keeps the JSON shape the frontend already understands (snake_case).
export function serializeDoctor(d: Doctor & { updates?: DoctorUpdate[] }) {
  return {
    id: d.id,
    name: d.name,
    specialty: d.specialty,
    qualification: d.qualification,
    hospital: d.hospital,
    chamber_address: d.chamberAddress,
    phone: d.phone,
    secretary_contact: d.secretaryContact,
    experience: d.experience,
    rating: d.rating,
    consultation_timing: d.consultationTiming,
    mr_visiting_time: d.mrVisitingTime,
    languages: d.languages
      ? d.languages.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
    status: d.status,
    patients_left: d.patientsLeft,
    patients_source: d.patientsSource,
    status_updated_at: d.statusUpdatedAt ? d.statusUpdatedAt.toISOString() : null,
    status_updated_by_role: d.statusUpdatedByRole,
    status_updated_by_name: d.statusUpdatedByName,
    status_updated_by_id: d.statusUpdatedById,
    updateHistory: (d.updates ?? []).map((u) => ({
      timestamp: u.createdAt.toISOString(),
      user_id: u.userId,
      user_name: u.userName,
      user_email: u.userEmail,
      role: u.role,
      changes: u.changes as Record<string, { from: unknown; to: unknown }>,
    })),
  };
}

export function serializePlanItem(p: PlanItem & { doctor?: Doctor | null }) {
  return {
    id: p.id,
    date: p.date,
    order: p.order,
    planned_time: p.plannedTime,
    status: p.status,
    doctor: p.doctor ? serializeDoctor(p.doctor) : null,
  };
}

type DoctorLite = { name: string; specialty: string; hospital: string } | null;

export function serializeVisit(v: Visit & { doctor?: DoctorLite }) {
  return {
    id: v.id,
    doctor_id: v.doctorId,
    doctor_name: v.doctor?.name ?? "",
    specialty: v.doctor?.specialty ?? "",
    hospital: v.doctor?.hospital ?? "",
    date: v.date,
    time: v.time,
    status: v.status,
    notes: v.notes,
    mr_id: v.mrId,
    mr_name: v.mrName,
    mr_email: v.mrEmail,
    created_at: v.createdAt.toISOString(),
  };
}
