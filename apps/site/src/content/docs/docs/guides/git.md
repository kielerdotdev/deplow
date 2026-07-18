---
title: Git connect & push-to-deploy
description: Connect GitHub App or GitLab OAuth, pick a repo, auto webhooks, and private clones.
---

Hostrig treats git as an **identity you connect once**, not a secret you re-paste per project.

## Happy path

1. Open **Settings → Integrations** (instance admin for app/OAuth setup).
2. **GitHub:** Create GitHub App (manifest) → Connect GitHub → install on your account/org.
3. **GitLab:** Save OAuth Application credentials → Connect GitLab.
4. On a project or service → pick a repository and branch → **Connect**.
5. Ensure a [default build registry](/docs/guides/registries/) exists.
6. Push to that branch → production deploy (Railpack/Dockerfile → registry → k3s).

Hostrig registers the push webhook and clones with short-lived credentials. You should not need to paste a personal access token for the happy path.

## Requirements

| Item | Notes |
| --- | --- |
| `HOSTRIG_PUBLIC_URL` | Public URL of the control plane (OAuth callbacks + webhook URL) |
| GitHub App | Contents: read · Metadata: read · Webhooks: read/write · Events: push |
| GitLab OAuth | Scopes: `read_api`, `read_repository`, `write_repository` |
| Registry | Default build registry for source builds |

## Webhooks

- Signature-verified (`X-Hub-Signature-256` / `X-Gitlab-Token`)
- Endpoint shape: `POST /api/webhooks/git/{serviceId}`
- Push to the configured production branch deploys that service

## Advanced

- **PAT:** Advanced source settings — paste a token (escape hatch for private clones without OAuth)
- **Platform tokens:** `HOSTRIG_GITHUB_TOKEN` / `HOSTRIG_GITLAB_TOKEN` for operator-wide listing
- Manual webhook URL only if auto-registration fails

Contributor detail: repository `docs/git-oauth.md`.
