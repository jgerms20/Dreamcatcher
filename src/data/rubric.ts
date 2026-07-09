export interface RubricDimension {
  id: string
  name: string
  description: string
}

export const RUBRIC_DIMENSIONS: RubricDimension[] = [
  {
    id: 'setting',
    name: 'Setting & Place',
    description: 'Where the dream happened — locations, geography, architecture, weather, time of day, transitions between places.',
  },
  {
    id: 'characters',
    name: 'Characters',
    description: 'Who appeared — known people, strangers, hybrids, animals, entities; their appearance, roles and behavior.',
  },
  {
    id: 'emotions',
    name: 'Emotions',
    description: 'What was felt during the dream and how feelings shifted — fear, joy, longing, dread, relief — and intensity.',
  },
  {
    id: 'sensory',
    name: 'Sensory Detail',
    description: 'Colors, light, sounds, textures, smells, tastes, temperature, physical sensations like flying or falling.',
  },
  {
    id: 'narrative',
    name: 'Narrative Arc',
    description: 'The sequence of events — what happened first, what changed, turning points, scene jumps, cause and effect.',
  },
  {
    id: 'dialogue',
    name: 'Dialogue & Communication',
    description: 'Anything said, heard, read or telepathically understood; conversations, messages, signs, written text.',
  },
  {
    id: 'lucidity',
    name: 'Awareness & Lucidity',
    description: 'Degree of self-awareness — knowing it was a dream, control over events, dream-logic acceptance, perspective shifts.',
  },
  {
    id: 'resolution',
    name: 'Ending & Residue',
    description: 'How the dream ended, what woke you, and the feeling or images that lingered on waking.',
  },
]

export function overallFromScores(scores: Record<string, { score: number }>): number {
  const vals = RUBRIC_DIMENSIONS.map((d) => scores[d.id]?.score ?? 0)
  return Math.round((vals.reduce((a, b) => a + b, 0) / (RUBRIC_DIMENSIONS.length * 5)) * 100)
}
