-- AlterTable
ALTER TABLE "TaskAssignment" ADD COLUMN "acknowledgedAt" DATETIME;
ALTER TABLE "TaskAssignment" ADD COLUMN "acknowledgedById" TEXT;
ALTER TABLE "TaskAssignment" ADD COLUMN "acknowledgementNote" TEXT;
ALTER TABLE "TaskAssignment" ADD COLUMN "userNotifiedAt" DATETIME;

-- CreateIndex
CREATE INDEX "TaskAssignment_acknowledgedAt_idx" ON "TaskAssignment"("acknowledgedAt");
