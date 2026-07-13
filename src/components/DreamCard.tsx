import { Link } from 'react-router-dom'
import type { Dream } from '../types'

export const MOOD_META: Record<number, { label: string; emoji: string; color: string }> = {
  [-2]: { label: 'Nightmare', emoji: '🌩️', color: '#8b7fd4' },
  [-1]: { label: 'Unsettling', emoji: '🌫️', color: '#c5537b' },
  [0]: { label: 'Neutral', emoji: '🌙', color: '#d4a24e' },
  [1]: { label: 'Pleasant', emoji: '🌤️', color: '#1d968b' },
  [2]: { label: 'Blissful', emoji: '🌈', color: '#7fa3d8' },
}

export function fmtDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export default function DreamCard({ dream }: { dream: Dream }) {
  const mood = dream.mood != null ? MOOD_META[dream.mood] : undefined
  return (
    <Link
      to={`/dream/${dream.id}`}
      className="card block p-4 transition-colors hover:border-dusk-400/50"
      style={mood ? { borderLeft: `3px solid ${mood.color}` } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-mono uppercase tracking-wide text-dusk-300/60">{fmtDate(dream.dreamDate)}</p>
          <h3 className="font-display mt-0.5 truncate text-lg text-dusk-100">
            {dream.title || 'Untitled dream'}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-base">
          {dream.videoId || dream.videoUrl ? <span title="Has video">🎬</span> : null}
          {dream.audioId ? <span title="Has audio">🎙️</span> : null}
          {dream.recurring ? <span title="Recurring dream">↻</span> : null}
          {mood ? <span title={mood.label}>{mood.emoji}</span> : null}
        </div>
      </div>
      <p className="font-prose mt-2 line-clamp-3 text-sm text-dusk-200/90">{dream.transcript}</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {dream.rubric && (
          <span className="chip" title="Recall score">
            recall {dream.rubric.overall}
          </span>
        )}
        {dream.recurring && (
          <span className="chip text-sm">↻ recurring</span>
        )}
        {dream.symbols.slice(0, 4).map((s) => (
          <span key={s} className="chip">{s}</span>
        ))}
        {dream.tags.slice(0, 3).map((t) => (
          <span key={t} className="chip text-aurora-300">#{t}</span>
        ))}
      </div>
    </Link>
  )
}
