-- Persist the scanner's durable verdict. Unknown/error/timeout remain non-clean.
CREATE TYPE "SecurityScannerVerdict" AS ENUM ('UNKNOWN', 'CLEAN', 'MALICIOUS', 'ERROR', 'TIMEOUT');

ALTER TABLE "SecurityArtifact"
  ADD COLUMN "scannerVerdict" "SecurityScannerVerdict" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "scannerName" TEXT,
  ADD COLUMN "scannerVersion" TEXT,
  ADD COLUMN "scannedAt" TIMESTAMP(3);
