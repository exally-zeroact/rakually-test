/* kami-shiro-kuro.mjs — ★給与の 紙は 白黒で 刷っても 読めるか★
 * =============================================================================
 * ★なぜ（2026-09-05 司さん）★
 *   「★もう出来とる代行請求書のアプリと比較しろや／同じことやらすな★」
 *   「★印刷の時の話したけん PDF とかの 見せ方の やり方やなかったんか★」
 *   ⇒★代行請求（daikou-seikyu）が 紙で 踏んだ 穴を、給与でも 踏んでいないか 測る★
 *
 * ★借り元が 紙で 踏んだ 穴（測り方だけ 借りる・見た目は 借りない）★
 *   Exally-test/tests/e2e/paper-ink-fixed.spec.js（指示役 2026-08-15）
 *     「★紙の 文字の 濃さは『全体の色』から 作らない。固定する★」
 *     ★直す前★ 本文・明細・金額が ★#0A5FD0（＝アプリの青 そのもの）★だった
 *     ★決め★ 紙の 本文は ★#1A1A1A★（★色で 作らない★）
 *   Exally-test/js/invoice-pdf.js（2026-08-13 の 事故）
 *     「緑を使い、★白黒で刷ると読めない物★になった」
 *     `RULE = rgb(0.69,…) // ★FAX/白黒で消えないよう一段濃く★`
 *
 * ★ここで 見る 事★（★給与の 紙には 見張りが 1本も 無かった★＝2026-09-05 実測）
 *   ① 紙の 本文が ★画面の 色から 来ていないか★（＝黒に 近いか）
 *   ② ★白黒に して（grayscale）読めるか★＝字と 地の 明るさの 差が 足りているか
 *   ③ 罫線が ★白黒で 消えていないか★
 *
 * ★明るさの 出し方★ … 相対輝度（WCAG）／★差（コントラスト比）は 4.5 以上★を 目安にする
 *   ⇒★白黒に しても 変わらない★（灰色は 明るさだけで 決まる）
 *
 * 使い方: node kyuyo/tests/kami-shiro-kuro.mjs [--self-test]
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = process.argv.includes('--self-test');

/* ★色 → 相対輝度★（WCAG 2.x） */
export function kido(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return null;
  const v = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
/* ★明るさの 差（コントラスト比）★ … 1〜21 */
export function sa(a, b) {
  const x = kido(a), y = kido(b);
  if (x == null || y == null) return null;
  const hi = Math.max(x, y), lo = Math.min(x, y);
  return (hi + 0.05) / (lo + 0.05);
}
export const YOMERU = 4.5;      /* 本文が 読める 目安 */
export const KEISEN = 1.5;      /* 罫線が 見える 目安（線は 本文ほど 濃くなくてよい） */

if (SELF) {
  console.log('\n[kami-shiro-kuro] ★自己確認★（★物差しそのもの★・ブラウザを 使わない）');
  let ng = 0;
  const say = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  say('黒と白 … 差 21（一番 大きい）', Math.round(sa('#000000', '#FFFFFF')) === 21);
  say('同じ色 … 差 1（見えない）', Math.round(sa('#333333', '#333333')) === 1);
  say('★#1A1A1A（借り元が 紙に 決めた 色）は 白地で 読める★', sa('#1A1A1A', '#FFFFFF') >= YOMERU);
  say('★#0A5FD0（アプリの青）も 白地なら 一応 読める★', sa('#0A5FD0', '#FFFFFF') >= YOMERU);
  say('★#52B788（うちの 緑）は 白地で 読めない★', sa('#52B788', '#FFFFFF') < YOMERU);
  say('★薄い灰 #AAAAAA は 白地で 読めない★', sa('#AAAAAA', '#FFFFFF') < YOMERU);
  say('罫線 #D3D3D3 は 白地で ★見えない★（1.5 未満）', sa('#D3D3D3', '#FFFFFF') < KEISEN);
  say('罫線 #B0B0B0 なら ★見える★', sa('#B0B0B0', '#FFFFFF') >= KEISEN);
  say('読めない 色は null に しない（#GGGGGG は null）', kido('#GGGGGG') === null);
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★9通り ぜんぶ 思った通り★');
  process.exit(0);
}

/* ── ここから 実ブラウザ（紙を 実際に 描かせて 色を 拾う）─────────── */
let borrow, pwLaunch;
try { ({ borrow, launch: pwLaunch } = await import('../../scripts/_borrow-playwright.mjs')); }
catch (e) { console.log('🟡 ★未測定★ playwright を 借りる 道具が 読めない … ' + (e && e.message)); process.exit(2); }
const wk = await borrow('kami-shiro-kuro', 'webkit');
if (!wk) { console.log('🟡 ★未測定★ playwright を 借りられない（0件＝合格 とは 書かない）'); process.exit(2); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
const srv = http.createServer((rq, rs) => {
  let p = path.join(ROOT, decodeURIComponent(rq.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { rs.writeHead(404); rs.end('x'); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  rs.end(fs.readFileSync(p));
});
await new Promise((r) => srv.listen(0, r));
const PORT = srv.address().port;
const b = await pwLaunch('kami-shiro-kuro', wk);
const pg = await (await b.newContext({ viewport: { width: 1100, height: 900 } })).newPage();
const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));

console.log('\n[kami-shiro-kuro] 給与の 紙は 白黒で 刷っても 読めるか');
/* ★入る手順は tests/_hairu.mjs 1か所★（3本に 写していた／★1回で 諦めて たまに 赤★だった）
   ★実測 2026-09-05★ ci.yml を 4回 まわすと 毎回 ちがう 1本だけ 赤＝正体は ★ログインの 気まぐれ★
   （控え .sweep-red/177.txt で 見た。★推理を 先に 語らない・記録係を 先に 置く★） */
const { hairu, toziru } = await import('../../tests/_hairu.mjs');
const _h = await hairu(pg, 'http://localhost:' + PORT + '/kyuyo/index.html', '.bn[data-scr="scr-print"]');
await toziru(pg);
if (!_h.haitta) {
  console.log('  🟡 ★未測定★ ' + _h.kai + '回 試して 入れなかった'); await b.close(); srv.close(); process.exit(2);
}
const matta = _h.matta;
console.log('  入口まで … ★待った ' + matta + '回★' + (_h.kai > 1 ? '（★' + _h.kai + '回目で 入れた★）' : ''));

/* ★印刷の 画面を 開く★（紙の 下絵が 出る）
   ★覆いは 押す 直前にも 閉じる★＝1回 閉じても 後から もう1枚 出る事が ある
     （2026-09-05 実測＝ui-modal-ov が 遅れて 出て クリックを 遮った） */
for (let i = 0; i < 15; i++) {
  if (!(await pg.$('.ui-modal-ov'))) break;
  const oseta = await pg.evaluate(() => { const ov = document.querySelector('.ui-modal-ov'); if (!ov) return false;
    const b2 = Array.from(ov.querySelectorAll('button,.close,[data-close]')).find((e) => e.offsetParent && /×|閉じる|あとで|いいえ|キャンセル|OK/.test((e.textContent || '') + (e.getAttribute('aria-label') || ''))); if (b2) { b2.click(); return true; } return false; });
  if (!oseta) break;
  await new Promise((r) => setTimeout(r, 400));
}
/* ★覆いが 遅れて 何度も 出る★ので、★本物の 閉じる を 押した 上で★
   それでも 残る 時は ★DOM から 外して★ 押す（覆いは 画面の 部品では なく 案内） */
await pg.evaluate(() => { document.querySelectorAll('.ui-modal-ov').forEach((e) => e.remove()); });
await pg.click('.bn[data-scr="scr-print"]');
await new Promise((r) => setTimeout(r, 1500));

/* ★紙は iframe の 中に 描かれる★（dailySlipDoc の srcdoc） */
const fr = await pg.$('iframe');
if (!fr) { console.log('  🟡 ★未測定★ 紙の 下絵（iframe）が 出ていない'); await b.close(); srv.close(); process.exit(2); }
const frame = await fr.contentFrame();
if (!frame) { console.log('  🟡 ★未測定★ 紙の 中が 読めない'); await b.close(); srv.close(); process.exit(2); }
await new Promise((r) => setTimeout(r, 800));

const hiroi = await frame.evaluate(() => {
  const hex = (c) => { const m = String(c || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/); if (!m) return null;
    if (m[4] !== undefined && Number(m[4]) === 0) return null;
    return '#' + [1, 2, 3].map((i) => Number(m[i]).toString(16).padStart(2, '0')).join('').toUpperCase(); };
  const ji = [], sen = [];
  const walk = (el) => {
    for (const n of el.childNodes) {
      if (n.nodeType === 3) {
        const t = n.textContent.trim(); if (!t) continue;
        const p = n.parentElement; if (!p) continue;
        const r = p.getBoundingClientRect(); if (!r.width || !r.height) continue;
        const s = getComputedStyle(p);
        if (s.visibility === 'hidden' || s.display === 'none') continue;
        /* 地の 色は 上へ たどって 透明でない 物 */
        let bg = '#FFFFFF', q = p;
        while (q) { const c = hex(getComputedStyle(q).backgroundColor); if (c) { bg = c; break; } q = q.parentElement; }
        const col = hex(s.color);
        if (col) ji.push({ t: t.slice(0, 20), col: col, bg: bg, px: parseFloat(s.fontSize) || 12 });
      } else if (n.nodeType === 1) walk(n);
    }
  };
  walk(document.body);
  /* 罫線 */
  for (const el of document.querySelectorAll('*')) {
    const s = getComputedStyle(el);
    ['Top', 'Bottom', 'Left', 'Right'].forEach((d) => {
      const w = parseFloat(s['border' + d + 'Width']) || 0;
      if (w <= 0 || s['border' + d + 'Style'] === 'none') return;
      const c = hex(s['border' + d + 'Color']);
      if (c) sen.push({ c: c, w: w });
    });
  }
  return { ji: ji, sen: sen };
});
await b.close(); srv.close();

console.log('  ★紙の 字 … ' + hiroi.ji.length + '個／罫線 … ' + hiroi.sen.length + '本★');
if (!hiroi.ji.length) { console.log('  🟡 ★未測定★ 紙に 字が 1つも 無い'); process.exit(2); }

let akai = 0;
const yomenai = hiroi.ji.filter((x) => { const s2 = sa(x.col, x.bg); return s2 != null && s2 < YOMERU; });
const iroKazu = {};
yomenai.forEach((x) => { const k = x.col + ' / 地 ' + x.bg; iroKazu[k] = (iroKazu[k] || 0) + 1; });
console.log('  ' + (yomenai.length ? '✗' : '✓') + ' ★白黒で 読めない 字 … ' + yomenai.length + '個★（目安 コントラスト ' + YOMERU + ' 以上）');
Object.keys(iroKazu).sort((a, c) => iroKazu[c] - iroKazu[a]).slice(0, 8).forEach((k) => {
  const ex = yomenai.find((x) => (x.col + ' / 地 ' + x.bg) === k);
  console.log('     ' + k + ' … ' + iroKazu[k] + '個  差 ' + (Math.round(sa(ex.col, ex.bg) * 10) / 10) + '  例「' + ex.t + '」');
});
if (yomenai.length) akai++;

const senKazu = {};
hiroi.sen.forEach((x) => { const s2 = sa(x.c, '#FFFFFF'); if (s2 != null && s2 < KEISEN) senKazu[x.c] = (senKazu[x.c] || 0) + 1; });
const kieru = Object.keys(senKazu).reduce((a, k) => a + senKazu[k], 0);
console.log('  ' + (kieru ? '✗' : '✓') + ' ★白黒で 消える 罫線 … ' + kieru + '本★（目安 ' + KEISEN + ' 以上）');
Object.keys(senKazu).forEach((k) => console.log('     ' + k + ' … ' + senKazu[k] + '本  差 ' + (Math.round(sa(k, '#FFFFFF') * 10) / 10)));
if (kieru) akai++;

console.log('  画面のエラー … ' + (errs.length ? errs.join(' / ') : '0件'));
console.log('  ★借りたのは 測り方だけ★（daikou-seikyu paper-ink-fixed / invoice-pdf の 白黒対応）');
process.exit(akai ? 1 : 0);
