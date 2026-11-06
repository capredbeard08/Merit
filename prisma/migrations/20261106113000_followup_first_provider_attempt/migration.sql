-- Preserve the timestamp of the first provider attempt across stale-claim retries.
-- Resend idempotency retention is measured from the first use of the key, not
-- from the most recent worker claim.
ALTER TABLE "FollowUp"
ADD COLUMN "firstAttemptAt" TIMESTAMP(3);

-- Backfill existing PROCESSING rows conservatively so they are not retried
-- with an unknown provider outcome after the migration.
UPDATE "FollowUp"
SET "firstAttemptAt" = COALESCE("processingAt", "updatedAt", "createdAt")
WHERE "status" = 'PROCESSING'
  AND "firstAttemptAt" IS NULL;
