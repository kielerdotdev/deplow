#!/usr/bin/env bash
# Install gVisor (runsc) on an existing k3s node and register the RuntimeClass.
# Run on every server and agent node (as root).
#
# Usage: sudo bash scripts/install-gvisor-k3s.sh
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root (sudo)." >&2
  exit 1
fi

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ARCH=x86_64 ;;
  aarch64|arm64) ARCH=aarch64 ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

URL="https://storage.googleapis.com/gvisor/releases/release/latest/${ARCH}"
echo "[hostrig] installing gVisor from $URL"
curl -fsSL -o /tmp/runsc "${URL}/runsc"
curl -fsSL -o /tmp/containerd-shim-runsc-v1 "${URL}/containerd-shim-runsc-v1"
chmod +x /tmp/runsc /tmp/containerd-shim-runsc-v1
mv /tmp/runsc /tmp/containerd-shim-runsc-v1 /usr/local/bin/

mkdir -p /var/lib/rancher/k3s/agent/etc/containerd
cat > /var/lib/rancher/k3s/agent/etc/containerd/config.toml.tmpl <<'EOF'
{{ template "base" . }}

[plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runsc]
  runtime_type = "io.containerd.runsc.v1"
EOF

if systemctl is-active --quiet k3s 2>/dev/null; then
  systemctl restart k3s
elif systemctl is-active --quiet k3s-agent 2>/dev/null; then
  systemctl restart k3s-agent
else
  echo "[hostrig] k3s not running yet — config.toml.tmpl will apply on next start"
fi

if command -v k3s >/dev/null 2>&1 && [[ -f /etc/rancher/k3s/k3s.yaml ]]; then
  k3s kubectl apply -f - <<'RC'
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata:
  name: gvisor
  labels:
    app.kubernetes.io/managed-by: hostrig
handler: runsc
RC
  echo "[hostrig] RuntimeClass gvisor applied"
fi

echo "[hostrig] Done. Verify: kubectl get runtimeclass gvisor"
echo "User app pods always use runtimeClassName=gvisor (runc is not allowed)."
