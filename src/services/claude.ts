import Anthropic from '@anthropic-ai/sdk'
import { useSettings } from '../store/settings'
import { RUBRIC_DIMENSIONS, overallFromScores } from '../data/rubric'
import { LENSES, type Dream, type LensId, type RubricResult, type VideoPromptData } from '../types'

function getClient(): Anthropic {
  const { anthropicKey } = useSettings.getState()
  if (!anthropicKey) throw new Error('No Anthropic API key configured. Add one in Settings.')
  return new Anthropic({ apiKey: anthropicKey, dangerouslyAllowBrowser: true })
}

function model(): string {
  return useSettings.getState().claudeModel
}

export function hasClaudeKey(): boolean {
  return Boolean(useSettings.getState().anthropicKey)
}

function dreamContext(dream: Dream): string {
  const interview = dream.interview
    .map((t) => `Q: ${t.question}\nA: ${t.answer}`)
    .join('\n\n')
  return [
    `Dream date: ${dream.dreamDate}`,
    dream.title ? `Title: ${dream.title}` : '',
    `Dream narrative:\n${dream.transcript}`,
    interview ? `Follow-up interview:\n${interview}` : '',
    dream.lucid ? 'The dreamer reports this was a lucid dream.' : '',
    dream.recurring ? 'The dreamer reports this is a recurring dream.' : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

function extractText(response: Anthropic.Message): string {
  if (response.stop_reason === 'refusal') {
    throw new Error('The model declined this request.')
  }
  const block = response.content.find((b) => b.type === 'text')
  if (!block || block.type !== 'text') throw new Error('Empty response from Claude.')
  return block.text
}

// ---------- Analyze: rubric scores + metadata in one structured call ----------

export interface DreamAnalysis {
  rubric: RubricResult
  suggestedTitle: string
  symbols: string[]
  emotions: string[]
  mood: number
  vividness: number
}

const rubricScoreProps = Object.fromEntries(
  RUBRIC_DIMENSIONS.map((d) => [
    d.id,
    {
      type: 'object',
      properties: {
        score: { type: 'integer', enum: [0, 1, 2, 3, 4, 5] },
        note: { type: 'string', description: 'One sentence: what was recalled well or what is missing.' },
      },
      required: ['score', 'note'],
      additionalProperties: false,
    },
  ]),
)

const analysisSchema = {
  type: 'object',
  properties: {
    scores: {
      type: 'object',
      properties: rubricScoreProps,
      required: RUBRIC_DIMENSIONS.map((d) => d.id),
      additionalProperties: false,
    },
    summary: { type: 'string', description: 'Two-sentence encouraging summary of recall quality and the biggest gap.' },
    suggestedTitle: { type: 'string', description: 'A short, evocative title for this dream (max 6 words).' },
    symbols: { type: 'array', items: { type: 'string' }, description: 'Key symbols/motifs present, lowercase, e.g. "ocean", "teeth", "childhood home".' },
    emotions: { type: 'array', items: { type: 'string' }, description: 'Emotions felt in the dream, lowercase single words.' },
    mood: { type: 'integer', enum: [-2, -1, 0, 1, 2], description: 'Overall valence: -2 nightmare .. 0 neutral .. 2 blissful.' },
    vividness: { type: 'integer', enum: [1, 2, 3, 4, 5], description: 'How vivid the recalled imagery is.' },
  },
  required: ['scores', 'summary', 'suggestedTitle', 'symbols', 'emotions', 'mood', 'vividness'],
  additionalProperties: false,
} as const

export async function analyzeDream(dream: Dream): Promise<DreamAnalysis> {
  const client = getClient()
  const response = await client.messages.create({
    model: model(),
    max_tokens: 4000,
    system:
      'You are DreamCatcher, an expert dream-recall coach. You assess how completely a dream has been recalled using a fixed rubric. Score generously for what is present; the notes should point at what could still be recovered. Judge only recall completeness, never the content of the dream itself.',
    messages: [
      {
        role: 'user',
        content: `Assess the recall of this dream against the rubric.\n\nRubric dimensions:\n${RUBRIC_DIMENSIONS.map((d) => `- ${d.id}: ${d.description}`).join('\n')}\n\n${dreamContext(dream)}`,
      },
    ],
    output_config: { format: { type: 'json_schema', schema: analysisSchema } },
  })
  const parsed = JSON.parse(extractText(response)) as Omit<DreamAnalysis, 'rubric'> & {
    scores: RubricResult['scores']
    summary: string
  }
  return {
    rubric: {
      scores: parsed.scores,
      overall: overallFromScores(parsed.scores),
      summary: parsed.summary,
    },
    suggestedTitle: parsed.suggestedTitle,
    symbols: parsed.symbols,
    emotions: parsed.emotions,
    mood: parsed.mood,
    vividness: parsed.vividness,
  }
}

// ---------- Adaptive interview ----------

const questionSchema = {
  type: 'object',
  properties: {
    question: { type: 'string', description: 'One warm, specific, sensory question that helps the dreamer recover more of THIS dream. Reference concrete details they already mentioned.' },
    dimension: { type: 'string', enum: RUBRIC_DIMENSIONS.map((d) => d.id), description: 'The rubric dimension this question targets.' },
  },
  required: ['question', 'dimension'],
  additionalProperties: false,
} as const

export async function nextQuestion(dream: Dream): Promise<{ question: string; dimension: string }> {
  const client = getClient()
  const rubricNote = dream.rubric
    ? `Current recall scores (0-5): ${RUBRIC_DIMENSIONS.map((d) => `${d.id}=${dream.rubric!.scores[d.id]?.score ?? '?'}`).join(', ')}. Target a weak dimension.`
    : 'No rubric yet — ask about whatever seems most recoverable.'
  const response = await client.messages.create({
    model: model(),
    max_tokens: 1000,
    system:
      'You are DreamCatcher, a gentle dream-recall interviewer. You ask exactly one question at a time. Good questions are adaptive: they pick up specific images the dreamer already mentioned and pull on the thread ("You mentioned water — was it moving or still? What color was the light on it?"). Never ask something already answered. Never interpret; only help them remember.',
    messages: [
      {
        role: 'user',
        content: `${dreamContext(dream)}\n\n${rubricNote}\n\nAsk the single best next question.`,
      },
    ],
    output_config: { format: { type: 'json_schema', schema: questionSchema } },
  })
  return JSON.parse(extractText(response))
}

// ---------- Interpretation (streaming, per lens) ----------

const LENS_PROMPTS: Record<LensId, string> = {
  jungian:
    'Interpret through a Jungian lens: archetypes, the shadow, anima/animus, the Self, individuation, and compensation. Name the archetypal figures and dynamics you see and say why.',
  freudian:
    'Interpret through a Freudian/psychoanalytic lens: manifest vs latent content, wish fulfillment, displacement, condensation, day residue. Be intellectually honest about the speculative nature of the method.',
  cognitive:
    'Interpret through a cognitive-neuroscience lens: memory consolidation, emotion regulation, threat simulation theory, continuity hypothesis, day residue from recent experience. Ground claims in what dream science actually supports, and be honest about the limits.',
  spiritual:
    'Interpret through cultural and spiritual traditions: cross-cultural folk symbolism, mythological parallels, and intuitive/spiritual readings. Present these respectfully as traditions of meaning rather than facts.',
}

export async function interpretLens(
  dream: Dream,
  lens: LensId,
  onDelta: (text: string) => void,
): Promise<string> {
  const client = getClient()
  const lensName = LENSES.find((l) => l.id === lens)?.name ?? lens
  const stream = client.messages.stream({
    model: model(),
    max_tokens: 3000,
    system: `You are DreamCatcher's dream interpreter. ${LENS_PROMPTS[lens]}

Rules:
- Write for the dreamer directly ("you"), warm but not saccharine.
- ALWAYS explain where each interpretation comes from — the symbol, tradition, or mechanism behind it ("In ${lensName} thought, water often stands for X, which is why...").
- Interpretations are hypotheses to try on, not verdicts. Offer the dreamer questions to test them against their life.
- Structure with a few short markdown headers (###). Keep it under 450 words.
- End with one reflective question.`,
    messages: [{ role: 'user', content: dreamContext(dream) }],
  })
  stream.on('text', onDelta)
  const final = await stream.finalMessage()
  return extractText(final)
}

// ---------- Video prompt generation ----------

const videoPromptSchema = {
  type: 'object',
  properties: {
    falPrompt: { type: 'string', description: 'A single dense text-to-video prompt (under 180 words): subject, action, setting, lighting, camera movement, film style, mood. Optimized for modern T2V diffusion models.' },
    runwayPrompt: { type: 'string', description: 'Variant tuned for Runway Gen-4: concise, camera-direction-forward.' },
    pikaPrompt: { type: 'string', description: 'Variant tuned for Pika: punchy, style-tag friendly.' },
    styleNotes: { type: 'string', description: 'One sentence on the visual style chosen and why it fits the dream mood.' },
  },
  required: ['falPrompt', 'runwayPrompt', 'pikaPrompt', 'styleNotes'],
  additionalProperties: false,
} as const

export async function generateVideoPrompt(dream: Dream): Promise<VideoPromptData> {
  const client = getClient()
  const response = await client.messages.create({
    model: model(),
    max_tokens: 2000,
    system:
      'You are a cinematic prompt engineer for text-to-video models. You translate dream reports into a single continuous shot that captures the dream\'s most iconic moment and emotional tone. Favor dreamlike qualities: soft focus edges, impossible physics rendered matter-of-factly, saturated or desaturated palettes matching the mood. Pick ONE scene — the most visually striking — rather than trying to cover the whole dream.',
    messages: [
      { role: 'user', content: `Create video generation prompts for this dream:\n\n${dreamContext(dream)}` },
    ],
    output_config: { format: { type: 'json_schema', schema: videoPromptSchema } },
  })
  const parsed = JSON.parse(extractText(response)) as Omit<VideoPromptData, 'generatedAt'>
  return { ...parsed, generatedAt: Date.now() }
}

// ---------- Compare & patterns (streaming) ----------

export async function compareDreams(a: Dream, b: Dream, onDelta: (t: string) => void): Promise<string> {
  const client = getClient()
  const stream = client.messages.stream({
    model: model(),
    max_tokens: 3000,
    system:
      'You are DreamCatcher\'s pattern analyst. Compare and contrast two dreams from the same dreamer: shared symbols and settings, evolving or inverted themes, emotional trajectory between them, and what the pair might suggest when read together. Use short markdown sections. Be specific — quote images from the dreams. Under 400 words. End with one question for the dreamer.',
    messages: [
      {
        role: 'user',
        content: `DREAM A (${a.dreamDate}${a.title ? `, "${a.title}"` : ''}):\n${a.transcript}\n\nDREAM B (${b.dreamDate}${b.title ? `, "${b.title}"` : ''}):\n${b.transcript}`,
      },
    ],
  })
  stream.on('text', onDelta)
  return extractText(await stream.finalMessage())
}

export async function analyzePatterns(dreams: Dream[], onDelta: (t: string) => void): Promise<string> {
  const client = getClient()
  const corpus = dreams
    .slice(0, 30)
    .map((d) => `[${d.dreamDate}]${d.title ? ` "${d.title}"` : ''} (mood ${d.mood ?? '?'}): ${d.transcript.slice(0, 500)}`)
    .join('\n\n')
  const stream = client.messages.stream({
    model: model(),
    max_tokens: 3000,
    system:
      'You are DreamCatcher\'s pattern analyst reviewing a dream journal. Identify: recurring symbols/settings/characters, emotional arcs over time, possible waking-life correlates, and one or two threads worth watching in future dreams. Use short markdown sections with specific examples and dates. Under 500 words.',
    messages: [{ role: 'user', content: `Dream journal entries (most recent first):\n\n${corpus}` }],
  })
  stream.on('text', onDelta)
  return extractText(await stream.finalMessage())
}

// ---------- Key test ----------

export async function testClaudeKey(key: string): Promise<void> {
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true })
  await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 16,
    messages: [{ role: 'user', content: 'Say "ok".' }],
  })
}
