# DreamCatcher overnight polish — design brief

**Date:** 2026-08-10  
**Decision:** Interpretation option **B** — upgrade Cultural/Spiritual into a deep multi-tradition synthesizer (keep lens id `spiritual` for saved dreams).

## Goal

Turn the morning-after prototype into something that feels like a real, beneficial night-capture tool: reliable voice capture on iPhone, a recall interview that actually recovers fading dreams, a synthesis reading worth reading, and a symbols encyclopedia that invites browsing instead of fighting you.

## Workstreams (parallel)

### 1. Capture / iOS recording
- Live transcript should keep the page/textarea scrolled to new words while recording.
- Stop must be reliable (sticky stop control while recording; robust `stop()`).
- After recording: show **duration** (e.g. `1:24`) and a **discard** control; keep attach-to-dream behavior.
- Prefer Safari-friendly Web Speech patterns; document PWA vs Safari quirks in UI copy if needed.
- Do not break desktop Chrome dictation.

### 2. Synthesis interpretation (replaces Spiritual display)
- Keep `LensId = 'spiritual'` in storage.
- Rename UI to something like **Synthesis** / **Symbolic synthesis**.
- Prompt pulls across: astrology (archetypal planets/signs, not natal chart claims without birth data), numerology (significant numbers/dates in the dream), religious texts & parables, myth, and literary echoes.
- Must cite *why* each thread applies to *this* dream; hypotheses not verdicts; end with a reflective question.
- Auto-picker may still choose this lens when the dream is symbol-heavy.

### 3. Recall interview
- On `?fresh=1` dreams, auto-open the interview thread once.
- Questions must be concrete memory triggers (sensory, spatial, timeline, edge-of-memory).
- Improve static bank + keep AI path; remove emoji clutter where it hurts polish.
- Flow: catch → deepen recall → interpret.

### 4. Symbols page
- Less accordion-in-a-grid clunk.
- Clearer browse: one category focus or editorial list; search feels primary.
- Detail reading: roomy, tradition sections scannable, reflection question emphasized.
- Stay inside Night Atlas tokens (Fraunces / Newsreader / Karla, dusk/night palette). No new purple/glow aesthetic.

### 5. Dream detail polish
- Fresh banner → clear next action (recall first).
- Interpretation section copy updated for Synthesis.
- Audio block shows duration when available.

## Non-goals tonight
- Auth, sync, native app store build
- New backend
- Rewriting the symbol encyclopedia content wholesale
- Video/Dream Studio overhaul

## Success for morning test
1. iPhone Safari: tap record → words appear → scroll follows → stop works → duration shown → can discard.
2. Save dream → interview starts asking sharp recall questions.
3. Interpretation Synthesis lens reads like a thoughtful multi-tradition reading.
4. Symbols page feels calm and readable on phone.
