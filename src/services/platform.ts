/**
 * Where is this copy of the app running?
 *
 * Deliberately dependency-free: the Capacitor runtime injects a `Capacitor`
 * global into the webview before any app code evaluates, so we can answer this
 * without pulling @capacitor/core into the landing chunk. The cold open is
 * ~200ms and every kilobyte on the critical path is spent against a dream the
 * user is actively forgetting.
 */

interface CapacitorGlobal {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
}

function bridge(): CapacitorGlobal | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor
}

/** True inside the Capacitor iOS/Android shell, false in any browser tab. */
export function isNativeApp(): boolean {
  const cap = bridge()
  if (cap?.isNativePlatform) return cap.isNativePlatform()
  // Fallback for the window between webview load and bridge injection: the
  // native shell serves the bundle from capacitor://localhost, never http(s).
  return typeof window !== 'undefined' && window.location.protocol === 'capacitor:'
}

/** True only in the packaged iOS app (the TestFlight / App Store build). */
export function isNativeIOS(): boolean {
  return isNativeApp() && bridge()?.getPlatform?.() === 'ios'
}
