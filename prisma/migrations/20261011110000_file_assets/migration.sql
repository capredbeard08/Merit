CREATE TABLE "FileAsset" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "pathname" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "analysisText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FileAsset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FileAsset_pathname_key" ON "FileAsset"("pathname");
CREATE INDEX "FileAsset_workspaceId_createdAt_idx" ON "FileAsset"("workspaceId", "createdAt");
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
