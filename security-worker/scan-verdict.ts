export type ClamAvVerdict = "CLEAN" | "MALICIOUS" | "ERROR";

/**
 * A ClamAV detection is not automatically proof of malware when the
 * signature name indicates a scan limit or encrypted content. Those cases
 * require manual review because the scanner could not fully inspect content.
 */
export function classifyClamAvResult(code: number, output: string): ClamAvVerdict {
  if (code === 0) return "CLEAN";
  if (code !== 1) return "ERROR";
  if (/Heuristics\.(?:Limits\.Exceeded|Encrypted)/i.test(output)) return "ERROR";
  return "MALICIOUS";
}
