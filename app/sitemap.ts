import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { doctorSlug } from "@/lib/doctor-slug";
import { SITE_URL, SITE_LAUNCHED } from "@/lib/site";

// Static routes plus every VERIFIED doctor's own page — this is how a patient
// searching "<doctor> chamber timing" finds us. Unverified profiles are never
// listed (they aren't public). Wrapped so a DB hiccup degrades to the static
// map rather than a broken sitemap.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Empty until launch — no crawler should be handed URLs to a staging site.
  if (!SITE_LAUNCHED) return [];
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/doctors`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/status-board`, lastModified: now, changeFrequency: "hourly", priority: 0.7 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
  try {
    const docs = await prisma.doctor.findMany({
      where: { verified: true },
      select: { id: true, name: true, updatedAt: true },
    });
    return [
      ...staticRoutes,
      ...docs.map((d) => ({
        url: `${SITE_URL}/doctors/${doctorSlug(d)}`,
        lastModified: d.updatedAt,
        changeFrequency: "daily" as const,
        priority: 0.6,
      })),
    ];
  } catch {
    return staticRoutes;
  }
}
