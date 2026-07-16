/** Presentational stack frame list — unit-tested independently of the route. */
export type StackFrame = {
  filename?: string
  abs_path?: string
  function?: string
  lineno?: number
  colno?: number
  in_app?: boolean
}

export function parseExceptionFrames(exceptionJson: string): StackFrame[] {
  if (!exceptionJson) return []
  try {
    const ex = JSON.parse(exceptionJson) as {
      values?: Array<{ stacktrace?: { frames?: StackFrame[] } }>
    }
    const values = ex.values ?? []
    const last = values[values.length - 1]
    return [...(last?.stacktrace?.frames ?? [])].reverse()
  } catch {
    return []
  }
}

export function StackFramesView({
  frames,
  emptyMessage = "No stack frames",
}: {
  frames: StackFrame[]
  emptyMessage?: string
}) {
  if (frames.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>
  }
  return (
    <div className="font-mono text-xs leading-relaxed" data-testid="stack-frames">
      {frames.map((f, i) => (
        <div
          key={i}
          data-testid={f.in_app ? "frame-in-app" : "frame-lib"}
          className={
            f.in_app
              ? "border-l-2 border-foreground/40 py-1 pl-3"
              : "py-1 pl-3 text-muted-foreground"
          }
        >
          <span className="text-foreground/90">{f.function || "?"}</span>
          <span className="text-muted-foreground">
            {" "}
            in {f.filename || f.abs_path || "?"}
            {f.lineno != null ? `:${f.lineno}` : ""}
          </span>
        </div>
      ))}
    </div>
  )
}
