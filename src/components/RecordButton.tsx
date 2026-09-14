import { useMemo } from 'react'

export interface RecordButtonProps {
  /** Whether dictation/recording is currently active. */
  recording: boolean
  /** Seconds elapsed in the current recording session. */
  elapsedSeconds: number
  /** Whether the browser can record at all — disables the control when false. */
  supported: boolean
  onStart: () => void
  onStop: () => void
  disabled?: boolean
}

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * The hero control of the capture screen: a large gold-ringed circular button
 * that morphs from a minimal microphone glyph into a rounded "stop" square
 * when recording, surrounded by a breathing sonar halo. Pure inline SVG + CSS
 * — no emoji, no external icon set. Respects prefers-reduced-motion.
 */
export default function RecordButton({
  recording,
  elapsedSeconds,
  supported,
  onStart,
  onStop,
  disabled = false,
}: RecordButtonProps) {
  const isDisabled = disabled || !supported
  const timeLabel = useMemo(() => formatElapsed(elapsedSeconds), [elapsedSeconds])

  return (
    <div className="rb-root">
      <style>{`
        .rb-root {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.9rem;
        }
        .rb-stage {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: clamp(104px, 30vw, 128px);
          height: clamp(104px, 30vw, 128px);
        }
        .rb-ring {
          position: absolute;
          inset: 0;
          border-radius: 9999px;
          border: 1px solid rgba(217, 146, 174, 0.45);
          opacity: 0;
          pointer-events: none;
        }
        .rb-ring-1 { animation: rb-sonar 3.2s cubic-bezier(0.22, 1, 0.36, 1) infinite; }
        .rb-ring-2 { animation: rb-sonar 3.2s cubic-bezier(0.22, 1, 0.36, 1) infinite; animation-delay: 1.05s; }
        .rb-ring-3 { animation: rb-sonar 3.2s cubic-bezier(0.22, 1, 0.36, 1) infinite; animation-delay: 2.1s; }
        @keyframes rb-sonar {
          0% { opacity: 0.45; transform: scale(0.94); }
          70% { opacity: 0; transform: scale(1.5); }
          100% { opacity: 0; transform: scale(1.5); }
        }

        .rb-button {
          position: relative;
          width: 100%;
          height: 100%;
          border-radius: 9999px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(60% 60% at 50% 38%, rgba(227, 168, 118, 0.13), transparent 70%),
            linear-gradient(160deg, #232c4f 0%, #1a2140 65%);
          border: 1.5px solid rgba(227, 168, 118, 0.5);
          box-shadow:
            0 0 0 1px rgba(11, 15, 30, 0.4),
            0 1px 0 rgba(244, 242, 255, 0.06) inset,
            0 0 30px -10px rgba(227, 168, 118, 0.4);
          transition: transform 0.3s var(--ease-flow, cubic-bezier(0.22, 1, 0.36, 1)), border-color 0.4s ease, box-shadow 0.4s ease, background 0.4s ease;
        }
        .rb-button:hover:not(:disabled) { transform: scale(1.035); }
        .rb-button:active:not(:disabled) { transform: scale(0.97); }
        .rb-button:focus-visible {
          outline: none;
          box-shadow:
            0 0 0 3px rgba(227, 168, 118, 0.32),
            0 0 26px -8px rgba(227, 168, 118, 0.5);
        }
        .rb-button:disabled { cursor: not-allowed; filter: grayscale(0.6); opacity: 0.45; }

        .rb-button-active {
          border-color: rgba(217, 146, 174, 0.7);
          background: radial-gradient(60% 60% at 50% 40%, rgba(217, 146, 174, 0.2), transparent 70%),
            linear-gradient(160deg, #241d3c 0%, #171331 65%);
          animation: rb-breathe 2.6s ease-in-out infinite;
        }
        @keyframes rb-breathe {
          0%, 100% {
            box-shadow:
              0 0 0 0 rgba(217, 146, 174, 0.38),
              0 1px 0 rgba(244, 242, 255, 0.06) inset,
              0 0 30px -6px rgba(217, 146, 174, 0.5);
          }
          50% {
            box-shadow:
              0 0 0 12px rgba(217, 146, 174, 0),
              0 1px 0 rgba(244, 242, 255, 0.06) inset,
              0 0 42px -4px rgba(217, 146, 174, 0.7);
          }
        }

        .rb-icon {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: opacity 0.36s cubic-bezier(0.22, 1, 0.36, 1), transform 0.36s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .rb-icon-mic { color: var(--color-dusk-200, #dde2f2); }
        .rb-icon-stop { color: var(--color-rose-dream, #d992ae); }
        .rb-icon-hidden-out { opacity: 0; transform: scale(0.5) rotate(-14deg); }
        .rb-icon-hidden-in { opacity: 0; transform: scale(0.5) rotate(14deg); }

        .rb-timer {
          min-height: 1.4rem;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-variant-numeric: tabular-nums;
          font-size: 0.85rem;
          color: var(--color-dusk-300, #c7cde6);
        }
        .rb-dot {
          width: 6px;
          height: 6px;
          border-radius: 9999px;
          background: var(--color-rose-dream, #d992ae);
          animation: rb-dot-pulse 1.6s ease-in-out infinite;
        }
        @keyframes rb-dot-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }

        @media (prefers-reduced-motion: reduce) {
          .rb-ring-1, .rb-ring-2, .rb-ring-3, .rb-button-active, .rb-dot {
            animation: none;
          }
          .rb-button, .rb-icon {
            transition: none;
          }
          .rb-ring { display: none; }
        }
      `}</style>

      <div className="rb-stage">
        {recording && (
          <>
            <span className="rb-ring rb-ring-1" aria-hidden="true" />
            <span className="rb-ring rb-ring-2" aria-hidden="true" />
            <span className="rb-ring rb-ring-3" aria-hidden="true" />
          </>
        )}
        <button
          type="button"
          onClick={recording ? onStop : onStart}
          disabled={isDisabled}
          aria-pressed={recording}
          aria-label={recording ? 'Stop recording' : 'Start recording your dream'}
          className={`rb-button ${recording ? 'rb-button-active' : ''}`}
        >
          <span className={`rb-icon rb-icon-mic ${recording ? 'rb-icon-hidden-out' : ''}`} aria-hidden="true">
            <svg viewBox="0 0 32 32" width="38%" height="38%" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="12" y="4" width="8" height="15" rx="4" fill="currentColor" />
              <path d="M8 15a8 8 0 0 0 16 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M16 23v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M12 27h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <span className={`rb-icon rb-icon-stop ${recording ? '' : 'rb-icon-hidden-in'}`} aria-hidden="true">
            <svg viewBox="0 0 32 32" width="32%" height="32%" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="9" y="9" width="14" height="14" rx="5" fill="currentColor" />
            </svg>
          </span>
        </button>
      </div>

      <div className="rb-timer" aria-live="polite">
        {recording ? (
          <>
            <span className="rb-dot" aria-hidden="true" />
            <span>Tap to stop · {timeLabel}</span>
          </>
        ) : !supported ? (
          <span className="text-ember-300">Not supported here — try Chrome or Edge</span>
        ) : (
          <span>Tap to record</span>
        )}
      </div>
    </div>
  )
}
