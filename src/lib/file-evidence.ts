export type EvidenceFile = {
  id: string;
  workspaceId: string;
  originalName: string;
  pathname: string;
  contentType: string;
  sizeBytes: number;
  status: string;
  deletedAt: Date | null;
  priorStatus: string | null;
};

export type PrivateStoredBlob = {
  statusCode: number;
  stream: ReadableStream<Uint8Array>;
};

export async function createEvidenceDownloadResponse(
  file: EvidenceFile,
  getPrivateBlob: (pathname: string) => Promise<PrivateStoredBlob | null | undefined>,
  writeAccessAudit: () => Promise<void>,
): Promise<Response> {
  if (!file.deletedAt || file.status !== "DELETED") {
    return Response.json({ error: "File is not in the protected evidence area." }, { status: 409 });
  }
  if (file.priorStatus === "QUARANTINED") {
    return Response.json({ error: "This file remains quarantined pending safety review." }, { status: 423 });
  }

  const blob = await getPrivateBlob(file.pathname);
  if (!blob || blob.statusCode !== 200) {
    return Response.json({ error: "Stored file not found." }, { status: 404 });
  }

  // Fail closed: do not release the evidence stream unless the access event
  // has been durably recorded in the workspace audit log.
  await writeAccessAudit();

  return new Response(blob.stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(file.originalName),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
    },
  });
}
