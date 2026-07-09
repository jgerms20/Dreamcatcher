import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDreams } from '../store/dreams'
import DreamCard from '../components/DreamCard'
import ReplayMode from '../components/ReplayMode'

export default function Journal() {
  const dreams = useDreams((s) => s.dreams)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'lucid' | 'recurring' | 'video'>('all')
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
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl text-dusk-100">Dream Journal</h2>
          <p className="mt-1 text-sm text-dusk-300">
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
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search dreams, symbols, feelings…"
            className="input max-w-xs"
          />
          {(['all', 'lucid', 'recurring', 'video'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={filter === f ? 'btn-primary' : 'btn-ghost'}>
              {f === 'all' ? 'All' : f === 'lucid' ? '👁️ Lucid' : f === 'recurring' ? '🔁 Recurring' : '🎬 With video'}
            </button>
          ))}
        </div>
      )}

      {dreams.length === 0 ? (
        <div className="card mx-auto max-w-lg p-10 text-center">
          <p className="text-5xl">🌙</p>
          <h3 className="font-display mt-4 text-xl text-dusk-100">No dreams yet</h3>
          <p className="mt-2 text-sm leading-relaxed text-dusk-300">
            Keep DreamCatcher within reach when you wake. The first minute matters most —
            dreams fade fast, and even one image is enough to start.
          </p>
          <Link to="/capture" className="btn-primary mt-6">Record your first dream</Link>
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-dusk-300">Nothing matches that search.</p>
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
