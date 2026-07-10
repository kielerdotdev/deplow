---
title: Deploy an app
description: Deploy from a prebuilt image, Dockerfile, or Railpack build via the dashboard or API.
---

Deploying attaches a running container to your project's provisioned resources.

## Via the dashboard

1. Sign in at [http://localhost:3000](http://localhost:3000)
2. Create a project (or open an existing one)
3. Choose a deploy mode:
   - **Image** — enter a registry reference
   - **Source** — provide a local path; Railpack or Dockerfile build runs automatically
4. Watch deployment logs and confirm the container is running

## Deploy inputs

| Mode           | Input                                              | Build step         |
| -------------- | -------------------------------------------------- | ------------------ |
| Prebuilt image | `image: "nginx:alpine"`                            | Pull from registry |
| Dockerfile     | `source: "/path/to/app"` with `Dockerfile` present | `docker build`     |
| Railpack       | `source: "/path/to/app"` without `Dockerfile`      | `railpack build`   |

## Injected environment

The running container always receives project credentials:

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

Source and Dockerfile deploys require BuildKit:

```bash
export BUILDKIT_HOST=docker-container://buildkit
```

Without BuildKit, builds fail early with a clear error.

## Stopping a deployment

Use the project page or API to stop the running container. The project's provisioned Postgres, Redis, and S3 resources remain until you destroy the project.
