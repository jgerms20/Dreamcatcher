import { ApiError, fal } from '@fal-ai/client'
import { useSettings, effectiveVideoModel } from '../store/settings'

function ensureConfigured() {
  const { falKey } = useSettings.getState()
  if (!falKey) throw new Error('No fal.ai API key configured. Add one in Settings.')
  fal.config({ credentials: falKey })
}

// The fal client throws ApiError (or ValidationError, a subclass of ApiError) whose `body`
// carries the real reason a call failed — a FastAPI-style `{ detail: [...] }` for 422s, or
// plain text/JSON for other statuses. Re-throw everything as a plain Error with a message
// that actually explains what went wrong, so the UI can surface it instead of failing silently.
function describeFalError(e: unknown, context: string): Error {
  if (e instanceof ApiError) {
    const status = e.status
    const detail = extractDetail(e.body)
    const hint =
      status === 401 || status === 403
        ? 'Check that your fal.ai API key is valid and has billing/credits available.'
        : status === 404
          ? 'That model id was not found — it may have been renamed or retired. Try another model or paste a fresh id from fal.ai/models.'
          : status === 422
            ? 'The request was rejected as invalid input.'
            : status >= 500
              ? 'fal.ai is having trouble on their end — try again shortly.'
              : ''
    const parts = [`${context} failed (${status})`, detail, hint].filter(Boolean)
    return new Error(parts.join(' — '))
  }
  if (e instanceof Error) return new Error(`${context} failed — ${e.message}`)
  return new Error(`${context} failed — ${String(e)}`)
}

function extractDetail(body: unknown): string {
  if (!body || typeof body !== 'object') return typeof body === 'string' ? body : ''
  const detail = (body as { detail?: unknown }).detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        if (d && typeof d === 'object') {
          const msg = (d as { msg?: unknown }).msg
          const loc = (d as { loc?: unknown }).loc
          const where = Array.isArray(loc) ? loc.join('.') : undefined
          return [where, msg].filter(Boolean).join(': ')
        }
        return String(d)
      })
      .filter(Boolean)
      .join('; ')
  }
  const message = (body as { message?: unknown }).message
  if (typeof message === 'string') return message
  return ''
}

export function hasFalKey(): boolean {
  return Boolean(useSettings.getState().falKey)
}

export async function transcribeAudio(blob: Blob, onStatus?: (s: string) => void): Promise<string> {
  ensureConfigured()
  try {
    onStatus?.('Uploading audio…')
    const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('mpeg') ? 'mp3' : blob.type.includes('wav') ? 'wav' : 'webm'
    const file = new File([blob], `dream-audio.${ext}`, { type: blob.type || 'audio/webm' })
    const url = await fal.storage.upload(file)
    onStatus?.('Transcribing…')
    const result = await fal.subscribe('fal-ai/whisper', {
      input: { audio_url: url, task: 'transcribe' },
      onQueueUpdate(update) {
        if (update.status === 'IN_QUEUE') onStatus?.('Waiting in queue…')
        if (update.status === 'IN_PROGRESS') onStatus?.('Transcribing…')
      },
    })
    const data = result.data as { text?: string }
    if (!data?.text) throw new Error('Transcription returned no text.')
    return data.text.trim()
  } catch (e) {
    throw describeFalError(e, 'Transcription')
  }
}

export interface VideoResult {
  url: string
}

export async function generateVideo(
  prompt: string,
  onStatus: (s: string) => void,
): Promise<VideoResult> {
  ensureConfigured()
  const modelId = effectiveVideoModel(useSettings.getState())
  try {
    onStatus(`Submitting to ${modelId}…`)
    const result = await fal.subscribe(modelId, {
      input: { prompt },
      logs: false,
      onQueueUpdate(update) {
        if (update.status === 'IN_QUEUE') {
          const pos = (update as { queue_position?: number }).queue_position
          onStatus(pos != null ? `In queue (position ${pos})…` : 'In queue…')
        }
        if (update.status === 'IN_PROGRESS') onStatus('Generating video — this can take a few minutes…')
      },
    })
    // Different fal models return the video under slightly different shapes.
    const data = result.data as Record<string, unknown>
    const url = pluckVideoUrl(data)
    if (!url) throw new Error('Video generation finished but no video URL was found in the response.')
    return { url }
  } catch (e) {
    throw describeFalError(e, `Video generation (${modelId})`)
  }
}

function pluckVideoUrl(data: Record<string, unknown>): string | undefined {
  const video = data.video as { url?: string } | undefined
  if (video?.url) return video.url
  const videos = data.videos as { url?: string }[] | undefined
  if (videos?.[0]?.url) return videos[0].url
  if (typeof data.video_url === 'string') return data.video_url
  if (typeof data.url === 'string' && String(data.url).match(/\.(mp4|webm|mov)(\?|$)/)) return data.url as string
  return undefined
}

export async function fetchVideoBlob(url: string): Promise<Blob> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download video (${res.status})`)
  return res.blob()
}
