import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Two deploy targets, one codebase:
//   `vite build`            → GitHub Pages, served from /Dreamcatcher/
//   `vite build --mode ios` → Capacitor, served from capacitor://localhost/
// The iOS bundle is loaded off the device's own filesystem, so a repo-name
// base path would break every asset URL inside the app.
export default defineConfig(({ mode }) => ({
  base: mode === 'ios' ? '/' : '/Dreamcatcher/',
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        // Keep third-party SDKs that are only needed once a user actually
        // triggers AI (interpretation / transcription) out of the core
        // React/router chunk, and each other, so they load in parallel
        // rather than inflating one monolithic entry bundle. Route-level
        // React.lazy() in App.tsx is what actually keeps them out of the
        // very first paint for lazy routes; this chunking is what keeps
        // them cacheable and out of the main app chunk everywhere else.
        manualChunks(id) {
          // Vite's dynamic-import preload helper is used by every lazy route;
          // pin it to its own tiny chunk so rolldown's automatic grouping
          // doesn't fuse it (and therefore its whole host chunk) into the
          // critical path — that quietly defeated the anthropic/fal split.
          if (id.includes('vite/preload-helper')) return 'app-shell'
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@anthropic-ai/sdk')) return 'vendor-anthropic'
          if (id.includes('@fal-ai/client')) return 'vendor-fal'
          if (id.includes('react-router')) return 'vendor-router'
          if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) {
            return 'vendor-react'
          }
          if (id.includes('idb') || id.includes('zustand')) return 'vendor-data'
          return 'vendor'
        },
      },
    },
  },
}))
