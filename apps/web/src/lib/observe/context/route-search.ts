import {
  parseContext,
  serializeContext,
  type ObserveContext,
} from "@/lib/observe/context"

/** Issue detail search: Context + optional selected event id. */
export function serializeIssueSearch(
  ctx: ObserveContext,
  event?: string | null,
): Record<string, string | undefined> & { event: string | undefined } {
  return {
    ...serializeContext(ctx),
    event: event ?? undefined,
  }
}

export function parseIssueSearch(search: Record<string, unknown>): {
  context: ObserveContext
  event: string | undefined
} {
  return {
    context: parseContext(search),
    event: typeof search.event === "string" ? search.event : undefined,
  }
}

/** Trace detail search: Context + optional selected span id. */
export function serializeTraceSearch(
  ctx: ObserveContext,
  span?: string | null,
): Record<string, string | undefined> & { span: string | undefined } {
  return {
    ...serializeContext(ctx),
    span: span ?? undefined,
  }
}

export function parseTraceSearch(search: Record<string, unknown>): {
  context: ObserveContext
  span: string | undefined
} {
  return {
    context: parseContext(search),
    span: typeof search.span === "string" ? search.span : undefined,
  }
}

/** Logs list search: Context + optional selected log row id. */
export function serializeLogsSearch(
  ctx: ObserveContext,
  log?: string | null,
): Record<string, string | undefined> & { log: string | undefined } {
  return {
    ...serializeContext(ctx),
    log: log ?? undefined,
  }
}

export function parseLogsSearch(search: Record<string, unknown>): {
  context: ObserveContext
  log: string | undefined
} {
  return {
    context: parseContext(search),
    log: typeof search.log === "string" ? search.log : undefined,
  }
}

/** Issues list search: Context + status + optional inspect drawer issue id. */
export function serializeIssuesListSearch(
  ctx: ObserveContext,
  status: string,
  inspect?: string | null,
): Record<string, string | undefined> & {
  status: string
  inspect: string | undefined
} {
  return {
    ...serializeContext(ctx),
    status,
    inspect: inspect ?? undefined,
  }
}

export function parseIssuesListSearch(search: Record<string, unknown>): {
  context: ObserveContext
  inspect: string | undefined
} {
  return {
    context: parseContext(search),
    inspect: typeof search.inspect === "string" ? search.inspect : undefined,
  }
}
