-- PA update link (Module 4 extension, approved 2026-07-20).
-- A nullable secret per doctor; the private URL carrying it lets chamber
-- staff set live status with zero login. Scope is status-only and the key is
-- revocable by reissue. Purely additive: no backfill, no downtime.
ALTER TABLE "Doctor" ADD COLUMN "statusKey" TEXT;
ALTER TABLE "Doctor" ADD COLUMN "statusKeyIssuedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Doctor_statusKey_key" ON "Doctor"("statusKey");
