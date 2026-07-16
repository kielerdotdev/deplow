/**
 * Observe synthetic data generator
 *
 * Scenario-weighted traffic inspired by:
 * - [getsentry/ingest-load-tester](https://github.com/getsentry/ingest-load-tester) (task factories, span trees, event groups)
 * - [PostHog demo seeding](https://github.com/PostHog/posthog-demo-3000) (personas, historical window, narratives)
 *
 * ```bash
 * pnpm observe:load -- --project-id <uuid> [--dsn <sentry-dsn>] [--hours 24] [--traces 8000]
 * pnpm observe:load -- --project-id <uuid> --continuous
 * ```
 *
 * Scenarios include checkout, browse, search, payment_fail, cache_stampede,
 * healthcheck (for exclude-internal), worker pipelines, plus timeline incidents
 * (regression deploy 1.3.0, error storm, slow band).
 */
export {}
