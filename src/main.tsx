import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { isNativeApp } from './services/platform'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)

// Cache-first service worker for the built app shell, so a repeat open is
// near-instant (and works offline). Production only — in dev it would just
// fight with Vite's own module graph. Skipped in the native shell, where the
// bundle already lives on the device and a worker caching capacitor:// URLs
// would only add a stale layer between the app and its own files.
if (import.meta.env.PROD && !isNativeApp() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Non-fatal: the app still works without offline caching.
    })
  })
}
