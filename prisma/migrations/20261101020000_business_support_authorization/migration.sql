CREATE TYPE "SupportAccessScope" AS ENUM (
  'CUSTOMER_RECORDS_READ',
  'FEEDBACK_READ',
  'FEEDBACK_REPLIES_READ',
  'FILE_ASSETS_READ'
);

CREATE TYPE "SupportAccessStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'DENIED',
  'REVOKED',
  'EXPIRED'
);

CREATE TABLE "SupportAccessRequest" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "decidedByUserId" TEXT,
  "revokedByUserId" TEXT,
  "scope" "SupportAccessScope" NOT NULL,
  "status" "SupportAccessStatus" NOT NULL DEFAULT 'PENDING',
  "reason" VARCHAR(500) NOT NULL,
  "requestedDurationMinutes" INTEGER NOT NULL,
  "requestExpiresAt" TIMESTAMP(3) NOT NULL,
  "decidedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportAccessRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupportAccessRequest_duration_check"
    CHECK ("requestedDurationMinutes" IN (30, 60, 120, 240))
);

CREATE INDEX "SupportAccessRequest_workspaceId_status_createdAt_idx"
  ON "SupportAccessRequest"("workspaceId", "status", "createdAt");
CREATE INDEX "SupportAccessRequest_requestedByUserId_status_createdAt_idx"
  ON "SupportAccessRequest"("requestedByUserId", "status", "createdAt");
CREATE INDEX "SupportAccessRequest_status_requestExpiresAt_idx"
  ON "SupportAccessRequest"("status", "requestExpiresAt");
CREATE INDEX "SupportAccessRequest_status_expiresAt_idx"
  ON "SupportAccessRequest"("status", "expiresAt");

ALTER TABLE "SupportAccessRequest"
  ADD CONSTRAINT "SupportAccessRequest_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportAccessRequest"
  ADD CONSTRAINT "SupportAccessRequest_requestedByUserId_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportAccessRequest"
  ADD CONSTRAINT "SupportAccessRequest_decidedByUserId_fkey"
  FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportAccessRequest"
  ADD CONSTRAINT "SupportAccessRequest_revokedByUserId_fkey"
  FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
