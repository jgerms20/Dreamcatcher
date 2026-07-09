import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Deployed to GitHub Pages at https://jgerms20.github.io/Dreamcatcher/
export default defineConfig({
  base: '/Dreamcatcher/',
  plugins: [react(), tailwindcss()],
})
