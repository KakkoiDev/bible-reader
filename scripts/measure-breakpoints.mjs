/**
 * Characters per line and column count at each viewport width — the evidence for S2.
 *
 *   node scripts/measure-breakpoints.mjs [url]     (default http://127.0.0.1:4999/)
 *
 * Measure is computed in-page from the rendered font metrics rather than guessed:
 * a hidden span of known length is laid out in the verse's exact font, giving an
 * average advance, and the column width is divided by it.
 *
 * Comfortable measure is 45–75 characters. At 65e49e8 this prints 100 at 899px and
 * 31 at 900px — the stylesheet breaks at 640 while the column switch is at 900.
 */
import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://127.0.0.1:4999/';
const WIDTHS = [320, 390, 480, 640, 700, 760, 820, 899, 900, 1000, 1100, 1280, 1440, 1920];

const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {},
);

console.log('width  cols  colW   chars/line  tabs  verdict');
for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  const r = await page.evaluate(() => {
    const col = document.querySelector('.col');
    const vt = document.querySelector('.verse .vt');
    if (!col || !vt) return null;
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap';
    probe.style.font = getComputedStyle(vt).font;
    probe.textContent = 'abcdefghijklmnopqrstuvwxyz abcdefghijklmnopqrstuvwxyz';
    document.body.appendChild(probe);
    const advance = probe.getBoundingClientRect().width / probe.textContent.length;
    probe.remove();
    const w = col.getBoundingClientRect().width;
    return {
      cols: document.querySelectorAll('.col').length,
      colW: Math.round(w),
      cpl: Math.round(w / advance),
      tabs: !!document.querySelector('.langring'),
    };
  });
  await ctx.close();
  if (!r) { console.log(String(width).padStart(5), '  — reader not found'); continue; }
  // Below ~480 the device sets the measure, not the layout — a phone simply cannot
  // give 45 characters at this type size, so short lines there are not a defect.
  const verdict =
    r.cpl > 75 ? 'TOO WIDE'
    : r.cpl >= 45 ? 'ok'
    : width <= 480 ? 'narrow (device-bound, fine)'
    : 'TOO NARROW';
  console.log(
    String(width).padStart(5),
    String(r.cols).padStart(5),
    String(r.colW).padStart(6),
    String(r.cpl).padStart(11),
    String(r.tabs ? 'yes' : 'no').padStart(6),
    '  ' + verdict,
  );
}

await browser.close();
