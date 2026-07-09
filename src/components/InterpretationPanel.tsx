import { useState } from 'react'
import { useDreams } from '../store/dreams'
import { interpretLens, hasClaudeKey } from '../services/claude'
import { LENSES, type Dream, type LensId } from '../types'
import Markdown from './Markdown'
import { matchSymbolsInText } from '../data/symbols'
import { Link } from 'react-router-dom'

export default function InterpretationPanel({ dream }: { dream: Dream }) {
  const update = useDreams((s) => s.update)
  const [active, setActive] = useState<LensId>('jungian')
  const [streaming, setStreaming] = useState<string | null>(null)
  const [busyLens, setBusyLens] = useState<LensId | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ai = hasClaudeKey()
  const matched = matchSymbolsInText(dream.transcript + ' ' + dream.symbols.join(' '))

  async function run(lens: LensId) {
    setError(null)
    setBusyLens(lens)
    setStreaming('')
    try {
      let acc = ''
      const full = await interpretLens(dream, lens, (delta) => {
        acc += delta
        setStreaming(acc)
      })
      await update(dream.id, { interpretation: { ...dream.interpretation, [lens]: full } })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Interpretation failed.')
    } finally {
      setBusyLens(null)
      setStreaming(null)
    }
  }

  const text = busyLens === active ? streaming : dream.interpretation[active]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {LENSES.map((l) => (
          <button
            key={l.id}
            onClick={() => setActive(l.id)}
            className={active === l.id ? 'btn-primary' : 'btn-ghost'}
            title={l.blurb}
          >
            {l.name}
            {dream.interpretation[l.id] ? ' ✓' : ''}
          </button>
        ))}
      </div>
      <p className="text-xs text-dusk-400">{LENSES.find((l) => l.id === active)?.blurb}</p>

      {text ? (
        <div className="rounded-xl bg-night-700/40 p-4 text-sm">
          <Markdown text={text} />
          {busyLens === active && <span className="animate-pulse text-dusk-300">▋</span>}
          {busyLens !== active && (
            <button onClick={() => void run(active)} className="btn-ghost mt-2 text-xs" disabled={busyLens != null}>
              ↻ Reinterpret
            </button>
          )}
        </div>
      ) : ai ? (
        <button onClick={() => void run(active)} disabled={busyLens != null} className="btn-secondary w-full">
          {busyLens != null ? 'Interpreting…' : `Interpret through the ${LENSES.find((l) => l.id === active)?.name} lens ✨`}
        </button>
      ) : (
        <p className="rounded-xl bg-night-700/40 p-4 text-sm text-dusk-300">
          AI interpretation needs an Anthropic API key (Settings). Meanwhile, the symbol encyclopedia below covers the
          classic meanings of what appeared in this dream.
        </p>
      )}
      {error && <p className="text-sm text-ember-300">{error}</p>}

      {matched.length > 0 && (
        <div>
          <h4 className="label mt-4">Symbols in this dream — from the encyclopedia</h4>
          <div className="flex flex-wrap gap-2">
            {matched.slice(0, 8).map((s) => (
              <Link key={s.id} to={`/symbols?q=${encodeURIComponent(s.name)}`} className="chip hover:border-dusk-400">
                🔮 {s.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
