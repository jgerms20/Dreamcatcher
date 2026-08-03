/**
 * Renders the iOS app icon and launch image from the same crescent-and-spark
 * mark the web app uses, so the home-screen icon matches the favicon and PWA
 * tile instead of shipping Capacitor's placeholder logo.
 *
 *   node scripts/generate-ios-art.mjs
 *
 * Two iOS-specific rules drive the differences from public/icon.svg:
 *   1. App icons must be fully opaque. An alpha channel is an App Store
 *      validation failure, so everything is flattened onto a solid background.
 *   2. iOS applies its own rounded-corner mask. Baking our own `rx` in would
 *      leave the mask cutting into already-rounded art, so the icon renders
 *      full-bleed square and the mark is inset to stay clear of the corners.
 */
import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const assets = resolve(root, 'ios/App/App/Assets.xcassets')

const INK = '#06070d'
const NIGHT = '#0a0c14'
const CREAM = '#f0ead9'
const GOLD = '#d4a24e'

/** The crescent + spark mark on a 128-unit grid, without any background. */
const mark = `
  <circle cx="64" cy="64" r="30" fill="${CREAM}"/>
  <circle cx="76" cy="56" r="26" fill="${INK}"/>
  <path d="M90 28 Q93.2 34.8 100 38 Q93.2 41.2 90 48 Q86.8 41.2 80 38 Q86.8 34.8 90 28 Z" fill="${GOLD}"/>
  <circle cx="40" cy="92" r="2.4" fill="#cfc4ae"/>
  <circle cx="30" cy="40" r="1.6" fill="${GOLD}" opacity="0.7"/>
  <circle cx="96" cy="90" r="1.8" fill="${CREAM}" opacity="0.55"/>
`

/**
 * @param inset fraction of the canvas to keep clear around the mark. The icon
 *   needs more than the splash because iOS's corner mask eats the edges.
 */
function composition({ size, inset, background }) {
  const scale = 1 - inset * 2
  const offset = size * inset
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="sky" cx="38%" cy="30%" r="85%">
      <stop offset="0%" stop-color="${NIGHT}"/>
      <stop offset="100%" stop-color="${background}"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#sky)"/>
  <g transform="translate(${offset} ${offset}) scale(${(size * scale) / 128})">${mark}</g>
</svg>`
}

/** Flatten removes the alpha channel that App Store validation rejects. */
async function render(svg, size, outPath) {
  await mkdir(dirname(outPath), { recursive: true })
  const png = await sharp(Buffer.from(svg))
    .resize(size, size)
    .flatten({ background: INK })
    .png({ compressionLevel: 9 })
    .toBuffer()
  await writeFile(outPath, png)
  return png.length
}

const icon = composition({ size: 1024, inset: 0.1, background: INK })
const splash = composition({ size: 2732, inset: 0.38, background: NIGHT })

const written = []
written.push([
  'AppIcon-512@2x.png',
  await render(icon, 1024, resolve(assets, 'AppIcon.appiconset/AppIcon-512@2x.png')),
])
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  written.push([name, await render(splash, 2732, resolve(assets, `Splash.imageset/${name}`))])
}

for (const [name, bytes] of written) {
  console.log(`${name.padEnd(26)} ${(bytes / 1024).toFixed(1)} kB`)
}
