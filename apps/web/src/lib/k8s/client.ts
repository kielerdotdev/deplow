import * as k8s from "@kubernetes/client-node"

import { decryptString, encryptString } from "@/lib/core/crypto"
import { env } from "@/lib/env"

export const DEFAULT_CLUSTER_ID = "default"

export function encryptKubeconfig(yaml: string): string {
  return encryptString(yaml, env.secretsEncryptionKey)
}

export function decryptKubeconfig(encrypted: string): string {
  return decryptString(encrypted, env.secretsEncryptionKey)
}

export function loadKubeConfig(kubeconfigYaml: string): k8s.KubeConfig {
  const kc = new k8s.KubeConfig()
  kc.loadFromString(kubeconfigYaml)
  return kc
}

export function apiClients(kc: k8s.KubeConfig) {
  return {
    core: kc.makeApiClient(k8s.CoreV1Api),
    apps: kc.makeApiClient(k8s.AppsV1Api),
    networking: kc.makeApiClient(k8s.NetworkingV1Api),
    batch: kc.makeApiClient(k8s.BatchV1Api),
    node: kc.makeApiClient(k8s.NodeV1Api),
  }
}

export function projectNamespace(projectSlug: string): string {
  const base = `proj-${projectSlug}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
  return base || "proj-default"
}

export function k8sName(parts: string[]): string {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
}
