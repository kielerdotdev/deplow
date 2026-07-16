import { useEffect, useRef, useState } from "react"
import { SearchIcon, XIcon } from "lucide-react"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { cn } from "@/lib/utils"

/**
 * Search field that commits on debounce / Enter / blur.
 * Avoids rewriting the URL (and refetching) on every keystroke.
 */
export function QueryInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
  debounceMs = 320,
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  className?: string
  debounceMs?: number
}) {
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    if (draft === value) return
    const t = window.setTimeout(() => onChange(draft), debounceMs)
    return () => window.clearTimeout(t)
  }, [draft, value, onChange, debounceMs])

  function commit() {
    if (draft !== value) onChange(draft)
  }

  function clear() {
    setDraft("")
    onChange("")
    inputRef.current?.focus()
  }

  return (
    <InputGroup className={cn("min-w-[12rem] flex-1", className)}>
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        placeholder={placeholder}
        className="text-sm"
        aria-label="Search"
        autoComplete="off"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            commit()
            ;(e.target as HTMLInputElement).blur()
          }
          if (e.key === "Escape" && draft) {
            e.preventDefault()
            clear()
          }
        }}
      />
      {draft ? (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label="Clear search"
            onMouseDown={(e) => e.preventDefault()}
            onClick={clear}
          >
            <XIcon />
          </InputGroupButton>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  )
}
