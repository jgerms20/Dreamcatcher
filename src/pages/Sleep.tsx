import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useSleep } from '../store/sleep'
import { useDreams } from '../store/dreams'
import { ScatterChart, pearson } from '../components/charts'
import { lastNightISO, type SleepLog } from '../types'
import {
  parseAppleHealthSleepFile,
  parseFitbitSleepFiles,
  toSleepLogInput,
  type HealthImportParseResult,
  type HealthImportProgress,
  type HealthImportSource,
} from '../services/healthImport'

function defaultForm(): Omit<SleepLog, 'id'> {
  return {
    date: lastNightISO(),
    durationH: 7.5,
    quality: 3,
    caffeine: false,
    alcohol: false,
    exercise: false,
    stress: 2,
    screenLate: false,
  }
}

/** Hours between bedTime and wakeTime, handling a crossing past midnight
 * (wake clock-time earlier than bed clock-time means the night rolled over). */
function computeDurationH(bedTime?: string, wakeTime?: string): number | null {
  if (!bedTime || !wakeTime) return null
  const [bh, bm] = bedTime.split(':').map(Number)
  const [wh, wm] = wakeTime.split(':').map(Number)
  if ([bh, bm, wh, wm].some((n) => Number.isNaN(n))) return null
  let minutes = (wh * 60 + wm) - (bh * 60 + bm)
  if (minutes <= 0) minutes += 24 * 60 // crossed midnight (or a full 24h round-trip)
  return Math.round((minutes / 60) * 100) / 100
}

export default function Sleep() {
  const { logs, upsert, remove } = useSleep()
  const dreams = useDreams((s) => s.dreams)
  const [form, setForm] = useState<Omit<SleepLog, 'id'>>(defaultForm())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const formSectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (editingId) formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [editingId])

  function updateBedWake(patch: Partial<Pick<SleepLog, 'bedTime' | 'wakeTime'>>) {
    setForm((f) => {
      const next = { ...f, ...patch }
      const computed = computeDurationH(next.bedTime, next.wakeTime)
      return computed != null ? { ...next, durationH: computed } : next
    })
  }

  function editLog(l: SleepLog) {
    const { id, ...rest } = l
    setForm(rest)
    setEditingId(id)
    setManualOpen(true)
    setSaved(false)
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(defaultForm())
  }

  async function deleteLog(id: string) {
    await remove(id)
    if (editingId === id) cancelEdit()
  }

  // Apple Health import state
  const [appleBusy, setAppleBusy] = useState(false)
  const [appleProgress, setAppleProgress] = useState<HealthImportProgress | null>(null)
  const [appleError, setAppleError] = useState<string | null>(null)
  const [appleReview, setAppleReview] = useState<HealthImportParseResult | null>(null)
  const [appleAdding, setAppleAdding] = useState(false)
  const [appleAdded, setAppleAdded] = useState<number | null>(null)

  // Fitbit import state
  const [fitbitBusy, setFitbitBusy] = useState(false)
  const [fitbitError, setFitbitError] = useState<string | null>(null)
  const [fitbitReview, setFitbitReview] = useState<HealthImportParseResult | null>(null)
  const [fitbitAdding, setFitbitAdding] = useState(false)
  const [fitbitAdded, setFitbitAdded] = useState<number | null>(null)

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
    await upsert(editingId ? { ...form, id: editingId } : form)
    setSaved(true)
    setEditingId(null)
    setForm(defaultForm())
    setTimeout(() => setSaved(false), 1500)
  }

  async function handleAppleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setAppleError(null)
    setAppleReview(null)
    setAppleAdded(null)
    setAppleProgress(null)
    setAppleBusy(true)
    try {
      const result = await parseAppleHealthSleepFile(file, (p) => setAppleProgress(p))
      setAppleReview(result)
    } catch (err) {
      setAppleError(err instanceof Error ? err.message : 'Could not read that export file.')
    } finally {
      setAppleBusy(false)
      setAppleProgress(null)
    }
  }

  async function handleFitbitFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    e.target.value = ''
    if (!files || files.length === 0) return
    setFitbitError(null)
    setFitbitReview(null)
    setFitbitAdded(null)
    setFitbitBusy(true)
    try {
      const result = await parseFitbitSleepFiles(files)
      setFitbitReview(result)
    } catch (err) {
      if (err instanceof SyntaxError) {
        setFitbitError("That file doesn't look like valid Fitbit JSON. Try the .csv export instead, or check the file isn't corrupted.")
      } else {
        setFitbitError(err instanceof Error ? err.message : 'Could not read those files.')
      }
    } finally {
      setFitbitBusy(false)
    }
  }

  async function addImportedNights(source: HealthImportSource) {
    const review = source === 'apple' ? appleReview : fitbitReview
    if (!review || review.nights.length === 0) return
    const setAdding = source === 'apple' ? setAppleAdding : setFitbitAdding
    setAdding(true)
    try {
      for (const night of review.nights) {
        await upsert(toSleepLogInput(night, source))
      }
      if (source === 'apple') {
        setAppleAdded(review.nights.length)
        setAppleReview(null)
      } else {
        setFitbitAdded(review.nights.length)
        setFitbitReview(null)
      }
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="space-y-6">
      <header className="reveal">
        <h2 className="font-display text-3xl text-dusk-100">Nights, <em>imported</em></h2>
        <p className="mt-1 text-sm text-dusk-300">
          Point your wearable's export at DreamCatcher and let it fill in the nights — no nightly typing required.
        </p>
      </header>

      <section className="reveal card card-glow p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-night-600/50 bg-night-700/30 p-4">
            <h3 className="font-display text-base text-dusk-100">Apple Health</h3>
            <p className="mt-1 text-xs text-dusk-400">
              Health app → profile icon → <span className="text-dusk-300">Export All Health Data</span> → unzip the
              download → choose <span className="text-dusk-300">export.xml</span>.
            </p>
            <div className="mt-3">
              <label className="btn-secondary cursor-pointer text-sm">
                {appleBusy ? 'Reading…' : 'Choose export.xml'}
                <input
                  type="file"
                  accept=".xml"
                  className="hidden"
                  onChange={(e) => void handleAppleFile(e)}
                  disabled={appleBusy}
                />
              </label>
            </div>
            {appleBusy && (
              <p className="mt-2 text-xs text-dusk-400">
                Parsing{appleProgress && appleProgress.totalBytes > 0 ? ` · ${Math.round((appleProgress.loadedBytes / appleProgress.totalBytes) * 100)}%` : '…'}
                {appleProgress ? ` · ${appleProgress.processedRecords} sleep records seen` : ''}
              </p>
            )}
            {appleError && <p className="mt-2 text-xs text-ember-300">{appleError}</p>}
            {appleAdded != null && (
              <p className="mt-2 text-xs text-aurora-300">Added {appleAdded} night{appleAdded === 1 ? '' : 's'} from Apple Health.</p>
            )}
            {appleReview && (
              <ImportSummary
                review={appleReview}
                busy={appleAdding}
                onAdd={() => void addImportedNights('apple')}
                onDiscard={() => setAppleReview(null)}
              />
            )}
          </div>

          <div className="rounded-xl border border-night-600/50 bg-night-700/30 p-4">
            <h3 className="font-display text-base text-dusk-100">Fitbit</h3>
            <p className="mt-1 text-xs text-dusk-400">
              Google Takeout → Fitbit → <span className="text-dusk-300">Sleep</span> → download, then choose the{' '}
              <span className="text-dusk-300">.json</span> or <span className="text-dusk-300">.csv</span> files (multiple OK).
            </p>
            <div className="mt-3">
              <label className="btn-secondary cursor-pointer text-sm">
                {fitbitBusy ? 'Reading…' : 'Choose file(s)'}
                <input
                  type="file"
                  accept=".json,.csv"
                  multiple
                  className="hidden"
                  onChange={(e) => void handleFitbitFiles(e)}
                  disabled={fitbitBusy}
                />
              </label>
            </div>
            {fitbitBusy && <p className="mt-2 text-xs text-dusk-400">Reading files…</p>}
            {fitbitError && <p className="mt-2 text-xs text-ember-300">{fitbitError}</p>}
            {fitbitAdded != null && (
              <p className="mt-2 text-xs text-aurora-300">Added {fitbitAdded} night{fitbitAdded === 1 ? '' : 's'} from Fitbit.</p>
            )}
            {fitbitReview && (
              <ImportSummary
                review={fitbitReview}
                busy={fitbitAdding}
                onAdd={() => void addImportedNights('fitbit')}
                onDiscard={() => setFitbitReview(null)}
              />
            )}
          </div>
        </div>
        <p className="mt-4 text-xs text-dusk-400">
          DreamCatcher can't live-sync with Fitbit, Oura, or Apple Health from a static site — there's no server to hold
          API tokens. File import keeps things private and local: your export is parsed in this browser and never leaves it.
        </p>
      </section>

      <section ref={formSectionRef} className="reveal card p-5">
        <button
          type="button"
          onClick={() => setManualOpen((v) => !v)}
          className="flex w-full cursor-pointer items-center justify-between text-left"
          aria-expanded={manualOpen}
        >
          <span className="font-display text-base text-dusk-100">
            {editingId ? `Editing the night of ${form.date}` : 'Log a night by hand'}
          </span>
          <span className="text-sm text-dusk-400">{manualOpen ? '− close' : '+ expand'}</span>
        </button>
        {manualOpen && (
          <div className="mt-4">
            <div className="rule mb-4" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="label" htmlFor="sl-date">Night of</label>
                <input id="sl-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="sl-bed">Bed time</label>
                <input
                  id="sl-bed"
                  type="time"
                  value={form.bedTime ?? ''}
                  onChange={(e) => updateBedWake({ bedTime: e.target.value || undefined })}
                  className="input"
                  style={{ colorScheme: 'dark' }}
                />
              </div>
              <div>
                <label className="label" htmlFor="sl-wake">Wake time</label>
                <input
                  id="sl-wake"
                  type="time"
                  value={form.wakeTime ?? ''}
                  onChange={(e) => updateBedWake({ wakeTime: e.target.value || undefined })}
                  className="input"
                  style={{ colorScheme: 'dark' }}
                />
              </div>
              <div>
                <label className="label" htmlFor="sl-dur">Hours slept: {form.durationH}</label>
                <input id="sl-dur" type="range" min={3} max={12} step={0.5} value={form.durationH} onChange={(e) => setForm({ ...form, durationH: Number(e.target.value) })} className="w-full accent-dusk-400" />
                {form.bedTime && form.wakeTime && (
                  <p className="mt-1 text-xs text-dusk-400">Auto-filled from bed/wake times — drag to override.</p>
                )}
              </div>
              <div>
                <label className="label" htmlFor="sl-q">Sleep quality: {form.quality}/5</label>
                <input id="sl-q" type="range" min={1} max={5} value={form.quality} onChange={(e) => setForm({ ...form, quality: Number(e.target.value) })} className="w-full accent-dusk-400" />
              </div>
              <div>
                <label className="label" htmlFor="sl-stress">Stress yesterday: {form.stress}/5</label>
                <input id="sl-stress" type="range" min={1} max={5} value={form.stress} onChange={(e) => setForm({ ...form, stress: Number(e.target.value) })} className="w-full accent-dusk-400" />
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-3">
                {([
                  ['caffeine', '☕ Caffeine after noon'],
                  ['alcohol', '🍷 Alcohol'],
                  ['exercise', '🏃 Exercised'],
                  ['screenLate', '📱 Screens in bed'],
                ] as const).map(([key, label]) => {
                  const active = form[key]
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setForm({ ...form, [key]: !active })}
                      aria-pressed={active}
                      className={`chip cursor-pointer transition-colors ${active ? 'border-dusk-400/70 bg-dusk-400/15 text-dusk-100' : ''}`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button onClick={() => void save()} className="btn-primary">
                {saved ? '✓ Saved' : editingId ? 'Update night' : 'Save night'}
              </button>
              {editingId && (
                <button type="button" onClick={cancelEdit} className="btn-ghost">
                  Cancel edit
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {top && top.n >= 3 ? (
        <section className="reveal card p-5">
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
        <section className="reveal card p-5 text-sm text-dusk-300">
          Correlations appear after ~3 nights that have <em>both</em> a sleep log and an analyzed dream. Log tonight, dream, record, repeat.
        </section>
      )}

      {logs.length > 0 && (
        <section className="reveal card p-5">
          <h3 className="font-display text-lg text-dusk-100">Logged nights</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-dusk-400">
                  <th className="py-1.5 pr-4">Night</th>
                  <th className="py-1.5 pr-4">Hours</th>
                  <th className="py-1.5 pr-4">Quality</th>
                  <th className="py-1.5 pr-4">Stress</th>
                  <th className="py-1.5 pr-4">Notes</th>
                  <th className="py-1.5"></th>
                </tr>
              </thead>
              <tbody className="text-dusk-200">
                {logs.slice(0, 30).map((l) => (
                  <tr key={l.id} className="border-t border-night-600/50">
                    <td className="py-1.5 pr-4 tabular-nums">{l.date}</td>
                    <td className="py-1.5 pr-4 tabular-nums">{l.durationH}h</td>
                    <td className="py-1.5 pr-4 tabular-nums">{l.quality}/5</td>
                    <td className="py-1.5 pr-4 tabular-nums">{l.stress}/5</td>
                    <td className="py-1.5 pr-4">
                      <span className="flex flex-wrap items-center gap-1.5">
                        {l.caffeine && <span title="Caffeine after noon">☕</span>}
                        {l.alcohol && <span title="Alcohol">🍷</span>}
                        {l.exercise && <span title="Exercised">🏃</span>}
                        {l.screenLate && <span title="Screens in bed">📱</span>}
                        {l.notes && <span className="chip">{l.notes}</span>}
                      </span>
                    </td>
                    <td className="py-1.5 text-right">
                      <button onClick={() => void remove(l.id)} className="cursor-pointer text-xs text-dusk-400 hover:text-ember-300" aria-label={`Delete log for ${l.date}`}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

function ImportSummary({
  review,
  busy,
  onAdd,
  onDiscard,
}: {
  review: HealthImportParseResult
  busy: boolean
  onAdd: () => void
  onDiscard: () => void
}) {
  const { nights, duplicateDates, invalidRows } = review
  const newest = nights[0]?.date
  const oldest = nights.at(-1)?.date

  return (
    <div className="mt-3 rounded-lg border border-night-600/50 bg-night-800/60 p-3 text-sm">
      <p className="text-dusk-100">
        <strong>{nights.length}</strong> night{nights.length === 1 ? '' : 's'} found
        {duplicateDates > 0 && <span className="text-dusk-300"> · {duplicateDates} duplicate{duplicateDates === 1 ? '' : 's'} in file</span>}
        {invalidRows > 0 && <span className="text-dusk-300"> · {invalidRows} invalid row{invalidRows === 1 ? '' : 's'}</span>}
      </p>
      {oldest && newest && <p className="mt-0.5 text-xs text-dusk-400">{oldest} → {newest}</p>}
      {nights.length > 0 ? (
        <div className="mt-2 flex gap-2">
          <button onClick={onAdd} disabled={busy} className="btn-primary px-3 py-1.5 text-xs">
            {busy ? 'Adding…' : `Add ${nights.length} night${nights.length === 1 ? '' : 's'}`}
          </button>
          <button onClick={onDiscard} className="btn-ghost px-3 py-1.5 text-xs">Discard</button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-ember-300">No sleep nights recognized in this file.</p>
      )}
    </div>
  )
}
