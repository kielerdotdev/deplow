#!/usr/bin/env bash
# One-shot host bootstrap for hostrig.
# Installs/verifies Docker deps (BuildKit, Railpack, gVisor), then platform services.
# Security > easy install: runsc/gVisor is required for user apps (no runc escape hatch).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

say() { printf '\n==> %s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
ok() { printf 'OK: %s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64 | amd64) RAILPACK_TARGET="x86_64-unknown-linux-musl"; GVISOR_ARCH="x86_64" ;;
  aarch64 | arm64) RAILPACK_TARGET="arm64-unknown-linux-musl"; GVISOR_ARCH="aarch64" ;;
  *) RAILPACK_TARGET=""; GVISOR_ARCH="" ;;
esac

ensure_buildkit() {
  if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx buildkit; then
    if ! docker ps --format '{{.Names}}' | grep -qx buildkit; then
      say "Starting existing BuildKit container"
      docker start buildkit >/dev/null
    fi
    ok "BuildKit container running"
    return
  fi
  say "Starting BuildKit container"
  docker run --rm --privileged -d --name buildkit moby/buildkit
  ok "BuildKit started (BUILDKIT_HOST=docker-container://buildkit)"
}

ensure_railpack() {
  if have railpack; then
    ok "Railpack on PATH ($(railpack --version 2>/dev/null || echo present))"
    return
  fi
  if [ -z "$RAILPACK_TARGET" ]; then
    warn "Unknown arch ($ARCH); install Railpack manually from https://github.com/railwayapp/railpack/releases"
    return
  fi
  say "Installing Railpack CLI to ~/.local/bin"
  mkdir -p "$HOME/.local/bin"
  local tag url tmp
  tmp="$(mktemp -d)"
  tag="$(curl -fsSL https://api.github.com/repos/railwayapp/railpack/releases/latest | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -1)"
  if [ -z "$tag" ]; then
    warn "Could not resolve latest Railpack release — install manually"
    rm -rf "$tmp"
    return
  fi
  url="https://github.com/railwayapp/railpack/releases/download/${tag}/railpack-${tag}-${RAILPACK_TARGET}.tar.gz"
  if ! curl -fsSL "$url" -o "$tmp/railpack.tgz"; then
    warn "Could not download Railpack from $url — install manually"
    rm -rf "$tmp"
    return
  fi
  tar -xzf "$tmp/railpack.tgz" -C "$tmp"
  if [ ! -f "$tmp/railpack" ]; then
    # tarball may nest the binary
    found="$(find "$tmp" -type f -name railpack | head -1)"
    if [ -n "$found" ]; then
      mv "$found" "$tmp/railpack"
    fi
  fi
  if [ ! -f "$tmp/railpack" ]; then
    warn "Railpack archive missing binary — install manually"
    rm -rf "$tmp"
    return
  fi
  chmod +x "$tmp/railpack"
  mv "$tmp/railpack" "$HOME/.local/bin/railpack"
  rm -rf "$tmp"
  export PATH="$HOME/.local/bin:$PATH"
  if have railpack; then
    ok "Railpack installed ($HOME/.local/bin/railpack)"
  else
    warn "Railpack installed but not on PATH; add ~/.local/bin to PATH"
  fi
}

ensure_gvisor() {
  if have runsc; then
    ok "gVisor runsc on PATH ($(runsc --version 2>/dev/null | head -1 || echo present))"
  else
    if [ -z "$GVISOR_ARCH" ]; then
      warn "Unknown arch ($ARCH); install gVisor from https://gvisor.dev/docs/user_guide/install/"
      return 1
    fi
    say "Installing gVisor runsc (official release binary)"
    local url tmp dest
    tmp="$(mktemp -d)"
    url="https://storage.googleapis.com/gvisor/releases/release/latest/${GVISOR_ARCH}/runsc"
    if ! curl -fsSL "$url" -o "$tmp/runsc"; then
      warn "Could not download runsc from $url"
      rm -rf "$tmp"
      return 1
    fi
    chmod +x "$tmp/runsc"
    dest="/usr/local/bin/runsc"
    if [ -w /usr/local/bin ] 2>/dev/null || [ "$(id -u)" -eq 0 ]; then
      mv "$tmp/runsc" "$dest"
    elif have sudo; then
      sudo mv "$tmp/runsc" "$dest"
    else
      mkdir -p "$HOME/.local/bin"
      mv "$tmp/runsc" "$HOME/.local/bin/runsc"
      dest="$HOME/.local/bin/runsc"
      export PATH="$HOME/.local/bin:$PATH"
      warn "Installed runsc to $dest (no root). You still need: sudo $dest install && sudo systemctl restart docker"
      rm -rf "$tmp"
      return 1
    fi
    rm -rf "$tmp"
    if have sudo; then
      sudo "$dest" install || true
      sudo systemctl restart docker 2>/dev/null || warn "Restart Docker so the runsc runtime is picked up"
    else
      "$dest" install 2>/dev/null || warn "Run: sudo $dest install && sudo systemctl restart docker"
    fi
    ok "runsc binary at $dest"
  fi

  # Verify Docker knows the runtime
  if docker info 2>/dev/null | grep -qi runsc; then
    ok "Docker reports runsc runtime"
  else
    warn "Docker may not list runsc yet — run: sudo runsc install && sudo systemctl restart docker"
  fi

  if docker run --rm --runtime=runsc hello-world >/dev/null 2>&1; then
    ok "gVisor smoke test passed (hello-world under runsc)"
    return 0
  fi
  warn "gVisor smoke test failed (docker run --runtime=runsc hello-world)"
  return 1
}

say "Checking prerequisites"

if ! have docker; then
  echo "Docker Engine is required. Install Docker, then re-run."
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Cannot talk to Docker daemon. Start Docker / fix permissions, then re-run."
  exit 1
fi
ok "Docker daemon reachable"

if ! have curl; then
  echo "curl is required to download Railpack/gVisor."
  exit 1
fi

if ! have node; then
  echo "Node.js 22+ is required."
  exit 1
fi
NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Node.js 22+ is required (found $(node --version))."
  exit 1
fi
ok "Node.js $(node --version)"

if ! have pnpm; then
  if have corepack; then
    say "Activating pnpm via corepack"
    corepack enable
    corepack prepare pnpm@10 --activate
  else
    echo "pnpm 10 is required. Install: corepack enable && corepack prepare pnpm@10 --activate"
    exit 1
  fi
fi
ok "pnpm $(pnpm --version)"

ensure_buildkit
export BUILDKIT_HOST="${BUILDKIT_HOST:-docker-container://buildkit}"

ensure_railpack
export PATH="$HOME/.local/bin:${PATH:-}"

GVISOR_OK=0
if ensure_gvisor; then
  GVISOR_OK=1
else
  warn "gVisor is not fully ready. User apps require gVisor — deploys will fail until runsc works."
  warn "See https://gvisor.dev/docs/user_guide/install/ and docs/secure-runtime.md"
  warn "There is no HOSTRIG_APP_RUNTIME=runc escape hatch."
fi

say "Install JS dependencies"
pnpm install

say "Start platform services (MinIO, Caddy, platform Redis, BuildKit network)"
pnpm infra:up

say "Apply control-plane schema"
pnpm db:push

if [ ! -f apps/web/.env ]; then
  say "Seed apps/web/.env from example"
  cp apps/web/.env.example apps/web/.env
  if have openssl; then
    SECRET="$(openssl rand -base64 32)"
    if grep -q '^BETTER_AUTH_SECRET=' apps/web/.env; then
      sed -i "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$SECRET|" apps/web/.env
    else
      printf '\nBETTER_AUTH_SECRET=%s\n' "$SECRET" >> apps/web/.env
    fi
  else
    warn "Set BETTER_AUTH_SECRET in apps/web/.env (openssl not available)"
  fi
  if ! grep -q '^BUILDKIT_HOST=' apps/web/.env; then
    printf '\nBUILDKIT_HOST=docker-container://buildkit\n' >> apps/web/.env
  fi
else
  say "apps/web/.env already present — leaving it alone"
fi

cat <<EOF

==============================
Install complete
==============================

Host checks:
  BuildKit:  ok
  Railpack:  $(have railpack && echo ok || echo MISSING)
  gVisor:    $( [ "$GVISOR_OK" -eq 1 ] && echo ok || echo NEEDS ATTENTION )

Next steps:

  1. Start the control plane:
       pnpm dev
     Open http://localhost:3000 and create your first user.

  2. Open Domains in the sidebar:
       Set base domain (e.g. apps.example.com or apps.localhost),
       protocol https (or http for local), enable auto subdomains.
       v1 URLs are platform wildcard only — custom domains are v2.

  3. Optional public edge (Cloudflare Tunnel — TLS terminates at Cloudflare):
       export CLOUDFLARE_TUNNEL_TOKEN=...
       docker compose --profile edge up -d
       Point *.your-base-domain at the tunnel → http://caddy:80

  4. Create a project → add web + postgres/redis services → bind → Deploy (or connect Git).
       Public URL: https://{project}.{baseDomain}

  5. Smoke test (with pnpm dev running):
       pnpm e2e

Docs: README.md · docs/gtm.md · docs/access.md · docs/secure-runtime.md
EOF

if [ "$GVISOR_OK" -ne 1 ]; then
  echo ""
  warn "Install finished, but gVisor is not verified. Deploys will fail until runsc works on every k3s node."
  exit 2
fi
