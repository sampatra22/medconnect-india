"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { describeAge, type StatusFreshness } from "@/lib/status-freshness";
import { doctorShareMessage } from "@/lib/doctor-share";

// ─────────────────────────────────────────────────────────────────────────────
// The PA's page. One doctor, six huge buttons, no login, no navigation.
// A compounder between patients has about four seconds for this — every tap
// saves immediately and says so. If the link is dead, say plainly who can
// issue a new one (the MR who set it up).
// ─────────────────────────────────────────────────────────────────────────────

type LinkDoctor = {
  name: string;
  specialty: string;
  hospital: string;
  status: string;
  patients_left: number | null;
  patients_source: string | null;
  status_updated_at: string | null;
  status_updated_by_name: string | null;
  freshness: StatusFreshness;
  today_hours: string | null;
  call_number: string | null;
};

const STATUS_BUTTONS: { key: string; emoji: string; label: string; sub: string }[] = [
  { key: "available", emoji: "🟢", label: "Available", sub: "Doctor is seeing patients" },
  { key: "busy", emoji: "🟠", label: "Busy", sub: "In, but running full" },
  { key: "token_full", emoji: "🟣", label: "Token Full", sub: "No new tokens today" },
  { key: "no_mr_today", emoji: "🟡", label: "No MR Today", sub: "Patients yes, MRs no" },
  { key: "opd_closed", emoji: "🔴", label: "OPD Closed", sub: "Not seeing patients now" },
  { key: "holiday", emoji: "🔵", label: "Holiday", sub: "Doctor is away today" },
];

// Queue count only makes sense while the doctor is actually sitting.
const COUNTABLE = new Set(["available", "busy", "token_full"]);

export default function PaUpdatePage() {
  const { key } = useParams<{ key: string }>();
  const [doctor, setDoctor] = useState<LinkDoctor | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "dead">("loading");
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/status-link/${key}`);
      if (res.ok) {
        const { doctor } = await res.json();
        setDoctor(doctor);
        setState("ready");
      } else {
        setState("dead");
      }
    })();
  }, [key]);

  async function send(body: { status?: string; patients_left?: number | null }) {
    setSaving(true);
    const res = await fetch(`/api/status-link/${key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const { doctor } = await res.json();
      setDoctor(doctor);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1800);
    } else if (res.status === 404) {
      setState("dead");
    }
    setSaving(false);
  }

  if (state === "loading") {
    return (
      <div className="min-h-screen bg-blue-50 flex items-center justify-center text-gray-400">
        Loading…
      </div>
    );
  }

  if (state === "dead" || !doctor) {
    return (
      <div className="min-h-screen bg-blue-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm p-8 max-w-sm text-center">
          <p className="text-3xl mb-3">🔗</p>
          <h1 className="font-bold text-gray-800 mb-2">This link is no longer active</h1>
          <p className="text-sm text-gray-500">
            A new link may have been issued. Ask the medical representative who
            set this up — they can generate a fresh one in a few seconds.
          </p>
        </div>
      </div>
    );
  }

  const f = doctor.freshness;
  const showCount = COUNTABLE.has(doctor.status);

  return (
    <div className="min-h-screen bg-blue-50">
      <div className="max-w-md mx-auto px-4 py-6">
        {/* Who this controls — no ambiguity, ever */}
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
          <h1 className="font-bold text-gray-800 text-lg leading-tight">{doctor.name}</h1>
          <p className="text-sm text-blue-700">{doctor.specialty}</p>
          <p className="text-xs text-gray-500">{doctor.hospital}</p>
          {doctor.today_hours && (
            <p className="text-xs font-medium text-emerald-700 mt-1">
              🗓 Today&apos;s hours: {doctor.today_hours}
            </p>
          )}
          <p className="text-xs text-gray-400 mt-2">
            {f.ageMinutes === null
              ? "No status set today yet."
              : f.isLive
                ? `Patients currently see: ${STATUS_BUTTONS.find((s) => s.key === doctor.status)?.label ?? doctor.status} · ${describeAge(f.ageMinutes)}`
                : "Yesterday's status has expired — patients see nothing until you tap."}
          </p>
        </div>

        {/* The six taps */}
        <div className="grid grid-cols-2 gap-2.5">
          {STATUS_BUTTONS.map((s) => {
            const active = doctor.status === s.key && f.isLive;
            return (
              <button
                key={s.key}
                disabled={saving}
                onClick={() => void send({ status: s.key })}
                className={`rounded-2xl p-4 text-left shadow-sm border-2 transition disabled:opacity-60 ${
                  active
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "bg-white border-transparent text-gray-800 active:border-blue-300"
                }`}
              >
                <span className="text-2xl block">{s.emoji}</span>
                <span className="font-bold text-sm block mt-1">{s.label}</span>
                <span
                  className={`text-[11px] block mt-0.5 ${active ? "text-blue-100" : "text-gray-400"}`}
                >
                  {s.sub}
                </span>
              </button>
            );
          })}
        </div>

        {/* Queue count — only while the doctor is sitting */}
        {showCount && (
          <div className="bg-white rounded-2xl shadow-sm p-4 mt-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-700">Patients waiting</p>
              <p className="text-[11px] text-gray-400">Optional — helps patients pick their moment</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                disabled={saving || (doctor.patients_left ?? 0) <= 0}
                onClick={() =>
                  void send({ patients_left: Math.max(0, (doctor.patients_left ?? 0) - 1) })
                }
                className="w-10 h-10 rounded-full bg-gray-100 active:bg-gray-200 text-gray-700 font-bold text-lg disabled:opacity-40"
              >
                −
              </button>
              <span className="font-bold text-gray-800 w-8 text-center text-lg">
                {doctor.patients_left ?? 0}
              </span>
              <button
                disabled={saving}
                onClick={() => void send({ patients_left: (doctor.patients_left ?? 0) + 1 })}
                className="w-10 h-10 rounded-full bg-gray-100 active:bg-gray-200 text-gray-700 font-bold text-lg"
              >
                +
              </button>
            </div>
          </div>
        )}

        {/* Confirmation the tap landed */}
        <p
          className={`text-center text-sm font-semibold mt-4 transition-opacity ${
            savedFlash ? "opacity-100 text-emerald-600" : "opacity-0"
          }`}
        >
          ✓ Saved — patients can see this now
        </p>

        {/* The follow-through: one tap after updating, the chamber can put
            today's status on the doctor's own WhatsApp Status — the channel
            patients actually watch. Message obeys the same trust rules. */}
        <a
          href={`https://wa.me/?text=${encodeURIComponent(
            doctorShareMessage({
              name: doctor.name,
              specialty: doctor.specialty,
              status: doctor.status,
              isLive: f.isLive,
              confidence: f.confidence,
              patientsLeft: doctor.patients_left,
              patientsSource: doctor.patients_source,
              todayHours: doctor.today_hours,
              place: doctor.hospital,
              number: doctor.call_number,
              link: `${typeof window !== "undefined" ? window.location.origin : ""}/doctors?q=${encodeURIComponent(doctor.name)}`,
            })
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 active:bg-emerald-700 py-3.5 text-sm font-bold text-white shadow-sm"
        >
          📤 Post today&apos;s status on WhatsApp
        </a>

        <p className="text-[11px] text-gray-400 text-center mt-4">
          This private link updates {doctor.name} only. Please don&apos;t share
          it outside the chamber. — MedConnect India
        </p>
      </div>
    </div>
  );
}
