import { createHash, randomBytes } from "node:crypto";
import {
  Prisma,
  type SecurityActionType,
  type SecurityApproval,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isSecurityArtifactActionAllowed } from "@/lib/security-warden-artifact-policy";

const FOUNDER_APPROVAL_ACTIONS = new Set<SecurityActionType>([
  "SAFE_UNPACK",
  "DEOBFUSCATE",
  "RESTORE",
  "DISPOSE",
]);
const APPROVAL_TTL_MS = 10 * 60 * 1000;
const MAX_SCOPE_BYTES = 4096;

function canonicalJson(value: Prisma.JsonValue | Prisma.InputJsonValue): string {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map((item) => canonicalJson(item)).join(",") + "]";
  const object = value as Prisma.JsonObject;
  return "{" + Object.keys(object).sort().map((key) =>
    JSON.stringify(key) + ":" + canonicalJson(object[key] as Prisma.JsonValue),
  ).join(",") + "}";
}

export function hashSecurityActionScope(scope: Prisma.InputJsonObject): string {
  return createHash("sha256").update(canonicalJson(scope)).digest("hex");
}

function validSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

function assertApprovalAction(actionType: SecurityActionType): void {
  if (!FOUNDER_APPROVAL_ACTIONS.has(actionType)) {
    throw new Error("ACTION_DOES_NOT_REQUIRE_FOUNDER_APPROVAL");
  }
}

/**
 * Create a narrowly scoped approval request. This function does not grant
 * permission or execute anything; it records the exact artifact/action scope.
 * Call it from trusted server code only, never directly from a client.
 */
export async function requestFounderSecurityApproval(input: {
  incidentId: string;
  artifactId: string;
  artifactHash: string;
  actionType: SecurityActionType;
  actionScope: Prisma.InputJsonObject;
  requestedById: string;
  reason: string;
}, now = new Date()): Promise<{ approval: SecurityApproval; approvalNonce: string }> {
  assertApprovalAction(input.actionType);
  if (!validSha256(input.artifactHash)) throw new Error("INVALID_ARTIFACT_HASH");
  if (!input.reason.trim() || input.reason.length > 1000) throw new Error("INVALID_APPROVAL_REASON");
  const serializedScope = canonicalJson(input.actionScope);
  if (Buffer.byteLength(serializedScope, "utf8") > MAX_SCOPE_BYTES) throw new Error("APPROVAL_SCOPE_TOO_LARGE");

  const scopeHash = hashSecurityActionScope(input.actionScope);
  const approvalNonce = randomBytes(32).toString("hex");
  const approval = await prisma.$transaction(async (tx) => {
    const artifact = await tx.securityArtifact.findFirst({
      where: { id: input.artifactId, incidentId: input.incidentId },
      select: { id: true, sha256: true, storageState: true, scannerVerdict: true },
    });
    if (!artifact || artifact.sha256.toLowerCase() !== input.artifactHash.toLowerCase()) {
      throw new Error("ARTIFACT_SCOPE_MISMATCH");
    }
    if (!isSecurityArtifactActionAllowed(input.actionType, artifact.storageState, artifact.scannerVerdict)) {
      throw new Error("ARTIFACT_ACTION_NOT_ALLOWED");
    }

    const approval = await tx.securityApproval.create({
      data: {
        incidentId: input.incidentId,
        artifactId: input.artifactId,
        actionType: input.actionType,
        requestedById: input.requestedById,
        artifactHash: input.artifactHash.toLowerCase(),
        actionScope: input.actionScope,
        scopeHash,
        reason: input.reason.trim(),
        nonceHash: createHash("sha256").update(approvalNonce).digest("hex"),
        expiresAt: new Date(now.getTime() + APPROVAL_TTL_MS),
      },
    });
    const incident = await tx.securityIncident.findUnique({
      where: { id: input.incidentId },
      select: { workspaceId: true },
    });
    await tx.securityEvent.create({
      data: {
        workspaceId: incident?.workspaceId ?? null,
        actorUserId: input.requestedById,
        type: "SECURITY_APPROVAL_REQUESTED",
        severity: input.actionType === "DISPOSE" ? "CRITICAL" : "HIGH",
        targetId: approval.id,
        metadata: { actionType: input.actionType, artifactId: input.artifactId, scopeHash },
      },
    });
    return approval;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { approval, approvalNonce };
}

async function assertFreshFounderApprovalAuthority(
  tx: Prisma.TransactionClient,
  input: { actorUserId: string; sessionId: string },
  now: Date,
): Promise<void> {
  const [access, user, session] = await Promise.all([
    tx.platformAccess.findUnique({
      where: { userId: input.actorUserId },
      select: { role: true, revokedAt: true },
    }),
    tx.user.findUnique({
      where: { id: input.actorUserId },
      select: { twoFactorEnabled: true },
    }),
    tx.session.findFirst({
      where: { id: input.sessionId, userId: input.actorUserId, expiresAt: { gt: now } },
      select: { id: true, createdAt: true },
    }),
  ]);

  if (!access || access.role !== "FOUNDER_SUPER_ADMIN" || access.revokedAt !== null) {
    throw new Error("FOUNDER_SUPER_ADMIN_REQUIRED");
  }
  if (!user?.twoFactorEnabled) throw new Error("FOUNDER_MFA_REQUIRED");
  // Better Auth issues the authenticated session after the TOTP challenge.
  // Requiring a newly issued session plus enabled TOTP makes this a fresh
  // authentication boundary; do not replace this with a client-supplied flag.
  if (!session) throw new Error("FRESH_SESSION_REQUIRED");
  const ageMs = now.getTime() - session.createdAt.getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > APPROVAL_TTL_MS) {
    throw new Error("FRESH_SESSION_REQUIRED");
  }
}

/**
 * Founder decision. Role, revocation, MFA enrollment, and the actual persisted
 * session are rechecked inside the same transaction as the approval update.
 */
export async function approveFounderSecurityAction(input: {
  approvalId: string;
  actorUserId: string;
  sessionId: string;
  decision: "APPROVE" | "DENY";
}, now = new Date()): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await assertFreshFounderApprovalAuthority(tx, input, now);
    const approval = await tx.securityApproval.findUnique({
      where: { id: input.approvalId },
    });
    if (!approval || approval.status !== "PENDING" || approval.expiresAt <= now) {
      throw new Error("APPROVAL_NOT_PENDING_OR_EXPIRED");
    }
    assertApprovalAction(approval.actionType);
    if (!validSha256(approval.artifactHash ?? "") ||
        !validSha256(approval.scopeHash) ||
        hashSecurityActionScope(approval.actionScope as Prisma.InputJsonObject) !== approval.scopeHash) {
      throw new Error("APPROVAL_SCOPE_INTEGRITY_FAILURE");
    }
    const artifact = approval.artifactId
      ? await tx.securityArtifact.findUnique({
          where: { id: approval.artifactId },
          select: { sha256: true, storageState: true, scannerVerdict: true },
        })
      : null;
    if (!artifact || artifact.sha256.toLowerCase() !== approval.artifactHash?.toLowerCase() ||
        !isSecurityArtifactActionAllowed(approval.actionType, artifact.storageState, artifact.scannerVerdict)) {
      throw new Error("ARTIFACT_ACTION_NOT_ALLOWED");
    }

    const updated = await tx.securityApproval.updateMany({
      where: { id: approval.id, status: "PENDING", expiresAt: { gt: now } },
      data: input.decision === "APPROVE"
        ? { status: "APPROVED", approvedById: input.actorUserId, approvedAt: now }
        : { status: "DENIED", approvedById: input.actorUserId, approvedAt: now },
    });
    if (updated.count !== 1) throw new Error("APPROVAL_ALREADY_DECIDED");

    const incident = await tx.securityIncident.findUnique({
      where: { id: approval.incidentId },
      select: { workspaceId: true },
    });
    await tx.securityEvent.create({
      data: {
        workspaceId: incident?.workspaceId ?? null,
        actorUserId: input.actorUserId,
        type: input.decision === "APPROVE" ? "SECURITY_ACTION_APPROVED" : "SECURITY_ACTION_DENIED",
        severity: approval.actionType === "DISPOSE" ? "CRITICAL" : "HIGH",
        targetId: approval.id,
        metadata: {
          actionType: approval.actionType,
          artifactId: approval.artifactId ?? "",
          scopeHash: approval.scopeHash,
        },
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/**
 * Worker-side single-use consumption. The approved action, artifact hash, and
 * canonical scope must all match. The approval update and action creation are
 * atomic, so a replay or concurrent worker cannot create a second action.
 */
export async function consumeFounderSecurityApproval(input: {
  approvalId: string;
  approvalNonce: string;
  artifactId: string;
  artifactHash: string;
  actionType: SecurityActionType;
  actionScope: Prisma.InputJsonObject;
  actorUserId?: string | null;
}, now = new Date()): Promise<{ actionId: string }> {
  assertApprovalAction(input.actionType);
  if (!validSha256(input.artifactHash)) throw new Error("INVALID_ARTIFACT_HASH");
  const requestedScopeHash = hashSecurityActionScope(input.actionScope);

  return prisma.$transaction(async (tx) => {
    const approval = await tx.securityApproval.findUnique({
      where: { id: input.approvalId },
    });
    if (!approval || approval.status !== "APPROVED" || approval.consumedAt !== null ||
        approval.expiresAt <= now) {
      throw new Error("APPROVAL_NOT_USABLE");
    }
    if (createHash("sha256").update(input.approvalNonce).digest("hex") !== approval.nonceHash ||
        approval.actionType !== input.actionType ||
        approval.artifactId !== input.artifactId ||
        approval.artifactHash?.toLowerCase() !== input.artifactHash.toLowerCase() ||
        approval.scopeHash !== requestedScopeHash ||
        hashSecurityActionScope(approval.actionScope as Prisma.InputJsonObject) !== requestedScopeHash) {
      throw new Error("APPROVAL_SCOPE_MISMATCH");
    }

    const consumed = await tx.securityApproval.updateMany({
      where: {
        id: approval.id,
        status: "APPROVED",
        nonceHash: createHash("sha256").update(input.approvalNonce).digest("hex"),
        consumedAt: null,
        expiresAt: { gt: now },
        actionType: input.actionType,
        artifactId: input.artifactId,
        artifactHash: input.artifactHash.toLowerCase(),
        scopeHash: requestedScopeHash,
      },
      data: { status: "CONSUMED", consumedAt: now },
    });
    if (consumed.count !== 1) throw new Error("APPROVAL_REPLAY_OR_RACE");

    const action = await tx.securityAction.create({
      data: {
        incidentId: approval.incidentId,
        artifactId: input.artifactId,
        approvalId: approval.id,
        actionType: input.actionType,
        status: "APPROVED",
        actorUserId: input.actorUserId ?? null,
        operationHash: requestedScopeHash,
      },
      select: { id: true },
    });
    const incident = await tx.securityIncident.findUnique({
      where: { id: approval.incidentId },
      select: { workspaceId: true },
    });
    await tx.securityEvent.create({
      data: {
        workspaceId: incident?.workspaceId ?? null,
        actorUserId: input.actorUserId ?? null,
        type: "SECURITY_ACTION_APPROVAL_CONSUMED",
        severity: input.actionType === "DISPOSE" ? "CRITICAL" : "HIGH",
        targetId: action.id,
        metadata: { actionType: input.actionType, artifactId: input.artifactId, scopeHash: requestedScopeHash },
      },
    });
    return { actionId: action.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
