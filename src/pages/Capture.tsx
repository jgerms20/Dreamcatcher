import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDreams } from '../store/dreams'
import { blobsDB } from '../db'
import { newId, lastNightISO } from '../types'
import { useDictation, dictationSupported } from '../services/speech'
import { useSettings } from '../store/settings'
import RecordButton from '../components/RecordButton'

/** Format seconds as m:ss for display. */
function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

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
  { text: 'What colors stand out?', coveredBy: /\b(color|colour|red|blue|green|yellow|gold|white|black|purple|orange|silver)\b/i },
  { text: 'What happened just before that?', coveredBy: /\b(before|earlier|started|began|first)\b/i },
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
  const [audioDuration, setAudioDuration] = useState<number | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mirrorRef = useRef<HTMLDivElement>(null)
  const transcriptSectionRef = useRef<HTMLElement>(null)

  const dictation = useDictation({
    onFinalSegment: (segment) => setNarrative((prev) => appendSpoken(prev, segment)),
  })

  // Keep the textarea (and its ghost-text mirror) scrolled to the newest words while dictating.
  useEffect(() => {
    if (!dictation.recording) return
    if (textareaRef.current) textareaRef.current.scrollTop = textareaRef.current.scrollHeight
    if (mirrorRef.current) mirrorRef.current.scrollTop = mirrorRef.current.scrollHeight
  }, [narrative, dictation.interimText, dictation.recording])

  // Keep the transcript card in view on the page as new words arrive (especially on iPhone).
  useEffect(() => {
    if (!dictation.recording) return
    transcriptSectionRef.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
  }, [narrative, dictation.interimText, dictation.recording])

  // Warn before leaving mid-recording (refresh / tab close).
  useEffect(() => {
    if (!dictation.recording) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dictation.recording])

  const audioPreviewUrl = useMemo(() => {
    if (!audioBlob) return null
    return URL.createObjectURL(audioBlob)
  }, [audioBlob])

  useEffect(() => {
    return () => {
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl)
    }
  }, [audioPreviewUrl])

  const prompts = useMemo(() => pickPrompts(narrative), [narrative])

  async function stopDictation() {
    const { audio, durationSeconds } = await dictation.stop()
    setAudioDuration(durationSeconds)
    if (audio) setAudioBlob(audio)
  }

  function discardRecording() {
    setAudioBlob(null)
    setAudioDuration(null)
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
    setAudioDuration(null)
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
        {isIos() && dictationSupported() && !dictation.recording && (
          <p className="max-w-xs text-center text-xs text-dusk-400/70">
            On iPhone, Safari works best for live transcription.
          </p>
        )}
        {dictation.error && <p className="text-sm text-ember-300">{dictation.error}</p>}
      </section>

      <div className="rule" />

      {/* SECONDARY — write. Always available, quieter than the hero. */}
      <section ref={transcriptSectionRef} className="card reveal space-y-4 p-5 sm:p-6">
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

      {audioBlob && !dictation.recording && (
        <div className="reveal flex items-center gap-3 rounded-xl border border-night-600/50 bg-night-800/80 px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <span className="chip shrink-0 tabular-nums">
              {audioDuration != null ? formatDuration(audioDuration) : 'Recording'}
            </span>
            {audioPreviewUrl && (
              <audio
                controls
                preload="metadata"
                src={audioPreviewUrl}
                className="h-8 max-w-full flex-1 opacity-90 accent-dusk-400"
              />
            )}
          </div>
          <button
            type="button"
            onClick={discardRecording}
            className="btn-ghost shrink-0 text-xs text-ember-300"
          >
            Discard
          </button>
        </div>
      )}

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

      {dictation.recording && (
        <div className="recording-stop-bar">
          <button
            type="button"
            onClick={() => void stopDictation()}
            aria-label="Stop recording"
            className="flex min-h-[3.25rem] w-full max-w-md items-center justify-center gap-2.5 rounded-2xl border border-rose-dream/50 bg-night-900/95 px-6 py-3.5 text-base font-medium text-dusk-100 shadow-lg backdrop-blur-sm transition-colors hover:border-rose-dream/70 active:scale-[0.98]"
          >
            <span className="inline-block h-3.5 w-3.5 rounded-sm bg-rose-dream" aria-hidden="true" />
            Stop recording
            <span className="tabular-nums text-dusk-300">{formatDuration(dictation.elapsed)}</span>
          </button>
        </div>
      )}
    </div>
  )
}
