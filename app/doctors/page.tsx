"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { EditorProfile } from "@/components/auth/editor-profile";
import { rolesWith } from "@/lib/roles";
import {
  DoctorStatusBadge,
  StatusAttribution,
  STATUS_LABEL,
} from "@/components/doctor-status";
import { statusFreshness } from "@/lib/status-freshness";

// Role lists come from the central config in lib/roles.ts — never hard-code them.
const CAN_STATUS = rolesWith("set_doctor_status");
const CAN_PATIENTS = rolesWith("set_patient_count");

type HistoryEntry = {
  timestamp: string;
  user_id: string | number;
  user_name: string;
  user_email: string | null;
  role: string;
  changes: Record<string, { from: unknown; to: unknown }>;
};

type DayPlanItem = { id: string; time: string; activity: string; done: boolean };

type TodayPlan = {
  date: string;
  items: DayPlanItem[];
  shared: boolean;
  started_at: string | null;
  updated_at: string;
};

type Doctor = {
  id: number | string;
  name: string;
  specialty: string;
  qualification: string;
  hospital: string;
  chamber_address: string;
  phone: string;
  secretary_contact: string;
  experience: number;
  rating: number;
  consultation_timing: string;
  mr_visiting_time: string;
  mr_visiting_days?: string | null;
  timetable?: Record<string, string> | null;
  today_plan?: TodayPlan | null;
  languages: string[];
  status: "available" | "busy" | "holiday" | "no_mr_today" | "token_full" | "opd_closed";
  patients_left: number | null;
  patients_source: "clinic_staff" | "mr_estimate" | null;
  status_updated_at: string | null;
  status_updated_by_role: string | null;
  status_updated_by_name?: string | null;
  status_updated_by_company?: string | null;
  status_updated_by_id?: string | number | null;
  updateHistory?: HistoryEntry[];
  // Module 4: account that owns this profile (claim flow) — gates inline editing
  user_id?: string | null;
  // Module 6: attribution + verification state
  verified?: boolean;
  added_by_name?: string | null;
  added_by_role?: string | null;
};

type User = { id: string | number; name: string; email: string; role: string };

// Badge rendering + the trust rules live in components/doctor-status.tsx.
// This page only needs the option list for the filter and the setter buttons.
const STATUS_KEYS: Doctor["status"][] = [
  "available",
  "busy",
  "token_full",
  "no_mr_today",
  "holiday",
  "opd_closed",
];

const ROLE_LABEL: Record<string, string> = {
  medical_representative: "MR",
  mr: "MR",
  doctor: "Doctor",
  clinic_staff: "Clinic Staff",
  admin: "Admin",
};

function roleLabel(role: string | null | undefined): string {
  if (!role) return "";
  return ROLE_LABEL[role] ?? role;
}

function formatValue(field: string, value: unknown): string {
  if (field === "status") {
    return value ? STATUS_LABEL[value as string] ?? String(value) : "—";
  }
  return value === null || value === undefined ? "—" : String(value);
}

const CHANGE_LABEL: Record<string, string> = {
  status: "Status",
  patients_left: "Patients left",
  timetable: "Weekly timetable",
  day_plan: "Day plan",
  day_started: "Day started",
  profile_claimed: "Profile claimed",
  doctor_added: "Doctor added",
  verified: "Verified",
};

function describeChanges(entry: HistoryEntry): string[] {
  return Object.entries(entry.changes).map(([field, { from, to }]) => {
    const label = CHANGE_LABEL[field] ?? field;
    return `${label}: ${formatValue(field, from)} → ${formatValue(field, to)}`;
  });
}

function timeAgo(iso: string | null): string | null {
  if (!iso) return null;
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "Updated just now";
  if (mins < 60) return `Updated ${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `Updated ${hrs} hr${hrs > 1 ? "s" : ""} ago`;
  return `Updated ${Math.round(hrs / 24)} day(s) ago`;
}

function cityOf(d: Doctor): string {
  const parts = d.chamber_address.split(",");
  return parts[parts.length - 1].trim();
}

// ── Module 4: doctor-shared timetable & day plan helpers ──────────────────
const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_SHORT: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

function istDayKey(): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short" })
    .format(new Date())
    .toLowerCase();
}

function istClock(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function DoctorsPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("all");
  const [specialty, setSpecialty] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [updatingId, setUpdatingId] = useState<Doctor["id"] | null>(null);
  const [historyOpenId, setHistoryOpenId] = useState<Doctor["id"] | null>(null);
  const [ttOpenId, setTtOpenId] = useState<Doctor["id"] | null>(null);

  const { data: session } = useSession();
  const user = (session?.user as User | undefined) ?? null;

  const canUpdateStatus = !!user && CAN_STATUS.includes(user.role);
  const canUpdatePatients = !!user && CAN_PATIENTS.includes(user.role);
  // Module 4 spec: a doctor edits only their OWN card; MRs/clinic staff/admin any.
  const canEditCard = (d: Doctor) =>
    canUpdateStatus &&
    (user!.role !== "doctor" || (d.user_id ?? null) === String(user!.id));

  async function loadDoctors() {
    setLoading(true);
    const res = await fetch("/api/doctors");
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) setDoctors(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    // Homepage search lands here as /doctors?q=… — pre-fill the search box.
    // Read on mount (not useSearchParams) to avoid a Suspense boundary.
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setSearch(q);
    // Async wrapper keeps setState out of the effect body (react-hooks/set-state-in-effect).
    void (async () => {
      await loadDoctors();
    })();
  }, []);

  async function updateDoctor(
    id: Doctor["id"],
    changes: { status?: Doctor["status"]; patients_left?: number | null }
  ) {
    if (!user) return;
    setUpdatingId(id);
    const res = await fetch(`/api/doctors/${id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    if (res.ok) {
      const { doctor } = await res.json();
      setDoctors((prev) => prev.map((d) => (d.id === doctor.id ? doctor : d)));
    } else {
      const { error } = await res.json();
      alert(error || "Update failed. Try again.");
    }
    setUpdatingId(null);
  }

  // Module 6: admin approves an MR-added profile -> visible to everyone.
  async function verifyDoctor(d: Doctor) {
    if (!user || user.role !== "admin") return;
    setUpdatingId(d.id);
    const res = await fetch(`/api/doctors/${d.id}/verify`, { method: "PUT" });
    if (res.ok) {
      const { doctor } = await res.json();
      setDoctors((prev) => prev.map((x) => (x.id === doctor.id ? doctor : x)));
    } else {
      const e = (await res.json().catch(() => ({}))) as { error?: string };
      alert(e.error || "Could not verify.");
    }
    setUpdatingId(null);
  }

  const cities = Array.from(new Set(doctors.map(cityOf))).sort();
  const specialties = Array.from(new Set(doctors.map((d) => d.specialty))).sort();

  const filtered = doctors.filter((d) => {
    if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (city !== "all" && cityOf(d) !== city) return false;
    if (specialty !== "all" && d.specialty !== specialty) return false;
    if (statusFilter !== "all") {
      // Filtering by status means "is this true NOW". Matching on the raw
      // field would surface a doctor whose two-day-old status happens to read
      // "available" — exactly the false promise the badge refuses to make.
      const live = statusFreshness(
        d.status,
        d.status_updated_at,
        d.status_updated_by_role
      ).isLive;
      if (!live || d.status !== statusFilter) return false;
    }
    return true;
  });

  // Module 4 incentive, delivered: doctors who shared today's plan rank first.
  // Sharing → top of the directory → more patient walk-ins. (Stable sort keeps
  // the original order within each group.)
  const sharesToday = (d: Doctor) =>
    d.today_plan && (d.today_plan.items.length > 0 || d.today_plan.started_at) ? 1 : 0;
  const ranked = [...filtered].sort((a, b) => sharesToday(b) - sharesToday(a));

  return (
    <div className="min-h-screen bg-blue-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Way back home for public visitors landing from search */}
        <a href="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline mb-4">
          ← MedConnect India
        </a>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-blue-800">
              Doctor Directory
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Check doctor status before you plan your visit.
            </p>
          </div>
          <button
            onClick={loadDoctors}
            className="self-start sm:self-auto bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
          >
            ↻ Refresh Status
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-6 grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input
            type="text"
            placeholder="Search doctor by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="all">All Cities</option>
            {cities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="all">All Specialties</option>
            {specialties.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="all">All Statuses</option>
            {STATUS_KEYS.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]} now</option>
            ))}
          </select>
        </div>

        {/* Login nudge for guests */}
        {!user && (
          <div className="bg-blue-100 text-blue-800 text-sm rounded-xl px-4 py-3 mb-6">
            Log in as an MR to update doctor status and patient counts for your beat.
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl shadow-sm p-5 animate-pulse h-64" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-500">
            No doctors match these filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ranked.map((d) => {
              const todayHours = d.timetable?.[istDayKey()] ?? null;
              return (
                <div key={d.id} className="bg-white rounded-2xl shadow-sm p-5 flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="font-bold text-gray-800 flex items-center gap-1.5">
                        <span>{d.name}</span>
                        {d.verified === false && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">⏳ Pending</span>
                        )}
                      </h2>
                      <p className="text-sm text-blue-700 font-medium">{d.specialty}</p>
                      <p className="text-xs text-gray-500">{d.qualification}</p>
                      {/* Attribution is MR-internal — hide from the public */}
                      {user && d.added_by_name ? (
                        <p className="text-[11px] text-gray-400 mt-0.5">Added by {d.added_by_name} ({roleLabel(d.added_by_role)})</p>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <DoctorStatusBadge doctor={d} />
                      {user?.role === "admin" && d.verified === false && (
                        <button
                          onClick={() => verifyDoctor(d)}
                          disabled={updatingId === d.id}
                          className="text-[11px] font-bold px-2 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          ✓ Approve
                        </button>
                      )}
                      {sharesToday(d) === 1 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 whitespace-nowrap">
                          📋 Shares day plan
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Patients left + freshness */}
                  <div className="mt-2 min-h-[20px]">
                    {/* A queue length is the most perishable fact on the card —
                        it is only shown while the status behind it is still
                        fresh. Yesterday's "3 patients left" is noise. */}
                    {d.patients_left !== null &&
                      statusFreshness(
                        d.status,
                        d.status_updated_at,
                        d.status_updated_by_role
                      ).confidence === "fresh" && (
                        <span className="text-sm text-gray-700 font-medium block">
                          {d.patients_source === "mr_estimate"
                            ? `~${d.patients_left} patients left (MR estimate)`
                            : `${d.patients_left} patients left`}
                        </span>
                      )}
                    {/* Who stands behind this status, and how old it is.
                        An MR is named with their company — that pairing is
                        the accountability, and it renders identically on
                        every surface via the shared component. */}
                    <StatusAttribution doctor={d} className="block" />
                    {/* Signed-in users get the clickable profile of the last
                        editor on top of the plain-text attribution. */}
                    {user && d.status_updated_by_name && d.status_updated_by_id != null && (
                      <span className="text-xs text-gray-400 flex items-center gap-1 flex-wrap">
                        <EditorProfile
                          userId={d.status_updated_by_id}
                          name={d.status_updated_by_name}
                          role={d.status_updated_by_role ?? ""}
                        />
                        <span>({roleLabel(d.status_updated_by_role)})</span>
                      </span>
                    )}
                    {user && (
                      <button
                        onClick={() =>
                          setHistoryOpenId(historyOpenId === d.id ? null : d.id)
                        }
                        className="text-xs text-blue-600 hover:underline mt-0.5"
                      >
                        {historyOpenId === d.id
                          ? "Hide edit history"
                          : `View edit history${
                              d.updateHistory?.length ? ` (${d.updateHistory.length})` : ""
                            }`}
                      </button>
                    )}
                  </div>

                  {/* Audit trail: who changed what, so no edit is anonymous */}
                  {user && historyOpenId === d.id && (
                    <div className="mt-2 mb-1 bg-gray-50 rounded-lg p-3 max-h-40 overflow-y-auto">
                      {!d.updateHistory || d.updateHistory.length === 0 ? (
                        <p className="text-xs text-gray-400">No edits recorded yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {d.updateHistory.map((entry, idx) => (
                            <li key={idx} className="text-xs border-b border-gray-200 last:border-0 pb-2 last:pb-0">
                              <p>
                                <EditorProfile
                                  userId={entry.user_id}
                                  name={entry.user_name}
                                  role={entry.role}
                                />{" "}
                                <span className="font-normal text-gray-400">
                                  ({roleLabel(entry.role)})
                                </span>
                              </p>
                              {entry.user_email && (
                                <p className="text-gray-400">{entry.user_email}</p>
                              )}
                              {describeChanges(entry).map((line, i) => (
                                <p key={i} className="text-gray-600">{line}</p>
                              ))}
                              <p className="text-gray-400">{timeAgo(entry.timestamp)}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  <div className="mt-3 text-sm text-gray-600 space-y-1 flex-1">
                    <p>🏥 {d.hospital}</p>
                    <p>📍 {d.chamber_address}</p>
                    <p>🩺 OPD: {d.consultation_timing}</p>
                    {/* Module 4: today's hours straight from the doctor's own
                        timetable — no expanding needed to answer "when do I go?" */}
                    {todayHours ? (
                      <p className="font-medium text-emerald-700">
                        🗓 Today&apos;s hours: {todayHours}
                      </p>
                    ) : null}
                    {user && (
                      <p className="font-medium text-gray-700">
                        👜 MR visiting time: {[d.mr_visiting_days, d.mr_visiting_time].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    <p>⭐ {d.rating} · {d.experience} yrs experience</p>

                    {/* Module 4: the doctor's own shared plan for today —
                        patients pick their moment, MRs cross-check status. */}
                    {d.today_plan && (d.today_plan.items.length > 0 || d.today_plan.started_at) && (
                      <div className="mt-2 bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                        <p className="text-xs font-bold text-emerald-800 flex items-center justify-between gap-2">
                          <span>📋 Doctor&apos;s plan today</span>
                          {d.today_plan.started_at && (
                            <span className="font-semibold text-emerald-600 whitespace-nowrap">
                              ▶ Started {istClock(d.today_plan.started_at)}
                            </span>
                          )}
                        </p>
                        {d.today_plan.items.length === 0 && (
                          <p className="text-xs text-emerald-900 mt-1">
                            Doctor is in — day started, plan coming up.
                          </p>
                        )}
                        <ul className="mt-1.5 space-y-1">
                          {d.today_plan.items.map((it) => (
                            <li
                              key={it.id}
                              className={`text-xs flex gap-1.5 ${
                                it.done ? "text-gray-400 line-through" : "text-emerald-900"
                              }`}
                            >
                              <span className="flex-none">{it.done ? "✅" : "⏳"}</span>
                              {it.time && (
                                <span className="font-semibold whitespace-nowrap">{it.time}</span>
                              )}
                              <span className="min-w-0">{it.activity}</span>
                            </li>
                          ))}
                        </ul>
                        <p className="text-[11px] text-emerald-600 mt-1.5">
                          Shared by the doctor · {timeAgo(d.today_plan.updated_at)?.toLowerCase()}
                        </p>
                      </div>
                    )}

                    {/* Module 4: doctor's recurring weekly timetable */}
                    {d.timetable && Object.keys(d.timetable).length > 0 && (
                      <div className="mt-1">
                        <button
                          onClick={() => setTtOpenId(ttOpenId === d.id ? null : d.id)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {ttOpenId === d.id ? "Hide weekly timetable" : "🗓 View weekly timetable"}
                        </button>
                        {ttOpenId === d.id && (
                          <div className="mt-1.5 bg-blue-50 rounded-xl p-3 space-y-0.5">
                            {DAY_ORDER.map((k) => (
                              <div
                                key={k}
                                className={`text-xs flex gap-2 ${
                                  k === istDayKey()
                                    ? "font-bold text-blue-800"
                                    : "text-gray-600"
                                }`}
                              >
                                <span className="w-9 flex-none">{DAY_SHORT[k]}</span>
                                <span className="min-w-0">{d.timetable?.[k] || "—"}</span>
                                {k === istDayKey() && (
                                  <span className="text-blue-500 flex-none">← today</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Update controls */}
                  {canEditCard(d) && (
                    <div className="mt-4 pt-3 border-t border-gray-100">
                      <p className="text-xs font-semibold text-gray-500 mb-2">
                        Update status
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {STATUS_KEYS.map((s) => (
                          <button
                            key={s}
                            disabled={updatingId === d.id}
                            onClick={() => updateDoctor(d.id, { status: s })}
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition disabled:opacity-50 ${
                              d.status === s
                                ? "bg-blue-600 text-white border-transparent"
                                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                            }`}
                          >
                            {STATUS_LABEL[s]}
                          </button>
                        ))}
                      </div>
                      {canUpdatePatients && (
                        <div className="flex items-center gap-2 mt-3">
                          <span className="text-xs text-gray-500">Patients left:</span>
                          <button
                            disabled={updatingId === d.id}
                            onClick={() =>
                              updateDoctor(d.id, {
                                patients_left: Math.max(0, (d.patients_left ?? 0) - 1),
                              })
                            }
                            className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm disabled:opacity-50"
                          >
                            −
                          </button>
                          <span className="text-sm font-semibold text-gray-800 w-6 text-center">
                            {d.patients_left ?? "—"}
                          </span>
                          <button
                            disabled={updatingId === d.id}
                            onClick={() =>
                              updateDoctor(d.id, {
                                patients_left: (d.patients_left ?? 0) + 1,
                              })
                            }
                            className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm disabled:opacity-50"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
