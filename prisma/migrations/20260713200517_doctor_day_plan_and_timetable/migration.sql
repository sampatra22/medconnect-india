/*
  Warnings:

  - A unique constraint covering the columns `[userId]` on the table `Doctor` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Doctor" ADD COLUMN     "userId" TEXT,
ADD COLUMN     "weeklyTimetable" JSONB;

-- CreateTable
CREATE TABLE "DoctorDayPlan" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "shared" BOOLEAN NOT NULL DEFAULT true,
    "startedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorDayPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DoctorDayPlan_date_idx" ON "DoctorDayPlan"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorDayPlan_doctorId_date_key" ON "DoctorDayPlan"("doctorId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Doctor_userId_key" ON "Doctor"("userId");

-- AddForeignKey
ALTER TABLE "DoctorDayPlan" ADD CONSTRAINT "DoctorDayPlan_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
