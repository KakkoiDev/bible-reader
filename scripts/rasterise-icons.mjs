/**
 * Rasterises the PNG icon set from the SVGs golden-cross.mjs wrote.
 *
 *   node scripts/rasterise-icons.mjs [repoPath]
 *
 * Uses Chromium via Playwright rather than a native rasteriser so the output matches
 * what a browser actually paints. Set CHROMIUM to an executable path if Playwright's
 * bundled browser is not where it expects.
 *
 * Which purposes get which artwork:
 *   any        rounded square  — shown as-is by desktop and older Android
 *   maskable   full bleed      — the platform applies its own circle/squircle crop
 *   apple      full bleed      — iOS masks it, and bakes its own corner radius
 *   monochrome transparent     — Android themed icons tint the shape
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const REPO = process.argv[2] || process.cwd();
const R = path.join(REPO, 'public');

const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {},
);

async function png(svgPath, size, outPath, { transparent = false } = {}) {
  const svg = fs.readFileSync(svgPath, 'utf8');
  const ctx = await browser.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setContent(
    `<!doctype html><meta charset="utf-8">` +
    `<style>html,body{margin:0;padding:0;background:${transparent ? 'transparent' : '#fff'}}` +
    `svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    { waitUntil: 'load' },
  );
  await page.waitForTimeout(120);
  await page.screenshot({ path: outPath, omitBackground: transparent });
  await ctx.close();
  console.log('wrote', path.relative(REPO, outPath), `${size}px`);
}

const rounded = path.join(R, 'favicon.svg');
const bleed = path.join(R, 'icons/.bleed.svg');
const mono = path.join(R, 'icons/monochrome-512.svg');
for (const f of [rounded, bleed, mono]) {
  if (!fs.existsSync(f)) throw new Error(`missing ${f} — run golden-cross.mjs first`);
}

await png(rounded, 192, path.join(R, 'icons/icon-192.png'));
await png(rounded, 512, path.join(R, 'icons/icon-512.png'));
await png(bleed, 512, path.join(R, 'icons/maskable-512.png'));
await png(bleed, 180, path.join(R, 'icons/apple-touch-icon.png'));
await png(mono, 512, path.join(R, 'icons/monochrome-512.png'), { transparent: true });

await browser.close();
console.log('\ndone — rebuild with `npm run build`');
