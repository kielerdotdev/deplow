import { useState } from "react"
import { ChevronDownIcon, SearchIcon, XIcon } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { cn } from "@/lib/utils"

export type FilterOption = {
  name: string
  count: number
}

type FilterSectionBaseProps = {
  title: string
  options: ReadonlyArray<FilterOption>
  selected: string[]
  onChange: (selected: string[]) => void
  defaultOpen?: boolean
  maxVisible?: number
  /** Optional swatch color per option name. */
  colorMap?: Record<string, string>
}

function FilterSectionInner({
  title,
  options,
  selected,
  onChange,
  defaultOpen = true,
  maxVisible = 5,
  searchable,
  colorMap,
}: FilterSectionBaseProps & { searchable: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [showAll, setShowAll] = useState(false)
  const [searchText, setSearchText] = useState("")

  if (options.length === 0) return null

  const filteredOptions =
    searchable && searchText
      ? options.filter((o) =>
          o.name.toLowerCase().includes(searchText.toLowerCase()),
        )
      : options

  const visibleOptions =
    showAll || searchText ? filteredOptions : filteredOptions.slice(0, maxVisible)
  const hasMore = !searchText && filteredOptions.length > maxVisible

  function toggleOption(name: string) {
    if (selected.includes(name)) {
      onChange(selected.filter((s) => s !== name))
    } else {
      onChange([...selected, name])
    }
  }

  return (
    <div data-testid="filter-section" data-title={title}>
      <button
        type="button"
        className="flex w-full items-center justify-between py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        aria-expanded={isOpen}
        onClick={() => {
          setIsOpen((v) => {
            if (v) {
              setSearchText("")
              setShowAll(false)
            }
            return !v
          })
        }}
      >
        <span>{title}</span>
        <ChevronDownIcon
          className={cn(
            "size-4 transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>
      {isOpen ? (
        <div className="pb-3">
          {searchable ? (
            <InputGroup className="mb-2">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                value={searchText}
                onChange={(e) => {
                  setSearchText(e.target.value)
                  setShowAll(false)
                }}
                placeholder={`Search ${title.toLowerCase()}…`}
              />
              {searchText ? (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    aria-label="Clear search"
                    onClick={() => setSearchText("")}
                  >
                    <XIcon />
                  </InputGroupButton>
                </InputGroupAddon>
              ) : null}
            </InputGroup>
          ) : null}
          <ul className="space-y-0.5">
            {visibleOptions.map((opt) => {
              const checked = selected.includes(opt.name)
              const swatch = colorMap?.[opt.name]
              return (
                <li key={opt.name}>
                  <label
                    className={cn(
                      "flex min-h-8 cursor-pointer items-center gap-2 rounded px-1.5 text-[12px] transition-colors",
                      checked
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleOption(opt.name)}
                    />
                    {swatch ? (
                      <span
                        aria-hidden
                        className="size-2 shrink-0 rounded-[35%]"
                        style={{ backgroundColor: swatch }}
                      />
                    ) : null}
                    <span className="min-w-0 flex-1 truncate">{opt.name}</span>
                    <span className="shrink-0 tabular-nums text-[11px]">
                      {opt.count.toLocaleString()}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          {hasMore ? (
            <button
              type="button"
              className="mt-1 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll
                ? "Show less"
                : `Show ${filteredOptions.length - maxVisible} more`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function FilterSection(props: FilterSectionBaseProps) {
  return <FilterSectionInner {...props} searchable={false} />
}

export function SearchableFilterSection(props: FilterSectionBaseProps) {
  return <FilterSectionInner {...props} searchable />
}

export function SingleCheckboxFilter({
  title,
  checked,
  onChange,
  count,
}: {
  title: string
  checked: boolean
  onChange: (checked: boolean) => void
  count?: number
}) {
  return (
    <label className="flex min-h-8 cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[12px] text-foreground hover:bg-muted/60">
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
      />
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {count != null ? (
        <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
          {count.toLocaleString()}
        </span>
      ) : null}
    </label>
  )
}
