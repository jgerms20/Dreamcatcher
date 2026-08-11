import type { Dream } from '../types'
import { RUBRIC_DIMENSIONS } from './rubric'

// Fallback interview questions used when no Anthropic key is configured.
// Keyed by rubric dimension so we can target the weakest areas of recall.
// Written as sensory/spatial triggers — zoom in, walk back, orient in space — not abstract prompts.
const BANK: Record<string, string[]> = {
  setting: [
    "Close your eyes and drop back into the dream. Where are your feet? Describe the ground — hard, soft, wet, missing?",
    "Look up from where you stand. What do you see above you — ceiling, sky, nothing, something wrong?",
    "Turn slowly in place. What is behind you that you only noticed now?",
    "Was the space indoors or outdoors — and did it stay that way, or did the place shift mid-scene?",
    "What was the light doing — dawn, noon glare, flickering lamp, total darkness with one bright thing?",
    "Trace the edges of the space. Where did it end — walls, horizon, fog, a doorway you never opened?",
    "Did the place resemble anywhere you know in waking life, even if two locations were stitched together?",
  ],
  characters: [
    "Who was closest to you in the dream? Zoom in on their face — hair, eyes, expression, anything off.",
    "Pick the most vivid person or creature. What were their hands doing? What were they wearing?",
    "Was anyone watching you from a distance? Where were they standing relative to you?",
    "Did anyone behave out of character — too calm, too angry, or like two people merged into one?",
    "How did the others react when you moved or spoke — step closer, step back, ignore you entirely?",
    "Was there a figure you only sensed — a presence in a doorway, behind glass, just out of sight?",
  ],
  emotions: [
    "Where in your body was the strongest feeling — chest, stomach, throat, hands? Describe the sensation.",
    "At the peak moment of the dream, what did your body want to do — run, hide, reach, freeze?",
    "Did the emotional tone shift suddenly? What was happening in the scene the instant it changed?",
    "Was there a feeling that didn't match the scene — calm during danger, grief during something mundane?",
    "On waking, what emotion was still sitting in your body before you fully opened your eyes?",
    "Was there dread, relief, longing, or shame you haven't named yet? Where did it live in the dream?",
  ],
  sensory: [
    "Pick one object in the dream and describe its color as precisely as you can — even if the color was impossible.",
    "What was the loudest or most noticeable sound — or was there a silence that felt heavy?",
    "Reach out in memory: what texture did you touch — skin, fabric, metal, something that shouldn't exist?",
    "Was there a smell or taste — familiar, rotten, sweet, absent when it should have been there?",
    "Did your body feel different — weightless, underwater, too large for the room, unable to move your legs?",
    "What is the single sharpest sensory detail still vivid — a flash of light, a temperature, a vibration?",
  ],
  narrative: [
    "Go to the earliest moment you can reach. What is the very first image — before anything happened?",
    "From that first image, walk forward step by step. What happened next, and next after that?",
    "Was there a turning point — a door opened, someone spoke, the ground dropped? Describe that exact instant.",
    "Did the dream jump between scenes? What was the last thing in scene A and the first thing in scene B?",
    "What were you trying to do — find someone, escape, hide, perform? Did you get closer or further away?",
    "Right before the dream ended, what was in motion — walking, falling, talking, watching?",
  ],
  dialogue: [
    "Did anyone speak? Say their exact words out loud now — even a syllable or wrong word.",
    "Was there writing you tried to read — a sign, screen, book, tattoo? What did the letters look like?",
    "Did you understand something without words — a message, warning, or joke passed without speaking?",
    "Did you say anything — out loud, in a whisper, or only in your head? What were your exact words?",
    "Was there a voice that didn't belong to anyone visible — narrator, echo, your own voice from elsewhere?",
    "Did any word or phrase repeat — a name, a number, something nonsense that stuck?",
  ],
  lucidity: [
    "At any point, did something feel wrong enough to think \"this can't be real\"? What was the wrong thing?",
    "Did you try to change something — fly, run faster, will a door open? What happened when you tried?",
    "Was there anything absurd that felt completely normal at the time? Describe it as you experienced it then.",
    "Whose eyes were you seeing through — your own, someone else's, or floating above the scene?",
    "Did you know you were dreaming while still inside it — even briefly? What tipped you off?",
  ],
  resolution: [
    "How did the dream end — fade out, snap awake, dissolve, someone pulled you out?",
    "What was the last image before waking — freeze on it and describe every detail you can still see.",
    "What woke you — alarm, noise, need to move, or the dream simply ran out?",
    "What image is still stuck behind your eyes — the one that returns when you close them?",
    "If the dream continued one more minute, what do you sense would have happened next?",
    "Is there a fragment at the edge — half a face, a hallway, a feeling — that keeps almost appearing then vanishing?",
  ],
}

export function nextStaticQuestion(dream: Dream): { question: string; dimension: string } {
  const asked = new Set(dream.interview.map((t) => t.question))
  // Prefer the weakest-scored dimensions when we have a rubric, else round-robin
  const order = dream.rubric
    ? [...RUBRIC_DIMENSIONS].sort(
        (a, b) => (dream.rubric!.scores[a.id]?.score ?? 0) - (dream.rubric!.scores[b.id]?.score ?? 0),
      )
    : RUBRIC_DIMENSIONS
  for (const dim of order) {
    const q = BANK[dim.id].find((question) => !asked.has(question))
    if (q) return { question: q, dimension: dim.id }
  }
  return {
    question:
      "Close your eyes for a moment. Is there anything still hovering at the edge — a color, a sound, a place, a feeling — that almost came back just now?",
    dimension: 'resolution',
  }
}
