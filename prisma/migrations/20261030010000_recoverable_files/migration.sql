ALTER TABLE "FileAsset"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "priorStatus" TEXT;

CREATE INDEX "FileAsset_workspaceId_deletedAt_idx"
  ON "FileAsset"("workspaceId", "deletedAt");

-- Existing files remain active. No file bytes or records are removed by this migration.
