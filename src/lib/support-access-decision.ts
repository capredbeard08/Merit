import { canAccessPlatform } from "@/lib/platform-access";

export type SupportAccessDecision = "APPROVE" | "DENY" | "REVOKE";

export type SupportAccessDecisionState = {
  requestedByUserId: string;
  status: string;
  requestExpiresAt: Date;
  expiresAt: Date | null;
};

export function evaluateSupportAccessDecision(input: {
  decision: SupportAccessDecision;
  request: SupportAccessDecisionState;
  actorUserId: string;
  operatorAccess?: { role: string; revokedAt: Date | null } | null;
  now?: Date;
}): "allowed" | "self_approval" | "not_pending" | "not_active" | "operator_inactive" {
  const now = input.now ?? new Date();

  if (input.request.requestedByUserId === input.actorUserId) return "self_approval";

  if (input.decision === "APPROVE" || input.decision === "DENY") {
    if (input.request.status !== "PENDING" || input.request.requestExpiresAt <= now) return "not_pending";
  } else if (
    input.request.status !== "APPROVED" ||
    !input.request.expiresAt ||
    input.request.expiresAt <= now
  ) {
    return "not_active";
  }

  if (input.decision === "APPROVE" &&
    !canAccessPlatform(input.operatorAccess, "platform:security:read")) {
    return "operator_inactive";
  }

  return "allowed";
}
