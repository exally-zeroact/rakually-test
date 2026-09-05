/* sumaho-haba.mjs — ★スマホ幅で 潰れ0・はみ出し0★（給与・請求書 とも）
 * =============================================================================
 * ★なぜ（2026-09-05 司さん）★
 *   「★もう出来とる代行請求書のアプリと比較しろや／同じことやらすな★」
 *   ⇒★司さんに もう一度 実機で 1周させない★。
 *     ★代行請求（daikou-seikyu）が すでに 人の手で 見つけて 機械に 落とした 物差し★を 借りる。
 *
 * ★借り元（測り方だけ・見た目は 借りない）★
 *   Exally-test/tests/e2e/paper-width.spec.js（2026-08-10）
 *     「flex/grid の箱に入った字は ★DOMに在るのに1文字ずつ縦に割れる★ ことがある。
 *       この型で踏むのは ★3回目★なので、幅を変えて 実際に測る 試験にした」
 *   ★測り方★
 *     ①横に 溢れていないか … documentElement.scrollWidth − clientWidth
 *     ②縦に 割れていないか … ★幅が 1文字ぶん程度しか無いのに 背が高い★ 要素を 数える
 *        （子を 持たない＝自分が 字を 描いている 物だけ 見る／4文字以上）
 *
 * ★うちで 何を 見るか★
 *   ★給与★ 明細の 画面／★請求書★ 入口
 *   幅 375（iPhone SE〜）／390（iPhone 14）／412（Android）
 *
 * ★未測定の 言い方★
 *   playwright が 借りられない機械では ★未測定★（0件＝合格 とは 書かない）
 *
 * 使い方: node tests/sumaho-haba.mjs [--self-test]
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = process.argv.includes('--self-test');

/* ★物差しそのもの★（ブラウザの 中で 走る／自己確認でも 使う）
   ★1文字ずつ 縦に 割れている＝幅が 1文字ぶん程度しか 無いのに 背が高い★

   ★2026-09-05 実測＝境界が ゆれる★（借り元にも 同じ ゆれが 在る）
     JS の 掛け算は ★12 × 1.6 = 19.200000000000003★／★12 × 2.4 = 28.799999999999997★
     ⇒ 幅 ちょうど 19.2／高さ ちょうど 28.8 が ★割れ扱いに なる★（19.2 < 19.2000…3 が true）
     ⇒★見張りが 誤って 鳴る＝人が 見なくなる★＝一番 まずい
   ★直し★＝★ちょうどは 割れに しない★（1e-9 の 余裕を 足す）
     ＝★「1文字ぶんより ★狭い★」「2.4倍より ★高い★」を 字のまま★ */
var YURUSHI = 1e-9;
export function warete(r, fs2) {
  return (r.width < fs2 * 1.6 - YURUSHI) && (r.height > fs2 * 2.4 + YURUSHI);
}
export function hamidashi(scrollWidth, clientWidth) { return scrollWidth - clientWidth; }

if (SELF) {
  console.log('\n[sumaho-haba] ★自己確認★（★物差しそのもの★・ブラウザを 使わない）');
  let ng = 0;
  const say = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  say('★1文字ずつ 縦に 割れている（幅16・高さ60・字12）… 見つける★', warete({ width: 16, height: 60 }, 12) === true);
  say('ふつうの 1行（幅200・高さ18・字12）… 見つけない', warete({ width: 200, height: 18 }, 12) === false);
  say('★背が 高くても 幅が 在れば 見つけない★（幅200・高さ60）', warete({ width: 200, height: 60 }, 12) === false);
  say('★幅が 狭くても 背が 低ければ 見つけない★（幅16・高さ18）', warete({ width: 16, height: 18 }, 12) === false);
  say('境界 … 幅ちょうど 19.2（＝12×1.6）は 見つけない', warete({ width: 19.2, height: 60 }, 12) === false);
  say('境界 … 高さちょうど 28.8（＝12×2.4）は 見つけない', warete({ width: 16, height: 28.8 }, 12) === false);
  say('はみ出し … 同じなら 0', hamidashi(390, 390) === 0);
  say('★はみ出し … 12px 溢れている★', hamidashi(402, 390) === 12);
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★8通り ぜんぶ 思った通り★');
  process.exit(0);
}

/* ── ここから 実ブラウザ ───────────────────────────────── */
import { hairu, toziru, osu } from './_hairu.mjs';   /* ★入る手順は 1か所★ */
let borrow, pwLaunch;
try { ({ borrow, launch: pwLaunch } = await import('../scripts/_borrow-playwright.mjs')); }
catch (e) { console.log('🟡 ★未測定★ playwright を 借りる 道具が 読めない … ' + (e && e.message)); process.exit(2); }
const wk = await borrow('sumaho-haba', 'webkit');
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
const b = await pwLaunch('sumaho-haba', wk);

const HABA = [375, 390, 412];
/* ★押す物の 一覧を 先に 書く★（決まり＝実UIの 押し込みは 一覧を 先に） */
const GAMEN = [
  { nm: '給与（入口）', url: '/kyuyo/index.html', matsu: '#loginEmail, .bn[data-scr]' },
  { nm: '請求書（入口）', url: '/seikyu/index.html', matsu: 'input, button, .bn, [data-scr]' },
  { nm: '従業員の明細（web）', url: '/kyuyo/meisai.html', matsu: 'body > *' }
];
/* ★入口だけでは 足りない★＝★入ってからの 画面★も 見る（2026-09-05）
   ★代行請求は 6画面（設定/入金/入力/一覧/編集/請求）を 1つずつ 押していた★
   ⇒ うちも ★入ってから タブを 1つずつ 押して 測る★（押す物の 一覧を 先に 書く） */
/* ★名前は 実物から 取る★（2026-09-05＝推し量って 6件 空振りした）
     kyuyo/index.html の data-scr を 数えた＝5つ */
const NAKA = ['scr-input', 'scr-list', 'scr-print', 'scr-furikomi', 'scr-settings'];

let akai = 0, mihakari = 0, mita = 0, mattaKei = 0;
for (const g of GAMEN) {
  for (const w of HABA) {
    const pg = await (await b.newContext({ viewport: { width: w, height: 820 } })).newPage();
    const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));
    await pg.goto('http://localhost:' + PORT + g.url, { waitUntil: 'domcontentloaded' });
    /* ★出た事その物を 待つ★（回数も 出す＝2026-09-04 の 決まり） */
    let matta = 0, deta = false;
    for (let i = 0; i < 60; i++) { matta++; if (await pg.$(g.matsu)) { deta = true; break; } await new Promise((r) => setTimeout(r, 250)); }
    mattaKei += matta;
    if (!deta) { console.log('  🟡 ' + g.nm + ' 幅' + w + ' … ★未測定★（入口の 部品が 出ない・待った ' + matta + '回）'); mihakari++; await pg.close(); continue; }
    await new Promise((r) => setTimeout(r, 400));
    const m = await pg.evaluate(() => {
      const de = document.documentElement;
      const bad = [];
      const all = document.querySelectorAll('body *');
      for (const el of all) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        if (el.children.length) continue;                 /* 自分が 字を 描いている 物だけ */
        const t = (el.textContent || '').trim();
        /* ★借り元は 4文字未満を 見ていなかった★（2026-09-05 実測）
           ⇒ うちの タブの 札は「入力」「一覧」「印刷」「振込」「設定」＝★2文字★
           ⇒★日本語の 札が まるごと 見張りの 外に 落ちていた★（わざと 潰しても 赤に ならなかった）
           ⇒★2文字から 見る★（1文字は 「×」「✓」等 の 印なので 見ない） */
        if (t.length < 2) continue;
        const fsz = parseFloat(cs.fontSize) || 12;
        /* ★ちょうどは 割れに しない★（1e-9 の 余裕＝上の 注記） */
        if (r.width < fsz * 1.6 - 1e-9 && r.height > fsz * 2.4 + 1e-9) bad.push({ t: t.slice(0, 18), w: Math.round(r.width), h: Math.round(r.height) });
      }
      return { over: de.scrollWidth - de.clientWidth, bad: bad, kazu: all.length };
    });
    mita++;
    const ng = (m.over > 0) || m.bad.length;
    if (ng) akai++;
    console.log('  ' + (ng ? '✗' : '✓') + ' ' + g.nm + ' 幅' + w
      + ' … はみ出し ' + m.over + 'px ／ 縦に割れ ' + m.bad.length + '件 ／ 見た部品 ' + m.kazu + '個'
      + (matta > 2 ? '（待った ' + matta + '回）' : ''));
    if (m.bad.length) m.bad.slice(0, 3).forEach((x) => console.log('       ★割れ★ 「' + x.t + '」 幅' + x.w + '×高' + x.h));
    if (errs.length) { console.log('       ★画面のエラー★ ' + errs.join(' / ')); akai++; }
    await pg.close();
  }
}

/* ── ★入ってからの 画面★（給与）──────────────────────────── */
for (const w of HABA) {
  const pg = await (await b.newContext({ viewport: { width: w, height: 820 } })).newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));
  /* ★入る手順は tests/_hairu.mjs 1か所★（3本に 写していた／★1回で 諦めて たまに 未測定★だった）
     ★覆い（はじめかたガイド等）は 本物の 閉じる ボタンで 閉じる★
     ＝★覆ったままだと クリックが 届かない★（2026-09-05 実測＝ui-modal-ov が 邪魔していた） */
  const _h = await hairu(pg, 'http://localhost:' + PORT + '/kyuyo/index.html', '.bn[data-scr="scr-list"]');
  await toziru(pg);
  const matta = _h.matta;
  if (_h.kai > 1) console.log('  （入るのに ' + _h.kai + '回 掛かりました＝倉庫の 通信の 気まぐれ）');
  mattaKei += matta;
  const haitta = await pg.evaluate(() => { const e = document.getElementById('loginEmail'); return !(e && e.offsetParent); });
  if (!haitta) { console.log('  🟡 給与（入ってから） 幅' + w + ' … ★未測定★（入れなかった）'); mihakari++; await pg.close(); continue; }
  for (const scr of NAKA) {
    const aru = await pg.$('.bn[data-scr="' + scr + '"]');
    if (!aru) { console.log('  🟡 給与 ' + scr + ' 幅' + w + ' … ★未測定★（そのタブが 無い）'); mihakari++; continue; }
    /* ★覆いは 画面を 移るたびに 出る★（2026-09-05 実測＝ここで 落ちていた）
       ⇒★毎回 本物の 閉じる ボタンで 閉じてから 押す★／押せなければ ★未測定★（黙って 落ちない） */
    const o = await osu(pg, '.bn[data-scr="' + scr + '"]');
    if (!o.oseta) { console.log('  🟡 給与 ' + scr + ' 幅' + w + ' … ★未測定★（' + o.kai + '回 試して タブが 押せない・覆いの 閉じ残り ' + o.nokori + '）'); mihakari++; continue; }
    await new Promise((r) => setTimeout(r, 600));
    const m = await pg.evaluate(() => {
      const de = document.documentElement; const bad = [];
      const all = document.querySelectorAll('body *');
      for (const el of all) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        if (el.children.length) continue;
        const t = (el.textContent || '').trim();
        /* ★借り元は 4文字未満を 見ていなかった★（2026-09-05 実測）
           ⇒ うちの タブの 札は「入力」「一覧」「印刷」「振込」「設定」＝★2文字★
           ⇒★日本語の 札が まるごと 見張りの 外に 落ちていた★（わざと 潰しても 赤に ならなかった）
           ⇒★2文字から 見る★（1文字は 「×」「✓」等 の 印なので 見ない） */
        if (t.length < 2) continue;
        const fsz = parseFloat(cs.fontSize) || 12;
        if (r.width < fsz * 1.6 - 1e-9 && r.height > fsz * 2.4 + 1e-9) bad.push({ t: t.slice(0, 18), w: Math.round(r.width), h: Math.round(r.height) });
      }
      return { over: de.scrollWidth - de.clientWidth, bad: bad, kazu: all.length };
    });
    mita++;
    const ng = (m.over > 0) || m.bad.length;
    if (ng) akai++;
    console.log('  ' + (ng ? '✗' : '✓') + ' 給与 ' + scr + ' 幅' + w
      + ' … はみ出し ' + m.over + 'px ／ 縦に割れ ' + m.bad.length + '件 ／ 見た部品 ' + m.kazu + '個');
    if (m.bad.length) m.bad.slice(0, 3).forEach((x) => console.log('       ★割れ★ 「' + x.t + '」 幅' + x.w + '×高' + x.h));
  }
  if (errs.length) { console.log('       ★画面のエラー★ ' + errs.join(' / ')); akai++; }
  await pg.close();
}

await b.close(); srv.close();
console.log('\n  見た ' + mita + '通り ／ ★赤 ' + akai + '★ ／ 🟡未測定 ' + mihakari + ' ／ 待った のべ ' + mattaKei + '回');
console.log('  ★借りたのは 測り方だけ★（daikou-seikyu tests/e2e/paper-width.spec.js・2026-08-10）');
process.exit(akai ? 1 : 0);
