import { useMemo, useState } from 'react'
import { useSleep } from '../store/sleep'
import { useDreams } from '../store/dreams'
import { ScatterChart, pearson } from '../components/charts'
import { lastNightISO, type SleepLog } from '../types'

export default function Sleep() {
  const { logs, upsert, remove } = useSleep()
  const dreams = useDreams((s) => s.dreams)
  const [form, setForm] = useState<Omit<SleepLog, 'id'>>({
    date: lastNightISO(),
    durationH: 7.5,
    quality: 3,
    caffeine: false,
    alcohol: false,
    exercise: false,
    stress: 2,
    screenLate: false,
  })
  const [saved, setSaved] = useState(false)

  // Join sleep logs to dream metrics for the same night
  const joined = useMemo(() => {
    return logs
      .map((log) => {
        const nightDreams = dreams.filter((d) => d.dreamDate === log.date)
        if (!nightDreams.length) return null
        const avg = (vals: (number | undefined)[]) => {
          const v = vals.filter((x): x is number => x != null)
          return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
        }
        return {
          log,
          recall: avg(nightDreams.map((d) => d.rubric?.overall)),
          vividness: avg(nightDreams.map((d) => d.vividness)),
          mood: avg(nightDreams.map((d) => d.mood)),
          count: nightDreams.length,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
  }, [logs, dreams])

  const correlations = useMemo(() => {
    const metrics: { key: 'recall' | 'vividness' | 'mood'; name: string }[] = [
      { key: 'recall', name: 'Recall score' },
      { key: 'vividness', name: 'Vividness' },
      { key: 'mood', name: 'Dream mood' },
    ]
    const factors: { name: string; get: (l: SleepLog) => number }[] = [
      { name: 'Sleep duration (h)', get: (l) => l.durationH },
      { name: 'Sleep quality', get: (l) => l.quality },
      { name: 'Stress', get: (l) => l.stress },
    ]
    const out: { factor: string; metric: string; r: number; n: number; xs: number[]; ys: number[]; labels: string[] }[] = []
    for (const f of factors) {
      for (const m of metrics) {
        const pairs = joined.filter((j) => j[m.key] != null)
        const xs = pairs.map((j) => f.get(j.log))
        const ys = pairs.map((j) => j[m.key]!)
        const r = pearson(xs, ys)
        if (r != null) {
          out.push({
            factor: f.name, metric: m.name, r, n: pairs.length, xs, ys,
            labels: pairs.map((j) => `${j.log.date}: ${f.name} ${f.get(j.log)}, ${m.name} ${j[m.key]!.toFixed(1)}`),
          })
        }
      }
    }
    return out.sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
  }, [joined])

  const top = correlations[0]

  async function save() {
    await upsert(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-display text-3xl text-dusk-100">Sleep & Vitals</h2>
        <p className="mt-1 text-sm text-dusk-300">
          Log each night's basics and DreamCatcher will surface what actually moves your dreaming — recall, vividness, mood.
        </p>
      </header>

      <section className="card p-5">
        <h3 className="font-display text-lg text-dusk-100">Log last night</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label" htmlFor="sl-date">Night of</label>
            <input id="sl-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="sl-dur">Hours slept: {form.durationH}</label>
            <input id="sl-dur" type="range" min={3} max={12} step={0.5} value={form.durationH} onChange={(e) => setForm({ ...form, durationH: Number(e.target.value) })} className="w-full accent-dusk-400" />
          </div>
          <div>
            <label className="label" htmlFor="sl-q">Sleep quality: {form.quality}/5</label>
            <input id="sl-q" type="range" min={1} max={5} value={form.quality} onChange={(e) => setForm({ ...form, quality: Number(e.target.value) })} className="w-full accent-dusk-400" />
          </div>
          <div>
            <label className="label" htmlFor="sl-stress">Stress yesterday: {form.stress}/5</label>
            <input id="sl-stress" type="range" min={1} max={5} value={form.stress} onChange={(e) => setForm({ ...form, stress: Number(e.target.value) })} className="w-full accent-dusk-400" />
          </div>
          <div className="flex flex-wrap items-end gap-3 text-sm text-dusk-200 sm:col-span-2">
            {([
              ['caffeine', '☕ Caffeine after noon'],
              ['alcohol', '🍷 Alcohol'],
              ['exercise', '🏃 Exercised'],
              ['screenLate', '📱 Screens in bed'],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                  className="accent-dusk-400"
                />
                {label}
              </label>
            ))}
          </div>
        </div>
        <button onClick={() => void save()} className="btn-primary mt-4">{saved ? '✓ Saved' : 'Save night'}</button>
      </section>

      {top && top.n >= 3 ? (
        <section className="card p-5">
          <h3 className="font-display text-lg text-dusk-100">Strongest correlation so far</h3>
          <p className="mt-1 text-sm text-dusk-200">
            <strong className="text-dusk-100">{top.factor}</strong> ↔ <strong className="text-dusk-100">{top.metric}</strong>{' '}
            <span className="chip ml-1">r = {top.r.toFixed(2)} · {top.n} nights</span>
          </p>
          <p className="mt-1 text-xs text-dusk-400">
            {Math.abs(top.r) < 0.3 ? 'Weak so far — keep logging.' : Math.abs(top.r) < 0.6 ? 'A moderate pattern is forming.' : 'A strong pattern — worth experimenting with.'}
            {' '}Correlation isn't causation, but it tells you what to try changing.
          </p>
          <div className="mt-4 max-w-md">
            <ScatterChart
              points={top.xs.map((x, i) => ({ x, y: top.ys[i], label: top.labels[i] }))}
              xLabel={top.factor}
              yLabel={top.metric}
            />
          </div>
          {correlations.length > 1 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-dusk-400">
                    <th className="py-1 pr-4">Sleep factor</th>
                    <th className="py-1 pr-4">Dream metric</th>
                    <th className="py-1 pr-4">r</th>
                    <th className="py-1">nights</th>
                  </tr>
                </thead>
                <tbody className="text-dusk-200">
                  {correlations.map((c, i) => (
                    <tr key={i} className="border-t border-night-600/50">
                      <td className="py-1.5 pr-4">{c.factor}</td>
                      <td className="py-1.5 pr-4">{c.metric}</td>
                      <td className={`py-1.5 pr-4 tabular-nums ${Math.abs(c.r) >= 0.5 ? 'text-aurora-300' : ''}`}>{c.r.toFixed(2)}</td>
                      <td className="py-1.5 tabular-nums">{c.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="card p-5 text-sm text-dusk-300">
          📊 Correlations appear after ~3 nights that have <em>both</em> a sleep log and an analyzed dream. Log tonight, dream, record, repeat.
        </section>
      )}

      {logs.length > 0 && (
        <section className="card p-5">
          <h3 className="font-display text-lg text-dusk-100">Logged nights</h3>
          <div className="mt-3 space-y-1.5 text-sm">
            {logs.slice(0, 14).map((l) => (
              <div key={l.id} className="flex items-center justify-between rounded-lg bg-night-700/40 px-3 py-1.5 text-dusk-200">
                <span>{l.date} · {l.durationH}h · quality {l.quality}/5 · stress {l.stress}/5
                  {l.caffeine ? ' ☕' : ''}{l.alcohol ? ' 🍷' : ''}{l.exercise ? ' 🏃' : ''}{l.screenLate ? ' 📱' : ''}
                </span>
                <button onClick={() => void remove(l.id)} className="text-xs text-dusk-400 hover:text-ember-300" aria-label={`Delete log for ${l.date}`}>✕</button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
