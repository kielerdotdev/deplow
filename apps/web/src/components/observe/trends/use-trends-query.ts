import { useEffect, useRef, useState } from "react"

import type { TrendsQuery, TrendsResult } from "@/lib/observe/trends"
import { client } from "@/lib/orpc"

const DEBOUNCE_MS = 400

export function useTrendsQuery(
  projectId: string,
  query: TrendsQuery,
): {
  result: TrendsResult | null
  error: string | null
  loading: boolean
  refresh: () => void
} {
  const [result, setResult] = useState<TrendsResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)
  const lastGood = useRef<TrendsResult | null>(null)
  const queryKey = JSON.stringify(query)

  useEffect(() => {
    let cancelled = false
    const handle = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      void client.observe.trends
        .run({ projectId, query })
        .then((res) => {
          if (cancelled) return
          lastGood.current = res as TrendsResult
          setResult(res as TrendsResult)
          setLoading(false)
        })
        .catch((err: unknown) => {
          if (cancelled) return
          setError(err instanceof Error ? err.message : "Query failed")
          setResult(lastGood.current)
          setLoading(false)
        })
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queryKey captures query
  }, [projectId, queryKey, tick])

  return {
    result,
    error,
    loading,
    refresh: () => setTick((t) => t + 1),
  }
}
