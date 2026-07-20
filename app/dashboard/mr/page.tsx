"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { SosButton } from "@/components/sos-button";
import { statusFreshness, describeAge } from "@/lib/status-freshness";
import { ComboBox } from "@/components/combo-box";
import { rankSuggestions, SPECIALTIES, QUALIFICATIONS } from "@/lib/medical-vocab";

type Doctor = {
  id: number | string;
  name: string;
  specialty?: string;
  qualification?: string;
  hospital?: string;
  chamber_address?: string;
  mr_visiting_time?: string;
  mr_visiting_days?: string;
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
  status_updated_by_company?: string | null;
  // Module 4: doctor-shared availability layers
  timetable?: Record<string, string> | null;
  today_plan?: {
    date: string;
    items: { id: string; time: string; activity: string; done: boolean }[];
    shared: boolean;
    started_at: string | null;
    updated_at: string;
  } | null;
  // Module 6: attribution + verification state
  verified?: boolean;
  added_by_name?: string | null;
  added_by_role?: string | null;
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

// Phase 3 · MR Tools — a doctor on the MR's personal working list.
type MyDoctor = {
  id: string;
  frequency: number; // planned visits per month (1–4)
  patch_id: string | null;
  patch_name: string | null;
  visits_this_month: number;
  doctor: Doctor | null;
};

type CallPatch = { id: string; name: string; doctor_count: number };

type PlanItem = {
  id: string;
  date: string;
  order: number;
  planned_time?: string | null;
  status: string; // planned | done | skipped
  doctor: Doctor | null;
};

// Module 5 · Call MR — one incoming call-back request (shape from /api/call-requests).
type CallRequest = {
  id: string;
  mr_id: string;
  from_user_id: string;
  from_name: string;
  from_role: string;
  doctor_id: string | null;
  note: string | null;
  status: string; // pending | seen | done
  created_at: string;
  updated_at: string;
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

/** Elapsed time for non-status timestamps (call requests), phrased app-wide. */
function timeAgo(iso?: string | null) {
  if (!iso) return "";
  return describeAge(Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))) ?? "";
}

/** Trust verdict from the one shared engine — never a local re-implementation. */
function freshnessOf(d?: Doctor | null) {
  return statusFreshness(d?.status, d?.status_updated_at, d?.status_updated_by_role);
}

// "Genuine status" rule: always show how fresh the status is and WHO set it —
// by name, and for an MR their company too. Every MR sees who last updated,
// so a careless or false input is caught by the people who work that patch.
function freshness(d?: Doctor | null) {
  const f = freshnessOf(d);
  if (f.ageMinutes === null) return "";
  const role = d?.status_updated_by_role
    ? ROLE_LABEL[d.status_updated_by_role] || d.status_updated_by_role
    : "";
  const who = [d?.status_updated_by_name, d?.status_updated_by_company]
    .filter(Boolean)
    .join(", ");
  const by = who ? `${who}${role ? ` (${role})` : ""}` : role;
  return `${describeAge(f.ageMinutes)}${by ? " by " + by : ""}`;
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
  const f = freshnessOf(d);
  const size = small ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs";

  // An MR routes their whole day off this badge. Showing yesterday's
  // "Available" in confident green sends them across town for nothing —
  // the same rule the public directory follows, in this dashboard's palette.
  if (!f.isLive) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full font-semibold ring-1 bg-slate-100 text-slate-500 ring-slate-200 ${size}`}
        title={
          f.confirmedOn
            ? `Last confirmed ${f.confirmedOn} — treat as unknown.`
            : "Never confirmed."
        }
      >
        ○ Not confirmed today
      </span>
    );
  }
  // Tailwind ring utilities have no dashed variant, so a second-hand report is
  // drawn with a dashed BORDER instead of the solid ring a confirmed status gets.
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-bold ${size} ${
        f.confidence === "ageing" ? "opacity-70" : ""
      } ${
        f.isVerifiedSource
          ? `ring-1 ${sm.cls}`
          : "border border-dashed border-slate-400 bg-white text-slate-600"
      }`}
      title={
        f.isVerifiedSource
          ? "Confirmed by the doctor or their clinic."
          : "Reported by an MR — not confirmed by the doctor."
      }
    >
      {f.isVerifiedSource ? "●" : "◌"} {sm.label}
    </span>
  );
}

// Module 4: marks doctors who shared their own plan today — the most reliable
// signal an MR can route by. Hover shows the plan at a glance.
function PlanChip({ d }: { d?: Doctor | null }) {
  const p = d?.today_plan;
  if (!p || (p.items.length === 0 && !p.started_at)) return null;
  const preview = p.items
    .map((it) => `${it.done ? "✅" : "⏳"} ${[it.time, it.activity].filter(Boolean).join(" ")}`)
    .join("\n");
  return (
    <span
      title={preview || "Doctor started their day"}
      className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200"
    >
      📋 {p.items.length > 0 ? `Plan (${p.items.length})` : "Day started"}
    </span>
  );
}

export default function MrDashboard() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [plan, setPlanItems] = useState<PlanItem[]>([]);
  const [monthVisits, setMonthVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"plan" | "mylist" | "doctors" | "calendar">("plan");
  // Phase 3 · MR Tools state
  const [myList, setMyList] = useState<MyDoctor[]>([]);
  const [patches, setPatches] = useState<CallPatch[]>([]);
  const [mySearch, setMySearch] = useState("");
  const [myPatchFilter, setMyPatchFilter] = useState(""); // "" all · "none" unassigned · patch id
  const [showListPicker, setShowListPicker] = useState(false);
  const [listPickerSearch, setListPickerSearch] = useState("");
  const [showLoadPatch, setShowLoadPatch] = useState(false);
  const [newPatch, setNewPatch] = useState("");
  const [search, setSearch] = useState("");
  const [spec, setSpec] = useState("");
  const [planFilter, setPlanFilter] = useState<"all" | "todo" | "done">("all");
  const [toast, setToast] = useState("");
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  // Derived straight from the session — no state/effect needed (react-hooks/set-state-in-effect).
  const mr = useMemo(() => {
    const u = session?.user as { id?: string; name?: string | null; email?: string | null } | undefined;
    return { name: u?.name || "", email: u?.email || "", id: u?.id ?? null };
  }, [session]);

  // Client-side backup for the proxy role gate: only MRs (and admins) belong here.
  useEffect(() => {
    if (authStatus === "unauthenticated") router.push("/login");
    else if (authStatus === "authenticated") {
      const role = (session?.user as { role?: string } | undefined)?.role;
      if (role && role !== "mr" && role !== "admin") router.replace("/dashboard");
    }
  }, [authStatus, session, router]);
  const [showAdd, setShowAdd] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [detail, setDetail] = useState<Doctor | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  // Data-entry vocabulary: curated lists merged with what the directory already
  // holds, so suggestions reflect real local practice. Loaded once when the
  // add-doctor form is first opened — not on page load, since most sessions
  // never add a doctor.
  const [vocab, setVocab] = useState<{
    specialties: string[];
    qualifications: string[];
    addresses: string[];
    hospitals: string[];
  }>({ specialties: [...SPECIALTIES], qualifications: [...QUALIFICATIONS], addresses: [], hospitals: [] });
  const vocabLoaded = useRef(false);
  const [calMonth, setCalMonth] = useState(new Date());
  const [selDate, setSelDate] = useState(istToday());
  // Module 5 · Call MR — incoming call requests (doctor name + when + note)
  const [callReqs, setCallReqs] = useState<CallRequest[]>([]);
  const [showAllCallReqs, setShowAllCallReqs] = useState(false);
  // Counter for optimistic temp row ids (render-safe, unlike Date.now()).
  const tempSeq = useRef(0);

  const today = istToday();
  // Directory deletion is admin-only (server-enforced too); hide the button for MRs.
  const isAdmin = ((session?.user as { role?: string } | undefined)?.role || "") === "admin";

  // Open the create-doctor form, pulling the suggestion vocabulary the first
  // time. Failure is silent and harmless — the curated defaults still work.
  async function openAddDoctor(prefillName?: string) {
    setShowAdd(true);
    if (prefillName) setForm((f) => ({ ...f, name: prefillName }));
    if (vocabLoaded.current) return;
    vocabLoaded.current = true;
    try {
      const r = await fetch("/api/vocab", { cache: "no-store" });
      if (r.ok) setVocab(await r.json());
    } catch {
      /* curated defaults remain */
    }
  }

  // Free map lookup for chamber addresses (OpenStreetMap via our own proxy).
  async function searchAddress(q: string): Promise<string[]> {
    const r = await fetch(`/api/geo/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
    if (!r.ok) return [];
    const { results } = (await r.json()) as { results: { label: string }[] };
    return results.map((x) => x.label);
  }

  async function loadDoctors() {
    // per=500: the planner needs the whole directory in one call (206 today).
    // The endpoint pages by default for the public directory view.
    const r = await fetch("/api/doctors?per=500", { cache: "no-store" });
    if (!r.ok) return; // 401/403/500 bodies are {error} objects
    const data = await r.json();
    if (Array.isArray(data?.doctors)) setDoctors(data.doctors);
  }
  async function loadPlan() {
    const r = await fetch("/api/plan", { cache: "no-store" });
    if (r.ok) setPlanItems(await r.json());
  }
  async function loadMonth(d: Date) {
    const r = await fetch(`/api/visits?month=${istMonthOf(d)}`, { cache: "no-store" });
    if (!r.ok) return; // non-MR sessions get {error} JSON — never feed that to state
    const data = await r.json();
    if (Array.isArray(data)) setMonthVisits(data);
  }
  async function loadMyList() {
    const r = await fetch("/api/my-doctors", { cache: "no-store" });
    if (r.ok) setMyList(await r.json());
  }
  async function loadPatches() {
    const r = await fetch("/api/patches", { cache: "no-store" });
    if (r.ok) setPatches(await r.json());
  }
  async function loadCallReqs() {
    const r = await fetch("/api/call-requests", { cache: "no-store" });
    if (r.ok) setCallReqs(await r.json());
  }
  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadDoctors(), loadPlan(), loadMonth(new Date()), loadMyList(), loadPatches(), loadCallReqs()]);
      setLoading(false);
    })();
  }, []);

  async function setCallReqStatus(id: string, status: "seen" | "done") {
    const r = await fetch(`/api/call-requests/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (r.ok) {
      const { request } = await r.json();
      setCallReqs((prev) => prev.map((c) => (c.id === request.id ? request : c)));
    }
  }
  useEffect(() => {
    void (async () => { await loadMonth(calMonth); })();
  }, [calMonth]);

  function flash(msg: string) { setToast(msg); setTimeout(() => setToast(""), 2400); }
  const visitedToday = (id: number | string) => monthVisits.some((v) => String(v.doctor_id) === String(id) && v.date === today);

  const specialties = useMemo(() => Array.from(new Set(doctors.map((d) => d.specialty).filter(Boolean))) as string[], [doctors]);
  const inPlan = useMemo(() => new Set(plan.map((p) => String(p.doctor?.id))), [plan]);
  const inMyList = useMemo(() => new Set(myList.map((m) => String(m.doctor?.id))), [myList]);
  // Requests still needing a call back (done ones drop off the inbox).
  const openCallReqs = useMemo(() => callReqs.filter((c) => c.status !== "done"), [callReqs]);

  // Monthly call target = sum of frequencies; done caps each doctor at their frequency.
  const monthlyTarget = myList.reduce((s, m) => s + m.frequency, 0);
  const monthlyDone = myList.reduce((s, m) => s + Math.min(m.visits_this_month, m.frequency), 0);

  const myFiltered = myList.filter((m) => {
    if (myPatchFilter === "none" && m.patch_id) return false;
    if (myPatchFilter && myPatchFilter !== "none" && m.patch_id !== myPatchFilter) return false;
    if (!mySearch) return true;
    const t = mySearch.toLowerCase();
    const d = m.doctor;
    return `${d?.name || ""} ${d?.specialty || ""} ${d?.hospital || ""} ${d?.chamber_address || ""}`.toLowerCase().includes(t);
  });

  const listPickerDoctors = doctors.filter((d) => {
    if (inMyList.has(String(d.id))) return false;
    if (!listPickerSearch) return true;
    const t = listPickerSearch.toLowerCase();
    return `${d.name} ${d.specialty || ""} ${d.hospital || ""}`.toLowerCase().includes(t);
  });

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

  // Optimistic add: the row appears instantly; the server confirms in the
  // background (fixes the ~4s wait — no full re-fetch before the UI updates).
  async function addToPlan(d: Doctor) {
    if (inPlan.has(String(d.id))) return;
    tempSeq.current += 1; // monotonic id — avoids Date.now() (react-hooks/purity)
    const tempId = `temp-${d.id}-${tempSeq.current}`;
    const optimistic: PlanItem = { id: tempId, date: today, order: plan.length + 1, planned_time: null, status: "planned", doctor: d };
    setPlanItems((prev) => [...prev, optimistic]);
    flash(`＋ ${d.name} added to today's plan`);
    try {
      const res = await fetch("/api/plan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctor_id: d.id }),
      });
      if (res.ok) {
        setPlanItems(await res.json()); // reconcile with the server copy
      } else if (res.status === 409) {
        await loadPlan(); // already in plan (e.g. another tab) — just resync
      } else {
        setPlanItems((prev) => prev.filter((p) => p.id !== tempId)); // roll back
        const e = await res.json().catch(() => ({} as { error?: string }));
        flash(e.error || "Could not add to plan");
      }
    } catch {
      setPlanItems((prev) => prev.filter((p) => p.id !== tempId));
      flash("Network error — could not add to plan");
    }
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

  // Manual "Update Status" from the Today's Plan row. Optimistic: the badge
  // flips instantly with this MR's name attached; the server then confirms.
  // Attribution (name) is visible to every MR, so false inputs are accountable.
  function patchDoctorEverywhere(id: string | number, patch: Partial<Doctor>) {
    const match = (x?: Doctor | null) => x && String(x.id) === String(id);
    setDoctors((prev) => prev.map((x) => (match(x) ? { ...x, ...patch } : x)));
    setPlanItems((prev) => prev.map((p) => (match(p.doctor) ? { ...p, doctor: { ...p.doctor!, ...patch } } : p)));
    setMyList((prev) => prev.map((m) => (match(m.doctor) ? { ...m, doctor: { ...m.doctor!, ...patch } } : m)));
    setDetail((prev) => (match(prev) ? { ...prev!, ...patch } : prev));
  }
  async function updateDoctorStatus(d: Doctor, status: string) {
    if (!STATUS[status] || d.status === status) return;
    const prevPatch: Partial<Doctor> = {
      status: d.status, status_updated_at: d.status_updated_at,
      status_updated_by_role: d.status_updated_by_role, status_updated_by_name: d.status_updated_by_name,
      status_updated_by_company: d.status_updated_by_company,
    };
    patchDoctorEverywhere(d.id, {
      status,
      status_updated_at: new Date().toISOString(),
      status_updated_by_role: "mr",
      status_updated_by_name: mr.name || "MR",
      // Cleared, not left as-is: the card may still hold the PREVIOUS editor's
      // company, and pairing this MR's name with another company — even for
      // the second before the server replies — is a false attribution.
      status_updated_by_company: null,
    });
    try {
      const res = await fetch(`/api/doctors/${d.id}/status`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const { doctor } = (await res.json()) as { doctor: Doctor };
        patchDoctorEverywhere(doctor.id, doctor); // server copy is authoritative
        flash(`⟳ ${d.name} — ${statusMeta(status).label} (updated by you)`);
      } else {
        patchDoctorEverywhere(d.id, prevPatch); // roll back
        const e = await res.json().catch(() => ({} as { error?: string }));
        flash(e.error || "Could not update status");
      }
    } catch {
      patchDoctorEverywhere(d.id, prevPatch);
      flash("Network error — could not update status");
    }
  }

  // ── My Doctors + Call Patches (Phase 3 · MR Tools) ───────────────────────
  async function myListRequest(input: RequestInfo, init?: RequestInit) {
    setBusy(true);
    const res = await fetch(input, init);
    setBusy(false);
    if (res.ok) {
      setMyList(await res.json());
      return true;
    }
    const e = await res.json().catch(() => ({} as { error?: string }));
    flash(e.error || "Something went wrong");
    return false;
  }

  async function addToMyList(d: Doctor) {
    const ok = await myListRequest("/api/my-doctors", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doctor_id: d.id }),
    });
    if (ok) flash(`＋ ${d.name} added to your list`);
  }
  async function setFrequency(m: MyDoctor, frequency: number) {
    await myListRequest("/api/my-doctors", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: m.id, frequency }),
    });
  }
  async function setPatchOf(m: MyDoctor, patchId: string) {
    const ok = await myListRequest("/api/my-doctors", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: m.id, patch_id: patchId || null }),
    });
    if (ok) await loadPatches();
  }
  async function removeFromMyList(m: MyDoctor) {
    if (!confirm(`Remove ${m.doctor?.name ?? "this doctor"} from your list?`)) return;
    const ok = await myListRequest(`/api/my-doctors?id=${encodeURIComponent(m.id)}`, { method: "DELETE" });
    if (ok) await loadPatches();
  }

  async function createPatch() {
    const name = newPatch.trim();
    if (!name) { flash("Enter a patch name"); return; }
    setBusy(true);
    const res = await fetch("/api/patches", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setBusy(false);
    if (res.ok) { setPatches(await res.json()); setNewPatch(""); flash(`Patch “${name}” created`); }
    else { const e = await res.json().catch(() => ({} as { error?: string })); flash(e.error || "Could not create patch"); }
  }
  async function deletePatch(p: CallPatch) {
    if (!confirm(`Delete patch “${p.name}”? Doctors stay on your list.`)) return;
    setBusy(true);
    const res = await fetch(`/api/patches?id=${encodeURIComponent(p.id)}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      setPatches(await res.json());
      if (myPatchFilter === p.id) setMyPatchFilter("");
      await loadMyList();
      flash(`Patch “${p.name}” deleted`);
    } else flash("Could not delete patch");
  }
  async function loadPatchToday(p: CallPatch) {
    setBusy(true);
    const res = await fetch("/api/patches", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, action: "load_today" }),
    });
    setBusy(false);
    if (res.ok) {
      const r = (await res.json()) as { added: number; skipped: number };
      await loadPlan();
      setShowLoadPatch(false);
      setTab("plan");
      flash(r.added > 0 ? `⚡ ${p.name}: ${r.added} doctor(s) added to today's plan` : `${p.name}: already in today's plan`);
    } else {
      const e = await res.json().catch(() => ({} as { error?: string }));
      flash(e.error || "Could not load patch");
    }
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
    if (res.ok) {
      const created = (await res.json()) as Doctor;
      setShowAdd(false); setForm({});
      // A doctor you add is a doctor you visit — straight onto your list.
      await fetch("/api/my-doctors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ doctor_id: created.id }) });
      await Promise.all([loadDoctors(), loadMyList()]);
      flash(created.verified === false
        ? `${created.name} added to your list — public after admin verification`
        : `${created.name} added`);
    } else {
      const e = await res.json().catch(() => ({} as { error?: string }));
      flash(e.error || "Could not add doctor");
    }
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

        {/* Module 5 · Call MR — incoming call-back requests from doctors/staff */}
        {openCallReqs.length > 0 && (
          <section className="mt-5 rounded-2xl border border-blue-200 bg-blue-50/60 p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg">📞</span>
              <span className="font-bold">Call-back requests</span>
              <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-bold text-white">{openCallReqs.length}</span>
              <div className="flex-1" />
              {openCallReqs.length > 3 && (
                <button
                  onClick={() => setShowAllCallReqs((v) => !v)}
                  className="rounded-lg border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                >
                  {showAllCallReqs ? "Show less" : `Show all (${openCallReqs.length})`}
                </button>
              )}
            </div>
            <div className="mt-3 space-y-2">
              {(showAllCallReqs ? openCallReqs : openCallReqs.slice(0, 3)).map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 md:flex-nowrap">
                  <div className="grid h-10 w-10 flex-none place-items-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                    {initials(c.from_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">
                      {c.from_name}
                      <span className="ml-1 font-normal text-slate-400">· {ROLE_LABEL[c.from_role] ?? c.from_role}</span>
                      {c.status === "pending" && (
                        <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-200">New</span>
                      )}
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {c.note || "Please call back"} · {timeAgo(c.created_at)}
                    </div>
                  </div>
                  {c.status === "pending" && (
                    <button
                      onClick={() => setCallReqStatus(c.id, "seen")}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      👁 Mark seen
                    </button>
                  )}
                  <button
                    onClick={() => setCallReqStatus(c.id, "done")}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    ✓ Called back
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="mt-5 flex w-max max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <button onClick={() => setTab("plan")} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "plan" ? "bg-blue-600 text-white" : "text-slate-500"}`}>📋 Today&apos;s Plan</button>
          <button onClick={() => setTab("mylist")} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "mylist" ? "bg-blue-600 text-white" : "text-slate-500"}`}>⭐ My Doctors{myList.length ? ` (${myList.length})` : ""}</button>
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
              {patches.length > 0 ? (
                <button onClick={() => setShowLoadPatch(true)} className="h-11 rounded-xl border border-blue-200 bg-white px-4 text-sm font-semibold text-blue-700 shadow-sm hover:bg-blue-50">⚡ Load Patch</button>
              ) : null}
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
                          <PlanChip d={d} />
                          {typeof d?.patients_left === "number" && freshnessOf(d).confidence === "fresh" ? <span className="text-[11px] text-slate-500">👥 {d.patients_left} left</span> : null}
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
                        <select
                          value={d?.status && STATUS[d.status] ? d.status : ""}
                          disabled={!d}
                          onChange={(e) => d && e.target.value && updateDoctorStatus(d, e.target.value)}
                          title="Update this doctor's live status — your name is shown to all MRs"
                          className="h-9 max-w-[120px] rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500"
                        >
                          <option value="" disabled>⟳ Status</option>
                          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
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
        ) : tab === "mylist" ? (
          <section className="mt-4">
            {/* Monthly coverage summary */}
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-2xl font-extrabold">{myList.length}</div>
                <div className="text-sm font-medium text-slate-500">Doctors on my list</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-2xl font-extrabold">{monthlyTarget}</div>
                <div className="text-sm font-medium text-slate-500">Monthly call target</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-2xl font-extrabold text-emerald-600">{monthlyDone}</div>
                <div className="text-sm font-medium text-slate-500">Calls done ({MONTHS[m]})</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-2xl font-extrabold">{monthlyTarget ? Math.round((monthlyDone / monthlyTarget) * 100) : 0}%</div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${monthlyTarget ? Math.min(100, (monthlyDone / monthlyTarget) * 100) : 0}%` }} />
                </div>
                <div className="mt-1 text-xs text-slate-400">target coverage</div>
              </div>
            </div>

            {/* Call patches */}
            <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-1 font-bold">Call Patches</div>
              <div className="mb-3 text-xs text-slate-500">Group your doctors by area/route. One tap loads a whole patch into today&apos;s plan.</div>
              <div className="flex flex-wrap items-center gap-2">
                {patches.map((p) => (
                  <span key={p.id} className={`inline-flex items-center gap-1.5 rounded-full border py-1 pl-3 pr-1 text-xs font-semibold ${myPatchFilter === p.id ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                    <button onClick={() => setMyPatchFilter(myPatchFilter === p.id ? "" : p.id)} title="Filter by this patch">
                      {p.name} · {p.doctor_count}
                    </button>
                    <button disabled={busy || p.doctor_count === 0} onClick={() => loadPatchToday(p)} title="Load into today's plan"
                      className={`grid h-6 w-6 place-items-center rounded-full ${myPatchFilter === p.id ? "hover:bg-blue-500" : "hover:bg-blue-100"} disabled:opacity-30`}>⚡</button>
                    <button disabled={busy} onClick={() => deletePatch(p)} title="Delete patch"
                      className={`grid h-6 w-6 place-items-center rounded-full ${myPatchFilter === p.id ? "hover:bg-blue-500" : "hover:bg-rose-50 hover:text-rose-500"}`}>✕</button>
                  </span>
                ))}
                <div className="flex items-center gap-1">
                  <input value={newPatch} onChange={(e) => setNewPatch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") createPatch(); }}
                    placeholder="New patch, e.g. Salt Lake" className="h-8 w-44 rounded-lg border border-slate-200 px-2.5 text-xs outline-none focus:border-blue-500" />
                  <button disabled={busy} onClick={createPatch} className="h-8 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700">＋</button>
                </div>
              </div>
            </div>

            {/* List controls */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input value={mySearch} onChange={(e) => setMySearch(e.target.value)} placeholder="Search my doctors…"
                className="h-11 min-w-[200px] flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-blue-500" />
              <select value={myPatchFilter} onChange={(e) => setMyPatchFilter(e.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
                <option value="">All patches</option>
                <option value="none">No patch yet</option>
                {patches.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button onClick={() => { setListPickerSearch(""); setShowListPicker(true); }} className="h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">＋ Add from Directory</button>
            </div>

            {myList.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
                <div className="mb-2 text-3xl">⭐</div>
                <div className="font-bold">Build your doctor list</div>
                <div className="mx-auto mt-1 max-w-sm text-sm text-slate-500">Pick the doctors your company assigned to you, set how often to visit each per month, then group them into call patches.</div>
                <button onClick={() => { setListPickerSearch(""); setShowListPicker(true); }} className="mt-4 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white">＋ Add from Directory</button>
              </div>
            ) : myFiltered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-400">No doctors match.</div>
            ) : (
              <div className="space-y-2">
                {myFiltered.map((mItem) => {
                  const d = mItem.doctor;
                  const covered = mItem.visits_this_month >= mItem.frequency;
                  const pct = Math.min(100, (mItem.visits_this_month / mItem.frequency) * 100);
                  return (
                    <div key={mItem.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:flex-nowrap">
                      <div className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 font-bold text-white">{d ? initials(d.name) : "?"}</div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-bold">{d?.name ?? "Doctor removed"}</div>
                        <div className="truncate text-xs text-slate-500">{d?.specialty}{d?.hospital ? ` · ${d.hospital}` : ""}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <StatusBadge d={d} small />
                          <PlanChip d={d} />
                          {mItem.patch_name ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">📍 {mItem.patch_name}</span> : null}
                        </div>
                      </div>
                      {/* Monthly coverage */}
                      <div className="w-28 flex-none">
                        <div className={`text-xs font-bold ${covered ? "text-emerald-600" : "text-slate-600"}`}>{mItem.visits_this_month}/{mItem.frequency} this month{covered ? " ✓" : ""}</div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div className={`h-full rounded-full ${covered ? "bg-emerald-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div className="flex flex-none items-center gap-2">
                        <select value={mItem.frequency} disabled={busy} onChange={(e) => setFrequency(mItem, Number(e.target.value))}
                          title="Visits per month" className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold">
                          {[1, 2, 3, 4].map((f) => <option key={f} value={f}>{f}×/mo</option>)}
                        </select>
                        <select value={mItem.patch_id || ""} disabled={busy} onChange={(e) => setPatchOf(mItem, e.target.value)}
                          title="Call patch" className="h-9 max-w-[130px] rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold">
                          <option value="">No patch</option>
                          {patches.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <button disabled={busy || !d || inPlan.has(String(d.id))} onClick={() => d && addToPlan(d)}
                          title={d && inPlan.has(String(d.id)) ? "Already in today's plan" : "Add to today's plan"}
                          className={`h-9 rounded-lg border px-3 text-xs font-bold ${d && inPlan.has(String(d.id)) ? "border-blue-100 bg-blue-50 text-blue-400" : "border-blue-200 text-blue-700 hover:bg-blue-50"}`}>
                          {d && inPlan.has(String(d.id)) ? "In plan" : "＋ Plan"}
                        </button>
                        <button onClick={() => d && setDetail(d)} className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50">Details</button>
                        <button disabled={busy} onClick={() => removeFromMyList(mItem)} title="Remove from my list"
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
              <button onClick={() => void openAddDoctor()} className="h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm">＋ New doctor (not in list)</button>
            </div>
            <div className="mb-3 text-xs text-slate-500">Showing {filtered.length} of {doctors.length} doctors</div>

            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-400">
                <p>No doctors match.</p>
                <button
                  onClick={() => void openAddDoctor(search.trim())}
                  className="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  ＋ Add {search.trim() ? `"${search.trim()}"` : "a new doctor"} to the directory
                </button>
              </div>
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
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-bold">{d.name}</span>
                            {d.verified === false ? (
                              <span className="flex-none rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-200">⏳ Pending</span>
                            ) : null}
                          </div>
                          <div className="text-sm font-semibold text-blue-600">{d.specialty}</div>
                          <div className="mt-1 space-y-0.5 text-xs text-slate-500">
                            <div className="truncate">🏥 {d.hospital || "—"}</div>
                            <div className="truncate">📍 {d.chamber_address || "—"}</div>
                            {d.mr_visiting_days || d.mr_visiting_time ? (
                              <div>🕑 MR: {[d.mr_visiting_days, d.mr_visiting_time].filter(Boolean).join(" · ")}</div>
                            ) : null}
                          </div>
                        </div>
                        <button onClick={() => setDetail(d)} className="flex-none rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Details</button>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <StatusBadge d={d} />
                          {fresh ? <span className="text-[11px] text-slate-400">{fresh}</span> : null}
                        </span>
                        {typeof d.patients_left === "number" && freshnessOf(d).confidence === "fresh" ? <span className="text-xs text-slate-500">👥 {d.patients_left} left</span> : null}
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
                        {isAdmin ? (
                          <button onClick={() => removeDoctor(d)} title="Remove from directory (admin)" className="grid w-11 place-items-center rounded-xl border border-slate-200 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500">🗑</button>
                        ) : null}
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
                // The dead end IS the moment of need: an MR searching for a
                // doctor who isn't listed should be one tap from creating them,
                // not sent hunting through tabs for the right button.
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
                  <p>{doctors.length === 0 ? "No doctors in your list yet." : "No doctors match (or they're already planned)."}</p>
                  <button
                    onClick={() => { setShowPicker(false); void openAddDoctor(pickerSearch.trim()); }}
                    className="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
                  >
                    ＋ Add {pickerSearch.trim() ? `"${pickerSearch.trim()}"` : "a new doctor"} to the directory
                  </button>
                </div>
              ) : pickerDoctors.map((d) => (
                <div key={d.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                  <div className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 text-sm font-bold text-white">{initials(d.name)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{d.name}</div>
                    <div className="truncate text-xs text-slate-500">{d.specialty}{d.hospital ? ` · ${d.hospital}` : ""}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5"><StatusBadge d={d} small /><PlanChip d={d} /></div>
                  </div>
                  <button disabled={busy} onClick={() => addToPlan(d)} className="flex-none rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">＋ Add</button>
                </div>
              ))}
            </div>
            <button onClick={() => setShowPicker(false)} className="mt-4 w-full rounded-xl border border-slate-200 py-2.5 text-sm font-semibold">Close</button>
          </div>
        </div>
      ) : null}

      {/* Add doctors from the directory to my list (Phase 3) */}
      {showListPicker ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowListPicker(false); }}>
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-1 text-lg font-bold">Add to My Doctors</div>
            <div className="mb-3 text-sm text-slate-500">Pick the doctors your company assigned to you. You can set the visit frequency after adding.</div>
            <input autoFocus value={listPickerSearch} onChange={(e) => setListPickerSearch(e.target.value)} placeholder="Search doctor, specialty, hospital…"
              className="mb-3 h-11 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-blue-500" />
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {listPickerDoctors.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
                  {doctors.length === 0 ? "The directory is empty." : "No doctors match (or they're already on your list)."}
                </div>
              ) : listPickerDoctors.map((d) => (
                <div key={d.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                  <div className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 text-sm font-bold text-white">{initials(d.name)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{d.name}</div>
                    <div className="truncate text-xs text-slate-500">{d.specialty}{d.hospital ? ` · ${d.hospital}` : ""}</div>
                  </div>
                  <button disabled={busy} onClick={() => addToMyList(d)} className="flex-none rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">＋ Add</button>
                </div>
              ))}
            </div>
            <button onClick={() => setShowListPicker(false)} className="mt-4 w-full rounded-xl border border-slate-200 py-2.5 text-sm font-semibold">Done</button>
          </div>
        </div>
      ) : null}

      {/* Load a call patch into today's plan (Phase 3) */}
      {showLoadPatch ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowLoadPatch(false); }}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-1 text-lg font-bold">⚡ Load a Call Patch</div>
            <div className="mb-4 text-sm text-slate-500">Adds every doctor in the patch to today&apos;s plan (doctors already planned are skipped).</div>
            <div className="space-y-2">
              {patches.map((p) => (
                <button key={p.id} disabled={busy || p.doctor_count === 0} onClick={() => loadPatchToday(p)}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-blue-300 hover:bg-blue-50 disabled:opacity-40">
                  <div className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-blue-50 font-bold text-blue-700">📍</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{p.name}</div>
                    <div className="text-xs text-slate-500">{p.doctor_count} doctor(s)</div>
                  </div>
                  <span className="text-blue-600">⚡</span>
                </button>
              ))}
            </div>
            <button onClick={() => setShowLoadPatch(false)} className="mt-4 w-full rounded-xl border border-slate-200 py-2.5 text-sm font-semibold">Cancel</button>
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
                ["🕑 MR visiting time", [detail.mr_visiting_days, detail.mr_visiting_time].filter(Boolean).join("\n")],
                ["🗓 Weekly timetable", ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
                  .map((k) => (detail.timetable?.[k] ? `${k[0].toUpperCase()}${k.slice(1)}: ${detail.timetable[k]}` : null))
                  .filter(Boolean)
                  .join("\n")],
                ["⭐ Rating", detail.rating ? `${detail.rating}/5` : ""],
                ["👤 Secretary", detail.secretary_contact],
              ] as [string, string | undefined][]).filter(([, v]) => v).map(([label, v]) => (
                <div key={label} className="flex gap-2">
                  <div className="w-40 flex-none text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
                  <div className="min-w-0 flex-1 whitespace-pre-line font-medium text-slate-700">{v}</div>
                </div>
              ))}
            </div>

            {/* Module 4: the doctor's own shared plan for today — cross-check
                the live status against the doctor's word before travelling. */}
            {detail.today_plan && detail.today_plan.items.length > 0 ? (
              <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                <div className="flex items-center justify-between gap-2 text-xs font-bold text-emerald-800">
                  <span>📋 Doctor&apos;s shared plan today</span>
                  {detail.today_plan.started_at ? (
                    <span className="font-semibold text-emerald-600">▶ Day started</span>
                  ) : null}
                </div>
                <ul className="mt-1.5 space-y-1">
                  {detail.today_plan.items.map((it) => (
                    <li key={it.id} className={`flex gap-1.5 text-xs ${it.done ? "text-slate-400 line-through" : "text-emerald-900"}`}>
                      <span className="flex-none">{it.done ? "✅" : "⏳"}</span>
                      {it.time ? <span className="whitespace-nowrap font-semibold">{it.time}</span> : null}
                      <span className="min-w-0">{it.activity}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-1.5 text-[11px] text-emerald-600">
                  Straight from the doctor — plan your visit around this.
                </div>
              </div>
            ) : null}

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
            <div className="mb-4 text-sm text-slate-500">Goes straight onto your list, credited to you — and appears publicly once an admin verifies it.</div>
            {/* Suggested fields keep the directory's vocabulary consistent —
                three characters should land a canonical value — but every one
                of them still accepts free text for the case the list misses. */}
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Doctor name *</label>
                <input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Dr. Ananya Sen"
                  className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-500" />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Specialty</label>
                <ComboBox
                  value={form.specialty || ""}
                  onChange={(v) => setForm({ ...form, specialty: v })}
                  suggestions={rankSuggestions(vocab.specialties, form.specialty || "")}
                  placeholder="Type 'ort' → Orthopedics"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Qualification</label>
                <ComboBox
                  value={form.qualification || ""}
                  onChange={(v) => setForm({ ...form, qualification: v })}
                  suggestions={rankSuggestions(vocab.qualifications, form.qualification || "")}
                  placeholder="Type 'md' or 'dnb'"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Hospital</label>
                <ComboBox
                  value={form.hospital || ""}
                  onChange={(v) => setForm({ ...form, hospital: v })}
                  suggestions={rankSuggestions(vocab.hospitals, form.hospital || "")}
                  placeholder="Apollo, Kolkata"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Chamber address</label>
                <ComboBox
                  value={form.chamber_address || ""}
                  onChange={(v) => setForm({ ...form, chamber_address: v })}
                  suggestions={rankSuggestions(vocab.addresses, form.chamber_address || "", 5)}
                  onSearch={searchAddress}
                  placeholder="Salt Lake, Kolkata"
                  hint="Areas you've used come first; keep typing to search the map. You can also type any address yourself."
                />
              </div>

              {([
                ["phone", "Phone", "+91-98300..."],
                ["mr_visiting_days", "MR visiting days", "Mon, Wed, Fri"],
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

      {/* Emergency SOS — floating on every tab; shares live GPS + MR name
          with the saved emergency contact via WhatsApp/SMS/call. */}
      <SosButton mrName={mr.name} />

      {toast ? <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg">{toast}</div> : null}
    </div>
  );
}
