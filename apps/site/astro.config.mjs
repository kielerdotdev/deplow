// @ts-check
import { defineConfig } from "astro/config"
import starlight from "@astrojs/starlight"

// https://astro.build/config
export default defineConfig({
  site: "https://deplow.dev",
  integrations: [
    starlight({
      title: "deplow",
      description:
        "Opinionated self-hosted project runtime — app + Postgres + Redis + S3 on your Docker host, user apps sandboxed with gVisor.",
      logo: {
        src: "./src/assets/logo.svg",
        replacesTitle: true,
      },
      favicon: "/favicon.svg",
      customCss: ["./src/styles/custom.css"],
      social: [],
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
            href: "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:ital,wght@0,400;0,500;1,400&display=swap",
          },
        },
      ],
      components: {
        Header: "./src/components/DocsHeader.astro",
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
          ],
        },
        {
          label: "Concepts",
          items: [
            { label: "Architecture", slug: "docs/concepts/architecture" },
            { label: "Projects", slug: "docs/concepts/projects" },
            { label: "Deploy modes", slug: "docs/concepts/deploy-modes" },
            { label: "Security", slug: "docs/concepts/security" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Deploy an app", slug: "docs/guides/deploy" },
            { label: "Git connect", slug: "docs/guides/git" },
            { label: "Backups", slug: "docs/guides/backups" },
            { label: "Secrets & env", slug: "docs/guides/secrets" },
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
