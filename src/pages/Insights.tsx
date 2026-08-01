import { useMemo, useState, type ReactNode } from 'react'
import { useDreams } from '../store/dreams'
import { useSleep } from '../store/sleep'
import { analyzePatterns, compareDreams, hasClaudeKey } from '../services/claude'
import { BarList, TrendChart, HeatGrid, DivergingBarList, PairBarList, ScatterChart, pearson } from '../components/charts'
import Markdown from '../components/Markdown'
import { MOOD_META } from '../components/DreamCard'
import { CATEGORY_META, matchSymbolsInText } from '../data/symbols'
import type { Dream, SleepLog } from '../types'

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function cap(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s
}

// Symbols on a dream are free-text from the AI ("ocean", "childhood home"); map
// them back to the curated symbol library to borrow its category identity.
const categoryCache = new Map<string, string | undefined>()
function categoryFor(symbol: string): string | undefined {
  if (categoryCache.has(symbol)) return categoryCache.get(symbol)
  const category = matchSymbolsInText(symbol)[0]?.category
  categoryCache.set(symbol, category)
  return category
}
function categoryColor(category: string | undefined): string | undefined {
  if (!category) return undefined
  return CATEGORY_META[category]?.text.match(/#[0-9a-fA-F]{3,8}/)?.[0]
}

// Turns "**word**" into the app's established gold-italic emphasis, so hero
// reads use the same accent language as headers ("Insights *across your dreams*").
function renderHeroText(text: string): ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 === 1 ? <em key={i} className="display-accent">{part}</em> : <span key={i}>{part}</span>))
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[0.65rem] tracking-wider text-dusk-400 uppercase">{label}</p>
      <p className="font-display mt-0.5 text-xl text-dusk-100">{value}</p>
    </div>
  )
}

export default function Insights() {
  const dreams = useDreams((s) => s.dreams)
  const sleepLogs = useSleep((s) => s.logs)
  const ai = hasClaudeKey()

  const sortedDesc = useMemo(() => [...dreams].sort((a, b) => b.dreamDate.localeCompare(a.dreamDate)), [dreams])
  const sortedAsc = useMemo(() => [...dreams].sort((a, b) => a.dreamDate.localeCompare(b.dreamDate)), [dreams])

  const symbolCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const d of dreams) for (const s of d.symbols) counts.set(s, (counts.get(s) ?? 0) + 1)
    return [...counts.entries()].map(([label, value]) => ({ label: cap(label), value })).sort((a, b) => b.value - a.value).slice(0, 8)
  }, [dreams])

  const emotionCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const d of dreams) for (const e of d.emotions) counts.set(e, (counts.get(e) ?? 0) + 1)
    return [...counts.entries()].map(([label, value]) => ({ label: cap(label), value })).sort((a, b) => b.value - a.value).slice(0, 8)
  }, [dreams])

  // Symbol constellations: pairs of symbols that show up together within the same dream.
  const pairItems = useMemo(() => {
    const counts = new Map<string, { a: string; b: string; value: number }>()
    for (const d of dreams) {
      const uniq = [...new Set(d.symbols.map((s) => s.toLowerCase().trim()).filter(Boolean))].sort()
      for (let i = 0; i < uniq.length; i++) {
        for (let j = i + 1; j < uniq.length; j++) {
          const key = `${uniq[i]}::${uniq[j]}`
          const cur = counts.get(key)
          if (cur) cur.value++
          else counts.set(key, { a: uniq[i], b: uniq[j], value: 1 })
        }
      }
    }
    return [...counts.values()]
      .filter((p) => p.value >= 2)
      .sort((a, b) => b.value - a.value)
      .slice(0, 6)
      .map((p) => ({
        a: cap(p.a),
        b: cap(p.b),
        aColor: categoryColor(categoryFor(p.a)),
        bColor: categoryColor(categoryFor(p.b)),
        value: p.value,
      }))
  }, [dreams])

  const moodTrend = useMemo(() => {
    return sortedAsc
      .filter((d) => d.mood != null)
      .map((d) => ({
        date: d.dreamDate.slice(5),
        value: d.mood!,
        label: `${d.dreamDate}: ${d.title || 'Untitled'} — ${MOOD_META[d.mood!].label}`,
      }))
  }, [sortedAsc])

  const recallSeries = useMemo(() => {
    return sortedAsc
      .filter((d) => d.rubric?.overall != null)
      .map((d) => ({
        date: d.dreamDate.slice(5),
        value: d.rubric!.overall,
        label: `${d.dreamDate}: ${d.title || 'Untitled'} — recall ${d.rubric!.overall}/100`,
      }))
  }, [sortedAsc])

  const recallTrend = useMemo(() => {
    if (recallSeries.length < 4) return null
    const half = Math.max(1, Math.floor(recallSeries.length / 2))
    const delta = avg(recallSeries.slice(-half).map((p) => p.value)) - avg(recallSeries.slice(0, half).map((p) => p.value))
    return { n: recallSeries.length, delta }
  }, [recallSeries])

  const recallTrendText = useMemo(() => {
    if (recallSeries.length < 2) return null
    if (!recallTrend) return `Trend firms up after a few more analyzed dreams — ${recallSeries.length} logged so far.`
    if (Math.abs(recallTrend.delta) < 3) return `Recall has held fairly steady across your last ${recallTrend.n} analyzed dreams.`
    return recallTrend.delta > 0
      ? `Recall has climbed ${Math.round(recallTrend.delta)} points across your last ${recallTrend.n} analyzed dreams.`
      : `Recall has dipped ${Math.round(Math.abs(recallTrend.delta))} points across your last ${recallTrend.n} analyzed dreams — the follow-up interview helps recover more.`
  }, [recallSeries, recallTrend])

  // Dream rhythm: last 10 weeks as a dot-grid, tinted by mood (or vividness, or plain presence).
  const rhythm = useMemo(() => {
    const DAYS = 70
    const today = new Date()
    today.setHours(12, 0, 0, 0)
    const byDate = new Map<string, Dream[]>()
    for (const d of dreams) {
      const arr = byDate.get(d.dreamDate) ?? []
      arr.push(d)
      byDate.set(d.dreamDate, arr)
    }
    const cells = []
    for (let i = DAYS - 1; i >= 0; i--) {
      const dt = new Date(today)
      dt.setDate(dt.getDate() - i)
      const iso = dt.toISOString().slice(0, 10)
      const nightDreams = byDate.get(iso) ?? []
      const moods = nightDreams.map((d) => d.mood).filter((m): m is number => m != null)
      const vivids = nightDreams.map((d) => d.vividness).filter((v): v is number => v != null)
      const mood = moods.length ? avg(moods) : undefined
      const vividness = vivids.length ? avg(vivids) : undefined
      cells.push({
        date: iso,
        hasDream: nightDreams.length > 0,
        mood,
        vividness,
        label: nightDreams.length
          ? `${iso}: ${nightDreams.map((d) => d.title || 'Untitled').join(', ')}${mood != null ? ` · mood ${mood.toFixed(1)}` : ''}`
          : `${iso}: no dream recorded`,
      })
    }
    return cells
  }, [dreams])

  const rhythmStats = useMemo(() => {
    const recordedTotal = rhythm.filter((c) => c.hasDream).length
    let lastRecorded = -1
    for (let i = rhythm.length - 1; i >= 0; i--) {
      if (rhythm[i].hasDream) {
        lastRecorded = i
        break
      }
    }
    let streak = 0
    for (let i = lastRecorded; i >= 0; i--) {
      if (rhythm[i].hasDream) streak++
      else break
    }
    return { recordedTotal, streak, totalNights: rhythm.length }
  }, [rhythm])

  const rhythmSummary = useMemo(() => {
    const { recordedTotal, totalNights, streak } = rhythmStats
    const streakPart = streak > 1 ? ` Current streak: ${streak} nights.` : ''
    return `Dream rhythm, last ${totalNights} nights: ${recordedTotal} nights with a recorded dream.${streakPart}`
  }, [rhythmStats])

  // Emotional weather: average mood by night-of-week, wherever there's enough data.
  const moodByWeekday = useMemo(() => {
    const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const buckets = new Map<number, number[]>()
    for (const d of dreams) {
      if (d.mood == null) continue
      const dow = new Date(d.dreamDate + 'T12:00:00').getDay()
      const arr = buckets.get(dow) ?? []
      arr.push(d.mood)
      buckets.set(dow, arr)
    }
    return WD.map((label, i) => {
      const vals = buckets.get(i) ?? []
      return { label, value: vals.length ? avg(vals) : 0, n: vals.length }
    }).filter((x) => x.n > 0)
  }, [dreams])

  // Sleep ↔ dream correlations, auto-ranked so the strongest signal surfaces without a dropdown hunt.
  const correlations = useMemo(() => {
    const byDate = new Map<string, Dream[]>()
    for (const d of dreams) {
      const arr = byDate.get(d.dreamDate) ?? []
      arr.push(d)
      byDate.set(d.dreamDate, arr)
    }
    const joined = sleepLogs
      .map((log) => {
        const nightDreams = byDate.get(log.date) ?? []
        if (!nightDreams.length) return null
        const pick = (vals: (number | undefined)[]) => {
          const v = vals.filter((x): x is number => x != null)
          return v.length ? avg(v) : null
        }
        return {
          log,
          recall: pick(nightDreams.map((d) => d.rubric?.overall)),
          vividness: pick(nightDreams.map((d) => d.vividness)),
          mood: pick(nightDreams.map((d) => d.mood)),
        }
      })
      .filter((x): x is NonNullable<typeof x> => x != null)

    const metrics: { key: 'recall' | 'vividness' | 'mood'; name: string }[] = [
      { key: 'recall', name: 'Recall score' },
      { key: 'vividness', name: 'Vividness' },
      { key: 'mood', name: 'Dream mood' },
    ]
    const factors: { name: string; get: (l: SleepLog) => number }[] = [
      { name: 'Sleep duration', get: (l) => l.durationH },
      { name: 'Sleep quality', get: (l) => l.quality },
      { name: 'Stress', get: (l) => l.stress },
    ]
    const out: { factor: string; metric: string; r: number; n: number; xs: number[]; ys: number[]; labels: string[] }[] = []
    for (const f of factors) {
      for (const m of metrics) {
        const pairs = joined.filter((j) => j[m.key] != null)
        if (pairs.length < 4) continue
        const xs = pairs.map((j) => f.get(j.log))
        const ys = pairs.map((j) => j[m.key]!)
        const r = pearson(xs, ys)
        if (r != null) {
          out.push({
            factor: f.name,
            metric: m.name,
            r,
            n: pairs.length,
            xs,
            ys,
            labels: pairs.map((j) => `${j.log.date}: ${f.name} ${f.get(j.log)}, ${m.name} ${j[m.key]!.toFixed(1)}`),
          })
        }
      }
    }
    return out.sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
  }, [dreams, sleepLogs])
  const topCorrelation = correlations[0]

  const lucidCount = useMemo(() => dreams.filter((d) => d.lucid).length, [dreams])
  const avgVividness = useMemo(() => {
    const v = dreams.map((d) => d.vividness).filter((x): x is number => x != null)
    return v.length ? avg(v) : null
  }, [dreams])

  // Rank candidate "single most interesting fact" reads and lead with the strongest.
  const hero = useMemo(() => {
    const candidates: { text: string; strength: number }[] = []
    if (sortedDesc.length >= 3) {
      const windowSize = Math.min(10, sortedDesc.length)
      const recent = sortedDesc.slice(0, windowSize)
      const counts = new Map<string, number>()
      for (const d of recent) for (const s of new Set(d.symbols.map((x) => x.toLowerCase()))) counts.set(s, (counts.get(s) ?? 0) + 1)
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
      if (top && top[1] >= 3) {
        candidates.push({
          text: `**${cap(top[0])}** has appeared in ${top[1]} of your last ${windowSize} dreams.`,
          strength: top[1] / windowSize,
        })
      }
    }
    if (pairItems.length && pairItems[0].value >= 3) {
      candidates.push({
        text: `**${pairItems[0].a}** and **${pairItems[0].b}** keep showing up together — ${pairItems[0].value} dreams share both.`,
        strength: 0.55 + pairItems[0].value / Math.max(dreams.length, 1),
      })
    }
    if (topCorrelation && Math.abs(topCorrelation.r) >= 0.4) {
      const dir = topCorrelation.r > 0 ? 'track with higher' : 'track with lower'
      candidates.push({
        text: `Nights with more **${topCorrelation.factor.toLowerCase()}** ${dir} **${topCorrelation.metric.toLowerCase()}** (r = ${topCorrelation.r.toFixed(2)}, ${topCorrelation.n} nights).`,
        strength: Math.abs(topCorrelation.r),
      })
    }
    if (recallTrend && Math.abs(recallTrend.delta) >= 8) {
      candidates.push({
        text:
          recallTrend.delta > 0
            ? `Your dream recall has climbed **${Math.round(recallTrend.delta)} points** over your last ${recallTrend.n} analyzed dreams.`
            : `Your dream recall has dipped **${Math.round(Math.abs(recallTrend.delta))} points** over your last ${recallTrend.n} analyzed dreams.`,
        strength: Math.min(1, Math.abs(recallTrend.delta) / 40),
      })
    }
    if (rhythmStats.streak >= 3) {
      candidates.push({
        text: `You're on a **${rhythmStats.streak}-night streak** of catching dreams.`,
        strength: Math.min(1, rhythmStats.streak / 10),
      })
    }
    if (lucidCount >= 2 && dreams.length) {
      candidates.push({
        text: `**${lucidCount}** of your ${dreams.length} dreams have been lucid — ${Math.round((lucidCount / dreams.length) * 100)}% of the journal.`,
        strength: lucidCount / dreams.length,
      })
    }
    candidates.sort((a, b) => b.strength - a.strength)
    return candidates[0]
  }, [sortedDesc, pairItems, topCorrelation, recallTrend, rhythmStats, lucidCount, dreams])

  if (dreams.length === 0) {
    return (
      <div className="reveal py-20 text-center">
        <p className="font-display text-3xl text-dusk-100">
          The atlas is <em className="display-accent">blank</em>, for now.
        </p>
        <p className="mx-auto mt-3 max-w-md text-sm text-dusk-300">
          Catch a few dreams and this page fills in: a rhythm map of your nights, the symbols that keep returning
          together, how well you're recalling over time, and — once you log some sleep too — what's actually
          correlated with it.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <header className="reveal">
        <h2 className="font-display text-3xl text-dusk-100">
          Insights <em>across your dreams</em>
        </h2>
        <p className="mt-1 text-sm text-dusk-300">What your dream life keeps returning to.</p>
      </header>

      {dreams.length < 3 && (
        <section className="reveal card p-5 text-sm text-dusk-300">
          You've caught {dreams.length} dream{dreams.length === 1 ? '' : 's'} so far. A few more nights unlocks the
          rest of this page — a headline read, symbol pairs, and recall trends all need a bit more to work with.
        </section>
      )}

      <section className="reveal card card-glow p-6 sm:p-8">
        <p className="label text-dusk-400">The read</p>
        {hero ? (
          <p className="font-display mt-2 text-2xl leading-snug text-dusk-100 sm:text-[1.75rem]">{renderHeroText(hero.text)}</p>
        ) : (
          <p className="font-display mt-2 text-2xl leading-snug text-dusk-100 sm:text-[1.75rem]">
            Keep logging — <em className="display-accent">a pattern is forming.</em>
          </p>
        )}
        <div className="rule my-5" />
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <Stat label="Dreams caught" value={String(dreams.length)} />
          <Stat label="Current streak" value={`${rhythmStats.streak} night${rhythmStats.streak === 1 ? '' : 's'}`} />
          <Stat label="Lucid" value={String(lucidCount)} />
          <Stat label="Avg vividness" value={avgVividness != null ? `${avgVividness.toFixed(1)}/5` : '—'} />
        </div>
      </section>

      <section className="reveal card p-5">
        <h3 className="font-display text-lg text-dusk-100">Dream rhythm</h3>
        <p className="mt-1 text-xs text-dusk-400">Ten weeks of nights, tinted by mood where it's known.</p>
        <div className="mt-4 overflow-x-auto">
          <HeatGrid cells={rhythm} summary={rhythmSummary} />
        </div>
      </section>

      <section className="reveal card p-5">
        <h3 className="font-display text-lg text-dusk-100">Symbol constellations</h3>
        <p className="mt-1 text-xs text-dusk-400">Symbols that recur <em className="not-italic text-dusk-300">together</em>, not just often.</p>
        {pairItems.length ? (
          <div className="mt-4 max-w-lg">
            <PairBarList items={pairItems} color="#d4a24e" />
          </div>
        ) : (
          <p className="mt-3 text-sm text-dusk-400">Pairs appear once a couple of your analyzed dreams share two or more symbols.</p>
        )}
        <div className="rule my-5" />
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <h4 className="text-xs tracking-wider text-dusk-400 uppercase">Recurring symbols</h4>
            {symbolCounts.length ? (
              <div className="mt-3"><BarList items={symbolCounts} color="#1d968b" /></div>
            ) : (
              <p className="mt-3 text-sm text-dusk-400">Symbols appear here after dreams are analyzed (✨ on a dream page).</p>
            )}
          </div>
          <div>
            <h4 className="text-xs tracking-wider text-dusk-400 uppercase">Recurring emotions</h4>
            {emotionCounts.length ? (
              <div className="mt-3"><BarList items={emotionCounts} color="#c0702a" /></div>
            ) : (
              <p className="mt-3 text-sm text-dusk-400">Emotions appear here after dreams are analyzed.</p>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="reveal card p-5">
          <h3 className="font-display text-lg text-dusk-100">Recall trajectory</h3>
          {recallSeries.length >= 2 ? (
            <>
              <p className="mt-1 text-xs text-dusk-400">{recallTrendText}</p>
              <div className="mt-4">
                <TrendChart
                  points={recallSeries}
                  yMin={0}
                  yMax={100}
                  yTicks={[{ value: 100, label: 'thorough' }, { value: 50, label: 'partial' }, { value: 0, label: 'sparse' }]}
                  color="#1d968b"
                  trendLine
                  ariaLabel={`Recall score over time. ${recallTrendText ?? ''}`}
                />
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-dusk-400">Recall scores appear once dreams are analyzed (✨ on a dream page).</p>
          )}
        </section>
        <section className="reveal card p-5">
          <h3 className="font-display text-lg text-dusk-100">Emotional tone over time</h3>
          {moodTrend.length > 0 ? (
            <div className="mt-4">
              <TrendChart
                points={moodTrend}
                yMin={-2}
                yMax={2}
                yTicks={[{ value: 2, label: 'blissful' }, { value: 0, label: 'neutral' }, { value: -2, label: 'nightmare' }]}
                color="#8b7fd4"
                ariaLabel="Dream mood over time, from nightmare to blissful"
              />
            </div>
          ) : (
            <p className="mt-3 text-sm text-dusk-400">Tone appears here once dreams have a mood attached.</p>
          )}
        </section>
      </div>

      <section className="reveal card p-5">
        <h3 className="font-display text-lg text-dusk-100">Emotional weather</h3>
        <p className="mt-1 text-xs text-dusk-400">Average mood by night of the week.</p>
        {moodByWeekday.length >= 2 ? (
          <div className="mt-4 max-w-lg">
            <DivergingBarList items={moodByWeekday} domain={2} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-dusk-400">Needs mood on dreams across at least two different weekdays.</p>
        )}
      </section>

      <section className="reveal card p-5">
        <h3 className="font-display text-lg text-dusk-100">Sleep <em>↔</em> dreams</h3>
        {topCorrelation ? (
          <>
            <p className="mt-1 text-sm text-dusk-200">
              <strong className="text-dusk-100">{topCorrelation.factor}</strong> ↔{' '}
              <strong className="text-dusk-100">{topCorrelation.metric}</strong>{' '}
              <span className="chip ml-1">r = {topCorrelation.r.toFixed(2)} · {topCorrelation.n} nights</span>
            </p>
            <p className="mt-1 text-xs text-dusk-400">
              {Math.abs(topCorrelation.r) < 0.3
                ? 'Weak so far — keep logging both sides.'
                : Math.abs(topCorrelation.r) < 0.6
                  ? 'A moderate pattern is forming.'
                  : 'A strong pattern — worth experimenting with.'}{' '}
              Correlation isn't causation, but it tells you what to try changing.
            </p>
            <div className="mt-4 max-w-md">
              <ScatterChart
                points={topCorrelation.xs.map((x, i) => ({ x, y: topCorrelation.ys[i], label: topCorrelation.labels[i] }))}
                xLabel={topCorrelation.factor}
                yLabel={topCorrelation.metric}
                color="#c0702a"
              />
            </div>
            {correlations.length > 1 && (
              <ul className="mt-3 space-y-1 text-xs text-dusk-400">
                {correlations.slice(1, 4).map((c, i) => (
                  <li key={i}>
                    {c.factor} ↔ {c.metric} · r = {c.r.toFixed(2)} · {c.n} nights
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="mt-3 text-sm text-dusk-400">
            Correlations appear once you have at least four nights with both a sleep log and an analyzed dream.
            Log tonight, dream, record, repeat.
          </p>
        )}
      </section>

      <div className="reveal space-y-4">
        <div className="flex items-center gap-3">
          <div className="rule flex-1" />
          <p className="font-display text-xs tracking-[0.2em] text-dusk-400 italic">beyond the numbers</p>
          <div className="rule flex-1" />
        </div>
        <PatternsPanel ai={ai} />
        <ComparePanel ai={ai} />
      </div>
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
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base text-dusk-100">Pattern reading <em className="display-accent">✨</em></h3>
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
    <section className="card p-5">
      <h3 className="font-display text-base text-dusk-100">Compare two dreams <em className="display-accent">✨</em></h3>
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
