/**
 * Regenerates the app mark from the golden ratio, and writes:
 *   <repo>/public/favicon.svg
 *   <repo>/public/icons/monochrome-512.svg
 *   the inline <svg class="smark"> in <repo>/index.html
 *
 *   node scripts/golden-cross.mjs [repoPath]     (default: cwd)
 *
 * Two decisions produce the figure; the other relations fall out of them.
 *
 *   W : H           = 1 : φ    chosen — the bounding box is a golden rectangle
 *   head : foot     = 1 : φ    chosen — the crossbar divides the stem in golden section
 *   arm : thickness = φ        free   — because t = W/φ³ and φ³ = 1 + 2φ, so
 *                                       arm + stem + arm lands exactly on the width
 *   foot            = W        free   — because H·φ/(1+φ) = H/φ = W
 *
 * H is capped by Android's maskable safe circle (radius 204.8 on a 512 canvas), not
 * by the ratio. At H=390 the worst corner sits at 197.1 — 7.7px of clearance. Going
 * to 405 fills the mask but leaves 0.2px, and putting the bar on the *frame's* golden
 * section instead of centring the box pushes a corner to 207.4, outside the circle.
 */
import fs from 'node:fs';
import path from 'node:path';

const REPO = process.argv[2] || process.cwd();
const PHI = (1 + Math.sqrt(5)) / 2;
const CANVAS = 512, CX = CANVAS / 2, CY = CANVAS / 2, SAFE = CANVAS * 0.8 / 2;

const H = 390;
const W = H / PHI;
const T = W / PHI ** 3;
const A = H / (1 + PHI);
const TOP = CY - H / 2;
const RADIUS = +(T * 0.26).toFixed(1);
const n = (x) => +x.toFixed(1);

const stem = { x: n(CX - T / 2), y: n(TOP), w: n(T), h: n(H) };
const bar = { x: n(CX - W / 2), y: n(TOP + A - T / 2), w: n(W), h: n(T) };

const worst = Math.max(
  Math.hypot(bar.x - CX, bar.y - CY),
  Math.hypot(bar.x - CX, bar.y + bar.h - CY),
  Math.hypot(stem.x - CX, stem.y - CY),
  Math.hypot(stem.x - CX, stem.y + stem.h - CY),
);

console.log(`H ${n(H)}  W ${n(W)}  t ${n(T)}  head ${n(A - T / 2)}  foot ${n(H - A)}  arm ${n((W - T) / 2)}`);
console.log(`W : H            1 : ${(H / W).toFixed(4)}`);
console.log(`head : foot      1 : ${((H - A) / A).toFixed(4)}`);
console.log(`arm : thickness  ${(((W - T) / 2) / T).toFixed(4)} : 1`);
console.log(`foot = W         ${n(H - A)} = ${n(W)}`);
console.log(`maskable         worst ${worst.toFixed(1)} / safe ${SAFE} → ${(SAFE - worst).toFixed(1)}px clearance`);
if (worst > SAFE) throw new Error('geometry escapes the maskable safe circle');

const rects = (fill, indent = '    ') =>
  `${indent.slice(2)}<g fill="${fill}">\n` +
  `${indent}<rect x="${stem.x}" y="${stem.y}" width="${stem.w}" height="${stem.h}" rx="${RADIUS}"/>\n` +
  `${indent}<rect x="${bar.x}" y="${bar.y}" width="${bar.w}" height="${bar.h}" rx="${RADIUS}"/>\n` +
  `${indent.slice(2)}</g>`;

const write = (rel, body) => {
  const p = path.join(REPO, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
  console.log('wrote', rel);
};

write('public/favicon.svg',
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Bible">
  <rect width="512" height="512" rx="112" fill="#4338CA"/>
${rects('#FAF8F4')}
</svg>
`);

write('public/icons/monochrome-512.svg',
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
${rects('#000000')}
</svg>
`);

// The full-bleed variant is what the maskable and apple-touch PNGs are rasterised
// from; it is scratch, not a repo asset.
fs.writeFileSync(path.join(REPO, 'public/icons/.bleed.svg'),
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#4338CA"/>
${rects('#FAF8F4')}
</svg>
`);

// Keep the splash mark identical to the launcher icon — if these drift, the launch
// stops reading as the icon opening into the app.
const idx = path.join(REPO, 'index.html');
let html = fs.readFileSync(idx, 'utf8');
const before = html;
html = html.replace(
  /<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[\d.]+" rx="[\d.]+" \/>\s*\n\s*<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[\d.]+" rx="[\d.]+" \/>/,
  `<rect x="${stem.x}" y="${stem.y}" width="${stem.w}" height="${stem.h}" rx="${RADIUS}" />\n` +
  `            <rect x="${bar.x}" y="${bar.y}" width="${bar.w}" height="${bar.h}" rx="${RADIUS}" />`,
);
if (html === before) console.warn('! index.html splash mark not matched — check the <svg class="smark"> block by hand');
else { fs.writeFileSync(idx, html); console.log('wrote index.html (splash mark)'); }

console.log('\nnow run: node scripts/rasterise-icons.mjs', REPO);
