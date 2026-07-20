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
import { doctorShareMessage } from "@/lib/doctor-share";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

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
  // Consent to be listed — visible to signed-in staff, gates admin approval.
  consent_given?: boolean | null;
  consent_by_name?: string | null;
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

// ── The number that answers ─────────────────────────────────────────────────
// A status is only half the answer; the other half is a call that connects.
// The secretary/chamber desk is the number that actually picks up during OPD —
// the doctor's own mobile usually doesn't. Prefer the desk, fall back to the
// doctor, render nothing when there is no number (phone data is sensitive:
// no number listed means the doctor wants none shown).
function callTarget(d: Doctor): { number: string; via: string } | null {
  const sec = (d.secretary_contact ?? "").trim();
  if (sec) return { number: sec, via: "chamber desk" };
  const own = (d.phone ?? "").trim();
  if (own) return { number: own, via: "doctor's number" };
  return null;
}

// "+91-98765 43210" → "tel:+919876543210"
function telHref(raw: string): string {
  return `tel:${raw.replace(/[^+\d]/g, "")}`;
}

// One doctor → one WhatsApp message (lib/doctor-share.ts owns the format and
// its trust rules). Used by anyone: MRs forwarding to local groups, PAs, or a
// patient sending it to family.
function shareHref(d: Doctor): string {
  const f = statusFreshness(d.status, d.status_updated_at, d.status_updated_by_role);
  const msg = doctorShareMessage({
    name: d.name,
    specialty: d.specialty,
    status: d.status,
    isLive: f.isLive,
    confidence: f.confidence,
    patientsLeft: d.patients_left,
    patientsSource: d.patients_source,
    todayHours: d.timetable?.[istDayKey()] ?? null,
    place: d.hospital,
    number: callTarget(d)?.number ?? null,
    link: `${typeof window !== "undefined" ? window.location.origin : ""}/doctors?q=${encodeURIComponent(d.name)}`,
  });
  return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}

export default function DoctorsPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // Search hits the server now — debounced so we query once per pause in
  // typing, not once per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [city, setCity] = useState("all");
  const [specialty, setSpecialty] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  // Server-side paging: the page holds only what has been loaded so far.
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  // Filter options come from the server (page 1), covering ALL doctors —
  // deriving them from loaded pages would shrink the dropdowns to one slice.
  const [cities, setCities] = useState<string[]>([]);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [updatingId, setUpdatingId] = useState<Doctor["id"] | null>(null);
  const [historyOpenId, setHistoryOpenId] = useState<Doctor["id"] | null>(null);
  // Lazy-loaded audit history. The list payload no longer carries history for
  // all 206 doctors — one card's history is fetched the first time its panel
  // opens, then kept for the session.
  const [historyById, setHistoryById] = useState<Record<string, HistoryEntry[]>>({});
  const [historyLoadingId, setHistoryLoadingId] = useState<Doctor["id"] | null>(null);
  const [ttOpenId, setTtOpenId] = useState<Doctor["id"] | null>(null);

  const { data: session } = useSession();
  const user = (session?.user as User | undefined) ?? null;

  const canUpdateStatus = !!user && CAN_STATUS.includes(user.role);
  const canUpdatePatients = !!user && CAN_PATIENTS.includes(user.role);
  // Module 4 spec: a doctor edits only their OWN card; MRs/clinic staff/admin any.
  const canEditCard = (d: Doctor) =>
    canUpdateStatus &&
    (user!.role !== "doctor" || (d.user_id ?? null) === String(user!.id));

  type DoctorsResponse = {
    doctors: Doctor[];
    total: number;
    page: number;
    per: number;
    has_more: boolean;
    cities?: string[];
    specialties?: string[];
  };

  async function fetchPage(p: number): Promise<DoctorsResponse | null> {
    const sp = new URLSearchParams();
    if (debouncedSearch.trim()) sp.set("q", debouncedSearch.trim());
    if (city !== "all") sp.set("city", city);
    if (specialty !== "all") sp.set("specialty", specialty);
    if (statusFilter !== "all") sp.set("status", statusFilter);
    sp.set("page", String(p));
    const res = await fetch(`/api/doctors?${sp.toString()}`);
    if (!res.ok) return null;
    return (await res.json()) as DoctorsResponse;
  }

  async function loadFirstPage() {
    setLoading(true);
    const data = await fetchPage(1);
    if (data) {
      setDoctors(data.doctors);
      setPage(1);
      setHasMore(data.has_more);
      setTotal(data.total);
      if (data.cities) setCities(data.cities);
      if (data.specialties) setSpecialties(data.specialties);
    }
    setLoading(false);
  }

  async function loadMore() {
    setLoadingMore(true);
    const data = await fetchPage(page + 1);
    if (data) {
      setDoctors((prev) => [...prev, ...data.doctors]);
      setPage(data.page);
      setHasMore(data.has_more);
      setTotal(data.total);
    }
    setLoadingMore(false);
  }

  useEffect(() => {
    // Homepage search lands here as /doctors?q=… — pre-fill the search box.
    // Read on mount (not useSearchParams) to avoid a Suspense boundary.
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) {
      setSearch(q);
      setDebouncedSearch(q); // skip the debounce delay on a deep link
    }
  }, []);

  // One keystroke pause = one server query.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Any filter change restarts from page 1. Also runs on mount (initial load).
  useEffect(() => {
    void loadFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, city, specialty, statusFilter]);

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

  // Open/close one card's audit panel; fetch its history on first open.
  // A doctor object freshly returned by a status/verify edit already carries
  // updateHistory — in that case there is nothing to fetch.
  async function toggleHistory(d: Doctor) {
    if (historyOpenId === d.id) {
      setHistoryOpenId(null);
      return;
    }
    setHistoryOpenId(d.id);
    if (d.updateHistory || historyById[d.id]) return; // already known
    setHistoryLoadingId(d.id);
    const res = await fetch(`/api/doctors/${d.id}`);
    if (res.ok) {
      const { doctor } = (await res.json()) as { doctor?: Doctor };
      setHistoryById((prev) => ({ ...prev, [d.id]: doctor?.updateHistory ?? [] }));
    }
    setHistoryLoadingId(null);
  }

  // PA update link: create (or rotate) this doctor's no-login status link and
  // put it on the clipboard, ready to hand to the chamber. Rotation is the
  // revocation mechanism — a new link kills the old one instantly.
  async function copyPaLink(d: Doctor) {
    if (
      !confirm(
        `Create a PA update link for ${d.name}?\n\nAnyone holding the link can set this doctor's live status (nothing else). Creating a new link disables any older one.`
      )
    )
      return;
    const res = await fetch(`/api/doctors/${d.id}/status-key`, { method: "POST" });
    if (!res.ok) {
      const e = (await res.json().catch(() => ({}))) as { error?: string };
      alert(e.error || "Could not create the link.");
      return;
    }
    const { path } = (await res.json()) as { path: string };
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      alert(`PA link copied — paste it to the chamber's WhatsApp:\n\n${url}`);
    } catch {
      alert(`PA link (copy it manually):\n\n${url}`);
    }
  }

  // Module 6: admin approves an MR-added profile -> visible to everyone.
  async function verifyDoctor(d: Doctor, confirmConsent = false) {
    if (!user || user.role !== "admin") return;
    setUpdatingId(d.id);
    const res = await fetch(`/api/doctors/${d.id}/verify`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(confirmConsent ? { confirm_consent: true } : {}),
    });
    if (res.ok) {
      const { doctor } = await res.json();
      setDoctors((prev) => prev.map((x) => (x.id === doctor.id ? doctor : x)));
    } else {
      const e = (await res.json().catch(() => ({}))) as {
        error?: string;
        needs_consent?: boolean;
      };
      // Profiles predating the consent rule (or entered without it) stop here.
      // The admin can still approve, but must vouch explicitly — and that
      // vouching is recorded against their name in the audit trail.
      if (e.needs_consent) {
        setUpdatingId(null);
        if (
          confirm(
            `${d.name} has no recorded consent.\n\nMaking this public publishes their name, chamber and phone number. Only continue if you know the doctor agreed — this confirmation is recorded under your name.\n\nApprove anyway?`
          )
        ) {
          await verifyDoctor(d, true);
        }
        return;
      }
      alert(e.error || "Could not verify.");
    }
    setUpdatingId(null);
  }

  // Search, filters and the "available NOW" trust rule are applied by the
  // server (GET /api/doctors) — the browser never holds more than it shows.

  // Module 4 incentive, delivered: doctors who shared today's plan rank first.
  // Sharing → top of the directory → more patient walk-ins. (Stable sort keeps
  // the original order within each group; applies to the pages loaded so far.)
  const sharesToday = (d: Doctor) =>
    d.today_plan && (d.today_plan.items.length > 0 || d.today_plan.started_at) ? 1 : 0;
  const ranked = [...doctors].sort((a, b) => sharesToday(b) - sharesToday(a));

  return (
    <div className="min-h-screen bg-blue-50 flex flex-col">
      <SiteHeader />
      <div className="max-w-6xl mx-auto w-full px-4 py-8 flex-1">
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
            onClick={() => void loadFirstPage()}
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
        ) : doctors.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-500">
            No doctors match these filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ranked.map((d) => {
              const todayHours = d.timetable?.[istDayKey()] ?? null;
              // History if we have it: a post-edit response carries the newest
              // copy on the doctor itself; otherwise the lazy-loaded cache.
              const knownHistory = d.updateHistory ?? historyById[d.id];
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
                      {/* Consent state — the admin approving needs to see what
                          they are vouching for, before they click. */}
                      {user?.role === "admin" && d.verified === false ? (
                        <p
                          className={`text-[11px] mt-0.5 ${
                            d.consent_given ? "text-emerald-600" : "text-amber-600 font-semibold"
                          }`}
                        >
                          {d.consent_given
                            ? `✓ Consent recorded${d.consent_by_name ? ` — ${d.consent_by_name}` : ""}`
                            : "⚠ No consent recorded"}
                        </p>
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
                        onClick={() => void toggleHistory(d)}
                        className="text-xs text-blue-600 hover:underline mt-0.5"
                      >
                        {historyOpenId === d.id
                          ? "Hide edit history"
                          : `View edit history${
                              knownHistory?.length ? ` (${knownHistory.length})` : ""
                            }`}
                      </button>
                    )}
                  </div>

                  {/* Audit trail: who changed what, so no edit is anonymous */}
                  {user && historyOpenId === d.id && (
                    <div className="mt-2 mb-1 bg-gray-50 rounded-lg p-3 max-h-40 overflow-y-auto">
                      {historyLoadingId === d.id && !knownHistory ? (
                        <p className="text-xs text-gray-400">Loading history…</p>
                      ) : !knownHistory || knownHistory.length === 0 ? (
                        <p className="text-xs text-gray-400">No edits recorded yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {knownHistory.map((entry, idx) => (
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

                  {/* Tap-to-call: the patient's next move after reading the
                      status. Freshness-aware label — when nothing is confirmed
                      today, the honest pitch is "call and check". */}
                  {(() => {
                    const t = callTarget(d);
                    if (!t) return null;
                    const live = statusFreshness(
                      d.status,
                      d.status_updated_at,
                      d.status_updated_by_role
                    ).isLive;
                    return (
                      <a
                        href={telHref(t.number)}
                        className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-700 py-2.5 text-sm font-bold text-white"
                      >
                        📞 {live ? "Call chamber" : "Call to check today's timing"}
                        <span className="font-normal text-emerald-100 text-xs">
                          ({t.via})
                        </span>
                      </a>
                    );
                  })()}
                  <a
                    href={shareHref(d)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 text-center text-xs text-emerald-700 hover:underline"
                  >
                    📤 Share this doctor on WhatsApp
                  </a>

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
                      {/* PA update link: the field move that keeps THIS card
                          fresh daily — MR generates it in the chamber, PA
                          bookmarks it, no account needed. */}
                      <button
                        onClick={() => void copyPaLink(d)}
                        className="mt-3 text-xs text-blue-600 hover:underline"
                      >
                        🔗 PA update link — hand to the chamber
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Paging: fetch the next slice only when someone asks for it. */}
        {!loading && doctors.length > 0 && (
          <div className="mt-6 flex flex-col items-center gap-2">
            <p className="text-xs text-gray-400">
              Showing {doctors.length} of {total} doctors
            </p>
            {hasMore && (
              <button
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 text-sm font-semibold px-6 py-2 rounded-lg transition disabled:opacity-50"
              >
                {loadingMore ? "Loading…" : "Load more doctors"}
              </button>
            )}
          </div>
        )}
      </div>
      {/* Public page: the disclaimer and the doctor-removal path must be
          reachable from wherever a patient actually lands. */}
      <SiteFooter />
    </div>
  );
}
