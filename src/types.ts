export type LensId = 'jungian' | 'freudian' | 'cognitive' | 'spiritual'

export const LENSES: { id: LensId; name: string; blurb: string }[] = [
  { id: 'jungian', name: 'Jungian', blurb: 'Archetypes, the shadow, and the collective unconscious' },
  { id: 'freudian', name: 'Freudian', blurb: 'Wish fulfillment, latent content, and the personal unconscious' },
  { id: 'cognitive', name: 'Cognitive / Neuroscience', blurb: 'Memory consolidation, threat simulation, and emotion processing' },
  { id: 'spiritual', name: 'Cultural / Spiritual', blurb: 'Folk traditions, symbolism across cultures, and intuitive readings' },
]

export interface RubricDimensionScore {
  score: number // 0-5
  note: string
}

export interface RubricResult {
  scores: Record<string, RubricDimensionScore>
  overall: number // 0-100
  summary: string
}

export interface InterviewTurn {
  question: string
  answer: string
  dimension?: string
  askedByAI: boolean
}

export interface VideoPromptData {
  falPrompt: string
  runwayPrompt: string
  pikaPrompt: string
  styleNotes: string
  generatedAt: number
}

export interface Dream {
  id: string
  createdAt: number
  updatedAt: number
  dreamDate: string // ISO date (the night of the dream)
  title: string
  transcript: string
  interview: InterviewTurn[]
  rubric?: RubricResult
  interpretation: Partial<Record<LensId, string>>
  symbols: string[]
  emotions: string[]
  tags: string[]
  mood?: number // -2 (nightmare) .. 2 (blissful)
  vividness?: number // 1-5
  lucid: boolean
  recurring: boolean
  audioId?: string
  videoId?: string
  videoUrl?: string
  videoPrompt?: VideoPromptData
}

export interface SleepLog {
  id: string
  date: string // ISO date of the night
  durationH: number
  quality: number // 1-5
  bedTime?: string
  wakeTime?: string
  caffeine: boolean
  alcohol: boolean
  exercise: boolean
  stress: number // 1-5
  screenLate: boolean
  notes?: string
}

export interface StoredBlob {
  id: string
  kind: 'audio' | 'video'
  mime: string
  blob: Blob
}

export function newId(): string {
  return crypto.randomUUID()
}

export function lastNightISO(): string {
  // Before 6pm we assume the dream was last night; after 6pm, tonight-in-progress → still last night
  const d = new Date()
  d.setDate(d.getDate() - (d.getHours() < 18 ? 1 : 0))
  return d.toISOString().slice(0, 10)
}
