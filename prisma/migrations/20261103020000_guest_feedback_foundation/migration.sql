-- Permanent QR identities and anonymous guest feedback.
CREATE TYPE "GuestQrCodeStatus" AS ENUM ('ACTIVE', 'PAUSED', 'REVOKED');

ALTER TABLE "Branch"
ADD COLUMN "googleReviewUrl" TEXT;

CREATE TABLE "GuestQrCode" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "label" TEXT,
  "status" "GuestQrCodeStatus" NOT NULL DEFAULT 'ACTIVE',
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GuestQrCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GuestQrCode_publicId_key" ON "GuestQrCode"("publicId");
CREATE INDEX "GuestQrCode_workspaceId_status_createdAt_idx"
  ON "GuestQrCode"("workspaceId", "status", "createdAt");
CREATE INDEX "GuestQrCode_branchId_status_idx"
  ON "GuestQrCode"("branchId", "status");

CREATE TABLE "GuestFeedback" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "qrCodeId" TEXT NOT NULL,
  "rating" "FeedbackRating" NOT NULL,
  "message" VARCHAR(2000),
  "answers" JSONB,
  "submissionKeyHash" TEXT,
  "source" TEXT NOT NULL DEFAULT 'PERMANENT_QR',
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GuestFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GuestFeedback_submissionKeyHash_key"
  ON "GuestFeedback"("submissionKeyHash");
CREATE INDEX "GuestFeedback_workspaceId_submittedAt_idx"
  ON "GuestFeedback"("workspaceId", "submittedAt");
CREATE INDEX "GuestFeedback_branchId_submittedAt_idx"
  ON "GuestFeedback"("branchId", "submittedAt");
CREATE INDEX "GuestFeedback_qrCodeId_submittedAt_idx"
  ON "GuestFeedback"("qrCodeId", "submittedAt");
CREATE INDEX "GuestFeedback_workspaceId_rating_submittedAt_idx"
  ON "GuestFeedback"("workspaceId", "rating", "submittedAt");

ALTER TABLE "GuestQrCode"
  ADD CONSTRAINT "GuestQrCode_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestQrCode"
  ADD CONSTRAINT "GuestQrCode_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GuestFeedback"
  ADD CONSTRAINT "GuestFeedback_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestFeedback"
  ADD CONSTRAINT "GuestFeedback_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestFeedback"
  ADD CONSTRAINT "GuestFeedback_qrCodeId_fkey"
  FOREIGN KEY ("qrCodeId") REFERENCES "GuestQrCode"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
