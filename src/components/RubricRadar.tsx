import { RUBRIC_DIMENSIONS } from '../data/rubric'
import type { RubricResult } from '../types'

const SIZE = 300
const CX = SIZE / 2
const CY = SIZE / 2
const R = 96
const LABEL_R = R + 26

function point(i: number, value: number): [number, number] {
  const angle = (Math.PI * 2 * i) / RUBRIC_DIMENSIONS.length - Math.PI / 2
  const r = (value / 5) * R
  return [CX + r * Math.cos(angle), CY + r * Math.sin(angle)]
}

export default function RubricRadar({ rubric }: { rubric: RubricResult }) {
  const values = RUBRIC_DIMENSIONS.map((d) => rubric.scores[d.id]?.score ?? 0)
  const polygon = values.map((v, i) => point(i, v).join(',')).join(' ')

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="mx-auto w-full max-w-xs"
      role="img"
      aria-label={`Dream recall radar: overall ${rubric.overall} out of 100`}
    >
      {/* recessive grid rings */}
      {[1, 2, 3, 4, 5].map((ring) => (
        <polygon
          key={ring}
          points={RUBRIC_DIMENSIONS.map((_, i) => point(i, ring).join(',')).join(' ')}
          fill="none"
          stroke="color-mix(in oklab, var(--color-ivory-100) 14%, transparent)"
          strokeWidth={ring === 5 ? 1.5 : 1}
        />
      ))}
      {/* spokes */}
      {RUBRIC_DIMENSIONS.map((_, i) => {
        const [x, y] = point(i, 5)
        return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="color-mix(in oklab, var(--color-ivory-100) 12%, transparent)" strokeWidth={1} />
      })}
      {/* data */}
      <polygon points={polygon} fill="color-mix(in oklab, var(--color-viz-1) 25%, transparent)" stroke="var(--color-viz-1)" strokeWidth={2} strokeLinejoin="round" />
      {values.map((v, i) => {
        const [x, y] = point(i, v)
        const dim = RUBRIC_DIMENSIONS[i]
        return (
          <circle key={dim.id} cx={x} cy={y} r={4} fill="var(--color-viz-1)" stroke="var(--color-ink-850)" strokeWidth={2}>
            <title>{`${dim.name}: ${v}/5 — ${rubric.scores[dim.id]?.note ?? ''}`}</title>
          </circle>
        )
      })}
      {/* axis labels in text ink, not series color */}
      {RUBRIC_DIMENSIONS.map((dim, i) => {
        const angle = (Math.PI * 2 * i) / RUBRIC_DIMENSIONS.length - Math.PI / 2
        const x = CX + LABEL_R * Math.cos(angle)
        const y = CY + LABEL_R * Math.sin(angle)
        const anchor = Math.abs(Math.cos(angle)) < 0.3 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end'
        const short = dim.name.split(' ')[0].replace('&', '')
        return (
          <text key={dim.id} x={x} y={y + 4} textAnchor={anchor} fontSize={11} fill="var(--color-ivory-300)">
            {short} <tspan fill="var(--color-ivory-100)" fontWeight={600}>{values[i]}</tspan>
          </text>
        )
      })}
    </svg>
  )
}
