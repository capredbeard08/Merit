import assert from "node:assert/strict";
import test from "node:test";
import { classifyClamAvResult } from "./scan-verdict";

test("classifies a completed scan with no detections as clean", () => {
  assert.equal(classifyClamAvResult(0, "artifact.bin: OK"), "CLEAN");
});

test("classifies a normal signature detection as malicious", () => {
  assert.equal(classifyClamAvResult(1, "artifact.bin: Win.Test.EICAR_HDB-1 FOUND"), "MALICIOUS");
});

test("does not call scan-limit alerts malware", () => {
  assert.equal(classifyClamAvResult(1, "artifact.bin: Heuristics.Limits.Exceeded FOUND"), "ERROR");
});

test("does not call encrypted-content alerts malware", () => {
  assert.equal(classifyClamAvResult(1, "artifact.bin: Heuristics.Encrypted.Zip FOUND"), "ERROR");
});

test("fails closed for scanner errors and unknown exit codes", () => {
  assert.equal(classifyClamAvResult(2, "ERROR"), "ERROR");
  assert.equal(classifyClamAvResult(-1, ""), "ERROR");
});
