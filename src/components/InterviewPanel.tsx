import { useEffect, useRef, useState } from 'react'
import { useDreams } from '../store/dreams'
import { nextStaticQuestion } from '../data/questionBank'
import { nextQuestion, analyzeDream, hasClaudeKey } from '../services/claude'
import { RUBRIC_DIMENSIONS } from '../data/rubric'
import type { Dream } from '../types'

// Adaptive recall interview: AI-driven when a Claude key exists, question-bank otherwise.
// Chat-thread feel: once opened, each answer immediately surfaces the next question until
// the dreamer says they're done, at which point recall gets silently re-scored.
export default function InterviewPanel({
  dream,
  autoStart = false,
}: {
  dream: Dream
  autoStart?: boolean
}) {
  const update = useDreams((s) => s.update)
  const [threadOpen, setThreadOpen] = useState(false)
  const [current, setCurrent] = useState<{ question: string; dimension: string } | null>(null)
  const [answer, setAnswer] = useState('')
  const [thinking, setThinking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [rescoring, setRescoring] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoStarted = useRef(false)
  const ai = hasClaudeKey()

  async function fetchNext(forDream: Dream) {
    setError(null)
    setThinking(true)
    try {
      const q = ai ? await nextQuestion(forDream) : nextStaticQuestion(forDream)
      setCurrent(q)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not get a question.')
    } finally {
      setThinking(false)
    }
  }

  function openThread() {
    setThreadOpen(true)
    void fetchNext(dream)
  }

  useEffect(() => {
    if (!autoStart || autoStarted.current) return
    autoStarted.current = true
    setThreadOpen(true)
    void fetchNext(dream)
    // Intentionally once on mount when fresh — dream identity is stable for this visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart])

  async function submit() {
    if (!current || !answer.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const interview = [...dream.interview, { ...current, answer: answer.trim(), askedByAI: ai }]
      const updated = await update(dream.id, { interview })
      setAnswer('')
      setCurrent(null)
      setSubmitting(false)
      if (updated) void fetchNext(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your answer.')
      setSubmitting(false)
    }
  }

  async function finish() {
    setThreadOpen(false)
    setCurrent(null)
    setAnswer('')
    setError(null)
    if (!ai) return
    setRescoring(true)
    try {
      const analysis = await analyzeDream(dream)
      await update(dream.id, {
        rubric: analysis.rubric,
        symbols: mergeUnique(dream.symbols, analysis.symbols),
        emotions: mergeUnique(dream.emotions, analysis.emotions),
        mood: analysis.mood,
        vividness: analysis.vividness,
      })
    } catch {
      // scoring is best-effort; the transcript is already saved
    } finally {
      setRescoring(false)
    }
  }

  const dimName = (id?: string) => RUBRIC_DIMENSIONS.find((d) => d.id === id)?.name

  return (
    <div className="space-y-4">
      {dream.interview.length > 0 && (
        <div className="space-y-3">
          {dream.interview.map((t, i) => (
            <div key={i} className="space-y-1.5">
              <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-night-700/50 px-3.5 py-2">
                <p className="text-[10px] uppercase tracking-wider text-dusk-400">Coach</p>
                <p className="mt-0.5 text-sm text-dusk-300">
                  {t.question}
                  {t.dimension && <span className="ml-2 text-xs text-dusk-400">({dimName(t.dimension)})</span>}
                </p>
              </div>
              <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-dusk-400/10 px-3.5 py-2">
                <p className="text-[10px] uppercase tracking-wider text-dusk-400 text-right">You</p>
                <p className="mt-0.5 text-sm leading-relaxed text-dusk-100">{t.answer}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {threadOpen && current && (
        <div className="rounded-xl border border-dusk-400/40 bg-night-700/60 p-4">
          <p className="text-[10px] uppercase tracking-wider text-dusk-400">Coach</p>
          <p className="mt-1 text-sm text-dusk-100">{current.question}</p>
          {current.dimension && (
            <p className="mt-1 text-xs text-dusk-400">deepening: {dimName(current.dimension)}</p>
          )}
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={5}
            autoFocus
            placeholder="Whatever surfaces — even 'I don't remember' teaches you what faded first."
            className="input mt-3 min-h-[8rem] resize-y sm:min-h-[6rem]"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={() => void submit()} disabled={submitting || !answer.trim()} className="btn-primary">
              {submitting ? 'Saving…' : 'Remembered this'}
            </button>
            <span className="text-xs text-dusk-400">saved to your dream</span>
          </div>
        </div>
      )}

      {threadOpen && thinking && (
        <p className="shimmer-text text-sm">thinking of what to ask next…</p>
      )}

      {threadOpen && !current && !thinking && error && (
        <button onClick={() => void fetchNext(dream)} className="btn-secondary text-xs">
          Try another question
        </button>
      )}

      {threadOpen && (
        <button onClick={() => void finish()} className="btn-ghost text-xs text-dusk-300">
          that's all I remember
        </button>
      )}

      {!threadOpen && (
        <button onClick={openThread} className="btn-secondary w-full">
          {dream.interview.length ? 'Continue remembering' : 'Help me remember more'}
        </button>
      )}

      {rescoring && <p className="shimmer-text text-xs">updating recall score…</p>}

      {!ai && (
        <p className="text-xs text-dusk-400">
          Using the built-in question bank. Add an Anthropic key in Settings for adaptive questions that follow your dream's specific images.
        </p>
      )}
      {error && <p className="text-sm text-ember-300">{error}</p>}
    </div>
  )
}

function mergeUnique(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b.map((s) => s.toLowerCase())])]
}
