import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { del, head } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, type Role } from "@/lib/domain";
import { allowedFileName, contentTypeForName, FILE_ALLOWED_CONTENT_TYPES, FILE_MAX_BYTES, safeOriginalName } from "@/lib/file-security";
import { recordSecurityEvent } from "@/lib/security-warden";
import { withWorkspacePermission } from "@/lib/workspace-access";
import { enqueueSecurityHunterRun } from "@/lib/security-warden-queue";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null) as HandleUploadBody | null;
  if (!body) return NextResponse.json({ error: "Invalid upload request" }, { status: 400 });

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.user) throw new Error("Authentication required");
        let payload: { workspaceId?: string; originalName?: string; sizeBytes?: number } = {};
        try { payload = JSON.parse(clientPayload || "{}"); } catch { throw new Error("Invalid upload metadata"); }
        const workspaceId = payload.workspaceId || "";
        const originalName = safeOriginalName(payload.originalName || pathname.split("/").pop() || "");
        const sizeBytes = payload.sizeBytes;
        if (!Number.isSafeInteger(sizeBytes) || (sizeBytes as number) < 0 || (sizeBytes as number) > FILE_MAX_BYTES) throw new Error("Invalid file size");
        if (!workspaceId || workspaceId.length > 128 || !allowedFileName(originalName)) throw new Error("Unsupported file type or workspace");
        const member = await prisma.member.findUnique({ where: { workspaceId_userId: { workspaceId, userId: session.user.id } } });
        if (!member || !can(member.role.toLowerCase() as Role, "files:manage")) throw new Error("Forbidden");
        return {
          allowedContentTypes: [...FILE_ALLOWED_CONTENT_TYPES],
          maximumSizeInBytes: FILE_MAX_BYTES,
          addRandomSuffix: true,
          access: "private",
          tokenPayload: JSON.stringify({ workspaceId, userId: session.user.id, originalName, sizeBytes }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = JSON.parse(tokenPayload || "{}") as { workspaceId?: string; userId?: string; originalName?: string; sizeBytes?: number };
        if (!payload.workspaceId || !payload.userId || !payload.originalName) throw new Error("Missing verified upload metadata");
        const originalName = safeOriginalName(payload.originalName);

        // Verify authoritative Blob metadata before persisting a usable asset.
        const metadata = await head(blob.pathname);
        if (!Number.isSafeInteger(metadata.size) || metadata.size < 1) {
          throw new Error("Uploaded file size could not be verified");
        }
        if (metadata.size > FILE_MAX_BYTES) {
          try {
            await del(blob.pathname);
            await recordSecurityEvent({
              type: "UPLOAD_REJECTED_OVERSIZE",
              workspaceId: payload.workspaceId,
              actorUserId: payload.userId,
              targetId: blob.pathname,
              metadata: { actualSizeBytes: metadata.size, maximumSizeBytes: FILE_MAX_BYTES, cleanup: "succeeded" },
              request,
            });
          } catch (cleanupError) {
            await recordSecurityEvent({
              type: "UPLOAD_ORPHAN_CLEANUP_FAILED",
              workspaceId: payload.workspaceId,
              actorUserId: payload.userId,
              targetId: blob.pathname,
              metadata: { reason: "oversized_upload_cleanup_failed" },
              request,
            }).catch(() => undefined);
            throw cleanupError;
          }
          return;
        }

        let assetId: string;
        try {
          const asset = await withWorkspacePermission(
            payload.workspaceId,
            payload.userId,
            "files:manage",
            (tx) => tx.fileAsset.upsert({
              where: { pathname: blob.pathname },
              create: {
                workspaceId: payload.workspaceId!,
                uploadedById: payload.userId!,
                originalName,
                pathname: blob.pathname,
                contentType: contentTypeForName(originalName),
                sizeBytes: metadata.size,
                status: "QUARANTINED",
              },
              update: {},
              select: { id: true },
            }),
          );
          assetId = asset.id;
        } catch (error) {
          if (error instanceof Error && error.message === "FORBIDDEN") {
            try {
              await del(blob.pathname);
              await recordSecurityEvent({
                type: "UPLOAD_ORPHAN_CLEANUP_SUCCEEDED",
                workspaceId: payload.workspaceId,
                actorUserId: payload.userId,
                targetId: blob.pathname,
                metadata: { reason: "permission_revoked_before_upload_completion" },
                request,
              });
            } catch {
              await recordSecurityEvent({
                type: "UPLOAD_ORPHAN_CLEANUP_FAILED",
                workspaceId: payload.workspaceId,
                actorUserId: payload.userId,
                targetId: blob.pathname,
                metadata: { reason: "permission_revoked_before_upload_completion" },
                request,
              }).catch(() => undefined);
            }
            throw new Error("Upload authorization expired");
          }
          throw error;
        }

        const existingScan = await prisma.securityHunterRun.findFirst({
          where: {
            hunterType: "DATA",
            engine: "CLAMAV",
            scopeMetadata: { equals: { source: assetId } },
          },
          select: { id: true },
        });
        if (!existingScan) {
          await enqueueSecurityHunterRun({
            hunterType: "DATA",
            engine: "CLAMAV",
            engineVersion: "container-managed",
            scopeMetadata: { source: assetId },
          });
        }

        await recordSecurityEvent({
          type: "UPLOAD_QUARANTINED",
          workspaceId: payload.workspaceId,
          actorUserId: payload.userId,
          targetId: blob.pathname,
          metadata: { contentType: contentTypeForName(originalName), status: "QUARANTINED", scanQueued: true },
          request,
        });
      }
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload authorization failed";
    const status = message === "Authentication required" ? 401 : message === "Forbidden" ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
