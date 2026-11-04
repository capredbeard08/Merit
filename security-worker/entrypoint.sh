#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BLOB_READ_WRITE_TOKEN:?BLOB_READ_WRITE_TOKEN is required}"

# Do not start the queue consumer unless signature updates and the local
# scanner daemon both start successfully.
freshclam --stdout
clamd --config-file=/etc/clamav/clamd.conf &
CLAMD_PID=$!

ready=0
attempt=0
while [ "$attempt" -lt 90 ]; do
  if [ -S /run/clamav/clamd.ctl ] && clamdscan --no-summary /etc/hostname >/dev/null 2>&1; then
    ready=1
    break
  fi
  attempt=$((attempt + 1))
  sleep 2
done

if [ "$ready" -ne 1 ]; then
  echo "ClamAV did not become ready; refusing to start worker." >&2
  kill "$CLAMD_PID" 2>/dev/null || true
  exit 1
fi

exec su node -s /bin/sh -c 'node --import tsx security-worker/worker.ts'
