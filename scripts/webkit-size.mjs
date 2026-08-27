/* webkit-size.mjs — ★iOSと同じエンジン(WebKit)で 375/390/430 を見る★
 * =============================================================================
 * ★Chromium だけでは iOS は分かりません★（指示役 2026-08-27）。
 * scripts/input-size.mjs は Chrome で測る物。ここは ★WebKit で もう一度 測る★。
 *
 * ★回せない時は 赤にせず「未測定」と出す★（指示役の裁定 2026-08-28）
 *   playwright は ★この repo の持ち物ではない★（別のrepoから借りる）。
 *   ⇒ ★借り先が無い＝測れない★時は ★はっきり「未測定」と言って 緑で終わる★。
 *   ★0件と 未測定を 混ぜない★（「測れなかった」を「問題なし」と読ませない）。
 *   ★入っていない見張りは 0回 回る★ので、★CIには入れる★（未測定でも 毎回 声は出す）。
 *
 * 数える物 … ①16px未満の打つ欄 ②20×20未満の押す的 ③横はみ出し(px)
 * 使い方: node scripts/webkit-size.mjs [--self-test]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const WIDTHS = [375, 390, 430];
const MIN = 16, TAP = 20;
const OPEN_ALL = '<style>.screen{display:block!important}details>*{display:block!important}'
  + '[hidden]{display:block!important}[style*="display:none"]{display:block!important}'
  + '.hide{display:block!important}.acc-body{display:block!important}</style>';

/* ★playwright は 別の repo に入っている物を借りる★（rakually-test には入れない＝重い依存を足さない） */
/* ★借り先★（この repo には入れない＝重い依存を足さない） */
const LENDERS = [
  'C:/Users/zeroa/Exally-test/node_modules/playwright/index.js',
  'C:/Users/zeroa/Daikou-app/node_modules/playwright/index.js',
  'C:/Users/zeroa/Daikou-app-test/node_modules/playwright/index.js',
];
function unmeasured(why) {
  console.log('[webkit] ★未測定★ … ' + why);
  console.log('  ★これは「問題なし」ではありません★。Chrome で測る scripts/input-size.mjs は 毎回 走っています。');
  console.log('  ★測るには★ playwright（webkit）が要ります: npx playwright install webkit');
  process.exit(0);
}
let webkit = null;
for (const pw of LENDERS) {
  if (!fs.existsSync(pw)) continue;
  try {
    const m = await import(pathToFileURL(pw).href);
    webkit = m.webkit || (m.default && m.default.webkit) || null;
    if (webkit) break;
  } catch (e) { /* 次の借り先を見る */ }
}
if (!webkit) unmeasured('playwright(webkit) を 借りられる場所が 見つかりません');

function screens(root) {
  const out = fs.readdirSync(root).filter((f) => /\.html$/i.test(f));
  for (const app of ['kyuyo', 'seikyu']) {
    const d = path.join(root, app);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) if (/\.html$/i.test(f)) out.push(app + '/' + f);
  }
  return out.sort();
}
function pageOf(rel) {
  const file = path.join(ROOT, rel);
  let html = fs.readFileSync(file, 'utf8');
  html = html.replace(/<script[\s\S]*?<\/script>/g, '');
  html = html.replace(/<link\b[^>]*rel="stylesheet"[^>]*>/gi, (tag) => {
    const m = /href="([^"]+)"/.exec(tag);
    if (!m) return tag;
    const href = m[1].split('?')[0];
    if (/^https?:/.test(href)) return '';
    return tag.replace(m[1], pathToFileURL(path.resolve(path.dirname(file), href)).href);
  });
  return html.replace('</head>', OPEN_ALL + '</head>');
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wk-'));
const b = await webkit.launch();
const rows = [];
for (const rel of screens(ROOT)) {
  const f = path.join(TMP, rel.replace(/[^\w]+/g, '_') + '.html');
  fs.writeFileSync(f, pageOf(rel), 'utf8');
  for (const w of WIDTHS) {
    const ctx = await b.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(pathToFileURL(f).href, { waitUntil: 'load' });
    const r = await page.evaluate(({ MIN, TAP }) => {
      const nm = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '')
        + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().replace(/\s+/g, '.') : '');
      const all = [...document.querySelectorAll('input,select,textarea')].filter((e) => e.type !== 'hidden');
      const small = all.filter((e) => (parseFloat(getComputedStyle(e).fontSize) || 0) < MIN)
        .map((e) => nm(e) + ' ' + getComputedStyle(e).fontSize);
      const taps = all.filter((e) => e.type === 'checkbox' || e.type === 'radio');
      const tapSmall = taps.map((e) => ({ n: nm(e), b: e.getBoundingClientRect() }))
        .filter((x) => x.b.width > 0 && x.b.height > 0 && (x.b.width < TAP || x.b.height < TAP))
        .map((x) => x.n + ' ' + Math.round(x.b.width) + '×' + Math.round(x.b.height));
      const zero = taps.filter((e) => { const r2 = e.getBoundingClientRect(); return r2.width * r2.height === 0; }).map(nm);
      const d = document.documentElement;
      return {
        vw: d.clientWidth, over: d.scrollWidth - d.clientWidth,
        all: all.length, small, taps: taps.length, tapSmall, zero,
      };
    }, { MIN, TAP });
    rows.push({ rel, w, r });
    await ctx.close();
  }
}
await b.close();
fs.rmSync(TMP, { recursive: true, force: true });

console.log('[webkit] iOSと同じエンジン ／ 幅 ' + WIDTHS.join('/') + 'px\n');
let ng = 0;
rows.forEach(({ rel, w, r }) => {
  const bad = r.small.length + r.tapSmall.length + r.zero.length + (r.over > 0 ? 1 : 0);
  ng += bad;
  console.log('  ' + (rel + ' @' + w).padEnd(28)
    + ' 欄 ' + String(r.all).padStart(3) + '本／16px未満 ' + r.small.length
    + '　押す的 ' + String(r.taps).padStart(2) + '個／20×20未満 ' + r.tapSmall.length
    + '　横はみ出し ' + r.over + 'px'
    + (r.vw !== w ? '　★頼んだ幅で測れていない（' + r.vw + '）★' : ''));
  r.small.forEach((s) => console.log('      ★16px未満★ ' + s));
  r.tapSmall.forEach((s) => console.log('      ★押す的が小さい★ ' + s));
  r.zero.forEach((s) => console.log('      ★測れていない(0×0)★ ' + s));
});
console.log('\n★合計 ' + (ng ? '★' + ng + '件★ 直す物が在ります' : '0件（16px未満0本／押す的0個／横はみ出し0px）') + '★');
/* ★測れた上で 見つかった物は 赤★（未測定は 上で緑にして 抜けている） */
if (ng) process.exit(1);
