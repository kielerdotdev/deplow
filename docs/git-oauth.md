# Git OAuth — GitHub App + GitLab OAuth

You are implementing **first-class git identity** for Hostrig. Follow this document.

- Product: [`sequencing.md`](./sequencing.md) · [`product.md`](./product.md)
- Stance: PAT is **Advanced** only; happy path is Connect provider → pick repo → auto webhook → private clone

## Mission

```text
Connect once → pick repo → push deploys
  · no PAT paste on happy path
  · webhook auto-registered
  · private clone with short-lived credentials
```

**Login stays email/password.** “Connect GitHub” is a git link, not control-plane auth.

## Decisions

| Choice                   | Detail                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------- |
| **GitHub**               | **GitHub App** + user OAuth to authorize/install; installation tokens for clone/API |
| **GitLab**               | **OAuth Application**; refreshable user token                                       |
| **PAT / platform token** | Advanced escape hatch only                                                          |
| **Webhooks**             | Auto-create on `connectGit`; best-effort delete on disconnect                       |
| **Clone auth**           | `GIT_CONFIG_*` extraheader (never log tokens; avoid bare URL-in-argv when possible) |

## Permissions (GitHub App)

Manifest keys (not UI labels):

| Permission key     | Access | Why                                  |
| ------------------ | ------ | ------------------------------------ |
| `contents`         | read   | Clone / `ls-remote`                  |
| `metadata`         | read   | Required                             |
| `repository_hooks` | write  | Auto-register per-repo push webhooks |

**Do not** use `webhooks` in the manifest — GitHub rejects it (`resource is not included in the list`).

### Localhost / private URLs

GitHub **rejects** App-level `hook_attributes.url` when it is not on the public Internet (`localhost`, RFC1918, etc.).  
`buildGitHubAppManifest` **omits** `hook_attributes` in that case so Create App still works.

- OAuth `callback_urls` include `DEPLOW_PUBLIC_URL` **and** `http://localhost:3000` / `127.0.0.1` so local vs LAN mismatches are less painful.
- **Connect GitHub** does **not** send `redirect_uri` in the authorize request (avoids “redirect_uri is not associated…” when env host ≠ App callback). GitHub uses the App’s registered Callback URL(s).
- If Connect still fails: open the App → **Callback URL** and add  
  `{DEPLOW_PUBLIC_URL}/api/git/oauth/github/callback` exactly (Integrations page shows this URL).
- For GitHub → your laptop push webhooks, set `DEPLOW_PUBLIC_URL` to a **tunnel** (cloudflared, ngrok), then create/recreate the App.
- Per-repo hooks are still created via API on connect when the control plane URL is reachable.

## Schema (summary)

- `git_provider_links` — per-user provider connection
- `github_app_installations` — install metadata
- `platform_integrations` — encrypted App / OAuth client config
- `projects.gitAuthMethod`, `gitInstallationId`, `gitAccessTokenEncrypted`, `gitRemoteWebhookId`, `gitRepoFullName`

## Core modules

| File                 | Role                                  |
| -------------------- | ------------------------------------- |
| `git-clone-auth.ts`  | Auth env + redaction for `git` spawn  |
| `github-app.ts`      | JWT, installation token, repos, hooks |
| `gitlab-oauth.ts`    | authorize, exchange, refresh, hooks   |
| `git-credentials.ts` | Resolve token for project/user        |
| `git.service.ts`     | `syncRepo({ auth })`                  |

## UX rules

1. Primary buttons: **Connect GitHub** / **Connect GitLab**
2. PAT under **Advanced**
3. No webhook secret copy on happy path when auto-register succeeds
4. “Connected as @login” when linked
5. Human errors (App missing, install needed, clone fail)

## Remove / replace a GitHub App

Integrations → **Remove App**:

1. Uninstalls the App from every account/org (GitHub API `DELETE /app/installations/{id}`)
2. Clears encrypted credentials + git links on this server
3. Opens GitHub **Advanced** settings so you can **Delete GitHub App** (GitHub has no API to delete the registration)

Then **Create GitHub App** again so callback URLs match current `DEPLOW_PUBLIC_URL`.

## Acceptance

- Happy path without PAT paste
- Private clone works
- Auto webhook + push deploy
- Disconnect cleans remote hook (best effort)
- Remove App clears local config + uninstalls remotes
- `pnpm check` / `pnpm test` pass
