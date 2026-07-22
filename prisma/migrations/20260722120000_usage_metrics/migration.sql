-- Usage metrics (2026-07-22): one counter per IST day per event. Counts only —
-- no sessions, no user ids, no IPs. Additive.
CREATE TABLE "Metric" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Metric_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Metric_day_event_key" ON "Metric"("day", "event");
CREATE INDEX "Metric_day_idx" ON "Metric"("day");
