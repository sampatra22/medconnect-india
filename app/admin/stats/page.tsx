"use client";

import { Fragment, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { AdminNav } from "@/components/admin-nav";

// ─────────────────────────────────────────────────────────────────────────────
// The Phase-1 instrument panel. Reads the anonymous daily counters and shows
// the two things the phase gate turns on: is the SUPPLY side moving (statuses
// confirmed, chambers updating) and is the DEMAND side moving (patients
// viewing, calling, navigating, sharing). No graphs library — a dense number
// grid an admin can scan in five seconds beats a chart that needs a legend.
// ─────────────────────────────────────────────────────────────────────────────

type Stats = {
  days: string[];
  byEvent: Record<string, Record<string, number>>;
  totals: { totalDoctors: number; verifiedDoctors: number; pendingDoctors: number; mrCount: number };
};

// event key → { label, group } in the order they should appear.
const ROWS: { key: string; label: string; group: "supply" | "demand" }[] = [
  { key: "status_update", label: "Statuses confirmed (all roles)", group: "supply" },
  { key: "pa_status_update", label: "…of those, by chamber PA link", group: "supply" },
  { key: "pa_page_view", label: "PA update pages opened", group: "supply" },
  { key: "directory_view", label: "Directory opened", group: "demand" },
  { key: "detail_open", label: "Doctor cards expanded", group: "demand" },
  { key: "call_tap", label: "Call taps", group: "demand" },
  { key: "directions_tap", label: "Directions taps", group: "demand" },
  { key: "share_tap", label: "Doctor shares", group: "demand" },
  { key: "board_view", label: "Status board opened", group: "demand" },
  { key: "board_share", label: "Board messages shared", group: "demand" },
];

export default function AdminStatsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    else if (status === "authenticated" && (session?.user as { role?: string })?.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [status, session, router]);

  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/admin/stats", { cache: "no-store" });
      if (r.ok) setStats(await r.json());
      setLoading(false);
    })();
  }, []);

  const shortDay = (d: string) => d.slice(5); // "MM-DD"
  const rowTotal = (key: string) =>
    stats ? Object.values(stats.byEvent[key] ?? {}).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="min-h-screen bg-blue-50 p-6">
      <div className="max-w-6xl mx-auto">
        <AdminNav />
        <h2 className="text-lg font-bold text-gray-800 mb-1">Usage — last 14 days</h2>
        <p className="text-sm text-gray-500 mb-4">
          Anonymous counts, IST days. No personal data is collected. Supply =
          doctors kept fresh; demand = patients acting on it.
        </p>

        {loading ? (
          <div className="rounded-2xl bg-white p-10 text-center text-gray-400 shadow-sm">Loading…</div>
        ) : !stats ? (
          <div className="rounded-2xl bg-white p-10 text-center text-gray-400 shadow-sm">No data.</div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              {[
                ["Doctors total", stats.totals.totalDoctors],
                ["Public (verified)", stats.totals.verifiedDoctors],
                ["Awaiting approval", stats.totals.pendingDoctors],
                ["MR accounts", stats.totals.mrCount],
              ].map(([label, n]) => (
                <div key={label as string} className="rounded-2xl bg-white p-4 shadow-sm">
                  <p className="text-2xl font-bold text-blue-800">{n as number}</p>
                  <p className="text-xs text-gray-500">{label as string}</p>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400">
                    <th className="px-3 py-2 text-left font-semibold">Event</th>
                    <th className="px-2 py-2 text-right font-semibold">14-day</th>
                    {stats.days.map((d) => (
                      <th key={d} className="px-2 py-2 text-right font-medium whitespace-nowrap">
                        {shortDay(d)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row, i) => {
                    const first = i === 0 || ROWS[i - 1].group !== row.group;
                    return (
                      <Fragment key={row.key}>
                        {first ? (
                          <tr className="bg-gray-50">
                            <td colSpan={stats.days.length + 2} className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">
                              {row.group === "supply" ? "Supply — doctors kept fresh" : "Demand — patients acting"}
                            </td>
                          </tr>
                        ) : null}
                        <tr className="border-b border-gray-50 last:border-0">
                          <td className="px-3 py-2 text-gray-700">{row.label}</td>
                          <td className="px-2 py-2 text-right font-bold text-blue-800">{rowTotal(row.key) || "—"}</td>
                          {stats.days.map((d) => {
                            const v = stats.byEvent[row.key]?.[d] ?? 0;
                            return (
                              <td key={d} className={`px-2 py-2 text-right ${v ? "text-gray-800" : "text-gray-300"}`}>
                                {v || "·"}
                              </td>
                            );
                          })}
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] text-gray-400">
              Phase-1 gate: paid features wait for ~50 weekly-active MRs and
              dense status coverage. Watch the two supply rows climb first.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
