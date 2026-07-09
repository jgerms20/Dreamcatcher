import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Dream, SleepLog, StoredBlob } from '../types'

interface DreamcatcherDB extends DBSchema {
  dreams: { key: string; value: Dream; indexes: { 'by-date': string } }
  sleep: { key: string; value: SleepLog; indexes: { 'by-date': string } }
  blobs: { key: string; value: StoredBlob }
}

let dbPromise: Promise<IDBPDatabase<DreamcatcherDB>> | null = null

function db() {
  dbPromise ??= openDB<DreamcatcherDB>('dreamcatcher', 1, {
    upgrade(d) {
      const dreams = d.createObjectStore('dreams', { keyPath: 'id' })
      dreams.createIndex('by-date', 'dreamDate')
      const sleep = d.createObjectStore('sleep', { keyPath: 'id' })
      sleep.createIndex('by-date', 'date')
      d.createObjectStore('blobs', { keyPath: 'id' })
    },
  })
  return dbPromise
}

export const dreamsDB = {
  async all(): Promise<Dream[]> {
    return (await db()).getAll('dreams')
  },
  async put(dream: Dream) {
    await (await db()).put('dreams', dream)
  },
  async delete(id: string) {
    await (await db()).delete('dreams', id)
  },
}

export const sleepDB = {
  async all(): Promise<SleepLog[]> {
    return (await db()).getAll('sleep')
  },
  async put(log: SleepLog) {
    await (await db()).put('sleep', log)
  },
  async delete(id: string) {
    await (await db()).delete('sleep', id)
  },
}

export const blobsDB = {
  async get(id: string): Promise<StoredBlob | undefined> {
    return (await db()).get('blobs', id)
  },
  async put(item: StoredBlob) {
    await (await db()).put('blobs', item)
  },
  async delete(id: string) {
    await (await db()).delete('blobs', id)
  },
}

export async function wipeAll() {
  const d = await db()
  await Promise.all([d.clear('dreams'), d.clear('sleep'), d.clear('blobs')])
}
