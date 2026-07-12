import { useEffect, useEffectEvent, useRef, useState } from "react"

export type LogStreamChunk<TMeta = unknown> = {
  body: string
  /** True while a build/deploy is in progress (UI pulse). */
  live?: boolean
  meta?: TMeta
}

export type UseLogStreamOptions<TMeta = unknown> = {
  /** When false, polling stops and state is left as-is. */
  enabled: boolean
  /** Poll interval while the view is active. Default 1200ms. */
  intervalMs?: number
  /** Change this to reset and refetch (e.g. deployment id). */
  watchKey?: string
  fetch: () => Promise<LogStreamChunk<TMeta>>
}

export type UseLogStreamResult<TMeta = unknown> = {
  body: string
  live: boolean
  meta: TMeta | undefined
  error: string | null
  loading: boolean
  /** Force an immediate fetch. */
  reload: () => void
}

/**
 * Shared log follower: polls `fetch` while `enabled` and the document is
 * visible. Used for build + runtime logs so the UI never needs a Refresh
 * button.
 */
export function useLogStream<TMeta = unknown>(
  options: UseLogStreamOptions<TMeta>,
): UseLogStreamResult<TMeta> {
  const { enabled, intervalMs = 1200, watchKey } = options
  const [body, setBody] = useState("")
  const [live, setLive] = useState(false)
  const [meta, setMeta] = useState<TMeta | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)
  const mounted = useRef(true)

  const runFetch = useEffectEvent(async (silent: boolean) => {
    if (!silent) setLoading(true)
    try {
      const next = await options.fetch()
      if (!mounted.current) return
      setBody(next.body)
      setLive(Boolean(next.live))
      setMeta(next.meta)
      setError(null)
    } catch (cause) {
      if (!mounted.current) return
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (mounted.current && !silent) setLoading(false)
    }
  })

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    void runFetch(false)
  }, [enabled, watchKey, tick])

  useEffect(() => {
    if (!enabled) return

    const poll = () => {
      if (typeof document !== "undefined" && document.hidden) return
      void runFetch(true)
    }

    const id = window.setInterval(poll, intervalMs)
    const onVisible = () => {
      if (!document.hidden) poll()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [enabled, watchKey, intervalMs])

  return {
    body,
    live,
    meta,
    error,
    loading,
    reload: () => setTick((n) => n + 1),
  }
}
