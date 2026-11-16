import type { SupportAccessScope } from "@prisma/client";

export type SupportAuthorizationRecord = {
  workspaceId: string;
  requestedByUserId: string;
  scope: string;
  status: string;
  revokedAt: Date | null;
  expiresAt: Date | null;
};

export function isSupportAuthorizationActive(
  record: SupportAuthorizationRecord | null | undefined,
  expected: { workspaceId: string; userId: string; scope: SupportAccessScope; now?: Date },
): boolean {
  if (!record) return false;
  const now = expected.now ?? new Date();
  return record.workspaceId === expected.workspaceId
    && record.requestedByUserId === expected.userId
    && record.scope === expected.scope
    && record.status === "APPROVED"
    && record.revokedAt === null
    && record.expiresAt !== null
    && record.expiresAt.getTime() > now.getTime();
}
