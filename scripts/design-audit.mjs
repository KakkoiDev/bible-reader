// Screenshot + token/target audit against a running dev or preview server.
//   node shot.mjs <baseUrl> <outDir> [label]
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const base = process.argv[2] || 'http://localhost:5199'
const out = process.argv[3] || '/tmp/shots'
const label = process.argv[4] || 'now'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch()

async function shoot(name, { width, height, dark, hash = '#/john/3/en', before }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    colorScheme: dark ? 'dark' : 'light',
    deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
  await page.goto(`${base}/${hash}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.verse, .fverse', { timeout: 15000 })
  if (before) await before(page)
  await page.screenshot({ path: `${out}/${label}-${name}.png`, fullPage: false })
  if (errs.length) console.log(`  ! ${name}: ${errs.slice(0, 3).join(' | ')}`)
  return { page, ctx }
}

// 1. reader, phone + desktop, both themes
for (const [name, opts] of Object.entries({
  'phone-light': { width: 390, height: 812, dark: false },
  'phone-dark': { width: 390, height: 812, dark: true },
  'wide-light': { width: 1280, height: 900, dark: false },
  'wide-dark': { width: 1280, height: 900, dark: true },
})) {
  const { ctx } = await shoot(name, opts)
  await ctx.close()
}

// 2. token + contrast + target audit, phone light and dark
for (const dark of [false, true]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 812 }, colorScheme: dark ? 'dark' : 'light' })
  const page = await ctx.newPage()
  await page.goto(`${base}/#/john/3/en`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.verse')
  const report = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement)
    const tok = (n) => cs.getPropertyValue(n).trim()
    // Resolved through a canvas rather than a regex: a token can be a plain hex, an
    // rgba(), or a color-mix() that Chrome reports back as color(srgb ...).
    const cv = document.createElement('canvas')
    cv.width = cv.height = 1
    const cx = cv.getContext('2d', { willReadFrequently: true })
    const parse = (c) => {
      cx.clearRect(0, 0, 1, 1)
      const d = document.createElement('div')
      d.style.color = c
      document.body.appendChild(d)
      cx.fillStyle = getComputedStyle(d).color
      d.remove()
      cx.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = cx.getImageData(0, 0, 1, 1).data
      return [r, g, b, a / 255]
    }
    const over = (fg, bg) => {
      const a = fg[3]
      return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)).concat(1)
    }
    const lum = (c) => {
      const f = (x) => {
        x /= 255
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
    }
    const ratio = (a, b) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
      return (x + 0.05) / (y + 0.05)
    }
    const bg = parse(tok('--bg'))
    const card = parse(tok('--card'))
    const fg = parse(tok('--fg'))
    const muted = parse(tok('--muted'))
    const contrast = {
      'muted on bg': +ratio(muted, bg).toFixed(2),
      'muted on card': +ratio(muted, card).toFixed(2),
    }
    for (const c of ['yellow', 'green', 'blue', 'pink', 'purple']) {
      const tint = parse(tok(`--hl-${c}`))
      contrast[`fg on hl-${c}`] = +ratio(fg, over(tint, bg)).toFixed(2)
    }
    const danger = { fg: tok('--danger-fg'), bg: tok('--danger-bg') }
    contrast['danger-fg on danger-bg'] = +ratio(parse(danger.fg), parse(danger.bg)).toFixed(2)

    const small = []
    for (const el of document.querySelectorAll('button, a, input, select, textarea, [tabindex]')) {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) continue
      if (r.width >= 44 && r.height >= 44) continue
      small.push(`${el.className || el.tagName}: ${Math.round(r.width)}x${Math.round(r.height)}`)
    }
    const tokens = Object.fromEntries(
      ['--bg', '--fg', '--muted', '--accent', '--r-button', '--r-sheet', '--f-ui', '--fs-chapter'].map((n) => [n, tok(n)]),
    )
    return { tokens, contrast, small: [...new Set(small)] }
  })
  console.log(`\n--- ${dark ? 'dark' : 'light'} ---`)
  console.log('tokens  ', JSON.stringify(report.tokens))
  console.log('contrast', JSON.stringify(report.contrast))
  console.log(`under 44px (${report.small.length}):`)
  for (const s of report.small) console.log('   ', s)
  await ctx.close()
}

await browser.close()
console.log(`\nshots in ${out}`)
