# DreamCatcher video proxy (~2 minutes, free)

## Why you need this

fal.ai refuses API calls made straight from a browser. The request dies in the
CORS preflight before it ever reaches fal, which is why pressing **Generate**
appeared to do nothing at all — there was no error to show you, because the
browser never got a response.

fal's own documentation says client-side apps must route through a server-side
proxy. This folder is that proxy: about 100 lines running free on Cloudflare.

It also fixes a real security problem. Today your fal key sits in your
browser's localStorage. After this, the key lives only inside Cloudflare and
never reaches the browser at all.

## Deploy it

You need a free Cloudflare account. No credit card.

```bash
npm install -g wrangler     # one time
cd worker
wrangler login              # opens your browser
wrangler secret put FAL_KEY # paste your fal.ai key when prompted
wrangler deploy
```

`wrangler deploy` prints a URL like:

```
https://dreamcatcher-fal-proxy.<your-subdomain>.workers.dev
```

Copy that URL into DreamCatcher → **Settings → Video connection → Proxy URL**,
then press **Test connection**. You should see "Proxy reachable, key
configured." You can then clear the fal key out of Settings entirely — the
proxy holds it now.

### Optional: lock the proxy to you

Your proxy URL spends your fal credits, so don't post it publicly. The origin
allowlist already blocks other websites from using it from a browser. To also
block anyone poking at it directly with `curl`, set a password:

```bash
wrangler secret put APP_TOKEN   # invent any string
```

Then paste the same string into Settings → Video connection → App token.

### Using your own domain

Edit `ALLOWED_ORIGINS` in `wrangler.toml` to include it, then `wrangler deploy`
again.

## Prefer not to run a proxy?

Video generation genuinely cannot work from a static site without one — that is
fal's rule, not a DreamCatcher limitation. Without a proxy you can still use
everything else, and Dream Studio will still write you the full director's
prompt to paste into Runway, Pika, Kling or ComfyUI by hand.
