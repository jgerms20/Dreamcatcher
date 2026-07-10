import { useRef, useState } from 'react'
import { useDreams } from '../store/dreams'
import { blobsDB } from '../db'
import { newId, type Dream } from '../types'
import { generateVideoPrompt, hasClaudeKey } from '../services/claude'
import { generateVideo, fetchVideoBlob, hasFalKey } from '../services/fal'
import { useSettings, VIDEO_MODELS } from '../store/settings'
import Icon from './Icon'

// Turn the dream into a short generated video: Claude writes the cinematic prompt,
// fal.ai renders it, and the MP4 is saved into the dream entry.
export default function DreamStudio({ dream }: { dream: Dream }) {
  const update = useDreams((s) => s.update)
  const settings = useSettings()
  const [prompt, setPrompt] = useState(dream.videoPrompt?.falPrompt ?? '')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const claude = hasClaudeKey()
  const fal = hasFalKey()

  async function writePrompt() {
    setError(null)
    setStatus('Directing the scene…')
    try {
      const vp = await generateVideoPrompt(dream)
      setPrompt(vp.falPrompt)
      await update(dream.id, { videoPrompt: vp })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Prompt generation failed.')
    } finally {
      setStatus(null)
    }
  }

  async function render() {
    if (!prompt.trim()) return
    setError(null)
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
    }
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => void writePrompt()} disabled={!claude || Boolean(status)} className="btn-secondary">
          <Icon name={vp ? 'refresh' : 'sparkle'} size={16} />
          {vp ? 'Rewrite cinematic prompt' : 'Write cinematic prompt'}
        </button>
        {!claude && <span className="text-xs text-ivory-400">needs an Anthropic key (Settings)</span>}
      </div>

      <div>
        <label className="label" htmlFor="video-prompt">Video prompt {vp && <span className="normal-case text-ivory-400">— {vp.styleNotes}</span>}</label>
        <textarea
          id="video-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={5}
          placeholder={claude ? 'Generate a prompt above, or write your own scene description…' : 'Describe the dream scene: subject, setting, lighting, camera movement, mood…'}
          className="input resize-y text-sm"
        />
      </div>

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
        <button onClick={() => void render()} disabled={!fal || !prompt.trim() || Boolean(status)} className="btn-primary">
          <Icon name="film" size={16} /> Generate dream video
        </button>
        {!fal && <span className="text-xs text-ivory-400">needs a fal.ai key (Settings)</span>}
      </div>

      {status && (
        <p className="inset-panel flex items-center gap-2 p-3 text-sm text-aurora-300">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-aurora-400" /> {status}
        </p>
      )}
      {error && <p className="text-sm text-amber-300">{error}</p>}

      <details className="inset-panel p-3 text-sm">
        <summary className="cursor-pointer text-ivory-300">Prefer another tool? Copy a tuned prompt or upload a video</summary>
        <div className="mt-3 space-y-2">
          {vp ? (
            <>
              <button onClick={() => void copy('runway', vp.runwayPrompt)} className="btn-ghost w-full justify-start text-left">
                <Icon name={copied === 'runway' ? 'check' : 'copy'} size={16} />
                {copied === 'runway' ? 'Copied' : 'Copy Runway-tuned prompt'}
              </button>
              <button onClick={() => void copy('pika', vp.pikaPrompt)} className="btn-ghost w-full justify-start text-left">
                <Icon name={copied === 'pika' ? 'check' : 'copy'} size={16} />
                {copied === 'pika' ? 'Copied' : 'Copy Pika-tuned prompt'}
              </button>
              <button onClick={() => void copy('generic', vp.falPrompt)} className="btn-ghost w-full justify-start text-left">
                <Icon name={copied === 'generic' ? 'check' : 'copy'} size={16} />
                {copied === 'generic' ? 'Copied' : 'Copy generic prompt (ComfyUI / anything)'}
              </button>
            </>
          ) : (
            <p className="text-xs text-ivory-400">Generate a cinematic prompt first to get Runway / Pika / ComfyUI variants.</p>
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
            <Icon name="upload" size={16} /> Upload a video you generated elsewhere
          </button>
        </div>
      </details>
    </div>
  )
}
