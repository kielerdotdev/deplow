# deplow control plane — multi-stage build for GHCR / compose.
# Runtime still needs host Docker (socket), BuildKit, Railpack, and preferably gVisor.
FROM node:22-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates curl python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
# Site is not part of the control-plane image
RUN pnpm install --frozen-lockfile --filter @deplow/web...

FROM deps AS build
COPY apps/web apps/web
COPY packages/db packages/db
COPY packages/shared packages/shared
RUN pnpm --filter @deplow/web build

FROM base AS runner
ARG RAILPACK_VERSION=latest
ARG TARGETARCH
RUN set -eux; \
  arch="$(uname -m)"; \
  case "$arch" in \
    x86_64|amd64) railpack_target="x86_64-unknown-linux-musl" ;; \
    aarch64|arm64) railpack_target="arm64-unknown-linux-musl" ;; \
    *) echo "unsupported arch: $arch" >&2; exit 1 ;; \
  esac; \
  tag="$(curl -fsSL https://api.github.com/repos/railwayapp/railpack/releases/latest | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -1)"; \
  curl -fsSL "https://github.com/railwayapp/railpack/releases/download/${tag}/railpack-${tag}-${railpack_target}.tar.gz" \
    | tar -xz -C /usr/local/bin; \
  chmod +x /usr/local/bin/railpack; \
  railpack --version

ENV NODE_ENV=production \
  PORT=3000 \
  DATABASE_URL=/data/deplow.db \
  DEPLOW_GIT_CLONE_ROOT=/data/git-clones \
  DEPLOW_PROXY_ROUTES_DIR=/etc/caddy/routes \
  BUILDKIT_HOST=docker-container://buildkit \
  RAILPACK_BIN=/usr/local/bin/railpack

WORKDIR /app
COPY --from=build /app /app
COPY scripts/docker-entrypoint.sh /usr/local/bin/deplow-entrypoint
RUN chmod +x /usr/local/bin/deplow-entrypoint \
  && mkdir -p /data /data/git-clones /etc/caddy/routes

EXPOSE 3000
VOLUME ["/data"]
ENTRYPOINT ["deplow-entrypoint"]
CMD ["pnpm", "--filter", "@deplow/web", "start"]
