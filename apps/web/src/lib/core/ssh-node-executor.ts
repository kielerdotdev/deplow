import type { DeployOptions, NodeStatus } from "@deplow/shared"

import type { DeployResult, NodeExecutor } from "./node-executor"

/**
 * SSH + Docker node executor.
 * Local/dev path uses DockerNodeExecutor; this remains for remote VPS nodes.
 */
export class SshNodeExecutor implements NodeExecutor {
  readonly provider = "ssh"

  async deployApp(
    _nodeId: string,
    _options: DeployOptions,
  ): Promise<DeployResult> {
    throw new Error(
      "SshNodeExecutor is not configured. Register a docker node for local deploys.",
    )
  }

  async getLogs(_nodeId: string, _serviceName?: string): Promise<string> {
    throw new Error("SshNodeExecutor.getLogs is not implemented")
  }

  async exec(_nodeId: string, _command: string): Promise<string> {
    throw new Error("SshNodeExecutor.exec is not implemented")
  }

  async getStatus(_nodeId: string): Promise<NodeStatus> {
    throw new Error("SshNodeExecutor.getStatus is not implemented")
  }

  async stopApp(_nodeId: string, _serviceName: string): Promise<void> {
    throw new Error("SshNodeExecutor.stopApp is not implemented")
  }

  async removeApp(_nodeId: string, _serviceName: string): Promise<void> {
    throw new Error("SshNodeExecutor.removeApp is not implemented")
  }
}
