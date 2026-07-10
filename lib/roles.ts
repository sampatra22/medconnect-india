import type { Role } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// CENTRAL ROLE & PERMISSION CONFIG — the ONLY place roles are defined.
// Adding a role later = one Prisma enum value (+ migration) + one entry below.
// No other file should hard-code role lists; import from here instead.
// Note: Recruiter was deleted — Company absorbs all its functions.
// ─────────────────────────────────────────────────────────────────────────────

export type Permission =
  | "manage_users" // admin-only user management
  | "set_doctor_status" // update a doctor's availability (manual input only)
  | "set_patient_count" // update live patient count (clinic staff = trusted source)
  | "plan_visits" // MR daily planner / visit tracker
  | "call_mr" // direct-contact action (reveal number / phone call)
  | "post_vacancy" // create vacancy listings
  | "view_vacancy"; // browse / check vacancy listings

type RoleConfig = {
  db: Role; // Prisma enum value
  label: string; // shown in UI
  home: string; // landing page after login
  permissions: Permission[];
};

export const ROLE_CONFIG: Record<string, RoleConfig> = {
  admin: {
    db: "ADMIN",
    label: "Admin",
    home: "/admin/users",
    permissions: [
      "manage_users",
      "set_doctor_status",
      "set_patient_count",
      "plan_visits",
      "call_mr",
      "post_vacancy",
      "view_vacancy",
    ],
  },
  mr: {
    db: "MEDICAL_REP",
    label: "Medical Representative",
    home: "/dashboard/mr",
    permissions: ["set_doctor_status", "set_patient_count", "plan_visits", "view_vacancy"],
  },
  doctor: {
    db: "DOCTOR",
    label: "Doctor",
    home: "/dashboard",
    permissions: ["set_doctor_status", "call_mr", "post_vacancy"],
  },
  clinic_staff: {
    db: "CLINIC_STAFF",
    label: "Clinic Staff",
    home: "/dashboard",
    permissions: ["set_doctor_status", "set_patient_count", "view_vacancy"],
  },
  chemist: {
    db: "CHEMIST",
    label: "Chemist",
    home: "/dashboard",
    permissions: ["call_mr", "post_vacancy"],
  },
  stockist: {
    db: "STOCKIST",
    label: "Stockist",
    home: "/dashboard",
    permissions: ["call_mr", "post_vacancy"],
  },
  company: {
    db: "PHARMA_COMPANY",
    label: "Pharma Company",
    home: "/dashboard",
    permissions: ["post_vacancy", "view_vacancy"],
  },
};

// Every UI role string, e.g. for admin dropdowns.
export const ALL_UI_ROLES = Object.keys(ROLE_CONFIG);

// DB enum <-> UI role string used across the app
export const ROLE_TO_UI = Object.fromEntries(
  Object.entries(ROLE_CONFIG).map(([ui, c]) => [c.db, ui])
) as Record<Role, string>;

export const UI_TO_ROLE = Object.fromEntries(
  Object.entries(ROLE_CONFIG).map(([ui, c]) => [ui, c.db])
) as Record<string, Role>;

// All UI roles holding a permission — use this for backend route guards.
export function rolesWith(permission: Permission): string[] {
  return ALL_UI_ROLES.filter((r) => ROLE_CONFIG[r].permissions.includes(permission));
}

// Where a role lands after login.
export function homeFor(role: string): string {
  return ROLE_CONFIG[role]?.home ?? "/dashboard";
}
