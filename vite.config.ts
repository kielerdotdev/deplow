import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite-plus"

const rootDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * Root Vite+ config: shared lint (Oxlint), format (Oxfmt), tests, and staged hooks.
 * App-specific Vite plugins live in apps/web/vite.config.ts.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.join(rootDir, "apps/web/src"),
    },
  },
  lint: {
    ignorePatterns: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.output/**",
      "**/.turbo/**",
      "**/.tanstack/**",
      "**/data/**",
      "**/drizzle/**",
      "**/routeTree.gen.ts",
      "pnpm-lock.yaml",
    ],
    plugins: ["typescript"],
    options: {
      typeAware: false,
      typeCheck: false,
    },
    categories: {
      correctness: "error",
      suspicious: "warn",
    },
    overrides: [
      {
        files: ["apps/web/**/*.{ts,tsx}"],
        plugins: ["typescript", "react"],
        rules: {
          "react/rules-of-hooks": "error",
          "react/exhaustive-deps": "warn",
        },
      },
      {
        files: [
          "packages/db/**/*.ts",
          "apps/web/src/lib/auth.ts",
          "apps/web/src/lib/auth.functions.ts",
          "apps/web/src/routes/api/**/*.ts",
        ],
        env: {
          node: true,
        },
      },
      {
        files: ["**/*.{test,spec}.{ts,tsx}"],
        plugins: ["typescript", "vitest"],
        rules: {
          "vitest/no-disabled-tests": "warn",
        },
      },
    ],
  },

  fmt: {
    // Match previous Prettier defaults for this repo
    semi: false,
    singleQuote: false,
    printWidth: 80,
    trailingComma: "all",
    tabWidth: 2,
    endOfLine: "lf",
    ignorePatterns: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.output/**",
      "**/data/**",
      "**/drizzle/**",
      "**/routeTree.gen.ts",
      "pnpm-lock.yaml",
    ],
  },

  test: {
    include: [
      "apps/web/src/**/*.{test,spec}.{ts,tsx}",
      "packages/shared/src/**/*.{test,spec}.ts",
      "packages/db/src/**/*.{test,spec}.ts",
    ],
    environment: "node",
    // React component tests need a DOM
    environmentMatchGlobs: [["**/*.{test,spec}.tsx", "jsdom"]],
    passWithNoTests: false,
  },

  staged: {
    "*": "vp check --fix",
  },
})
