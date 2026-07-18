import type { V1NetworkPolicy } from "@kubernetes/client-node"

import type { apiClients } from "./client"

type NetworkingApi = ReturnType<typeof apiClients>["networking"]

const POLICY_NAME = "hostrig-project-isolation"

/**
 * Default-deny with allows for:
 * - ingress from kube-system (Traefik) and same namespace
 * - egress to same namespace, kube-system (DNS), and HTTPS/HTTP for S3/APIs
 *
 * Cross-project (other proj-* namespaces) stays denied.
 */
export function buildProjectNetworkPolicy(namespace: string): V1NetworkPolicy {
  return {
    metadata: {
      name: POLICY_NAME,
      namespace,
      labels: {
        "app.kubernetes.io/managed-by": "hostrig",
        "hostrig.io/policy": "project-isolation",
      },
    },
    spec: {
      podSelector: {},
      policyTypes: ["Ingress", "Egress"],
      ingress: [
        {
          // client-node maps _from → JSON "from"
          _from: [{ podSelector: {} }],
        },
        {
          _from: [
            {
              namespaceSelector: {
                matchLabels: { "kubernetes.io/metadata.name": "kube-system" },
              },
            },
          ],
        },
      ],
      egress: [
        {
          to: [{ podSelector: {} }],
        },
        {
          to: [
            {
              namespaceSelector: {
                matchLabels: { "kubernetes.io/metadata.name": "kube-system" },
              },
            },
          ],
          ports: [
            { protocol: "UDP", port: 53 },
            { protocol: "TCP", port: 53 },
          ],
        },
        {
          // External HTTPS/HTTP (S3, webhooks, package registries)
          ports: [
            { protocol: "TCP", port: 443 },
            { protocol: "TCP", port: 80 },
          ],
        },
      ],
    },
  }
}

export async function ensureProjectNetworkPolicy(
  networking: NetworkingApi,
  namespace: string,
): Promise<void> {
  const body = buildProjectNetworkPolicy(namespace)
  try {
    await networking.readNamespacedNetworkPolicy({
      name: POLICY_NAME,
      namespace,
    })
    await networking.replaceNamespacedNetworkPolicy({
      name: POLICY_NAME,
      namespace,
      body,
    })
  } catch {
    await networking.createNamespacedNetworkPolicy({ namespace, body })
  }
}
