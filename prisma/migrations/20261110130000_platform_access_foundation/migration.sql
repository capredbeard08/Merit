CREATE TYPE "PlatformAccessRole" AS ENUM (
  'FOUNDER_SUPER_ADMIN',
  'PLATFORM_ADMIN',
  'ENGINEER'
);

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

ALTER TABLE "User"
  ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "twoFactorEnabledAt" TIMESTAMP(3);

CREATE TABLE "TwoFactor" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "secret" TEXT NOT NULL,
  "backupCodes" TEXT NOT NULL,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "failedVerificationCount" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  CONSTRAINT "TwoFactor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TwoFactor_userId_key" ON "TwoFactor"("userId");

ALTER TABLE "TwoFactor"
  ADD CONSTRAINT "TwoFactor_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PlatformAccess" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "PlatformAccessRole" NOT NULL,
  "grantedByUserId" TEXT,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformAccess_userId_key" ON "PlatformAccess"("userId");
CREATE INDEX "PlatformAccess_role_revokedAt_idx" ON "PlatformAccess"("role", "revokedAt");
CREATE UNIQUE INDEX "PlatformAccess_single_active_founder_idx"
  ON "PlatformAccess"("role")
  WHERE "role" = 'FOUNDER_SUPER_ADMIN' AND "revokedAt" IS NULL;

ALTER TABLE "PlatformAccess"
  ADD CONSTRAINT "PlatformAccess_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformAccess"
  ADD CONSTRAINT "PlatformAccess_grantedByUserId_fkey"
  FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

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
  ON DELETE RESTRICT ON UPDATE CASCADE;
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

CREATE TABLE "RateLimitBucket" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RateLimitBucket_key_key" ON "RateLimitBucket"("key");
CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");

-- Force a fresh sign-in after MFA enrollment. Application writes cannot forge
-- or move the enrollment timestamp independently of the enabled-state change.
UPDATE "User"
SET "twoFactorEnabledAt" = CURRENT_TIMESTAMP
WHERE "twoFactorEnabled" = true;

CREATE OR REPLACE FUNCTION "set_user_two_factor_enabled_at"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."twoFactorEnabled" IS TRUE THEN
      NEW."twoFactorEnabledAt" := CURRENT_TIMESTAMP;
    ELSE
      NEW."twoFactorEnabledAt" := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."twoFactorEnabled" IS DISTINCT FROM OLD."twoFactorEnabled" THEN
    IF NEW."twoFactorEnabled" IS TRUE THEN
      NEW."twoFactorEnabledAt" := CURRENT_TIMESTAMP;
    ELSE
      NEW."twoFactorEnabledAt" := NULL;
    END IF;
  ELSE
    NEW."twoFactorEnabledAt" := OLD."twoFactorEnabledAt";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "User_twoFactorEnabledAt_guard"
BEFORE INSERT OR UPDATE OF "twoFactorEnabled", "twoFactorEnabledAt"
ON "User"
FOR EACH ROW
EXECUTE FUNCTION "set_user_two_factor_enabled_at"();
