# syntax=docker/dockerfile:1.7
FROM node:26-alpine AS dependencies
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

FROM node:26-alpine AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/api/prisma ./apps/api/prisma
RUN --mount=type=cache,target=/root/.npm,sharing=locked npm ci --omit=dev --omit=optional --workspace @assetflow/api \
    && npm run prisma:generate --workspace @assetflow/api \
    && npm cache clean --force

FROM node:26-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
RUN apk add --no-cache tini \
    && addgroup -S assetflow \
    && adduser -S -G assetflow assetflow \
    && mkdir -p /var/lib/assetflow/documents \
    && chown -R assetflow:assetflow /var/lib/assetflow \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx
COPY --from=production-dependencies --chown=assetflow:assetflow /app/node_modules ./node_modules
COPY --from=build --chown=assetflow:assetflow /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=assetflow:assetflow /app/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=assetflow:assetflow /app/apps/api/package.json ./apps/api/package.json
COPY --chown=assetflow:assetflow apps/api/docker-entrypoint.sh ./apps/api/docker-entrypoint.sh
RUN chmod 0555 ./apps/api/docker-entrypoint.sh
USER assetflow
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/v1/health/live" >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini","--","/app/apps/api/docker-entrypoint.sh"]
