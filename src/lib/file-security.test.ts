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
