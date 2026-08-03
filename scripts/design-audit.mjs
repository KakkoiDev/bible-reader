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
//
// Each sheet is opened in turn before the target sweep, because most of the app's
// atoms (swatches, chips, the chapter grid, the reorder pairs) only exist inside one.
const SCREENS = {
  reader: async () => {},
  navigator: async (p) => {
    await p.click('.navbtn')
    await p.waitForSelector('.chgrid') // opens on the current book's chapter grid
  },
  search: async (p) => {
    await p.click('.tools .icon:nth-child(1)')
    await p.waitForSelector('.sheet.search')
    await p.fill('.searchin', 'love')
    await p.waitForSelector('.results .dref', { timeout: 10000 })
  },
  saved: async (p) => {
    await p.click('.tools .icon:nth-child(2)')
    await p.waitForSelector('.sheet.saved')
  },
  settings: async (p) => {
    await p.click('.tools .icon:nth-child(3)')
    await p.waitForSelector('.sheet.settings, .sheet')
  },
  toolbar: async (p) => {
    // Select a run of a verse so the annotation toolbar mounts over it. The walker is
    // needed because a verse's children are <ruby>, highlight spans and text nodes.
    await p.evaluate(() => {
      const w = document.createTreeWalker(document.querySelector('.verse'), NodeFilter.SHOW_TEXT)
      let n
      while ((n = w.nextNode())) if (n.textContent.trim().length > 14) break
      const r = document.createRange()
      r.setStart(n, 0)
      r.setEnd(n, 14)
      const s = getSelection()
      s.removeAllRanges()
      s.addRange(r)
      document.dispatchEvent(new Event('selectionchange'))
    })
    await p.waitForSelector('.atoolbar', { timeout: 5000 })
  },
  verse: async (p) => {
    await p.click('.verse') // the row, not the number: the number copies a link
    // The row opens the action bar; only Study opens the sheet.
    await p.click('.verse .vbtn.study')
    await p.waitForSelector('.verse-sheet')
  },
}

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

    const tokens = Object.fromEntries(
      ['--bg', '--fg', '--muted', '--accent', '--r-button', '--r-sheet', '--f-ui', '--fs-chapter'].map((n) => [n, tok(n)]),
    )
    return { tokens, contrast }
  })
  console.log(`\n--- ${dark ? 'dark' : 'light'} ---`)
  console.log('tokens  ', JSON.stringify(report.tokens))
  console.log('contrast', JSON.stringify(report.contrast))

  const sweep = () =>
    page.evaluate(() => {
      // What a thumb can actually hit, which is not always the element's own box:
      //  - .vn and .vplay grow their target with an ::after overlay so the glyphs in
      //    the text can stay small, so the overlay counts.
      //  - a checkbox inside a <label> row is hit by pressing the row.
      const px = (v) => (v.endsWith('px') ? parseFloat(v) : 0)
      const target = (el) => {
        const r = el.getBoundingClientRect()
        const a = getComputedStyle(el, '::after')
        if (a.content !== 'none' && a.position === 'absolute') {
          return {
            w: r.width - px(a.left) - px(a.right),
            h: r.height - px(a.top) - px(a.bottom),
          }
        }
        return { w: r.width, h: r.height }
      }
      const small = []
      for (const el of document.querySelectorAll('button, a, input, select, textarea, [tabindex]')) {
        const own = el.getBoundingClientRect()
        if (!own.width || !own.height) continue
        const label = el.closest('label')
        const t = label && label !== el ? target(label) : target(el)
        if (t.w >= 44 && t.h >= 44) continue
        small.push(`${el.className || el.tagName}: ${Math.round(t.w)}x${Math.round(t.h)}`)
      }
      return [...new Set(small)]
    })

  for (const [name, open] of Object.entries(SCREENS)) {
    try {
      // reload(), not goto(): the URL never changes between screens, so goto() is a
      // no-op and the previous screen's sheet stays mounted with its backdrop over
      // everything the next screen needs to click.
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForSelector('.verse')
      await open(page)
      const small = await sweep()
      console.log(`under 44px, ${name} (${small.length}):`)
      for (const s of small) console.log('   ', s)
      if (!dark) await page.screenshot({ path: `${out}/${label}-screen-${name}.png` })
    } catch (e) {
      console.log(`under 44px, ${name}: FAILED TO OPEN, ${String(e).split('\n').slice(0, 14).join(' / ')}`)
    }
  }
  await ctx.close()
}

await browser.close()
console.log(`\nshots in ${out}`)
