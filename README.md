# 🌙 DreamCatcher

Record, expand, interpret, and **watch** your dreams.

**Live app: https://jgerms20.github.io/Dreamcatcher/**

DreamCatcher is a dream journal built for the first fragile minute after waking — and everything that comes after:

- **🎙️ Catch it fast** — dictate the dream live (speech-to-text in the browser), import a voice memo, or type. The audio is kept alongside the transcript.
- **🔍 Deepen the recall** — an adaptive interview asks the single best next question about *your* dream ("You mentioned water — was it moving? What color was the light?"), and an 8-dimension recall rubric scores how completely you remembered it (radar chart + 0–100 score).
- **🔮 Interpret it** — four lenses side by side: Jungian, Freudian, Cognitive/Neuroscience, and Cultural/Spiritual — each explains *where its ideas come from*, and links symbols into the built-in encyclopedia.
- **📖 Symbol encyclopedia** — the mainstays of dreaming (teeth falling out, waves, flying, being chased…) with meanings across traditions. Works standalone, no dream required.
- **🎬 Dream Studio** — Claude writes a cinematic prompt from your full dream record; fal.ai renders it into a short video saved right into the entry. Or copy Runway/Pika/ComfyUI-tuned prompts and generate elsewhere.
- **▶️ Replay Center** — your dreams as an instant movie reel, played like shorts.
- **✨ Insights** — recurring symbols, characters and emotions across your whole journal, mood trends over time, and AI compare/contrast between any two dreams.
- **🛌 Sleep & Vitals** — log sleep duration, quality, stress, caffeine, alcohol, exercise, screens; DreamCatcher computes which factors actually correlate with your dream recall, vividness and mood.

## Privacy model

Everything is **local-first**: dreams, audio, video and sleep logs live in your browser's IndexedDB on your device. There is no server and no account. API keys are stored in your browser and used only for direct calls to Anthropic / fal.ai. Export/import your journal as JSON from Settings.

## Setup (2 keys, ~3 minutes)

The journal, dictation, question bank, symbol encyclopedia, sleep log and insights all work with **zero keys**. Two optional keys unlock the AI features:

| Key | Unlocks | Where to get it |
|---|---|---|
| **Anthropic** | recall scoring, adaptive interview, interpretation, comparisons, video prompts | [platform.claude.com](https://platform.claude.com/) → API keys |
| **fal.ai** | video generation (Kling, Veo, LTX, Hunyuan, …) + audio-file transcription | [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys) |

Paste them into **Settings** in the app. Use the model pickers to trade cost vs. quality (Claude Opus 4.8 default; Haiku for cheap runs — LTX for fast video; Kling/Veo for cinematic).

## Development

```bash
npm install
npm run dev       # local dev server
npm run build     # type-check + production build
```

Stack: React 19 + TypeScript + Vite + Tailwind 4 · zustand + IndexedDB (`idb`) · `@anthropic-ai/sdk` (browser mode) · `@fal-ai/client` · deployed by GitHub Actions to GitHub Pages.

### Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds and publishes to GitHub Pages. If the first deploy fails with a Pages error, enable it once: **repo Settings → Pages → Source: "GitHub Actions"**, then re-run the workflow.

## Roadmap

- Wearable sleep data sync (Oura / Fitbit / Apple Health) to replace manual sleep entry
- Optional encrypted cloud backup
- Image generation for dream "posters" alongside video
- Recurring-dream detection across entries (fuzzy matching)
