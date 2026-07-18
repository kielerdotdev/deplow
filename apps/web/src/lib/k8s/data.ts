import type { DatabaseCredentials, RedisCredentials } from "@hostrig/shared"

import { randomPassword, sanitizeIdentifier } from "@/lib/core/crypto"

import { apiClients, k8sName, loadKubeConfig, projectNamespace } from "./client"
import { ensureProjectNamespace } from "./namespace"

export async function provisionPostgresOnK8s(input: {
  kubeconfigYaml: string
  projectSlug: string
  serviceName: string
}): Promise<DatabaseCredentials> {
  const kc = loadKubeConfig(input.kubeconfigYaml)
  const { core, apps, networking } = apiClients(kc)
  const ns = projectNamespace(input.projectSlug)
  const name = k8sName(["pg", input.serviceName])
  const user = sanitizeIdentifier(`p_${input.projectSlug}`)
  const database = sanitizeIdentifier(`d_${input.projectSlug}`)
  const password = randomPassword(28)
  const labels = {
    "app.kubernetes.io/name": name,
    "app.kubernetes.io/component": "postgres",
    "app.kubernetes.io/managed-by": "hostrig",
  }

  await ensureProjectNamespace(core, networking, ns)

  const secretName = `${name}-secret`
  let effectivePassword = password
  try {
    const existing = await core.readNamespacedSecret({
      name: secretName,
      namespace: ns,
    })
    const b64 = existing.data?.POSTGRES_PASSWORD
    if (b64) {
      effectivePassword = Buffer.from(b64, "base64").toString("utf8")
    }
  } catch {
    await core.createNamespacedSecret({
      namespace: ns,
      body: {
        metadata: { name: secretName, labels },
        stringData: {
          POSTGRES_USER: user,
          POSTGRES_PASSWORD: password,
          POSTGRES_DB: database,
        },
      },
    })
  }

  const sts = {
    metadata: { name, namespace: ns, labels },
    spec: {
      serviceName: name,
      replicas: 1,
      selector: { matchLabels: { "app.kubernetes.io/name": name } },
      template: {
        metadata: { labels },
        spec: {
          containers: [
            {
              name: "postgres",
              image: process.env.HOSTRIG_POSTGRES_IMAGE || "postgres:16-alpine",
              ports: [{ containerPort: 5432 }],
              envFrom: [{ secretRef: { name: secretName } }],
              volumeMounts: [
                { name: "data", mountPath: "/var/lib/postgresql/data" },
              ],
            },
          ],
        },
      },
      volumeClaimTemplates: [
        {
          metadata: { name: "data" },
          spec: {
            accessModes: ["ReadWriteOnce"],
            resources: { requests: { storage: "5Gi" } },
          },
        },
      ],
    },
  }

  try {
    await apps.readNamespacedStatefulSet({ name, namespace: ns })
  } catch {
    await apps.createNamespacedStatefulSet({ namespace: ns, body: sts as never })
  }

  try {
    await core.readNamespacedService({ name, namespace: ns })
  } catch {
    await core.createNamespacedService({
      namespace: ns,
      body: {
        metadata: { name, labels },
        spec: {
          selector: { "app.kubernetes.io/name": name },
          ports: [{ port: 5432, targetPort: 5432, name: "postgres" }],
          clusterIP: "None",
        },
      },
    })
  }

  const host = `${name}.${ns}.svc.cluster.local`
  const url = `postgres://${encodeURIComponent(user)}:${encodeURIComponent(effectivePassword)}@${host}:5432/${database}`
  return {
    host,
    port: 5432,
    database,
    user,
    password: effectivePassword,
    url,
  }
}

export async function provisionRedisOnK8s(input: {
  kubeconfigYaml: string
  projectSlug: string
  serviceName: string
}): Promise<RedisCredentials> {
  const kc = loadKubeConfig(input.kubeconfigYaml)
  const { core, apps, networking } = apiClients(kc)
  const ns = projectNamespace(input.projectSlug)
  const name = k8sName(["redis", input.serviceName])
  const password = randomPassword(28)
  const labels = {
    "app.kubernetes.io/name": name,
    "app.kubernetes.io/component": "redis",
    "app.kubernetes.io/managed-by": "hostrig",
  }

  await ensureProjectNamespace(core, networking, ns)

  const secretName = `${name}-secret`
  let effectivePassword = password
  try {
    const existing = await core.readNamespacedSecret({
      name: secretName,
      namespace: ns,
    })
    const b64 = existing.data?.REDIS_PASSWORD
    if (b64) {
      effectivePassword = Buffer.from(b64, "base64").toString("utf8")
    }
  } catch {
    await core.createNamespacedSecret({
      namespace: ns,
      body: {
        metadata: { name: secretName, labels },
        stringData: { REDIS_PASSWORD: password },
      },
    })
  }

  try {
    await apps.readNamespacedDeployment({ name, namespace: ns })
  } catch {
    await apps.createNamespacedDeployment({
      namespace: ns,
      body: {
        metadata: { name, namespace: ns, labels },
        spec: {
          replicas: 1,
          selector: { matchLabels: { "app.kubernetes.io/name": name } },
          template: {
            metadata: { labels },
            spec: {
              containers: [
                {
                  name: "redis",
                  image: process.env.HOSTRIG_REDIS_IMAGE || "redis:7-alpine",
                  // K8s does not shell-expand args; use sh -c so $REDIS_PASSWORD is applied.
                  command: ["sh", "-c"],
                  args: [
                    'exec redis-server --requirepass "$REDIS_PASSWORD"',
                  ],
                  env: [
                    {
                      name: "REDIS_PASSWORD",
                      valueFrom: {
                        secretKeyRef: { name: secretName, key: "REDIS_PASSWORD" },
                      },
                    },
                  ],
                  ports: [{ containerPort: 6379 }],
                },
              ],
            },
          },
        },
      },
    })
  }

  try {
    await core.readNamespacedService({ name, namespace: ns })
  } catch {
    await core.createNamespacedService({
      namespace: ns,
      body: {
        metadata: { name, labels },
        spec: {
          selector: { "app.kubernetes.io/name": name },
          ports: [{ port: 6379, targetPort: 6379, name: "redis" }],
        },
      },
    })
  }

  const host = `${name}.${ns}.svc.cluster.local`
  const url = `redis://:${encodeURIComponent(effectivePassword)}@${host}:6379`
  return { host, port: 6379, password: effectivePassword, url }
}

export async function destroyDataOnK8s(input: {
  kubeconfigYaml: string
  projectSlug: string
  serviceName: string
  kind: "postgres" | "redis"
}): Promise<void> {
  const kc = loadKubeConfig(input.kubeconfigYaml)
  const { core, apps } = apiClients(kc)
  const ns = projectNamespace(input.projectSlug)
  const prefix = input.kind === "postgres" ? "pg" : "redis"
  const name = k8sName([prefix, input.serviceName])
  const ignore = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
    } catch {
      /* gone */
    }
  }
  if (input.kind === "postgres") {
    await ignore(() =>
      apps.deleteNamespacedStatefulSet({ name, namespace: ns }),
    )
  } else {
    await ignore(() => apps.deleteNamespacedDeployment({ name, namespace: ns }))
  }
  await ignore(() => core.deleteNamespacedService({ name, namespace: ns }))
  await ignore(() =>
    core.deleteNamespacedSecret({ name: `${name}-secret`, namespace: ns }),
  )
}
