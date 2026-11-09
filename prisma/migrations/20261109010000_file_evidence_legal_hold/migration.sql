ALTER TABLE "FileAsset"
  ADD COLUMN "legalHoldAt" TIMESTAMP(3),
  ADD COLUMN "legalHoldById" TEXT,
  ADD COLUMN "legalHoldReason" TEXT;

CREATE INDEX "FileAsset_workspaceId_legalHoldAt_idx"
  ON "FileAsset"("workspaceId", "legalHoldAt");
