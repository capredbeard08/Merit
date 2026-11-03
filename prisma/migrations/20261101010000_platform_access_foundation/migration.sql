CREATE TYPE "PlatformAccessRole" AS ENUM (
  'FOUNDER_SUPER_ADMIN',
  'PLATFORM_ADMIN',
  'ENGINEER'
);

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

CREATE UNIQUE INDEX "PlatformAccess_userId_key"
  ON "PlatformAccess"("userId");
CREATE INDEX "PlatformAccess_role_revokedAt_idx"
  ON "PlatformAccess"("role", "revokedAt");

-- Only one active founder super administrator may exist at a time.
-- A controlled transfer must revoke the previous assignment before granting another.
CREATE UNIQUE INDEX "PlatformAccess_single_active_founder_idx"
  ON "PlatformAccess"("role")
  WHERE "role" = 'FOUNDER_SUPER_ADMIN' AND "revokedAt" IS NULL;

ALTER TABLE "PlatformAccess"
  ADD CONSTRAINT "PlatformAccess_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlatformAccess"
  ADD CONSTRAINT "PlatformAccess_grantedByUserId_fkey"
  FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
