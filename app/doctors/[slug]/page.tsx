import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { istDayKey } from "@/lib/ist";
import { timetableFallback } from "@/lib/status-freshness";
import { doctorShareMessage } from "@/lib/doctor-share";
import { doctorSlug, idFromSlug } from "@/lib/doctor-slug";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { DoctorAvatar } from "@/components/doctor-avatar";
import { DoctorActions } from "./doctor-actions";

// ─────────────────────────────────────────────────────────────────────────────
// A doctor's own public page — server-rendered so Google indexes it and a
// WhatsApp forward lands on ONE doctor, not a search box. Only VERIFIED
// doctors get a page; anything else is a 404 (same as "no such doctor" — an
// unverified profile must never be discoverable).
// ─────────────────────────────────────────────────────────────────────────────

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://medconnect-india.vercel.app";

const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_SHORT: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

async function getVerifiedDoctor(slug: string) {
  const id = idFromSlug(slug);
  const d = await prisma.doctor.findUnique({ where: { id } });
  if (!d || !d.verified) return null;
  return d;
}

function callTarget(d: { secretaryContact: string | null; phone: string }) {
  const sec = (d.secretaryContact ?? "").trim();
  if (sec) return { number: sec, via: "chamber desk" };
  const own = (d.phone ?? "").trim();
  if (own) return { number: own, via: "doctor's number" };
  return null;
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const d = await getVerifiedDoctor(slug);
  if (!d) return { title: "Doctor not found" };

  const where = [d.hospital, d.chamberAddress].filter(Boolean).join(", ");
  const title = `${d.name} — ${d.specialty}${where ? `, ${where}` : ""}`;
  const description = `Check ${d.name}'s live availability, chamber timings${
    d.consultationTiming ? ` (${d.consultationTiming})` : ""
  } and contact on MedConnect India before you visit.`;
  const url = `${SITE_URL}/doctors/${doctorSlug(d)}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "profile" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function DoctorPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const d = await getVerifiedDoctor(slug);
  if (!d) notFound();

  const timetable = (d.weeklyTimetable ?? null) as Record<string, string> | null;
  const todayHours = timetableFallback(timetable, istDayKey(), d.consultationTiming);
  const t = callTarget(d);

  // What the client badge needs — a plain, serializable subset.
  const statusFields = {
    status: d.status,
    status_updated_at: d.statusUpdatedAt ? d.statusUpdatedAt.toISOString() : null,
    status_updated_by_role: d.statusUpdatedByRole,
    // Public page = anonymous reader: MR identity withheld (privacy rule).
    status_updated_by_name: null,
    status_updated_by_company: null,
    timetable,
    consultation_timing: d.consultationTiming,
  };

  const dest =
    d.latitude != null && d.longitude != null
      ? `${d.latitude},${d.longitude}`
      : [d.hospital, d.chamberAddress].filter(Boolean).join(", ");
  const directionsHref = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;

  const pageUrl = `${SITE_URL}/doctors/${doctorSlug(d)}`;
  const shareMsg = doctorShareMessage({
    name: d.name, specialty: d.specialty, status: d.status,
    isLive: false, confidence: "stale", // server can't compute "now"; the message links to the live page
    patientsLeft: null, patientsSource: null,
    todayHours, place: d.hospital, number: t?.number ?? null, link: pageUrl,
  });
  const shareHref = `https://wa.me/?text=${encodeURIComponent(shareMsg)}`;

  // Physician structured data — lets search show a rich result.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Physician",
    name: d.name,
    medicalSpecialty: d.specialty,
    address: { "@type": "PostalAddress", streetAddress: d.chamberAddress },
    ...(t ? { telephone: t.number } : {}),
    ...(d.latitude != null && d.longitude != null
      ? { geo: { "@type": "GeoCoordinates", latitude: d.latitude, longitude: d.longitude } }
      : {}),
    url: pageUrl,
  };

  return (
    <div className="min-h-screen bg-blue-50 flex flex-col">
      <SiteHeader />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="max-w-2xl mx-auto w-full px-4 py-8 flex-1">
        <Link href="/doctors" className="text-sm font-semibold text-blue-700 hover:underline">
          ← All doctors
        </Link>

        <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <DoctorAvatar name={d.name} photo={d.photo} size={64} />
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-gray-800 leading-tight">{d.name}</h1>
              <p className="text-sm font-medium text-blue-700">{d.specialty}</p>
              <p className="text-xs text-gray-500">{d.qualification}</p>
            </div>
          </div>

          <DoctorActions
            doctor={statusFields}
            callNumber={t?.number ?? null}
            callVia={t?.via ?? ""}
            directionsHref={directionsHref}
            shareHref={shareHref}
          />

          <div className="mt-5 space-y-1.5 border-t border-gray-100 pt-4 text-sm text-gray-600">
            {todayHours ? <p className="font-medium text-emerald-700">🕐 Today: {todayHours}</p> : null}
            <p>🏥 {d.hospital}</p>
            <p>📍 {d.chamberAddress}</p>
            {d.consultationTiming ? <p>🩺 OPD: {d.consultationTiming}</p> : null}
            {d.experience ? <p>⭐ {d.experience} yrs experience</p> : null}
          </div>

          {timetable && Object.keys(timetable).length > 0 ? (
            <div className="mt-4 rounded-xl bg-blue-50 p-3 space-y-0.5">
              <p className="text-xs font-bold text-blue-800 mb-1">Weekly timetable</p>
              {DAY_ORDER.map((k) => (
                <div key={k} className={`text-xs flex gap-2 ${k === istDayKey() ? "font-bold text-blue-800" : "text-gray-600"}`}>
                  <span className="w-9 flex-none">{DAY_SHORT[k]}</span>
                  <span className="min-w-0">{timetable[k] || "—"}</span>
                  {k === istDayKey() && <span className="text-blue-500 flex-none">← today</span>}
                </div>
              ))}
            </div>
          ) : null}

          <p className="mt-4 text-[10px] text-gray-400">
            Availability is reported by the doctor, their chamber staff, or a visiting
            medical representative and can change without notice. Please call the chamber
            before travelling. This is not medical advice.
          </p>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
