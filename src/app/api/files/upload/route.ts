import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { can, type Role } from "@/lib/domain";
import { allowedFileName, contentTypeForName, FILE_ALLOWED_CONTENT_TYPES, FILE_MAX_BYTES, safeOriginalName } from "@/lib/file-security";

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
        if (!member || !can(member.role.toLowerCase() as Role, "feedback:write")) throw new Error("Forbidden");
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
        const member = await prisma.member.findUnique({ where: { workspaceId_userId: { workspaceId: payload.workspaceId, userId: payload.userId } } });
        if (!member) throw new Error("Workspace membership no longer exists");
        const originalName = safeOriginalName(payload.originalName);
        await prisma.fileAsset.upsert({
          where: { pathname: blob.pathname },
          create: {
            workspaceId: payload.workspaceId,
            uploadedById: payload.userId,
            originalName,
            pathname: blob.pathname,
            contentType: contentTypeForName(originalName),
            // The client-reported size is untrusted, and this callback does not provide
            // a verified object size. Do not persist a forged size as authoritative.
            sizeBytes: 0,
            // Keep uploads unavailable until server-side content/size verification
            // and malware scanning are implemented.
            status: "QUARANTINED",
          },
          update: {},
        });
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload authorization failed";
    const status = message === "Authentication required" ? 401 : message === "Forbidden" ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
