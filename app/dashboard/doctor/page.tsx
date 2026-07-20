"use client";

// Module 4 · Doctor Dashboard — "My Day"
// The doctor starts their day, shares a day-wise plan + weekly timetable, and
// controls their live status. Everything shared here is what patients & MRs
// see on the public directory — visibility that brings the doctor more
// patients, which is exactly why sharing is worth their 60 seconds.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { statusFreshness } from "@/lib/status-freshness";

type DayPlanItem = { id: string; time: string; activity: string; done: boolean };

type TodayPlan = {
  id: string;
  date: string;
  items: DayPlanItem[];
  shared: boolean;
  started_at: string | null;
  updated_at: string;
};

type MyDoctor = {
  id: string;
  name: string;
  specialty: string;
  qualification: string;
  hospital: string;
  chamber_address: string;
  consultation_timing: string;
  status: "available" | "busy" | "holiday" | "no_mr_today" | "token_full" | "opd_closed";
  timetable: Record<string, string> | null;
  today_plan: TodayPlan | null;
  status_updated_at: string | null;
  status_updated_by_role: string | null;
};

type Unclaimed = {
  id: string;
  name: string;
  specialty: string;
  hospital: string;
  chamberAddress: string;
};

// Module 5 · Call MR
type MrLite = { id: string; name: string };

type SentRequest = {
  id: string;
  mr_id: string;
  mr_name: string;
  status: "pending" | "seen" | "done";
  note: string | null;
  created_at: string;
};

const REQ_STATUS: Record<SentRequest["status"], { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-yellow-100 text-yellow-700" },
  seen: { label: "Seen by MR", cls: "bg-blue-100 text-blue-700" },
  done: { label: "Called back", cls: "bg-green-100 text-green-700" },
};

function istDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

const DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

const STATUS_OPTIONS: {
  value: MyDoctor["status"];
  label: string;
  active: string;
}[] = [
  { value: "available", label: "🟢 Available", active: "bg-green-100 text-green-700 border-green-300" },
  { value: "busy", label: "🟠 Busy", active: "bg-orange-100 text-orange-700 border-orange-300" },
  { value: "token_full", label: "🟣 Token Full", active: "bg-purple-100 text-purple-700 border-purple-300" },
  { value: "no_mr_today", label: "🟡 No MR Today", active: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  { value: "holiday", label: "🔵 Holiday", active: "bg-sky-100 text-sky-700 border-sky-300" },
  { value: "opd_closed", label: "🔴 OPD Closed", active: "bg-red-100 text-red-700 border-red-300" },
];

function istDayKey(): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short" })
    .format(new Date())
    .toLowerCase();
}

function istTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

let nextId = 0;
const newItemId = () => `new-${Date.now()}-${nextId++}`;

export default function DoctorDashboard() {
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const user = session?.user as
    | { id?: string; name?: string | null; role?: string }
    | undefined;

  const [loading, setLoading] = useState(true);
  const [linked, setLinked] = useState(false);
  const [doc, setDoc] = useState<MyDoctor | null>(null);
  const [unclaimed, setUnclaimed] = useState<Unclaimed[]>([]);
  const [claimSearch, setClaimSearch] = useState("");
  const [busy, setBusy] = useState(false);

  // Drafts the doctor edits locally, then saves.
  const [items, setItems] = useState<DayPlanItem[]>([]);
  const [shared, setShared] = useState(true);
  const [planDirty, setPlanDirty] = useState(false);
  const [tt, setTt] = useState<Record<string, string>>({});
  const [ttDirty, setTtDirty] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  // Module 5 · Call MR
  const [mrQuery, setMrQuery] = useState("");
  const [mrSuggestions, setMrSuggestions] = useState<MrLite[]>([]);
  const [selectedMr, setSelectedMr] = useState<MrLite | null>(null);
  const [callNote, setCallNote] = useState("");
  const [sentRequests, setSentRequests] = useState<SentRequest[]>([]);

  useEffect(() => {
    if (authStatus === "unauthenticated") router.push("/login");
    else if (authStatus === "authenticated" && user?.role !== "doctor") {
      router.replace("/dashboard");
    }
  }, [authStatus, user?.role, router]);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/doctors/me");
    if (res.ok) {
      const data = await res.json();
      setLinked(data.linked);
      if (data.linked) {
        applyDoctor(data.doctor);
      } else {
        setUnclaimed(data.unclaimed ?? []);
      }
    }
    setLoading(false);
  }

  function applyDoctor(d: MyDoctor) {
    setDoc(d);
    setItems(d.today_plan?.items ?? []);
    setShared(d.today_plan?.shared ?? true);
    setTt(d.timetable ?? {});
    setPlanDirty(false);
    setTtDirty(false);
  }

  useEffect(() => {
    if (authStatus === "authenticated" && user?.role === "doctor") {
      // Async wrapper: state updates land in callbacks, not the effect body
      // (react-hooks/set-state-in-effect).
      void (async () => {
        await load();
        await loadSent();
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, user?.role]);

  async function loadSent() {
    const res = await fetch("/api/call-requests?sent=1");
    if (res.ok) setSentRequests(await res.json());
  }

  // Module 5: debounced MR name suggestions while the doctor types.
  // All setState happens inside the timeout callback — never in the effect
  // body itself (react-hooks/set-state-in-effect). Short queries clear the
  // list on the next tick, which is visually identical to clearing inline.
  useEffect(() => {
    const q = mrQuery.trim();
    if (selectedMr && q === selectedMr.name) return; // picked — don't reopen
    const short = q.length < 2;
    const t = setTimeout(async () => {
      if (short) {
        setMrSuggestions([]);
        return;
      }
      const res = await fetch(`/api/mrs?q=${encodeURIComponent(q)}`);
      if (res.ok) setMrSuggestions(await res.json());
    }, short ? 0 : 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mrQuery]);

  async function sendCallRequest() {
    if (!selectedMr) return;
    setBusy(true);
    const res = await fetch("/api/call-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mr_id: selectedMr.id, note: callNote.trim() || undefined }),
    });
    if (res.ok) {
      flashSaved(`📞 Request sent — ${selectedMr.name} will see it on their dashboard.`);
      setSelectedMr(null);
      setMrQuery("");
      setCallNote("");
      setMrSuggestions([]);
      loadSent();
    } else {
      alert((await res.json()).error || "Could not send the request.");
    }
    setBusy(false);
  }

  function flashSaved(msg: string) {
    setSavedMsg(msg);
    setTimeout(() => setSavedMsg(""), 2500);
  }

  async function claim(doctorId: string) {
    setBusy(true);
    const res = await fetch("/api/doctors/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doctor_id: doctorId }),
    });
    if (res.ok) {
      const { doctor } = await res.json();
      setLinked(true);
      applyDoctor(doctor);
    } else {
      alert((await res.json()).error || "Could not link this profile.");
    }
    setBusy(false);
  }

  async function savePlan(extra?: { start_day?: boolean }) {
    if (!doc) return;
    setBusy(true);
    const res = await fetch(`/api/doctors/${doc.id}/day-plan`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, shared, ...(extra ?? {}) }),
    });
    if (res.ok) {
      const { plan } = await res.json();
      setDoc((prev) =>
        prev
          ? {
              ...prev,
              today_plan: plan,
              ...(extra?.start_day ? { status: "available" as const } : {}),
            }
          : prev
      );
      setItems(plan.items);
      setShared(plan.shared);
      setPlanDirty(false);
      flashSaved(extra?.start_day ? "Day started — you're live! 🎉" : "Plan saved ✓");
    } else {
      alert((await res.json()).error || "Save failed. Try again.");
    }
    setBusy(false);
  }

  async function saveTimetable() {
    if (!doc) return;
    setBusy(true);
    const res = await fetch(`/api/doctors/${doc.id}/timetable`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timetable: tt }),
    });
    if (res.ok) {
      const { doctor } = await res.json();
      setDoc((prev) => (prev ? { ...prev, timetable: doctor.timetable } : prev));
      setTtDirty(false);
      flashSaved("Weekly timetable saved ✓");
    } else {
      alert((await res.json()).error || "Save failed. Try again.");
    }
    setBusy(false);
  }

  async function setStatus(status: MyDoctor["status"]) {
    if (!doc) return;
    setBusy(true);
    const res = await fetch(`/api/doctors/${doc.id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const { doctor } = await res.json();
      // Take the confirmation timestamp too, not just the status — otherwise
      // the "not showing to patients" warning would stay up after the doctor
      // had already fixed it, which reads as the app ignoring them.
      setDoc((prev) =>
        prev
          ? {
              ...prev,
              status: doctor.status,
              status_updated_at: doctor.status_updated_at,
              status_updated_by_role: doctor.status_updated_by_role,
            }
          : prev
      );
    } else {
      alert((await res.json()).error || "Update failed.");
    }
    setBusy(false);
  }

  const filteredUnclaimed = useMemo(
    () =>
      unclaimed.filter((d) =>
        d.name.toLowerCase().includes(claimSearch.toLowerCase())
      ),
    [unclaimed, claimSearch]
  );

  if (authStatus !== "authenticated" || user?.role !== "doctor") return null;

  const startedAt = istTime(doc?.today_plan?.started_at ?? null);
  const doneCount = items.filter((i) => i.done).length;

  return (
    <div className="min-h-screen bg-blue-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-blue-800">
              Doctor Dashboard
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Share your day — patients &amp; MRs plan around what you post here.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/doctors"
              className="bg-white border border-blue-200 text-blue-700 text-sm font-semibold px-3 py-2 rounded-lg hover:bg-blue-50 transition"
            >
              👁 Public view
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="bg-white border border-gray-200 text-gray-600 text-sm font-semibold px-3 py-2 rounded-lg hover:bg-gray-50 transition"
            >
              Log out
            </button>
          </div>
        </div>

        {savedMsg && (
          <div className="mb-4 bg-green-100 text-green-800 text-sm font-semibold rounded-xl px-4 py-3">
            {savedMsg}
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-2xl shadow-sm p-10 animate-pulse h-48" />
        ) : !linked ? (
          /* ── Claim flow: link this account to a directory profile ─────── */
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="font-bold text-gray-800 text-lg">Find your profile</h2>
            <p className="text-sm text-gray-500 mt-1 mb-4">
              Link your account to your directory profile once — after that only
              you (and admins) can edit your timetable and day plan.
            </p>
            <input
              type="text"
              placeholder="Search your name…"
              value={claimSearch}
              onChange={(e) => setClaimSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
              {filteredUnclaimed.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">
                  No unclaimed profiles match. Ask an MR or admin to add you to
                  the directory first.
                </p>
              ) : (
                filteredUnclaimed.slice(0, 30).map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 truncate">{d.name}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {d.specialty} · {d.hospital || d.chamberAddress}
                      </p>
                    </div>
                    <button
                      disabled={busy}
                      onClick={() => claim(d.id)}
                      className="flex-none bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition disabled:opacity-50"
                    >
                      This is me
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : doc ? (
          <div className="space-y-4">
            {/* ── Identity + live status ─────────────────────────────────── */}
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-bold text-gray-800 text-lg">{doc.name}</h2>
                  <p className="text-sm text-blue-700 font-medium">
                    {doc.specialty} · {doc.hospital}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">🩺 OPD: {doc.consultation_timing}</p>
                </div>
                {startedAt ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 whitespace-nowrap">
                    ▶ Day started {startedAt}
                  </span>
                ) : null}
              </div>
              <div className="mt-4">
                {/* The decay rule cuts both ways: it protects patients from a
                    stale promise, and it gives the doctor a concrete reason to
                    tap once a day — confirmed doctors are the ones patients
                    can actually find. Say so plainly rather than going quiet. */}
                {!statusFreshness(
                  doc.status,
                  doc.status_updated_at,
                  doc.status_updated_by_role
                ).isLive && (
                  <div className="mb-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
                    <p className="text-xs font-semibold text-amber-800">
                      Your status isn&apos;t showing to patients right now.
                    </p>
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      Availability is only shown on the day it&apos;s confirmed, so
                      nobody makes a wasted trip. Tap your status below to go live
                      again — your directory card shows your usual hours until then.
                    </p>
                  </div>
                )}
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                  My live status (patients &amp; MRs see this now)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_OPTIONS.map((s) => (
                    <button
                      key={s.value}
                      disabled={busy}
                      onClick={() => setStatus(s.value)}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition disabled:opacity-50 ${
                        doc.status === s.value
                          ? s.active
                          : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Start my day ───────────────────────────────────────────── */}
            {!doc.today_plan?.started_at && (
              <button
                disabled={busy}
                onClick={() => savePlan({ start_day: true })}
                className="w-full bg-gradient-to-r from-blue-600 to-emerald-500 hover:from-blue-700 hover:to-emerald-600 text-white font-bold py-4 rounded-2xl shadow-sm transition disabled:opacity-50"
              >
                ☀️ Start My Day — go live &amp; share today&apos;s plan
              </button>
            )}

            {/* ── Today's plan editor ────────────────────────────────────── */}
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <h2 className="font-bold text-gray-800">
                  📋 Today&apos;s plan{" "}
                  {items.length > 0 && (
                    <span className="text-xs font-semibold text-gray-400">
                      {doneCount}/{items.length} done
                    </span>
                  )}
                </h2>
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={shared}
                    onChange={(e) => {
                      setShared(e.target.checked);
                      setPlanDirty(true);
                    }}
                    className="accent-blue-600 w-4 h-4"
                  />
                  {shared ? "🌐 Visible to patients & MRs" : "🔒 Private (hidden)"}
                </label>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                e.g. &quot;10 – 1 Morning OPD&quot;, &quot;2 – 4 Hospital rounds&quot;,
                &quot;6 – 9 Evening chamber&quot;. Tick items off as your day moves —
                patients see live progress.
              </p>

              <div className="space-y-2">
                {items.map((it, idx) => (
                  <div key={it.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={it.done}
                      onChange={(e) => {
                        setItems((prev) =>
                          prev.map((p, i) =>
                            i === idx ? { ...p, done: e.target.checked } : p
                          )
                        );
                        setPlanDirty(true);
                      }}
                      className="accent-emerald-600 w-4 h-4 flex-none"
                    />
                    <input
                      type="text"
                      placeholder="Time (e.g. 10 AM – 1 PM)"
                      value={it.time}
                      onChange={(e) => {
                        setItems((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, time: e.target.value } : p))
                        );
                        setPlanDirty(true);
                      }}
                      className="w-36 flex-none border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <input
                      type="text"
                      placeholder="What are you doing? (e.g. Morning OPD)"
                      value={it.activity}
                      onChange={(e) => {
                        setItems((prev) =>
                          prev.map((p, i) =>
                            i === idx ? { ...p, activity: e.target.value } : p
                          )
                        );
                        setPlanDirty(true);
                      }}
                      className={`flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                        it.done ? "line-through text-gray-400" : ""
                      }`}
                    />
                    <button
                      onClick={() => {
                        setItems((prev) => prev.filter((_, i) => i !== idx));
                        setPlanDirty(true);
                      }}
                      className="flex-none w-8 h-8 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => {
                    setItems((prev) => [
                      ...prev,
                      { id: newItemId(), time: "", activity: "", done: false },
                    ]);
                    setPlanDirty(true);
                  }}
                  className="flex-1 border border-dashed border-blue-300 text-blue-700 text-sm font-semibold py-2 rounded-xl hover:bg-blue-50 transition"
                >
                  ＋ Add time slot
                </button>
                {items.length === 0 && (tt[istDayKey()] ?? "").trim() && (
                  <button
                    onClick={() => {
                      // One tap: today's timetable entry becomes today's plan.
                      const slots = (tt[istDayKey()] ?? "")
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean);
                      setItems(
                        slots.map((s) => ({
                          id: newItemId(),
                          time: s,
                          activity: "Consultation / OPD",
                          done: false,
                        }))
                      );
                      setPlanDirty(true);
                    }}
                    className="flex-1 border border-dashed border-emerald-300 text-emerald-700 text-sm font-semibold py-2 rounded-xl hover:bg-emerald-50 transition"
                  >
                    ⚡ Fill from my timetable
                  </button>
                )}
                <button
                  disabled={busy || !planDirty}
                  onClick={() => savePlan()}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2 rounded-xl transition disabled:opacity-40"
                >
                  Save &amp; share plan
                </button>
              </div>
            </div>

            {/* ── Weekly timetable ───────────────────────────────────────── */}
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h2 className="font-bold text-gray-800 mb-1">🗓 My weekly timetable</h2>
              <p className="text-xs text-gray-500 mb-3">
                Your recurring hours — shown permanently on your public profile so
                patients know when to come even before you post a day plan.
              </p>
              <div className="space-y-2">
                {DAYS.map((d) => (
                  <div key={d.key} className="flex items-center gap-2">
                    <span className="w-24 flex-none text-sm font-semibold text-gray-600">
                      {d.label}
                    </span>
                    <input
                      type="text"
                      placeholder="e.g. 10 AM – 1 PM, 6 – 9 PM (blank = off)"
                      value={tt[d.key] ?? ""}
                      onChange={(e) => {
                        setTt((prev) => ({ ...prev, [d.key]: e.target.value }));
                        setTtDirty(true);
                      }}
                      className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>
                ))}
              </div>
              <button
                disabled={busy || !ttDirty}
                onClick={saveTimetable}
                className="mt-3 w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2 rounded-xl transition disabled:opacity-40"
              >
                Save timetable
              </button>
            </div>

            {/* ── Call an MR (Module 5) ──────────────────────────────────── */}
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h2 className="font-bold text-gray-800 mb-1">📞 Call an MR</h2>
              <p className="text-xs text-gray-500 mb-3">
                Search an MR by name and request a call — they get a
                notification on their dashboard with your name, date and time.
              </p>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Type MR name (min 2 letters)…"
                  value={mrQuery}
                  onChange={(e) => {
                    setMrQuery(e.target.value);
                    setSelectedMr(null);
                  }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                {mrSuggestions.length > 0 && !selectedMr && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                    {mrSuggestions.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setSelectedMr(m);
                          setMrQuery(m.name);
                          setMrSuggestions([]);
                        }}
                        className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 transition flex items-center gap-2"
                      >
                        <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                          {m.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="font-medium text-gray-800">{m.name}</span>
                        <span className="ml-auto text-[10px] text-gray-400 uppercase">MR</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedMr && (
                <div className="mt-3 bg-blue-50 rounded-xl p-3">
                  <p className="text-sm font-semibold text-blue-800">
                    Request a call from {selectedMr.name}
                  </p>
                  <input
                    type="text"
                    placeholder="Optional note (e.g. need samples of X)…"
                    value={callNote}
                    onChange={(e) => setCallNote(e.target.value)}
                    className="mt-2 w-full border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      disabled={busy}
                      onClick={sendCallRequest}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2 rounded-lg transition disabled:opacity-50"
                    >
                      📞 Send call request
                    </button>
                    <button
                      onClick={() => {
                        setSelectedMr(null);
                        setMrQuery("");
                      }}
                      className="px-4 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {sentRequests.length > 0 && (
                <div className="mt-4 border-t border-gray-100 pt-3">
                  <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                    My recent requests
                  </p>
                  <ul className="space-y-1.5">
                    {sentRequests.slice(0, 5).map((r) => (
                      <li key={r.id} className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-gray-800 truncate">{r.mr_name}</span>
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {istDateTime(r.created_at)}
                        </span>
                        <span
                          className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${REQ_STATUS[r.status]?.cls ?? "bg-gray-100 text-gray-600"}`}
                        >
                          {REQ_STATUS[r.status]?.label ?? r.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* ── Why share? ─────────────────────────────────────────────── */}
            <div className="bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-100 rounded-2xl p-5">
              <p className="text-sm font-bold text-emerald-800 mb-1">
                💡 Why share your day?
              </p>
              <p className="text-sm text-emerald-900">
                Doctors who share today&apos;s plan are <b>ranked first on the
                public directory</b> with a &quot;📋 Shares day plan&quot; badge —
                patients see exactly when you&apos;re available and walk in at the
                right time. MRs stop calling during your OPD hours, and your
                staff answers fewer &quot;is doctor in?&quot; phone calls. 60
                seconds each morning, visible to everyone instantly.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
