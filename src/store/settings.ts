import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const CLAUDE_MODELS = [
  { id: 'claude-opus-4-8', name: 'Claude Opus 4.8 (best quality)' },
  { id: 'claude-sonnet-5', name: 'Claude Sonnet 5 (balanced)' },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5 (fastest / cheapest)' },
]

export const VIDEO_MODELS = [
  { id: 'fal-ai/ltx-2.3/text-to-video/fast', name: 'LTX 2.3 Fast (quick & cheap)' },
  { id: 'fal-ai/ltx-2/text-to-video', name: 'LTX 2.0 Pro (high fidelity + audio)' },
  { id: 'fal-ai/minimax/video-01', name: 'MiniMax Hailuo (cinematic)' },
  { id: 'fal-ai/kling-video/v3/pro/text-to-video', name: 'Kling 3.0 Pro (premium)' },
  { id: 'fal-ai/veo3.1', name: 'Google Veo 3.1 (premium)' },
]

const DEFAULT_VIDEO_MODEL = 'fal-ai/ltx-2.3/text-to-video/fast'

// Video model ids that fal.ai has since retired/renamed. Anyone who picked one of these
// before the endpoint moved would otherwise have it stuck in localStorage forever, silently
// failing every generation. Map them to their closest modern replacement.
export const DEAD_VIDEO_MODEL_MAP: Record<string, string> = {
  'fal-ai/ltx-video': 'fal-ai/ltx-2.3/text-to-video/fast',
  'fal-ai/hunyuan-video': 'fal-ai/minimax/video-01',
  'fal-ai/kling-video/v2/master/text-to-video': 'fal-ai/kling-video/v3/pro/text-to-video',
  'fal-ai/veo3': 'fal-ai/veo3.1',
}

export function resolveVideoModel(id: string): string {
  return DEAD_VIDEO_MODEL_MAP[id] ?? id
}

interface SettingsState {
  anthropicKey: string
  falKey: string
  /**
   * URL of the fal proxy (see worker/). fal.ai refuses direct browser calls, so
   * this is the supported path for video + transcription — and it keeps the fal
   * key server-side instead of in localStorage.
   */
  falProxyUrl: string
  /** Optional shared secret matching the Worker's APP_TOKEN. */
  falAppToken: string
  claudeModel: string
  videoModel: string
  customVideoModel: string
  setAnthropicKey: (k: string) => void
  setFalKey: (k: string) => void
  setFalProxyUrl: (u: string) => void
  setFalAppToken: (t: string) => void
  setClaudeModel: (m: string) => void
  setVideoModel: (m: string) => void
  setCustomVideoModel: (m: string) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      anthropicKey: '',
      falKey: '',
      falProxyUrl: '',
      falAppToken: '',
      claudeModel: 'claude-opus-4-8',
      videoModel: DEFAULT_VIDEO_MODEL,
      customVideoModel: '',
      setAnthropicKey: (anthropicKey) => set({ anthropicKey }),
      setFalKey: (falKey) => set({ falKey }),
      setFalProxyUrl: (falProxyUrl) => set({ falProxyUrl }),
      setFalAppToken: (falAppToken) => set({ falAppToken }),
      setClaudeModel: (claudeModel) => set({ claudeModel }),
      setVideoModel: (videoModel) => set({ videoModel }),
      setCustomVideoModel: (customVideoModel) => set({ customVideoModel }),
    }),
    {
      name: 'dreamcatcher-settings',
      version: 1,
      // v0 -> v1: fal.ai retired several video endpoints (see DEAD_VIDEO_MODEL_MAP). Rewrite
      // any persisted selection that points at a dead id so old installs don't keep silently
      // submitting to a 404'd model.
      migrate: (persisted, version) => {
        const state = persisted as SettingsState
        if (version < 1 && state && typeof state.videoModel === 'string') {
          state.videoModel = resolveVideoModel(state.videoModel)
        }
        return state
      },
    },
  ),
)

export function effectiveVideoModel(s: Pick<SettingsState, 'videoModel' | 'customVideoModel'>) {
  const chosen = s.customVideoModel.trim() || s.videoModel
  return resolveVideoModel(chosen)
}
