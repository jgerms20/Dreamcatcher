import { useMemo, useState } from 'react'
import { useDreams } from '../store/dreams'
import { analyzePatterns, compareDreams, hasClaudeKey } from '../services/claude'
import { BarList, TrendChart } from '../components/charts'
import Markdown from '../components/Markdown'
import { MOOD_META } from '../components/DreamCard'

export default function Insights() {
  const dreams = useDreams((s) => s.dreams)
  const ai = hasClaudeKey()

  const symbolCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const d of dreams) for (const s of d.symbols) counts.set(s, (counts.get(s) ?? 0) + 1)
    return [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 10)
  }, [dreams])

  const emotionCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const d of dreams) for (const e of d.emotions) counts.set(e, (counts.get(e) ?? 0) + 1)
    return [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 10)
  }, [dreams])

  const moodTrend = useMemo(() => {
    return dreams
      .filter((d) => d.mood != null)
      .slice()
      .sort((a, b) => a.dreamDate.localeCompare(b.dreamDate))
      .map((d) => ({
        date: d.dreamDate.slice(5),
        value: d.mood!,
        label: `${d.dreamDate}: ${d.title || 'Untitled'} — ${MOOD_META[d.mood!].label}`,
      }))
  }, [dreams])

  if (dreams.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-4xl">✨</p>
        <p className="mt-4 text-sm text-dusk-300">Insights unlock once you've caught a few dreams.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="reveal">
        <h2 className="font-display text-3xl text-dusk-100">
          Insights <em>across your dreams</em>
        </h2>
        <p className="mt-1 text-sm text-dusk-300">What your dream life keeps returning to.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-5 reveal">
          <h3 className="font-display text-lg text-dusk-100">Recurring symbols</h3>
          {symbolCounts.length ? (
            <div className="mt-4"><BarList items={symbolCounts} color="#d4a24e" /></div>
          ) : (
            <p className="mt-3 text-sm text-dusk-400">Symbols appear here after dreams are analyzed (✨ on a dream page).</p>
          )}
        </section>
        <section className="card p-5 reveal">
          <h3 className="font-display text-lg text-dusk-100">Recurring emotions</h3>
          {emotionCounts.length ? (
            <div className="mt-4"><BarList items={emotionCounts} color="#1d968b" /></div>
          ) : (
            <p className="mt-3 text-sm text-dusk-400">Emotions appear here after dreams are analyzed.</p>
          )}
        </section>
      </div>

      {moodTrend.length > 0 && (
        <section className="card p-5 reveal">
          <h3 className="font-display text-lg text-dusk-100">Emotional tone over time</h3>
          <div className="mt-4">
            <TrendChart
              points={moodTrend}
              yMin={-2}
              yMax={2}
              yTicks={[
                { value: 2, label: 'blissful' },
                { value: 0, label: 'neutral' },
                { value: -2, label: 'nightmare' },
              ]}
              color="#8b7fd4"
            />
          </div>
        </section>
      )}

      <PatternsPanel ai={ai} />
      <ComparePanel ai={ai} />
    </div>
  )
}

function PatternsPanel({ ai }: { ai: boolean }) {
  const dreams = useDreams((s) => s.dreams)
  const [text, setText] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setError(null)
    setBusy(true)
    setText('')
    try {
      await analyzePatterns(dreams, (d) => setText((t) => (t ?? '') + d))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pattern analysis failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card p-5 reveal">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg text-dusk-100">Pattern reading <em>✨</em></h3>
        <button onClick={() => void run()} disabled={!ai || busy || dreams.length < 2} className="btn-secondary text-xs">
          {busy ? 'Reading the journal…' : 'Analyze my dream journal'}
        </button>
      </div>
      {!ai && <p className="mt-2 text-xs text-dusk-400">Needs an Anthropic key (Settings).</p>}
      {dreams.length < 2 && <p className="mt-2 text-xs text-dusk-400">Needs at least two dreams.</p>}
      {error && <p className="mt-2 text-sm text-ember-300">{error}</p>}
      {text != null && (
        <div className="font-prose mt-4 rounded-xl bg-night-700/40 p-4 text-sm">
          <Markdown text={text} />
          {busy && <span className="animate-pulse text-dusk-300">▋</span>}
        </div>
      )}
    </section>
  )
}

function ComparePanel({ ai }: { ai: boolean }) {
  const dreams = useDreams((s) => s.dreams)
  const [aId, setAId] = useState('')
  const [bId, setBId] = useState('')
  const [text, setText] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    const a = dreams.find((d) => d.id === aId)
    const b = dreams.find((d) => d.id === bId)
    if (!a || !b) return
    setError(null)
    setBusy(true)
    setText('')
    try {
      await compareDreams(a, b, (d) => setText((t) => (t ?? '') + d))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Comparison failed.')
    } finally {
      setBusy(false)
    }
  }

  const label = (id: string) => {
    const d = dreams.find((x) => x.id === id)
    return d ? `${d.dreamDate} — ${d.title || d.transcript.slice(0, 30) + '…'}` : ''
  }

  return (
    <section className="card p-5 reveal">
      <h3 className="font-display text-lg text-dusk-100">Compare two dreams <em>✨</em></h3>
      <p className="mt-1 text-xs text-dusk-400">Side-by-side reading: shared symbols, inverted themes, and what the pair says together.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {[{ v: aId, set: setAId, ph: 'First dream…' }, { v: bId, set: setBId, ph: 'Second dream…' }].map((sel, i) => (
          <select key={i} value={sel.v} onChange={(e) => sel.set(e.target.value)} className="input" aria-label={sel.ph}>
            <option value="">{sel.ph}</option>
            {dreams.map((d) => (
              <option key={d.id} value={d.id} disabled={d.id === (i === 0 ? bId : aId)}>
                {label(d.id)}
              </option>
            ))}
          </select>
        ))}
      </div>
      <button onClick={() => void run()} disabled={!ai || busy || !aId || !bId} className="btn-secondary mt-3 text-xs">
        {busy ? 'Comparing…' : 'Compare'}
      </button>
      {!ai && <p className="mt-2 text-xs text-dusk-400">Needs an Anthropic key (Settings).</p>}
      {error && <p className="mt-2 text-sm text-ember-300">{error}</p>}
      {text != null && (
        <div className="font-prose mt-4 rounded-xl bg-night-700/40 p-4 text-sm">
          <Markdown text={text} />
          {busy && <span className="animate-pulse text-dusk-300">▋</span>}
        </div>
      )}
    </section>
  )
}
