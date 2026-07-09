import { create } from 'zustand'
import { sleepDB } from '../db'
import { newId, type SleepLog } from '../types'

interface SleepState {
  logs: SleepLog[]
  loaded: boolean
  load: () => Promise<void>
  upsert: (log: Omit<SleepLog, 'id'> & { id?: string }) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useSleep = create<SleepState>()((set, get) => ({
  logs: [],
  loaded: false,
  async load() {
    if (get().loaded) return
    const logs = await sleepDB.all()
    logs.sort((a, b) => b.date.localeCompare(a.date))
    set({ logs, loaded: true })
  },
  async upsert(log) {
    // one log per night: replace an existing entry for the same date
    const existing = get().logs.find((l) => l.date === log.date && l.id !== log.id)
    const full: SleepLog = { ...log, id: log.id ?? existing?.id ?? newId() }
    await sleepDB.put(full)
    set((s) => ({
      logs: [full, ...s.logs.filter((l) => l.id !== full.id)].sort((a, b) => b.date.localeCompare(a.date)),
    }))
  },
  async remove(id) {
    await sleepDB.delete(id)
    set((s) => ({ logs: s.logs.filter((l) => l.id !== id) }))
  },
}))
