export type FileRecoveryPolicy = { retentionDays: number };

/** Returns null when permanent erasure must remain disabled. */
export function parseFileRecoveryPolicy(value: string | undefined): FileRecoveryPolicy | null {
  if (!value || !/^\\d+$/.test(value)) return null;
  const retentionDays = Number(value);
  if (!Number.isSafeInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) return null;
  return { retentionDays };
}

/** Computes the first instant at which a soft-deleted file may be erased. */
export function getPermanentErasureEligibleAt(deletedAt: Date, policy: FileRecoveryPolicy): Date {
  return new Date(deletedAt.getTime() + policy.retentionDays * 24 * 60 * 60 * 1000);
}

export function isPermanentErasureEligible(deletedAt: Date, now: Date, policy: FileRecoveryPolicy): boolean {
  return now.getTime() >= getPermanentErasureEligibleAt(deletedAt, policy).getTime();
}
