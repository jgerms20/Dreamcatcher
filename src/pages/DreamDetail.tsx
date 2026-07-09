import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useDreams } from '../store/dreams'
import { blobsDB } from '../db'
import { analyzeDream, hasClaudeKey } from '../services/claude'
import RubricRadar from '../components/RubricRadar'
import InterviewPanel from '../components/InterviewPanel'
import InterpretationPanel from '../components/InterpretationPanel'
import DreamStudio from '../components/DreamStudio'
import { MOOD_META, fmtDate } from '../components/DreamCard'

function useBlobUrl(id?: string): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    if (id) {
      void blobsDB.get(id).then((stored) => {
        if (stored && !cancelled) {
          objectUrl = URL.createObjectURL(stored.blob)
          setUrl(objectUrl)
        }
      })
    } else {
      setUrl(null)
    }
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [id])
  return url
}

export default function DreamDetail() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const loaded = useDreams((s) => s.loaded)
  const dream = useDreams((s) => s.dreams.find((d) => d.id === id))
  const update = useDreams((s) => s.update)
  const remove = useDreams((s) => s.remove)
  const [editingText, setEditingText] = useState(false)
  const [draft, setDraft] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tagInput, setTagInput] = useState('')
  const audioUrl = useBlobUrl(dream?.audioId)
  const videoBlobUrl = useBlobUrl(dream?.videoId)
  const ai = hasClaudeKey()
  const fresh = params.get('fresh') === '1'

  if (!loaded) return <p className="py-10 text-center text-dusk-300">Loading…</p>
  if (!dream) {
    return (
      <div className="py-10 text-center">
        <p className="text-dusk-300">This dream has faded (not found).</p>
        <Link to="/" className="btn-secondary mt-4">← Back to journal</Link>
      </div>
    )
  }

  const videoSrc = videoBlobUrl ?? dream.videoUrl ?? null
  const mood = dream.mood != null ? MOOD_META[dream.mood] : undefined

  async function analyze() {
    if (!dream) return
    setError(null)
    setAnalyzing(true)
    try {
      const a = await analyzeDream(dream)
      await update(dream.id, {
        rubric: a.rubric,
        symbols: [...new Set([...dream.symbols, ...a.symbols.map((s) => s.toLowerCase())])],
        emotions: [...new Set([...dream.emotions, ...a.emotions.map((s) => s.toLowerCase())])],
        mood: a.mood,
        vividness: a.vividness,
        ...(dream.title ? {} : { title: a.suggestedTitle }),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed.')
    } finally {
      setAnalyzing(false)
    }
  }

  async function addTag() {
    const t = tagInput.trim().toLowerCase().replace(/^#/, '')
    if (!t || !dream) return
    await update(dream.id, { tags: [...new Set([...dream.tags, t])] })
    setTagInput('')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Link to="/" className="text-sm text-dusk-300 hover:text-dusk-100">← Journal</Link>
          <button
            onClick={() => {
              if (confirm('Delete this dream and its media? This cannot be undone.')) {
                void remove(dream.id).then(() => navigate('/'))
              }
            }}
            className="btn-ghost text-xs text-ember-300"
          >
            Delete
          </button>
        </div>
        <input
          value={dream.title}
          onChange={(e) => void update(dream.id, { title: e.target.value })}
          placeholder="Untitled dream — click to name it"
          className="font-display w-full bg-transparent text-3xl text-dusk-100 placeholder-dusk-400/40 focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-2 text-sm text-dusk-300">
          <span>{fmtDate(dream.dreamDate)}</span>
          {mood && <span className="chip">{mood.emoji} {mood.label}</span>}
          {dream.vividness != null && <span className="chip">vividness {dream.vividness}/5</span>}
          {dream.lucid && <span className="chip">👁️ lucid</span>}
          {dream.recurring && <span className="chip">🔁 recurring</span>}
        </div>
      </header>

      {fresh && !dream.rubric && (
        <div className="card border-dusk-400/40 p-4 text-sm text-dusk-200">
          🌙 Dream caught. Now — while it's still warm — deepen the recall below{ai ? '' : ' with the interview'}, then interpret and visualize it.
        </div>
      )}

      {/* Dream reel */}
      <section className="card overflow-hidden">
        {videoSrc ? (
          <video src={videoSrc} controls loop className="aspect-video w-full bg-night-950 object-contain" />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-night-800 via-night-700 to-night-600">
            <p className="max-w-xs text-center text-sm text-dusk-300">
              🎬 No dream reel yet — use the Dream Studio below to turn this dream into a short video.
            </p>
          </div>
        )}
        {audioUrl && (
          <div className="border-t border-night-600/60 p-3">
            <p className="label">Original recording</p>
            <audio src={audioUrl} controls className="w-full" />
          </div>
        )}
      </section>

      {/* Narrative */}
      <section className="card p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl text-dusk-100">The dream</h3>
          {editingText ? (
            <div className="flex gap-2">
              <button onClick={() => { void update(dream.id, { transcript: draft }); setEditingText(false) }} className="btn-primary text-xs">Save</button>
              <button onClick={() => setEditingText(false)} className="btn-ghost text-xs">Cancel</button>
            </div>
          ) : (
            <button onClick={() => { setDraft(dream.transcript); setEditingText(true) }} className="btn-ghost text-xs">✏️ Edit</button>
          )}
        </div>
        {editingText ? (
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={8} className="input mt-3 resize-y" />
        ) : (
          <p className="mt-3 whitespace-pre-wrap leading-relaxed text-dusk-200">{dream.transcript}</p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {dream.emotions.map((e) => <span key={e} className="chip">{e}</span>)}
          {dream.tags.map((t) => (
            <button key={t} className="chip text-aurora-300" title="Remove tag" onClick={() => void update(dream.id, { tags: dream.tags.filter((x) => x !== t) })}>
              #{t} ×
            </button>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void addTag() }}
            placeholder="+ tag"
            className="w-20 rounded-full border border-dashed border-night-500 bg-transparent px-2.5 py-0.5 text-xs text-dusk-200 focus:outline-none focus:border-dusk-400"
          />
        </div>
      </section>

      {/* Recall */}
      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-xl text-dusk-100">Deepen the recall</h3>
          {ai && (
            <button onClick={() => void analyze()} disabled={analyzing} className="btn-secondary text-xs">
              {analyzing ? 'Scoring…' : dream.rubric ? '↻ Re-score recall ✨' : 'Score my recall ✨'}
            </button>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-ember-300">{error}</p>}
        {dream.rubric && (
          <div className="mt-3 grid items-center gap-4 md:grid-cols-2">
            <RubricRadar rubric={dream.rubric} />
            <div>
              <p className="font-display text-4xl text-dusk-100">
                {dream.rubric.overall}<span className="text-lg text-dusk-300">/100</span>
              </p>
              <p className="text-xs uppercase tracking-wider text-dusk-300">recall score</p>
              <p className="mt-3 text-sm leading-relaxed text-dusk-200">{dream.rubric.summary}</p>
            </div>
          </div>
        )}
        <div className="mt-4">
          <InterviewPanel dream={dream} />
        </div>
      </section>

      {/* Interpretation */}
      <section className="card p-5">
        <h3 className="font-display text-xl text-dusk-100">Interpretation</h3>
        <p className="mt-1 mb-4 text-xs text-dusk-400">
          Four traditions, four readings — each explains where its ideas come from. Treat them as mirrors to try, not verdicts.
        </p>
        <InterpretationPanel dream={dream} />
      </section>

      {/* Dream Studio */}
      <section className="card p-5">
        <h3 className="font-display text-xl text-dusk-100">Dream Studio</h3>
        <p className="mt-1 mb-4 text-xs text-dusk-400">
          Replay the dream as a short film: Claude directs a cinematic prompt from everything above, fal.ai renders it.
        </p>
        <DreamStudio dream={dream} />
      </section>
    </div>
  )
}
