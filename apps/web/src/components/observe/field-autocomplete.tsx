import { useEffect, useId, useRef, useState } from "react"
import { ChevronDownIcon } from "lucide-react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { client } from "@/lib/orpc"

type SuggestMode = "fields" | "values"

export function FieldAutocomplete({
  projectId,
  mode,
  field,
  value,
  onChange,
  placeholder,
  className,
  signal = "spans",
}: {
  projectId: string
  mode: SuggestMode
  /** Required when mode=values */
  field?: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
  className?: string
  signal?: "spans" | "logs"
}) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Array<{ label: string; hint?: string }>>([])
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  useEffect(() => {
    if (!open) return
    if (mode === "values" && !field?.trim()) {
      setItems([])
      return
    }
    let cancelled = false
    const handle = window.setTimeout(() => {
      setLoading(true)
      const req =
        mode === "fields"
          ? client.observe.fields.suggest({
              projectId,
              q: value || undefined,
              signal,
            })
          : client.observe.fields.values({
              projectId,
              field: field!,
              q: value || undefined,
              signal,
            })
      void req
        .then((res) => {
          if (cancelled) return
          if (mode === "fields") {
            const r = res as {
              fields: Array<{ key: string; kind: string; count: number }>
            }
            setItems(
              r.fields.map((f) => ({
                label: f.key,
                hint:
                  f.kind === "known"
                    ? "dimension"
                    : f.count
                      ? `${f.count}`
                      : "attr",
              })),
            )
          } else {
            const r = res as {
              values: Array<{ value: string; count: number }>
            }
            setItems(
              r.values.map((v) => ({
                label: v.value,
                hint: String(v.count),
              })),
            )
          }
          setLoading(false)
        })
        .catch(() => {
          if (!cancelled) {
            setItems([])
            setLoading(false)
          }
        })
    }, 180)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [open, value, mode, field, projectId, signal])

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="h-7 w-full pr-6 text-xs"
        aria-autocomplete="list"
        aria-controls={listId}
        autoComplete="off"
      />
      <ChevronDownIcon className="pointer-events-none absolute right-1.5 top-1.5 size-3.5 text-muted-foreground/60" />
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-40 mt-1 max-h-48 w-full min-w-[10rem] overflow-auto rounded-md border border-border/80 bg-popover py-1 text-xs shadow-md"
        >
          {loading ? (
            <li className="px-2 py-1.5 text-muted-foreground">Loading…</li>
          ) : items.length === 0 ? (
            <li className="px-2 py-1.5 text-muted-foreground">No matches</li>
          ) : (
            items.map((item) => (
              <li key={item.label}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left hover:bg-muted/70"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(item.label)
                    setOpen(false)
                  }}
                >
                  <span className="truncate font-medium">{item.label}</span>
                  {item.hint ? (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {item.hint}
                    </span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
