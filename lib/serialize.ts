import type {
  CallRequest,
  Doctor,
  DoctorDayPlan,
  DoctorUpdate,
  MrDoctor,
  Patch,
  PlanItem,
  Visit,
} from "@prisma/client";
import { statusFreshness } from "@/lib/status-freshness";

// ─── Module 5 · Call MR ─────────────────────────────────────────────────────
export function serializeCallRequest(c: CallRequest) {
  return {
    id: c.id,
    mr_id: c.mrId,
    from_user_id: c.fromUserId,
    from_name: c.fromName,
    from_role: c.fromRole,
    doctor_id: c.doctorId,
    note: c.note,
    status: c.status,
    created_at: c.createdAt.toISOString(),
    updated_at: c.updatedAt.toISOString(),
  };
}

// ─── Module 4 · Doctor's shared day plan ────────────────────────────────────
export type DayPlanItem = { id: string; time: string; activity: string; done: boolean };

export function serializeDayPlan(p: DoctorDayPlan) {
  return {
    id: p.id,
    doctor_id: p.doctorId,
    date: p.date,
    items: (Array.isArray(p.items) ? p.items : []) as DayPlanItem[],
    shared: p.shared,
    started_at: p.startedAt ? p.startedAt.toISOString() : null,
    updated_at: p.updatedAt.toISOString(),
  };
}

// Keeps the JSON shape the frontend already understands (snake_case).
export type SerializeDoctorOpts = {
  /**
   * True when the payload goes to an ANONYMOUS reader (public directory,
   * PA link). An MR's name and company are then withheld from attribution —
   * the public sees "Reported by an MR"; the tier still drives the trust
   * styling. Signed-in users and the audit trail keep the full identity:
   * accountability is to peers and admins, privacy is to the public.
   */
  publicView?: boolean;
};

const MR_ROLES = new Set(["mr", "medical_representative"]);

export function serializeDoctor(
  d: Doctor & { updates?: DoctorUpdate[]; dayPlans?: DoctorDayPlan[] },
  opts: SerializeDoctorOpts = {}
) {
  const hideMr = !!opts.publicView && MR_ROLES.has(d.statusUpdatedByRole ?? "");
  return {
    photo: d.photo ?? null,
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
    mr_visiting_days: d.mrVisitingDays,
    languages: d.languages
      ? d.languages.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
    status: d.status,
    // Chamber coordinates — public by nature (the address is already public);
    // powers the patient's Directions button.
    latitude: d.latitude ?? null,
    longitude: d.longitude ?? null,
    // Module 4: doctor-owned availability layers
    user_id: d.userId ?? null, // account that owns this profile (claim flow)
    // Module 6: who contributed this profile + admin verification state
    verified: d.verified,
    added_by_id: d.addedById ?? null,
    added_by_name: d.addedByName ?? null,
    added_by_role: d.addedByRole ?? null,
    // Consent state — shown to signed-in staff so an admin can see what they
    // are vouching for. The note and who obtained it stay internal; only the
    // boolean shape is exposed here.
    consent_given: d.consentGiven ?? null,
    consent_by_name: d.consentByName ?? null,
    timetable: (d.weeklyTimetable ?? null) as Record<string, string> | null,
    today_plan: d.dayPlans && d.dayPlans[0] ? serializeDayPlan(d.dayPlans[0]) : null,
    patients_left: d.patientsLeft,
    patients_source: d.patientsSource,
    status_updated_at: d.statusUpdatedAt ? d.statusUpdatedAt.toISOString() : null,
    status_updated_by_role: d.statusUpdatedByRole,
    status_updated_by_name: hideMr ? null : d.statusUpdatedByName,
    status_updated_by_id: hideMr ? null : d.statusUpdatedById,
    // Visible to signed-in peers/admins; withheld from the anonymous public
    // (2026-07-22 privacy decision — the public sees "Reported by an MR").
    status_updated_by_company: hideMr ? null : (d.statusUpdatedByCompany ?? null),
    // Module 4 · the trust verdict, computed server-side in ONE place.
    // Shipping this alongside the raw fields means a client can never render a
    // stale status as live by forgetting to apply the rule itself.
    freshness: statusFreshness(d.status, d.statusUpdatedAt, d.statusUpdatedByRole),
    // Present only when the caller explicitly loaded `updates` — single-doctor
    // reads and post-edit responses. The public directory list omits it: 20
    // audit rows per doctor is dead weight at scale, and history carries
    // editor emails, which must never ride along in an anonymous payload.
    ...(d.updates
      ? {
          updateHistory: d.updates.map((u) => ({
            timestamp: u.createdAt.toISOString(),
            user_id: u.userId,
            user_name: u.userName,
            user_email: u.userEmail,
            role: u.role,
            changes: u.changes as Record<string, { from: unknown; to: unknown }>,
          })),
        }
      : {}),
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

// ─── Phase 3 · MR Tools ──────────────────────────────────────────────────────

// One doctor on the MR's personal list, with monthly coverage progress.
export function serializeMyDoctor(
  m: MrDoctor & { doctor?: Doctor | null; patch?: Patch | null },
  visitsThisMonth = 0
) {
  return {
    id: m.id,
    frequency: m.frequency,
    patch_id: m.patchId,
    patch_name: m.patch?.name ?? null,
    visits_this_month: visitsThisMonth,
    doctor: m.doctor ? serializeDoctor(m.doctor) : null,
  };
}

export function serializePatch(p: Patch & { doctors?: MrDoctor[] }) {
  return {
    id: p.id,
    name: p.name,
    doctor_count: p.doctors?.length ?? 0,
  };
}
// (end)
