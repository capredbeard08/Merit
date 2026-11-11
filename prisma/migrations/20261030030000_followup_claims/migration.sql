ALTER TYPE "FollowUpStatus" ADD VALUE 'PROCESSING';
ALTER TABLE "FollowUp" ADD COLUMN "processingAt" TIMESTAMP(3);
CREATE INDEX "FollowUp_status_processingAt_idx" ON "FollowUp"("status", "processingAt");
