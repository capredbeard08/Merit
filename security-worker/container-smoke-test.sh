#!/bin/sh
set -eu

# Runs inside the built scanner image. Network is needed only to obtain
# current signatures; the clamd daemon itself listens on a Unix socket.
freshclam --config-file=/etc/clamav/freshclam.conf --stdout

clamd --config-file=/etc/clamav/clamd.conf &
CLAMD_PID=$!
cleanup() {
  kill "$CLAMD_PID" 2>/dev/null || true
  wait "$CLAMD_PID" 2>/dev/null || true
  rm -rf /tmp/red-squid-smoke
}
trap cleanup EXIT INT TERM

mkdir -p /tmp/red-squid-smoke
attempt=0
ready=0
while [ "$attempt" -lt 60 ]; do
  if [ -S /run/clamav/clamd.ctl ] && clamdscan --config-file=/etc/clamdscan.conf --ping=1 /etc/hostname >/dev/null 2>&1; then
    ready=1
    break
  fi
  attempt=$((attempt + 1))
  sleep 2
done
if [ "$ready" -ne 1 ]; then
  echo "ClamAV failed to become ready; diagnostic state follows" >&2
  ls -la /run/clamav >&2 || true
  ps aux >&2 || true
  clamdscan --config-file=/etc/clamdscan.conf --ping=1 /etc/hostname >&2 || true
  exit 1
fi

# A benign fixture must be explicitly reported OK.
printf 'MERIT Red Squid benign scanner fixture\n' > /tmp/red-squid-smoke/benign.txt
set +e
clean_output=$(clamdscan --config-file=/etc/clamdscan.conf --no-summary --stdout --stream /tmp/red-squid-smoke/benign.txt 2>&1)
clean_status=$?
set -e
printf '%s\n' "$clean_output"
[ "$clean_status" -eq 0 ] && printf '%s\n' "$clean_output" | grep -Eq ': OK$' || {
  echo "Benign fixture did not receive a clean verdict" >&2
  exit 1
}

# The standard EICAR test string is a harmless antivirus test signature.
printf '%s' 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > /tmp/red-squid-smoke/eicar.com
set +e
eicar_output=$(clamdscan --config-file=/etc/clamdscan.conf --no-summary --stdout --stream /tmp/red-squid-smoke/eicar.com 2>&1)
eicar_status=$?
set -e
printf '%s\n' "$eicar_output"
[ "$eicar_status" -eq 1 ] && printf '%s\n' "$eicar_output" | grep -Eq ': .+ FOUND$' || {
  echo "EICAR fixture was not detected as a signature" >&2
  exit 1
}

# Exercise the configured max-file-size safeguard. This must be reported as
# a limit/incomplete scan, not interpreted as a clean result or malware.
dd if=/dev/zero of=/tmp/red-squid-smoke/oversized.bin bs=1M count=51 status=none
set +e
limit_output=$(clamdscan --config-file=/etc/clamdscan.conf --no-summary --stdout --stream /tmp/red-squid-smoke/oversized.bin 2>&1)
limit_status=$?
set -e
printf '%s\n' "$limit_output"
[ "$limit_status" -eq 1 ] && printf '%s\n' "$limit_output" | grep -Eiq 'Heuristics.Limits.Exceeded|size limit|maximum file size' || {
  echo "Oversized fixture did not trigger a recognizable scan-limit alert" >&2
  exit 1
}

echo "Red Squid ClamAV runtime smoke tests passed (benign, EICAR, oversized)."
