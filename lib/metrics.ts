import { prisma } from "@/lib/prisma";
import { istToday } from "@/lib/ist";

/**
 * Increment today's counter for an event. Fire-and-forget by design: metrics
 * must NEVER break or slow the action being counted, so callers don't await
 * failures — a lost count is noise, a failed status update is a wasted trip.
 */
export async function bumpMetric(event: string): Promise<void> {
  try {
    const day = istToday();
    await prisma.metric.upsert({
      where: { day_event: { day, event } },
      create: { day, event, count: 1 },
      update: { count: { increment: 1 } },
    });
  } catch {
    /* counting is best-effort, always */
  }
}
