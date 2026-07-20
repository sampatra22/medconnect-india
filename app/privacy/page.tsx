import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { CONTACT_EMAIL } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Privacy Policy · MedConnect India",
  description:
    "What MedConnect India collects, what is public, and how a doctor can correct or remove their listing.",
};

// Written to describe what the code ACTUALLY does — every claim here is
// checkable against the app. Keep it that way: if the data model changes,
// this page changes in the same commit.
export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white flex flex-col">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 flex-1">
        <Link href="/" className="text-sm font-semibold text-blue-700 hover:underline">
          ← MedConnect India
        </Link>
        <h1 className="text-3xl font-bold text-blue-800 mt-4">Privacy Policy</h1>
        <p className="text-sm text-slate-400 mt-1">Last updated 21 July 2026</p>

        <div className="prose prose-slate mt-6 space-y-6 text-[15px] leading-relaxed text-slate-700">
          <section>
            <h2 className="text-lg font-bold text-slate-800">In short</h2>
            <p>
              MedConnect India is a directory of doctors&apos; consulting
              availability, used by patients, medical representatives (MRs),
              chamber staff and pharmaceutical companies. We collect as little
              as the service needs, we never sell data, and we do not run ads.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-800">Information that is public</h2>
            <p>
              The doctor directory is public and readable without an account. For
              each listed doctor it may show: name, qualification, specialty,
              hospital or chamber, chamber address, consulting timings, weekly
              timetable, a contact number for the chamber, and the current
              availability status.
            </p>
            <p>
              Availability updates carry an attribution so readers can judge how
              much to trust them. When an MR updates a status, their{" "}
              <strong>name and company</strong> are shown publicly — this is the
              accountability mechanism that keeps reported information honest.
              An MR&apos;s phone number, email and other profile details are never
              shown publicly.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-800">Information we collect from account holders</h2>
            <p>
              Creating an account (MRs, doctors, chamber staff, chemists,
              stockists, companies, admins) stores your name, email address, a
              securely hashed password — we never store passwords in readable
              form — your role, and optionally your company name. MRs may add
              territory, segment and experience to their own profile; these stay
              private to that MR and to administrators.
            </p>
            <p>
              We keep a record of changes made to doctor listings and statuses
              (who changed what and when) so that incorrect information can be
              traced and corrected. This record is visible to signed-in users and
              administrators, not to the public.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-800">Chamber update links</h2>
            <p>
              A doctor or their chamber staff may be given a private link that
              lets them update that one doctor&apos;s availability without creating
              an account. The link can only change availability and patient
              count for that doctor, and it can be disabled at any time by the
              doctor, the medical representative who issued it, or an
              administrator. Please treat the link as private to your chamber.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-800">
              Doctors: correcting or removing your listing
            </h2>
            <p>
              If you are a doctor listed here and you want your entry corrected,
              your phone number hidden, or your listing removed entirely, write
              to <a className="text-blue-700 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>{" "}
              from any address, or ask the medical representative who visits you.
              We will act on removal requests promptly and without argument. You
              do not need an account to make this request, and you do not need to
              give a reason.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-800">Your rights</h2>
            <p>
              Under India&apos;s Digital Personal Data Protection Act, 2023 you may
              ask us what personal data of yours we hold, ask for it to be
              corrected, or ask for it to be erased. Write to{" "}
              <a className="text-blue-700 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>{" "}
              and we will respond. If you hold an account, you may request
              deletion of the account and its personal details at the same
              address.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-800">How data is stored</h2>
            <p>
              Data is stored in a managed PostgreSQL database that is not exposed
              to the public internet, and the site is served over HTTPS.
              Passwords are hashed. Access to administrative functions is limited
              to accounts with the administrator role.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-800">Cookies</h2>
            <p>
              We use a single session cookie to keep you signed in. We do not use
              advertising or third-party tracking cookies. Browsing the public
              directory does not require a cookie.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-800">Children</h2>
            <p>
              MedConnect India is intended for adults. We do not knowingly create
              accounts for anyone under 18.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-800">Changes and contact</h2>
            <p>
              If this policy changes we will update the date at the top of this
              page. Questions, corrections and data requests:{" "}
              <a className="text-blue-700 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          </section>
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}
