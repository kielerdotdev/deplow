#!/usr/bin/env node
/**
 * TanStack Start / Vite can emit different content hashes for styles.css?url
 * in the client vs SSR builds. If SSR HTML references a missing hash, alias
 * the real client CSS file so /assets/styles-*.css resolves.
 */
import fs from "node:fs"
import path from "node:path"

const clientDir = "apps/web/dist/client/assets"
const serverDir = "apps/web/dist/server"

const css = fs.readdirSync(clientDir).filter((f) => /^styles-.*\.css$/.test(f))
if (css.length < 1) {
  console.error("sync-ssr-css: no styles-*.css in", clientDir)
  process.exit(1)
}

// Prefer the non-aliased original (shortest unique set); use first real file
const real =
  css.find((f) => fs.statSync(path.join(clientDir, f)).size > 0) ?? css[0]

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      walk(p)
      continue
    }
    if (!/\.(js|mjs)$/.test(ent.name)) continue
    const src = fs.readFileSync(p, "utf8")
    const refs = src.match(/styles-[A-Za-z0-9_-]+\.css/g) || []
    for (const ref of new Set(refs)) {
      const dest = path.join(clientDir, ref)
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(path.join(clientDir, real), dest)
        console.log(`sync-ssr-css: aliased ${ref} -> ${real}`)
      }
    }
  }
}

walk(serverDir)
