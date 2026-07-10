import type { SleepLog } from '../types'

export type HealthImportSource = 'apple' | 'fitbit'

export interface ImportedSleepNight {
  date: string
  durationH: number
}

export interface HealthImportProgress {
  loadedBytes: number
  totalBytes: number
  processedRecords: number
}

export interface HealthImportParseResult {
  nights: ImportedSleepNight[]
  duplicateDates: number
  invalidRows: number
  processedRecords: number
}

interface SleepInterval {
  start: number
  end: number
}

const SLEEP_ANALYSIS_TYPE = 'HKCategoryTypeIdentifierSleepAnalysis'
const MAX_APPLE_EXPORT_BYTES = 750 * 1024 * 1024
const MAX_APPLE_SLEEP_RECORDS = 250_000
const APPLE_RECORD_START = '<Record '
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function toSleepLogInput(night: ImportedSleepNight, source: HealthImportSource): Omit<SleepLog, 'id'> {
  return {
    date: night.date,
    durationH: night.durationH,
    quality: 3,
    caffeine: false,
    alcohol: false,
    exercise: false,
    stress: 3,
    screenLate: false,
    notes: `Imported from ${source === 'apple' ? 'Apple Health' : 'Fitbit'}`,
  }
}

export function parseAppleHealthSleepXml(xml: string): HealthImportParseResult {
  const accumulator = createAppleAccumulator()
  scanAppleXmlChunk(xml, accumulator)
  finishAppleXml(accumulator)
  return buildAppleResult(accumulator)
}

export async function parseAppleHealthSleepFile(
  file: File,
  onProgress?: (progress: HealthImportProgress) => void,
): Promise<HealthImportParseResult> {
  if (file.size > MAX_APPLE_EXPORT_BYTES) {
    throw new Error('This Apple Health export is too large to process in the browser. Export a smaller date range or trim export.xml before importing.')
  }

  const accumulator = createAppleAccumulator()

  if (!file.stream) {
    const text = await file.text()
    scanAppleXmlChunk(text, accumulator)
    finishAppleXml(accumulator)
    onProgress?.({ loadedBytes: file.size, totalBytes: file.size, processedRecords: accumulator.processedRecords })
    return buildAppleResult(accumulator)
  }

  const reader = file.stream().getReader()
  const decoder = new TextDecoder()
  let loadedBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      loadedBytes += value.byteLength
      scanAppleXmlChunk(decoder.decode(value, { stream: true }), accumulator)
      onProgress?.({ loadedBytes, totalBytes: file.size, processedRecords: accumulator.processedRecords })
      if (accumulator.processedRecords > MAX_APPLE_SLEEP_RECORDS) {
        throw new Error('This export has more sleep records than the browser importer can safely process.')
      }
    }
    scanAppleXmlChunk(decoder.decode(), accumulator)
  } finally {
    reader.releaseLock()
  }

  finishAppleXml(accumulator)
  onProgress?.({ loadedBytes: file.size, totalBytes: file.size, processedRecords: accumulator.processedRecords })
  return buildAppleResult(accumulator)
}

export async function parseFitbitSleepFiles(files: FileList | File[]): Promise<HealthImportParseResult> {
  const aggregate = createParseResult()
  const byDate = new Map<string, ImportedSleepNight>()

  for (const file of Array.from(files)) {
    const result = parseFitbitSleepText(await file.text(), file.name)
    mergeFitbitNights(byDate, result, aggregate)
  }

  aggregate.nights = Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date))
  return aggregate
}

export function parseFitbitSleepText(text: string, filename = 'sleep.json'): HealthImportParseResult {
  const result = createParseResult()
  const byDate = new Map<string, ImportedSleepNight>()
  const trimmed = text.trim()

  if (!trimmed) return result

  if (filename.toLowerCase().endsWith('.csv') || looksLikeCsv(trimmed)) {
    for (const row of parseCsv(trimmed)) {
      result.processedRecords += 1
      addFitbitRecord(row, byDate, result)
    }
  } else {
    const parsed: unknown = JSON.parse(trimmed)
    for (const record of extractFitbitRecords(parsed)) {
      result.processedRecords += 1
      addFitbitRecord(record, byDate, result)
    }
  }

  result.nights = Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date))
  return result
}

function createParseResult(): HealthImportParseResult {
  return {
    nights: [],
    duplicateDates: 0,
    invalidRows: 0,
    processedRecords: 0,
  }
}

function mergeFitbitNights(
  byDate: Map<string, ImportedSleepNight>,
  incoming: HealthImportParseResult,
  aggregate: HealthImportParseResult,
) {
  aggregate.invalidRows += incoming.invalidRows
  aggregate.duplicateDates += incoming.duplicateDates
  aggregate.processedRecords += incoming.processedRecords

  for (const night of incoming.nights) {
    const existing = byDate.get(night.date)
    if (existing) {
      aggregate.duplicateDates += 1
      if (night.durationH > existing.durationH) byDate.set(night.date, night)
    } else {
      byDate.set(night.date, night)
    }
  }
}

function addFitbitRecord(record: unknown, byDate: Map<string, ImportedSleepNight>, result: HealthImportParseResult) {
  if (!isRecord(record)) {
    result.invalidRows += 1
    return
  }

  const date = firstString(record, ['dateOfSleep', 'date', 'sleepDate', 'Date'])
  const minutes = firstNumber(record, ['minutesAsleep', 'Minutes Asleep', 'minutes', 'asleepMinutes'])

  if (!date || !ISO_DATE_RE.test(date) || minutes == null || minutes <= 0) {
    result.invalidRows += 1
    return
  }

  const night = { date, durationH: roundHours(minutes / 60) }
  const existing = byDate.get(date)

  if (existing) {
    result.duplicateDates += 1
    if (night.durationH > existing.durationH) byDate.set(date, night)
    return
  }

  byDate.set(date, night)
}

function extractFitbitRecords(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed
  if (!isRecord(parsed)) return []

  for (const key of ['sleep', 'logs', 'data']) {
    const value = parsed[key]
    if (Array.isArray(value)) return value
  }

  return [parsed]
}

function looksLikeCsv(text: string): boolean {
  if (text.startsWith('{') || text.startsWith('[')) return false
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  return firstLine.includes(',') && /date|sleep|minutes/i.test(firstLine)
}

function parseCsv(text: string): Record<string, string>[] {
  const rows = parseCsvRows(text)
  const header = rows.shift()?.map((cell) => cell.trim()) ?? []
  if (header.length === 0) return []

  return rows
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row) => Object.fromEntries(header.map((key, index) => [key, row[index]?.trim() ?? ''])))
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]

    if (char === '"' && inQuotes && next === '"') {
      cell += '"'
      i += 1
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      row.push(cell)
      cell = ''
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }

  row.push(cell)
  rows.push(row)
  return rows
}

interface AppleAccumulator {
  buffer: string
  intervalsByDate: Map<string, SleepInterval[]>
  invalidRows: number
  processedRecords: number
}

function createAppleAccumulator(): AppleAccumulator {
  return {
    buffer: '',
    intervalsByDate: new Map(),
    invalidRows: 0,
    processedRecords: 0,
  }
}

function scanAppleXmlChunk(chunk: string, accumulator: AppleAccumulator) {
  accumulator.buffer += chunk

  while (true) {
    const start = accumulator.buffer.indexOf(APPLE_RECORD_START)
    if (start === -1) {
      accumulator.buffer = accumulator.buffer.slice(-APPLE_RECORD_START.length)
      return
    }

    if (start > 0) accumulator.buffer = accumulator.buffer.slice(start)

    const end = accumulator.buffer.indexOf('>')
    if (end === -1) return

    const tag = accumulator.buffer.slice(0, end + 1)
    accumulator.buffer = accumulator.buffer.slice(end + 1)
    processAppleRecordTag(tag, accumulator)
  }
}

function finishAppleXml(accumulator: AppleAccumulator) {
  const start = accumulator.buffer.indexOf(APPLE_RECORD_START)
  const end = accumulator.buffer.indexOf('>')
  if (start !== -1 && end !== -1 && end > start) {
    processAppleRecordTag(accumulator.buffer.slice(start, end + 1), accumulator)
  }
  accumulator.buffer = ''
}

function processAppleRecordTag(tag: string, accumulator: AppleAccumulator) {
  const attrs = parseXmlAttributes(tag)
  if (attrs.type !== SLEEP_ANALYSIS_TYPE) return

  accumulator.processedRecords += 1

  if (!attrs.value || !isAppleAsleepValue(attrs.value) || !attrs.startDate || !attrs.endDate) return

  const start = parseAppleDate(attrs.startDate)
  const end = parseAppleDate(attrs.endDate)

  if (start == null || end == null || end <= start) {
    accumulator.invalidRows += 1
    return
  }

  const date = sleepNightDate(start, end)
  const intervals = accumulator.intervalsByDate.get(date) ?? []
  intervals.push({ start, end })
  accumulator.intervalsByDate.set(date, intervals)
}

function buildAppleResult(accumulator: AppleAccumulator): HealthImportParseResult {
  const result = createParseResult()
  result.invalidRows = accumulator.invalidRows
  result.processedRecords = accumulator.processedRecords
  result.nights = Array.from(accumulator.intervalsByDate.entries())
    .map(([date, intervals]) => ({ date, durationH: roundHours(mergedMinutes(intervals) / 60) }))
    .filter((night) => night.durationH > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
  return result
}

function parseXmlAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const attrRe = /([A-Za-z_:][\w:.-]*)="([^"]*)"/g
  let match: RegExpExecArray | null

  while ((match = attrRe.exec(tag)) != null) {
    attrs[match[1]] = decodeXmlEntities(match[2])
  }

  return attrs
}

function decodeXmlEntities(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
}

function isAppleAsleepValue(value: string): boolean {
  return value === 'HKCategoryValueSleepAnalysisAsleep' || value.startsWith('HKCategoryValueSleepAnalysisAsleep')
}

function parseAppleDate(value: string): number | null {
  const normalized = value
    .trim()
    .replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(?: ([+-]\d{2})(\d{2}))?$/, '$1T$2$3:$4')
    .replace(/:$/, '')
  const timestamp = Date.parse(normalized)
  return Number.isNaN(timestamp) ? null : timestamp
}

function sleepNightDate(start: number, end: number): string {
  const midpoint = new Date(start + (end - start) / 2)
  if (midpoint.getHours() < 18) midpoint.setDate(midpoint.getDate() - 1)
  return toLocalISODate(midpoint)
}

function toLocalISODate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function mergedMinutes(intervals: SleepInterval[]): number {
  const sorted = intervals.slice().sort((a, b) => a.start - b.start)
  const merged: SleepInterval[] = []

  for (const interval of sorted) {
    const last = merged.at(-1)
    if (!last || interval.start > last.end) {
      merged.push({ ...interval })
    } else if (interval.end > last.end) {
      last.end = interval.end
    }
  }

  return merged.reduce((total, interval) => total + (interval.end - interval.start) / 60_000, 0)
}

function roundHours(hours: number): number {
  return Math.round(hours * 100) / 100
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value)
}

function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function firstNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return null
}
