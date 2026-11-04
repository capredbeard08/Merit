FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends clamav clamav-daemon clamav-freshclam ca-certificates tini passwd \
  && rm -rf /var/lib/apt/lists/* \
  && usermod -aG clamav node \
  && mkdir -p /run/clamav /var/lib/clamav \
  && chown -R clamav:clamav /run/clamav /var/lib/clamav

COPY package*.json ./
RUN npm ci && npx prisma generate

COPY . .
COPY security-worker/clamd.conf /etc/clamav/clamd.conf
COPY security-worker/entrypoint.sh /usr/local/bin/merit-security-worker
RUN chmod 0755 /usr/local/bin/merit-security-worker

EXPOSE
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/merit-security-worker"]
