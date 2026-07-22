// ─────────────────────────────────────────────────────────────────────────────
// One switch controls whether the world can find this site.
//
// SITE_LAUNCHED is false by default. While false, EVERY page carries a
// noindex robots tag and robots.txt disallows all crawlers — so search
// engines and AI answer-engines index nothing, even though all the SEO/GEO/AEO
// machinery is fully built and testable. On launch day, set
// NEXT_PUBLIC_SITE_LAUNCHED=true in Vercel and redeploy; nothing else changes.
// ─────────────────────────────────────────────────────────────────────────────

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://medconnect-india.vercel.app";

export const SITE_LAUNCHED = process.env.NEXT_PUBLIC_SITE_LAUNCHED === "true";

// Spread into any `metadata` / generateMetadata result. Undefined once
// launched (Next then defaults to indexable); a hard noindex until then.
export const preLaunchRobots = SITE_LAUNCHED
  ? undefined
  : { index: false, follow: false, nocache: true };
