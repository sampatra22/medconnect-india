"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { AdminNav } from "@/components/admin-nav";

// ─────────────────────────────────────────────────────────────────────────────
// Doctor approvals queue.
//
// Approving is what makes a profile PUBLIC — name, chamber and phone number of
// a real person. So this page shows the full submission and the consent state
// side by side, rather than an approve button next to a name. An admin should
// be able to see everything they are vouching for without leaving the row.
// ─────────────────────────────────────────────────────────────────────────────

type PendingDoctor = {
  id: string;
  name: string;
  specialty: string;
  qualification: string;
  hospital: string;
  chamber_address: string;
  phone: string;
  secretary_contact: string | null;
  consultation_timing: string;
  mr_visiting_days: string | null;
  mr_visiting_time: string | null;
  added_by_name: string | null;
  added_by_role: string | null;
  consent_given: boolean | null;
  consent_by_name: string | null;
};

export default function AdminDoctorsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [pending, setPending] = useState<PendingDoctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<PendingDoctor>>({});

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    else if (status === "authenticated") {
      const role = (session?.user as { role?: string } | undefined)?.role;
      if (role !== "admin") router.replace("/dashboard");
    }
  }, [status, session, router]);

  async function load() {
    setLoading(true);
    // per=500 so the whole queue arrives in one call; pending is a small set.
    const r = await fetch("/api/doctors?per=500", { cache: "no-store" });
    if (r.ok) {
      const data = await r.json();
      const list = (data.doctors ?? []) as (PendingDoctor & { verified?: boolean })[];
      setPending(list.filter((d) => d.verified === false));
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  function flash(m: string) {
    setMessage(m);
    setTimeout(() => setMessage(""), 4000);
  }

  async function approve(d: PendingDoctor, confirmConsent = false) {
    setBusyId(d.id);
    const res = await fetch(`/api/doctors/${d.id}/verify`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(confirmConsent ? { confirm_consent: true } : {}),
    });
    if (res.ok) {
      setPending((prev) => prev.filter((x) => x.id !== d.id));
      flash(`✅ ${d.name} is now public in the directory`);
      setBusyId(null);
      return;
    }
    const e = (await res.json().catch(() => ({}))) as { error?: string; needs_consent?: boolean };
    setBusyId(null);
    // No recorded consent: the admin may still vouch, but explicitly — and
    // that confirmation is written to the audit trail under their name.
    if (e.needs_consent) {
      if (
        confirm(
          `${d.name} has no recorded consent.\n\nApproving publishes their name, chamber address and phone number. Only continue if you know the doctor agreed — this confirmation is recorded under your name.\n\nApprove anyway?`
        )
      ) {
        await approve(d, true);
      }
      return;
    }
    flash("❌ " + (e.error || "Could not approve."));
  }

  async function saveEdit(d: PendingDoctor) {
    setBusyId(d.id);
    const res = await fetch(`/api/doctors/${d.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    if (res.ok) {
      const { doctor } = await res.json();
      setPending((prev) => prev.map((x) => (x.id === d.id ? { ...x, ...doctor } : x)));
      setEditingId(null);
      flash(`✏️ ${doctor.name}'s details corrected`);
    } else {
      const e = (await res.json().catch(() => ({}))) as { error?: string };
      flash("❌ " + (e.error || "Could not save."));
    }
    setBusyId(null);
  }

  async function reject(d: PendingDoctor) {
    if (
      !confirm(
        `Delete ${d.name}'s submission?\n\nThis removes the profile entirely. Use this when the entry is wrong, a duplicate, or the doctor did not agree to be listed.`
      )
    )
      return;
    setBusyId(d.id);
    const res = await fetch(`/api/doctors/${d.id}`, { method: "DELETE" });
    if (res.ok) {
      setPending((prev) => prev.filter((x) => x.id !== d.id));
      flash(`🗑 ${d.name}'s submission deleted`);
    } else {
      flash("❌ Could not delete.");
    }
    setBusyId(null);
  }

  const field = (label: string, value: string | null | undefined) =>
    value && value.trim() ? (
      <div key={label} className="flex gap-2 text-sm">
        <span className="w-36 flex-none text-xs font-semibold uppercase tracking-wide text-gray-400">
          {label}
        </span>
        <span className="min-w-0 flex-1 text-gray-700">{value}</span>
      </div>
    ) : null;

  return (
    <div className="min-h-screen bg-blue-50 p-6">
      <div className="max-w-4xl mx-auto">
        <AdminNav />

        <h2 className="text-lg font-bold text-gray-800 mb-1">Doctor Approvals</h2>
        <p className="text-sm text-gray-500 mb-4">
          Profiles added by medical representatives. They stay invisible to the
          public until you approve them here.
        </p>

        {message && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-white px-4 py-3 text-sm font-medium text-blue-800">
            {message}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl bg-white p-10 text-center text-gray-400 shadow-sm">
            Loading…
          </div>
        ) : pending.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
            <p className="text-3xl mb-2">✅</p>
            <p className="font-semibold text-gray-700">Nothing waiting for approval</p>
            <p className="text-sm text-gray-400 mt-1">
              New doctors added by MRs will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {pending.map((d) => (
              <div key={d.id} className="rounded-2xl bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-gray-800">{d.name}</h3>
                    <p className="text-sm font-medium text-blue-700">
                      {d.specialty}
                      {d.qualification ? ` · ${d.qualification}` : ""}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Added by {d.added_by_name ?? "unknown"}
                      {d.added_by_role ? ` (${d.added_by_role})` : ""}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      d.consent_given
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {d.consent_given
                      ? `✓ Consent recorded${d.consent_by_name ? ` — ${d.consent_by_name}` : ""}`
                      : "⚠ No consent recorded"}
                  </span>
                </div>

                <div className="mt-4 space-y-1.5 border-t border-gray-100 pt-4">
                  {field("🏥 Hospital", d.hospital)}
                  {field("📍 Chamber", d.chamber_address)}
                  {field("📞 Phone", d.phone)}
                  {field("🩺 OPD timing", d.consultation_timing)}
                  {field(
                    "👜 MR visiting",
                    [d.mr_visiting_days, d.mr_visiting_time].filter(Boolean).join(" · ")
                  )}
                </div>

                {editingId === d.id ? (
                  // Reviewing is exactly when a typo gets noticed, so the fix
                  // belongs here rather than three screens away.
                  <div className="mt-4 space-y-2 rounded-xl border border-blue-200 bg-blue-50 p-3">
                    {(
                      [
                        ["name", "Name"],
                        ["specialty", "Specialty"],
                        ["qualification", "Qualification"],
                        ["hospital", "Hospital"],
                        ["chamber_address", "Chamber address"],
                        ["phone", "Phone"],
                        ["secretary_contact", "Chamber / secretary number"],
                        ["consultation_timing", "OPD timing"],
                      ] as [keyof PendingDoctor, string][]
                    ).map(([k, label]) => (
                      <div key={String(k)}>
                        <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          {label}
                        </label>
                        <input
                          value={(draft[k] as string) ?? ""}
                          onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                          className="h-9 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-500"
                        />
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <button
                        disabled={busyId === d.id}
                        onClick={() => void saveEdit(d)}
                        className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-bold text-white disabled:opacity-50"
                      >
                        Save corrections
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    disabled={busyId === d.id}
                    onClick={() => void approve(d)}
                    className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    ✓ Approve — make public
                  </button>
                  <button
                    disabled={busyId === d.id}
                    onClick={() => { setEditingId(editingId === d.id ? null : d.id); setDraft(d); }}
                    className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    ✏️ Edit
                  </button>
                  <button
                    disabled={busyId === d.id}
                    onClick={() => void reject(d)}
                    className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
