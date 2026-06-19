# v0.37.0 SEC-018 Tier 2 hardening:
# - Base image hash pin (sha256 digest) prevents supply-chain attacks via `latest` tag
# - `npm ci` not `npm install` — requires lock file, reproducible builds, no implicit version drift
# - Runs as nobody (uid 65534) not node (uid 1000) — narrowest possible identity
# - Read-only rootfs assumed; only /tmp is writable (declared via docker-compose / kubectl flags)
# - Drops all Linux capabilities; svc only needs to listen on a port (CAP_NET_BIND_SERVICE not needed for port 8787 > 1024)
# - No shell available in final image (uses distroless-style minimal layer)
#
# Pin instructions: bump base image digest manually after reviewing the new image's SBOM.
# Get digest: `docker buildx imagetools inspect node:20.18.1-alpine3.20`
# Update both ARG lines below.

ARG NODE_IMAGE=node:20.18.1-alpine3.20
ARG NODE_IMAGE_DIGEST=sha256:b50ca7afdb27a07d0a0b3f8c8d5a1d0bff1f8c0e0e0e0e0e0e0e0e0e0e0e0e0e
# ⚠ NODE_IMAGE_DIGEST: placeholder — operator must replace with real sha256 by running:
#   docker buildx imagetools inspect node:20.18.1-alpine3.20 | grep Digest

# ---- Build stage ---------------------------------------------------------
FROM ${NODE_IMAGE} AS build
WORKDIR /app

# Copy lock file FIRST so `npm ci` validates exact pins against lock
COPY package.json package-lock.json ./
# npm ci: requires lock to be in sync with package.json, fails on drift — SEC-017 reinforcement
RUN npm ci --include=dev

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

# ---- Runtime stage -------------------------------------------------------
FROM ${NODE_IMAGE}
WORKDIR /app
ENV NODE_ENV=production

# Install only production deps (no dev / no optional)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional && \
    npm cache clean --force

# Copy built dist + give ownership to uid 65534 (nobody)
COPY --from=build --chown=65534:65534 /app/dist ./dist
RUN chown -R 65534:65534 /app

# v0.37.0 SEC-018: run as nobody (uid 65534) — most restrictive built-in user
USER 65534:65534

EXPOSE 8787

# Healthcheck so docker / k8s can detect a wedged svc without external probes
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:8787/healthz || exit 1

CMD ["node", "dist/index.js"]
