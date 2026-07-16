import type { MCPServerPrompts } from "@mastra/mcp"

const prompts = [
  {
    name: "deploy_from_git",
    description:
      "Deploy a git repository to Hostrig end-to-end (create project, analyze, deploy, wait for URL).",
    version: "1.0.0",
    arguments: [
      {
        name: "repoUrl",
        description: "HTTPS git repository URL",
        required: true,
      },
      {
        name: "projectName",
        description:
          "Lowercase project slug (letters, numbers, hyphens). Omit if using an existing projectId.",
        required: false,
      },
      {
        name: "branch",
        description: "Git branch (default main)",
        required: false,
      },
    ],
  },
]

const getPromptMessages: MCPServerPrompts["getPromptMessages"] = async ({
  name,
  args,
}) => {
  if (name !== "deploy_from_git") {
    throw new Error(`Prompt "${name}" not found`)
  }
  const repoUrl = (args?.repoUrl as string | undefined) ?? "<REPO_URL>"
  const projectName =
    (args?.projectName as string | undefined) ?? "<project-slug>"
  const branch = (args?.branch as string | undefined) ?? "main"

  return [
    {
      role: "user",
      content: {
        type: "text",
        text: [
          `Deploy this repository to Hostrig and return the live public URL.`,
          ``,
          `Prefer the deploy_from_git tool with:`,
          `- projectName: ${projectName}`,
          `- repoUrl: ${repoUrl}`,
          `- branch: ${branch}`,
          ``,
          `If deploy_from_git fails because multiple Dockerfiles or apps were found, re-call it with dockerfilePath or rootDirectory.`,
          `On failure, use deployment_logs and deployment_get for diagnostics.`,
          `Do not invent URLs — only report publicUrl from tool results.`,
        ].join("\n"),
      },
    },
  ]
}

export const promptHandlers: MCPServerPrompts = {
  listPrompts: async () => prompts,
  getPromptMessages,
}
