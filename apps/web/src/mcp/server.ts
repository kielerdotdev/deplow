import { MCPServer } from "@mastra/mcp"

import { promptHandlers } from "./prompts"
import { deployFromGitTool } from "./tools/deploy-from-git"
import {
  deploymentGetTool,
  deploymentLogsTool,
  operationGetTool,
} from "./tools/deployments"
import { projectCreateTool, projectGetTool } from "./tools/projects"
import { serviceCreateAndDeployTool } from "./tools/services"
import { sourceAnalyzeTool } from "./tools/source"

export const deplowMcpServer = new MCPServer({
  id: "hostrig",
  name: "Hostrig",
  version: "0.1.0",
  description:
    "Deploy and manage Hostrig projects: create projects, analyze git sources, deploy services, and read status/logs.",
  instructions: [
    "Prefer deploy_from_git for end-to-end deploys from a git URL.",
    "Use atomic tools (project_create, source_analyze, service_create_and_deploy, deployment_get, deployment_logs) when you need finer control or debugging.",
    "Project names must be lowercase slugs. Always return the publicUrl from tool results when available.",
  ].join(" "),
  tools: {
    project_create: projectCreateTool,
    project_get: projectGetTool,
    source_analyze: sourceAnalyzeTool,
    service_create_and_deploy: serviceCreateAndDeployTool,
    deployment_get: deploymentGetTool,
    operation_get: operationGetTool,
    deployment_logs: deploymentLogsTool,
    deploy_from_git: deployFromGitTool,
  },
  prompts: promptHandlers,
})
