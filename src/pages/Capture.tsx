import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDreams } from '../store/dreams'
import { blobsDB } from '../db'
import { newId, lastNightISO } from '../types'
import { useDictation, dictationSupported } from '../services/speech'
import { transcribeAudio, hasFalKey } from '../services/fal'
import Icon from '../components/Icon'

function cleanNarrativeChunk(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function appendNarrative(current: string, addition: string, separator: 'line' | 'space' = 'line'): string {
  const chunk = cleanNarrativeChunk(addition)
  if (!chunk) return current
  if (!current.trim()) return chunk
  if (separator === 'line') return `${current.trimEnd()}\n${chunk}`
  return `${current}${/\s$/.test(current) ? '' : ' '}${chunk}`
}

function uncommittedDictationText(spokenText: string, committedFinalText: string): string {
  const spoken = cleanNarrativeChunk(spokenText)
  const committed = cleanNarrativeChunk(committedFinalText)
  if (!spoken) return ''
  if (committed && spoken.startsWith(committed)) return spoken.slice(committed.length).trim()
  return spoken
}

export default function Capture() {
  const navigate = useNavigate()
  const createDream = useDreams((s) => s.create)
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [dreamDate, setDreamDate] = useState(lastNightISO())
  const [lucid, setLucid] = useState(false)
  const [recurring, setRecurring] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const committedFinalRef = useRef('')
  const dictation = useDictation()
  const canDictate = dictationSupported()
  const interimPreview = cleanNarrativeChunk(dictation.interimText)
  const showInterimPreview = dictation.recording && Boolean(interimPreview)

  useEffect(() => {
    const finalText = cleanNarrativeChunk(dictation.finalText)
    const previousFinalText = committedFinalRef.current
    if (!finalText || finalText === previousFinalText) return

    const nextChunk = previousFinalText && finalText.startsWith(previousFinalText)
      ? finalText.slice(previousFinalText.length)
      : finalText

    setText((current) => appendNarrative(current, nextChunk, 'space'))
    committedFinalRef.current = finalText
  }, [dictation.finalText])

  function syncPreviewScroll() {
    if (!textareaRef.current || !previewRef.current) return
    previewRef.current.scrollTop = textareaRef.current.scrollTop
  }

  async function startDictation() {
    setError(null)
    committedFinalRef.current = ''
    await dictation.start()
  }

  async function finishDictation() {
    const snapshot = `${dictation.finalText} ${dictation.interimText}`
    const { text: spoken, audio } = await dictation.stop()
    const pendingText = uncommittedDictationText(spoken || snapshot, committedFinalRef.current)
    if (pendingText) setText((t) => appendNarrative(t, pendingText, 'space'))
    committedFinalRef.current = ''
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
      setText((t) => appendNarrative(t, transcript, 'line'))
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

  return (
    <div className="reveal-stack mx-auto max-w-2xl space-y-5">
      <header>
        <h2 className="page-title">Catch the dream</h2>
        <p className="page-subtitle">
          Get it down before it dissolves — fragments are fine. You can expand it right after.
        </p>
      </header>

      <div className="card space-y-5 p-5">
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <label className="label mb-0" htmlFor="dream-text">Dream narrative</label>
            <div className="flex flex-wrap gap-2">
              {dictation.recording && (
                <span className="chip border-aurora-300/30 text-aurora-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-aurora-300" />
                  Live {Math.floor(dictation.elapsed / 60)}:{String(dictation.elapsed % 60).padStart(2, '0')}
                </span>
              )}
              {audioBlob && (
                <span className="chip">
                  <Icon name="check" size={14} /> Audio attached
                </span>
              )}
            </div>
          </div>
          <div className="relative">
            <textarea
              ref={textareaRef}
              id="dream-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onScroll={syncPreviewScroll}
              rows={12}
              placeholder="I was standing in a house that was somehow also the ocean…"
              className={`input min-h-64 resize-y font-prose leading-relaxed ${showInterimPreview ? 'caret-aurora-300 text-transparent' : ''}`}
            />
            {showInterimPreview && (
              <div
                ref={previewRef}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-3 py-2 font-prose leading-relaxed text-ivory-100"
              >
                {text}
                {text && !/\s$/.test(text) ? ' ' : ''}
                <span className="text-ivory-300/55">{interimPreview}</span>
              </div>
            )}
          </div>
        </div>

        <div className="inset-panel p-3">
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
          {dictation.recording ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex flex-1 items-center gap-3">
                <button
                  onClick={() => void finishDictation()}
                  className="recording-pulse flex h-14 w-14 items-center justify-center rounded-full border border-aurora-300/70 bg-aurora-300 text-ink-950 shadow-lg shadow-aurora-300/10 transition-transform hover:scale-105"
                  aria-label="Stop dictation"
                >
                  <Icon name="mic" size={24} />
                </button>
                <div>
                  <p className="text-sm font-semibold text-ivory-100">Recording</p>
                  <p className="text-xs text-ivory-300">
                    {Math.floor(dictation.elapsed / 60)}:{String(dictation.elapsed % 60).padStart(2, '0')}
                  </p>
                </div>
              </div>
              <button onClick={() => void finishDictation()} className="btn-primary py-3 sm:min-w-32">
                Done <Icon name="check" size={17} />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                onClick={() => void startDictation()}
                disabled={!canDictate || Boolean(busy)}
                className="btn-secondary justify-start py-3"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-aurora-300/40 bg-ink-900 text-aurora-300">
                  <Icon name="mic" size={20} />
                </span>
                Dictate
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={Boolean(busy)}
                className="btn-secondary justify-start py-3"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-ivory-100/12 bg-ink-900 text-ivory-200">
                  <Icon name={audioBlob ? 'check' : 'upload'} size={18} />
                </span>
                {audioBlob ? 'Replace audio' : 'Import audio'}
              </button>
            </div>
          )}
          {!canDictate && (
            <p className="mt-3 text-sm text-amber-300">
              This browser doesn't support live dictation. Import audio or type the dream instead.
            </p>
          )}
          {!hasFalKey() && (
            <p className="mt-3 text-xs text-ivory-400">
              Imported audio will attach without auto-transcription until a fal.ai key is added in Settings.
            </p>
          )}
          {dictation.error && <p className="mt-3 text-sm text-amber-300">{dictation.error}</p>}
        </div>

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
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-ivory-200">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={lucid} onChange={(e) => setLucid(e.target.checked)} className="accent-aurora-300" />
            <Icon name="eye" size={16} /> I knew I was dreaming (lucid)
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className="accent-aurora-300" />
            <Icon name="repeat" size={16} /> I've had this dream before
          </label>
        </div>
      </div>

      {error && <p className="text-sm text-amber-300">{error}</p>}
      {busy && <p className="text-sm text-aurora-300">{busy}</p>}

      <button onClick={() => void save()} disabled={Boolean(busy) || dictation.recording} className="btn-primary w-full py-3 text-base">
        Save Dream <Icon name="arrow-right" size={17} />
      </button>
    </div>
  )
}
