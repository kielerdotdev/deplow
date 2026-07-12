---
title: Deploy an app
description: Deploy from a prebuilt image, Dockerfile, or Railpack build via the dashboard.
---

Deploying runs a container for a **web** or **worker** service. Bind postgres/redis/S3 first if the app needs those env vars.

## Via the dashboard

1. Sign in at [http://localhost:3000](http://localhost:3000)
2. Create a project (or open an existing one)
3. Add a web service (and postgres/redis if needed), then **bind** data → app
4. Choose a deploy mode:
   - **Image** — enter a registry reference
   - **Source** — provide a local path or connected git repo; builds with **Railpack** by default. Dockerfile builds are opt-in under Advanced.
5. Watch deployment logs and confirm the container is running

Public URL (v1): `https://{project}.{baseDomain}` for the primary web service when Domains auto-subdomains are on. Custom domains are v2.

## Deploy inputs

| Mode           | Input                                              | Build step         |
| -------------- | -------------------------------------------------- | ------------------ |
| Prebuilt image | `image: "nginx:alpine"`                            | Pull from registry |
| Dockerfile     | `source: "/path/to/app"` with `Dockerfile` present | `docker build`     |
| Railpack       | `source: "/path/to/app"` without `Dockerfile`      | `railpack build`   |

## Injected environment

Bound apps receive linked credentials at deploy time:

```ini
DATABASE_URL=postgres://...
REDIS_URL=redis://...
S3_ENDPOINT=http://...
S3_BUCKET=my-project-bucket
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
```

Your app should read these like any twelve-factor config.

## BuildKit requirement

Source and Dockerfile deploys require BuildKit (`scripts/install.sh` starts the container):

```bash
export BUILDKIT_HOST=docker-container://buildkit
```

Without BuildKit, builds fail early with a clear error.

## Stopping a deployment

Use the project page to stop the running container. Postgres, Redis, and S3 services remain until you destroy them or the project.
