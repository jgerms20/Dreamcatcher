import { useCallback, useEffect, useRef, useState } from 'react'
import { isNativeApp } from './platform'

/**
 * Dictation has two completely different engines behind one hook.
 *
 * In a browser it's the Web Speech API. Inside the packaged iOS app it can't
 * be: WKWebView does not expose `SpeechRecognition` or `webkitSpeechRecognition`
 * at all — that API exists in Safari the browser, not in the webview Capacitor
 * embeds. A native build that kept the web path would show a permanently
 * disabled record button, which is the whole point of the app. So on native we
 * bridge to SFSpeechRecognizer through @capacitor-community/speech-recognition.
 *
 * Both engines feed the same contract: interim words stream into `interimText`
 * for ghost-text rendering, and every committed chunk is handed to
 * `onFinalSegment` exactly once. The consumer owns the narrative string; this
 * hook never buffers or rewrites it.
 */

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

/**
 * Can this build dictate at all?
 *
 * Called during render, so it stays synchronous. On native we answer
 * optimistically — the real capability and permission check needs an async
 * round trip to the native layer, and it runs inside start(), which reports
 * anything that actually fails through `error`.
 */
export function dictationSupported(): boolean {
  if (isNativeApp()) return true
  return Boolean(getRecognitionCtor()) && Boolean(navigator.mediaDevices?.getUserMedia)
}

/** True when a dictation session also retains the raw audio for re-transcription. */
export function dictationKeepsAudio(): boolean {
  return !isNativeApp()
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

type NativePlugin = typeof import('@capacitor-community/speech-recognition')['SpeechRecognition']

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
  const interimRef = useRef('')
  const nativeRef = useRef<NativePlugin | null>(null)
  const onFinalSegmentRef = useRef(options.onFinalSegment)
  onFinalSegmentRef.current = options.onFinalSegment

  /** Hand a finished chunk to the consumer exactly once, and clear the interim buffer. */
  const commitInterim = useCallback(() => {
    const clean = interimRef.current.replace(/\s+/g, ' ').trim()
    interimRef.current = ''
    if (clean) onFinalSegmentRef.current?.(clean)
  }, [])

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    const startedAt = Date.now()
    timerRef.current = setInterval(() => {
      setState((s) => ({ ...s, elapsed: Math.floor((Date.now() - startedAt) / 1000) }))
    }, 1000)
  }, [])

  const cleanup = useCallback(() => {
    keepAliveRef.current = false
    recognitionRef.current?.stop()
    recognitionRef.current = null
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (nativeRef.current) {
      void nativeRef.current.stop().catch(() => {})
      void nativeRef.current.removeAllListeners().catch(() => {})
      nativeRef.current = null
    }
  }, [])

  useEffect(() => cleanup, [cleanup])

  // ---------------------------------------------------------------- native --

  const startNative = useCallback(async () => {
    let plugin: NativePlugin
    try {
      ;({ SpeechRecognition: plugin } = await import('@capacitor-community/speech-recognition'))
    } catch {
      setState((s) => ({ ...s, error: 'The speech engine failed to load. Type your dream below instead.' }))
      return
    }

    try {
      const { available } = await plugin.available()
      if (!available) {
        setState((s) => ({ ...s, error: 'Speech recognition is unavailable on this device. Type your dream below instead.' }))
        return
      }

      let status = (await plugin.checkPermissions()).speechRecognition
      if (status !== 'granted') status = (await plugin.requestPermissions()).speechRecognition
      if (status !== 'granted') {
        setState((s) => ({
          ...s,
          error: 'Microphone and speech access are off. Turn them on in Settings › DreamCatcher, or type your dream below.',
        }))
        return
      }

      await plugin.removeAllListeners()
      nativeRef.current = plugin
      interimRef.current = ''

      // iOS reports the whole utterance so far on every partial, not a delta —
      // so this is the current session's text, not something to append to.
      await plugin.addListener('partialResults', (data: { matches?: string[] }) => {
        const text = data.matches?.[0] ?? ''
        interimRef.current = text
        setState((s) => ({ ...s, interimText: text }))
      })

      // SFSpeechRecognizer ends a session on its own after a silence gap or its
      // ~1 minute ceiling. Commit what it heard and immediately open another one
      // so a long, rambling dream is never truncated mid-sentence.
      await plugin.addListener('listeningState', (data: { status?: string }) => {
        if (data.status !== 'stopped' || !keepAliveRef.current) return
        commitInterim()
        setState((s) => ({ ...s, interimText: '' }))
        void plugin
          .start({ language: navigator.language || 'en-US', partialResults: true, popup: false })
          .catch(() => {})
      })

      keepAliveRef.current = true
      startTimer()
      setState({ recording: true, interimText: '', error: null, elapsed: 0 })

      // Not awaited: with partialResults the transcript arrives through the
      // listeners above, and on some versions this promise stays pending for
      // the life of the session.
      void plugin
        .start({ language: navigator.language || 'en-US', partialResults: true, popup: false })
        .catch(() => {})
    } catch {
      setState((s) => ({ ...s, error: 'Could not start dictation. Type your dream below instead.' }))
      cleanup()
    }
  }, [cleanup, commitInterim, startTimer])

  const stopNative = useCallback(async (): Promise<{ audio: Blob | null }> => {
    keepAliveRef.current = false
    const plugin = nativeRef.current
    try {
      await plugin?.stop()
    } catch {
      // Already stopped — the transcript we have is still good.
    }
    // Let a trailing partialResults callback land before we treat the buffer as final.
    await new Promise((resolve) => setTimeout(resolve, 120))
    commitInterim()
    await plugin?.removeAllListeners().catch(() => {})
    nativeRef.current = null
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    setState((s) => ({ ...s, recording: false, interimText: '' }))
    // The native recognizer owns the microphone for the duration of a session,
    // so there is no parallel MediaRecorder capture to hand back here.
    return { audio: null }
  }, [commitInterim])

  // ------------------------------------------------------------------- web --

  const startWeb = useCallback(async () => {
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
        if (e.error === 'no-speech') return // keep listening
        setState((s) => ({ ...s, error: `Dictation error: ${e.error}` }))
      }
      rec.onend = () => {
        // Chrome ends recognition after silence — restart while the session is live
        if (keepAliveRef.current) {
          try { rec.start() } catch { /* already restarted */ }
        }
      }
      keepAliveRef.current = true
      rec.start()
      recognitionRef.current = rec
      interimRef.current = ''

      startTimer()
      setState({ recording: true, interimText: '', error: null, elapsed: 0 })
    } catch {
      setState((s) => ({ ...s, error: 'Microphone access was denied. Allow the mic permission, or type your dream instead.' }))
    }
  }, [startTimer])

  const stopWeb = useCallback(async (): Promise<{ audio: Blob | null }> => {
    keepAliveRef.current = false
    recognitionRef.current?.stop()
    const recorder = recorderRef.current
    const audio = await new Promise<Blob | null>((resolve) => {
      if (!recorder || recorder.state === 'inactive') {
        resolve(chunksRef.current.length ? new Blob(chunksRef.current, { type: 'audio/webm' }) : null)
        return
      }
      recorder.onstop = () => {
        resolve(chunksRef.current.length ? new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }) : null)
      }
      recorder.stop()
    })
    cleanup()
    // Give a trailing final-flush 'result' event (some browsers emit one on stop()) a beat to arrive
    // before we treat whatever interim text remains as the last word on this session.
    await new Promise((resolve) => setTimeout(resolve, 0))
    commitInterim()
    setState((s) => ({ ...s, recording: false, interimText: '' }))
    return { audio }
  }, [cleanup, commitInterim])

  // ----------------------------------------------------------------- shared --

  const start = useCallback(async () => {
    if (isNativeApp()) return startNative()
    return startWeb()
  }, [startNative, startWeb])

  const stop = useCallback(async (): Promise<{ audio: Blob | null }> => {
    if (isNativeApp()) return stopNative()
    return stopWeb()
  }, [stopNative, stopWeb])

  return { ...state, start, stop }
}
