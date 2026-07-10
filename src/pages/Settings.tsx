import { useRef, useState } from 'react'
import { useSettings, CLAUDE_MODELS, VIDEO_MODELS } from '../store/settings'
import { useDreams } from '../store/dreams'
import { useSleep } from '../store/sleep'
import { dreamsDB, sleepDB, wipeAll } from '../db'
import { testClaudeKey } from '../services/claude'
import type { Dream, SleepLog } from '../types'
import Icon from '../components/Icon'

export default function Settings() {
  const s = useSettings()
  const dreams = useDreams((st) => st.dreams)
  const sleep = useSleep((st) => st.logs)
  const [claudeStatus, setClaudeStatus] = useState<string | null>(null)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function testClaude() {
    setClaudeStatus('Testing…')
    try {
      await testClaudeKey(s.anthropicKey)
      setClaudeStatus('Key works')
    } catch (e) {
      setClaudeStatus(`Error: ${e instanceof Error ? e.message : 'Key test failed'}`)
    }
  }

  function exportData() {
    const payload = {
      app: 'dreamcatcher',
      version: 1,
      exportedAt: new Date().toISOString(),
      note: 'Audio/video files are stored only on the original device and are not included in this export.',
      dreams,
      sleep,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dreamcatcher-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importData(file: File) {
    setImportStatus(null)
    try {
      const parsed = JSON.parse(await file.text()) as { app?: string; dreams?: Dream[]; sleep?: SleepLog[] }
      if (parsed.app !== 'dreamcatcher' || !Array.isArray(parsed.dreams)) {
        throw new Error('Not a DreamCatcher export file.')
      }
      let added = 0
      const existing = new Set(dreams.map((d) => d.id))
      for (const d of parsed.dreams) {
        if (!existing.has(d.id)) {
          // media blobs don't travel with the export
          await dreamsDB.put({ ...d, audioId: undefined, videoId: undefined })
          added++
        }
      }
      const existingSleep = new Set(sleep.map((l) => l.id))
      for (const l of parsed.sleep ?? []) {
        if (!existingSleep.has(l.id)) await sleepDB.put(l)
      }
      setImportStatus(`Imported ${added} new dream${added === 1 ? '' : 's'}. Reloading…`)
      setTimeout(() => window.location.reload(), 900)
    } catch (e) {
      setImportStatus(`Error: ${e instanceof Error ? e.message : 'Import failed'}`)
    }
  }

  return (
    <div className="reveal-stack mx-auto max-w-2xl space-y-6">
      <header>
        <h2 className="page-title">Settings</h2>
        <p className="page-subtitle">
          Everything lives in <em>your</em> browser — dreams in local storage on this device, API keys never sent anywhere
          except directly to Anthropic and fal.ai.
        </p>
      </header>

      <section className="card space-y-4 p-5">
        <div>
          <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-ivory-100">
            <Icon name="brain" size={18} className="text-aurora-300" /> Anthropic (Claude) — interpretation & interview
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-ivory-400">
            Powers recall scoring, adaptive questions, interpretation, comparisons, and video prompts.
            Get a key at <a href="https://platform.claude.com/" target="_blank" rel="noreferrer" className="text-aurora-300 underline">platform.claude.com</a> under API keys.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="password"
            value={s.anthropicKey}
            onChange={(e) => { s.setAnthropicKey(e.target.value.trim()); setClaudeStatus(null) }}
            placeholder="sk-ant-…"
            className="input"
            autoComplete="off"
          />
          <button onClick={() => void testClaude()} disabled={!s.anthropicKey} className="btn-secondary shrink-0">Test</button>
        </div>
        {claudeStatus && (
          <p className={`flex items-center gap-2 text-sm ${claudeStatus.startsWith('Error:') ? 'text-amber-300' : 'text-aurora-300'}`}>
            <Icon name={claudeStatus.startsWith('Error:') ? 'x' : 'check'} size={15} /> {claudeStatus}
          </p>
        )}
        <div>
          <label className="label" htmlFor="model">Model</label>
          <select id="model" value={s.claudeModel} onChange={(e) => s.setClaudeModel(e.target.value)} className="input">
            {CLAUDE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <div>
          <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-ivory-100">
            <Icon name="video" size={18} className="text-aurora-300" /> fal.ai — video generation & transcription
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-ivory-400">
            One key unlocks many video models plus Whisper transcription for imported audio.
            Get a key at <a href="https://fal.ai/dashboard/keys" target="_blank" rel="noreferrer" className="text-aurora-300 underline">fal.ai/dashboard/keys</a>.
          </p>
        </div>
        <input
          type="password"
          value={s.falKey}
          onChange={(e) => s.setFalKey(e.target.value.trim())}
          placeholder="key_id:key_secret"
          className="input"
          autoComplete="off"
        />
        <div>
          <label className="label" htmlFor="vmodel">Default video model</label>
          <select id="vmodel" value={s.videoModel} onChange={(e) => s.setVideoModel(e.target.value)} className="input">
            {VIDEO_MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="vcustom">Custom fal model id (optional — overrides the picker)</label>
          <input
            id="vcustom"
            value={s.customVideoModel}
            onChange={(e) => s.setCustomVideoModel(e.target.value)}
            placeholder="e.g. fal-ai/kling-video/v2.5-turbo/pro/text-to-video"
            className="input"
          />
          <p className="mt-1 text-xs text-ivory-400">
            fal adds models constantly — paste any text-to-video endpoint id from <a href="https://fal.ai/models" target="_blank" rel="noreferrer" className="text-aurora-300 underline">fal.ai/models</a>.
          </p>
        </div>
      </section>

      <section className="card space-y-3 p-5">
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-ivory-100">
          <Icon name="database" size={18} className="text-aurora-300" /> Your data
        </h3>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportData} className="btn-secondary">
            <Icon name="file" size={16} /> Export journal (JSON)
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importData(f)
            }}
          />
          <button onClick={() => fileRef.current?.click()} className="btn-secondary">
            <Icon name="upload" size={16} /> Import journal
          </button>
        </div>
        {importStatus && (
          <p className={`flex items-center gap-2 text-sm ${importStatus.startsWith('Error:') ? 'text-amber-300' : 'text-aurora-300'}`}>
            <Icon name={importStatus.startsWith('Error:') ? 'x' : 'check'} size={15} /> {importStatus}
          </p>
        )}
        <p className="text-xs text-ivory-400">
          Exports contain dream text, analysis, and sleep logs. Audio/video stay on this device (they'd make the file huge).
        </p>
        <div className="border-t border-ivory-100/10 pt-3">
          <button
            onClick={() => {
              if (confirm('Delete ALL dreams, sleep logs, and media from this device? This cannot be undone.')) {
                void wipeAll().then(() => window.location.reload())
              }
            }}
            className="btn-ghost text-amber-300"
          >
            <Icon name="trash" size={16} /> Delete everything
          </button>
        </div>
      </section>
    </div>
  )
}
