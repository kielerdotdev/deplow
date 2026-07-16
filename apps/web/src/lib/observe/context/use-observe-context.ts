import { useCallback, useMemo } from "react"
import { useNavigate, useRouterState } from "@tanstack/react-router"

import type { ObserveContext } from "./types"
import { mergeContext, parseContext, serializeContext } from "./url"

/**
 * Bind Observe Context to the current route's search params.
 * URL is the source of truth for investigation state.
 */
export function useObserveContext() {
  const search = useRouterState({
    select: (s) => s.location.search as Record<string, unknown>,
  })
  const navigate = useNavigate()

  const context = useMemo(() => parseContext(search), [search])

  const setContext = useCallback(
    (next: ObserveContext | ((prev: ObserveContext) => ObserveContext)) => {
      const resolved = typeof next === "function" ? next(context) : next
      const params = serializeContext(resolved)
      void navigate({
        // Keep path; replace search only — cast for cross-route Context usage
        search: params as never,
        replace: true,
      })
    },
    [context, navigate],
  )

  const patchContext = useCallback(
    (patch: Partial<ObserveContext>) => {
      setContext(mergeContext(context, patch))
    },
    [context, setContext],
  )

  return { context, setContext, patchContext }
}
