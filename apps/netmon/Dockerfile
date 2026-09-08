# syntax=docker/dockerfile:1.7
#
# AssetFlow network monitor.
#
# A dedicated image for the network module rather than the backend image with a flag: this container
# probes an office LAN on a loop and nothing else, so it ships without the API's HTTP server, without
# the agent binaries and without the documents volume. Its entry point boots PollerModule, which is
# the database plus the two netmon providers - none of the asset, compliance or renewal modules and
# none of their background timers are loaded here.
#
# The build reuses apps/api because the probe logic, the Prisma schema and the client are shared with
# the API's on-demand scan; duplicating them would let the two drift.

FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/api/package.json ./apps/api/package.json
RUN --mount=type=cache,target=/root/.npm,sharing=locked npm ci

FROM dependencies AS build
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/tsconfig.json apps/api/nest-cli.json ./apps/api/
COPY apps/api/src ./apps/api/src
RUN npm run build --workspace @assetflow/api

FROM node:22-alpine AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/api/prisma ./apps/api/prisma
RUN --mount=type=cache,target=/root/.npm,sharing=locked npm ci --omit=dev --omit=optional --workspace @assetflow/api \
    && npm run prisma:generate --workspace @assetflow/api \
    && npm cache clean --force

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    NETMON_POLLER=true \
    NETMON_HEARTBEAT_PATH=/tmp/netmon.heartbeat
WORKDIR /app
# See apps/web/Dockerfile: the CI layer cache would otherwise pin this image to the package
# set of the last build, so newly published Alpine fixes never land.
ARG APK_SNAPSHOT=0
# iputils gives a ping that opens an unprivileged ICMP datagram socket, so probing needs no NET_RAW
# and the container keeps every capability dropped.
RUN : "${APK_SNAPSHOT}" \
    && apk upgrade --no-cache \
    && apk add --no-cache tini iputils \
    && addgroup -S assetflow \
    && adduser -S -G assetflow assetflow \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx
COPY --from=production-dependencies --chown=assetflow:assetflow /app/node_modules ./node_modules
COPY --from=build --chown=assetflow:assetflow /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=assetflow:assetflow /app/apps/api/package.json ./apps/api/package.json
COPY --chown=assetflow:assetflow apps/netmon/docker-entrypoint.sh ./apps/netmon/docker-entrypoint.sh
RUN chmod 0555 ./apps/netmon/docker-entrypoint.sh
ARG APP_VERSION=development
ENV APP_VERSION=${APP_VERSION}
USER assetflow
# No port is served, so liveness is the age of the file the loop touches after every completed tick.
# A poller wedged on a hung probe stops touching it and gets restarted.
HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 \
  CMD [ -f "$NETMON_HEARTBEAT_PATH" ] && [ "$(( $(date +%s) - $(date -r "$NETMON_HEARTBEAT_PATH" +%s) ))" -lt 300 ] || exit 1
ENTRYPOINT ["/sbin/tini","--","/app/apps/netmon/docker-entrypoint.sh"]
