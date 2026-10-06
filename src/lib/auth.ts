import type { Role } from "@/lib/domain";

export type SessionUser = {
  id: string;
  workspaceId: string;
  email: string;
  role: Role;
};

export function requireWorkspaceAccess(user: SessionUser, workspaceId: string) {
  if (user.workspaceId !== workspaceId) {
    throw new Error("FORBIDDEN");
  }
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
