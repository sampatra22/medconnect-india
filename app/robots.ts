import type { MetadataRoute } from "next";
import { SITE_URL, SITE_LAUNCHED } from "@/lib/site";

// Pre-launch: disallow everything, so the staging environment is invisible to
// crawlers while we build. Launch flips one env var (see lib/site.ts).
//
// Launched: the public directory SHOULD be found — a patient googling
// "<doctor name> chamber timing" is exactly who we want to reach. Everything
// behind a login, and every private chamber link, always stays out.
export default function robots(): MetadataRoute.Robots {
  if (!SITE_LAUNCHED) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/doctors", "/status-board"],
        disallow: [
          "/api/",
          "/update/", // private chamber update links — never indexable
          "/dashboard/",
          "/admin/",
          "/login",
          "/signup",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
