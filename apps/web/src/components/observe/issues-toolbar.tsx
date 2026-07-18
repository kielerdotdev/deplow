import { StatusTabs, type StatusTab } from "./status-tabs"

/**
 * Issues status tabs + result count.
 * Search / time / advanced filters live in ContextBar above.
 */
export function IssuesToolbar<T extends string>({
  tabs,
  active,
  onChange,
  totalCount,
  trailing,
}: {
  tabs: ReadonlyArray<StatusTab<T>>
  active: T
  onChange: (value: T) => void
  totalCount?: number
  trailing?: React.ReactNode
}) {
  return (
    <div data-testid="issues-toolbar">
      <StatusTabs
        tabs={tabs}
        active={active}
        onChange={onChange}
        totalCount={totalCount}
        totalLabel="issues"
        trailing={trailing}
        aria-label="Filter issues by status"
      />
    </div>
  )
}
