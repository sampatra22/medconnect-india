-- Baseline: this column already exists in the live DB (was applied via db push).
-- Recorded here so migration history matches reality; marked applied with
-- `prisma migrate resolve`, never executed against the live database.
ALTER TABLE "Doctor" ADD COLUMN "mrVisitingDays" TEXT;
