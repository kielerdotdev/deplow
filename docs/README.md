# Hostrig docs

Canonical project documentation. **These files dictate product, marketing, and implementation.** If the marketing site, Starlight user docs, README, or code disagree with this folder, this folder wins — update the other surfaces.

## Reading order

| Doc                                      | Role                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------- |
| [philosophy.md](./philosophy.md)         | **Why Hostrig exists** — problem and principles                       |
| [sequencing.md](./sequencing.md)         | **v1 / v2 / v3** — what to build now vs later                        |
| [gtm.md](./gtm.md)                       | **Public launch bar** — happy path vs Coolify/Dokploy                |
| [product.md](./product.md)               | **What we ship** — one project shape, in/out of scope                |
| [observe.md](./observe.md)               | **Optional Observe** — Sentry + OTel + ClickHouse                    |
| [data-plane.md](./data-plane.md)         | **DB/Redis/S3 linking** — design notes                               |
| [security.md](./security.md)             | **Security stance** — non-negotiables                                |
| [access.md](./access.md)                 | **Proxy + cloudflared (v1)** — wildcard URLs                         |
| [secure-runtime.md](./secure-runtime.md) | **How user apps run** — gVisor + hardened Docker                     |
| [git-oauth.md](./git-oauth.md)           | GitHub App / GitLab OAuth                                            |
| [mcp.md](./mcp.md)                       | MCP server for agents                                                |

## Surfaces that must stay aligned

| Surface                          | Must follow                                       |
| -------------------------------- | ------------------------------------------------- |
| Root `README.md`                 | philosophy + product (short)                      |
| `apps/site` landing page         | philosophy + security (honest, not soft)          |
| `apps/site` Starlight docs       | product + security + secure-runtime (user-facing) |
| Code in `apps/web/src/lib/core/` | product + secure-runtime                          |

## Not in this folder

User-facing install/guides live under `apps/site/src/content/docs/` (Starlight). They are derived from these docs, not a second source of truth.
