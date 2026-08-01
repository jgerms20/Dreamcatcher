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
export function TrendChart({ points, yMin, yMax, yTicks, color = '#8b7fd4' }: {
  points: TrendPoint[]
  yMin: number
  yMax: number
  yTicks?: { value: number; label: string }[]
  color?: string
}) {
  const W = 560
  const H = 160
  const PAD = { l: 64, r: 14, t: 12, b: 26 }
  const n = points.length
  const px = (i: number) => (n === 1 ? (PAD.l + W - PAD.r) / 2 : PAD.l + (i / (n - 1)) * (W - PAD.l - PAD.r))
  const py = (v: number) => H - PAD.b - ((v - yMin) / (yMax - yMin || 1)) * (H - PAD.t - PAD.b)
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(i)},${py(p.value)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Trend over time">
      {(yTicks ?? []).map((t) => (
        <g key={t.value}>
          <line x1={PAD.l} y1={py(t.value)} x2={W - PAD.r} y2={py(t.value)} stroke="rgba(207,196,174,0.12)" strokeWidth={1} strokeDasharray="2 4" />
          <text x={PAD.l - 8} y={py(t.value) + 3} textAnchor="end" fontSize={10} fill="rgba(224,216,198,0.75)">{t.label}</text>
        </g>
      ))}
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
