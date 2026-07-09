import { fal } from '@fal-ai/client'
import { useSettings, effectiveVideoModel } from '../store/settings'

function ensureConfigured() {
  const { falKey } = useSettings.getState()
  if (!falKey) throw new Error('No fal.ai API key configured. Add one in Settings.')
  fal.config({ credentials: falKey })
}

export function hasFalKey(): boolean {
  return Boolean(useSettings.getState().falKey)
}

export async function transcribeAudio(blob: Blob, onStatus?: (s: string) => void): Promise<string> {
  ensureConfigured()
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
