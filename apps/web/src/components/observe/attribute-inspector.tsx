export function AttributeInspector({
  attributes,
  title = "Attributes",
}: {
  attributes: Record<string, string | number | boolean | null | undefined>
  title?: string
}) {
  const entries = Object.entries(attributes).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  )
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No attributes</p>
    )
  }
  return (
    <div className="surface-inset overflow-hidden">
      <h4 className="border-b border-border/50 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-x-3 gap-y-1.5 px-3 py-3 text-xs">
        {entries.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="truncate font-mono text-muted-foreground">{k}</dt>
            <dd className="truncate font-mono">{String(v)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
