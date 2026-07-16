import type { DeployOptions, NodeStatus } from "@deplow/shared"

export type { DeployOptions, NodeStatus }

export interface DeployResult {
  containerId: string
  serviceName: string
  /** Host port published for remote proxy (agent nodes) */
  publishedPort?: number
}

/**
 * Abstraction for deploying and managing workloads on existing nodes.
 * Implementations must not depend on oRPC or TanStack Start.
 */
export interface NodeExecutor {
  provider: string

  deployApp(nodeId: string, options: DeployOptions): Promise<DeployResult>
  getLogs(nodeId: string, serviceName?: string): Promise<string>
  exec(nodeId: string, command: string): Promise<string>
  getStatus(nodeId: string): Promise<NodeStatus>
  stopApp(nodeId: string, serviceName: string): Promise<void>
  removeApp(nodeId: string, serviceName: string): Promise<void>
}
