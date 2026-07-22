"use client";

import { DoctorStatusBadge, StatusAttribution, type StatusFields } from "@/components/doctor-status";
import { track } from "@/lib/track";

// The interactive strip on a per-doctor page: the live badge (client, ticks
// itself) plus the two patient actions. Kept small and separate so the page
// itself stays a server component that search engines see fully rendered.

export function DoctorActions({
  doctor,
  callNumber,
  callVia,
  directionsHref,
  shareHref,
}: {
  doctor: StatusFields;
  callNumber: string | null;
  callVia: string;
  directionsHref: string;
  shareHref: string;
}) {
  return (
    <>
      <div className="mt-3">
        <DoctorStatusBadge doctor={doctor} />
        <div className="mt-1">
          <StatusAttribution doctor={doctor} className="block" />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        {callNumber ? (
          <a
            href={`tel:${callNumber.replace(/[^+\d]/g, "")}`}
            onClick={() => track("call_tap")}
            className="rounded-xl bg-emerald-600 py-3 text-center text-sm font-bold text-white active:bg-emerald-700"
          >
            📞 Call
            <span className="block text-[10px] font-normal text-emerald-100">{callVia}</span>
          </a>
        ) : null}
        <a
          href={directionsHref}
          onClick={() => track("directions_tap")}
          target="_blank"
          rel="noopener noreferrer"
          className={`rounded-xl bg-blue-600 py-3 text-center text-sm font-bold text-white active:bg-blue-700 ${callNumber ? "" : "col-span-2"}`}
        >
          🧭 Directions
          <span className="block text-[10px] font-normal text-blue-100">from your location</span>
        </a>
      </div>
      <a
        href={shareHref}
        onClick={() => track("share_tap")}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 block text-center text-xs font-semibold text-emerald-700 hover:underline"
      >
        📤 Share this doctor on WhatsApp
      </a>
    </>
  );
}
