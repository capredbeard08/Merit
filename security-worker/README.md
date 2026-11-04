# MERIT Red Squid artifact scanner

The artifact scanner is designed as a separately hosted private container, not a Vercel Function. It claims only DATA hunter runs for quarantined uploads, retrieves objects through the private Blob SDK, verifies the streamed size and SHA-256, and submits a temporary read-only copy to ClamAV through a local Unix socket.

A CLEAN verdict is evidence for a Founder-controlled decision; it does not automatically make a file downloadable. MALICIOUS, ERROR, TIMEOUT, lease loss, missing objects, size mismatch, and unknown outcomes remain quarantined. The original Blob is never overwritten or executed. Temporary copies are removed after scanning.

## Runtime requirements

- Secret-managed DATABASE_URL and BLOB_READ_WRITE_TOKEN
- ClamAV in a private container with no exposed TCP socket
- At least 3 GiB RAM for ClamAV, with additional headroom recommended
- 50 MiB maximum artifact size, matching the application upload limit
- Bounded database leases and heartbeat renewal

## Release gate

This worker is not deployed or production-operational. Before activation it needs isolated staging tests with EICAR and benign fixtures, current signature-database checks, lease-loss and timeout tests, resource-limit validation, and review of host network egress, filesystem and secret isolation. No preview or production deployment is authorized by this documentation.
