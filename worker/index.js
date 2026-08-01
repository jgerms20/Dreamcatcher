/**
 * DreamCatcher — fal.ai proxy (Cloudflare Worker)
 *
 * Why this exists
 * ---------------
 * fal.ai does not allow calls straight from a browser with an API key: the
 * preflight is refused, so `fetch` rejects with an opaque "Failed to fetch"
 * and the app looks like it did nothing at all. fal's documented answer is a
 * server-side proxy, which is all this file is.
 *
 * It also fixes the security problem: the fal key lives here as a Worker
 * secret and never reaches the browser.
 *
 * Protocol
 * --------
 * @fal-ai/client, when configured with `proxyUrl`, sends every request to the
 * proxy with the real destination in the `x-fal-target-url` header. So we read
 * that header, verify it points at fal, attach the key, and pass the response
 * back with CORS headers. Nothing in the app has to know it's proxied.
 *
 * Deploy: see README.md in this folder (about two minutes, free tier).
 */

const FAL_HOSTS = [
  'fal.run',
  'queue.fal.run',
  'rest.alpha.fal.ai',
  'rest.fal.ai',
  'fal.media',
  'v2.fal.media',
  'v3.fal.media',
  'storage.googleapis.com', // fal hands out signed upload/download URLs here
]

const DEFAULT_ORIGINS = [
  'https://jgerms20.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
]

const TARGET_HEADER = 'x-fal-target-url'

function allowedOrigins(env) {
  const configured = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  return configured.length ? configured : DEFAULT_ORIGINS
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || ''
  const allowed = allowedOrigins(env)
  // Echo the origin only when we recognise it, so the browser enforces the allowlist.
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0]
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': `authorization,content-type,accept,${TARGET_HEADER},x-app-token`,
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function isFalUrl(raw) {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return false
    return FAL_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
  } catch {
    return false
  }
}

function deny(status, message, request, env) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request, env) },
  })
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    // A plain GET with no target is a health check — lets the app's
    // "Test connection" button tell "proxy is alive" apart from "proxy is wrong".
    const target = request.headers.get(TARGET_HEADER)
    if (!target) {
      return new Response(
        JSON.stringify({
          ok: true,
          service: 'dreamcatcher-fal-proxy',
          keyConfigured: Boolean(env.FAL_KEY),
          tokenRequired: Boolean(env.APP_TOKEN),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...cors } },
      )
    }

    if (!env.FAL_KEY) {
      return deny(500, 'Proxy is missing its FAL_KEY secret. Run: wrangler secret put FAL_KEY', request, env)
    }

    // Optional shared token so a leaked proxy URL alone cannot spend fal credits.
    if (env.APP_TOKEN && request.headers.get('x-app-token') !== env.APP_TOKEN) {
      return deny(401, 'Missing or incorrect app token.', request, env)
    }

    const origin = request.headers.get('Origin')
    if (origin && !allowedOrigins(env).includes(origin)) {
      return deny(403, `Origin ${origin} is not allowed by this proxy.`, request, env)
    }

    if (!isFalUrl(target)) {
      return deny(400, `Refusing to proxy a non-fal URL: ${target}`, request, env)
    }

    const headers = new Headers()
    const contentType = request.headers.get('Content-Type')
    if (contentType) headers.set('Content-Type', contentType)
    headers.set('Accept', request.headers.get('Accept') || 'application/json')
    headers.set('Authorization', `Key ${env.FAL_KEY}`)

    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      // Streams a request body through without buffering it first.
      duplex: 'half',
    })

    const response = new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers,
    })
    for (const [key, value] of Object.entries(cors)) {
      response.headers.set(key, value)
    }
    return response
  },
}
