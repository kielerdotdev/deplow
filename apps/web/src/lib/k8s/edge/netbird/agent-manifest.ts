import * as k8s from "@kubernetes/client-node"

import { apiClients, loadKubeConfig } from "@/lib/k8s/client"

export const NETBIRD_NAMESPACE = "hostrig-system"
export const NETBIRD_SECRET_NAME = "netbird-agent"
export const NETBIRD_DAEMONSET_NAME = "netbird-agent"
export const NETBIRD_PEER_HOSTNAME = "hostrig-k3s"
/** Host-network listener so NetBird mesh can reach Traefik on :80 */
export const TRAEFIK_ORIGIN_DS_NAME = "traefik-origin"
export const TRAEFIK_ORIGIN_PORT = 80

const NETBIRD_IMAGE = "netbirdio/netbird:latest"
const ORIGIN_IMAGE = "nginx:1.27-alpine"

async function ensureNamespace(core: k8s.CoreV1Api): Promise<void> {
  try {
    await core.readNamespace({ name: NETBIRD_NAMESPACE })
  } catch {
    await core.createNamespace({
      body: {
        metadata: {
          name: NETBIRD_NAMESPACE,
          labels: { "app.kubernetes.io/managed-by": "hostrig" },
        },
      },
    })
  }
}

export async function applyNetbirdAgent(input: {
  kubeconfigYaml: string
  setupKey: string
  managementUrl: string
}): Promise<void> {
  const kc = loadKubeConfig(input.kubeconfigYaml)
  const { core, apps } = apiClients(kc)
  await ensureNamespace(core)

  const secretBody: k8s.V1Secret = {
    metadata: {
      name: NETBIRD_SECRET_NAME,
      namespace: NETBIRD_NAMESPACE,
      labels: { "app.kubernetes.io/name": "netbird-agent" },
    },
    type: "Opaque",
    stringData: {
      "setup-key": input.setupKey,
      "management-url": input.managementUrl,
    },
  }

  try {
    await core.readNamespacedSecret({
      name: NETBIRD_SECRET_NAME,
      namespace: NETBIRD_NAMESPACE,
    })
    await core.replaceNamespacedSecret({
      name: NETBIRD_SECRET_NAME,
      namespace: NETBIRD_NAMESPACE,
      body: secretBody,
    })
  } catch {
    await core.createNamespacedSecret({
      namespace: NETBIRD_NAMESPACE,
      body: secretBody,
    })
  }

  const ds: k8s.V1DaemonSet = {
    metadata: {
      name: NETBIRD_DAEMONSET_NAME,
      namespace: NETBIRD_NAMESPACE,
      labels: {
        "app.kubernetes.io/name": "netbird-agent",
        "app.kubernetes.io/managed-by": "hostrig",
      },
    },
    spec: {
      selector: {
        matchLabels: { "app.kubernetes.io/name": "netbird-agent" },
      },
      template: {
        metadata: {
          labels: { "app.kubernetes.io/name": "netbird-agent" },
        },
        spec: {
          hostNetwork: true,
          dnsPolicy: "ClusterFirstWithHostNet",
          containers: [
            {
              name: "netbird",
              image: NETBIRD_IMAGE,
              imagePullPolicy: "IfNotPresent",
              env: [
                {
                  name: "NB_SETUP_KEY",
                  valueFrom: {
                    secretKeyRef: {
                      name: NETBIRD_SECRET_NAME,
                      key: "setup-key",
                    },
                  },
                },
                {
                  name: "NB_MANAGEMENT_URL",
                  valueFrom: {
                    secretKeyRef: {
                      name: NETBIRD_SECRET_NAME,
                      key: "management-url",
                    },
                  },
                },
                { name: "NB_HOSTNAME", value: NETBIRD_PEER_HOSTNAME },
                { name: "NB_LOG_LEVEL", value: "info" },
              ],
              securityContext: {
                capabilities: {
                  add: ["NET_ADMIN", "SYS_ADMIN", "SYS_RESOURCE"],
                },
              },
              volumeMounts: [
                {
                  name: "netbird-config",
                  mountPath: "/etc/netbird",
                },
                {
                  name: "tun",
                  mountPath: "/dev/net/tun",
                },
              ],
              resources: {
                requests: { cpu: "50m", memory: "64Mi" },
                limits: { memory: "256Mi" },
              },
            },
          ],
          volumes: [
            {
              name: "netbird-config",
              emptyDir: {},
            },
            {
              name: "tun",
              hostPath: {
                path: "/dev/net/tun",
                type: "CharDevice",
              },
            },
          ],
          tolerations: [
            {
              operator: "Exists",
            },
          ],
        },
      },
    },
  }

  try {
    await apps.readNamespacedDaemonSet({
      name: NETBIRD_DAEMONSET_NAME,
      namespace: NETBIRD_NAMESPACE,
    })
    await apps.replaceNamespacedDaemonSet({
      name: NETBIRD_DAEMONSET_NAME,
      namespace: NETBIRD_NAMESPACE,
      body: ds,
    })
  } catch {
    await apps.createNamespacedDaemonSet({
      namespace: NETBIRD_NAMESPACE,
      body: ds,
    })
  }

  await applyTraefikOriginProxy(input.kubeconfigYaml)
}

/**
 * Binds :80 on the node (all interfaces, including NetBird wt0) and proxies
 * to the in-cluster Traefik Service. NodePorts are often unreachable over mesh.
 */
export async function applyTraefikOriginProxy(
  kubeconfigYaml: string,
): Promise<void> {
  const kc = loadKubeConfig(kubeconfigYaml)
  const { core, apps } = apiClients(kc)
  await ensureNamespace(core)

  const nginxConf = `
worker_processes 1;
error_log /dev/stderr warn;
pid /tmp/nginx.pid;
events { worker_connections 1024; }
http {
  access_log /dev/stdout;
  server {
    listen ${TRAEFIK_ORIGIN_PORT} default_server;
    location / {
      proxy_http_version 1.1;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_pass http://traefik.kube-system.svc.cluster.local:80;
    }
  }
}
`.trim()

  const cm: k8s.V1ConfigMap = {
    metadata: {
      name: TRAEFIK_ORIGIN_DS_NAME,
      namespace: NETBIRD_NAMESPACE,
      labels: { "app.kubernetes.io/name": TRAEFIK_ORIGIN_DS_NAME },
    },
    data: { "nginx.conf": nginxConf },
  }
  try {
    await core.readNamespacedConfigMap({
      name: TRAEFIK_ORIGIN_DS_NAME,
      namespace: NETBIRD_NAMESPACE,
    })
    await core.replaceNamespacedConfigMap({
      name: TRAEFIK_ORIGIN_DS_NAME,
      namespace: NETBIRD_NAMESPACE,
      body: cm,
    })
  } catch {
    await core.createNamespacedConfigMap({
      namespace: NETBIRD_NAMESPACE,
      body: cm,
    })
  }

  const originDs: k8s.V1DaemonSet = {
    metadata: {
      name: TRAEFIK_ORIGIN_DS_NAME,
      namespace: NETBIRD_NAMESPACE,
      labels: {
        "app.kubernetes.io/name": TRAEFIK_ORIGIN_DS_NAME,
        "app.kubernetes.io/managed-by": "hostrig",
      },
    },
    spec: {
      selector: {
        matchLabels: { "app.kubernetes.io/name": TRAEFIK_ORIGIN_DS_NAME },
      },
      template: {
        metadata: {
          labels: { "app.kubernetes.io/name": TRAEFIK_ORIGIN_DS_NAME },
        },
        spec: {
          hostNetwork: true,
          dnsPolicy: "ClusterFirstWithHostNet",
          containers: [
            {
              name: "origin",
              image: ORIGIN_IMAGE,
              imagePullPolicy: "IfNotPresent",
              ports: [
                {
                  name: "http",
                  containerPort: TRAEFIK_ORIGIN_PORT,
                  hostPort: TRAEFIK_ORIGIN_PORT,
                  protocol: "TCP",
                },
              ],
              volumeMounts: [
                {
                  name: "config",
                  mountPath: "/etc/nginx/nginx.conf",
                  subPath: "nginx.conf",
                },
              ],
              resources: {
                requests: { cpu: "25m", memory: "32Mi" },
                limits: { memory: "128Mi" },
              },
            },
          ],
          volumes: [
            {
              name: "config",
              configMap: { name: TRAEFIK_ORIGIN_DS_NAME },
            },
          ],
          tolerations: [{ operator: "Exists" }],
        },
      },
    },
  }

  try {
    await apps.readNamespacedDaemonSet({
      name: TRAEFIK_ORIGIN_DS_NAME,
      namespace: NETBIRD_NAMESPACE,
    })
    await apps.replaceNamespacedDaemonSet({
      name: TRAEFIK_ORIGIN_DS_NAME,
      namespace: NETBIRD_NAMESPACE,
      body: originDs,
    })
  } catch {
    await apps.createNamespacedDaemonSet({
      namespace: NETBIRD_NAMESPACE,
      body: originDs,
    })
  }

  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    const status = await apps.readNamespacedDaemonSet({
      name: TRAEFIK_ORIGIN_DS_NAME,
      namespace: NETBIRD_NAMESPACE,
    })
    if ((status.status?.numberReady ?? 0) > 0) return
    await new Promise((r) => setTimeout(r, 2_000))
  }
}

export async function removeNetbirdAgent(
  kubeconfigYaml: string,
): Promise<void> {
  const kc = loadKubeConfig(kubeconfigYaml)
  const { core, apps } = apiClients(kc)
  for (const name of [NETBIRD_DAEMONSET_NAME, TRAEFIK_ORIGIN_DS_NAME]) {
    try {
      await apps.deleteNamespacedDaemonSet({
        name,
        namespace: NETBIRD_NAMESPACE,
      })
    } catch {
      // ignore missing
    }
  }
  try {
    await core.deleteNamespacedConfigMap({
      name: TRAEFIK_ORIGIN_DS_NAME,
      namespace: NETBIRD_NAMESPACE,
    })
  } catch {
    // ignore
  }
  try {
    await core.deleteNamespacedSecret({
      name: NETBIRD_SECRET_NAME,
      namespace: NETBIRD_NAMESPACE,
    })
  } catch {
    // ignore missing
  }
}
