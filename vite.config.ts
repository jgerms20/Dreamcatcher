import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Deployed to GitHub Pages at https://jgerms20.github.io/Dreamcatcher/
export default defineConfig({
  base: '/Dreamcatcher/',
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
})
