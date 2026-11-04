import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { get } from "@vercel/blob";
import { prisma } from "../src/lib/prisma";
import {
  claimSecurityHunterRun,
  heartbeatSecurityHunterRun,
  completeSecurityHunterRun,
  markSecurityHunterRunInconclusive,
} from "../src/lib/security-warden-queue";

const MAX_BYTES = 50 * 1024 * 1024;
const POLL_MS = 2_000;
const HEARTBEAT_MS = 25_000;
const SCAN_TIMEOUT_MS = 120_000;
let stopping = false;

function runScanner(path: string): Promise<{ code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn("clamdscan", ["--no-summary", "--stream", path], { stdio: "ignore" });
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("SCANNER_TIMEOUT"));
    }, SCAN_TIMEOUT_MS);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code === null) reject(new Error("SCANNER_EXIT_UNKNOWN"));
      else resolve({ code });
    });
  });
}

async function assertFreshSignatures(): Promise<void> {
  const entries = await readdir("/var/lib/clamav");
  const databases = entries.filter((name) => /\\.(?:cvd|cld)$/.test(name));
  if (databases.length === 0) throw new Error("SIGNATURE_DATABASE_MISSING");
  const timestamps = await Promise.all(databases.map(async (name) => (await stat(join("/var/lib/clamav", name))).mtimeMs));
  const newest = Math.max(...timestamps);
  if (!Number.isFinite(newest) || Date.now() - newest > 48 * 60 * 60 * 1000) {
    throw new Error("SIGNATURE_DATABASE_STALE");
  }
}

async function fetchAndHash(pathname: string, destination: string): Promise<{ sha256: string; size: number }> {
  const blob = await get(pathname, { access: "private" });
  if (!blob || blob.statusCode !== 200) throw new Error("PRIVATE_BLOB_UNAVAILABLE");
  const hash = createHash("sha256");
  let size = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > MAX_BYTES) return callback(new Error("ARTIFACT_SIZE_LIMIT_EXCEEDED"));
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  const source = Readable.fromWeb(blob.stream as import("node:stream/web").ReadableStream<Uint8Array>);
  await pipeline(source, limiter, createWriteStream(destination, { flags: "wx", mode: 0o600 }));
  if (size < 1) throw new Error("EMPTY_ARTIFACT");
  return { sha256: hash.digest("hex"), size };
}

async function inspectRun(job: NonNullable<Awaited<ReturnType<typeof claimSecurityHunterRun>>>): Promise<void> {
  const { run, leaseToken } = job;
  const scope = (run.scopeMetadata ?? {}) as Record<string, unknown>;
  const fileAssetId = scope.source;
  if (run.hunterType !== "DATA" || typeof fileAssetId !== "string" || !fileAssetId) {
    await markSecurityHunterRunInconclusive(run.id, leaseToken, "Unsupported scan scope; no artifact was changed.");
    return;
  }

  const asset = await prisma.fileAsset.findUnique({
    where: { id: fileAssetId },
    select: { id: true, workspaceId: true, pathname: true, contentType: true, sizeBytes: true, status: true, deletedAt: true },
  });
  if (!asset || asset.deletedAt || asset.status !== "QUARANTINED") {
    await markSecurityHunterRunInconclusive(run.id, leaseToken, "Upload is missing or no longer quarantined; no file state was changed.");
    return;
  }

  const directory = await mkdtemp(join(tmpdir(), "merit-red-squid-"));
  const localFile = join(directory, "artifact.bin");
  let leaseLost = false;
  const heartbeat = setInterval(async () => {
    try {
      if (!await heartbeatSecurityHunterRun(run.id, leaseToken)) leaseLost = true;
    } catch {
      leaseLost = true;
    }
  }, HEARTBEAT_MS);

  try {
    await assertFreshSignatures();
    const downloaded = await fetchAndHash(asset.pathname, localFile);
    if (downloaded.size !== Number(asset.sizeBytes)) throw new Error("AUTHORITATIVE_SIZE_MISMATCH");
    if (leaseLost) throw new Error("WORKER_LEASE_LOST");

    const existingArtifact = await prisma.securityArtifact.findUnique({ where: { originalObjectRef: asset.pathname } });
    const incident = existingArtifact?.incidentId
      ? await prisma.securityIncident.findUniqueOrThrow({ where: { id: existingArtifact.incidentId } })
      : await prisma.securityIncident.create({
          data: {
            workspaceId: asset.workspaceId,
            source: "UPLOAD",
            severity: "MEDIUM",
            confidence: 100,
            fingerprint: downloaded.sha256,
            summary: "Quarantined upload awaiting automated malware inspection.",
          },
        });
    const artifact = await prisma.securityArtifact.upsert({
      where: { originalObjectRef: asset.pathname },
      create: {
        incidentId: incident.id,
        originalObjectRef: asset.pathname,
        sha256: downloaded.sha256,
        sizeBytes: BigInt(downloaded.size),
        contentType: asset.contentType,
        storageState: "QUARANTINED",
        scannerVerdict: "UNKNOWN",
        quarantineReason: "Upload is blocked pending a trusted scan and Founder-controlled release.",
        chainOfCustody: { source: "PRIVATE_BLOB", hunterRunId: run.id },
      },
      update: {
        incidentId: incident.id,
        sha256: downloaded.sha256,
        sizeBytes: BigInt(downloaded.size),
        scannerVerdict: "UNKNOWN",
        scannerName: null,
        scannerVersion: null,
        scannedAt: null,
      },
    });

    const scan = await runScanner(localFile);
    if (leaseLost || !await heartbeatSecurityHunterRun(run.id, leaseToken)) throw new Error("WORKER_LEASE_LOST");
    const verdict = scan.code === 0 ? "CLEAN" : scan.code === 1 ? "MALICIOUS" : "ERROR";

    const verdictWrite = await prisma.securityArtifact.updateMany({
      where: { id: artifact.id, sha256: downloaded.sha256, storageState: "QUARANTINED" },
      data: {
        scannerVerdict: verdict,
        scannerName: "ClamAV",
        scannerVersion: "clamdscan",
        scannedAt: new Date(),
        chainOfCustody: { source: "PRIVATE_BLOB", hunterRunId: run.id, exitCode: scan.code },
      },
    });
    if (verdictWrite.count !== 1) throw new Error("ARTIFACT_STATE_CHANGED_BEFORE_VERDICT");
    await prisma.securityFinding.create({
      data: {
        incidentId: incident.id,
        artifactId: artifact.id,
        hunterType: "DATA",
        detector: "CLAMAV",
        ruleVersion: "container-signature-database",
        sha256: downloaded.sha256,
        evidenceMetadata: { scanner: "ClamAV", verdict, exitCode: scan.code },
        rationale: verdict === "CLEAN"
          ? "ClamAV completed without detecting a known signature. The upload remains quarantined pending Founder-controlled release."
          : verdict === "MALICIOUS"
            ? "ClamAV reported a malware signature. The original remains quarantined and was not executed or modified."
            : "ClamAV returned an error. No clean verdict was issued; the upload remains quarantined.",
        confidence: verdict === "ERROR" ? 0 : 100,
        severity: verdict === "MALICIOUS" ? "HIGH" : verdict === "ERROR" ? "MEDIUM" : "LOW",
      },
    });

    if (verdict === "ERROR") {
      await markSecurityHunterRunInconclusive(run.id, leaseToken, "ClamAV returned an error; upload remains quarantined.");
    } else {
      await completeSecurityHunterRun(run.id, leaseToken, `ClamAV verdict: ${verdict}. No automatic release, deletion, or execution occurred.`);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "SCANNER_FAILURE";
    await markSecurityHunterRunInconclusive(run.id, leaseToken, `Scan inconclusive (${reason.slice(0, 120)}); upload remains quarantined.`).catch(() => false);
  } finally {
    clearInterval(heartbeat);
    await rm(directory, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  process.on("SIGTERM", () => { stopping = true; });
  process.on("SIGINT", () => { stopping = true; });
  while (!stopping) {
    try {
      const job = await claimSecurityHunterRun(new Date(), ["DATA"]);
      if (job) {
        await inspectRun(job);
        continue;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "UNKNOWN_WORKER_ERROR";
      process.stderr.write(`Red Squid worker error: ${message.slice(0, 180)}\n`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  await prisma.$disconnect();
}

main().catch((error) => {
  process.stderr.write(`Red Squid worker stopped: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});
