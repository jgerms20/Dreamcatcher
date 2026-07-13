import { RUBRIC_DIMENSIONS } from '../data/rubric'
import type { RubricResult } from '../types'

// Generous margins so vertex labels (name + score) never clip against the viewBox edge.
const SIZE = 340
const CX = SIZE / 2
const CY = SIZE / 2
const R = 84
const LABEL_R = R + 30
const GRID_HAIRLINE = 'rgba(207, 196, 174, 0.14)'
const GOLD = '#d4a24e'

function point(i: number, value: number, radius = R): [number, number] {
  const angle = (Math.PI * 2 * i) / RUBRIC_DIMENSIONS.length - Math.PI / 2
  const r = (value / 5) * radius
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
      {/* hairline grid rings */}
      {[1, 2, 3, 4, 5].map((ring) => (
        <polygon
          key={ring}
          points={RUBRIC_DIMENSIONS.map((_, i) => point(i, ring).join(',')).join(' ')}
          fill="none"
          stroke={GRID_HAIRLINE}
          strokeWidth={ring === 5 ? 1.25 : 1}
        />
      ))}
      {/* spokes */}
      {RUBRIC_DIMENSIONS.map((_, i) => {
        const [x, y] = point(i, 5)
        return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke={GRID_HAIRLINE} strokeWidth={1} />
      })}
      {/* gold data polygon */}
      <polygon
        points={polygon}
        fill="rgba(212, 162, 78, 0.18)"
        stroke={GOLD}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {values.map((v, i) => {
        const [x, y] = point(i, v)
        const dim = RUBRIC_DIMENSIONS[i]
        return (
          <circle key={dim.id} cx={x} cy={y} r={3.5} fill={GOLD} stroke="var(--color-night-800)" strokeWidth={2}>
            <title>{`${dim.name}: ${v}/5 — ${rubric.scores[dim.id]?.note ?? ''}`}</title>
          </circle>
        )
      })}
      {/* centered overall score */}
      <circle cx={CX} cy={CY} r={42} fill="rgba(10, 12, 20, 0.6)" />
      <text
        x={CX}
        y={CY - 3}
        textAnchor="middle"
        fontSize={30}
        fontFamily="var(--font-display)"
        fill="var(--color-dusk-100)"
      >
        {rubric.overall}
      </text>
      <text
        x={CX}
        y={CY + 16}
        textAnchor="middle"
        fontSize={9}
        letterSpacing="0.14em"
        fill="var(--color-dusk-300)"
        style={{ textTransform: 'uppercase' }}
      >
        of 100
      </text>
      {/* axis labels, always centered on the spoke so overflow is symmetric and never clips */}
      {RUBRIC_DIMENSIONS.map((dim, i) => {
        const [x, y] = point(i, 5, LABEL_R)
        const short = dim.name.split(' ')[0].replace('&', '')
        return (
          <text key={dim.id} x={x} y={y} textAnchor="middle" fontSize={10.5} fill="var(--color-dusk-300)">
            <tspan x={x} dy="-1.5">
              {short.toUpperCase()}
            </tspan>
            <tspan x={x} dy="13" fontSize={13} fontWeight={700} fill="var(--color-dusk-100)">
              {values[i]}
            </tspan>
          </text>
        )
      })}
    </svg>
  )
}
