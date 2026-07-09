import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDreams } from '../store/dreams'
import { blobsDB } from '../db'
import { newId, lastNightISO } from '../types'
import { useDictation, dictationSupported } from '../services/speech'
import { transcribeAudio, hasFalKey } from '../services/fal'

type Mode = 'dictate' | 'import' | 'type'

export default function Capture() {
  const navigate = useNavigate()
  const createDream = useDreams((s) => s.create)
  const [mode, setMode] = useState<Mode>(dictationSupported() ? 'dictate' : 'type')
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [dreamDate, setDreamDate] = useState(lastNightISO())
  const [lucid, setLucid] = useState(false)
  const [recurring, setRecurring] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const dictation = useDictation()

  async function stopDictation() {
    const { text: spoken, audio } = await dictation.stop()
    if (spoken) setText((t) => (t ? t + '\n' + spoken : spoken))
    if (audio) setAudioBlob(audio)
  }

  async function handleFile(file: File) {
    setError(null)
    setAudioBlob(file)
    if (!hasFalKey()) {
      setError('Audio saved — but transcription needs a fal.ai key (add one in Settings), or type what you remember below.')
      return
    }
    try {
      setBusy('Transcribing audio…')
      const transcript = await transcribeAudio(file, setBusy)
      setText((t) => (t ? t + '\n' + transcript : transcript))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transcription failed.')
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    if (!text.trim()) {
      setError('Describe at least a fragment of the dream first — even a single image counts.')
      return
    }
    setBusy('Saving…')
    let audioId: string | undefined
    if (audioBlob) {
      audioId = newId()
      await blobsDB.put({ id: audioId, kind: 'audio', mime: audioBlob.type || 'audio/webm', blob: audioBlob })
    }
    const dream = await createDream({
      title: title.trim(),
      transcript: text.trim(),
      dreamDate,
      lucid,
      recurring,
      audioId,
    })
    navigate(`/dream/${dream.id}?fresh=1`)
  }

  const tabs: { id: Mode; label: string }[] = [
    { id: 'dictate', label: '🎙️ Dictate' },
    { id: 'import', label: '📁 Import audio' },
    { id: 'type', label: '⌨️ Type' },
  ]

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <h2 className="font-display text-3xl text-dusk-100">Catch the dream</h2>
        <p className="mt-1 text-sm text-dusk-300">
          Get it down before it dissolves — fragments are fine. You can expand it right after.
        </p>
      </header>

      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setMode(t.id)}
            className={t.id === mode ? 'btn-primary' : 'btn-secondary'}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mode === 'dictate' && (
        <div className="card space-y-4 p-5 text-center">
          {!dictationSupported() && (
            <p className="text-sm text-ember-300">
              This browser doesn't support live dictation (try Chrome or Edge). You can still import an audio file or type.
            </p>
          )}
          {dictation.recording ? (
            <>
              <button
                onClick={() => void stopDictation()}
                className="recording-pulse mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-rose-dream text-3xl"
                aria-label="Stop recording"
              >
                ⏹
              </button>
              <p className="text-sm text-dusk-300">
                Recording {Math.floor(dictation.elapsed / 60)}:{String(dictation.elapsed % 60).padStart(2, '0')} — speak freely, in fragments if needed
              </p>
              <p className="min-h-12 rounded-xl bg-night-700/60 p-3 text-left text-sm text-dusk-200">
                {dictation.finalText} <span className="text-dusk-400">{dictation.interimText}</span>
              </p>
            </>
          ) : (
            <>
              <button
                onClick={() => void dictation.start()}
                disabled={!dictationSupported()}
                className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-dusk-400 text-3xl text-night-950 transition-transform hover:scale-105 disabled:opacity-40"
                aria-label="Start recording"
              >
                🎙️
              </button>
              <p className="text-sm text-dusk-300">Tap and start talking. The audio is kept alongside the transcript.</p>
            </>
          )}
          {dictation.error && <p className="text-sm text-ember-300">{dictation.error}</p>}
        </div>
      )}

      {mode === 'import' && (
        <div className="card space-y-3 p-5">
          <p className="text-sm text-dusk-300">
            Recorded a voice memo when you woke up? Import it here.
            {hasFalKey() ? ' It will be transcribed automatically.' : ' Add a fal.ai key in Settings to auto-transcribe it.'}
          </p>
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
          <button onClick={() => fileRef.current?.click()} className="btn-secondary w-full py-6">
            {audioBlob ? '✓ Audio attached — choose a different file' : 'Choose an audio file…'}
          </button>
        </div>
      )}

      <div className="card p-5">
        <label className="label" htmlFor="dream-text">Dream narrative</label>
        <textarea
          id="dream-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={mode === 'type' ? 10 : 6}
          placeholder="I was standing in a house that was somehow also the ocean…"
          className="input resize-y font-[family-name:var(--font-body)] leading-relaxed"
        />
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="dream-title">Title (optional)</label>
            <input id="dream-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The Ocean House" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="dream-date">Night of</label>
            <input id="dream-date" type="date" value={dreamDate} onChange={(e) => setDreamDate(e.target.value)} className="input" />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-dusk-200">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={lucid} onChange={(e) => setLucid(e.target.checked)} className="accent-dusk-400" />
            👁️ I knew I was dreaming (lucid)
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className="accent-dusk-400" />
            🔁 I've had this dream before
          </label>
        </div>
      </div>

      {error && <p className="text-sm text-ember-300">{error}</p>}
      {busy && <p className="text-sm text-aurora-300">{busy}</p>}

      <button onClick={() => void save()} disabled={Boolean(busy) || dictation.recording} className="btn-primary w-full py-3 text-base">
        Save dream →
      </button>
    </div>
  )
}
