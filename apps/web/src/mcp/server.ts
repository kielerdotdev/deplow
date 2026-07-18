import { MCPServer } from "@mastra/mcp"

import { promptHandlers } from "./prompts"
import { bindingCreateTool } from "./tools/bindings"
import { deployFromGitTool } from "./tools/deploy-from-git"
import {
  deploymentGetTool,
  deploymentLogsTool,
  deploymentRollbackTool,
  operationGetTool,
} from "./tools/deployments"
import {
  projectCreateTool,
  projectDestroyTool,
  projectGetTool,
  projectListTool,
} from "./tools/projects"
import {
  serviceAddPostgresTool,
  serviceAddRedisTool,
  serviceCreateAndDeployTool,
  serviceListTool,
} from "./tools/services"
import { sourceAnalyzeTool } from "./tools/source"

export const hostrigMcpServer = new MCPServer({
  id: "hostrig",
  name: "Hostrig",
  version: "0.1.0",
  description:
    "Deploy and manage Hostrig projects: create projects, analyze git sources, deploy services, bind data services, rollback, and read status/logs.",
  instructions: [
    "Prefer deploy_from_git for end-to-end deploys from a git URL.",
    "deploy_from_git never creates Postgres/Redis or bindings — use service_add_postgres / service_add_redis and binding_create explicitly.",
    "Use atomic tools (project_list, project_create, source_analyze, service_create_and_deploy, deployment_get, deployment_logs, deployment_rollback) when you need finer control or debugging.",
    "Project names must be lowercase slugs. Always return the publicUrl from tool results when available.",
  ].join(" "),
  tools: {
    project_create: projectCreateTool,
    project_get: projectGetTool,
    project_list: projectListTool,
    project_destroy: projectDestroyTool,
    source_analyze: sourceAnalyzeTool,
    service_create_and_deploy: serviceCreateAndDeployTool,
    service_list: serviceListTool,
    service_add_postgres: serviceAddPostgresTool,
    service_add_redis: serviceAddRedisTool,
    binding_create: bindingCreateTool,
    deployment_get: deploymentGetTool,
    operation_get: operationGetTool,
    deployment_logs: deploymentLogsTool,
    deployment_rollback: deploymentRollbackTool,
    deploy_from_git: deployFromGitTool,
  },
  prompts: promptHandlers,
})
