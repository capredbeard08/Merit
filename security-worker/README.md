# MERIT Red Squid artifact scanner

The artifact scanner is implemented as a separately hosted private container, not a Vercel Function. It claims DATA hunter runs for quarantined uploads, retrieves objects through the private Blob SDK, verifies streamed size and SHA-256, and submits a temporary copy to ClamAV through a local Unix socket.

A CLEAN verdict is evidence for a Founder-controlled decision; it does not automatically make a file downloadable. MALICIOUS, ERROR, TIMEOUT, lease loss, missing objects, size mismatch, encrypted content, stale signatures, and unknown outcomes remain quarantined. The original Blob is never overwritten or executed. Temporary copies are removed after scanning.

The worker does not execute uploaded code or implement custom archive extraction/deobfuscation. ClamAV performs bounded archive-aware signature scanning. Any future dynamic analysis must be designed around an ephemeral, isolated sandbox before it is enabled.

## Runtime requirements

- Secret-managed DATABASE_URL and BLOB_READ_WRITE_TOKEN
- ClamAV in a private container with no exposed TCP socket
- At least 3 GiB RAM for ClamAV, with additional headroom recommended
- 50 MiB maximum artifact size, matching the application upload limit
- Bounded database leases and heartbeat renewal
- Fresh ClamAV signature databases; the worker fails closed when databases are missing or older than 48 hours

## Verification completed in CI

- Scanner container builds successfully.
- Benign fixture returns an explicit OK result.
- EICAR test signature is detected.
- Oversized fixture produces a scan-limit alert, not a clean result.
- Password-protected ZIP produces an encrypted-content alert, not a clean result.
- Scan-verdict unit tests classify encrypted/limit/error outcomes as inconclusive.
- Queue integration tests cover the global active-lease cap, safe scope metadata, heartbeat ownership, lease expiry/reclaim, and stale-worker fencing.

## Deployment status

The worker is feature-branch code and is not hosted or production-operational. No live upload has been scanned. Before activation, run isolated staging end-to-end tests with private Blob objects and queue leases; validate host network egress, filesystem permissions, resource limits, secret isolation, monitoring, and incident response. No Vercel preview or production deployment is authorized by this documentation.
