import { useState } from 'react'
import { useSettings } from '../store/settings'
import { testVideoConnection, videoBackend, type ConnectionTest } from '../services/fal'

const DEPLOY_STEPS = [
  'npm install -g wrangler',
  'cd worker',
  'wrangler login',
  'wrangler secret put FAL_KEY',
  'wrangler deploy',
]

/**
 * Setup + live diagnosis for video generation.
 *
 * fal.ai refuses API calls made straight from a browser, so a small proxy is
 * genuinely required — this panel explains that, takes the proxy URL, and can
 * prove what is actually wrong instead of leaving the user guessing.
 */
export default function VideoConnection({ compact = false }: { compact?: boolean }) {
  const settings = useSettings()
  const backend = videoBackend()
  const [result, setResult] = useState<ConnectionTest | null>(null)
  const [testing, setTesting] = useState(false)
  const [showSteps, setShowSteps] = useState(false)
  const [copied, setCopied] = useState(false)

  async function runTest() {
    setTesting(true)
    setResult(null)
    try {
      setResult(await testVideoConnection())
    } finally {
      setTesting(false)
    }
  }

  const status =
    backend === 'proxy'
      ? { text: 'Routed through your proxy', tone: 'text-aurora-300' }
      : backend === 'direct'
        ? { text: 'Direct key — browsers block this', tone: 'text-ember-300' }
        : { text: 'Not set up', tone: 'text-dusk-300/70' }

  return (
    <div className={compact ? '' : 'card p-5'}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg text-dusk-100">
          Video <em className="text-dusk-400">connection</em>
        </h3>
        <span className={`text-xs ${status.tone}`}>{status.text}</span>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-dusk-300/85">
        fal.ai does not accept API calls made directly from a web page — the browser blocks them
        before they leave, which is why generating a video could fail silently. A small free proxy
        fixes it, and keeps your fal key out of this browser entirely.
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <label className="label" htmlFor="fal-proxy-url">
            Proxy URL
          </label>
          <input
            id="fal-proxy-url"
            className="input"
            placeholder="https://dreamcatcher-fal-proxy.you.workers.dev"
            value={settings.falProxyUrl ?? ''}
            onChange={(e) => {
              settings.setFalProxyUrl(e.target.value.trim())
              setResult(null)
            }}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div>
          <label className="label" htmlFor="fal-app-token">
            App token <span className="normal-case tracking-normal opacity-60">(optional)</span>
          </label>
          <input
            id="fal-app-token"
            className="input"
            type="password"
            placeholder="matches APP_TOKEN on the Worker"
            value={settings.falAppToken ?? ''}
            onChange={(e) => {
              settings.setFalAppToken(e.target.value.trim())
              setResult(null)
            }}
            autoComplete="off"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => void runTest()} disabled={testing}>
            {testing ? <span className="shimmer-text">Testing…</span> : 'Test connection'}
          </button>
          <button className="btn-ghost text-xs" onClick={() => setShowSteps((s) => !s)}>
            {showSteps ? 'Hide setup' : 'How do I deploy it?'}
          </button>
        </div>

        {result && (
          <div
            className={`rounded-xl border p-3 text-sm ${
              result.ok
                ? 'border-aurora-400/40 bg-aurora-400/10 text-aurora-300'
                : 'border-ember-400/40 bg-ember-400/10 text-ember-300'
            }`}
            role="status"
          >
            <p className="font-medium">
              {result.ok ? '✓ ' : '✕ '}
              {result.title}
            </p>
            <p className="mt-1 text-dusk-200/90">{result.detail}</p>
            {result.fix && <p className="mt-1 text-dusk-300/80">{result.fix}</p>}
          </div>
        )}

        {showSteps && (
          <div className="rounded-xl border border-night-600/70 bg-night-900/60 p-3">
            <p className="text-xs text-dusk-300/80">
              Free Cloudflare account, no card. Full notes in <code>worker/README.md</code>.
            </p>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-night-950/80 p-3 text-xs leading-relaxed text-dusk-200">
              {DEPLOY_STEPS.join('\n')}
            </pre>
            <div className="mt-2 flex items-center gap-2">
              <button
                className="btn-ghost text-xs"
                onClick={() => {
                  void navigator.clipboard.writeText(DEPLOY_STEPS.join('\n'))
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                }}
              >
                {copied ? '✓ copied' : 'Copy commands'}
              </button>
              <span className="text-xs text-dusk-300/60">
                Paste the URL it prints into the field above.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
