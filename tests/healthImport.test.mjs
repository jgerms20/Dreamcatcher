import assert from 'node:assert/strict'
import test from 'node:test'

async function loadHealthImportModule() {
  return import('../src/services/healthImport.ts')
}

test('Apple Health XML asleep stages are merged into per-night durations', async () => {
  const { parseAppleHealthSleepXml } = await loadHealthImportModule()
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <HealthData>
    <Record type="HKCategoryTypeIdentifierSleepAnalysis" startDate="2026-07-08 22:30:00 -0400" endDate="2026-07-08 23:00:00 -0400" value="HKCategoryValueSleepAnalysisInBed"/>
    <Record type="HKCategoryTypeIdentifierSleepAnalysis" startDate="2026-07-08 23:00:00 -0400" endDate="2026-07-09 01:30:00 -0400" value="HKCategoryValueSleepAnalysisAsleepCore"/>
    <Record type="HKCategoryTypeIdentifierSleepAnalysis" startDate="2026-07-09 01:00:00 -0400" endDate="2026-07-09 02:00:00 -0400" value="HKCategoryValueSleepAnalysisAsleep"/>
    <Record type="HKCategoryTypeIdentifierSleepAnalysis" startDate="2026-07-09 01:30:00 -0400" endDate="2026-07-09 02:00:00 -0400" value="HKCategoryValueSleepAnalysisAsleepREM"/>
    <Record type="HKCategoryTypeIdentifierSleepAnalysis" startDate="2026-07-09 02:00:00 -0400" endDate="2026-07-09 02:15:00 -0400" value="HKCategoryValueSleepAnalysisAwake"/>
    <Record type="HKCategoryTypeIdentifierSleepAnalysis" startDate="2026-07-09 02:15:00 -0400" endDate="2026-07-09 06:15:00 -0400" value="HKCategoryValueSleepAnalysisAsleepDeep"/>
  </HealthData>`

  const result = parseAppleHealthSleepXml(xml)

  assert.equal(result.nights.length, 1)
  assert.equal(result.nights[0].date, '2026-07-08')
  assert.equal(result.nights[0].durationH, 7)
  assert.equal(result.processedRecords, 6)
})

test('Fitbit JSON imports one sleep log per date and skips duplicate dates', async () => {
  const { parseFitbitSleepText } = await loadHealthImportModule()
  const json = JSON.stringify([
    { dateOfSleep: '2026-07-08', minutesAsleep: 420 },
    { dateOfSleep: '2026-07-09', minutesAsleep: 360 },
    { dateOfSleep: '2026-07-09', minutesAsleep: 330 },
    { dateOfSleep: 'bad-date', minutesAsleep: 100 }
  ])

  const result = parseFitbitSleepText(json, 'sleep.json')

  assert.deepEqual(result.nights.map((night) => [night.date, night.durationH]), [
    ['2026-07-09', 6],
    ['2026-07-08', 7],
  ])
  assert.equal(result.duplicateDates, 1)
  assert.equal(result.invalidRows, 1)
})

test('Fitbit CSV imports dateOfSleep and minutesAsleep columns', async () => {
  const { parseFitbitSleepText, toSleepLogInput } = await loadHealthImportModule()
  const result = parseFitbitSleepText('dateOfSleep,minutesAsleep\n2026-07-10,450\n', 'sleep.csv')
  const log = toSleepLogInput(result.nights[0], 'fitbit')

  assert.equal(result.nights[0].date, '2026-07-10')
  assert.equal(result.nights[0].durationH, 7.5)
  assert.equal(log.quality, 3)
  assert.equal(log.stress, 3)
  assert.equal(log.caffeine, false)
  assert.equal(log.notes, 'Imported from Fitbit')
})
