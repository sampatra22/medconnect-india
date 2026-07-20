// ─────────────────────────────────────────────────────────────────────────────
// One doctor → one WhatsApp-ready message.
//
// Two hands post this: the PA right after tapping today's status (onto the
// doctor's own WhatsApp Status), and an MR forwarding a doctor to a local
// group. Same trust rules as every other surface: a live status may speak in
// the present tense; anything else falls back to the weekly pattern, plainly
// worded as a pattern. This module is deliberately React-free so `node --test`
// can import it directly.
// ─────────────────────────────────────────────────────────────────────────────

// Product vocabulary (kept in sync with components/doctor-status.tsx — these
// strings are stable; the lib stays import-free of client components so tests
// run without a JSX/React toolchain).
const SHARE_META: Record<string, { emoji: string; label: string }> = {
  available: { emoji: "🟢", label: "Available" },
  busy: { emoji: "🟠", label: "Busy" },
  token_full: { emoji: "🟣", label: "Token Full" },
  no_mr_today: { emoji: "🟡", label: "No MR Today" },
  holiday: { emoji: "🔵", label: "Holiday" },
  opd_closed: { emoji: "🔴", label: "OPD Closed" },
};

export type DoctorShareInput = {
  name: string;
  specialty: string;
  status: string;
  /** From statusFreshness — the ONLY authority on whether "now" may be said. */
  isLive: boolean;
  confidence: "fresh" | "ageing" | "stale";
  patientsLeft: number | null;
  patientsSource: string | null;
  todayHours: string | null;
  /** Where the doctor sits, e.g. hospital or chamber name. */
  place: string;
  /** The number that answers (chamber desk first) — omitted when null. */
  number: string | null;
  /** Absolute link to the live entry, e.g. `${origin}/doctors?q=…`. */
  link: string;
};

export function doctorShareMessage(d: DoctorShareInput): string {
  const meta = SHARE_META[d.status] ?? { emoji: "🩺", label: d.status };
  const lines: string[] = [];

  if (d.isLive) {
    lines.push(`${meta.emoji} *${d.name}* — ${d.specialty}`);
    // Queue length rides along only at full freshness — same rule as the
    // directory card. The "~" marks an MR estimate, exact numbers are the
    // chamber's own count.
    const queue =
      typeof d.patientsLeft === "number" && d.confidence === "fresh"
        ? ` · ${d.patientsSource === "mr_estimate" ? "~" : ""}${d.patientsLeft} patients waiting`
        : "";
    lines.push(`${meta.label} now${queue}`);
  } else {
    // Nothing confirmed today — never fake it. The message is still useful:
    // the usual hours plus a link that will be live the moment someone taps.
    lines.push(`🩺 *${d.name}* — ${d.specialty}`);
    lines.push(
      d.todayHours
        ? `Usually today: ${d.todayHours}`
        : "Timing not confirmed today — check live:"
    );
  }

  if (d.isLive && d.todayHours) lines.push(`🕐 Today: ${d.todayHours} · ${d.place}`);
  else lines.push(`📍 ${d.place}`);

  if (d.number) lines.push(`📞 ${d.number}`);
  lines.push(`Live status: ${d.link}`);
  lines.push(`— MedConnect India`);
  return lines.join("\n");
}
