// Small single-series SVG charts. Text uses ink tokens; series color carries identity;
// grid/axes are recessive; every mark exposes a native tooltip via <title>.

export function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length
  if (n < 3) return null
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let dx2 = 0
  let dy2 = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    num += dx * dy
    dx2 += dx * dx
    dy2 += dy * dy
  }
  if (dx2 === 0 || dy2 === 0) return null
  return num / Math.sqrt(dx2 * dy2)
}

// Ordinary least-squares fit, for trend lines / trajectory reads. Returns null
// when there isn't enough spread to fit (n < 2 or all xs identical).
export function linreg(xs: number[], ys: number[]): { slope: number; intercept: number } | null {
  const n = xs.length
  if (n < 2) return null
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    den += (xs[i] - mx) ** 2
  }
  if (den === 0) return null
  const slope = num / den
  return { slope, intercept: my - slope * mx }
}

// Lerp two hex colors in sRGB — good enough for a small diverging ramp of a
// handful of discrete steps (mood -2..2), not for a long continuous scale.
function lerpColor(a: string, b: string, t: number): string {
  const pa = hexToRgb(a)
  const pb = hexToRgb(b)
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

// Two validated poles (warm ember = low, cool viz-violet = high) meeting at a
// neutral midpoint — the standard diverging construction, interpolated so any
// value in [-domain, domain] gets a consistent step, not just the five whole numbers.
const MOOD_NEG = '#c96342'
const MOOD_NEUTRAL = '#4a4f74'
const MOOD_POS = '#8b7fd4'

export function moodColor(value: number, domain = 2): string {
  const t = Math.max(-1, Math.min(1, value / domain))
  return t < 0 ? lerpColor(MOOD_NEUTRAL, MOOD_NEG, -t) : lerpColor(MOOD_NEUTRAL, MOOD_POS, t)
}

interface ScatterProps {
  points: { x: number; y: number; label: string }[]
  xLabel: string
  yLabel: string
  color?: string
}

export function ScatterChart({ points, xLabel, yLabel, color = '#1d968b' }: ScatterProps) {
  const W = 340
  const H = 220
  const PAD = { l: 40, r: 12, t: 12, b: 34 }
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const yMin = Math.min(...ys)
  const yMax = Math.max(...ys)
  const xSpan = xMax - xMin || 1
  const ySpan = yMax - yMin || 1
  const px = (x: number) => PAD.l + ((x - xMin) / xSpan) * (W - PAD.l - PAD.r)
  const py = (y: number) => H - PAD.b - ((y - yMin) / ySpan) * (H - PAD.t - PAD.b)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${yLabel} vs ${xLabel}`}>
      <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke="rgba(207,196,174,0.12)" strokeWidth={1} />
      <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} stroke="rgba(207,196,174,0.12)" strokeWidth={1} />
      {points.map((p, i) => (
        <circle key={i} cx={px(p.x)} cy={py(p.y)} r={5} fill={color} fillOpacity={0.85} stroke="#10131f" strokeWidth={1.5}>
          <title>{p.label}</title>
        </circle>
      ))}
      <text x={(PAD.l + W - PAD.r) / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="#f0ead9">
        {xLabel}
      </text>
      <text x={12} y={(PAD.t + H - PAD.b) / 2} textAnchor="middle" fontSize={11} fill="#f0ead9" transform={`rotate(-90 12 ${(PAD.t + H - PAD.b) / 2})`}>
        {yLabel}
      </text>
      <text x={PAD.l - 6} y={py(yMax) + 4} textAnchor="end" fontSize={10} fill="rgba(207,196,174,0.5)">{fmt(yMax)}</text>
      <text x={PAD.l - 6} y={py(yMin) + 4} textAnchor="end" fontSize={10} fill="rgba(207,196,174,0.5)">{fmt(yMin)}</text>
      <text x={px(xMin)} y={H - PAD.b + 14} textAnchor="middle" fontSize={10} fill="rgba(207,196,174,0.5)">{fmt(xMin)}</text>
      <text x={px(xMax)} y={H - PAD.b + 14} textAnchor="middle" fontSize={10} fill="rgba(207,196,174,0.5)">{fmt(xMax)}</text>
    </svg>
  )
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

interface BarListProps {
  items: { label: string; value: number }[]
  color?: string
  max?: number
}

// Horizontal bar list with baseline-anchored bars and direct labels.
export function BarList({ items, color = '#c0702a', max }: BarListProps) {
  const top = max ?? Math.max(...items.map((i) => i.value), 1)
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-3" title={`${item.label}: ${item.value}`}>
          <span className="w-32 shrink-0 truncate text-right text-sm text-dusk-200">{item.label}</span>
          <div className="h-4 flex-1 overflow-hidden rounded-r">
            <div
              className="h-full rounded-r"
              style={{ width: `${(item.value / top) * 100}%`, background: color, minWidth: 4 }}
            />
          </div>
          <span className="w-8 shrink-0 text-sm tabular-nums text-dusk-300">{item.value}</span>
        </div>
      ))}
    </div>
  )
}

interface TrendPoint {
  date: string
  value: number
  label: string
}

// Time trend as dots on a 2px line; y domain fixed by caller.
export function TrendChart({ points, yMin, yMax, yTicks, color = '#8b7fd4', ariaLabel, trendLine = false }: {
  points: TrendPoint[]
  yMin: number
  yMax: number
  yTicks?: { value: number; label: string }[]
  color?: string
  ariaLabel?: string
  /** Overlay a faint OLS trend line through the points — the direction is also stated in ariaLabel/caller text. */
  trendLine?: boolean
}) {
  const W = 560
  const H = 160
  const PAD = { l: 64, r: 14, t: 12, b: 26 }
  const n = points.length
  const px = (i: number) => (n === 1 ? (PAD.l + W - PAD.r) / 2 : PAD.l + (i / (n - 1)) * (W - PAD.l - PAD.r))
  const py = (v: number) => H - PAD.b - ((v - yMin) / (yMax - yMin || 1)) * (H - PAD.t - PAD.b)
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(i)},${py(p.value)}`).join(' ')
  const fit = trendLine ? linreg(points.map((_, i) => i), points.map((p) => p.value)) : null

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={ariaLabel ?? 'Trend over time'}>
      {(yTicks ?? []).map((t) => (
        <g key={t.value}>
          <line x1={PAD.l} y1={py(t.value)} x2={W - PAD.r} y2={py(t.value)} stroke="rgba(207,196,174,0.12)" strokeWidth={1} strokeDasharray="2 4" />
          <text x={PAD.l - 8} y={py(t.value) + 3} textAnchor="end" fontSize={10} fill="rgba(224,216,198,0.75)">{t.label}</text>
        </g>
      ))}
      {fit && n > 1 && (
        <line
          x1={px(0)} y1={py(fit.intercept)}
          x2={px(n - 1)} y2={py(fit.intercept + fit.slope * (n - 1))}
          stroke="rgba(212,162,78,0.55)" strokeWidth={1.5} strokeDasharray="3 3"
        />
      )}
      {n > 1 && <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />}
      {points.map((p, i) => (
        <circle key={i} cx={px(i)} cy={py(p.value)} r={4.5} fill={color} stroke="#10131f" strokeWidth={2}>
          <title>{p.label}</title>
        </circle>
      ))}
      {n > 0 && (
        <>
          <text x={px(0)} y={H - 8} textAnchor="start" fontSize={10} fill="rgba(224,216,198,0.75)">{points[0].date}</text>
          {n > 1 && (
            <text x={px(n - 1)} y={H - 8} textAnchor="end" fontSize={10} fill="rgba(224,216,198,0.75)">{points[n - 1].date}</text>
          )}
        </>
      )}
    </svg>
  )
}

// ---------- Dream rhythm: a calendar dot-grid (weeks as columns, weekdays as rows) ----------

export interface HeatCell {
  date: string
  hasDream: boolean
  mood?: number // -2..2, averaged across that night's dreams
  vividness?: number // 1..5, averaged
  label: string
}

// Sequential single-hue (candle-gold) wash for "presence only" nights with no mood/vividness yet.
function heatCellColor(cell: HeatCell): string {
  if (!cell.hasDream) return 'rgba(207,196,174,0.07)'
  if (cell.mood != null) return moodColor(cell.mood)
  if (cell.vividness != null) return `rgba(212,162,78,${(0.28 + 0.14 * cell.vividness).toFixed(2)})`
  return 'rgba(29,150,139,0.7)'
}

// Chronological cells, oldest first. Padded to align on weekday columns; empty
// nights render as a near-invisible tint rather than an absent cell, so the
// shape of the grid stays constant regardless of how sparse the data is.
export function HeatGrid({ cells, summary }: { cells: HeatCell[]; summary: string }) {
  if (cells.length === 0) return null
  const firstDow = new Date(cells[0].date + 'T12:00:00').getDay()
  const padded: (HeatCell | null)[] = [...Array(firstDow).fill(null), ...cells]
  const weekCount = Math.ceil(padded.length / 7)
  const CELL = 12
  const GAP = 3

  return (
    <div>
      <div
        role="img"
        aria-label={summary}
        className="inline-grid"
        style={{ gridTemplateColumns: `repeat(${weekCount}, ${CELL}px)`, gap: GAP }}
      >
        {Array.from({ length: weekCount }, (_, w) => (
          <div key={w} className="grid" style={{ gridTemplateRows: `repeat(7, ${CELL}px)`, gap: GAP }}>
            {padded.slice(w * 7, w * 7 + 7).map((cell, d) => (
              <div
                key={d}
                title={cell ? cell.label : ''}
                className="rounded-[3px]"
                style={{ width: CELL, height: CELL, background: cell ? heatCellColor(cell) : 'transparent' }}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-dusk-400">{summary}</p>
    </div>
  )
}

// ---------- Emotional weather: diverging bars around a zero baseline ----------

export interface DivergingItem {
  label: string
  value: number
  n?: number
}

// Above/below-baseline comparison (e.g. average mood per weekday). Poles are
// the validated ember↔viz-violet diverging pair; value + n are always printed
// as text so the read never depends on color alone.
export function DivergingBarList({
  items,
  domain,
  negColor = MOOD_NEG,
  posColor = MOOD_POS,
  formatValue = (v: number) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)),
}: {
  items: DivergingItem[]
  domain: number
  negColor?: string
  posColor?: string
  formatValue?: (v: number) => string
}) {
  const summary = items.map((i) => `${i.label} ${formatValue(i.value)}${i.n ? ` (n=${i.n})` : ''}`).join(', ')
  return (
    <div className="space-y-2" role="img" aria-label={`Diverging comparison: ${summary}`}>
      {items.map((item) => {
        const pct = domain > 0 ? Math.min(1, Math.abs(item.value) / domain) * 50 : 0
        const isPos = item.value >= 0
        return (
          <div key={item.label} className="flex items-center gap-2" title={`${item.label}: ${formatValue(item.value)}${item.n ? ` · n=${item.n}` : ''}`}>
            <span className="w-24 shrink-0 truncate text-right text-xs text-dusk-300">{item.label}</span>
            <div className="relative h-4 flex-1">
              <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-dusk-300/20" />
              <div
                className="absolute inset-y-1 rounded-sm"
                style={{ width: `${pct}%`, left: isPos ? '50%' : `${50 - pct}%`, background: isPos ? posColor : negColor, minWidth: pct > 0 ? 3 : 0 }}
              />
            </div>
            <span className="w-14 shrink-0 text-xs tabular-nums text-dusk-300">{formatValue(item.value)}</span>
          </div>
        )
      })}
    </div>
  )
}

// ---------- Symbol constellations: ranked co-occurring pairs ----------

export interface PairItem {
  a: string
  b: string
  aColor?: string
  bColor?: string
  value: number
  detail?: string
}

// Category-colored identity dots (paired with text, never color-alone) beside
// a single sequential (candle-gold) magnitude bar — identity and magnitude
// stay on separate channels.
export function PairBarList({ items, color = '#d4a24e', max }: { items: PairItem[]; color?: string; max?: number }) {
  const top = max ?? Math.max(...items.map((i) => i.value), 1)
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} title={item.detail ?? `${item.a} + ${item.b}: appear together ${item.value} time${item.value === 1 ? '' : 's'}`}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-dusk-200">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: item.aColor ?? color }} />
              {item.a}
            </span>
            <span className="text-dusk-400">↔</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: item.bColor ?? color }} />
              {item.b}
            </span>
            <span className="ml-auto shrink-0 text-xs tabular-nums text-dusk-400">{item.value}×</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-night-700/60">
            <div className="h-full rounded-full" style={{ width: `${(item.value / top) * 100}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  )
}
