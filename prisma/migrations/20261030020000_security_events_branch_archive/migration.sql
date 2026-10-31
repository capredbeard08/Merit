ALTER TABLE "Branch"
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedById" TEXT;

CREATE INDEX "Branch_workspaceId_archivedAt_idx"
  ON "Branch"("workspaceId", "archivedAt");

CREATE TABLE "SecurityEvent" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "actorUserId" TEXT,
  "type" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "targetId" TEXT,
  "metadata" JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SecurityEvent_workspaceId_createdAt_idx"
  ON "SecurityEvent"("workspaceId", "createdAt");
CREATE INDEX "SecurityEvent_severity_createdAt_idx"
  ON "SecurityEvent"("severity", "createdAt");
CREATE INDEX "SecurityEvent_type_createdAt_idx"
  ON "SecurityEvent"("type", "createdAt");
