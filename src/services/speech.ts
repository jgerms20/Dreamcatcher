import { useCallback, useEffect, useRef, useState } from 'react'

// Minimal Web Speech API typings (not in lib.dom for all TS versions)
interface SpeechRecognitionResultLike {
  isFinal: boolean
  0: { transcript: string }
}
interface SpeechRecognitionEventLike {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}
interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | undefined {
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | undefined
}

export function dictationSupported(): boolean {
  return Boolean(getRecognitionCtor()) && Boolean(navigator.mediaDevices?.getUserMedia)
}

export interface DictationState {
  recording: boolean
  /** Not-yet-final words for the current utterance — render as dim/ghost trailing text. */
  interimText: string
  error: string | null
  elapsed: number
}

export interface UseDictationOptions {
  /**
   * Called with each newly finalized chunk of speech (trimmed, whitespace-normalized)
   * as soon as the recognizer commits it — including a final flush of any leftover
   * interim words when dictation stops. The consumer owns the single source-of-truth
   * narrative string and should append each segment to it; this hook never buffers or
   * replaces the consumer's text itself.
   */
  onFinalSegment?: (segment: string) => void
}

const RECOGNITION_RESTART_MS = 120

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function useDictation(options: UseDictationOptions = {}) {
  const [state, setState] = useState<DictationState>({
    recording: false,
    interimText: '',
    error: null,
    elapsed: 0,
  })
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const keepAliveRef = useRef(false)
  const stoppingRef = useRef(false)
  const startedAtRef = useRef(0)
  const interimRef = useRef('')
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null)
  const onFinalSegmentRef = useRef(options.onFinalSegment)
  onFinalSegmentRef.current = options.onFinalSegment

  const releaseWakeLock = useCallback(() => {
    const lock = wakeLockRef.current
    wakeLockRef.current = null
    if (!lock) return
    void lock.release().catch(() => { /* already released */ })
  }, [])

  const requestWakeLock = useCallback(async () => {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> }
      }
      if (!nav.wakeLock) return
      wakeLockRef.current = await nav.wakeLock.request('screen')
    } catch {
      // Wake Lock is optional — denied or unsupported is fine.
    }
  }, [])

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => {
      try { t.stop() } catch { /* track may already be stopped */ }
    })
    streamRef.current = null
  }, [])

  const stopRecognition = useCallback(() => {
    const rec = recognitionRef.current
    recognitionRef.current = null
    if (!rec) return
    try { rec.stop() } catch { /* already stopped */ }
  }, [])

  const cleanup = useCallback(() => {
    keepAliveRef.current = false
    stopRecognition()
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    releaseStream()
    releaseWakeLock()
  }, [releaseStream, releaseWakeLock, stopRecognition])

  useEffect(() => cleanup, [cleanup])

  const start = useCallback(async () => {
    const Ctor = getRecognitionCtor()
    if (!Ctor) {
      setState((s) => ({ ...s, error: 'Speech recognition is not supported in this browser. Chrome and Edge work best — or type your dream instead.' }))
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : ''
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.start(1000)
      recorderRef.current = recorder

      const rec = new Ctor()
      rec.continuous = true
      rec.interimResults = true
      rec.lang = navigator.language || 'en-US'
      rec.onresult = (e) => {
        let interim = ''
        let finals = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]
          if (r.isFinal) finals += r[0].transcript
          else interim += r[0].transcript
        }
        interimRef.current = interim
        const clean = finals.replace(/\s+/g, ' ').trim()
        if (clean) onFinalSegmentRef.current?.(clean)
        setState((s) => ({ ...s, interimText: interim }))
      }
      rec.onerror = (e) => {
        // Expected while tearing down or when iOS ends a session abruptly
        if (e.error === 'no-speech' || e.error === 'aborted') return
        if (keepAliveRef.current && (e.error === 'network' || e.error === 'audio-capture')) {
          setTimeout(() => {
            if (!keepAliveRef.current || recognitionRef.current !== rec) return
            try { rec.start() } catch { /* restart raced with stop */ }
          }, RECOGNITION_RESTART_MS)
          return
        }
        setState((s) => ({ ...s, error: `Dictation error: ${e.error}` }))
      }
      rec.onend = () => {
        // Chrome and iOS Safari end recognition after silence — restart while the session is live
        if (!keepAliveRef.current || stoppingRef.current) return
        const delay = isIosSafari() ? RECOGNITION_RESTART_MS : 0
        setTimeout(() => {
          if (!keepAliveRef.current || stoppingRef.current || recognitionRef.current !== rec) return
          try { rec.start() } catch { /* already restarted or stop in flight */ }
        }, delay)
      }
      stoppingRef.current = false
      keepAliveRef.current = true
      rec.start()
      recognitionRef.current = rec
      interimRef.current = ''
      void requestWakeLock()

      const startedAt = Date.now()
      startedAtRef.current = startedAt
      timerRef.current = setInterval(() => {
        setState((s) => ({ ...s, elapsed: Math.floor((Date.now() - startedAt) / 1000) }))
      }, 1000)
      setState({ recording: true, interimText: '', error: null, elapsed: 0 })
    } catch {
      setState((s) => ({ ...s, error: 'Microphone access was denied. Allow the mic permission, or type your dream instead.' }))
    }
  }, [requestWakeLock])

  const stop = useCallback(async (): Promise<{ audio: Blob | null; durationSeconds: number }> => {
    if (stoppingRef.current) {
      return { audio: null, durationSeconds: Math.floor((Date.now() - startedAtRef.current) / 1000) }
    }
    stoppingRef.current = true
    keepAliveRef.current = false

    const durationSeconds = startedAtRef.current
      ? Math.floor((Date.now() - startedAtRef.current) / 1000)
      : 0

    let audio: Blob | null = null
    const recorder = recorderRef.current
    recorderRef.current = null
    const mimeType = recorder?.mimeType || 'audio/webm'

    try {
      stopRecognition()

      if (recorder && recorder.state !== 'inactive') {
        audio = await Promise.race([
          new Promise<Blob | null>((resolve) => {
            recorder.onstop = () => {
              resolve(chunksRef.current.length ? new Blob(chunksRef.current, { type: mimeType }) : null)
            }
            try { recorder.stop() } catch {
              resolve(chunksRef.current.length ? new Blob(chunksRef.current, { type: mimeType }) : null)
            }
          }),
          new Promise<Blob | null>((resolve) => {
            setTimeout(() => {
              resolve(chunksRef.current.length ? new Blob(chunksRef.current, { type: mimeType }) : null)
            }, 2500)
          }),
        ])
      } else if (chunksRef.current.length) {
        audio = new Blob(chunksRef.current, { type: mimeType })
      }
    } finally {
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = null
      releaseStream()
      releaseWakeLock()
      // iOS may emit a trailing result after stop(); give it a beat before flushing interim leftovers.
      await new Promise((resolve) => setTimeout(resolve, isIosSafari() ? 80 : 0))
      const leftover = interimRef.current.trim()
      interimRef.current = ''
      if (leftover) onFinalSegmentRef.current?.(leftover)
      setState((s) => ({ ...s, recording: false, interimText: '' }))
      stoppingRef.current = false
    }

    return { audio, durationSeconds }
  }, [releaseStream, releaseWakeLock, stopRecognition])

  return { ...state, start, stop }
}
