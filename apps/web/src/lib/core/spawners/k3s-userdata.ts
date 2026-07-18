import { gvisorK3sInstallScript } from "./gvisor-k3s-install"

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** Cloud-init for a Hetzner VM that becomes the k3s server and bootstraps CP. */
export function buildK3sServerUserData(input: {
  controlPlaneUrl: string
  bootstrapToken: string
  nodeName?: string
}): string {
  const bootstrapUrl = `${input.controlPlaneUrl.replace(/\/$/, "")}/api/cluster/bootstrap`
  const name = input.nodeName ?? "k3s-server"
  const tokenJson = JSON.stringify(input.bootstrapToken)
  const urlJson = JSON.stringify(bootstrapUrl)
  return `#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates python3

${gvisorK3sInstallScript()}

PUBLIC_IP="$(curl -fsSL https://ifconfig.me/ip || curl -fsSL https://icanhazip.com || true)"
PUBLIC_IP="$(echo "$PUBLIC_IP" | tr -d '[:space:]')"
if [ -z "$PUBLIC_IP" ]; then
  PUBLIC_IP="$(hostname -I | awk '{print $1}')"
fi
export PUBLIC_IP

curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="server --tls-san=$PUBLIC_IP --write-kubeconfig-mode 600 --node-name ${shellSingleQuote(name)}" sh -

for i in $(seq 1 90); do
  [ -f /etc/rancher/k3s/k3s.yaml ] && break
  sleep 2
done
[ -f /etc/rancher/k3s/k3s.yaml ] || { echo "k3s.yaml missing"; exit 1; }

# RuntimeClass for user app pods (idempotent; CP also ensures on deploy)
k3s kubectl apply -f - <<'RC_EOF'
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata:
  name: gvisor
  labels:
    app.kubernetes.io/managed-by: hostrig
handler: runsc
RC_EOF

python3 <<'PY'
import json, os, urllib.request
ip = os.environ["PUBLIC_IP"]
kube = open("/etc/rancher/k3s/k3s.yaml").read().replace("127.0.0.1", ip).replace("localhost", ip)
token = open("/var/lib/rancher/k3s/server/node-token").read().strip()
body = json.dumps({
  "token": ${tokenJson},
  "kubeconfig": kube,
  "nodeToken": token,
  "externalIp": ip,
}).encode()
req = urllib.request.Request(${urlJson}, data=body, headers={"Content-Type": "application/json"}, method="POST")
with urllib.request.urlopen(req, timeout=90) as resp:
    print(resp.read().decode())
PY

echo "[hostrig] k3s server ready ip=$PUBLIC_IP"
`
}

/** Cloud-init / bare-metal script for a worker that joins an existing k3s server. */
export function buildK3sAgentUserData(input: {
  serverUrl: string
  nodeToken: string
  nodeName?: string
}): string {
  const name = input.nodeName ?? "k3s-agent"
  return `#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates

${gvisorK3sInstallScript()}

curl -sfL https://get.k3s.io | K3S_URL=${shellSingleQuote(input.serverUrl)} K3S_TOKEN=${shellSingleQuote(input.nodeToken)} INSTALL_K3S_EXEC="agent --node-name ${shellSingleQuote(name)}" sh -
echo "[hostrig] k3s agent joined ${shellSingleQuote(input.serverUrl)}"
`
}

/**
 * Copy-paste installer for self-hosted workers (same as agent userdata).
 * Run as root on the new machine.
 */
export function buildSelfHostedWorkerJoinScript(input: {
  serverUrl: string
  nodeToken: string
  nodeName?: string
}): string {
  return buildK3sAgentUserData(input)
}
