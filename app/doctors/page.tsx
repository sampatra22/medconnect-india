"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { EditorProfile } from "@/components/auth/editor-profile";

type HistoryEntry = {
  timestamp: string;
  user_id: string | number;
  user_name: string;
  user_email: string | null;
  role: string;
  changes: Record<string, { from: unknown; to: unknown }>;
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
  languages: string[];
  status: "available" | "no_mr_today" | "opd_closed";
  patients_left: number | null;
  patients_source: "clinic_staff" | "mr_estimate" | null;
  status_updated_at: string | null;
  status_updated_by_role: string | null;
  status_updated_by_name?: string | null;
  status_updated_by_id?: string | number | null;
  updateHistory?: HistoryEntry[];
};

type User = { id: string | number; name: string; email: string; role: string };

const STATUS_CONFIG: Record<
  Doctor["status"],
  { label: string; classes: string; dot: string }
> = {
  available: {
    label: "Available",
    classes: "bg-green-100 text-green-700",
    dot: "bg-green-500",
  },
  no_mr_today: {
    label: "No MR Today",
    classes: "bg-yellow-100 text-yellow-700",
    dot: "bg-yellow-500",
  },
  opd_closed: {
    label: "OPD Closed",
    classes: "bg-red-100 text-red-700",
    dot: "bg-red-500",
  },
};

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
    return value ? STATUS_CONFIG[value as Doctor["status"]]?.label ?? String(value) : "—";
  }
  return value === null || value === undefined ? "—" : String(value);
}

function describeChanges(entry: HistoryEntry): string[] {
  return Object.entries(entry.changes).map(([field, { from, to }]) => {
    const label = field === "status" ? "Status" : "Patients left";
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

export default function DoctorsPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("all");
  const [specialty, setSpecialty] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [updatingId, setUpdatingId] = useState<Doctor["id"] | null>(null);
  const [historyOpenId, setHistoryOpenId] = useState<Doctor["id"] | null>(null);

  const { data: session } = useSession();
  const user = (session?.user as User | undefined) ?? null;

  const canUpdateStatus =
    user && ["mr", "admin", "doctor", "clinic_staff"].includes(user.role);
  const canUpdatePatients = user && ["mr", "admin", "clinic_staff"].includes(user.role);

  async function loadDoctors() {
    setLoading(true);
    const res = await fetch("/api/doctors");
    setDoctors(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    loadDoctors();
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

  const cities = Array.from(new Set(doctors.map(cityOf))).sort();
  const specialties = Array.from(new Set(doctors.map((d) => d.specialty))).sort();

  const filtered = doctors.filter((d) => {
    if (search && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (city !== "all" && cityOf(d) !== city) return false;
    if (specialty !== "all" && d.specialty !== specialty) return false;
    if (statusFilter !== "all" && d.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-blue-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
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
            <option value="available">Available</option>
            <option value="no_mr_today">No MR Today</option>
            <option value="opd_closed">OPD Closed</option>
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
            {filtered.map((d) => {
              const sc = STATUS_CONFIG[d.status];
              const updated = timeAgo(d.status_updated_at);
              return (
                <div key={d.id} className="bg-white rounded-2xl shadow-sm p-5 flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="font-bold text-gray-800">{d.name}</h2>
                      <p className="text-sm text-blue-700 font-medium">{d.specialty}</p>
                      <p className="text-xs text-gray-500">{d.qualification}</p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${sc.classes}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                      {sc.label}
                    </span>
                  </div>

                  {/* Patients left + freshness */}
                  <div className="mt-2 min-h-[20px]">
                    {d.patients_left !== null && (
                      <span className="text-sm text-gray-700 font-medium">
                        {d.patients_source === "mr_estimate"
                          ? `~${d.patients_left} patients left (MR estimate)`
                          : `${d.patients_left} patients left`}
                      </span>
                    )}
                    {updated && (
                      <span className="text-xs text-gray-400 flex items-center gap-1 flex-wrap">
                        <span>{updated}</span>
                        {d.status_updated_by_name && d.status_updated_by_id != null ? (
                          <>
                            <span>by</span>
                            <EditorProfile
                              userId={d.status_updated_by_id}
                              name={d.status_updated_by_name}
                              role={d.status_updated_by_role ?? ""}
                            />
                            <span>({roleLabel(d.status_updated_by_role)})</span>
                          </>
                        ) : d.status_updated_by_role ? (
                          <span>by {roleLabel(d.status_updated_by_role)}</span>
                        ) : null}
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
                    {user && (
                      <p className="font-medium text-gray-700">
                        👜 MR visiting time: {d.mr_visiting_time}
                      </p>
                    )}
                    <p>⭐ {d.rating} · {d.experience} yrs experience</p>
                  </div>

                  {/* Update controls */}
                  {canUpdateStatus && (
                    <div className="mt-4 pt-3 border-t border-gray-100">
                      <p className="text-xs font-semibold text-gray-500 mb-2">
                        Update status
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {(Object.keys(STATUS_CONFIG) as Doctor["status"][]).map((s) => (
                          <button
                            key={s}
                            disabled={updatingId === d.id}
                            onClick={() => updateDoctor(d.id, { status: s })}
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition disabled:opacity-50 ${
                              d.status === s
                                ? `${STATUS_CONFIG[s].classes} border-transparent`
                                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                            }`}
                          >
                            {STATUS_CONFIG[s].label}
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
