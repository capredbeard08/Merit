-- Red Squid Security Warden: durable incidents, evidence, approvals and worker history.
-- Additive only. No existing records or tables are modified or deleted.

CREATE TYPE "SecurityIncidentStatus" AS ENUM ('OPEN','TRIAGED','INVESTIGATING','CONTAINED','AWAITING_APPROVAL','RESOLVED','FALSE_POSITIVE','CLOSED');
CREATE TYPE "SecuritySeverityLevel" AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
CREATE TYPE "SecurityHunterType" AS ENUM ('CODE','BEHAVIOUR','DEPENDENCY','ACCESS','DATA','NETWORK','INTEGRITY');
CREATE TYPE "SecurityHunterRunStatus" AS ENUM ('QUEUED','RUNNING','COMPLETED','FAILED','INCONCLUSIVE','CANCELLED');
CREATE TYPE "SecurityArtifactState" AS ENUM ('QUARANTINED','ANALYSIS_APPROVED','DISPOSAL_PENDING','DISPOSED','RESTORED','RETAINED');
CREATE TYPE "SecurityApprovalStatus" AS ENUM ('PENDING','APPROVED','DENIED','EXPIRED','CONSUMED','REVOKED');
CREATE TYPE "SecurityActionType" AS ENUM ('STATIC_ANALYSIS','SAFE_UNPACK','DEOBFUSCATE','QUARANTINE','RESTORE','DISPOSE');
CREATE TYPE "SecurityActionStatus" AS ENUM ('REQUESTED','APPROVED','RUNNING','SUCCEEDED','FAILED','ROLLED_BACK');
CREATE TYPE "SecurityCorrelationType" AS ENUM ('SHARED_HASH','SHARED_INDICATOR','SHARED_DEPENDENCY','SHARED_PATH','TEMPORAL','RELATED_EVENT');

CREATE TABLE "SecurityIncident" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "status" "SecurityIncidentStatus" NOT NULL DEFAULT 'OPEN',
  "severity" "SecuritySeverityLevel" NOT NULL,
  "confidence" INTEGER NOT NULL,
  "source" TEXT NOT NULL,
  "fingerprint" TEXT,
  "summary" VARCHAR(500) NOT NULL,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SecurityIncident_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SecurityIncident_confidence_check" CHECK ("confidence" BETWEEN 0 AND 100)
);

CREATE TABLE "SecurityArtifact" (
  "id" TEXT NOT NULL,
  "incidentId" TEXT,
  "originalObjectRef" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "sizeBytes" BIGINT NOT NULL,
  "contentType" TEXT,
  "storageState" "SecurityArtifactState" NOT NULL DEFAULT 'QUARANTINED',
  "quarantineReason" VARCHAR(1000),
  "chainOfCustody" JSONB,
  "retainedUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SecurityArtifact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SecurityArtifact_size_check" CHECK ("sizeBytes" >= 0),
  CONSTRAINT "SecurityArtifact_sha256_check" CHECK ("sha256" ~ '^[a-fA-F0-9]{64}$')
);

CREATE TABLE "SecurityFinding" (
  "id" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "hunterType" "SecurityHunterType" NOT NULL,
  "detector" TEXT NOT NULL,
  "ruleVersion" TEXT,
  "artifactId" TEXT,
  "filePath" TEXT,
  "lineStart" INTEGER,
  "lineEnd" INTEGER,
  "sha256" TEXT,
  "evidenceMetadata" JSONB,
  "rationale" VARCHAR(2000) NOT NULL,
  "confidence" INTEGER NOT NULL,
  "severity" "SecuritySeverityLevel" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityFinding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SecurityFinding_confidence_check" CHECK ("confidence" BETWEEN 0 AND 100),
  CONSTRAINT "SecurityFinding_line_range_check" CHECK ("lineStart" IS NULL OR "lineStart" > 0),
  CONSTRAINT "SecurityFinding_line_end_check" CHECK ("lineEnd" IS NULL OR "lineEnd" > 0),
  CONSTRAINT "SecurityFinding_line_order_check" CHECK ("lineStart" IS NULL OR "lineEnd" IS NULL OR "lineEnd" >= "lineStart"),
  CONSTRAINT "SecurityFinding_sha256_check" CHECK ("sha256" IS NULL OR "sha256" ~ '^[a-fA-F0-9]{64}$')
);

CREATE TABLE "SecurityApproval" (
  "id" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "artifactId" TEXT,
  "actionType" "SecurityActionType" NOT NULL,
  "status" "SecurityApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "requestedById" TEXT NOT NULL,
  "approvedById" TEXT,
  "artifactHash" TEXT,
  "actionScope" JSONB NOT NULL,
  "scopeHash" TEXT NOT NULL,
  "reason" VARCHAR(1000) NOT NULL,
  "nonceHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityApproval_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SecurityApproval_nonceHash_key" UNIQUE ("nonceHash"),
  CONSTRAINT "SecurityApproval_hash_check" CHECK ("artifactHash" IS NULL OR "artifactHash" ~ '^[a-fA-F0-9]{64}$')
);

CREATE TABLE "SecurityAction" (
  "id" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "artifactId" TEXT,
  "approvalId" TEXT,
  "actionType" "SecurityActionType" NOT NULL,
  "status" "SecurityActionStatus" NOT NULL DEFAULT 'REQUESTED',
  "actorUserId" TEXT,
  "operationHash" TEXT,
  "resultMetadata" JSONB,
  "rollbackRef" TEXT,
  "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "SecurityAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SecurityHunterRun" (
  "id" TEXT NOT NULL,
  "incidentId" TEXT,
  "hunterType" "SecurityHunterType" NOT NULL,
  "engine" TEXT NOT NULL,
  "engineVersion" TEXT,
  "scopeMetadata" JSONB,
  "status" "SecurityHunterRunStatus" NOT NULL DEFAULT 'QUEUED',
  "summary" VARCHAR(2000),
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityHunterRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SecurityCorrelation" (
  "id" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "leftFindingId" TEXT NOT NULL,
  "rightFindingId" TEXT NOT NULL,
  "relation" "SecurityCorrelationType" NOT NULL,
  "confidence" INTEGER NOT NULL,
  "rationale" VARCHAR(1000) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityCorrelation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SecurityCorrelation_leftFindingId_rightFindingId_relation_key" UNIQUE ("leftFindingId","rightFindingId","relation"),
  CONSTRAINT "SecurityCorrelation_confidence_check" CHECK ("confidence" BETWEEN 0 AND 100),
  CONSTRAINT "SecurityCorrelation_distinct_findings_check" CHECK ("leftFindingId" <> "rightFindingId")
);

CREATE UNIQUE INDEX "SecurityArtifact_originalObjectRef_key" ON "SecurityArtifact"("originalObjectRef");
CREATE INDEX "SecurityIncident_status_severity_lastSeenAt_idx" ON "SecurityIncident"("status","severity","lastSeenAt");
CREATE INDEX "SecurityIncident_workspaceId_createdAt_idx" ON "SecurityIncident"("workspaceId","createdAt");
CREATE INDEX "SecurityIncident_fingerprint_lastSeenAt_idx" ON "SecurityIncident"("fingerprint","lastSeenAt");
CREATE INDEX "SecurityArtifact_storageState_createdAt_idx" ON "SecurityArtifact"("storageState","createdAt");
CREATE INDEX "SecurityArtifact_sha256_idx" ON "SecurityArtifact"("sha256");
CREATE INDEX "SecurityArtifact_retainedUntil_idx" ON "SecurityArtifact"("retainedUntil");
CREATE INDEX "SecurityFinding_incidentId_createdAt_idx" ON "SecurityFinding"("incidentId","createdAt");
CREATE INDEX "SecurityFinding_hunterType_severity_createdAt_idx" ON "SecurityFinding"("hunterType","severity","createdAt");
CREATE INDEX "SecurityFinding_sha256_idx" ON "SecurityFinding"("sha256");
CREATE INDEX "SecurityApproval_status_expiresAt_idx" ON "SecurityApproval"("status","expiresAt");
CREATE INDEX "SecurityApproval_incidentId_createdAt_idx" ON "SecurityApproval"("incidentId","createdAt");
CREATE INDEX "SecurityApproval_approvedById_approvedAt_idx" ON "SecurityApproval"("approvedById","approvedAt");
CREATE INDEX "SecurityAction_incidentId_createdAt_idx" ON "SecurityAction"("incidentId","createdAt");
CREATE INDEX "SecurityAction_artifactId_createdAt_idx" ON "SecurityAction"("artifactId","createdAt");
CREATE INDEX "SecurityAction_status_createdAt_idx" ON "SecurityAction"("status","createdAt");
CREATE INDEX "SecurityHunterRun_status_createdAt_idx" ON "SecurityHunterRun"("status","createdAt");
CREATE INDEX "SecurityHunterRun_hunterType_createdAt_idx" ON "SecurityHunterRun"("hunterType","createdAt");
CREATE INDEX "SecurityHunterRun_incidentId_createdAt_idx" ON "SecurityHunterRun"("incidentId","createdAt");
CREATE INDEX "SecurityCorrelation_incidentId_createdAt_idx" ON "SecurityCorrelation"("incidentId","createdAt");

ALTER TABLE "SecurityArtifact" ADD CONSTRAINT "SecurityArtifact_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "SecurityIncident"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SecurityFinding" ADD CONSTRAINT "SecurityFinding_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "SecurityIncident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SecurityFinding" ADD CONSTRAINT "SecurityFinding_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "SecurityArtifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SecurityApproval" ADD CONSTRAINT "SecurityApproval_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "SecurityIncident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SecurityApproval" ADD CONSTRAINT "SecurityApproval_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "SecurityArtifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SecurityAction" ADD CONSTRAINT "SecurityAction_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "SecurityIncident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SecurityAction" ADD CONSTRAINT "SecurityAction_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "SecurityArtifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SecurityAction" ADD CONSTRAINT "SecurityAction_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "SecurityApproval"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SecurityHunterRun" ADD CONSTRAINT "SecurityHunterRun_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "SecurityIncident"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SecurityCorrelation" ADD CONSTRAINT "SecurityCorrelation_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "SecurityIncident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SecurityCorrelation" ADD CONSTRAINT "SecurityCorrelation_leftFindingId_fkey" FOREIGN KEY ("leftFindingId") REFERENCES "SecurityFinding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SecurityCorrelation" ADD CONSTRAINT "SecurityCorrelation_rightFindingId_fkey" FOREIGN KEY ("rightFindingId") REFERENCES "SecurityFinding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SecurityApproval"
  ADD CONSTRAINT "SecurityApproval_scopeHash_check"
  CHECK ("scopeHash" ~ '^[a-fA-F0-9]{64}$');
