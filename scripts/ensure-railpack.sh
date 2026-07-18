#!/usr/bin/env bash
# Install Railpack into /usr/local/bin (and repo .tools/bin) if missing.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST_SYSTEM="/usr/local/bin/railpack"
DEST_REPO="$ROOT/.tools/bin/railpack"

have() { command -v "$1" >/dev/null 2>&1; }

if have railpack && [ -x "$DEST_SYSTEM" ]; then
  echo "OK: railpack already installed ($(railpack --version 2>/dev/null || true))"
  exit 0
fi

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64 | amd64) TARGET="x86_64-unknown-linux-musl" ;;
  aarch64 | arm64) TARGET="arm64-unknown-linux-musl" ;;
  *) echo "Unsupported arch: $ARCH" >&2; exit 1 ;;
esac

echo "==> installing Railpack ($TARGET)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
tag="$(curl -fsSL https://api.github.com/repos/railwayapp/railpack/releases/latest | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -1)"
test -n "$tag"
curl -fsSL "https://github.com/railwayapp/railpack/releases/download/${tag}/railpack-${tag}-${TARGET}.tar.gz" \
  -o "$tmp/railpack.tgz"
tar -xzf "$tmp/railpack.tgz" -C "$tmp"
bin="$(find "$tmp" -type f -name railpack | head -1)"
test -n "$bin" -a -f "$bin"
chmod +x "$bin"

mkdir -p "$ROOT/.tools/bin"
cp "$bin" "$DEST_REPO"
chmod 755 "$DEST_REPO"

if cp "$bin" "$DEST_SYSTEM" 2>/dev/null; then
  chmod 755 "$DEST_SYSTEM"
elif command -v sudo >/dev/null 2>&1 && sudo cp "$bin" "$DEST_SYSTEM"; then
  sudo chmod 755 "$DEST_SYSTEM"
else
  echo "WARN: could not write $DEST_SYSTEM; using $DEST_REPO"
  mkdir -p "${HOME}/.local/bin"
  cp "$bin" "${HOME}/.local/bin/railpack"
  chmod 755 "${HOME}/.local/bin/railpack"
fi

export PATH="/usr/local/bin:${HOME}/.local/bin:${ROOT}/.tools/bin:${PATH}"
railpack --version || "$DEST_REPO" --version
echo "OK: Railpack ready"
