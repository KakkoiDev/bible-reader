/**
 * Contrast, effective tap targets, tab order and sheet semantics — evidence for
 * S6, S7, S8 and the "verified good" list.
 *
 *   node scripts/measure-a11y.mjs [url]     (default http://127.0.0.1:4999/)
 *
 * Note: h1 reports 2 — the visible chapter heading plus the aria-hidden print table.
 * That is correct, not a duplicate-heading bug.
 *
 * Tap targets are measured by hit-testing outward from each control's centre with
 * elementFromPoint, so a target grown by an ::after overlay is credited for its real
 * area rather than its box. That is why .vn reports 24×29 and not 14×12.
 */
import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://127.0.0.1:4999/';
const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {},
);
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
});
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2200);

const CONTRAST_HELPERS = () => {
  const lum = (c) => {
    const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const parse = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  const bgOf = (el) => {
    let e = el;
    while (e) {
      const c = getComputedStyle(e).backgroundColor;
      if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return parse(c);
      e = e.parentElement;
    }
    return [255, 255, 255];
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  return { parse, bgOf, ratio };
};

console.log('\n--- CONTRAST ---');
const contrast = await page.evaluate((src) => {
  const { parse, bgOf, ratio } = new Function(`return (${src})()`)();
  const picks = ['.verse', '.vn', '.navbtn', '.colhead', '.chaplabel', '.attrib',
    '.ringtab:not(.active) span', '.liclink', '.colplay'];
  return picks.map((s) => {
    const el = document.querySelector(s);
    if (!el) return { sel: s, missing: true };
    const cs = getComputedStyle(el);
    return { sel: s, fs: cs.fontSize, ratio: +ratio(parse(cs.color), bgOf(el)).toFixed(2) };
  });
}, CONTRAST_HELPERS.toString());
for (const c of contrast) {
  if (c.missing) { console.log(c.sel.padEnd(30), 'not present'); continue; }
  const large = parseFloat(c.fs) >= 24;
  const need = large ? 3 : 4.5;
  console.log(c.sel.padEnd(30), c.fs.padStart(7), String(c.ratio).padStart(7) + ':1',
    c.ratio >= need ? ' pass' : ' FAIL');
}

console.log('\n--- TAP TARGETS (44px token) ---');
const targets = await page.evaluate(() => {
  const owns = (el, x, y) => { const t = document.elementFromPoint(x, y); return t && (t === el || el.contains(t)); };
  const effective = (el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (!owns(el, cx, cy)) return null;
    let l = 0, ri = 0, t = 0, b = 0;
    while (l < 60 && owns(el, cx - r.width / 2 - l - 1, cy)) l++;
    while (ri < 60 && owns(el, cx + r.width / 2 + ri + 1, cy)) ri++;
    while (t < 60 && owns(el, cx, cy - r.height / 2 - t - 1)) t++;
    while (b < 60 && owns(el, cx, cy + r.height / 2 + b + 1)) b++;
    return { w: Math.round(r.width + l + ri), h: Math.round(r.height + t + b), boxW: Math.round(r.width), boxH: Math.round(r.height) };
  };
  const seen = new Set(), out = [];
  for (const el of document.querySelectorAll('button, a[href], input, [role=button]')) {
    const r = el.getBoundingClientRect();
    if (!r.width || r.top > innerHeight || r.bottom < 0) continue;
    // Off-screen until focused (the skip link, the sheets' hidden titles). It has no
    // box to measure while hidden, and the one it has when focused is a real 44.
    if (r.width <= 1 || r.height <= 1 || r.left < -1000) continue;
    const label = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim().slice(0, 26);
    const key = el.className + '|' + label;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ cls: String(el.className).slice(0, 18), label, ...(effective(el) || {}) });
  }
  return out;
});
for (const t of targets) {
  const small = (t.w ?? 0) < 44 || (t.h ?? 0) < 44;
  console.log(`${t.cls.padEnd(20)} ${String(t.label).padEnd(28)} ${t.w}x${t.h}`.padEnd(64) +
    (t.boxW !== t.w || t.boxH !== t.h ? `(box ${t.boxW}x${t.boxH}) ` : '') + (small ? 'UNDER 44' : ''));
}

console.log('\n--- TAB ORDER (first 12 stops) ---');
for (let i = 0; i < 12; i++) {
  await page.keyboard.press('Tab');
  const a = await page.evaluate(() => {
    const e = document.activeElement;
    return `${e.tagName}.${String(e.className).split(' ')[0]} "${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 24)}"`;
  });
  console.log(String(i + 1).padStart(3), a);
}

console.log('\n--- SHEET SEMANTICS ---');
const sheets = [
  ['book/chapter', '.navbtn'],
  ['search', 'button.icon[title="Search"]'],
  ['saved', 'button.icon[title="Saved (notes & highlights)"]'],
  ['plan', 'button.icon[title="Reading plan"]'],
  ['settings', 'button.icon[title="Settings"]'],
];
for (const [name, sel] of sheets) {
  await page.click(sel).catch(() => {});
  await page.waitForTimeout(700);
  const r = await page.evaluate(() => {
    const s = document.querySelector('.sheet');
    if (!s) return null;
    const head = s.querySelector('.sheet-head');
    return {
      role: s.getAttribute('role') || '—',
      modal: s.getAttribute('aria-modal') || '—',
      labelled: s.getAttribute('aria-labelledby') || s.getAttribute('aria-label') || '—',
      title: head?.firstElementChild?.tagName || '—',
      focusInside: s.contains(document.activeElement),
      heightPct: Math.round(s.getBoundingClientRect().height / innerHeight * 100),
    };
  });
  console.log(name.padEnd(14), r ? `role ${r.role}  modal ${r.modal}  labelledby ${r.labelled}  title <${r.title}>  focus-in ${r.focusInside}  ${r.heightPct}%` : 'did not open');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);
}

console.log('\n--- FOCUS RING ROOM ---');
// The ring is drawn outside the control, so a control at the edge of a scroller can
// have it clipped by `overflow`. This reports, per focused control, how much room it
// has before the nearest clipping ancestor against how much the ring needs.
const ringProbe = async (label, prep) => {
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.verse');
  await prep();
  const r = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    const need = (parseFloat(cs.outlineOffset) || 0) + (parseFloat(cs.outlineWidth) || 0);
    const b = el.getBoundingClientRect();
    let clip = null;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const st = getComputedStyle(p);
      if (/hidden|auto|scroll|clip/.test(st.overflow + st.overflowX + st.overflowY)) { clip = p; break }
    }
    const c = clip ? clip.getBoundingClientRect() : null;
    return {
      need, clipper: clip ? String(clip.className).split(' ')[0] : '(viewport)',
      room: c ? { top: +(b.top - c.top).toFixed(1), left: +(b.left - c.left).toFixed(1),
                  right: +(c.right - b.right).toFixed(1), bottom: +(c.bottom - b.bottom).toFixed(1) } : null,
    };
  });
  if (!r) return console.log(`  ${label.padEnd(24)} (nothing focused)`);
  const cut = r.room ? Object.entries(r.room).filter(([, v]) => v < r.need) : [];
  console.log(`  ${label.padEnd(24)} needs ${r.need}px in .${r.clipper}  ` +
    (cut.length ? 'CUT: ' + cut.map(([k, v]) => `${k}=${v}`).join(' ') : 'ok'));
};
await ringProbe('search field', async () => {
  await page.click('button.icon[title="Search"]'); await page.waitForTimeout(500);
});
await ringProbe('book filter', async () => {
  await page.click('.navbtn'); await page.waitForTimeout(500);
  await page.locator('.bookfilter').focus(); await page.waitForTimeout(200);
});
await ringProbe('settings: language', async () => {
  await page.click('button.icon[title="Settings"]'); await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('.sheet-body .sel')?.focus());
});

console.log('\n--- HEADINGS ---');
// Most of the app's headings are inside sheets, so count them with one open as well
// as on the bare reader.
await page.click('button.icon[title="Settings"]').catch(() => {});
await page.waitForTimeout(600);
console.log('settings open:', await page.evaluate(() => ({
  h2: document.querySelectorAll('.sheet h2').length,
  sticky: getComputedStyle(document.querySelector('.sheet .sgroup')).position,
})));
await page.keyboard.press('Escape');
await page.waitForTimeout(350);
console.log(await page.evaluate(() => ({
  h1: document.querySelectorAll('h1').length,
  h2: document.querySelectorAll('h2').length,
  h3: document.querySelectorAll('h3').length,
  // A button, not an <a href="#...">: the app routes on location.hash, so a fragment
  // link would navigate the reader somewhere else on its way to the chapter end.
  skipLink: !!document.querySelector('.skiplink'),
  liveRegions: document.querySelectorAll('[aria-live], [role=status]').length,
})));

await browser.close();
