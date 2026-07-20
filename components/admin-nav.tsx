"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";

// Admin sections were unreachable from each other: the user manager was the
// only page, so an admin looking for doctor approvals found nothing and
// reasonably concluded the feature did not exist. This nav is the fix — and
// the pending count is on it, because an approvals queue nobody can see is a
// queue that never gets worked.
const LINKS = [
  { href: "/admin/doctors", label: "🩺 Doctor Approvals" },
  { href: "/admin/users", label: "👥 Users" },
  { href: "/doctors", label: "📖 Directory" },
];

export function AdminNav() {
  const pathname = usePathname();
  const [pending, setPending] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/admin/pending-count", { cache: "no-store" });
        if (r.ok) setPending((await r.json()).pending ?? 0);
      } catch {
        /* count is a nicety, never block the nav on it */
      }
    })();
  }, [pathname]);

  return (
    <div className="mb-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-blue-700 mb-1">MedConnect India</h1>
          <p className="text-gray-500 text-sm">Admin</p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
        >
          Log out
        </button>
      </div>
      <nav className="mt-4 flex flex-wrap gap-2">
        {LINKS.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                active
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:border-gray-400"
              }`}
            >
              {l.label}
              {l.href === "/admin/doctors" && pending ? (
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                    active ? "bg-white text-blue-700" : "bg-amber-500 text-white"
                  }`}
                >
                  {pending}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
