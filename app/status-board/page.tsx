"use client";

import { useEffect, useMemo, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp Status Board — Phase 1's marketing engine (~15 min/day, ₹0 budget).
// Turns today's live doctor statuses into a ready-to-post WhatsApp message.
// Public page, read-only: it reuses GET /api/doctors, no new API needed.
// Flow: pick city → preview the message → Share on WhatsApp / Copy text.
// ─────────────────────────────────────────────────────────────────────────────

type Doctor = {
  id: number | string;
  name: string;
  specialty: string;
  hospital: string;
  chamber_address: string;
  consultation_timing: string;
  timetable?: Record<string, string> | null;
  status:
    | "available"
    | "busy"
    | "holiday"
    | "no_mr_today"
    | "token_full"
    | "opd_closed";
  patients_left: number | null;
  status_updated_at: string | null;
};

const STATUS_META: Record<
  Doctor["status"],
  { label: string; emoji: string; rank: number; classes: string }
> = {
  available: { label: "Available", emoji: "🟢", rank: 0, classes: "bg-green-100 text-green-700" },
  busy: { label: "Busy", emoji: "🟠", rank: 1, classes: "bg-orange-100 text-orange-700" },
  token_full: { label: "Token Full", emoji: "🟣", rank: 2, classes: "bg-purple-100 text-purple-700" },
  no_mr_today: { label: "No MR Today", emoji: "🟡", rank: 3, classes: "bg-yellow-100 text-yellow-700" },
  holiday: { label: "Holiday", emoji: "🔵", rank: 4, classes: "bg-sky-100 text-sky-700" },
  opd_closed: { label: "OPD Closed", emoji: "🔴", rank: 5, classes: "bg-red-100 text-red-700" },
};

const FALLBACK = { label: "Unknown", emoji: "⚪", rank: 9, classes: "bg-gray-100 text-gray-600" };

function meta(s: Doctor["status"]) {
  return STATUS_META[s] ?? FALLBACK;
}

function cityOf(d: Doctor): string {
  const parts = d.chamber_address.split(",");
  return parts[parts.length - 1].trim();
}

function istDayKey(): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short" })
    .format(new Date())
    .toLowerCase();
}

function freshWithin24h(iso: string | null): boolean {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < 24 * 60 * 60 * 1000;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

const MAX_IN_MESSAGE = 15;

export default function StatusBoardPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState("all");
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/doctors", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) setDoctors(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, []);

  const cities = useMemo(
    () => Array.from(new Set(doctors.map(cityOf))).sort(),
    [doctors]
  );

  // Board order: best-for-MRs first (available → … → closed), fresh first.
  const inCity = useMemo(() => {
    const list = doctors.filter((d) => city === "all" || cityOf(d) === city);
    return [...list].sort((a, b) => {
      const r = meta(a.status).rank - meta(b.status).rank;
      if (r !== 0) return r;
      return (b.status_updated_at || "").localeCompare(a.status_updated_at || "");
    });
  }, [doctors, city]);

  // The message only carries statuses updated in the last 24h — stale info
  // shared on WhatsApp would burn trust in the whole board.
  const freshList = useMemo(
    () => inCity.filter((d) => freshWithin24h(d.status_updated_at)),
    [inCity]
  );

  const now = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const siteUrl =
    typeof window !== "undefined" ? `${window.location.origin}/doctors` : "/doctors";

  const message = useMemo(() => {
    const included = freshList.slice(0, MAX_IN_MESSAGE);
    const lines = included.map((d) => {
      const m = meta(d.status);
      const extras = [
        typeof d.patients_left === "number" ? `~${d.patients_left} patients left` : null,
        d.timetable?.[istDayKey()] ? `today ${d.timetable[istDayKey()]}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return `${m.emoji} ${d.name} (${d.specialty}) — ${m.label}${extras ? " · " + extras : ""}`;
    });
    return [
      `🩺 *Doctor Status${city !== "all" ? " — " + city : ""}*`,
      `${now} IST`,
      "",
      ...(lines.length > 0
        ? lines
        : ["No status updates in the last 24 hours yet — check live:"]),
      "",
      `Live updates & timings: ${siteUrl}`,
      `— MedConnect India`,
    ].join("\n");
  }, [freshList, city, now, siteUrl]);

  async function copyText() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — user can long-press the preview instead */
    }
  }

  return (
    <div className="min-h-screen bg-blue-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <a
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline mb-4"
        >
          ← MedConnect India
        </a>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-blue-800">
              WhatsApp Status Board
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Today&apos;s doctor availability, packed into one message. Post it
              to your WhatsApp Status or MR groups.
            </p>
          </div>
          <button
            onClick={load}
            className="self-start sm:self-auto bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
          >
            ↻ Refresh
          </button>
        </div>

        {/* City filter */}
        {cities.length > 1 ? (
          <div className="flex flex-wrap gap-2 mb-5">
            {["all", ...cities].map((c) => (
              <button
                key={c}
                onClick={() => setCity(c)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
                  city === c
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                }`}
              >
                {c === "all" ? "All cities" : c}
              </button>
            ))}
          </div>
        ) : null}

        {loading ? (
          <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-400">
            Loading today&apos;s statuses…
          </div>
        ) : (
          <>
            {/* Message preview — exactly what gets shared */}
            <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
                  Message preview
                </p>
                <p className="text-xs text-gray-400">
                  {freshList.length} fresh update{freshList.length === 1 ? "" : "s"}
                  {freshList.length > MAX_IN_MESSAGE ? ` · top ${MAX_IN_MESSAGE} included` : ""}
                </p>
              </div>
              <pre className="whitespace-pre-wrap rounded-xl bg-emerald-50 border border-emerald-100 p-4 text-[13px] leading-relaxed text-gray-800 font-sans">
                {message}
              </pre>
              <div className="mt-3 flex flex-col sm:flex-row gap-2">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 py-3 text-center text-sm font-bold text-white"
                >
                  📲 Share on WhatsApp
                </a>
                <button
                  onClick={copyText}
                  className="flex-1 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 py-3 text-sm font-bold text-slate-700"
                >
                  {copied ? "✓ Copied" : "📋 Copy text"}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-gray-400">
                Only statuses updated in the last 24 hours are shared — stale
                info stays off WhatsApp.
              </p>
            </div>

            {/* Full board */}
            <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
              {inCity.length === 0 ? (
                <p className="p-8 text-center text-gray-400 text-sm">
                  No doctors in this city yet.
                </p>
              ) : (
                inCity.map((d) => {
                  const m = meta(d.status);
                  const fresh = freshWithin24h(d.status_updated_at);
                  return (
                    <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="text-lg flex-none">{m.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-800 truncate text-sm">
                          {d.name}
                          <span className="text-gray-400 font-normal"> · {d.specialty}</span>
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {d.hospital} · {cityOf(d)}
                        </p>
                      </div>
                      <div className="text-right flex-none">
                        <span
                          className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${m.classes}`}
                        >
                          {m.label}
                        </span>
                        <p className={`text-[11px] mt-0.5 ${fresh ? "text-emerald-600" : "text-gray-400"}`}>
                          {d.status_updated_at ? timeAgo(d.status_updated_at) : "never updated"}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
