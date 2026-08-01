import { useEffect, useRef, useState } from 'react'
import { useDreams } from '../store/dreams'
import { blobsDB } from '../db'
import { newId, type Dream } from '../types'
import { generateVideoPrompt, hasClaudeKey } from '../services/claude'
import { generateVideo, fetchVideoBlob, hasFalKey, videoBackend } from '../services/fal'
import { useSettings, VIDEO_MODELS, effectiveVideoModel } from '../store/settings'
import VideoConnection from './VideoConnection'

// No shared blob-url hook lives in src/components (DreamDetail.tsx keeps a local, unexported
// copy in src/pages), so this is a small local re-implementation kept private to this file.
function useLocalBlobUrl(id: string | undefined): string | null {
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

type Phase = 'prompt' | 'render' | null

// Turn the dream into a short generated video: Claude writes the cinematic prompt,
// fal.ai renders it, and the MP4 is saved into the dream entry.
export default function DreamStudio({ dream }: { dream: Dream }) {
  const update = useDreams((s) => s.update)
  const settings = useSettings()
  const [prompt, setPrompt] = useState(dream.videoPrompt?.falPrompt ?? '')
  const [phase, setPhase] = useState<Phase>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<number | null>(null)
  const claude = hasClaudeKey()
  const fal = hasFalKey()
  const videoBlobUrl = useLocalBlobUrl(dream.videoId)
  const videoSrc = videoBlobUrl ?? dream.videoUrl ?? null

  function startTimer() {
    stopTimer()
    const start = Date.now()
    setElapsed(0)
    timerRef.current = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
  }
  function stopTimer() {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }
  useEffect(() => () => stopTimer(), [])

  async function writePrompt() {
    setError(null)
    setPhase('prompt')
    setStatus('Directing the scene…')
    startTimer()
    try {
      const vp = await generateVideoPrompt(dream)
      setPrompt(vp.falPrompt)
      await update(dream.id, { videoPrompt: vp })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Prompt generation failed.')
    } finally {
      setStatus(null)
      stopTimer()
    }
  }

  async function render() {
    if (!prompt.trim()) return
    setError(null)
    setPhase('render')
    startTimer()
    try {
      const { url } = await generateVideo(prompt.trim(), setStatus)
      setStatus('Saving the dream reel…')
      try {
        const blob = await fetchVideoBlob(url)
        const videoId = newId()
        await blobsDB.put({ id: videoId, kind: 'video', mime: blob.type || 'video/mp4', blob })
        await update(dream.id, { videoId, videoUrl: undefined })
      } catch {
        // CORS or download failure: keep the remote URL so it still plays
        await update(dream.id, { videoUrl: url, videoId: undefined })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Video generation failed.')
    } finally {
      setStatus(null)
      stopTimer()
    }
  }

  function tryAgain() {
    if (phase === 'prompt') void writePrompt()
    else void render()
  }

  async function uploadVideo(file: File) {
    const videoId = newId()
    await blobsDB.put({ id: videoId, kind: 'video', mime: file.type || 'video/mp4', blob: file })
    await update(dream.id, { videoId, videoUrl: undefined })
  }

  async function copy(label: string, text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 1500)
  }

  const vp = dream.videoPrompt
  const busy = Boolean(status)
  const activeModel = effectiveVideoModel(settings)
  const activeModelName = VIDEO_MODELS.find((m) => m.id === activeModel)?.name

  return (
    <div className="space-y-5">
      <h3 className="font-display text-xl text-dusk-100">
        The <em>film</em>
      </h3>

      {videoSrc && (
        <div className="card overflow-hidden">
          <video src={videoSrc} controls loop className="aspect-video w-full bg-night-950 object-contain" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => void writePrompt()} disabled={!claude || busy} className="btn-secondary">
          {vp ? '↻ Rewrite cinematic prompt ✨' : '1 · Write cinematic prompt ✨'}
        </button>
        {!claude && <span className="text-xs text-dusk-400">needs an Anthropic key (Settings)</span>}
      </div>

      <div>
        <label className="label" htmlFor="video-prompt">Video prompt {vp && <span className="normal-case text-dusk-400">— {vp.styleNotes}</span>}</label>
        <textarea
          id="video-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={5}
          placeholder={claude ? 'Generate a prompt above, or write your own scene description…' : 'Describe the dream scene: subject, setting, lighting, camera movement, mood…'}
          className="input resize-y text-sm"
        />
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={settings.customVideoModel ? 'custom' : settings.videoModel}
            onChange={(e) => {
              if (e.target.value !== 'custom') {
                settings.setCustomVideoModel('')
                settings.setVideoModel(e.target.value)
              }
            }}
            className="input max-w-64"
            aria-label="Video model"
          >
            {VIDEO_MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
            {settings.customVideoModel && <option value="custom">{settings.customVideoModel} (custom)</option>}
          </select>
          <button onClick={() => void render()} disabled={!fal || !prompt.trim() || busy} className="btn-primary">
            2 · Generate dream video 🎬
          </button>
          {!fal && <span className="text-xs text-dusk-400">needs a fal.ai key (Settings)</span>}
        </div>
        {settings.customVideoModel ? (
          <p className="text-xs text-dusk-400">
            Using custom override from Settings: <span className="text-dusk-300">{settings.customVideoModel}</span> — clear it there to use the picker above.
          </p>
        ) : (
          activeModelName && <p className="text-xs text-dusk-400">Will render on <span className="text-dusk-300">{activeModelName}</span>.</p>
        )}
      </div>

      {status && (
        <p className="card flex items-center justify-between gap-3 px-4 py-3 text-sm">
          <span className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-aurora-400" />
            <span className="shimmer-text font-medium">{status}</span>
          </span>
          <span className="shrink-0 text-xs text-dusk-400 tabular-nums">{elapsed}s</span>
        </p>
      )}

      {error && (
        <div className="card border border-ember-400/30 bg-ember-400/5 p-4">
          <p className="text-sm font-medium text-ember-300">{error}</p>
          {!/blocked by the browser|not set up|reach your proxy/i.test(error) && (
            <p className="mt-2 text-xs text-dusk-400">
              check your fal.ai credit · try LTX 2.3 Fast · paste a current model id from fal.ai/models in Settings
            </p>
          )}
          <button onClick={tryAgain} className="btn-secondary mt-3 text-xs">
            ↻ Try again
          </button>
        </div>
      )}

      {/* fal blocks direct browser calls, so when video can't run the fix belongs
          right here rather than buried in Settings. */}
      {(videoBackend() !== 'proxy' || /blocked by the browser|not set up|reach your proxy/i.test(error ?? '')) && (
        <VideoConnection />
      )}

      <details className="rounded-xl bg-night-700/40 p-3 text-sm">
        <summary className="cursor-pointer text-dusk-300">Prefer another tool? Copy a tuned prompt or upload a video</summary>
        <div className="mt-3 space-y-2">
          {vp ? (
            <>
              <button onClick={() => void copy('runway', vp.runwayPrompt)} className="btn-ghost w-full justify-start text-left">
                {copied === 'runway' ? '✓ Copied' : '📋 Copy Runway-tuned prompt'}
              </button>
              <button onClick={() => void copy('pika', vp.pikaPrompt)} className="btn-ghost w-full justify-start text-left">
                {copied === 'pika' ? '✓ Copied' : '📋 Copy Pika-tuned prompt'}
              </button>
              <button onClick={() => void copy('generic', vp.falPrompt)} className="btn-ghost w-full justify-start text-left">
                {copied === 'generic' ? '✓ Copied' : '📋 Copy generic prompt (ComfyUI / anything)'}
              </button>
            </>
          ) : (
            <p className="text-xs text-dusk-400">Generate a cinematic prompt first to get Runway / Pika / ComfyUI variants.</p>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void uploadVideo(f)
            }}
          />
          <button onClick={() => fileRef.current?.click()} className="btn-ghost w-full justify-start text-left">
            ⬆️ Upload a video you generated elsewhere
          </button>
        </div>
      </details>
    </div>
  )
}
