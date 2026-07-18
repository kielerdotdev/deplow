import type { RegistryKind } from "@deplow/shared"

export type KindDefaults = {
  server: string
  /** Hint for image prefix placeholder. */
  imagePrefixHint: string
  usernameHint: string
  passwordHint: string
}

export function kindDefaults(kind: RegistryKind): KindDefaults {
  switch (kind) {
    case "ghcr":
      return {
        server: "ghcr.io",
        imagePrefixHint: "ghcr.io/your-org/hostrig",
        usernameHint: "GitHub username",
        passwordHint: "PAT with write:packages / read:packages",
      }
    case "dockerhub":
      return {
        server: "https://index.docker.io/v1/",
        imagePrefixHint: "docker.io/youruser",
        usernameHint: "Docker Hub username",
        passwordHint: "Access token (preferred) or password",
      }
    case "gitlab":
      return {
        server: "registry.gitlab.com",
        imagePrefixHint: "registry.gitlab.com/group/project",
        usernameHint: "GitLab username or deploy token name",
        passwordHint: "Personal access token or deploy token",
      }
    default:
      return {
        server: "",
        imagePrefixHint: "registry.example.com/namespace",
        usernameHint: "Username",
        passwordHint: "Password or token",
      }
  }
}

/** Resolve login server for a kind + optional override. */
export function resolveRegistryServer(
  kind: RegistryKind,
  server?: string | null,
): string {
  const trimmed = server?.trim() ?? ""
  if (kind === "ghcr") return "ghcr.io"
  if (kind === "dockerhub") return "https://index.docker.io/v1/"
  if (trimmed) return trimmed.replace(/\/+$/, "")
  if (kind === "gitlab") return "registry.gitlab.com"
  throw new Error("Server is required for generic registries")
}

/**
 * Normalize image prefix: strip trailing slash, ensure no scheme.
 */
export function normalizeImagePrefix(prefix: string): string {
  return prefix
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
}

/** Stable k8s secret name for a registry id (DNS-1123). */
export function registryPullSecretName(registryId: string): string {
  const short = registryId.replace(/-/g, "").slice(0, 12).toLowerCase()
  return `hostrig-reg-${short}`
}
