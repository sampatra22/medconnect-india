import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/authz";
import { rolesWith } from "@/lib/roles";
import { guarded } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";

// ─────────────────────────────────────────────────────────────────────────────
// Address lookup via OpenStreetMap Nominatim — free, no API key, no billing.
//
// Proxied through our own server rather than called from the browser for three
// reasons: Nominatim's policy requires an identifying User-Agent (a browser
// can't set one), it keeps the MR's IP out of a third party's logs, and it
// lets us rate-limit before we ever touch a free service that would otherwise
// block us. Results are coordinates + a display name; we store only the text
// the MR accepts. If coverage disappoints in the field, swapping in Google
// Places means changing this one file.
// ─────────────────────────────────────────────────────────────────────────────

const CAN_ADD = rolesWith("add_doctor");

type NominatimResult = {
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: Record<string, string>;
};

// Trim OSM's long-winded output to something an MR would actually write on a
// card: "Salt Lake Sector 1, Bidhannagar, Kolkata, 700064".
function tidy(r: NominatimResult): string {
  const a = r.address ?? {};
  const parts = [
    a.amenity || a.building || a.shop || a.healthcare,
    a.road,
    a.neighbourhood || a.suburb || a.residential,
    a.city_district || a.city || a.town || a.village,
    a.postcode,
  ]
    .map((p) => (p ?? "").trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const deduped = parts.filter((p) => {
    const k = p.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return deduped.length >= 2 ? deduped.join(", ") : (r.display_name ?? "").trim();
}

export const GET = guarded(async (request: NextRequest) => {
  const { user, response } = await requireUser(CAN_ADD);
  if (!user) return response;

  // Nominatim's usage policy is ~1 request/second. The client debounces; this
  // is the hard backstop that keeps us a good citizen of a free service.
  if (!rateLimit(`geo:${user.id}`, 40, 5 * 60 * 1000)) {
    return NextResponse.json({ results: [] });
  }

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 3) return NextResponse.json({ results: [] });

  const url =
    "https://nominatim.openstreetmap.org/search?" +
    new URLSearchParams({
      q,
      format: "jsonv2",
      addressdetails: "1",
      limit: "6",
      countrycodes: "in", // India only — this is an India-first product
    }).toString();

  try {
    const res = await fetch(url, {
      headers: {
        // Required by Nominatim's policy: identify the app and a contact.
        "User-Agent": "MedConnectIndia/1.0 (https://medconnect-india.vercel.app)",
        "Accept-Language": "en",
      },
      // Never let a slow third party stall an MR mid-entry.
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return NextResponse.json({ results: [] });

    const data = (await res.json()) as NominatimResult[];
    const results = data
      .map((r) => ({
        label: tidy(r),
        lat: r.lat ? Number(r.lat) : null,
        lon: r.lon ? Number(r.lon) : null,
      }))
      .filter((r) => r.label);
    return NextResponse.json({ results });
  } catch {
    // Offline, timeout, or the service is down — the MR types it manually.
    return NextResponse.json({ results: [] });
  }
});
