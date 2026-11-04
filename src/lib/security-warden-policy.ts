export type WardenIncidentStatus =
  | "OPEN"
  | "TRIAGED"
  | "INVESTIGATING"
  | "CONTAINED"
  | "AWAITING_APPROVAL"
  | "RESOLVED"
  | "FALSE_POSITIVE"
  | "CLOSED";

const allowedIncidentTransitions: Record<WardenIncidentStatus, readonly WardenIncidentStatus[]> = {
  OPEN: ["TRIAGED", "INVESTIGATING", "CONTAINED", "FALSE_POSITIVE"],
  TRIAGED: ["INVESTIGATING", "CONTAINED", "FALSE_POSITIVE", "CLOSED"],
  INVESTIGATING: ["CONTAINED", "AWAITING_APPROVAL", "RESOLVED", "FALSE_POSITIVE"],
  CONTAINED: ["INVESTIGATING", "AWAITING_APPROVAL", "RESOLVED", "FALSE_POSITIVE"],
  AWAITING_APPROVAL: ["INVESTIGATING", "CONTAINED", "RESOLVED"],
  RESOLVED: ["TRIAGED", "CLOSED"],
  FALSE_POSITIVE: ["TRIAGED", "CLOSED"],
  CLOSED: [],
};

export function canTransitionIncident(
  current: WardenIncidentStatus,
  next: WardenIncidentStatus,
): boolean {
  return allowedIncidentTransitions[current].includes(next);
}

export type WardenAction =
  | "STATIC_ANALYSIS"
  | "SAFE_UNPACK"
  | "DEOBFUSCATE"
  | "QUARANTINE"
  | "RESTORE"
  | "DISPOSE";

export type ApprovalDecision = {
  status: "PENDING" | "APPROVED" | "DENIED" | "EXPIRED" | "CONSUMED" | "REVOKED";
  actionType: WardenAction;
  artifactHash: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
};

export type FounderAuthority = {
  isFounderSuperAdmin: boolean;
  hasFreshSession: boolean;
  hasFreshMfa: boolean;
};

const founderApprovalActions = new Set<WardenAction>([
  "SAFE_UNPACK",
  "DEOBFUSCATE",
  "RESTORE",
  "DISPOSE",
]);

export function requiresFounderApproval(action: WardenAction): boolean {
  return founderApprovalActions.has(action);
}

export function mayRunAutomatically(action: WardenAction): boolean {
  return action === "STATIC_ANALYSIS" || action === "QUARANTINE";
}

/**
 * Checks the complete, exact capability before a protected action can run.
 * Callers must atomically consume the approval in the same transaction that
 * creates the action record; this predicate alone is not replay protection.
 */
export function isFounderApprovalUsable(input: {
  authority: FounderAuthority;
  approval: ApprovalDecision;
  requestedAction: WardenAction;
  requestedArtifactHash: string;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  const { authority, approval } = input;
  if (!authority.isFounderSuperAdmin || !authority.hasFreshSession || !authority.hasFreshMfa) return false;
  if (!requiresFounderApproval(input.requestedAction)) return false;
  if (approval.status !== "APPROVED" || approval.consumedAt !== null) return false;
  if (approval.actionType !== input.requestedAction) return false;
  if (!approval.artifactHash || !/^[a-f0-9]{64}$/i.test(approval.artifactHash)) return false;
  if (approval.artifactHash.toLowerCase() !== input.requestedArtifactHash.toLowerCase()) return false;
  if (!Number.isFinite(approval.expiresAt.getTime()) || approval.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

export function mayReleaseArtifact(state: string, scannerVerdict: "CLEAN" | "MALICIOUS" | "UNKNOWN"): boolean {
  return state === "QUARANTINED" && scannerVerdict === "CLEAN";
}
