import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const CLAUDE_MODELS = [
  { id: 'claude-opus-4-8', name: 'Claude Opus 4.8 (best quality)' },
  { id: 'claude-sonnet-5', name: 'Claude Sonnet 5 (balanced)' },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5 (fastest / cheapest)' },
]

export const VIDEO_MODELS = [
  { id: 'fal-ai/ltx-video', name: 'LTX Video (fast & cheap)' },
  { id: 'fal-ai/kling-video/v2/master/text-to-video', name: 'Kling 2.0 Master (high quality)' },
  { id: 'fal-ai/minimax/video-01', name: 'MiniMax Hailuo (cinematic)' },
  { id: 'fal-ai/hunyuan-video', name: 'Hunyuan Video (open model)' },
  { id: 'fal-ai/veo3', name: 'Google Veo 3 (premium)' },
]

interface SettingsState {
  anthropicKey: string
  falKey: string
  claudeModel: string
  videoModel: string
  customVideoModel: string
  setAnthropicKey: (k: string) => void
  setFalKey: (k: string) => void
  setClaudeModel: (m: string) => void
  setVideoModel: (m: string) => void
  setCustomVideoModel: (m: string) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      anthropicKey: '',
      falKey: '',
      claudeModel: 'claude-opus-4-8',
      videoModel: 'fal-ai/ltx-video',
      customVideoModel: '',
      setAnthropicKey: (anthropicKey) => set({ anthropicKey }),
      setFalKey: (falKey) => set({ falKey }),
      setClaudeModel: (claudeModel) => set({ claudeModel }),
      setVideoModel: (videoModel) => set({ videoModel }),
      setCustomVideoModel: (customVideoModel) => set({ customVideoModel }),
    }),
    { name: 'dreamcatcher-settings' },
  ),
)

export function effectiveVideoModel(s: Pick<SettingsState, 'videoModel' | 'customVideoModel'>) {
  return s.customVideoModel.trim() || s.videoModel
}
