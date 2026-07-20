import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://medconnect-india.vercel.app";

// The public directory SHOULD be found by search — a patient googling
// "<doctor name> chamber timing" is exactly who we want to reach. Everything
// behind a login, and every private chamber link, stays out of the index.
export default function robots(): MetadataRoute.Robots {
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
