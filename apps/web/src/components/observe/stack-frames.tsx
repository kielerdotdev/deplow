/** Presentational stack frame list — unit-tested independently of the route. */
export type StackFrame = {
  filename?: string
  abs_path?: string
  function?: string
  lineno?: number
  colno?: number
  in_app?: boolean
  context_line?: string
  pre_context?: string[]
  post_context?: string[]
  vars?: Record<string, unknown>
}

export type ExceptionValue = {
  type?: string
  value?: string
  mechanism?: { type?: string; handled?: boolean }
  stacktrace?: { frames?: StackFrame[] }
}

export function parseExceptionChain(exceptionJson: string): ExceptionValue[] {
  if (!exceptionJson) return []
  try {
    const ex = JSON.parse(exceptionJson) as { values?: ExceptionValue[] }
    return ex.values ?? []
  } catch {
    return []
  }
}

export function parseExceptionFrames(exceptionJson: string): StackFrame[] {
  const values = parseExceptionChain(exceptionJson)
  const last = values[values.length - 1]
  return [...(last?.stacktrace?.frames ?? [])].reverse()
}

export function StackFramesView({
  frames,
  emptyMessage = "No stack frames",
  showAll = false,
}: {
  frames: StackFrame[]
  emptyMessage?: string
  /** When false, collapse consecutive library frames. */
  showAll?: boolean
}) {
  if (frames.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>
  }

  const display = showAll ? frames.map((f) => ({ kind: "frame" as const, frame: f })) : collapseLibFrames(frames)

  return (
    <div className="font-mono text-xs leading-relaxed" data-testid="stack-frames">
      {display.map((item, i) => {
        if (item.kind === "collapsed") {
          return (
            <div
              key={`c-${i}`}
              className="py-1 pl-3 text-muted-foreground"
              data-testid="frame-collapsed"
            >
              {item.count} framework frames collapsed
            </div>
          )
        }
        return <FrameRow key={i} frame={item.frame} />
      })}
    </div>
  )
}

export function ExceptionChainView({
  exceptionJson,
  emptyMessage = "No stack frames",
}: {
  exceptionJson: string
  emptyMessage?: string
}) {
  const chain = parseExceptionChain(exceptionJson)
  if (chain.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>
  }
  return (
    <div className="flex flex-col gap-6" data-testid="exception-chain">
      {chain.map((ex, i) => {
        const frames = [...(ex.stacktrace?.frames ?? [])].reverse()
        const handled = ex.mechanism?.handled
        return (
          <div key={i} className="flex flex-col gap-2">
            <div>
              <p className="text-sm font-semibold tracking-tight">
                {ex.type || "Error"}
                {ex.value ? (
                  <span className="font-normal text-muted-foreground">
                    {": "}
                    {ex.value}
                  </span>
                ) : null}
              </p>
              {handled === false ? (
                <p className="mt-0.5 text-[11px] font-medium text-destructive">
                  Unhandled
                </p>
              ) : handled === true ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Handled
                </p>
              ) : null}
              {i < chain.length - 1 ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Caused by:
                </p>
              ) : null}
            </div>
            <StackFramesView
              frames={frames}
              emptyMessage="No stack frames were captured. This event may be a handled exception without frames, or symbols/source maps are missing."
            />
          </div>
        )
      })}
    </div>
  )
}

function FrameRow({ frame: f }: { frame: StackFrame }) {
  return (
    <details
      data-testid={f.in_app ? "frame-in-app" : "frame-lib"}
      className={
        f.in_app
          ? "border-l-2 border-foreground/40 py-1 pl-3"
          : "py-1 pl-3 text-muted-foreground"
      }
    >
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="text-foreground/90">{f.function || "?"}</span>
        <span className="text-muted-foreground">
          {" "}
          in {f.filename || f.abs_path || "?"}
          {f.lineno != null ? `:${f.lineno}` : ""}
          {f.colno != null ? `:${f.colno}` : ""}
        </span>
      </summary>
      {(f.context_line || f.pre_context?.length || f.post_context?.length) && (
        <pre className="mt-1 overflow-x-auto rounded bg-muted/40 p-2 text-[10px] leading-snug">
          {(f.pre_context ?? []).map((l, i) => (
            <div key={`pre-${i}`} className="text-muted-foreground">
              {l}
            </div>
          ))}
          {f.context_line ? (
            <div className="bg-destructive/15 text-foreground">
              {f.context_line}
            </div>
          ) : null}
          {(f.post_context ?? []).map((l, i) => (
            <div key={`post-${i}`} className="text-muted-foreground">
              {l}
            </div>
          ))}
        </pre>
      )}
    </details>
  )
}

type DisplayItem =
  | { kind: "frame"; frame: StackFrame }
  | { kind: "collapsed"; count: number }

function collapseLibFrames(frames: StackFrame[]): DisplayItem[] {
  const out: DisplayItem[] = []
  let i = 0
  while (i < frames.length) {
    if (frames[i]!.in_app) {
      out.push({ kind: "frame", frame: frames[i]! })
      i++
      continue
    }
    let j = i
    while (j < frames.length && !frames[j]!.in_app) j++
    const run = j - i
    if (run <= 2) {
      for (let k = i; k < j; k++) {
        out.push({ kind: "frame", frame: frames[k]! })
      }
    } else {
      out.push({ kind: "collapsed", count: run })
    }
    i = j
  }
  return out
}
