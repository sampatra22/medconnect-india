-- Doctor consent to be listed (pre-launch blocker, 2026-07-21).
-- We publish name, chamber address and phone publicly; the doctor must have
-- agreed. Captured by whoever spoke to them, at the moment of data entry.
-- All nullable and additive: existing rows become NULL = "not recorded", which
-- the verify route treats as "must be confirmed before approval".
ALTER TABLE "Doctor" ADD COLUMN "consentGiven" BOOLEAN;
ALTER TABLE "Doctor" ADD COLUMN "consentAt" TIMESTAMP(3);
ALTER TABLE "Doctor" ADD COLUMN "consentByName" TEXT;
ALTER TABLE "Doctor" ADD COLUMN "consentNote" TEXT;
