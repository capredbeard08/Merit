export type ClamAvVerdict = "CLEAN" | "MALICIOUS" | "ERROR";

/**
 * ClamAV limit/encryption alerts are not proof of infection: the scanner
 * could not inspect all content. Missing or unrecognised output also fails
 * closed rather than being interpreted as either clean or infected.
 */
export function classifyClamAvResult(code: number, output: string): ClamAvVerdict {
  if (code === 0) return /:\s*OK\s*$/im.test(output) ? "CLEAN" : "ERROR";
  if (code !== 1) return "ERROR";
  if (/Heuristics\.(?:Limits\.Exceeded|Encrypted)/i.test(output)) return "ERROR";
  return /:\s+.+\s+FOUND\b/i.test(output) ? "MALICIOUS" : "ERROR";
}

export function areSignaturesFresh(
  timestamps: number[],
  now: number,
  maxAgeMs: number,
): boolean {
  if (timestamps.length === 0) return false;
  return timestamps.every((timestamp) =>
    Number.isFinite(timestamp) && timestamp <= now && now - timestamp <= maxAgeMs
  );
}
