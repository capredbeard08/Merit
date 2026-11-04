FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends clamav clamav-daemon clamdscan clamav-freshclam ca-certificates tini passwd \
  && rm -rf /var/lib/apt/lists/* \
  && usermod -aG clamav node \
  && mkdir -p /run/clamav /var/lib/clamav \
  && chown -R clamav:clamav /run/clamav /var/lib/clamav

COPY package*.json ./
RUN npm install --package-lock-only --ignore-scripts --no-audit --no-fund \
  && npm ci --ignore-scripts

COPY . .
RUN npx prisma generate
COPY security-worker/clamd.conf /etc/clamav/clamd.conf
COPY security-worker/clamdscan.conf /etc/clamdscan.conf
COPY security-worker/freshclam.conf /etc/clamav/freshclam.conf
COPY security-worker/entrypoint.sh /usr/local/bin/merit-security-worker
RUN chmod 0755 /usr/local/bin/merit-security-worker

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/merit-security-worker"]
