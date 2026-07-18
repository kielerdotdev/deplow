/**
 * Auto-provisioned Kubernetes providers (Hetzner cloud-init).
 * BYO kubeconfig is not a managed provider — it only stores a connection.
 * Legacy `hetzner_k3s` DB rows are not managed via UI anymore.
 */
export type ManagedClusterProviderId = "hetzner"

export type ManagedClusterCapabilities = {
  /** Can create a new cluster when none is connected. */
  canCreate: boolean
  /** Can spawn/join additional worker nodes. */
  canAddNode: boolean
  /** Can destroy a worker node by Kubernetes node name. */
  canRemoveNode: boolean
  /** Can reveal stored kubeconfig YAML (admin). */
  canViewKubeconfig: boolean
  /** Can destroy the whole cluster via the provider (optional). */
  canDestroy: boolean
}

export type CreateManagedClusterInput = {
  name?: string
  serverType?: string
  location?: string
}

export type CreateManagedClusterResult = {
  name: string
  /** Present when a cloud VM was spawned immediately. */
  spawnedServerId?: string
  ip?: string
}

export type AddManagedNodeInput = {
  name?: string
  serverType?: string
  location?: string
}

export type AddManagedNodeResult = {
  name: string
  spawnedServerId?: string
  ip?: string
  message?: string
}

export type RemoveManagedNodeInput = {
  /** Kubernetes node name (must be a worker, not control-plane). */
  nodeName: string
}

export type RemoveManagedNodeResult = {
  nodeName: string
  message?: string
}

/**
 * Pluggable auto-provision backend for a connected (or about-to-be) cluster.
 * Implementations live under this package; call sites use the registry only.
 */
export interface ManagedClusterProvider {
  readonly id: ManagedClusterProviderId
  readonly label: string

  isConfigured(): boolean | Promise<boolean>
  capabilities():
    | ManagedClusterCapabilities
    | Promise<ManagedClusterCapabilities>

  create(input: CreateManagedClusterInput): Promise<CreateManagedClusterResult>
  addNode(input: AddManagedNodeInput): Promise<AddManagedNodeResult>
  removeNode(input: RemoveManagedNodeInput): Promise<RemoveManagedNodeResult>
  getKubeconfig(): Promise<string>
  destroy?(): Promise<void>
}
