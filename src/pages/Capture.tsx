import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDreams } from '../store/dreams'
import { blobsDB } from '../db'
import { newId, lastNightISO } from '../types'
import { useDictation, dictationSupported } from '../services/speech'
import { transcribeAudio, hasFalKey } from '../services/fal'

/** Append a spoken/transcribed segment to existing text without clobbering it or double-spacing. */
function appendSpoken(base: string, addition: string): string {
  const clean = addition.trim()
  if (!clean) return base
  if (!base) return clean
  return /\s$/.test(base) ? base + clean : base + ' ' + clean
}

export default function Capture() {
  const navigate = useNavigate()
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

  async function stopDictation() {
    const { audio } = await dictation.stop()
    if (audio) setAudioBlob(audio)
  }

  async function handleFile(file: File) {
    setError(null)
    setAudioBlob(file)
    if (!hasFalKey()) {
      setError('Audio attached — add a fal.ai key in Settings to auto-transcribe it, or type what you remember below.')
      return
    }
    try {
      setBusy('Transcribing audio…')
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

  const mm = Math.floor(dictation.elapsed / 60)
  const ss = String(dictation.elapsed % 60).padStart(2, '0')

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="reveal space-y-2">
        <h1 className="font-display text-4xl text-dusk-100 sm:text-5xl">
          Catch a <em>dream</em>
        </h1>
        <p className="text-sm text-dusk-300">
          Speak or write it down before it dissolves — fragments are enough, you can shape it later.
        </p>
      </header>

      <section className="card card-glow reveal space-y-5 p-5 sm:p-7">
        <div>
          <label className="label" htmlFor="dream-text">Dream narrative</label>
          <div className="relative">
            <textarea
              id="dream-text"
              ref={textareaRef}
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              readOnly={dictation.recording}
              rows={10}
              placeholder="I was standing in a house that was somehow also the ocean…"
              className={`input font-prose min-h-56 resize-y ${dictation.recording ? 'text-transparent' : ''}`}
              style={dictation.recording ? { caretColor: 'transparent' } : undefined}
            />
            {dictation.recording && (
              <div
                ref={mirrorRef}
                aria-hidden="true"
                className="input font-prose pointer-events-none absolute inset-0 min-h-56 overflow-y-auto whitespace-pre-wrap text-dusk-100"
              >
                {narrative}
                {narrative && dictation.interimText ? ' ' : ''}
                <span className="text-dusk-300/45">{dictation.interimText}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={() => (dictation.recording ? void stopDictation() : void dictation.start())}
            disabled={!dictationSupported()}
            className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-2xl transition-transform hover:scale-105 disabled:opacity-40 ${
              dictation.recording ? 'recording-pulse bg-rose-dream text-dusk-100' : 'bg-dusk-400 text-night-950'
            }`}
            aria-label={dictation.recording ? 'Stop dictation' : 'Start dictation'}
          >
            {dictation.recording ? '⏹' : '🎙️'}
          </button>
          <div className="text-sm text-dusk-300">
            {dictation.recording ? (
              <span className="shimmer-text">listening… {mm}:{ss}</span>
            ) : dictationSupported() ? (
              <span>Tap to speak — your words stream in as you talk.</span>
            ) : (
              <span className="text-ember-300">Dictation isn't supported in this browser — try Chrome or Edge, or just type.</span>
            )}
          </div>
        </div>

        {dictation.error && <p className="text-sm text-ember-300">{dictation.error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          {audioBlob && <span className="chip">🎙 voice recording attached</span>}
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
            or import a voice memo
          </button>
        </div>

        <div className="rule" />

        <div className="max-w-[12rem]">
          <label className="label" htmlFor="dream-date">Night of</label>
          <input
            id="dream-date"
            type="date"
            value={dreamDate}
            onChange={(e) => setDreamDate(e.target.value)}
            className="input"
          />
        </div>
      </section>

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
