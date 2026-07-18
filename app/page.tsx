import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LoginModal } from "@/components/auth/login-modal";
import { Stethoscope, Search, MapPin, Clock, BadgeCheck } from "lucide-react";

// Simplified homepage: one job for the public (find a doctor, see live
// status) and one clear door for MRs (log in → dashboard). No fake stats,
// no placeholder sections, no links to pages that don't exist yet.
export default function Home() {
  return (
    <main className="min-h-screen bg-white dark:bg-slate-950 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white/80 dark:bg-slate-950/80 backdrop-blur z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2">
            <Stethoscope className="h-6 w-6 text-blue-600" />
            <span className="text-lg font-bold text-slate-900 dark:text-white">
              MedConnect <span className="text-emerald-600">India</span>
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/doctors"
              className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 px-2"
            >
              Doctors
            </Link>
            <LoginModal />
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              nativeButton={false}
              render={<Link href="/signup" />}
            >
              Sign Up
            </Button>
          </div>
        </div>
      </header>

      {/* Hero: one headline, one search box */}
      <section className="bg-gradient-to-b from-blue-50 to-white dark:from-slate-900 dark:to-slate-950">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
          <h1 className="text-3xl sm:text-5xl font-bold text-slate-900 dark:text-white leading-tight text-balance">
            Is the doctor available <span className="text-blue-600">right now?</span>
          </h1>
          <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-xl mx-auto">
            Live doctor availability, today&apos;s hours, and chamber details —
            updated from the field, free to check.
          </p>

          {/* Plain GET form: works without JavaScript, lands on /doctors?q=… */}
          <form
            action="/doctors"
            method="GET"
            className="mt-8 max-w-xl mx-auto flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-md p-2"
          >
            <Search className="h-5 w-5 text-slate-400 ml-2 shrink-0" />
            <input
              type="text"
              name="q"
              placeholder="Search doctor by name…"
              className="flex-1 min-w-0 bg-transparent text-sm sm:text-base text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
            />
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700 rounded-xl shrink-0">
              Search
            </Button>
          </form>

          <p className="mt-3 text-sm text-slate-500">
            or{" "}
            <Link href="/doctors" className="text-blue-600 font-medium hover:underline">
              browse all doctors →
            </Link>
          </p>
        </div>
      </section>

      {/* How it works — 3 steps, same story for patients and MRs */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-14 w-full">
        <div className="grid sm:grid-cols-3 gap-6 text-center">
          {[
            {
              icon: <Search className="h-6 w-6" />,
              title: "Search a doctor",
              text: "By name — city and specialty filters are on the directory.",
            },
            {
              icon: <Clock className="h-6 w-6" />,
              title: "Check live status",
              text: "Available, busy or OPD closed — with today's hours and who updated it.",
            },
            {
              icon: <MapPin className="h-6 w-6" />,
              title: "Visit at the right time",
              text: "Chamber address and timings on every card. No wasted trips.",
            },
          ].map((s, i) => (
            <div key={s.title} className="flex flex-col items-center">
              <div className="h-12 w-12 rounded-2xl bg-blue-50 dark:bg-slate-900 text-blue-600 grid place-items-center">
                {s.icon}
              </div>
              <p className="mt-3 font-semibold text-slate-900 dark:text-white">
                {i + 1}. {s.title}
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-xs">
                {s.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* MR door */}
      <section className="bg-slate-50 dark:bg-slate-900 border-y border-slate-200 dark:border-slate-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="text-center sm:text-left">
            <p className="font-bold text-slate-900 dark:text-white text-lg flex items-center gap-2 justify-center sm:justify-start">
              <BadgeCheck className="h-5 w-5 text-emerald-600" />
              Medical Representative?
            </p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 max-w-md">
              Plan your day&apos;s visits, update doctor status for your beat,
              and track your monthly calls — free.
            </p>
          </div>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
            nativeButton={false}
            render={<Link href="/login" />}
          >
            MR Login →
          </Button>
        </div>
      </section>

      {/* Footer — only links that exist */}
      <footer className="mt-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-slate-500">
          <p className="flex items-center gap-2">
            <Stethoscope className="h-4 w-4 text-blue-500" />
            © 2026 MedConnect India · Kolkata, West Bengal
          </p>
          <div className="flex items-center gap-4">
            <Link href="/doctors" className="hover:text-blue-600">Doctor Directory</Link>
            <Link href="/status-board" className="hover:text-blue-600">Status Board</Link>
            <Link href="/login" className="hover:text-blue-600">Login</Link>
            <a href="mailto:support@medconnectindia.com" className="hover:text-blue-600">
              support@medconnectindia.com
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
