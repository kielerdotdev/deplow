import { useId, useMemo } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
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
import type { ChartKind } from "@/lib/observe/context"

export type SeriesPoint = { t: number; v: number; label?: string }
export type HeatCell = { x: number; y: number; v: number }
export type NumberValue = { value: number; unit?: string; delta?: number }
export type MultiSeriesData = {
  keys: string[]
  rows: Array<{ t: number; label: string } & Record<string, number>>
}

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

export function VisualizationCanvas({
  kind,
  series,
  multiSeries,
  heat,
  number,
  histogram,
  height = 160,
  className,
  onBrush,
  onPointClick,
  onHeatCellClick,
  onNumberClick,
  valueLabel = "Value",
}: {
  kind: ChartKind
  series?: SeriesPoint[]
  multiSeries?: MultiSeriesData
  heat?: HeatCell[]
  number?: NumberValue
  histogram?: { bin: number; count: number }[]
  height?: number
  className?: string
  onBrush?: (
    fromIdx: number,
    toIdx: number,
    from: SeriesPoint,
    to: SeriesPoint,
  ) => void
  onPointClick?: (point: SeriesPoint, index: number) => void
  onHeatCellClick?: (cell: HeatCell) => void
  onNumberClick?: () => void
  valueLabel?: string
}) {
  if (kind === "number" && number) {
    const interactive = Boolean(onNumberClick)
    return (
      <button
        type="button"
        disabled={!interactive}
        onClick={onNumberClick}
        className={cn(
          "flex w-full items-end gap-2 py-2 text-left",
          interactive &&
            "rounded-md transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <span className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
          {formatNum(number.value)}
          {number.unit ? (
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              {number.unit}
            </span>
          ) : null}
        </span>
        {number.delta !== undefined ? (
          <span
            className={cn(
              "mb-1 text-xs tabular-nums",
              number.delta > 0 ? "text-destructive" : "text-success",
            )}
          >
            {number.delta > 0 ? "+" : ""}
            {formatNum(number.delta)}
          </span>
        ) : null}
      </button>
    )
  }

  if (kind === "heatmap" && heat && heat.length > 0) {
    return (
      <HeatmapGrid
        heat={heat}
        height={height}
        className={className}
        onHeatCellClick={onHeatCellClick}
      />
    )
  }

  if (
    (kind === "line" || kind === "bar") &&
    multiSeries &&
    multiSeries.keys.length > 0 &&
    multiSeries.rows.length > 0
  ) {
    return (
      <MultiSeriesChart
        kind={kind}
        multiSeries={multiSeries}
        height={height}
        className={className}
      />
    )
  }

  if ((kind === "line" || kind === "bar") && series && series.length > 0) {
    return (
      <SeriesChart
        kind={kind}
        series={series}
        height={height}
        className={className}
        onBrush={onBrush}
        onPointClick={onPointClick}
        valueLabel={valueLabel}
      />
    )
  }

  if (kind === "histogram" && histogram && histogram.length > 0) {
    const data = histogram.map((b) => ({
      label: String(b.bin),
      value: b.count,
    }))
    return (
      <ChartContainer
        config={{
          value: { label: valueLabel, color: "var(--chart-1)" },
        }}
        className={cn("aspect-auto w-full", className)}
        style={{ height }}
      >
        <BarChart accessibilityLayer data={data} margin={{ left: 0, right: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={24}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickCount={4}
            width={40}
            tickFormatter={formatAxisNum}
          />
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          <Bar dataKey="value" fill="var(--color-value)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ChartContainer>
    )
  }

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

function MultiSeriesChart({
  kind,
  multiSeries,
  height,
  className,
}: {
  kind: "line" | "bar"
  multiSeries: MultiSeriesData
  height: number
  className?: string
}) {
  const config = useMemo(() => {
    const c: ChartConfig = {}
    multiSeries.keys.forEach((key, i) => {
      c[key] = {
        label: key,
        color: CHART_COLORS[i % CHART_COLORS.length],
      }
    })
    return c
  }, [multiSeries.keys])

  return (
    <ChartContainer
      config={config}
      className={cn("aspect-auto w-full", className)}
      style={{ height }}
      initialDimension={{ width: 480, height }}
    >
      {kind === "bar" ? (
        <BarChart
          accessibilityLayer
          data={multiSeries.rows}
          margin={{ left: 0, right: 8, top: 8 }}
        >
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
            tickFormatter={formatAxisNum}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          {multiSeries.keys.map((key) => (
            <Bar
              key={key}
              dataKey={key}
              fill={`var(--color-${key})`}
              radius={[2, 2, 0, 0]}
              stackId="a"
            />
          ))}
        </BarChart>
      ) : (
        <AreaChart
          accessibilityLayer
          data={multiSeries.rows}
          margin={{ left: 0, right: 8, top: 8 }}
        >
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
            tickFormatter={formatAxisNum}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          {multiSeries.keys.map((key) => (
            <Area
              key={key}
              dataKey={key}
              type="monotone"
              fill={`var(--color-${key})`}
              fillOpacity={0.15}
              stroke={`var(--color-${key})`}
              strokeWidth={1.5}
              stackId={undefined}
            />
          ))}
        </AreaChart>
      )}
    </ChartContainer>
  )
}

function SeriesChart({
  kind,
  series,
  height,
  className,
  onBrush,
  onPointClick,
  valueLabel,
}: {
  kind: "line" | "bar"
  series: SeriesPoint[]
  height: number
  className?: string
  onBrush?: (
    fromIdx: number,
    toIdx: number,
    from: SeriesPoint,
    to: SeriesPoint,
  ) => void
  onPointClick?: (point: SeriesPoint, index: number) => void
  valueLabel: string
}) {
  const gradId = useId().replace(/:/g, "")
  const data = useMemo(
    () =>
      series.map((p, i) => ({
        ...p,
        i,
        value: p.v,
        label: p.label ?? formatTickTime(p.t),
      })),
    [series],
  )

  const config = useMemo(
    () =>
      ({
        value: {
          label: valueLabel,
          color: "var(--chart-1)",
        },
      }) satisfies ChartConfig,
    [valueLabel],
  )

  const nonzero = series.filter((p) => p.v > 0).length
  const showBrush =
    Boolean(onBrush) && series.length >= 8 && nonzero > 2
  const brushHeight = showBrush ? 32 : 0
  const chartHeight = height
  const preferBar = kind === "area" && nonzero <= 2

  function handlePointClick(state: unknown) {
    if (!onPointClick || !state || typeof state !== "object") return
    const activePayload = (
      state as { activePayload?: Array<{ payload?: (typeof data)[number] }> }
    ).activePayload
    const row = activePayload?.[0]?.payload
    if (!row) return
    onPointClick({ t: row.t, v: row.v, label: row.label }, row.i)
  }

  function handleBrushEnd(range: { startIndex?: number; endIndex?: number }) {
    if (!onBrush) return
    const start = range.startIndex ?? 0
    const end = range.endIndex ?? series.length - 1
    if (start === 0 && end === series.length - 1) return
    const from = series[start]
    const to = series[end]
    if (from && to) onBrush(start, end, from, to)
  }

  const sharedAxes = (
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
        tickFormatter={formatAxisNum}
      />
      <ChartTooltip
        content={
          <ChartTooltipContent
            labelFormatter={(_, payload) => {
              const t = payload?.[0]?.payload?.t as number | undefined
              return t != null
                ? new Date(t).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : ""
            }}
          />
        }
      />
    </>
  )

  const brushEl = showBrush ? (
    <Brush
      dataKey="label"
      height={brushHeight}
      stroke="var(--chart-selection)"
      travellerWidth={16}
      onDragEnd={handleBrushEnd}
    />
  ) : null

  const effectiveKind = preferBar ? "bar" : kind

  return (
    <ChartContainer
      config={config}
      className={cn(
        "observe-chart aspect-auto w-full",
        className,
      )}
      style={{ height: chartHeight }}
      initialDimension={{ width: 480, height: chartHeight }}
    >
      {effectiveKind === "bar" ? (
        <BarChart
          accessibilityLayer
          data={data}
          margin={{ left: 0, right: 8, top: 8, bottom: brushHeight ? 4 : 0 }}
          onClick={handlePointClick}
        >
          {sharedAxes}
          <Bar
            dataKey="value"
            fill="var(--color-value)"
            radius={[3, 3, 0, 0]}
            cursor={onPointClick ? "pointer" : undefined}
          />
          {brushEl}
        </BarChart>
      ) : (
        <AreaChart
          accessibilityLayer
          data={data}
          margin={{ left: 0, right: 8, top: 8, bottom: brushHeight ? 4 : 0 }}
          onClick={handlePointClick}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="var(--color-value)"
                stopOpacity={0.35}
              />
              <stop
                offset="95%"
                stopColor="var(--color-value)"
                stopOpacity={0.05}
              />
            </linearGradient>
          </defs>
          {sharedAxes}
          <Area
            dataKey="value"
            type="monotone"
            fill={`url(#${gradId})`}
            stroke="var(--color-value)"
            strokeWidth={1.75}
            activeDot={
              onPointClick
                ? { r: 4, cursor: "pointer" }
                : { r: 3 }
            }
          />
          {brushEl}
        </AreaChart>
      )}
    </ChartContainer>
  )
}

function HeatmapGrid({
  heat,
  height,
  className,
  onHeatCellClick,
}: {
  heat: HeatCell[]
  height: number
  className?: string
  onHeatCellClick?: (cell: HeatCell) => void
}) {
  const maxV = Math.max(...heat.map((c) => c.v), 1)
  const xs = [...new Set(heat.map((c) => c.x))].sort((a, b) => a - b)
  const ys = [...new Set(heat.map((c) => c.y))].sort((a, b) => a - b)
  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-border/50 bg-card",
        className,
      )}
      style={{ height }}
      role="img"
      aria-label="Heatmap"
    >
      <div
        className="grid h-full w-full gap-px p-px"
        style={{
          gridTemplateColumns: `repeat(${xs.length}, 1fr)`,
          gridTemplateRows: `repeat(${ys.length}, 1fr)`,
        }}
      >
        {ys
          .slice()
          .reverse()
          .flatMap((y) =>
            xs.map((x) => {
              const cell = heat.find((c) => c.x === x && c.y === y)
              const intensity = cell ? cell.v / maxV : 0
              const interactive = Boolean(cell && onHeatCellClick)
              return (
                <button
                  key={`${x}-${y}`}
                  type="button"
                  disabled={!interactive}
                  title={
                    cell
                      ? `${new Date(cell.x).toLocaleString()} · ${cell.y}ms+ · ${cell.v}`
                      : "0"
                  }
                  onClick={() => cell && onHeatCellClick?.(cell)}
                  className={cn(
                    "min-h-0 min-w-0 rounded-[2px]",
                    interactive &&
                      "cursor-pointer transition-opacity hover:opacity-80",
                  )}
                  style={{
                    backgroundColor: `color-mix(in oklab, var(--chart-1) ${Math.round(intensity * 80)}%, var(--muted))`,
                  }}
                />
              )
            }),
          )}
      </div>
    </div>
  )
}

function formatTickTime(t: number): string {
  return new Date(t).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatAxisNum(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(1)
}

function formatNum(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(1)
}
