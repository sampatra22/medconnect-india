"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { Stethoscope } from "lucide-react";
import { homeFor, ROLE_CONFIG } from "@/lib/roles";

// ─────────────────────────────────────────────────────────────────────────────
// One header for every public page.
//
// The bug this replaces: public pages had no idea anyone was signed in, so an
// admin browsing the directory was invited to "Log in / Sign Up", had no way
// back to their dashboard, and no way to sign out without guessing a URL.
// Auth state belongs in ONE component — three pages each rendering their own
// idea of the header is how that drift happened in the first place.
// ─────────────────────────────────────────────────────────────────────────────

export function SiteHeader() {
  const { data: session, status } = useSession();
  const user = session?.user as { name?: string | null; role?: string } | undefined;
  const roleLabel = user?.role ? ROLE_CONFIG[user.role]?.label ?? user.role : "";

  return (
    <header className="border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white/80 dark:bg-slate-950/80 backdrop-blur z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2 min-w-0">
          <Stethoscope className="h-6 w-6 flex-none text-blue-600" />
          <span className="truncate text-lg font-bold text-slate-900 dark:text-white">
            MedConnect <span className="text-emerald-600">India</span>
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/doctors"
            className="hidden sm:inline text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 px-2"
          >
            Doctors
          </Link>

          {/* Render nothing auth-shaped until the session resolves — flashing
              "Log in" at someone who is already signed in is the bug itself,
              just briefer. */}
          {status === "loading" ? (
            <div className="h-9 w-24 rounded-lg bg-slate-100 animate-pulse" aria-hidden />
          ) : user ? (
            <>
              <Link
                href={homeFor(user.role ?? "")}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:border-blue-400"
                title="Go to your dashboard"
              >
                <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
                  {(user.name ?? "?").trim().charAt(0).toUpperCase()}
                </span>
                <span className="hidden sm:inline font-semibold text-slate-700">
                  {user.name}
                </span>
                {roleLabel ? (
                  <span className="hidden sm:inline text-[11px] font-semibold text-slate-400">
                    {roleLabel}
                  </span>
                ) : null}
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:border-blue-400"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
