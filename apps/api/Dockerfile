# syntax=docker/dockerfile:1.7
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

FROM --platform=$BUILDPLATFORM golang:1.26.6-alpine AS agent-build
ARG APP_VERSION=development
WORKDIR /src/apps/agent
COPY apps/agent/go.mod ./
COPY apps/agent/ ./
RUN go test ./... \
    && mkdir -p /out \
    && CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags="-s -w -X main.version=${APP_VERSION}" -o /out/assetflow-agent-windows-amd64.exe ./cmd/assetflow-agent \
    && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w -X main.version=${APP_VERSION}" -o /out/assetflow-agent-linux-amd64 ./cmd/assetflow-agent \
    && CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -ldflags="-s -w -X main.version=${APP_VERSION}" -o /out/assetflow-agent-linux-arm64 ./cmd/assetflow-agent \
    && cd /out && sha256sum assetflow-agent-* > SHA256SUMS

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
    PORT=3000
WORKDIR /app
RUN apk upgrade --no-cache \
    && apk add --no-cache tini \
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
COPY --from=agent-build --chown=assetflow:assetflow /out ./apps/api/agent-downloads
COPY --chown=assetflow:assetflow apps/api/docker-entrypoint.sh ./apps/api/docker-entrypoint.sh
RUN chmod 0555 ./apps/api/docker-entrypoint.sh
USER assetflow
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/v1/health/ready" >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini","--","/app/apps/api/docker-entrypoint.sh"]
