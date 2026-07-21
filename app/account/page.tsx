"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { homeFor, ROLE_CONFIG } from "@/lib/roles";

// Account settings — one page for every role. Today that means changing your
// password; profile fields can join later without a new page.
export default function AccountPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user as
    | { name?: string | null; email?: string | null; role?: string }
    | undefined;

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  if (status === "unauthenticated") {
    router.replace("/login");
    return null;
  }
  if (status === "loading" || !user) {
    return <div className="min-h-screen bg-blue-50" />;
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next.length < 8) {
      setMsg({ ok: false, text: "New password must be at least 8 characters." });
      return;
    }
    if (next !== confirm) {
      setMsg({ ok: false, text: "New passwords do not match." });
      return;
    }
    setSaving(true);
    const res = await fetch("/api/account/password", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password: current, new_password: next }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setSaving(false);
    if (res.ok) {
      setCurrent("");
      setNext("");
      setConfirm("");
      setMsg({ ok: true, text: "Password changed. Use the new one from your next login." });
    } else {
      setMsg({ ok: false, text: data.error || "Could not change the password." });
    }
  }

  const roleLabel = user.role ? ROLE_CONFIG[user.role]?.label ?? user.role : "";

  return (
    <div className="min-h-screen bg-blue-50">
      <div className="max-w-md mx-auto px-4 py-10">
        <Link
          href={homeFor(user.role ?? "")}
          className="text-sm font-semibold text-blue-700 hover:underline"
        >
          ← Back to dashboard
        </Link>

        <div className="mt-4 bg-white rounded-2xl shadow-sm p-6">
          <h1 className="text-xl font-bold text-gray-800">Account</h1>
          <p className="text-sm text-gray-500 mt-1">
            {user.name} · {roleLabel}
          </p>
          <p className="text-xs text-gray-400">{user.email}</p>

          <form onSubmit={changePassword} className="mt-6 space-y-3">
            <h2 className="text-sm font-bold text-gray-700">Change password</h2>
            {(
              [
                ["Current password", current, setCurrent],
                ["New password (min 8 characters)", next, setNext],
                ["Repeat new password", confirm, setConfirm],
              ] as [string, string, (v: string) => void][]
            ).map(([label, value, set]) => (
              <div key={label}>
                <label className="mb-1 block text-xs font-semibold text-gray-500">
                  {label}
                </label>
                <input
                  type="password"
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  required
                  className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-blue-500"
                />
              </div>
            ))}

            {msg ? (
              <p
                className={`text-sm font-medium ${msg.ok ? "text-emerald-600" : "text-red-600"}`}
              >
                {msg.ok ? "✓ " : ""}
                {msg.text}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Change password"}
            </button>
          </form>

          <p className="mt-4 text-[11px] text-gray-400">
            Forgot your current password? There is no self-service reset yet —
            ask an admin to recreate your account.
          </p>
        </div>
      </div>
    </div>
  );
}
