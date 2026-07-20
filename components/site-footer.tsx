import Link from "next/link";

// One footer for every page. It carries the two things a public health-adjacent
// directory must always be one tap away from: what we do NOT claim (the
// medical disclaimer), and how a doctor gets their listing corrected or
// removed. Both live in the legal pages this links to.
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-slate-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-3">
        <p className="text-xs text-slate-400 leading-relaxed">
          MedConnect India reports doctor availability as confirmed by doctors,
          their chamber staff and visiting medical representatives. Availability
          can change without notice — please call the chamber before travelling.
          Nothing here is medical advice.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-slate-500">
          <p>© 2026 MedConnect India · Kolkata, West Bengal</p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <Link href="/doctors" className="hover:text-blue-600">Doctor Directory</Link>
            <Link href="/status-board" className="hover:text-blue-600">Status Board</Link>
            <Link href="/privacy" className="hover:text-blue-600">Privacy</Link>
            <Link href="/terms" className="hover:text-blue-600">Terms</Link>
            <Link href="/login" className="hover:text-blue-600">Login</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
