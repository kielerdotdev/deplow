// @ts-check
import { defineConfig } from "astro/config"
import starlight from "@astrojs/starlight"

// https://astro.build/config
export default defineConfig({
  site: "https://hostrig.com",
  integrations: [
    starlight({
      title: "Hostrig",
      description:
        "Opinionated self-hosted PaaS on k3s — typed services, gVisor for user apps, git push-to-deploy, platform wildcard URLs.",
      logo: {
        src: "./src/assets/logo.svg",
        replacesTitle: true,
      },
      favicon: "/favicon.svg",
      customCss: ["./src/styles/custom.css"],
      expressiveCode: {
        themes: ["github-dark-default"],
        defaultProps: {
          wrap: true,
          preserveIndent: false,
        },
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/kielerdotdev/deplow",
        },
      ],
      head: [
        {
          tag: "link",
          attrs: {
            rel: "preconnect",
            href: "https://fonts.googleapis.com",
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "preconnect",
            href: "https://fonts.gstatic.com",
            crossorigin: true,
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "stylesheet",
            href: "https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=IBM+Plex+Mono:wght@400;500&display=swap",
          },
        },
      ],
      components: {
        Header: "./src/components/DocsHeader.astro",
        ThemeSelect: "./src/components/Empty.astro",
        ThemeProvider: "./src/components/ThemeProvider.astro",
      },
      sidebar: [
        {
          label: "Getting started",
          items: [
            { label: "Introduction", slug: "docs" },
            {
              label: "Prerequisites",
              slug: "docs/getting-started/prerequisites",
            },
            { label: "Quick start", slug: "docs/getting-started/quick-start" },
            {
              label: "Development",
              slug: "docs/getting-started/development",
            },
          ],
        },
        {
          label: "Concepts",
          items: [
            { label: "Scope", slug: "docs/concepts/scope" },
            { label: "Architecture", slug: "docs/concepts/architecture" },
            { label: "Projects & services", slug: "docs/concepts/projects" },
            { label: "Deploy modes", slug: "docs/concepts/deploy-modes" },
            { label: "Security", slug: "docs/concepts/security" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Connect a cluster", slug: "docs/guides/cluster" },
            { label: "Domains & URLs", slug: "docs/guides/domains" },
            { label: "Container registries", slug: "docs/guides/registries" },
            { label: "Deploy an app", slug: "docs/guides/deploy" },
            { label: "Bindings & secrets", slug: "docs/guides/secrets" },
            { label: "Git connect", slug: "docs/guides/git" },
            { label: "Backups", slug: "docs/guides/backups" },
            { label: "MCP for agents", slug: "docs/guides/mcp" },
            { label: "Observe (optional)", slug: "docs/guides/observe" },
          ],
        },
        {
          label: "Reference",
          items: [
            {
              label: "Environment variables",
              slug: "docs/reference/environment",
            },
            { label: "Platform ports", slug: "docs/reference/ports" },
            { label: "Scripts", slug: "docs/reference/scripts" },
          ],
        },
      ],
    }),
  ],
})
