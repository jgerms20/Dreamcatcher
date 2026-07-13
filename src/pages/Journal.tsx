import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDreams } from '../store/dreams'
import DreamCard from '../components/DreamCard'
import ReplayMode from '../components/ReplayMode'

export default function Journal() {
  const dreams = useDreams((s) => s.dreams)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'recurring' | 'video'>('all')
  const [replay, setReplay] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return dreams.filter((d) => {
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
    <div className="space-y-5">
      <header className="reveal flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-dusk-100">
            Dream <em>Journal</em>
          </h1>
          <p className="mt-1 text-xs uppercase tracking-widest text-dusk-400">
            {dreams.length === 0 ? 'Your dream log starts tonight.' : `${dreams.length} dream${dreams.length === 1 ? '' : 's'} caught`}
          </p>
        </div>
        <div className="flex gap-2">
          {videoDreams.length > 0 && (
            <button onClick={() => setReplay(true)} className="btn-secondary">▶ Replay ({videoDreams.length})</button>
          )}
          <Link to="/capture" className="btn-primary">🌙 New dream</Link>
        </div>
      </header>

      {dreams.length > 0 && (
        <div className="reveal flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search dreams, symbols, feelings…"
            className="input max-w-xs"
          />
          {(['all', 'recurring', 'video'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={filter === f ? 'btn-primary' : 'btn-ghost'}>
              {f === 'all' ? 'All' : f === 'recurring' ? '🔁 Recurring' : '🎬 With film'}
            </button>
          ))}
        </div>
      )}

      {dreams.length === 0 ? (
        <div className="reveal card mx-auto max-w-lg space-y-4 p-10 text-center">
          <p className="text-7xl">☾</p>
          <h3 className="font-display text-2xl text-dusk-100">No dreams yet</h3>
          <p className="text-sm leading-relaxed text-dusk-300">
            Keep DreamCatcher within reach when you wake. The first minute matters most —
            dreams fade fast, and even one image is enough to start.
          </p>
          <Link to="/capture" className="btn-primary inline-block">Record your first dream</Link>
        </div>
      ) : filtered.length === 0 ? (
        <p className="reveal py-10 text-center text-sm text-dusk-300">Nothing matches that search.</p>
      ) : (
        <div className="reveal grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((d) => (
            <DreamCard key={d.id} dream={d} />
          ))}
        </div>
      )}

      {replay && <ReplayMode dreams={videoDreams} onClose={() => setReplay(false)} />}
    </div>
  )
}
