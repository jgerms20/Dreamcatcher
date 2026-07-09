import { create } from 'zustand'
import { dreamsDB, blobsDB } from '../db'
import { newId, lastNightISO, type Dream } from '../types'

interface DreamState {
  dreams: Dream[]
  loaded: boolean
  load: () => Promise<void>
  create: (partial?: Partial<Dream>) => Promise<Dream>
  update: (id: string, patch: Partial<Dream>) => Promise<Dream | undefined>
  remove: (id: string) => Promise<void>
  get: (id: string) => Dream | undefined
}

export const useDreams = create<DreamState>()((set, get) => ({
  dreams: [],
  loaded: false,
  async load() {
    if (get().loaded) return
    const dreams = await dreamsDB.all()
    dreams.sort((a, b) => b.dreamDate.localeCompare(a.dreamDate) || b.createdAt - a.createdAt)
    set({ dreams, loaded: true })
  },
  async create(partial = {}) {
    const dream: Dream = {
      id: newId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      dreamDate: lastNightISO(),
      title: '',
      transcript: '',
      interview: [],
      interpretation: {},
      symbols: [],
      emotions: [],
      tags: [],
      lucid: false,
      recurring: false,
      ...partial,
    }
    await dreamsDB.put(dream)
    set((s) => ({ dreams: [dream, ...s.dreams] }))
    return dream
  },
  async update(id, patch) {
    const current = get().dreams.find((d) => d.id === id)
    if (!current) return undefined
    const next: Dream = { ...current, ...patch, updatedAt: Date.now() }
    await dreamsDB.put(next)
    set((s) => ({ dreams: s.dreams.map((d) => (d.id === id ? next : d)) }))
    return next
  },
  async remove(id) {
    const dream = get().dreams.find((d) => d.id === id)
    if (dream?.audioId) await blobsDB.delete(dream.audioId)
    if (dream?.videoId) await blobsDB.delete(dream.videoId)
    await dreamsDB.delete(id)
    set((s) => ({ dreams: s.dreams.filter((d) => d.id !== id) }))
  },
  get(id) {
    return get().dreams.find((d) => d.id === id)
  },
}))
