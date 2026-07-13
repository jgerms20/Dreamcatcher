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
  const onFinalSegmentRef = useRef(options.onFinalSegment)
  onFinalSegmentRef.current = options.onFinalSegment

  const cleanup = useCallback(() => {
    keepAliveRef.current = false
    recognitionRef.current?.stop()
    recognitionRef.current = null
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

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

      const startedAt = Date.now()
      timerRef.current = setInterval(() => {
        setState((s) => ({ ...s, elapsed: Math.floor((Date.now() - startedAt) / 1000) }))
      }, 1000)
      setState({ recording: true, interimText: '', error: null, elapsed: 0 })
    } catch {
      setState((s) => ({ ...s, error: 'Microphone access was denied. Allow the mic permission, or type your dream instead.' }))
    }
  }, [])

  const stop = useCallback(async (): Promise<{ audio: Blob | null }> => {
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
    const leftover = interimRef.current.trim()
    interimRef.current = ''
    if (leftover) onFinalSegmentRef.current?.(leftover)
    setState((s) => ({ ...s, recording: false, interimText: '' }))
    return { audio }
  }, [cleanup])

  return { ...state, start, stop }
}
