-- Add bounded worker leases and retry tracking to the Red Squid hunter queue.
ALTER TABLE "SecurityHunterRun"
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "leaseTokenHash" TEXT,
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3);

CREATE INDEX "SecurityHunterRun_status_leaseExpiresAt_idx"
  ON "SecurityHunterRun"("status", "leaseExpiresAt");
