import { useState } from 'react'
import { useDreams } from '../store/dreams'
import { nextStaticQuestion } from '../data/questionBank'
import { nextQuestion, analyzeDream, hasClaudeKey } from '../services/claude'
import { RUBRIC_DIMENSIONS } from '../data/rubric'
import type { Dream } from '../types'

// Adaptive recall interview: AI-driven when a Claude key exists, question-bank otherwise.
export default function InterviewPanel({ dream }: { dream: Dream }) {
  const update = useDreams((s) => s.update)
  const [current, setCurrent] = useState<{ question: string; dimension: string } | null>(null)
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ai = hasClaudeKey()

  async function ask() {
    setError(null)
    setBusy(true)
    try {
      const q = ai ? await nextQuestion(dream) : nextStaticQuestion(dream)
      setCurrent(q)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not get a question.')
    } finally {
      setBusy(false)
    }
  }

  async function submit() {
    if (!current || !answer.trim()) return
    setBusy(true)
    setError(null)
    try {
      const interview = [...dream.interview, { ...current, answer: answer.trim(), askedByAI: ai }]
      let updated = await update(dream.id, { interview })
      setAnswer('')
      setCurrent(null)
      // Re-score after every 1 answers when AI is available, silently in the background
      if (ai && updated) {
        try {
          const analysis = await analyzeDream(updated)
          updated = await update(dream.id, {
            rubric: analysis.rubric,
            symbols: mergeUnique(updated.symbols, analysis.symbols),
            emotions: mergeUnique(updated.emotions, analysis.emotions),
            mood: analysis.mood,
            vividness: analysis.vividness,
          })
        } catch {
          // scoring is best-effort; the answer is already saved
        }
      }
    } finally {
      setBusy(false)
    }
  }

  const dimName = (id?: string) => RUBRIC_DIMENSIONS.find((d) => d.id === id)?.name

  return (
    <div className="space-y-4">
      {dream.interview.length > 0 && (
        <div className="space-y-3">
          {dream.interview.map((t, i) => (
            <div key={i} className="rounded-xl bg-night-700/50 p-3">
              <p className="text-sm text-dusk-300">
                {t.askedByAI ? '✨' : '📋'} {t.question}
                {t.dimension && <span className="ml-2 text-xs text-dusk-400">({dimName(t.dimension)})</span>}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-dusk-100">{t.answer}</p>
            </div>
          ))}
        </div>
      )}

      {current ? (
        <div className="rounded-xl border border-dusk-400/40 bg-night-700/60 p-4">
          <p className="text-sm text-dusk-100">
            {ai ? '✨' : '📋'} {current.question}
          </p>
          {current.dimension && (
            <p className="mt-1 text-xs text-dusk-400">deepening: {dimName(current.dimension)}</p>
          )}
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Whatever surfaces — even 'I don't remember' teaches you what faded first."
            className="input mt-3 resize-y"
          />
          <div className="mt-2 flex gap-2">
            <button onClick={() => void submit()} disabled={busy || !answer.trim()} className="btn-primary">
              {busy ? 'Saving…' : 'Add to dream'}
            </button>
            <button onClick={() => setCurrent(null)} className="btn-ghost">Skip</button>
          </div>
        </div>
      ) : (
        <button onClick={() => void ask()} disabled={busy} className="btn-secondary w-full">
          {busy ? 'Thinking…' : dream.interview.length ? 'Ask me another question' : `Start the recall interview ${ai ? '✨' : ''}`}
        </button>
      )}
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
