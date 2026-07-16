import { useEffect, useId, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { client } from "@/lib/orpc"
import type { TelemetryQuery } from "@/lib/observe/telemetry"
import { emptyFilterGroup } from "@/lib/observe/telemetry"
import {
  parseFilterExpression,
  serializeFilterExpression,
} from "@/lib/observe/telemetry/expression"

/**
 * Autocompleting filter expression input.
 * Beginners use facets; advanced users type `service = 'api' AND status = 'error'`.
 */
export function ExplorerExpressionInput({
  projectId,
  query,
  onChange,
  className,
  signal = "spans",
}: {
  projectId: string
  query: TelemetryQuery
  onChange: (next: TelemetryQuery) => void
  className?: string
  signal?: "spans" | "logs"
}) {
  const listId = useId()
  const [draft, setDraft] = useState(() =>
    serializeFilterExpression(query.filter),
  )
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setDraft(serializeFilterExpression(query.filter))
  }, [query.filter])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  useEffect(() => {
    if (!open) return
    const token = draft.split(/\s+/).pop() ?? ""
    const q = token.replace(/[=<>!].*$/, "").replace(/^['"]|['"]$/g, "")
    let cancelled = false
    const t = window.setTimeout(() => {
      void client.observe.fields
        .suggest({ projectId, q: q || undefined, signal })
        .then((res) => {
          if (cancelled) return
          setSuggestions(res.fields.map((f) => f.key).slice(0, 12))
        })
        .catch(() => {
          if (!cancelled) setSuggestions([])
        })
    }, 180)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [draft, open, projectId, signal])

  function commit(text: string) {
    const parsed = parseFilterExpression(text)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setError(null)
    onChange({
      ...query,
      filter: {
        ...(query.filter ?? emptyFilterGroup()),
        mode: "and",
        clauses: parsed.group.clauses,
        groups: [],
      },
    })
  }

  function applySuggestion(key: string) {
    const parts = draft.trimEnd().split(/\s+/)
    const last = parts[parts.length - 1] ?? ""
    if (!last || /[=<>!]/.test(last) || /^(AND|OR)$/i.test(last)) {
      setDraft((d) => `${d.trimEnd()}${d.trim() ? " " : ""}${key} = `)
    } else {
      parts[parts.length - 1] = key
      setDraft(parts.join(" ") + " = ")
    }
    setOpen(false)
  }

  return (
    <div
      ref={wrapRef}
      className={cn("relative w-full", className)}
      data-testid="explorer-expression-input"
    >
      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
        Filter expression
      </label>
      <input
        type="text"
        value={draft}
        spellCheck={false}
        autoComplete="off"
        aria-autocomplete="list"
        aria-controls={listId}
        placeholder="service = 'api' AND http.status_code >= 500"
        className={cn(
          "min-h-9 w-full rounded-md border border-border bg-background px-2.5 font-mono text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          error && "border-destructive",
        )}
        onChange={(e) => {
          setDraft(e.target.value)
          setError(null)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            commit(draft)
            ;(e.target as HTMLInputElement).blur()
          }
        }}
      />
      {error ? (
        <p className="mt-1 text-[11px] text-destructive">{error}</p>
      ) : null}
      {open && suggestions.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover py-1 shadow-md"
        >
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                role="option"
                className="flex w-full px-2.5 py-1.5 text-left font-mono text-xs hover:bg-muted"
                onMouseDown={(e) => {
                  e.preventDefault()
                  applySuggestion(s)
                }}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
