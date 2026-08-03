import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Native shell config.
 *
 * `appId` is the iOS bundle identifier. It must be globally unique on the App
 * Store and must match the identifier registered in App Store Connect — if you
 * own a domain, use its reverse form. Changing it later means registering a new
 * app record, so pick it before the first upload.
 */
const config: CapacitorConfig = {
  appId: 'com.jgerms.dreamcatcher',
  appName: 'DreamCatcher',
  webDir: 'dist',
  ios: {
    // The app already paints its own safe-area padding with env(safe-area-inset-*)
    // and ships `viewport-fit=cover`, so letting the webview run full-bleed under
    // the status bar and home indicator keeps the phone layout identical to the
    // installed-PWA one instead of double-insetting it.
    contentInset: 'never',
    backgroundColor: '#0a0c14',
  },
}

export default config
