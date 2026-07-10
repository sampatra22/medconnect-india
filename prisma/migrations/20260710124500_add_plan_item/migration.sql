-- MR daily plan: ordered doctor-visit checklist per MR per day.
CREATE TABLE "PlanItem" (
    "id" TEXT NOT NULL,
    "mrId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "plannedTime" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlanItem_mrId_date_idx" ON "PlanItem"("mrId", "date");

CREATE UNIQUE INDEX "PlanItem_mrId_date_doctorId_key" ON "PlanItem"("mrId", "date", "doctorId");

ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
