FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Expect monorepo context from repo root (see deploy/agent-compose.yml)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/agent/package.json apps/agent/
COPY packages/runtime/package.json packages/runtime/
COPY packages/shared/package.json packages/shared/

RUN corepack enable && pnpm install --filter @deplow/agent... --frozen-lockfile

COPY apps/agent apps/agent
COPY packages/runtime packages/runtime
COPY packages/shared packages/shared

ENV DEPLOW_AGENT_STATE_DIR=/var/lib/deplow-agent
VOLUME ["/var/lib/deplow-agent"]

CMD ["pnpm", "--filter", "@deplow/agent", "start"]
