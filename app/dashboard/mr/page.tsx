"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession, signOut } from "next-auth/react";

type Doctor = {
  id: number | string;
  name: string;
  specialty?: string;
  qualification?: string;
  hospital?: string;
  chamber_address?: string;
  mr_visiting_time?: string;
  consultation_timing?: string;
  phone?: string;
  secretary_contact?: string;
  languages?: string[];
  experience?: number;
  rating?: number;
  status?: string;
  patients_left?: number | null;
  status_updated_at?: string | null;
  status_updated_by_role?: string | null;
  status_updated_by_name?: string | null;
};

type Visit = {
  id: number | string;
  doctor_id: number | string;
  doctor_name: string;
  specialty?: string;
  hospital?: string;
  date: string;
  time: string;
  created_at?: string;
};

type PlanItem = {
  id: string;
  date: string;
  order: number;
  planned_time?: string | null;
  status: string; // planned | done | skipped
  doctor: Doctor | null;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  available: { label: "Available", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  busy: { label: "Busy", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  holiday: { label: "Holiday", cls: "bg-violet-50 text-violet-700 ring-violet-200" },
  no_mr_today: { label: "No MR Today", cls: "bg-blue-50 text-blue-700 ring-blue-200" },
  token_full: { label: "Token Full", cls: "bg-orange-50 text-orange-700 ring-orange-200" },
  opd_closed: { label: "OPD Closed", cls: "bg-rose-50 text-rose-700 ring-rose-200" },
};
function statusMeta(s?: string) {
  return (s && STATUS[s]) || { label: s || "Unknown", cls: "bg-slate-100 text-slate-600 ring-slate-200" };
}

const ROLE_LABEL: Record<string, string> = {
  doctor: "Doctor",
  clinic_staff: "Clinic Staff",
  mr: "MR",
  admin: "Admin",
};

function istToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function istMonthOf(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).format(d);
}
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const pad = (n: number) => (n < 10 ? "0" + n : "" + n);
const initials = (name: string) => name.replace(/^Dr\.?\s*/i, "").split(/\s+/).slice(0, 2).map((s) => s[0] || "").join("");

function timeAgo(iso?: string | null) {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// "Genuine status" rule: always show how fresh the status is and who set it.
function freshness(d?: Doctor | null) {
  if (!d?.status_updated_at) return "";
  const by = d.status_updated_by_role ? ROLE_LABEL[d.status_updated_by_role] || d.status_updated_by_role : "";
  return `${timeAgo(d.status_updated_at)}${by ? " by " + by : ""}`;
}

function Stat({ label, value, sub, tone }: { label: string; value: number | string; sub: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`mb-2 inline-grid h-9 w-9 place-items-center rounded-xl text-lg ${tone}`}>●</div>
      <div className="text-2xl font-extrabold tracking-tight">{value}</div>
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="text-xs text-slate-400">{sub}</div>
    </div>
  );
}

function StatusBadge({ d, small }: { d?: Doctor | null; small?: boolean }) {
  const sm = statusMeta(d?.status);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-bold ring-1 ${sm.cls} ${small ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"}`}>
      ● {sm.label}
    </span>
  );
}

export default function MrDashboard() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [plan, setPlanItems] = useState<PlanItem[]>([]);
  const [monthVisits, setMonthVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"plan" | "doctors" | "calendar">("plan");
  const [search, setSearch] = useState("");
  const [spec, setSpec] = useState("");
  const [planFilter, setPlanFilter] = useState<"all" | "todo" | "done">("all");
  const [toast, setToast] = useState("");
  const { data: session } = useSession();
  const [mr, setMr] = useState<{ name: string; email: string; id: string | null }>({ name: "", email: "", id: null });
  const [showAdd, setShowAdd] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [detail, setDetail] = useState<Doctor | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [calMonth, setCalMonth] = useState(new Date());
  const [selDate, setSelDate] = useState(istToday());

  const today = istToday();

  useEffect(() => {
    const u = session?.user as { id?: string; name?: string | null; email?: string | null } | undefined;
    if (u) setMr({ name: u.name || "", email: u.email || "", id: u.id ?? null });
  }, [session]);

  async function loadDoctors() {
    const r = await fetch("/api/doctors", { cache: "no-store" });
    setDoctors(await r.json());
  }
  async function loadPlan() {
    const r = await fetch("/api/plan", { cache: "no-store" });
    if (r.ok) setPlanItems(await r.json());
  }
  async function loadMonth(d: Date) {
    const r = await fetch(`/api/visits?month=${istMonthOf(d)}`, { cache: "no-store" });
    setMonthVisits(await r.json());
  }
  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadDoctors(), loadPlan(), loadMonth(new Date())]);
      setLoading(false);
    })();
  }, []);
  useEffect(() => { loadMonth(calMonth); }, [calMonth]);

  function flash(msg: string) { setToast(msg); setTimeout(() => setToast(""), 2400); }
  const visitedToday = (id: number | string) => monthVisits.some((v) => String(v.doctor_id) === String(id) && v.date === today);

  const specialties = useMemo(() => Array.from(new Set(doctors.map((d) => d.specialty).filter(Boolean))) as string[], [doctors]);
  const inPlan = useMemo(() => new Set(plan.map((p) => String(p.doctor?.id))), [plan]);

  const planDone = plan.filter((p) => p.status === "done").length;
  const planPending = plan.length - planDone;

  // ── Plan actions ──────────────────────────────────────────────────────────
  async function planRequest(input: RequestInfo, init?: RequestInit) {
    setBusy(true);
    const res = await fetch(input, init);
    setBusy(false);
    if (res.ok) {
      setPlanItems(await res.json());
      return true;
    }
    const e = await res.json().catch(() => ({} as { error?: string }));
    flash(e.error || "Something went wrong");
    return false;
  }

  async function addToPlan(d: Doctor) {
    const ok = await planRequest("/api/plan", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doctor_id: d.id }),
    });
    if (ok) flash(`＋ ${d.name} added to today's plan`);
  }
  async function move(p: PlanItem, dir: "up" | "down") {
    await planRequest("/api/plan", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, action: dir }),
    });
  }
  async function setPlannedTime(p: PlanItem, value: string) {
    if ((p.planned_time || "") === value.trim()) return;
    await planRequest("/api/plan", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, planned_time: value }),
    });
  }
  async function markPlanDone(p: PlanItem) {
    const ok = await planRequest("/api/plan", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, status: "done" }),
    });
    if (ok) {
      if (p.doctor) {
        setDoctors((prev) => prev.map((x) => (String(x.id) === String(p.doctor!.id) ? { ...x, status: "no_mr_today" } : x)));
      }
      await loadMonth(calMonth);
      flash(`✓ Visit done — ${p.doctor?.name ?? "doctor"}`);
    }
  }
  async function removeFromPlan(p: PlanItem) {
    await planRequest(`/api/plan?id=${encodeURIComponent(p.id)}`, { method: "DELETE" });
  }

  // ── Doctors tab actions (existing) ───────────────────────────────────────
  async function markVisit(d: Doctor) {
    if (visitedToday(d.id)) return;
    const res = await fetch("/api/visits", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doctor_id: d.id }),
    });
    if (res.ok || res.status === 409) {
      setDoctors((prev) => prev.map((x) => (String(x.id) === String(d.id) ? { ...x, status: "no_mr_today" } : x)));
      await Promise.all([loadMonth(calMonth), loadPlan()]);
      flash(`✓ Visit marked for ${d.name}`);
    } else {
      const e = await res.json().catch(() => ({} as { error?: string }));
      flash(e.error || "Could not mark visit");
    }
  }
  async function removeDoctor(d: Doctor) {
    if (!confirm(`Remove ${d.name} from the list?`)) return;
    const res = await fetch(`/api/doctors/${d.id}`, { method: "DELETE" });
    if (res.ok) { await Promise.all([loadDoctors(), loadPlan()]); await loadMonth(calMonth); flash(`${d.name} removed`); }
    else flash("Could not remove doctor");
  }
  async function addDoctor() {
    if (!form.name || !form.name.trim()) { flash("Enter a doctor name"); return; }
    const res = await fetch("/api/doctors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (res.ok) { setShowAdd(false); setForm({}); await loadDoctors(); flash("Doctor added"); }
    else flash("Could not add doctor");
  }

  const filtered = doctors.filter((d) => {
    if (spec && d.specialty !== spec) return false;
    if (planFilter === "todo" && visitedToday(d.id)) return false;
    if (planFilter === "done" && !visitedToday(d.id)) return false;
    if (!search) return true;
    const t = search.toLowerCase();
    return `${d.name} ${d.specialty || ""} ${d.hospital || ""} ${d.chamber_address || ""}`.toLowerCase().includes(t);
  });

  const pickerDoctors = doctors.filter((d) => {
    if (inPlan.has(String(d.id))) return false;
    if (!pickerSearch) return true;
    const t = pickerSearch.toLowerCase();
    return `${d.name} ${d.specialty || ""} ${d.hospital || ""}`.toLowerCase().includes(t);
  });

  const doneToday = monthVisits.filter((v) => v.date === today).length;
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const dayVisits = monthVisits.filter((v) => v.date === selDate).sort((a, b) => ((a.created_at || "") < (b.created_at || "") ? -1 : 1));
  const prettyDate = (ds: string) => { const p = ds.split("-"); return `${DOW[new Date(+p[0], +p[1] - 1, +p[2]).getDay()]}, ${+p[2]} ${MONTHS[+p[1] - 1]} ${p[0]}`; };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-emerald-500 font-bold text-white">✚</div>
          <div className="leading-tight">
            <div className="text-[11px] font-medium text-slate-500">MedConnect India</div>
            <div className="font-bold">MR Dashboard</div>
          </div>
          <div className="flex-1" />
          <div className="text-sm text-slate-600">Hi, <span className="font-semibold text-slate-900">{mr.name || "MR"}</span> 👋</div>
          <button onClick={() => signOut({ callbackUrl: "/login" })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50">Log out</button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16">
        <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Planned Today" value={plan.length} sub="doctors on your plan" tone="bg-blue-50 text-blue-600" />
          <Stat label="Done Today" value={planDone} sub={`${planPending} remaining on plan`} tone="bg-emerald-50 text-emerald-600" />
          <Stat label="Calls Logged Today" value={doneToday} sub="all visits recorded" tone="bg-violet-50 text-violet-600" />
          <Stat label="Visits This Month" value={monthVisits.length} sub={`${MONTHS[m]} ${y}`} tone="bg-amber-50 text-amber-600" />
        </section>

        <div className="mt-5 flex w-max gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <button onClick={() => setTab("plan")} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "plan" ? "bg-blue-600 text-white" : "text-slate-500"}`}>📋 Today&apos;s Plan</button>
          <button onClick={() => setTab("doctors")} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "doctors" ? "bg-blue-600 text-white" : "text-slate-500"}`}>🩺 Doctors</button>
          <button onClick={() => setTab("calendar")} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "calendar" ? "bg-blue-600 text-white" : "text-slate-500"}`}>📅 Visit Calendar</button>
        </div>

        {loading ? (
          <div className="mt-10 text-center text-slate-400">Loading…</div>
        ) : tab === "plan" ? (
          <section className="mt-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div>
                <div className="font-bold">{prettyDate(today)}</div>
                <div className="text-xs text-slate-500">
                  {plan.length === 0 ? "No doctors planned yet." : `${planDone}/${plan.length} visits done · use ↑ ↓ to rearrange your route`}
                </div>
              </div>
              <div className="flex-1" />
              <button onClick={() => { setPickerSearch(""); setShowPicker(true); }} className="h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">＋ Add Doctors</button>
            </div>

            {plan.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
                <div className="mb-2 text-3xl">📋</div>
                <div className="font-bold">Plan your day</div>
                <div className="mx-auto mt-1 max-w-sm text-sm text-slate-500">Pick the doctors you want to visit today, put them in order, and tick them off as you go.</div>
                <button onClick={() => { setPickerSearch(""); setShowPicker(true); }} className="mt-4 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white">＋ Add Doctors</button>
              </div>
            ) : (
              <div className="space-y-2">
                {plan.map((p, i) => {
                  const d = p.doctor;
                  const done = p.status === "done";
                  const fresh = freshness(d);
                  return (
                    <div key={p.id} className={`flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-3 shadow-sm md:flex-nowrap ${done ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200"}`}>
                      <div className="flex flex-none flex-col gap-1">
                        <button disabled={busy || done || i === 0} onClick={() => move(p, "up")} title="Move up"
                          className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-30">▲</button>
                        <button disabled={busy || done || i === plan.length - 1} onClick={() => move(p, "down")} title="Move down"
                          className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-30">▼</button>
                      </div>
                      <div className={`grid h-8 w-8 flex-none place-items-center rounded-full text-sm font-extrabold ${done ? "bg-emerald-600 text-white" : "bg-blue-50 text-blue-700"}`}>
                        {done ? "✓" : i + 1}
                      </div>
                      <div className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 font-bold text-white">{d ? initials(d.name) : "?"}</div>
                      <div className="min-w-0 flex-1">
                        <div className={`truncate font-bold ${done ? "text-slate-400 line-through" : ""}`}>{d?.name ?? "Doctor removed"}</div>
                        <div className="truncate text-xs text-slate-500">{d?.specialty}{d?.hospital ? ` · ${d.hospital}` : ""}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <StatusBadge d={d} small />
                          {typeof d?.patients_left === "number" ? <span className="text-[11px] text-slate-500">👥 {d.patients_left} left</span> : null}
                          {fresh ? <span className="text-[11px] text-slate-400">· {fresh}</span> : null}
                        </div>
                      </div>
                      <div className="flex flex-none items-center gap-2">
                        <input
                          defaultValue={p.planned_time || ""}
                          onBlur={(e) => setPlannedTime(p, e.target.value)}
                          placeholder="🕑 time"
                          disabled={done}
                          className="h-9 w-24 rounded-lg border border-slate-200 px-2 text-center text-xs outline-none focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
                        />
                        <button onClick={() => d && setDetail(d)} className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50">Details</button>
                        <button disabled={busy || done} onClick={() => markPlanDone(p)}
                          className={`h-9 rounded-lg px-3 text-xs font-bold text-white ${done ? "cursor-default bg-emerald-100 !text-emerald-700" : "bg-emerald-600 hover:bg-emerald-700"}`}>
                          {done ? "Done" : "✓ Visit Done"}
                        </button>
                        <button disabled={busy} onClick={() => removeFromPlan(p)} title="Remove from plan"
                          className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500">✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ) : tab === "doctors" ? (
          <section className="mt-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search doctor, specialty, hospital…"
                className="h-11 min-w-[200px] flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-blue-500" />
              <select value={spec} onChange={(e) => setSpec(e.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
                <option value="">All specialties</option>
                {specialties.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value as "all" | "todo" | "done")} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
                <option value="all">All</option>
                <option value="todo">To visit today</option>
                <option value="done">Visited today</option>
              </select>
              <button onClick={() => setShowAdd(true)} className="h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm">＋ Add Doctor</button>
            </div>
            <div className="mb-3 text-xs text-slate-500">Showing {filtered.length} of {doctors.length} doctors</div>

            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-400">No doctors match.</div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {filtered.map((d) => {
                  const done = visitedToday(d.id);
                  const planned = inPlan.has(String(d.id));
                  const fresh = freshness(d);
                  return (
                    <div key={d.id} className={`flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm transition ${done ? "border-emerald-200" : "border-slate-200"}`}>
                      <div className="flex items-start gap-3">
                        <div className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 font-bold text-white">{initials(d.name)}</div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-bold">{d.name}</div>
                          <div className="text-sm font-semibold text-blue-600">{d.specialty}</div>
                          <div className="mt-1 space-y-0.5 text-xs text-slate-500">
                            <div className="truncate">🏥 {d.hospital || "—"}</div>
                            <div className="truncate">📍 {d.chamber_address || "—"}</div>
                            {d.mr_visiting_time ? <div>🕑 MR: {d.mr_visiting_time}</div> : null}
                          </div>
                        </div>
                        <button onClick={() => setDetail(d)} className="flex-none rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Details</button>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <StatusBadge d={d} />
                          {fresh ? <span className="text-[11px] text-slate-400">{fresh}</span> : null}
                        </span>
                        {typeof d.patients_left === "number" ? <span className="text-xs text-slate-500">👥 {d.patients_left} left</span> : null}
                      </div>
                      <div className="flex gap-2">
                        <button disabled={done} onClick={() => markVisit(d)}
                          className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-bold text-white transition ${done ? "cursor-default bg-emerald-100 !text-emerald-700" : "bg-emerald-600 hover:bg-emerald-700"}`}>
                          {done ? "✅ Visited today" : "✓ Mark Visit"}
                        </button>
                        <button disabled={planned || done} onClick={() => addToPlan(d)} title={planned ? "Already in today's plan" : "Add to today's plan"}
                          className={`rounded-xl border px-3 py-2.5 text-sm font-bold ${planned ? "border-blue-100 bg-blue-50 text-blue-400" : "border-blue-200 text-blue-700 hover:bg-blue-50"}`}>
                          {planned ? "In plan" : "＋ Plan"}
                        </button>
                        <button onClick={() => removeDoctor(d)} title="Remove" className="grid w-11 place-items-center rounded-xl border border-slate-200 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500">🗑</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ) : (
          <section className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div className="font-bold">{MONTHS[m]} {y}</div>
                <div className="flex gap-2">
                  <button onClick={() => setCalMonth(new Date(y, m - 1, 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200">‹</button>
                  <button onClick={() => { setCalMonth(new Date()); setSelDate(istToday()); }} className="h-9 rounded-lg border border-slate-200 px-3 text-sm">Today</button>
                  <button onClick={() => setCalMonth(new Date(y, m + 1, 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200">›</button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {DOW.map((d) => <div key={d} className="py-1 text-center text-[10px] font-bold uppercase text-slate-400">{d}</div>)}
                {Array.from({ length: firstDow }).map((_, i) => <div key={"e" + i} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const ds = `${y}-${pad(m + 1)}-${pad(day)}`;
                  const c = monthVisits.filter((v) => v.date === ds).length;
                  const isToday = ds === today, isSel = ds === selDate;
                  return (
                    <button key={ds} onClick={() => setSelDate(ds)}
                      className={`flex aspect-square flex-col rounded-xl border p-1.5 text-left transition ${isSel ? "border-blue-600 bg-blue-600 text-white" : isToday ? "border-blue-400" : "border-slate-200 hover:bg-blue-50"}`}>
                      <span className="text-xs font-semibold">{day}</span>
                      {c > 0 ? <span className={`mt-auto self-start rounded-full px-1.5 py-0.5 text-[9px] font-bold ${isSel ? "bg-white text-blue-600" : "bg-emerald-500 text-white"}`}>{c}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="font-bold">{selDate === today ? "Today · " : ""}{prettyDate(selDate)}</div>
              <div className="mb-3 text-sm text-slate-500">{dayVisits.length ? `${dayVisits.length} call(s) logged` : "No visits logged on this date."}</div>
              <div className="space-y-2">
                {dayVisits.map((v) => (
                  <div key={v.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-gradient-to-br from-blue-500 to-emerald-500 text-xs font-bold text-white">{initials(v.doctor_name)}</div>
                    <div className="min-w-0"><div className="truncate text-sm font-bold">{v.doctor_name}</div><div className="truncate text-xs text-slate-500">{v.specialty} · {v.hospital}</div></div>
                    <div className="ml-auto rounded-lg bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">{v.time}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Add doctors to today's plan */}
      {showPicker ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowPicker(false); }}>
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-1 text-lg font-bold">Add to Today&apos;s Plan</div>
            <div className="mb-3 text-sm text-slate-500">Pick doctors to visit today. Check their live status before you go.</div>
            <input autoFocus value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} placeholder="Search doctor, specialty, hospital…"
              className="mb-3 h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-blue-500" />
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {pickerDoctors.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
                  {doctors.length === 0 ? "No doctors in your list yet — add them on the Doctors tab." : "No doctors match (or they're already planned)."}
                </div>
              ) : pickerDoctors.map((d) => (
                <div key={d.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                  <div className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 text-sm font-bold text-white">{initials(d.name)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{d.name}</div>
                    <div className="truncate text-xs text-slate-500">{d.specialty}{d.hospital ? ` · ${d.hospital}` : ""}</div>
                    <div className="mt-1"><StatusBadge d={d} small /></div>
                  </div>
                  <button disabled={busy} onClick={() => addToPlan(d)} className="flex-none rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">＋ Add</button>
                </div>
              ))}
            </div>
            <button onClick={() => setShowPicker(false)} className="mt-4 w-full rounded-xl border border-slate-200 py-2.5 text-sm font-semibold">Close</button>
          </div>
        </div>
      ) : null}

      {/* Doctor details */}
      {detail ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setDetail(null); }}>
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-emerald-500 text-lg font-bold text-white">{initials(detail.name)}</div>
              <div className="min-w-0 flex-1">
                <div className="text-lg font-bold leading-tight">{detail.name}</div>
                <div className="text-sm font-semibold text-blue-600">{detail.specialty}{detail.qualification ? ` · ${detail.qualification}` : ""}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge d={detail} />
                  {typeof detail.patients_left === "number" ? <span className="text-xs text-slate-500">👥 {detail.patients_left} left</span> : null}
                </div>
                {freshness(detail) ? <div className="mt-1 text-[11px] text-slate-400">Status updated {freshness(detail)}{detail.status_updated_by_name ? ` (${detail.status_updated_by_name})` : ""}</div> : null}
              </div>
            </div>

            <div className="mt-4 space-y-2.5 border-t border-slate-100 pt-4 text-sm">
              {([
                ["🏥 Hospital", detail.hospital],
                ["📍 Chamber", detail.chamber_address],
                ["🩺 Consultation", detail.consultation_timing],
                ["🕑 MR visiting time", detail.mr_visiting_time],
                ["🗣 Languages", (detail.languages || []).join(", ")],
                ["🎓 Experience", detail.experience ? `${detail.experience} years` : ""],
                ["⭐ Rating", detail.rating ? `${detail.rating}/5` : ""],
                ["👤 Secretary", detail.secretary_contact],
              ] as [string, string | undefined][]).filter(([, v]) => v).map(([label, v]) => (
                <div key={label} className="flex gap-2">
                  <div className="w-40 flex-none text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
                  <div className="min-w-0 flex-1 font-medium text-slate-700">{v}</div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex gap-2">
              {detail.phone ? (
                <a href={`tel:${detail.phone}`} className="flex-1 rounded-xl bg-blue-600 py-2.5 text-center text-sm font-bold text-white hover:bg-blue-700">📞 Call {detail.phone}</a>
              ) : null}
              {!inPlan.has(String(detail.id)) ? (
                <button disabled={busy} onClick={async () => { await addToPlan(detail); }} className="flex-1 rounded-xl border border-blue-200 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-50">＋ Add to Plan</button>
              ) : null}
              <button onClick={() => setDetail(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Close</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Add a new doctor to the directory */}
      {showAdd ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowAdd(false); }}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-1 text-lg font-bold">Add Doctor</div>
            <div className="mb-4 text-sm text-slate-500">Add a doctor to your visiting list.</div>
            <div className="space-y-3">
              {([
                ["name", "Doctor name *", "Dr. Ananya Sen"],
                ["specialty", "Specialty", "Cardiology"],
                ["qualification", "Qualification", "MBBS, MD"],
                ["hospital", "Hospital", "Apollo, Kolkata"],
                ["chamber_address", "Chamber address", "Salt Lake, Kolkata"],
                ["phone", "Phone", "+91-98300..."],
                ["mr_visiting_time", "MR visiting time", "4 PM - 6 PM"],
              ] as [string, string, string][]).map(([k, label, ph]) => (
                <div key={k}>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">{label}</label>
                  <input value={form[k] || ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} placeholder={ph}
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-500" />
                </div>
              ))}
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setShowAdd(false)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold">Cancel</button>
              <button onClick={addDoctor} className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white">Add</button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg">{toast}</div> : null}
    </div>
  );
}
