import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDreams } from '../store/dreams'
import DreamCard from '../components/DreamCard'
import DreamCalendar from '../components/DreamCalendar'
import ReplayMode from '../components/ReplayMode'
import Icon, { type IconName } from '../components/Icon'

const FILTER_META: Record<'all' | 'lucid' | 'recurring' | 'video', { label: string; icon?: IconName }> = {
  all: { label: 'All' },
  lucid: { label: 'Lucid', icon: 'eye' },
  recurring: { label: 'Recurring', icon: 'repeat' },
  video: { label: 'With video', icon: 'film' },
}

export default function Journal() {
  const dreams = useDreams((s) => s.dreams)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'lucid' | 'recurring' | 'video'>('all')
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [replay, setReplay] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return dreams.filter((d) => {
      if (filter === 'lucid' && !d.lucid) return false
      if (filter === 'recurring' && !d.recurring) return false
      if (filter === 'video' && !d.videoId && !d.videoUrl) return false
      if (!q) return true
      return [d.title, d.transcript, ...d.symbols, ...d.emotions, ...d.tags]
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [dreams, query, filter])

  const videoDreams = useMemo(() => filtered.filter((d) => d.videoId || d.videoUrl), [filtered])

  return (
    <div className="reveal-stack space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="page-title">Dream Journal</h2>
          <p className="page-subtitle">
            {dreams.length === 0 ? 'Your dream log starts tonight.' : `${dreams.length} dream${dreams.length === 1 ? '' : 's'} caught`}
          </p>
        </div>
        <div className="flex gap-2">
          {videoDreams.length > 0 && (
            <button onClick={() => setReplay(true)} className="btn-secondary">
              <Icon name="play" size={16} /> Replay ({videoDreams.length})
            </button>
          )}
          <Link to="/capture" className="btn-primary">
            <Icon name="moon" size={16} /> New dream
          </Link>
        </div>
      </header>

      {dreams.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search dreams, symbols, feelings…"
              className="input max-w-xs"
            />
            {(['all', 'lucid', 'recurring', 'video'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={filter === f ? 'btn-primary' : 'btn-ghost'}>
                {FILTER_META[f].icon && <Icon name={FILTER_META[f].icon} size={15} />}
                {FILTER_META[f].label}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-ivory-100/10 bg-ink-900 p-1">
            {(['list', 'calendar'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={`btn px-3 py-1.5 ${view === mode ? 'bg-ink-700 text-aurora-300' : 'text-ivory-300 hover:bg-ink-800 hover:text-ivory-100'}`}
                aria-pressed={view === mode}
              >
                <Icon name={mode === 'list' ? 'book' : 'calendar'} size={15} />
                {mode === 'list' ? 'List' : 'Calendar'}
              </button>
            ))}
          </div>
        </div>
      )}

      {dreams.length === 0 ? (
        <div className="card mx-auto max-w-lg p-10 text-center">
          <span className="icon-mark mx-auto h-12 w-12">
            <Icon name="moon" size={24} />
          </span>
          <h3 className="font-display mt-4 text-xl font-semibold text-ivory-100">No dreams yet</h3>
          <p className="mt-2 text-sm leading-relaxed text-ivory-300">
            Keep DreamCatcher within reach when you wake. The first minute matters most —
            dreams fade fast, and even one image is enough to start.
          </p>
          <Link to="/capture" className="btn-primary mt-6">Record your first dream</Link>
        </div>
      ) : view === 'calendar' ? (
        <DreamCalendar dreams={filtered} />
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-ivory-300">Nothing matches that search.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((d) => (
            <DreamCard key={d.id} dream={d} />
          ))}
        </div>
      )}

      {replay && <ReplayMode dreams={videoDreams} onClose={() => setReplay(false)} />}
    </div>
  )
}
