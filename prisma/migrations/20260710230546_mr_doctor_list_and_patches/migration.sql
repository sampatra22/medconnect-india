-- CreateTable
CREATE TABLE "MrDoctor" (
    "id" TEXT NOT NULL,
    "mrId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "frequency" INTEGER NOT NULL DEFAULT 2,
    "patchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MrDoctor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patch" (
    "id" TEXT NOT NULL,
    "mrId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MrDoctor_mrId_idx" ON "MrDoctor"("mrId");

-- CreateIndex
CREATE INDEX "MrDoctor_patchId_idx" ON "MrDoctor"("patchId");

-- CreateIndex
CREATE UNIQUE INDEX "MrDoctor_mrId_doctorId_key" ON "MrDoctor"("mrId", "doctorId");

-- CreateIndex
CREATE INDEX "Patch_mrId_idx" ON "Patch"("mrId");

-- CreateIndex
CREATE UNIQUE INDEX "Patch_mrId_name_key" ON "Patch"("mrId", "name");

-- AddForeignKey
ALTER TABLE "MrDoctor" ADD CONSTRAINT "MrDoctor_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MrDoctor" ADD CONSTRAINT "MrDoctor_patchId_fkey" FOREIGN KEY ("patchId") REFERENCES "Patch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
