-- CreateTable
CREATE TABLE "CallRequest" (
    "id" TEXT NOT NULL,
    "mrId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "fromRole" TEXT NOT NULL,
    "doctorId" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CallRequest_mrId_status_idx" ON "CallRequest"("mrId", "status");

-- CreateIndex
CREATE INDEX "CallRequest_fromUserId_idx" ON "CallRequest"("fromUserId");
