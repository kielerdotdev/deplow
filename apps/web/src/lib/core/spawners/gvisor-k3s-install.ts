/**
 * Shell fragment: install gVisor (runsc) and wire it into k3s containerd.
 * Shared by cloud-init userdata and scripts/install-gvisor-k3s.sh.
 *
 * Call before or after k3s install; restarts k3s/k3s-agent when already running.
 */
export function gvisorK3sInstallScript(): string {
  // Intentionally not a template literal for the outer body — Go templates use {{ }}.
  return [
    "# --- gVisor (runsc) for user app RuntimeClass ---",
    "install_gvisor_k3s() {",
    "  set -euo pipefail",
    '  ARCH="$(uname -m)"',
    '  case "$ARCH" in',
    "    x86_64|amd64) ARCH=x86_64 ;;",
    "    aarch64|arm64) ARCH=aarch64 ;;",
    '    *) echo "[hostrig] gVisor: unsupported arch $ARCH (skipping)"; return 0 ;;',
    "  esac",
    "",
    '  URL="https://storage.googleapis.com/gvisor/releases/release/latest/${ARCH}"',
    '  echo "[hostrig] installing gVisor runsc from $URL"',
    '  curl -fsSL -o /tmp/runsc "${URL}/runsc"',
    '  curl -fsSL -o /tmp/containerd-shim-runsc-v1 "${URL}/containerd-shim-runsc-v1"',
    "  chmod +x /tmp/runsc /tmp/containerd-shim-runsc-v1",
    "  mv /tmp/runsc /tmp/containerd-shim-runsc-v1 /usr/local/bin/",
    "",
    "  mkdir -p /var/lib/rancher/k3s/agent/etc/containerd",
    "  cat > /var/lib/rancher/k3s/agent/etc/containerd/config.toml.tmpl <<'GVISOR_EOF'",
    '{{ template "base" . }}',
    "",
    '[plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runsc]',
    '  runtime_type = "io.containerd.runsc.v1"',
    "GVISOR_EOF",
    "",
    "  if systemctl is-active --quiet k3s 2>/dev/null; then",
    "    systemctl restart k3s || true",
    "  fi",
    "  if systemctl is-active --quiet k3s-agent 2>/dev/null; then",
    "    systemctl restart k3s-agent || true",
    "  fi",
    '  echo "[hostrig] gVisor runsc installed"',
    "}",
    "install_gvisor_k3s",
  ].join("\n")
}
