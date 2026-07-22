import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { bumpMetric } from "@/lib/metrics";

// ─────────────────────────────────────────────────────────────────────────────
// Count an event. Public on purpose — patients are anonymous and their visits
// are exactly what Phase 1 needs to measure. Defensive on purpose too: only
// whitelisted event names, atomic upsert-increment, and a per-IP ceiling so a
// bored script can inflate a counter only so far. A counter that might read
// slightly high under abuse is fine; one that leaks who did what is not — so
// nothing but (day, event, +1) is ever stored.
// ─────────────────────────────────────────────────────────────────────────────

const EVENTS = new Set([
  "directory_view",
  "board_view",
  "detail_open",
  "call_tap",
  "directions_tap",
  "share_tap",
  "board_share",
  "pa_page_view",
  // server-side truth events (recorded by their own routes, not the beacon):
  // "status_update", "pa_status_update"
]);

export const POST = guarded(async (request: NextRequest) => {
  const ip = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  if (!rateLimit(`metric:${ip}`, 120, 10 * 60 * 1000)) {
    return NextResponse.json({ ok: true }); // silently drop; never punish the page
  }
  const b = (await request.json().catch(() => ({}))) as { event?: unknown };
  const event = String(b.event ?? "");
  if (!EVENTS.has(event)) {
    return NextResponse.json({ ok: true }); // unknown names are ignored, not stored
  }
  await bumpMetric(event);
  return NextResponse.json({ ok: true });
});
