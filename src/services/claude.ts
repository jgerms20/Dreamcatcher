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
    question: { type: 'string', description: 'One warm, precise question that quotes or directly references a concrete image or phrase the dreamer already gave. No preamble or filler — just the question.' },
    dimension: { type: 'string', enum: RUBRIC_DIMENSIONS.map((d) => d.id), description: 'The rubric dimension this question targets.' },
  },
  required: ['question', 'dimension'],
  additionalProperties: false,
} as const

const NEXT_QUESTION_SYSTEM = `You are DreamCatcher, a gentle but skilled dream-recall interviewer conducting a live follow-up interview. Your job is to ask exactly one question that pulls out more of THIS specific dream.

Rules:
- Your question MUST quote or directly reference a specific image, phrase, or detail the dreamer already gave — never a generic question that could apply to any dream.
- Never ask about something already answered in the Q&A history you're given — read it first.
- Vary your technique from turn to turn. Rotate across these approaches rather than repeating the same one:
  1. Sensory zoom-in — pick one detail already mentioned and ask for its texture, sound, smell, or temperature.
  2. Timeline walk-back — ask what happened just before a moment they described ("What came right before you noticed the door?").
  3. Spatial orientation — ask where something was relative to the dreamer's body, or what was behind/above/beside them.
  4. Character close-up — ask about a person or figure's face, voice, or specific words.
  5. Emotional trace — ask where in their body they felt an emotion, or what the feeling reminded them of.
  6. Edge-of-memory probe — gently ask about the hazy periphery: what was just out of focus, or what they sense but can't quite picture.
- Ask ONE short question only. Warm but precise — no preamble, no "Great answer!" or "That's fascinating" filler. Just the question.
- Never interpret the dream; only help the dreamer remember more of it.

Examples (dream snippet → ideal question):

1. Dream snippet: "I was walking through a forest at night. There was a stag with silver antlers watching me from the treeline."
   Ideal question (sensory zoom-in): "That stag's silver antlers — when you picture them now, do they look smooth like polished metal, or more like they're carved, maybe rough?"

2. Dream snippet: "I was back in my childhood kitchen. My mother was cooking something, and then suddenly I was standing in the hallway instead."
   Ideal question (timeline walk-back): "Right before you found yourself in the hallway — what was the last thing happening in the kitchen, the moment just before the switch?"

3. Dream snippet: "Someone was chasing me through a subway station. I could hear their footsteps getting louder."
   Ideal question (emotional trace): "Where did you feel that footstep-sound landing in your body — chest, stomach, somewhere else — and did it change as they got closer?"

Use the rubric note you're given to bias toward a weak dimension, but the question must still quote something the dreamer already said.`

export async function nextQuestion(dream: Dream): Promise<{ question: string; dimension: string }> {
  const client = getClient()
  const rubricNote = dream.rubric
    ? `Current recall scores (0-5): ${RUBRIC_DIMENSIONS.map((d) => `${d.id}=${dream.rubric!.scores[d.id]?.score ?? '?'}`).join(', ')}. Target a weak dimension.`
    : 'No rubric yet — ask about whatever seems most recoverable.'
  const response = await client.messages.create({
    model: model(),
    max_tokens: 1000,
    system: NEXT_QUESTION_SYSTEM,
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
- Open with a short, evocative header (a markdown H2, e.g. "## The Silver Stag") naming the single image that most anchors this dream and this interpretation.
- Write for the dreamer directly ("you"), warm but not saccharine.
- Quote the dreamer's own words and images throughout, rather than paraphrasing them away — e.g. "the water that kept rising," not "an aquatic symbol."
- ALWAYS explain where each interpretation comes from — the symbol, tradition, or mechanism behind it ("In ${lensName} thought, water often stands for X, which is why...").
- Interpretations are hypotheses to try on, not verdicts. Offer the dreamer questions to test them against their life.
- After the opening header, structure the body with a few short markdown ### subheaders. Keep the whole thing under 450 words.
- End with one reflective question.`,
    messages: [{ role: 'user', content: dreamContext(dream) }],
  })
  stream.on('text', onDelta)
  const final = await stream.finalMessage()
  return extractText(final)
}

// ---------- Auto-lens interpretation: pick a lens, then stream it ----------

const lensPickerSchema = {
  type: 'object',
  properties: {
    lens: { type: 'string', enum: LENSES.map((l) => l.id) },
    why: { type: 'string', description: 'One sentence on why this lens fits this particular dream best.' },
  },
  required: ['lens', 'why'],
  additionalProperties: false,
} as const

export async function interpretAuto(
  dream: Dream,
  onDelta: (text: string) => void,
): Promise<{ lens: LensId; text: string }> {
  let lens: LensId = 'jungian'
  try {
    const client = getClient()
    const response = await client.messages.create({
      model: model(),
      max_tokens: 300,
      system:
        "You are DreamCatcher's interpretation triage assistant. Given a dream, decide which single interpretive lens — jungian, freudian, cognitive, or spiritual — best fits THIS dream's content, symbols, and the dreamer's apparent needs. Pick exactly one lens; don't hedge between two.",
      messages: [{ role: 'user', content: dreamContext(dream) }],
      output_config: { format: { type: 'json_schema', schema: lensPickerSchema } },
    })
    const parsed = JSON.parse(extractText(response)) as { lens: LensId; why: string }
    lens = parsed.lens
  } catch {
    lens = 'jungian'
  }
  const text = await interpretLens(dream, lens, onDelta)
  return { lens, text }
}

// ---------- Video prompt generation ----------

const videoPromptSchema = {
  type: 'object',
  properties: {
    falPrompt: {
      type: 'string',
      description:
        'A dense 200-320 word single-shot treatment, written as continuous prose a cinematographer could shoot from (not a bullet list or tag list). Must cover, woven together naturally: the single most iconic moment of the dream; the subject with wardrobe and physical detail; the setting including era, architecture, and weather; light sources and quality (practicals, moonlight, sodium vapor, neon...); atmosphere (haze, particulate, rain); camera body/format feel (e.g. 35mm anamorphic, 16mm grain, clean digital), focal length, and aperture/depth of field; camera movement blocked across the shot — how it starts, how it develops, where it ends; color grade and palette with a film-stock reference; the emotional register and how it escalates across the shot; and one surreal dream-logic element rendered completely matter-of-factly. Optimized for modern T2V diffusion models.',
    },
    runwayPrompt: {
      type: 'string',
      description: 'A shorter (40-70 word) variant tuned for Runway Gen-4: terse and camera-direction-forward — lead with shot type and camera movement, then subject action and setting in a few tight clauses.',
    },
    pikaPrompt: {
      type: 'string',
      description: 'A shorter (30-50 word) variant tuned for Pika: punchy, using style tags and mood descriptors, comma-separated where natural.',
    },
    styleNotes: { type: 'string', description: 'One sentence on the visual style chosen and why it fits the dream mood.' },
  },
  required: ['falPrompt', 'runwayPrompt', 'pikaPrompt', 'styleNotes'],
  additionalProperties: false,
} as const

export async function generateVideoPrompt(dream: Dream): Promise<VideoPromptData> {
  const client = getClient()
  const response = await client.messages.create({
    model: model(),
    max_tokens: 3000,
    system:
      'You are a working film director and cinematographer, translating dream reports into a shot treatment a DP could actually shoot — robust, considered, and specific, not a vague mood board. Pick ONE scene — the single most visually striking moment — rather than trying to cover the whole dream, and favor dreamlike qualities: soft focus edges, impossible physics rendered matter-of-factly, saturated or desaturated palettes matching the mood.\n\nFor falPrompt, write a dense 200-320 word single continuous shot description covering: the most iconic moment; subject with wardrobe and physical detail; the setting\'s era, architecture, and weather; light sources and quality (practicals, moonlight, sodium vapor, neon...); atmosphere (haze, particulate, rain); camera body/format feel (e.g. 35mm anamorphic, 16mm grain), focal length, and aperture/depth of field; camera movement blocked across the shot — start, development, end frame; color grade and palette with a film-stock reference; the emotional register and how it escalates through the shot; and one surreal dream-logic element rendered completely matter-of-factly, as if it were unremarkable. Write it as continuous prose a cinematographer could shoot from, not a list of tags.\n\nFor runwayPrompt, write a much shorter, camera-direction-forward prompt tuned for Runway Gen-4. For pikaPrompt, write a short, punchy, style-tag-friendly prompt tuned for Pika. Keep styleNotes to one sentence.',
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
