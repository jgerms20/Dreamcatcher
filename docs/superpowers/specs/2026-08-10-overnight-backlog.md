# Overnight backlog — DreamCatcher → real app

Living checklist for the overnight push. Agents own the first four tracks; remaining items are polish follow-ups.

## Track A — Capture / iPhone (agent)
- [x] Live scroll follows transcript while recording
- [x] Sticky Stop control above bottom nav
- [x] Harden `stop()` so recording never sticks on
- [x] After stop: show duration `m:ss`
- [x] Discard/delete recording before save
- [x] Safari-vs-home-screen hint if speech flaky
- [ ] Optional: Wake Lock while recording (nice-to-have)
- [ ] Optional: vibrate/haptic on start/stop if available

## Track B — Synthesis interpretation (agent)
- [x] Rename Spiritual → Synthesis in UI (`spiritual` id kept)
- [x] Rich prompt: astrology archetypes, numerology, scripture/parables, myth/literature
- [x] Auto-picker knows when Synthesis fits
- [x] Dream detail interpretation blurb updated
- [x] Readings stay hypothesis-framed + end with a question

## Track C — Recall interview (agent)
- [x] Auto-start interview on `?fresh=1`
- [x] Sharper static question bank (memory triggers)
- [x] Cleaner chat UI (less emoji chrome)
- [x] Scroll to recall section when fresh
- [x] Clear finish CTA + re-score path

## Track D — Symbols encyclopedia (agent)
- [x] Search-first layout
- [x] Single-category strip (not multi-toggle clutter)
- [x] Master–detail reading panel (mobile-friendly)
- [x] Preserve `?q=` deep links
- [x] Subtle motion, reduced-motion safe

## Track E — Dream detail & flow (coordinator)
- [x] Fresh banner prioritizes recall → interpret → studio
- [x] Audio player shows duration when known
- [x] Interpretation section reflects four lenses accurately
- [x] Reduce emoji noise on toggles/chips where easy
- [x] Ensure interview + interpretation don't fight for attention on first open

## Track F — Journal & navigation
- [x] Full-width search on mobile
- [x] Quieter filter chips (less emoji)
- [x] Empty state stays warm and actionable
- [ ] Bottom nav tap targets already OK — verify label truncation on SE sizes

## Track G — Mobile / PWA resilience
- [x] Confirm safe-area padding with sticky stop bar
- [x] Note in Settings: iPhone Safari best for dictation vs Add-to-Home-Screen
- [x] Prevent accidental navigation away while recording (beforeunload / in-app warn)
- [x] Keep Capture in critical path chunk (already)

## Track H — Quality bar
- [x] `npm run build` clean
- [x] No TypeScript errors from parallel edits
- [x] Resolve merge conflicts if two agents touched DreamDetail
- [ ] Smoke: Capture → Save → Interview → Interpretation → Symbols (morning test)

## Later (not tonight unless spare capacity)
- [ ] Onboarding one-screen: mic permission + API key nudge
- [ ] Export dream as markdown/PDF
- [ ] Recurring dream threads view
- [ ] Offline-capable capture (IndexedDB already) + offline banner
- [ ] Birth-date optional field for true natal-tinged Synthesis (opt-in privacy)
- [ ] Push/local morning reminder (needs native or notification permission strategy)
