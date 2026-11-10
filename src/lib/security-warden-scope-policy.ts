import type { Prisma } from "@prisma/client";

export function securityActionScopeMatches(
  scope: Prisma.InputJsonObject,
  actionType: string,
  artifactId: string,
): boolean {
  return scope.operation === actionType && scope.artifactId === artifactId;
}
