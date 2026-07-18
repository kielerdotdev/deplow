/**
 * Control-plane build → registry push for k3s deploys.
 *
 * Flow: git clone → Railpack/Dockerfile build (local Docker) → tag/push →
 * imagePullSecrets on the project namespace for all UI-defined registries.
 *
 * Default build registry comes from Settings → Registries (DB), with optional
 * env seed via HOSTRIG_BUILD_REGISTRY when the table is empty.
 */
import { spawn } from "node:child_process"

import { BuildService, type BuildStrategyOverride } from "@/lib/core"
import { env } from "@/lib/env"
import {
  registryPullSecretName,
  resolveCredentialedRegistries,
  resolveDefaultBuildRegistry,
  type ResolvedRegistry,
} from "@/lib/registries"

import { apiClients, loadKubeConfig, projectNamespace } from "./client"
import { ensureProjectNamespace } from "./namespace"

export type BuildRegistryConfig = {
  registry: string
  server: string
  username: string
  password: string
  hasAuth: boolean
  id?: string
}

export async function getBuildRegistryConfig(): Promise<BuildRegistryConfig | null> {
  const row = await resolveDefaultBuildRegistry()
  if (!row) return null
  return {
    id: row.id,
    registry: row.imagePrefix,
    server: row.server,
    username: row.username,
    password: row.password,
    hasAuth: row.hasAuth,
  }
}

export async function isBuildRegistryConfigured(): Promise<boolean> {
  return Boolean(await resolveDefaultBuildRegistry())
}

export async function assertBuildRegistryConfigured(): Promise<BuildRegistryConfig> {
  const cfg = await getBuildRegistryConfig()
  if (!cfg) {
    throw new Error(
      "Git deploys need a container registry. Add one under Settings → Registries " +
        "(GHCR, Docker Hub, GitLab, or generic) and mark it as the build default. " +
        "Or set an image on the service and deploy that instead.",
    )
  }
  return cfg
}

/** Sanitize a DNS-safe image name component. */
export function sanitizeImageNamePart(raw: string): string {
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "app"
  )
}

/**
 * Full registry image reference for a deployment.
 * `{imagePrefix}/{project}-{service}:{shortId}`
 */
export function registryImageRef(input: {
  registry: string
  projectSlug: string
  serviceName: string
  deploymentId: string
}): string {
  const base = input.registry.replace(/\/+$/, "")
  const name = sanitizeImageNamePart(
    `${input.projectSlug}-${input.serviceName}`,
  )
  const tag =
    input.deploymentId.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 16) || "latest"
  return `${base}/${name}:${tag}`
}

export type BuildAndPushInput = {
  sourcePath: string
  projectSlug: string
  serviceName: string
  deploymentId: string
  rootDirectory?: string | null
  dockerfilePath?: string | null
  strategyOverride?: BuildStrategyOverride | null
  buildCommand?: string | null
  startCommand?: string | null
  onLog?: (chunk: string) => void
}

export type BuildAndPushResult = {
  image: string
  localImage: string
  strategy: string
  logs: string
}

/**
 * Build with Docker/Railpack on the control plane, then push to the default registry.
 */
export async function buildAndPushImage(
  input: BuildAndPushInput,
): Promise<BuildAndPushResult> {
  const cfg = await assertBuildRegistryConfigured()
  const remote = registryImageRef({
    registry: cfg.registry,
    projectSlug: input.projectSlug,
    serviceName: input.serviceName,
    deploymentId: input.deploymentId,
  })

  const buildService = new BuildService({ dockerBin: env.dockerBin })
  const localImage = buildService.imageTag(
    sanitizeImageNamePart(input.projectSlug),
    input.deploymentId.slice(0, 12),
  )

  const onLog = input.onLog
  onLog?.(`=== build registry ${cfg.registry} ===\n`)
  onLog?.(`target image: ${remote}\n`)

  const built = await buildService.buildFromSource({
    sourcePath: input.sourcePath,
    projectSlug: sanitizeImageNamePart(input.projectSlug),
    deploymentId: input.deploymentId.slice(0, 12),
    rootDirectory: input.rootDirectory,
    dockerfilePath: input.dockerfilePath,
    strategyOverride: input.strategyOverride,
    buildCommand: input.buildCommand,
    startCommand: input.startCommand,
    onLog,
  })

  let logs = built.logs
  const local = built.image || localImage

  onLog?.(`\n=== docker tag ${local} → ${remote} ===\n`)
  await runDocker(["tag", local, remote], onLog)

  if (cfg.hasAuth) {
    onLog?.(`=== docker login ${cfg.server} ===\n`)
    await dockerLogin(cfg.server, cfg.username, cfg.password, onLog)
  } else {
    onLog?.(
      "=== no registry credentials — assuming public push is allowed ===\n",
    )
  }

  onLog?.(`=== docker push ${remote} ===\n`)
  await runDocker(["push", remote], onLog)
  logs += `\n[registry] pushed ${remote}\n`

  return {
    image: remote,
    localImage: local,
    strategy: built.strategy,
    logs,
  }
}

/**
 * Upsert dockerconfigjson pull secrets for every credentialed registry into the
 * project namespace. Returns secret names for imagePullSecrets.
 */
export async function ensureRegistryPullSecrets(input: {
  kubeconfigYaml: string
  projectSlug: string
}): Promise<string[]> {
  const registries = await resolveCredentialedRegistries()
  if (registries.length === 0) return []

  const ns = projectNamespace(input.projectSlug)
  const { core, networking } = apiClients(loadKubeConfig(input.kubeconfigYaml))
  await ensureProjectNamespace(core, networking, ns)

  const names: string[] = []
  for (const reg of registries) {
    const secretName = registryPullSecretName(reg.id)
    await upsertDockerConfigSecret(core, ns, secretName, reg)
    names.push(secretName)
  }
  return names
}

/** @deprecated use ensureRegistryPullSecrets */
export async function ensureRegistryPullSecret(input: {
  kubeconfigYaml: string
  projectSlug: string
}): Promise<string | null> {
  const names = await ensureRegistryPullSecrets(input)
  return names[0] ?? null
}

async function upsertDockerConfigSecret(
  core: ReturnType<typeof apiClients>["core"],
  ns: string,
  secretName: string,
  reg: ResolvedRegistry,
): Promise<void> {
  const dockerConfig = {
    auths: {
      [reg.server]: {
        username: reg.username,
        password: reg.password,
        auth: Buffer.from(`${reg.username}:${reg.password}`).toString("base64"),
      },
    },
  }
  // Docker Hub also accepts docker.io / index.docker.io aliases in some clients
  if (
    reg.server.includes("docker.io") ||
    reg.server === "https://index.docker.io/v1/"
  ) {
    const auth = dockerConfig.auths[reg.server]!
    dockerConfig.auths["https://index.docker.io/v1/"] = auth
    dockerConfig.auths["docker.io"] = auth
    dockerConfig.auths["registry-1.docker.io"] = auth
  }

  const encoded = Buffer.from(JSON.stringify(dockerConfig)).toString("base64")
  const body = {
    metadata: {
      name: secretName,
      namespace: ns,
      labels: {
        "app.kubernetes.io/managed-by": "hostrig",
        "hostrig.io/registry-id": reg.id.slice(0, 63),
      },
    },
    type: "kubernetes.io/dockerconfigjson",
    data: {
      ".dockerconfigjson": encoded,
    },
  }

  try {
    await core.readNamespacedSecret({ name: secretName, namespace: ns })
    await core.replaceNamespacedSecret({
      name: secretName,
      namespace: ns,
      body,
    })
  } catch {
    await core.createNamespacedSecret({ namespace: ns, body })
  }
}

/**
 * Apply pull secrets to every project namespace found in the cluster.
 * Used by Settings → Registries → Sync.
 */
export async function syncRegistrySecretsToCluster(input: {
  kubeconfigYaml: string
}): Promise<{ namespaces: number; secrets: number; errors: string[] }> {
  const { core } = apiClients(loadKubeConfig(input.kubeconfigYaml))
  const registries = await resolveCredentialedRegistries()
  const errors: string[] = []
  let namespaces = 0
  let secrets = 0

  let list
  try {
    list = await core.listNamespace()
  } catch (e) {
    return {
      namespaces: 0,
      secrets: 0,
      errors: [e instanceof Error ? e.message : String(e)],
    }
  }

  const projectNs = (list.items ?? [])
    .map((n) => n.metadata?.name ?? "")
    .filter((n) => n.startsWith("proj-"))

  for (const ns of projectNs) {
    namespaces++
    for (const reg of registries) {
      try {
        const secretName = registryPullSecretName(reg.id)
        await upsertDockerConfigSecret(core, ns, secretName, reg)
        secrets++
      } catch (e) {
        errors.push(
          `${ns}/${reg.name}: ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    }
  }

  return { namespaces, secrets, errors }
}

async function dockerLogin(
  server: string,
  username: string,
  password: string,
  onLog?: (chunk: string) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      env.dockerBin,
      ["login", server, "--username", username, "--password-stdin"],
      { stdio: ["pipe", "pipe", "pipe"] },
    )
    let err = ""
    child.stdout?.on("data", (c: Buffer) => onLog?.(c.toString()))
    child.stderr?.on("data", (c: Buffer) => {
      const s = c.toString()
      err += s
      onLog?.(s)
    })
    child.on("error", reject)
    child.on("close", (code) => {
      if (code === 0) resolve()
      else
        reject(
          new Error(`docker login failed (exit ${code}): ${err.slice(-500)}`),
        )
    })
    child.stdin?.write(password)
    child.stdin?.end()
  })
}

async function runDocker(
  args: string[],
  onLog?: (chunk: string) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(env.dockerBin, args, {
      stdio: ["ignore", "pipe", "pipe"],
    })
    let err = ""
    child.stdout?.on("data", (c: Buffer) => onLog?.(c.toString()))
    child.stderr?.on("data", (c: Buffer) => {
      const s = c.toString()
      err += s
      onLog?.(s)
    })
    child.on("error", reject)
    child.on("close", (code) => {
      if (code === 0) resolve()
      else
        reject(
          new Error(
            `docker ${args[0]} failed (exit ${code}): ${err.slice(-800)}`,
          ),
        )
    })
  })
}
