import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { CONTACT_EMAIL } from "@/lib/contact";

export const metadata: Metadata = {
  // Root layout appends "· MedConnect India" via its title template.
  title: "Terms of Use",
  description:
    "Terms of use for MedConnect India, including the medical disclaimer and rules for updating doctor availability.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white flex flex-col">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 flex-1">
        <Link href="/" className="text-sm font-semibold text-blue-700 hover:underline">
          ← MedConnect India
        </Link>
        <h1 className="text-3xl font-bold text-blue-800 mt-4">Terms of Use</h1>
        <p className="text-sm text-slate-400 mt-1">Last updated 21 July 2026</p>

        <div className="mt-6 space-y-6 text-[15px] leading-relaxed text-slate-700">
          {/* The disclaimer leads, because it is the term that matters most to
              the person most at risk: a patient about to travel. */}
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-lg font-bold text-amber-900">
              Medical disclaimer — please read
            </h2>
            <p className="mt-2 text-amber-900">
              MedConnect India is an availability directory, not a medical
              service. Nothing on this site is medical advice, diagnosis or
              treatment, and it is not a substitute for consulting a qualified
              doctor. In an emergency, call 112 or go to your nearest hospital —
              do not rely on this site.
            </p>
            <p className="mt-2 text-amber-900">
              Availability information is reported by doctors, their chamber
              staff and visiting medical representatives. It can be wrong or out
              of date, and a doctor&apos;s plans can change without notice. Always
              call the chamber before travelling. We show you when a status was
              last confirmed and who confirmed it precisely so that you can judge
              it for yourself.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-800">Using the directory</h2>
            <p>
              Anyone may read the public directory. You may share links and
              status messages from MedConnect India freely — that is what they
              are for. Please do not scrape the site in bulk, resell the data, or
              use the listed phone numbers for marketing or spam.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-800">Accounts</h2>
            <p>
              You are responsible for what happens under your account and for
              keeping your password to yourself. Accounts are for the role you
              signed up as. We may suspend an account that posts false
              information, harasses others, or misuses contact details.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-800">
              Updating a doctor&apos;s availability
            </h2>
            <p>
              If you update a status — as a doctor, chamber staff member, or
              medical representative — you must report only what you have
              actually seen or been told. Updates made by medical
              representatives are published with their name and company
              attached, and are labelled as reported rather than confirmed.
            </p>
            <p>
              Deliberately entering false availability harms patients who travel
              on the strength of it, and is grounds for removing your access.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-800">
              Doctors: your listing
            </h2>
            <p>
              If you are listed here, you may have your entry corrected, your
              phone number hidden, or your listing removed at any time by writing
              to{" "}
              <a className="text-blue-700 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
              No reason is needed and we will act promptly.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-800">
              Chamber update links
            </h2>
            <p>
              A private update link is issued for one doctor and controls only
              that doctor&apos;s availability. Keep it within the chamber. It can be
              disabled at any time by the doctor, the medical representative who
              issued it, or an administrator.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-800">Availability of the service</h2>
            <p>
              MedConnect India is provided as-is and free of charge. We do not
              guarantee that the site will be available without interruption, or
              that the information on it is complete or accurate. To the extent
              permitted by law, we are not liable for losses arising from
              reliance on the information here — including a wasted journey.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-800">Governing law and contact</h2>
            <p>
              These terms are governed by the laws of India, with courts at
              Kolkata, West Bengal having jurisdiction. Questions:{" "}
              <a className="text-blue-700 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          </section>
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}
