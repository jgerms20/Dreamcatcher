import { useEffect, useRef, useState } from 'react'
import { useDreams } from '../store/dreams'
import { interpretLens, interpretAuto, hasClaudeKey } from '../services/claude'
import { LENSES, type Dream, type LensId } from '../types'
import Markdown from './Markdown'
import { matchSymbolsInText } from '../data/symbols'
import { Link } from 'react-router-dom'

export default function InterpretationPanel({ dream }: { dream: Dream }) {
  const update = useDreams((s) => s.update)
  const [active, setActive] = useState<LensId>(() => (Object.keys(dream.interpretation)[0] as LensId | undefined) ?? 'jungian')
  const [streaming, setStreaming] = useState<string | null>(null)
  const [busyLens, setBusyLens] = useState<LensId | null>(null)
  const [autoRunning, setAutoRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ai = hasClaudeKey()
  const matched = matchSymbolsInText(dream.transcript + ' ' + dream.symbols.join(' '))
  const requested = useRef<Set<string>>(new Set())
  const lastDreamId = useRef(dream.id)

  // Reset the active tab when navigating to a different dream.
  useEffect(() => {
    if (lastDreamId.current !== dream.id) {
      lastDreamId.current = dream.id
      setActive((Object.keys(dream.interpretation)[0] as LensId | undefined) ?? 'jungian')
    }
  }, [dream.id, dream.interpretation])

  async function runAuto() {
    setError(null)
    setAutoRunning(true)
    try {
      const result = await interpretAuto(dream, () => {
        // We don't know which lens tab to stream into until interpretAuto
        // resolves, so the shimmer state below carries the loading UX.
      })
      await update(dream.id, { interpretation: { ...dream.interpretation, [result.lens]: result.text } })
      setActive(result.lens)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Interpretation failed.')
    } finally {
      setAutoRunning(false)
    }
  }

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

  // Interpretation should just happen: auto-run once for a fresh dream, and
  // auto-generate whichever lens the user switches to if it has no text yet.
  useEffect(() => {
    if (!ai || !dream.transcript.trim()) return
    if (autoRunning || busyLens) return
    const hasAny = Object.keys(dream.interpretation).length > 0
    if (!hasAny) {
      const key = `auto:${dream.id}`
      if (requested.current.has(key)) return
      requested.current.add(key)
      void runAuto()
      return
    }
    if (dream.interpretation[active]) return
    const key = `lens:${dream.id}:${active}`
    if (requested.current.has(key)) return
    requested.current.add(key)
    void run(active)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dream.id, active, ai, dream.transcript, dream.interpretation])

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
        <div className="rounded-xl bg-night-700/40 p-4">
          <div className="font-prose text-dusk-200">
            <Markdown text={text} />
          </div>
          {busyLens === active && <span className="animate-pulse text-dusk-300">▋</span>}
        </div>
      ) : ai ? (
        dream.transcript.trim() ? (
          <div className="rounded-xl bg-night-700/40 p-6 text-center">
            <p className="shimmer-text font-prose text-lg">
              {autoRunning ? 'reading the dream…' : 'reading it through this lens…'}
            </p>
          </div>
        ) : (
          <p className="rounded-xl bg-night-700/40 p-4 text-sm text-dusk-300">
            Write down the dream first — interpretation needs something to read.
          </p>
        )
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
                {s.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
