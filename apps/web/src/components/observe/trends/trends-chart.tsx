import { useMemo } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { cn } from "@/lib/utils"
import type { TrendsQuery, TrendsResult } from "@/lib/observe/trends"

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

export function TrendsChart({
  query,
  result,
  hiddenKeys,
  height = 280,
  className,
  onBrushRange,
  onPointClick,
}: {
  query: TrendsQuery
  result: TrendsResult
  hiddenKeys: Set<string>
  height?: number
  className?: string
  /** Dig-down: brush selects absolute time window (ms). */
  onBrushRange?: (fromMs: number, toMs: number) => void
  /** Dig-down: click a bucket. */
  onPointClick?: (tMs: number) => void
}) {
  if (result.number) {
    return (
      <div className={cn("flex items-end gap-3 py-4", className)}>
        <span className="text-4xl font-semibold tabular-nums">
          {formatNum(result.number.value)}
          {result.number.unit ? (
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              {result.number.unit}
            </span>
          ) : null}
        </span>
        {result.number.baseline != null ? (
          <span className="mb-1 text-sm text-muted-foreground tabular-nums">
            vs {formatNum(result.number.baseline)} baseline
          </span>
        ) : null}
      </div>
    )
  }

  if (result.histogram && result.histogram.length > 0) {
    const data = result.histogram.map((b) => ({
      label: String(b.bin),
      value: b.count,
    }))
    return (
      <ChartContainer
        config={{ value: { label: "Count", color: "var(--chart-1)" } }}
        className={cn("aspect-auto w-full", className)}
        style={{ height }}
      >
        <BarChart accessibilityLayer data={data} margin={{ left: 0, right: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tickLine={false} axisLine={false} width={40} tickFormatter={formatAxis} />
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          <Bar dataKey="value" fill="var(--color-value)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ChartContainer>
    )
  }

  const metas = result.seriesMeta.filter((m) => !hiddenKeys.has(m.key) && !m.hidden)
  if (metas.length === 0 || result.points.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/15 text-sm text-muted-foreground",
          className,
        )}
        style={{ height }}
      >
        No series
      </div>
    )
  }

  const keys = metas.map((m) => m.key)
  const incomplete = metas.some((m) => m.incomplete)
  const data = result.points.map((p) => {
    const row: Record<string, string | number | null> = {
      label: new Date(p.t).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      t: p.t,
    }
    for (const k of keys) {
      row[k] = p.values[k] ?? null
    }
    return row
  })

  const config = useMemo(() => {
    const c: ChartConfig = {}
    metas.forEach((m, i) => {
      c[m.key] = {
        label: m.label,
        color: m.color ?? CHART_COLORS[i % CHART_COLORS.length],
      }
    })
    return c
  }, [metas])

  const kind = query.viz.kind
  const stacked =
    kind === "stacked_bar" ||
    kind === "stacked_area" ||
    query.viz.options?.stacked
  const fill =
    kind === "area" || kind === "stacked_area" || query.viz.options?.fill
  const isBar = kind === "bar" || kind === "stacked_bar"
  const refs = (query.viz.referenceLines ?? []).filter((r) => !r.hidden)
  const brushH = onBrushRange ? 28 : 0

  function handleBrushEnd(range: { startIndex?: number; endIndex?: number }) {
    if (!onBrushRange) return
    const start = range.startIndex ?? 0
    const end = range.endIndex ?? result.points.length - 1
    if (start === 0 && end === result.points.length - 1) return
    const from = result.points[start]
    const to = result.points[end]
    if (from && to) onBrushRange(from.t, to.t + result.intervalSec * 1000)
  }

  function handleClick(state: unknown) {
    if (!onPointClick || !state || typeof state !== "object") return
    const payload = (
      state as { activePayload?: Array<{ payload?: { t?: number } }> }
    ).activePayload?.[0]?.payload
    if (payload?.t != null) onPointClick(payload.t)
  }

  const chartInner = (
    <>
      <CartesianGrid vertical={false} />
      <XAxis
        dataKey="label"
        tickLine={false}
        axisLine={false}
        tickMargin={8}
        minTickGap={28}
      />
      <YAxis
        tickLine={false}
        axisLine={false}
        tickMargin={8}
        tickCount={4}
        width={44}
        tickFormatter={formatAxis}
        scale={query.viz.options?.yLog ? "log" : "auto"}
        domain={query.viz.options?.yZero ? [0, "auto"] : ["auto", "auto"]}
      />
      <ChartTooltip content={<ChartTooltipContent />} />
      {refs.map((r) => (
        <ReferenceLine
          key={r.id}
          y={r.value}
          stroke={r.color ?? "var(--muted-foreground)"}
          strokeDasharray={r.style === "dashed" ? "4 4" : undefined}
          label={{ value: r.name, position: "insideTopRight", fontSize: 10 }}
        />
      ))}
      {onBrushRange ? (
        <Brush
          dataKey="label"
          height={brushH}
          stroke="var(--border)"
          travellerWidth={8}
          onChange={handleBrushEnd}
        />
      ) : null}
    </>
  )

  if (isBar) {
    return (
      <ChartContainer
        config={config}
        className={cn("aspect-auto w-full", className)}
        style={{ height: height + brushH }}
        initialDimension={{ width: 480, height }}
      >
        <BarChart
          accessibilityLayer
          data={data}
          margin={{ left: 0, right: 8, top: 8 }}
          onClick={handleClick}
        >
          {chartInner}
          {keys.map((key) => {
            const meta = metas.find((m) => m.key === key)!
            return (
              <Bar
                key={key}
                dataKey={key}
                fill={`var(--color-${key})`}
                radius={[2, 2, 0, 0]}
                stackId={stacked ? "s" : undefined}
                opacity={meta.isBaseline ? 0.45 : 1}
              />
            )
          })}
        </BarChart>
      </ChartContainer>
    )
  }

  if (fill) {
    return (
      <ChartContainer
        config={config}
        className={cn("aspect-auto w-full", className)}
        style={{ height: height + brushH }}
        initialDimension={{ width: 480, height }}
      >
        <AreaChart
          accessibilityLayer
          data={data}
          margin={{ left: 0, right: 8, top: 8 }}
          onClick={handleClick}
        >
          {chartInner}
          {keys.map((key) => {
            const meta = metas.find((m) => m.key === key)!
            return (
              <Area
                key={key}
                dataKey={key}
                type="monotone"
                fill={`var(--color-${key})`}
                fillOpacity={meta.isBaseline ? 0.05 : 0.15}
                stroke={`var(--color-${key})`}
                strokeWidth={meta.isBaseline ? 1 : 1.5}
                strokeDasharray={meta.isBaseline ? "4 4" : undefined}
                stackId={stacked ? "s" : undefined}
                connectNulls={query.viz.options?.missing === "carry"}
              />
            )
          })}
        </AreaChart>
      </ChartContainer>
    )
  }

  return (
    <ChartContainer
      config={config}
      className={cn("aspect-auto w-full", className)}
      style={{ height: height + brushH }}
      initialDimension={{ width: 480, height }}
    >
      <LineChart
        accessibilityLayer
        data={data}
        margin={{ left: 0, right: 8, top: 8 }}
        onClick={handleClick}
      >
        {chartInner}
        {keys.map((key) => {
          const meta = metas.find((m) => m.key === key)!
          return (
            <Line
              key={key}
              dataKey={key}
              type="monotone"
              stroke={`var(--color-${key})`}
              strokeWidth={meta.isBaseline ? 1.25 : 1.75}
              strokeDasharray={meta.isBaseline ? "5 4" : undefined}
              dot={false}
              connectNulls={query.viz.options?.missing === "carry"}
              opacity={incomplete && !meta.isBaseline ? 0.95 : 1}
            />
          )
        })}
      </LineChart>
    </ChartContainer>
  )
}

function formatNum(v: number): string {
  if (Math.abs(v) >= 1000) return v.toFixed(1)
  if (Math.abs(v) >= 10) return v.toFixed(2)
  return Number(v.toPrecision(4)).toString()
}

function formatAxis(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`
  return String(Math.round(v * 100) / 100)
}
