# Node 24 — must match host vite-plus Node (ABI) because workspace is bind-mounted
# at the host path for docker-compose volume resolution.
FROM mcr.microsoft.com/devcontainers/typescript-node:24-bookworm

ARG HETZNER_K3S_VERSION=v2.6.0

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    jq \
    openssh-client \
    tar \
    unzip \
  && rm -rf /var/lib/apt/lists/*

# Official vitobotta/hetzner-k3s CLI — https://hetzner-k3s.com/
RUN set -eux; \
  arch="$(uname -m)"; \
  case "$arch" in \
    x86_64|amd64) asset="hetzner-k3s-linux-amd64" ;; \
    aarch64|arm64) asset="hetzner-k3s-linux-arm64" ;; \
    *) echo "unsupported arch: $arch" >&2; exit 1 ;; \
  esac; \
  curl -fsSL \
    "https://github.com/vitobotta/hetzner-k3s/releases/download/${HETZNER_K3S_VERSION}/${asset}" \
    -o /usr/local/bin/hetzner-k3s; \
  chmod 755 /usr/local/bin/hetzner-k3s; \
  hetzner-k3s --version || true

# Railpack CLI — source detection + builds (same as production control-plane image)
RUN set -eux; \
  arch="$(uname -m)"; \
  case "$arch" in \
    x86_64|amd64) railpack_target="x86_64-unknown-linux-musl" ;; \
    aarch64|arm64) railpack_target="arm64-unknown-linux-musl" ;; \
    *) echo "unsupported arch: $arch" >&2; exit 1 ;; \
  esac; \
  tag="$(curl -fsSL https://api.github.com/repos/railwayapp/railpack/releases/latest | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -1)"; \
  test -n "$tag"; \
  curl -fsSL "https://github.com/railwayapp/railpack/releases/download/${tag}/railpack-${tag}-${railpack_target}.tar.gz" \
    | tar -xz -C /usr/local/bin; \
  chmod 755 /usr/local/bin/railpack; \
  railpack --version

# corepack enable writes into /usr/local/bin
RUN corepack enable \
  && mkdir -p /home/node/.local/bin /home/node/.local/share/pnpm /home/node/.cache/hostrig \
  && chown -R node:node /home/node/.local /home/node/.cache

USER node
ENV PATH="/home/node/.local/share/pnpm:/home/node/.local/bin:/usr/local/bin:${PATH}"
ENV HOSTRIG_HETZNER_K3S_BIN=/usr/local/bin/hetzner-k3s
ENV RAILPACK_BIN=/usr/local/bin/railpack
# workspaceFolder is set to the host path at runtime
WORKDIR /home/node
