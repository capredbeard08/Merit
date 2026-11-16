import test from "node:test";
import assert from "node:assert/strict";
import { allowedFileName, contentTypeForName, FILE_ALLOWED_CONTENT_TYPES } from "./file-security";

test("blocks executable and script uploads", () => {
  assert.equal(allowedFileName("installer.exe"), false);
  assert.equal(allowedFileName("report.pdf.exe"), false);
  assert.equal(allowedFileName("script.sh"), false);
});

test("allows supported document and media formats", () => {
  assert.equal(allowedFileName("feedback.csv"), true);
  assert.equal(allowedFileName("recording.mp3"), true);
  assert.equal(contentTypeForName("report.pdf"), "application/pdf");
  assert.equal(FILE_ALLOWED_CONTENT_TYPES.includes("application/octet-stream"), false);
});

test("rejects traversal and hidden filenames", () => {
  assert.equal(allowedFileName("../secret.txt"), false);
  assert.equal(allowedFileName(".env"), false);
});


import { createEvidenceDownloadResponse, type EvidenceFile } from "./file-evidence";

test("deleted-file evidence download is audited before the stream is released", async () => {
  const file: EvidenceFile = {
    id: "evidence-1", workspaceId: "workspace-1", originalName: "case-record.pdf",
    pathname: "private/case-record.pdf", contentType: "application/pdf", sizeBytes: 12,
    status: "DELETED", deletedAt: new Date("2026-11-01T10:00:00.000Z"), priorStatus: "AVAILABLE",
  };
  let audited = false;
  const response = await createEvidenceDownloadResponse(
    file,
    async (pathname) => {
      assert.equal(pathname, file.pathname);
      return { statusCode: 200, stream: new Response("evidence-bytes").body! };
    },
    async () => { audited = true; },
  );
  assert.equal(response.status, 200);
  assert.equal(audited, true);
  assert.match(response.headers.get("content-disposition") || "", /case-record/);
  assert.equal(await response.text(), "evidence-bytes");
});

test("deleted-file evidence download refuses quarantined files and missing audit", async () => {
  const quarantined: EvidenceFile = {
    id: "evidence-2", workspaceId: "workspace-1", originalName: "unverified.pdf",
    pathname: "private/unverified.pdf", contentType: "application/pdf", sizeBytes: 12,
    status: "DELETED", deletedAt: new Date(), priorStatus: "QUARANTINED",
  };
  let storageRead = false;
  const blocked = await createEvidenceDownloadResponse(
    quarantined,
    async () => { storageRead = true; return null; },
    async () => undefined,
  );
  assert.equal(blocked.status, 423);
  assert.equal(storageRead, false);

  const active = await createEvidenceDownloadResponse(
    { ...quarantined, status: "AVAILABLE", deletedAt: null, priorStatus: null },
    async () => { throw new Error("Storage must not be read for active files."); },
    async () => undefined,
  );
  assert.equal(active.status, 409);
});

test("deleted-file evidence download fails closed when audit logging fails", async () => {
  const file: EvidenceFile = {
    id: "evidence-3", workspaceId: "workspace-1", originalName: "record.pdf",
    pathname: "private/record.pdf", contentType: "application/pdf", sizeBytes: 8,
    status: "DELETED", deletedAt: new Date(), priorStatus: "AVAILABLE",
  };
  await assert.rejects(
    createEvidenceDownloadResponse(
      file,
      async () => ({ statusCode: 200, stream: new Response("evidence").body! }),
      async () => { throw new Error("audit unavailable"); },
    ),
    /audit unavailable/,
  );
});
