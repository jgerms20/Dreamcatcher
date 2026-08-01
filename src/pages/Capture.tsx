import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDreams } from '../store/dreams'
import { blobsDB } from '../db'
import { newId, lastNightISO } from '../types'
import { useDictation, dictationSupported } from '../services/speech'
import { useSettings } from '../store/settings'
import RecordButton from '../components/RecordButton'

/** Append a spoken/transcribed segment to existing text without clobbering it or double-spacing. */
function appendSpoken(base: string, addition: string): string {
  const clean = addition.trim()
  if (!clean) return base
  if (!base) return clean
  return /\s$/.test(base) ? base + clean : base + ' ' + clean
}

/** Append a tapped recall prompt as its own line, so it reads as a question to answer next. */
function appendPrompt(base: string, prompt: string): string {
  if (!base.trim()) return prompt + ' '
  return /\s$/.test(base) ? base + prompt + ' ' : base + '\n\n' + prompt + ' '
}

/**
 * A small local bank of recall prompts, each keyed to a regex of words that would
 * already indicate the topic is covered. Purely local + synchronous — no network,
 * no latency — so prompts can appear the instant there's something to react to.
 */
const RECALL_PROMPTS: { text: string; coveredBy: RegExp }[] = [
  { text: 'What was the light like?', coveredBy: /\b(light|dark|bright|dim|glow|shadow|sunlight|sunny|moon|night)\b/i },
  { text: 'Who else was there?', coveredBy: /\b(who|he|she|they|him|her|friend|family|mother|father|sister|brother|stranger|someone|people|man|woman)\b/i },
  { text: 'What did you feel in your body?', coveredBy: /\b(felt|feeling|scared|afraid|terrified|happy|sad|anxious|calm|heart|chest|breath|stomach|tight|heavy|nervous)\b/i },
  { text: 'How did it end?', coveredBy: /\b(woke|wake|ended|end|finally|suddenly|and then|last thing)\b/i },
  { text: 'Where were you, exactly?', coveredBy: /\b(house|room|school|street|water|ocean|forest|city|car|building|outside|inside|home|beach|mountain|hallway|stairs)\b/i },
  { text: 'What did you hear?', coveredBy: /\b(sound|heard|hear|noise|music|voice|silence|loud|quiet|whisper)\b/i },
]

function pickPrompts(text: string, max = 4): string[] {
  if (text.trim().length < 4) return []
  return RECALL_PROMPTS.filter((p) => !p.coveredBy.test(text)).slice(0, max).map((p) => p.text)
}

export default function Capture() {
  const navigate = useNavigate()
  // Read the settings directly rather than importing services/fal, which would
  // drag the fal SDK into the landing chunk and slow the cold open.
  const canTranscribe = useSettings(
    (s) => Boolean((s.falProxyUrl ?? '').trim() || (s.falKey ?? '').trim()),
  )
  const createDream = useDreams((s) => s.create)
  const [narrative, setNarrative] = useState('')
  const [dreamDate, setDreamDate] = useState(lastNightISO())
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mirrorRef = useRef<HTMLDivElement>(null)

  const dictation = useDictation({
    onFinalSegment: (segment) => setNarrative((prev) => appendSpoken(prev, segment)),
  })

  // Keep the textarea (and its ghost-text mirror) scrolled to the newest words while dictating.
  useEffect(() => {
    if (!dictation.recording) return
    if (textareaRef.current) textareaRef.current.scrollTop = textareaRef.current.scrollHeight
    if (mirrorRef.current) mirrorRef.current.scrollTop = mirrorRef.current.scrollHeight
  }, [narrative, dictation.interimText, dictation.recording])

  const prompts = useMemo(() => pickPrompts(narrative), [narrative])

  async function stopDictation() {
    const { audio } = await dictation.stop()
    if (audio) setAudioBlob(audio)
  }

  function addPrompt(prompt: string) {
    setNarrative((prev) => appendPrompt(prev, prompt))
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    })
  }

  async function handleFile(file: File) {
    setError(null)
    setAudioBlob(file)
    if (!canTranscribe) {
      setError('Audio attached — add a fal.ai key in Settings to auto-transcribe it, or type what you remember below.')
      return
    }
    try {
      setBusy('Transcribing audio…')
      const { transcribeAudio } = await import('../services/fal')
      const transcript = await transcribeAudio(file, setBusy)
      setNarrative((prev) => appendSpoken(prev, transcript))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transcription failed.')
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    if (!narrative.trim()) {
      setError('Describe at least a fragment of the dream first — even a single image counts.')
      return
    }
    setBusy('Saving…')
    let audioId: string | undefined
    if (audioBlob) {
      audioId = newId()
      await blobsDB.put({ id: audioId, kind: 'audio', mime: audioBlob.type || 'audio/webm', blob: audioBlob })
    }
    const dream = await createDream({ transcript: narrative.trim(), dreamDate, audioId })
    navigate(`/dream/${dream.id}?fresh=1`)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-6">
      <header className="reveal space-y-1.5 text-center sm:text-left">
        <h1 className="font-display text-3xl text-dusk-100 sm:text-4xl">
          Catch the <em>dream</em>
        </h1>
        <p className="text-sm text-dusk-300">Before it dissolves — a few words are enough.</p>
      </header>

      {/* HERO — record. The one thing this screen wants you to notice. */}
      <section className="reveal flex flex-col items-center gap-4 py-2">
        <RecordButton
          recording={dictation.recording}
          elapsedSeconds={dictation.elapsed}
          supported={dictationSupported()}
          onStart={() => void dictation.start()}
          onStop={() => void stopDictation()}
          disabled={Boolean(busy)}
        />
        <p className="max-w-xs text-center text-xs text-dusk-300/80">
          {dictation.recording
            ? 'Listening — your words are streaming in below.'
            : dictationSupported()
              ? 'Speak it out loud. Words land in the text as you talk.'
              : "Dictation isn't supported in this browser — type below instead."}
        </p>
        {dictation.error && <p className="text-sm text-ember-300">{dictation.error}</p>}
      </section>

      <div className="rule" />

      {/* SECONDARY — write. Always available, quieter than the hero. */}
      <section className="card reveal space-y-4 p-5 sm:p-6">
        <div>
          <label className="label" htmlFor="dream-text">Or write it down</label>
          <div className="relative">
            <textarea
              id="dream-text"
              ref={textareaRef}
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              readOnly={dictation.recording}
              rows={7}
              placeholder="I was standing in a house that was somehow also the ocean…"
              className={`input font-prose min-h-40 resize-y ${dictation.recording ? 'text-transparent' : ''}`}
              style={dictation.recording ? { caretColor: 'transparent' } : undefined}
            />
            {dictation.recording && (
              <div
                ref={mirrorRef}
                aria-hidden="true"
                className="input font-prose pointer-events-none absolute inset-0 min-h-40 overflow-y-auto whitespace-pre-wrap text-dusk-100"
              >
                {narrative}
                {narrative && dictation.interimText ? ' ' : ''}
                <span className="text-dusk-300/45">{dictation.interimText}</span>
              </div>
            )}
          </div>
        </div>

        {prompts.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {prompts.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => addPrompt(p)}
                className="chip cursor-pointer transition-colors hover:border-dusk-400/60 hover:text-dusk-100"
              >
                + {p}
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="reveal flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-[10rem]">
          <label className="label" htmlFor="dream-date">Night of</label>
          <input
            id="dream-date"
            type="date"
            value={dreamDate}
            onChange={(e) => setDreamDate(e.target.value)}
            className="input text-sm"
          />
        </div>
        <div className="flex items-center gap-3">
          {audioBlob && <span className="chip">voice recording attached</span>}
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,video/mp4"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleFile(f)
            }}
          />
          <button onClick={() => fileRef.current?.click()} className="btn-ghost text-xs">
            import a voice memo
          </button>
        </div>
      </div>

      {error && <p className="reveal text-sm text-ember-300">{error}</p>}
      {busy && <p className="reveal shimmer-text text-sm">{busy}</p>}

      <button
        onClick={() => void save()}
        disabled={Boolean(busy) || dictation.recording}
        className="btn-primary reveal w-full py-3 text-base"
      >
        Save dream →
      </button>
    </div>
  )
}
