import { timingSafeEqual } from "node:crypto";

/** Compare deployment secrets without leaking length or character comparisons. */
export function matchesFounderBootstrapSecret(
  supplied: string,
  configured: string | undefined,
): boolean {
  if (!configured || Buffer.byteLength(configured, "utf8") < 32) return false;
  const suppliedBytes = Buffer.from(supplied, "utf8");
  const configuredBytes = Buffer.from(configured, "utf8");
  if (suppliedBytes.length !== configuredBytes.length) return false;
  return timingSafeEqual(suppliedBytes, configuredBytes);
}

/** The bootstrap endpoint is browser-only and must not accept cross-origin posts. */
export function isSameOriginRequest(origin: string | null, requestUrl: string): boolean {
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(requestUrl).origin;
  } catch {
    return false;
  }
}
