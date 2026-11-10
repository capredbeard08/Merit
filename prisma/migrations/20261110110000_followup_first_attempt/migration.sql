ALTER TABLE "FollowUp" ADD COLUMN "firstAttemptAt" TIMESTAMP(3);
CREATE INDEX "FollowUp_status_firstAttemptAt_idx" ON "FollowUp"("status", "firstAttemptAt");
