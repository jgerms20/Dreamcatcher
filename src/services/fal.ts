import { ApiError, fal } from '@fal-ai/client'
import { useSettings, effectiveVideoModel } from '../store/settings'

/**
 * fal.ai refuses calls made directly from a browser: the CORS preflight is
 * rejected, so `fetch` throws a status-less TypeError and the UI has nothing to
 * report — which is exactly why "Generate" used to look like it did nothing.
 *
 * The supported fix (fal's own documentation) is a server-side proxy. When a
 * proxy URL is configured we route through it and the fal key never enters the
 * browser at all. See worker/README.md for the two-minute deploy.
 */

export type VideoBackend = 'proxy' | 'direct' | 'none'

/** Reads proxy settings defensively — stores persisted before these fields
 *  existed hydrate them as undefined. */
function conn() {
  const s = useSettings.getState()
  return {
    proxyUrl: (s.falProxyUrl ?? '').trim(),
    appToken: (s.falAppToken ?? '').trim(),
    key: (s.falKey ?? '').trim(),
  }
}

export function videoBackend(): VideoBackend {
  const { proxyUrl, key } = conn()
  if (proxyUrl) return 'proxy'
  if (key) return 'direct'
  return 'none'
}

/** True when video/transcription can even be attempted. */
export function hasFalKey(): boolean {
  return videoBackend() !== 'none'
}

export function hasFalProxy(): boolean {
  return videoBackend() === 'proxy'
}

function ensureConfigured() {
  const { proxyUrl, appToken: token, key } = conn()

  if (proxyUrl) {
    fal.config({
      proxyUrl,
      // Our middleware runs before fal's proxy middleware, which preserves any
      // headers we add — this is how the optional shared token reaches the Worker.
      requestMiddleware: (request) =>
        Promise.resolve(
          token
            ? { ...request, headers: { ...(request.headers ?? {}), 'x-app-token': token } }
            : request,
        ),
    })
    return
  }

  if (!key) {
    throw new Error(
      'Video generation is not set up yet. Add a proxy URL (recommended) or a fal.ai key in Settings.',
    )
  }
  fal.config({ credentials: key })
}

/**
 * A browser CORS rejection surfaces as a TypeError with no HTTP status — the
 * request never reached a server that could explain itself. Detecting this
 * precisely is what lets us give the real answer instead of "something failed".
 */
function isNetworkOrCorsFailure(e: unknown): boolean {
  if (e instanceof ApiError) return false
  if (!(e instanceof Error)) return false
  const message = e.message.toLowerCase()
  return (
    e.name === 'TypeError' ||
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('load failed') ||
    message.includes('network request failed')
  )
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

function describeFalError(e: unknown, context: string): Error {
  if (isNetworkOrCorsFailure(e)) {
    return new Error(
      hasFalProxy()
        ? `${context} could not reach your proxy. Check the proxy URL in Settings and that the Worker is deployed — press "Test connection" to confirm.`
        : `${context} was blocked by the browser. fal.ai does not accept API calls made directly from a web page, so the request never left. Set up the free proxy (Settings → Video connection) — it takes about two minutes and also keeps your key out of the browser.`,
    )
  }
  if (e instanceof ApiError) {
    const status = e.status
    const detail = extractDetail(e.body)
    const hint =
      status === 401 || status === 403
        ? 'Check that the fal.ai key is valid and the account has credits.'
        : status === 402
          ? 'Your fal.ai account is out of credit.'
          : status === 404
            ? 'That model id was not found — it may have been renamed or retired. Pick another model, or paste a current id from fal.ai/models.'
            : status === 422
              ? 'fal rejected the input as invalid for this model.'
              : status === 429
                ? 'Rate limited by fal.ai — wait a moment and try again.'
                : status >= 500
                  ? 'fal.ai is having trouble on their end — try again shortly.'
                  : ''
    return new Error([`${context} failed (${status})`, detail, hint].filter(Boolean).join(' — '))
  }
  if (e instanceof Error) return new Error(`${context} failed — ${e.message}`)
  return new Error(`${context} failed — ${String(e)}`)
}

// ---------------------------------------------------------------- diagnostics

export interface ConnectionTest {
  ok: boolean
  title: string
  detail: string
  fix?: string
}

/** Runs a real request and reports precisely what is (or isn't) working. */
export async function testVideoConnection(): Promise<ConnectionTest> {
  const { proxyUrl, appToken, key } = conn()

  if (proxyUrl) {
    try {
      const res = await fetch(proxyUrl, {
        method: 'GET',
        headers: appToken ? { 'x-app-token': appToken } : {},
      })
      if (!res.ok) {
        return {
          ok: false,
          title: `Proxy responded ${res.status}`,
          detail: await res.text().catch(() => 'No response body.'),
          fix:
            res.status === 401
              ? 'The app token does not match the APP_TOKEN secret on the Worker.'
              : 'Check the Worker logs with: wrangler tail',
        }
      }
      const body = (await res.json().catch(() => ({}))) as {
        keyConfigured?: boolean
        tokenRequired?: boolean
      }
      if (body.keyConfigured === false) {
        return {
          ok: false,
          title: 'Proxy is reachable but has no fal key',
          detail: 'The Worker is deployed but its FAL_KEY secret is not set.',
          fix: 'Run: wrangler secret put FAL_KEY',
        }
      }
      return {
        ok: true,
        title: 'Proxy reachable, key configured',
        detail: body.tokenRequired
          ? 'The proxy also requires an app token, which is set.'
          : 'Video generation and audio transcription should work.',
      }
    } catch {
      return {
        ok: false,
        title: 'Could not reach the proxy',
        detail: `Nothing answered at ${proxyUrl}.`,
        fix: 'Confirm the URL is exactly what "wrangler deploy" printed, and that your site origin is in ALLOWED_ORIGINS.',
      }
    }
  }

  if (!key) {
    return {
      ok: false,
      title: 'Not set up yet',
      detail: 'No proxy URL and no fal.ai key.',
      fix: 'Deploy the proxy in worker/ (about two minutes, free) and paste its URL above.',
    }
  }

  // Direct mode: demonstrate the actual browser behaviour rather than guessing.
  try {
    await fetch('https://queue.fal.run/fal-ai/ltx-2.3/text-to-video/fast/requests/health-probe', {
      method: 'GET',
      headers: { Authorization: `Key ${key}` },
    })
    return {
      ok: true,
      title: 'Direct browser access works',
      detail: 'fal.ai accepted a request straight from this page.',
      fix: 'Your key is still visible in this browser — the proxy would fix that.',
    }
  } catch {
    return {
      ok: false,
      title: 'Blocked by the browser (CORS)',
      detail:
        'fal.ai does not accept API calls made directly from a web page, so the request never left this tab. This is why generating a video appeared to do nothing.',
      fix: 'Deploy the proxy in worker/ and paste its URL above. Takes about two minutes and is free.',
    }
  }
}

// ------------------------------------------------------------------ transcribe

export async function transcribeAudio(blob: Blob, onStatus?: (s: string) => void): Promise<string> {
  ensureConfigured()
  try {
    onStatus?.('Uploading audio…')
    const ext = blob.type.includes('mp4')
      ? 'mp4'
      : blob.type.includes('mpeg')
        ? 'mp3'
        : blob.type.includes('wav')
          ? 'wav'
          : 'webm'
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

// ---------------------------------------------------------------------- video

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
        if (update.status === 'IN_PROGRESS') onStatus('Generating — this can take a few minutes…')
      },
    })
    const data = result.data as Record<string, unknown>
    const url = pluckVideoUrl(data)
    if (!url) throw new Error('Generation finished but no video URL was found in the response.')
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
  if (typeof data.url === 'string' && String(data.url).match(/\.(mp4|webm|mov)(\?|$)/)) {
    return data.url as string
  }
  return undefined
}

/**
 * Downloads the finished video so it can be stored offline with the dream.
 * Falls back to the proxy when fal's CDN declines a cross-origin read; callers
 * already treat a failure here as non-fatal and keep the remote URL.
 */
export async function fetchVideoBlob(url: string): Promise<Blob> {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`status ${res.status}`)
    return await res.blob()
  } catch (direct) {
    const { proxyUrl, appToken } = conn()
    if (!proxyUrl) {
      throw new Error(
        `Could not download the video (${direct instanceof Error ? direct.message : String(direct)}).`,
      )
    }
    const res = await fetch(proxyUrl, {
      method: 'GET',
      headers: {
        'x-fal-target-url': url,
        ...(appToken ? { 'x-app-token': appToken } : {}),
      },
    })
    if (!res.ok) throw new Error(`Could not download the video through the proxy (${res.status}).`)
    return res.blob()
  }
}
