import type { V1NetworkPolicy } from "@kubernetes/client-node"

import type { apiClients } from "./client"

type NetworkingApi = ReturnType<typeof apiClients>["networking"]

const POLICY_NAME = "hostrig-project-isolation"

/**
 * Default-deny with allows for:
 * - ingress from same namespace and Traefik (kube-system, app=traefik)
 * - egress to same namespace (Postgres/Redis)
 * - egress DNS to kube-system :53
 * - egress HTTPS/HTTP to the public internet only (not link-local / not other cluster CIDRs)
 *
 * Cross-project ClusterIP services stay denied (no cross-namespace pod access on 80/443).
 * Cloud metadata (169.254.0.0/16) and RFC1918 are blocked on the open HTTP/S rule.
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
          // Traefik on k3s (kube-system) — not the entire kube-system namespace
          _from: [
            {
              namespaceSelector: {
                matchLabels: { "kubernetes.io/metadata.name": "kube-system" },
              },
              podSelector: {
                matchLabels: { "app.kubernetes.io/name": "traefik" },
              },
            },
            // Fallback label used by some k3s Traefik charts
            {
              namespaceSelector: {
                matchLabels: { "kubernetes.io/metadata.name": "kube-system" },
              },
              podSelector: {
                matchLabels: { app: "traefik" },
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
          // Public internet HTTP/S only — exclude link-local metadata and private ranges
          // so cross-project ClusterIP and cloud metadata are not reachable on 80/443.
          to: [
            {
              ipBlock: {
                cidr: "0.0.0.0/0",
                except: [
                  "10.0.0.0/8",
                  "172.16.0.0/12",
                  "192.168.0.0/16",
                  "169.254.0.0/16",
                  "100.64.0.0/10",
                  "127.0.0.0/8",
                ],
              },
            },
          ],
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
