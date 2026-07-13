import { useEffect, useState } from 'react'
import { blobsDB } from '../db'
import { fmtDate } from './DreamCard'
import type { Dream } from '../types'

// Fullscreen shorts-style sequential player for dreams that have videos.
export default function ReplayMode({ dreams, onClose }: { dreams: Dream[]; onClose: () => void }) {
  const [index, setIndex] = useState(0)
  const [src, setSrc] = useState<string | null>(null)
  const dream = dreams[index]

  useEffect(() => {
    let url: string | null = null
    let cancelled = false
    async function load() {
      setSrc(null)
      if (!dream) return
      if (dream.videoId) {
        const stored = await blobsDB.get(dream.videoId)
        if (stored && !cancelled) {
          url = URL.createObjectURL(stored.blob)
          setSrc(url)
        }
      } else if (dream.videoUrl) {
        setSrc(dream.videoUrl)
      }
    }
    void load()
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [dream])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, dreams.length - 1))
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dreams.length, onClose])

  if (!dream) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-night-950/95">
      <div className="flex items-center justify-between border-b border-night-700/60 p-4">
        <div>
          <p className="text-xs text-dusk-300/70">{fmtDate(dream.dreamDate)} · {index + 1} / {dreams.length}</p>
          <h3 className="font-display text-lg text-dusk-100">{dream.title || 'Untitled dream'}</h3>
        </div>
        <button onClick={onClose} className="btn-ghost text-xl transition-colors hover:text-dusk-100" aria-label="Close replay">✕</button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-4">
        {src ? (
          <video
            key={src}
            src={src}
            autoPlay
            controls
            onEnded={() => setIndex((i) => (i + 1 < dreams.length ? i + 1 : i))}
            className="max-h-full max-w-full rounded-2xl"
          />
        ) : (
          <p className="text-dusk-300">Loading…</p>
        )}
      </div>
      <div className="flex items-center justify-center gap-4 border-t border-night-700/60 p-4">
        <button onClick={() => setIndex((i) => Math.max(i - 1, 0))} disabled={index === 0} className="btn-secondary">← Prev</button>
        <button onClick={() => setIndex((i) => Math.min(i + 1, dreams.length - 1))} disabled={index >= dreams.length - 1} className="btn-secondary">Next →</button>
      </div>
    </div>
  )
}
