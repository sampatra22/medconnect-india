-- Module 4 · trust attribution.
-- User.company: an MR's pharma company. Public ONLY through status attribution
-- ("confirmed by Ramesh, Sun Pharma") — a name with a company behind it is
-- accountable. Every other MR field stays private.
-- Doctor.statusUpdatedByCompany: denormalized at write time (same pattern as
-- Visit/DoctorUpdate) so past attributions stay readable if an MR moves on.
-- Both nullable: purely additive, no backfill, no downtime.
ALTER TABLE "Doctor" ADD COLUMN     "statusUpdatedByCompany" TEXT;
ALTER TABLE "User" ADD COLUMN     "company" TEXT;
