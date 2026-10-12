#!/usr/bin/env node
// Captures a site's real brand: screenshots, logos, fonts, colors and copy.
// Usage: node capture-site.mjs <url> <output-dir>

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const [url, outArg] = process.argv.slice(2);
if (!url || !outArg) { console.error('Usage: node capture-site.mjs <url> <output-dir>'); process.exit(1); }
const OUT = path.resolve(outArg);
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

async function settle(page) {
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
  await page.waitForTimeout(1500);
}

const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, userAgent: UA });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
await settle(page);
await page.screenshot({ path: path.join(OUT, 'site-desktop.png') });

// Scroll the page to trigger lazy-loading before the full-page shot.
await page.evaluate(async () => {
  for (let y = 0; y < Math.min(document.body.scrollHeight, 6000); y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 150)); }
  window.scrollTo(0, 0);
});
await page.waitForTimeout(800);
const fullH = await page.evaluate(() => Math.min(document.documentElement.scrollHeight, 6000));
await page.screenshot({ path: path.join(OUT, 'site-full.png'), fullPage: false, clip: { x: 0, y: 0, width: 1920, height: fullH }, captureBeyondViewport: true });

const data = await page.evaluate(() => {
  const abs = (u) => { try { return new URL(u, location.href).href; } catch { return null; } };
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05; };
  const norm = (c) => c.replace(/\s+/g, '');
  const toHex = (c) => {
    const m = c.match(/rgba?\(([\d.]+),([\d.]+),([\d.]+)(?:,([\d.]+))?\)/);
    if (!m) return null; if (m[4] !== undefined && +m[4] < 0.3) return null;
    return '#' + [m[1], m[2], m[3]].map(v => (+v | 0).toString(16).padStart(2, '0')).join('');
  };

  const fonts = {}, text = {}, bg = {};
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ');
    if (own) {
      const fam = s.fontFamily.split(',')[0].replace(/["']/g, '').trim();
      const k = `${fam} ${s.fontWeight}`;
      fonts[k] = (fonts[k] || 0) + own.length;
      const h = toHex(norm(s.color)); if (h) text[h] = (text[h] || 0) + own.length;
    }
    const h = toHex(norm(s.backgroundColor));
    if (h) { const r = el.getBoundingClientRect(); bg[h] = (bg[h] || 0) + r.width * r.height; }
  }
  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ value: k, weight: Math.round(v) }));

  const cssVars = {};
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    for (const r of rules || []) {
      if (!r.style || !/:root|html|body/.test(r.selectorText || '')) continue;
      for (const p of r.style) if (p.startsWith('--')) {
        const v = r.style.getPropertyValue(p).trim();
        if (/^(#[0-9a-f]{3,8}|rgb|hsl|oklch|color\()/i.test(v)) cssVars[p] = v;
      }
    }
  }

  const logos = [];
  const seen = new Set();
  const add = (o) => { const key = o.src || o.svg?.slice(0, 200); if (key && !seen.has(key)) { seen.add(key); logos.push(o); } };
  const isLogo = (el) => /logo|brand/i.test([el.className?.baseVal ?? el.className, el.id, el.getAttribute('alt'), el.getAttribute('aria-label'), el.getAttribute('src'), el.closest('a')?.getAttribute('aria-label')].join(' '));
  const header = document.querySelector('header, nav, [role=banner]');
  for (const img of document.querySelectorAll('img')) {
    if ((isLogo(img) || header?.contains(img)) && img.currentSrc) add({ kind: 'img', src: abs(img.currentSrc), alt: img.alt, w: img.naturalWidth, h: img.naturalHeight });
  }
  for (const svg of document.querySelectorAll('svg')) {
    const r = svg.getBoundingClientRect();
    if ((isLogo(svg) || isLogo(svg.parentElement || svg) || (header?.contains(svg) && r.width > 40)) && r.width > 16) {
      const clone = svg.cloneNode(true);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
      add({ kind: 'svg', svg: clone.outerHTML, color: getComputedStyle(svg).color, w: Math.round(r.width), h: Math.round(r.height) });
    }
  }
  const icons = [...document.querySelectorAll('link[rel*=icon]')].map(l => abs(l.href)).filter(Boolean);
  const og = abs(document.querySelector('meta[property="og:image"]')?.content || '');

  return {
    url: location.href,
    title: document.title,
    description: document.querySelector('meta[name=description]')?.content || '',
    headings: [...document.querySelectorAll('h1,h2,h3')].filter(visible).map(h => h.innerText.trim()).filter(Boolean).slice(0, 15),
    buttons: [...new Set([...document.querySelectorAll('a,button')].filter(visible).map(b => b.innerText.trim()).filter(t => t && t.length < 40))].slice(0, 15),
    fonts: top(fonts, 8),
    textColors: top(text, 8),
    backgroundColors: top(bg, 10),
    cssColorVars: cssVars,
    logos: logos.slice(0, 8),
    icons, og,
  };
});

const ext = (u, ct) => {
  const fromUrl = path.extname(new URL(u).pathname).toLowerCase();
  if (/^\.(png|jpe?g|svg|webp|gif|ico|avif)$/.test(fromUrl)) return fromUrl;
  if (ct?.includes('svg')) return '.svg'; if (ct?.includes('png')) return '.png'; if (ct?.includes('jpeg')) return '.jpg'; if (ct?.includes('webp')) return '.webp';
  return '.bin';
};
async function download(u, base) {
  try {
    const r = await page.request.get(u, { timeout: 15000 });
    if (!r.ok()) return null;
    const file = base + ext(u, r.headers()['content-type']);
    fs.writeFileSync(path.join(OUT, file), await r.body());
    return file;
  } catch { return null; }
}

const saved = [];
let n = 1;
for (const l of data.logos) {
  if (l.kind === 'svg') { const f = `logo-${n++}.svg`; fs.writeFileSync(path.join(OUT, f), l.svg); saved.push({ file: f, color: l.color, size: `${l.w}x${l.h}` }); }
  else { const f = await download(l.src, `logo-${n++}`); if (f) saved.push({ file: f, alt: l.alt, size: `${l.w}x${l.h}` }); }
}
let i = 1;
for (const u of data.icons.slice(0, 3)) { const f = await download(u, `favicon-${i++}`); if (f) saved.push({ file: f, kind: 'favicon' }); }
if (data.og) { const f = await download(data.og, 'og-image'); if (f) saved.push({ file: f, kind: 'og:image' }); }
await ctx.close();

const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const m = await mctx.newPage();
try { await m.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); await settle(m); await m.screenshot({ path: path.join(OUT, 'site-mobile.png') }); } catch (e) { console.warn('mobile screenshot failed:', e.message); }
await browser.close();

delete data.logos;
const report = { ...data, savedFiles: saved, screenshots: ['site-desktop.png', 'site-full.png', 'site-mobile.png'] };
fs.writeFileSync(path.join(OUT, 'brand-capture.json'), JSON.stringify(report, null, 2));

console.log(`✔ ${data.title}`);
console.log(`  fonts:  ${data.fonts.slice(0, 4).map(f => f.value).join(' · ')}`);
console.log(`  text:   ${data.textColors.slice(0, 5).map(c => c.value).join(' ')}`);
console.log(`  bg:     ${data.backgroundColors.slice(0, 5).map(c => c.value).join(' ')}`);
console.log(`  vars:   ${Object.keys(data.cssColorVars).length} color variables`);
console.log(`  files:  ${saved.map(s => s.file).join(', ') || '(no logo found)'}`);
console.log(`  report: ${path.join(OUT, 'brand-capture.json')}`);
