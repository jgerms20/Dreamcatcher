import { useMemo, useRef, useState, type ReactNode } from 'react'
import { ScatterChart, pearson } from '../components/charts'
import Icon, { type IconName } from '../components/Icon'
import {
  parseAppleHealthSleepFile,
  parseFitbitSleepFiles,
  toSleepLogInput,
  type HealthImportParseResult,
  type HealthImportSource,
} from '../services/healthImport'
import { useDreams } from '../store/dreams'
import { useSleep } from '../store/sleep'
import { lastNightISO, type SleepLog } from '../types'

const HABITS: { key: 'caffeine' | 'alcohol' | 'exercise' | 'screenLate'; label: string; icon: IconName }[] = [
  { key: 'caffeine', label: 'Caffeine after noon', icon: 'cup' },
  { key: 'alcohol', label: 'Alcohol', icon: 'wine' },
  { key: 'exercise', label: 'Exercised', icon: 'activity' },
  { key: 'screenLate', label: 'Screens in bed', icon: 'phone' },
]

type ImportState = 'idle' | 'working' | 'success' | 'error'
type MetricKind = 'duration' | 'quality' | 'stress'
type Tone = 'good' | 'mid' | 'poor'

interface ImportStatus {
  state: ImportState
  message: string
  source?: HealthImportSource
  progress?: number
}

const TONE_CLASSES: Record<Tone, string> = {
  good: 'border-aurora-300/45 bg-aurora-300/10 text-aurora-300',
  mid: 'border-amber-300/45 bg-amber-300/10 text-amber-300',
  poor: 'border-rose-300/45 bg-rose-300/10 text-rose-300',
}

const BAR_CLASSES: Record<Tone, string> = {
  good: 'bg-aurora-300',
  mid: 'bg-amber-300',
  poor: 'bg-rose-300',
}

export default function Sleep() {
  const { logs, upsert, remove } = useSleep()
  const dreams = useDreams((s) => s.dreams)
  const appleInputRef = useRef<HTMLInputElement>(null)
  const fitbitInputRef = useRef<HTMLInputElement>(null)
  const [importStatus, setImportStatus] = useState<ImportStatus>({ state: 'idle', message: '' })
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

  async function importParsedNights(source: HealthImportSource, result: HealthImportParseResult) {
    if (result.nights.length === 0) {
      setImportStatus({
        state: 'error',
        source,
        message: `No sleep nights were found in that ${sourceLabel(source)} export.`,
      })
      return
    }

    for (const night of result.nights) {
      await upsert(toSleepLogInput(night, source))
    }

    setImportStatus({
      state: 'success',
      source,
      message: importSummary(result),
      progress: 100,
    })
  }

  async function handleAppleFile(file: File | null) {
    if (!file) return

    setImportStatus({ state: 'working', source: 'apple', message: 'Reading Apple Health export.xml...', progress: 0 })

    try {
      const result = await parseAppleHealthSleepFile(file, (progress) => {
        const percent = progress.totalBytes > 0 ? Math.min(100, Math.round((progress.loadedBytes / progress.totalBytes) * 100)) : undefined
        setImportStatus({
          state: 'working',
          source: 'apple',
          progress: percent,
          message: `Scanning export.xml (${progress.processedRecords.toLocaleString()} sleep records found)...`,
        })
      })
      await importParsedNights('apple', result)
    } catch (error) {
      setImportStatus({ state: 'error', source: 'apple', message: errorMessage(error) })
    }
  }

  async function handleFitbitFiles(files: File[]) {
    if (files.length === 0) return

    setImportStatus({ state: 'working', source: 'fitbit', message: 'Reading Fitbit sleep JSON/CSV files...' })

    try {
      const result = await parseFitbitSleepFiles(files)
      await importParsedNights('fitbit', result)
    } catch (error) {
      setImportStatus({ state: 'error', source: 'fitbit', message: errorMessage(error) })
    }
  }

  return (
    <div className="reveal-stack space-y-6">
      <header>
        <h2 className="page-title">Sleep & Vitals</h2>
        <p className="page-subtitle">
          Import sleep nights from your health platform, then compare duration, quality, and stress against dream recall, vividness, and mood.
        </p>
      </header>

      <section className="card p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="font-display text-xl font-semibold text-ivory-100">Import your sleep data</h3>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ivory-300">
              File imports stay in this browser and map each night into the existing sleep log.
            </p>
          </div>
          <span className="chip w-fit">
            <Icon name="database" size={14} />
            One log per night
          </span>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <ImportCard
            icon="heart"
            title="Apple Health"
            action="Choose export.xml"
            onClick={() => appleInputRef.current?.click()}
            disabled={importStatus.state === 'working'}
          >
            In the Health app, use Export All Health Data, unzip the archive, then select the <strong>export.xml</strong> file. The importer reads Sleep Analysis asleep stages and totals each night.
          </ImportCard>

          <ImportCard
            icon="watch"
            title="Fitbit"
            action="Choose JSON or CSV"
            onClick={() => fitbitInputRef.current?.click()}
            disabled={importStatus.state === 'working'}
          >
            Export your Fitbit data from Google Takeout or fitbit.com settings, then select sleep JSON or CSV files with <strong>dateOfSleep</strong> and <strong>minutesAsleep</strong>.
          </ImportCard>
        </div>

        <input
          ref={appleInputRef}
          type="file"
          accept=".xml,text/xml,application/xml"
          className="sr-only"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0] ?? null
            e.currentTarget.value = ''
            void handleAppleFile(file)
          }}
        />
        <input
          ref={fitbitInputRef}
          type="file"
          multiple
          accept=".json,.csv,application/json,text/csv"
          className="sr-only"
          onChange={(e) => {
            const files = Array.from(e.currentTarget.files ?? [])
            e.currentTarget.value = ''
            void handleFitbitFiles(files)
          }}
        />

        {importStatus.state !== 'idle' && (
          <div className={`inset-panel mt-4 flex items-start gap-3 p-3 text-sm ${statusClass(importStatus.state)}`}>
            <Icon name={importStatus.state === 'success' ? 'check' : importStatus.state === 'error' ? 'x' : 'upload'} size={18} className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <p>{importStatus.message}</p>
              {importStatus.state === 'working' && importStatus.progress != null && (
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-700">
                  <div className="h-full rounded-full bg-aurora-300" style={{ width: `${importStatus.progress}%` }} />
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <details className="card p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-ivory-100 marker:hidden">
          <span className="inline-flex items-center gap-2 font-display text-lg font-semibold">
            <Icon name="pen" size={18} className="text-amber-300" />
            Log a night manually
          </span>
          <span className="chip">Fallback</span>
        </summary>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label" htmlFor="sl-date">Night of</label>
            <input id="sl-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="sl-dur">Hours slept: {form.durationH}</label>
            <input id="sl-dur" type="range" min={3} max={12} step={0.5} value={form.durationH} onChange={(e) => setForm({ ...form, durationH: Number(e.target.value) })} className="range-input" />
          </div>
          <div>
            <label className="label" htmlFor="sl-q">Sleep quality: {form.quality}/5</label>
            <input id="sl-q" type="range" min={1} max={5} value={form.quality} onChange={(e) => setForm({ ...form, quality: Number(e.target.value) })} className="range-input" />
          </div>
          <div>
            <label className="label" htmlFor="sl-stress">Stress yesterday: {form.stress}/5</label>
            <input id="sl-stress" type="range" min={1} max={5} value={form.stress} onChange={(e) => setForm({ ...form, stress: Number(e.target.value) })} className="range-input" />
          </div>
          <div className="flex flex-wrap items-end gap-3 text-sm text-ivory-200 sm:col-span-2">
            {HABITS.map(({ key, label, icon }) => (
              <label key={key} className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                  className="accent-aurora-300"
                />
                <Icon name={icon} size={15} />
                {label}
              </label>
            ))}
          </div>
        </div>
        <button onClick={() => void save()} className="btn-primary mt-4">
          {saved ? (
            <>
              <Icon name="check" size={16} /> Saved
            </>
          ) : (
            'Save night'
          )}
        </button>
      </details>

      {top && top.n >= 3 ? (
        <section className="card p-5">
          <h3 className="font-display text-lg font-semibold text-ivory-100">Strongest correlation so far</h3>
          <p className="mt-1 text-sm text-ivory-200">
            <strong className="text-ivory-100">{top.factor}</strong> ↔ <strong className="text-ivory-100">{top.metric}</strong>{' '}
            <span className="chip ml-1">r = {top.r.toFixed(2)} · {top.n} nights</span>
          </p>
          <CorrelationMetricSummary factor={top.factor} values={top.xs} />
          <p className="mt-1 text-xs text-ivory-400">
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
                  <tr className="text-xs font-semibold uppercase text-ivory-400">
                    <th className="py-1 pr-4">Sleep factor</th>
                    <th className="py-1 pr-4">Dream metric</th>
                    <th className="py-1 pr-4">r</th>
                    <th className="py-1">nights</th>
                  </tr>
                </thead>
                <tbody className="text-ivory-200">
                  {correlations.map((c, i) => (
                    <tr key={i} className="border-t border-ivory-100/10">
                      <td className="py-2 pr-4">
                        <CorrelationFactor factor={c.factor} values={c.xs} />
                      </td>
                      <td className="py-2 pr-4">{c.metric}</td>
                      <td className={`py-2 pr-4 tabular-nums ${Math.abs(c.r) >= 0.5 ? 'text-aurora-300' : ''}`}>{c.r.toFixed(2)}</td>
                      <td className="py-2 tabular-nums">{c.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="card flex items-start gap-3 p-5 text-sm text-ivory-300">
          <Icon name="chart" size={18} className="mt-0.5 text-aurora-300" />
          <span>Correlations appear after ~3 nights that have <em>both</em> a sleep log and an analyzed dream. Import sleep, dream, record, repeat.</span>
        </section>
      )}

      {logs.length > 0 && (
        <section className="card p-5">
          <h3 className="font-display text-lg font-semibold text-ivory-100">Logged nights</h3>
          <div className="mt-3 space-y-2 text-sm">
            {logs.slice(0, 14).map((l) => (
              <div key={l.id} className="inset-panel flex flex-col gap-3 px-3 py-3 text-ivory-200 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ivory-100">{l.date}</span>
                    <MetricChip kind="duration" label="Duration" value={l.durationH} />
                    <MetricChip kind="quality" label="Quality" value={l.quality} />
                    <MetricChip kind="stress" label="Stress" value={l.stress} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <MetricBar kind="duration" value={l.durationH} />
                    <MetricBar kind="quality" value={l.quality} />
                    <MetricBar kind="stress" value={l.stress} />
                  </div>
                  <p className="text-xs text-ivory-400">
                    {[
                      l.caffeine ? 'caffeine' : '',
                      l.alcohol ? 'alcohol' : '',
                      l.exercise ? 'exercise' : '',
                      l.screenLate ? 'screens' : '',
                    ].filter(Boolean).join(', ') || 'No habit flags'}
                  </p>
                </div>
                <button onClick={() => void remove(l.id)} className="self-end text-ivory-400 hover:text-amber-300 sm:self-auto" aria-label={`Delete log for ${l.date}`}>
                  <Icon name="x" size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function ImportCard({ icon, title, action, disabled, onClick, children }: {
  icon: IconName
  title: string
  action: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <div className="inset-panel flex h-full flex-col justify-between gap-4 p-4">
      <div className="flex items-start gap-3">
        <span className="icon-mark h-10 w-10">
          <Icon name={icon} size={20} />
        </span>
        <div>
          <h4 className="font-display text-lg font-semibold text-ivory-100">{title}</h4>
          <p className="mt-1 text-sm leading-relaxed text-ivory-300">{children}</p>
        </div>
      </div>
      <button type="button" onClick={onClick} disabled={disabled} className="btn-secondary w-fit">
        <Icon name="upload" size={16} />
        {action}
      </button>
    </div>
  )
}

function CorrelationMetricSummary({ factor, values }: { factor: string; values: number[] }) {
  const kind = metricKindForFactor(factor)
  if (!kind) return null
  const value = average(values)

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <MetricChip kind={kind} label={`Average ${metricLabel(kind)}`} value={value} />
      <MetricBar kind={kind} value={value} wide />
    </div>
  )
}

function CorrelationFactor({ factor, values }: { factor: string; values: number[] }) {
  const kind = metricKindForFactor(factor)
  if (!kind) return <span>{factor}</span>
  const value = average(values)

  return (
    <div className="flex min-w-48 flex-col gap-1">
      <MetricChip kind={kind} label={metricLabel(kind)} value={value} />
      <MetricBar kind={kind} value={value} />
    </div>
  )
}

function MetricChip({ kind, label, value }: { kind: MetricKind; label: string; value: number }) {
  const tone = metricTone(kind, value)
  return (
    <span className={`chip ${TONE_CLASSES[tone]}`}>
      {label}
      <strong className="font-semibold tabular-nums">{metricValue(kind, value)}</strong>
    </span>
  )
}

function MetricBar({ kind, value, wide = false }: { kind: MetricKind; value: number; wide?: boolean }) {
  const tone = metricTone(kind, value)
  const width = clamp((value / metricMax(kind)) * 100, 6, 100)
  return (
    <span className={`h-1.5 overflow-hidden rounded-full bg-ink-700 ${wide ? 'w-44' : 'w-24'}`} aria-hidden="true">
      <span className={`block h-full rounded-full ${BAR_CLASSES[tone]}`} style={{ width: `${width}%` }} />
    </span>
  )
}

function metricKindForFactor(factor: string): MetricKind | null {
  if (factor.startsWith('Sleep duration')) return 'duration'
  if (factor === 'Sleep quality') return 'quality'
  if (factor === 'Stress') return 'stress'
  return null
}

function metricLabel(kind: MetricKind): string {
  if (kind === 'duration') return 'Duration'
  if (kind === 'quality') return 'Quality'
  return 'Stress'
}

function metricTone(kind: MetricKind, value: number): Tone {
  if (kind === 'duration') {
    if (value >= 7 && value <= 9) return 'good'
    if (value >= 6 && value <= 10) return 'mid'
    return 'poor'
  }

  if (kind === 'quality') {
    if (value >= 4) return 'good'
    if (value >= 3) return 'mid'
    return 'poor'
  }

  if (value <= 2) return 'good'
  if (value <= 3) return 'mid'
  return 'poor'
}

function metricMax(kind: MetricKind): number {
  if (kind === 'duration') return 12
  return 5
}

function metricValue(kind: MetricKind, value: number): string {
  if (kind === 'duration') return `${compactNumber(value)}h`
  return `${compactNumber(value)}/5`
}

function compactNumber(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, '')
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function importSummary(result: HealthImportParseResult): string {
  const nights = result.nights.length
  const parts = [
    `Imported ${nights} ${nights === 1 ? 'night' : 'nights'}`,
    `skipped ${result.duplicateDates} duplicate ${result.duplicateDates === 1 ? 'date' : 'dates'}`,
  ]
  if (result.invalidRows > 0) {
    parts.push(`ignored ${result.invalidRows} invalid ${result.invalidRows === 1 ? 'row' : 'rows'}`)
  }
  return `${parts.join(', ')}.`
}

function sourceLabel(source: HealthImportSource): string {
  return source === 'apple' ? 'Apple Health' : 'Fitbit'
}

function statusClass(state: ImportState): string {
  if (state === 'success') return 'border-aurora-300/30 text-aurora-300'
  if (state === 'error') return 'border-rose-300/30 text-rose-300'
  return 'border-amber-300/30 text-amber-300'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Import failed. Check the file and try again.'
}
