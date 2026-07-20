"use client";

import { useEffect, useState } from "react";
import {
  statusFreshness,
  describeAge,
  timetableFallback,
  type DoctorStatus,
} from "@/lib/status-freshness";
import { istDayKey } from "@/lib/ist";

// ─────────────────────────────────────────────────────────────────────────────
// The ONE component that renders a doctor's availability. Directory, status
// board and dashboards all use it, so a stale status can never look live on
// one screen and dead on another — and a change to the trust rules is a change
// in exactly one file.
// ─────────────────────────────────────────────────────────────────────────────

/** Fields any caller must pass through from the serialized doctor. */
export type StatusFields = {
  status: DoctorStatus | string;
  status_updated_at: string | null;
  status_updated_by_role: string | null;
  status_updated_by_name?: string | null;
  status_updated_by_company?: string | null;
  timetable?: Record<string, string> | null;
};

export const STATUS_LABEL: Record<string, string> = {
  available: "Available",
  busy: "Busy",
  token_full: "Token Full",
  no_mr_today: "No MR Today",
  holiday: "Holiday",
  opd_closed: "OPD Closed",
};

// Full-strength palette — reserved for CONFIRMED, CURRENT status only.
const STATUS_STRONG: Record<string, { chip: string; dot: string }> = {
  available: { chip: "bg-green-100 text-green-700", dot: "bg-green-500" },
  busy: { chip: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
  token_full: { chip: "bg-purple-100 text-purple-700", dot: "bg-purple-500" },
  no_mr_today: { chip: "bg-yellow-100 text-yellow-700", dot: "bg-yellow-500" },
  holiday: { chip: "bg-sky-100 text-sky-700", dot: "bg-sky-500" },
  opd_closed: { chip: "bg-red-100 text-red-700", dot: "bg-red-500" },
};

const NEUTRAL = { chip: "bg-gray-100 text-gray-600", dot: "bg-gray-400" };

/**
 * One shared 60-second ticker for the whole page rather than one timer per
 * card: a directory of 200 doctors must not spawn 200 intervals. Keeps an
 * open tab honest — a status silently expires at IST midnight without the
 * user having to hit refresh.
 */
let subscribers = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | null = null;

function subscribe(fn: () => void) {
  subscribers.add(fn);
  if (!ticker) ticker = setInterval(() => subscribers.forEach((f) => f()), 60_000);
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0 && ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  };
}

function useNow(): Date {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => subscribe(() => setNow(new Date())), []);
  // Null until mounted so server and first client render agree (no hydration
  // mismatch); statusFreshness falls back to its own `new Date()`.
  return now ?? new Date();
}

/**
 * The availability badge.
 *
 * fresh  → full colour. A tick when the doctor or clinic confirmed it.
 * ageing → same day but old: muted, with the "as of" clock so the reader
 *          judges for themselves.
 * stale  → NO status badge. Falls back to the doctor's usual hours, clearly
 *          labelled as a pattern, not a confirmation. Showing a two-day-old
 *          green "Available" is the one bug that would cost a patient a
 *          wasted trip and cost us the directory's credibility.
 */
export function DoctorStatusBadge({ doctor }: { doctor: StatusFields }) {
  const now = useNow();
  const f = statusFreshness(
    doctor.status,
    doctor.status_updated_at,
    doctor.status_updated_by_role,
    now
  );
  const label = STATUS_LABEL[doctor.status] ?? "Unknown";

  if (!f.isLive) {
    const usual = timetableFallback(doctor.timetable, istDayKey(now));
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap bg-gray-100 text-gray-500"
        title={
          f.confirmedOn
            ? `Last confirmed ${f.confirmedOn} — too old to show as live.`
            : "This doctor has not confirmed their availability yet."
        }
      >
        <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
        {usual ? `Usually ${usual}` : "Not confirmed today"}
      </span>
    );
  }

  const strong = STATUS_STRONG[doctor.status] ?? NEUTRAL;
  const ageing = f.confidence === "ageing";
  const reported = !f.isVerifiedSource;

  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full whitespace-nowrap",
        ageing ? "font-medium opacity-70" : "font-semibold",
        // An MR's second-hand report is dashed and never carries a tick.
        reported ? "border border-dashed border-current bg-transparent" : strong.chip,
        reported ? "text-gray-600" : "",
      ].join(" ")}
      title={
        reported
          ? "Reported by a visiting MR, not confirmed by the doctor or clinic."
          : "Confirmed by the doctor or their clinic."
      }
    >
      <span className={`w-1.5 h-1.5 rounded-full ${reported ? "bg-gray-400" : strong.dot}`} />
      {label}
      {!reported && !ageing && <span className="text-[10px]">✓</span>}
    </span>
  );
}

/**
 * The line under the badge: who stands behind this status, and how old it is.
 * An MR is named WITH their company — that pairing is the accountability
 * mechanism, not decoration.
 */
export function StatusAttribution({
  doctor,
  className = "",
}: {
  doctor: StatusFields;
  className?: string;
}) {
  const now = useNow();
  const f = statusFreshness(
    doctor.status,
    doctor.status_updated_at,
    doctor.status_updated_by_role,
    now
  );
  if (f.ageMinutes === null) return null;

  const who = [doctor.status_updated_by_name, doctor.status_updated_by_company]
    .filter(Boolean)
    .join(", ");

  return (
    <span className={`text-xs text-gray-400 ${className}`}>
      {f.isLive ? (f.isVerifiedSource ? "Confirmed" : "Reported") : "Last confirmed"}
      {who ? ` by ${who}` : ""} · {describeAge(f.ageMinutes)}
      {f.confidence === "ageing" && f.asOf ? ` (as of ${f.asOf})` : ""}
    </span>
  );
}
