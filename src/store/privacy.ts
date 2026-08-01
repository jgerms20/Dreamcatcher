import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/*
  Passcode lock. We never store the raw passcode — only a salted SHA-256
  verifier (crypto.subtle) plus the salt, both persisted to localStorage.
  `unlocked` is deliberately excluded from persistence (see `partialize`
  below) so every fresh page load starts locked again whenever a passcode
  is set and the lock is enabled.

  This is a deterrent against casual snooping on a shared/unlocked device —
  NOT encryption. Anyone who opens devtools and reads localStorage directly
  can still see dream text; the lock only gates the UI.
*/

interface LockState {
  lockEnabled: boolean
  salt: string | null
  verifier: string | null
  /** In-memory only — never persisted, so the app re-locks on reload. */
  unlocked: boolean
  setPasscode: (code: string) => Promise<void>
  verifyPasscode: (code: string) => Promise<boolean>
  clearPasscode: () => void
  setLockEnabled: (enabled: boolean) => void
  lock: () => void
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function randomSaltHex(byteLength = 16): string {
  const arr = new Uint8Array(byteLength)
  crypto.getRandomValues(arr)
  return toHex(arr)
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toHex(new Uint8Array(digest))
}

export const useLockStore = create<LockState>()(
  persist(
    (set, get) => ({
      lockEnabled: false,
      salt: null,
      verifier: null,
      unlocked: false,

      async setPasscode(code: string) {
        const salt = randomSaltHex()
        const verifier = await sha256Hex(`${salt}:${code}`)
        // Setting a passcode unlocks immediately (the person doing it is,
        // by definition, standing in front of the device right now); the
        // next reload will require it.
        set({ salt, verifier, lockEnabled: true, unlocked: true })
      },

      async verifyPasscode(code: string) {
        const { salt, verifier } = get()
        if (!salt || !verifier) return false
        const candidate = await sha256Hex(`${salt}:${code}`)
        const ok = candidate === verifier
        if (ok) set({ unlocked: true })
        return ok
      },

      clearPasscode() {
        set({ salt: null, verifier: null, lockEnabled: false, unlocked: true })
      },

      setLockEnabled(enabled: boolean) {
        set((s) => ({
          // can only ever be "on" if a passcode actually exists
          lockEnabled: enabled && !!s.verifier,
          unlocked: enabled ? s.unlocked : true,
        }))
      },

      lock() {
        set({ unlocked: false })
      },
    }),
    {
      name: 'dreamcatcher-privacy',
      version: 1,
      // Only these three fields are meant to survive a reload — `unlocked`
      // and the action functions are intentionally left out.
      partialize: (s) => ({ lockEnabled: s.lockEnabled, salt: s.salt, verifier: s.verifier }),
    },
  ),
)

export function setPasscode(code: string): Promise<void> {
  return useLockStore.getState().setPasscode(code)
}

export function verifyPasscode(code: string): Promise<boolean> {
  return useLockStore.getState().verifyPasscode(code)
}

export function clearPasscode(): void {
  useLockStore.getState().clearPasscode()
}

/**
 * True when the current tab was opened with `?preview=1` in the query
 * string (placed before the `#/...` HashRouter route so it survives
 * hash-based routing). Settings uses this to open a "preview as a new
 * visitor" tab; wiring it into the actual data-loading path (so preview
 * tabs skip loading real dreams) is not done here — see report.
 */
export function isPreviewMode(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return new URLSearchParams(window.location.search).get('preview') === '1'
  } catch {
    return false
  }
}
