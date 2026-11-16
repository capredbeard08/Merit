import type { SecurityActionType, SecurityArtifactState, SecurityScannerVerdict } from "@prisma/client";

export function isSecurityArtifactActionAllowed(
  action: SecurityActionType,
  state: SecurityArtifactState,
  verdict: SecurityScannerVerdict,
): boolean {
  if (action === "RESTORE") return verdict === "CLEAN" && (state === "QUARANTINED" || state === "RETAINED");
  if (action === "DISPOSE") return state === "QUARANTINED" || state === "RETAINED";
  if (action === "SAFE_UNPACK" || action === "DEOBFUSCATE") {
    return state === "QUARANTINED" || state === "ANALYSIS_APPROVED";
  }
  return false;
}
