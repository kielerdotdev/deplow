import { missingCopy, type MissingKind } from "@/lib/observe/missing"
import { cn } from "@/lib/utils"

export type InvestigationEvidence = {
  title: string
  culprit?: string | null
  eventCount?: number
  services?: string[]
  release?: string | null
  environment?: string | null
  hasFrames?: boolean
  hasTrace?: boolean
  spanCount?: number
  firstSeenLabel?: string
}

/** Deterministic investigation summary — cite evidence, never invent frames. */
export function InvestigationSummary({
  evidence,
  className,
}: {
  evidence: InvestigationEvidence
  className?: string
}) {
  const gaps: MissingKind[] = []
  if (!evidence.hasFrames) gaps.push("no_frames")
  if (!evidence.hasTrace) gaps.push("no_trace")
  if (!evidence.release || evidence.release === "unknown") {
    gaps.push("no_release")
  }
  if (evidence.spanCount === 1) gaps.push("single_span_traces")

  const where =
    evidence.services && evidence.services.length > 0
      ? evidence.services.join(", ")
      : "unknown service"
  const when = evidence.firstSeenLabel ?? "unknown time"

  return (
    <section
      className={cn(
        "surface-panel mb-4 px-4 py-3 text-sm",
        className,
      )}
      data-testid="investigation-summary"
    >
      <h3 className="text-xs font-semibold tracking-tight">
        Investigation summary
      </h3>
      <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">What:</span>{" "}
          {evidence.title}
          {evidence.culprit ? ` · ${evidence.culprit}` : ""}
        </li>
        <li>
          <span className="font-medium text-foreground">Where:</span> {where}
          {evidence.environment ? ` · ${evidence.environment}` : ""}
        </li>
        <li>
          <span className="font-medium text-foreground">When:</span> {when}
          {evidence.eventCount != null
            ? ` · ${evidence.eventCount.toLocaleString()} events`
            : ""}
        </li>
        {evidence.release && evidence.release !== "unknown" ? (
          <li>
            <span className="font-medium text-foreground">Release:</span>{" "}
            {evidence.release}
          </li>
        ) : null}
      </ul>
      {gaps.length > 0 ? (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <p className="text-[11px] font-medium text-warning">
            Missing instrumentation
          </p>
          {gaps.map((g) => {
            const copy = missingCopy(g)
            return (
              <p key={g} className="text-[11px] text-muted-foreground">
                <span className="text-foreground">{copy.title}.</span>{" "}
                {copy.detail}
              </p>
            )
          })}
        </div>
      ) : null}
      <p className="mt-2 text-[10px] text-muted-foreground/80">
        Confidence: based only on available telemetry — gaps are listed, not
        guessed.
      </p>
    </section>
  )
}
