import type { Dream } from '../types'
import { RUBRIC_DIMENSIONS } from './rubric'

// Fallback interview questions used when no Anthropic key is configured.
// Keyed by rubric dimension so we can target the weakest areas of recall.
const BANK: Record<string, string[]> = {
  setting: [
    'Close your eyes and place yourself back in the dream. Where are you standing? Describe the ground under your feet.',
    'Was the space indoors or outdoors — and did it stay that way, or did the place shift at some point?',
    'What was the light like — time of day, weather, any unusual sky?',
    'Did the place resemble anywhere you know in waking life, even loosely combined?',
  ],
  characters: [
    'Who else was there? Name everyone you can, even figures you only sensed.',
    'Pick the most vivid person or creature in the dream. What did their face or form look like?',
    'Did anyone behave out of character, or feel like two people merged into one?',
    'How did the others in the dream react to you — friendly, indifferent, threatening?',
  ],
  emotions: [
    'What was the single strongest feeling in the dream — and where in your body do you remember feeling it?',
    'Did the emotional tone shift at any point? What triggered the shift?',
    'Was there any feeling in the dream that surprised you — one that didn’t match what was happening?',
    'On waking, what emotion was still with you?',
  ],
  sensory: [
    'What colors do you remember most vividly? Was anything strangely bright, dim, or the wrong color?',
    'Were there any sounds — voices, music, noise, or a notable silence?',
    'Do you remember any textures, temperatures, smells, or tastes?',
    'Did your body feel different — heavy, weightless, fast, unable to move?',
  ],
  narrative: [
    'What is the earliest moment of the dream you can reach? Start there and walk forward.',
    'Was there a turning point — a moment where everything changed?',
    'Did the dream jump between scenes? What was on either side of the jump?',
    'What were you trying to do in the dream? Did you succeed?',
  ],
  dialogue: [
    'Did anyone speak? Try to recall exact words, even a fragment.',
    'Was there any writing, signs, numbers, or symbols you could read — or that refused to be read?',
    'Did you understand things without words being spoken? What was communicated?',
    'Did you say anything — out loud or in your head?',
  ],
  lucidity: [
    'At any point, did you suspect or know you were dreaming?',
    'Did you have any control — over flying, choices, the environment?',
    'Was there anything absurd that felt completely normal at the time? Describe it.',
    'Whose eyes were you seeing through — your own, or did your perspective shift?',
  ],
  resolution: [
    'How did the dream end — did it resolve, dissolve, or were you pulled out of it?',
    'What woke you? Do you remember the exact image or moment right before waking?',
    'What image from the dream is the stickiest — the one you can still see now?',
    'If the dream had continued another minute, what do you sense would have happened?',
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
    question: 'Is there anything else — any stray image, feeling, or fragment — still floating at the edge of memory?',
    dimension: 'resolution',
  }
}
