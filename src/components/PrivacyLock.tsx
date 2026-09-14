import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useLockStore, verifyPasscode } from '../store/privacy'

const MAX_DIGITS = 6

/**
 * Renders `children` once unlocked (or whenever the lock is off). Otherwise
 * shows a full-screen veil that blocks the app until the correct passcode
 * is entered. Needs to be mounted high in the tree (around the routed
 * content) in App.tsx by another agent — not done here, see report.
 */
export default function PrivacyLock({ children }: { children: ReactNode }) {
  const lockEnabled = useLockStore((s) => s.lockEnabled)
  const verifier = useLockStore((s) => s.verifier)
  const unlocked = useLockStore((s) => s.unlocked)

  if (!lockEnabled || !verifier || unlocked) return <>{children}</>

  return <LockVeil />
}

function LockVeil() {
  const [code, setCode] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function attempt(candidate: string) {
    if (candidate.length < 4 || checking) return
    setChecking(true)
    const ok = await verifyPasscode(candidate)
    setChecking(false)
    if (!ok) {
      setError(true)
      setCode('')
      setShake(true)
      inputRef.current?.focus()
      setTimeout(() => setShake(false), 480)
    }
  }

  function onChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, MAX_DIGITS)
    setCode(digits)
    setError(false)
    if (digits.length === MAX_DIGITS) void attempt(digits)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void attempt(code)
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      style={{
        background:
          'radial-gradient(ellipse 65% 50% at 82% -8%, rgba(143,180,234,0.18), transparent),' +
          'radial-gradient(ellipse 60% 46% at -6% 10%, rgba(227,168,118,0.1), transparent),' +
          'radial-gradient(ellipse 55% 42% at 40% 100%, rgba(217,146,174,0.1), transparent),' +
          '#0b0f1e',
      }}
    >
      <style>{`
        @keyframes lock-veil-shake {
          10%, 90% { transform: translateX(-2px); }
          20%, 80% { transform: translateX(4px); }
          30%, 50%, 70% { transform: translateX(-8px); }
          40%, 60% { transform: translateX(8px); }
        }
        .lock-veil-shake { animation: lock-veil-shake 0.48s ease-in-out; }
        @media (prefers-reduced-motion: reduce) {
          .lock-veil-shake { animation: none; }
        }
      `}</style>
      <form
        onSubmit={onSubmit}
        className={`card card-glow w-full max-w-sm p-8 text-center ${shake ? 'lock-veil-shake' : ''}`}
      >
        <p className="label justify-center text-center">Dreamcatcher</p>
        <h1 className="font-display text-3xl text-dusk-100">
          Sealed <em>for now</em>
        </h1>
        <p className="mt-2 text-sm text-dusk-300">Enter your passcode to open tonight&rsquo;s journal.</p>

        <div className="relative mt-7">
          <input
            ref={inputRef}
            value={code}
            onChange={(e) => onChange(e.target.value)}
            type="tel"
            inputMode="numeric"
            autoComplete="off"
            aria-label="Passcode"
            className="absolute inset-0 h-14 w-full cursor-default opacity-0"
          />
          <div className="flex justify-center gap-2" aria-hidden="true">
            {Array.from({ length: MAX_DIGITS }).map((_, i) => (
              <div
                key={i}
                className={`flex h-14 w-9 items-center justify-center rounded-2xl border text-2xl transition-colors duration-300 ${
                  code[i]
                    ? 'border-dusk-400/60 bg-dusk-400/10 text-dusk-100'
                    : 'border-night-600/60 bg-night-800/60 text-dusk-400/30'
                }`}
              >
                {code[i] ? '•' : ''}
              </div>
            ))}
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-ember-300">Wrong passcode — try again.</p>}

        <button type="submit" disabled={code.length < 4 || checking} className="btn-primary mt-6 w-full">
          {checking ? 'Checking…' : 'Unlock'}
        </button>
        <p className="mt-4 text-xs text-dusk-400">4–6 digits. Set or changed anytime in Settings.</p>
      </form>
    </div>
  )
}
