---
title: Git connect & push-to-deploy
description: Connect GitHub App or GitLab OAuth, pick a repo, auto webhooks, and private clones.
---

Hostrig treats git as an **identity you connect once**, not a secret you re-paste per project.

## Happy path

1. Open **Integrations** in the dashboard.
2. **GitHub:** Create GitHub App (one click manifest) → Connect GitHub → install on your account/org.
3. **GitLab:** Save OAuth Application credentials → Connect GitLab.
4. On a project → **Settings → Source** → pick a repository and branch → **Connect**.
5. Push to that branch → production deploy.

Hostrig registers the push webhook and clones with short-lived credentials. You should not need to paste a personal access token.

## Requirements

| Item                | Notes                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `DEPLOW_PUBLIC_URL` | Public URL of the control plane (OAuth callbacks + webhook URL). Use a tunnel in production. |
| GitHub App          | Contents: read · Metadata: read · Webhooks: read/write · Events: push                        |
| GitLab OAuth        | Scopes: `read_api`, `read_repository`, `write_repository`                                    |

## Advanced

- **PAT:** Source → Advanced → paste a token (escape hatch).
- **Platform tokens:** `DEPLOW_GITHUB_TOKEN` / `DEPLOW_GITLAB_TOKEN` for operator-wide listing.
- Manual webhook URL is only needed if auto-registration fails.

Contributor detail: repository `docs/git-oauth.md`.
