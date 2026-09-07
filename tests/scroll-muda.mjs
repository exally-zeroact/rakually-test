/* scroll-muda.mjs — ★どの画面も 無駄に 動かない★（iPhone の 空スクロール）
 * ============================================================================
 * ★なぜ（司さん 2026-09-07）★
 *   「スクロールのバグ問題なおせ」→ 入口だけ 直した → ★「ホームだけ直してどうするんどぼけ 全ページでやれや」★
 *   ⇒ ★1画面 直して 終わりに しない★。お客さんが 開く 画面を ★全部★ 見る。
 *
 * ★何が 起きていたか（実測）★
 *   ① `min-height:100vh` … 地の色は body が 持っているのに 箱を 画面の高さで 伸ばしていた
 *      ⇒ 中身が 収まっていても ★紙が 画面より 高くなる★＝空白へ 転がる
 *   ② `vh` そのもの … iPhone の Safari の `100vh` は ★URLバーが 隠れた時★の 高さ
 *      ⇒ バーが 出ている 間は ずっと 少し 長い＝転がせる＝Safari が バーを 畳んで 中身が 跳ねる
 *   ③ 跳ね返り … 端を 越えて 引っぱれ、地の色だけの 画面に なる
 *   ⇒ `html,body{height:100%;overscroll-behavior:none}` で ①②③とも 止まる。
 *
 * ★ここで 見る事（お客さんが 開く 5画面）★
 *   ① 中身が 収まる 画面は ★1pxも 転がらない★（実際に 転がして scrollY が 0）
 *   ② ★止めすぎていない★＝中身を 長くしたら ちゃんと 転がる
 *   ③ どの画面の CSS にも ★vh で 伸ばす指定が 無い★
 *   ④ どの画面にも ★height:100% と 跳ね返り止めが 在る★
 *
 * 使い方: node tests/scroll-muda.mjs [--self-test]
 *   ・ログインが 要る画面が 在るので ★入れない時は 未測定★（0件＝合格 とは 書かない）
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { borrow, launch as pwLaunch } from '../scripts/_borrow-playwright.mjs';
import { hairu, toziru, kagiAru } from './_hairu.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..').split(path.sep).join('/');
const SELF = process.argv.includes('--self-test');

/* ★お客さんが 開く 画面 と、その 高さを 決めている ファイル★ */
const GAMEN = [
  { na: '入口（ホーム）', url: '/index.html', matsu: '.tile', css: ['css/hub.css'] },
  { na: '給与', url: '/kyuyo/index.html', matsu: '.bn[data-scr]', css: ['kyuyo/css/app.css'] },
  { na: '請求書', url: '/seikyu/index.html', matsu: 'body', css: ['css/rakunally-ui.css'] },
  { na: '管理', url: '/kyuyo/admin.html', matsu: 'body', css: ['kyuyo/admin.html'] },
  { na: '従業員の明細', url: '/kyuyo/meisai.html', matsu: 'body', css: ['kyuyo/meisai.html'] },
];

const nuku = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
export function judgeCss(src) {
  const t = nuku(src);
  return {
    nobasu: (t.match(/(min-)?height\s*:\s*100(vh|dvh|svh|lvh)/g) || []).length,
    h100: /html\s*,?\s*body\s*\{[^}]*height\s*:\s*100%/.test(t),
    ov: /html\s*,?\s*body\s*\{[^}]*overscroll-behavior\s*:\s*none/.test(t),
  };
}

if (SELF) {
  console.log('\n[scroll-muda --self-test] 判定そのものが 空振りしていないか');
  let n = 0, ok2 = 0;
  const say = (na, good) => { n++; if (good) ok2++; console.log('  ' + (good ? '✓' : '✗') + ' ' + na); };
  say('vh で 伸ばしていたら 見つける', judgeCss('html,body{height:100%}\n.app{min-height:100vh}').nobasu === 1);
  say('dvh でも 見つける', judgeCss('.app{min-height:100dvh}').nobasu === 1);
  say('★コメントの 中の 100vh は 数えない★', judgeCss('/* min-height:100vh を 外した */html,body{height:100%;overscroll-behavior:none}').nobasu === 0);
  say('height:100% が 無ければ 気づく', judgeCss('html,body{margin:0}').h100 === false);
  say('跳ね返り止めが 無ければ 気づく', judgeCss('html,body{height:100%}').ov === false);
  say('両方 在れば 緑', (() => { const r = judgeCss('html,body{height:100%;overscroll-behavior:none}'); return r.h100 && r.ov && r.nobasu === 0; })());
  console.log('  ★見た ' + n + '件／思ったとおり ' + ok2 + '件★');
  if (n !== ok2) { console.log('★自己確認 おかしい★'); process.exit(1); }
  console.log('\n' + n + ' passed, 0 failed');
  process.exit(0);
}

/* ── ③④ 字で 見る（ログイン不要・必ず 走る） ── */
let ng = 0; const iu = (ok, s) => { if (!ok) ng++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + s); };
console.log('\n[scroll-muda] どの画面も 無駄に 動かないか');
console.log('  ── 決まりが 入っているか（お客さんが 開く 5画面） ──');
for (const g of GAMEN) {
  let nobasu = 0, h100 = false, ov = false;
  for (const f of g.css) {
    const p2 = path.join(ROOT, f);
    if (!fs.existsSync(p2)) { console.log('   🟡 ' + g.na + ' … ' + f + ' が 無い'); ng++; continue; }
    const r = judgeCss(fs.readFileSync(p2, 'utf8'));
    nobasu += r.nobasu; h100 = h100 || r.h100; ov = ov || r.ov;
  }
  iu(nobasu === 0 && h100 && ov,
    g.na.padEnd(7) + ' vhで伸ばす ' + nobasu + '件 ／ height:100% ' + (h100 ? '在り' : '★無し★')
    + ' ／ 跳ね返り止め ' + (ov ? '在り' : '★無し★'));
}

/* ── ①② 実際に 押して 測る（ログインが 要る）── */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const srv = http.createServer((rq, rs) => {
  let p = path.join(ROOT, decodeURIComponent(rq.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { rs.writeHead(404); rs.end('x'); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  rs.end(fs.readFileSync(p));
});
await new Promise((r) => srv.listen(0, r));
const PORT = srv.address().port;
/* ★本番の repo では ログインの 要る画面に 入れない★（試験用の人は テストの倉庫にしか 居ない）
   ⇒ ★黙って 緑に しない★／★赤にも しない★＝「ここでは 測れない」と 字で 言って 抜ける。
     （2026-09-07 実測＝本番で 3画面が 入れず 赤に なった。字の 見張り（上）は 本番でも 効く。） */
if (!(await kagiAru(ROOT))) {
  console.log('\n  ★ここは 本番の repo です＝ログインの 要る画面は 測れません（テスト線で 測っています）★');
  console.log('   （上の「決まりが 入っているか」は 本番でも 効いています）');
  console.log('\n  ★赤 ' + ng + '件★');
  srv.close();
  process.exit(ng ? 1 : 0);
}
let b;
try { b = await pwLaunch('scroll-muda', await borrow('scroll-muda', 'webkit')); }
catch (e) { console.log('\n  🟡 実際に 押す所は 未測定（playwright を 借りられない）'); srv.close(); process.exit(ng ? 1 : 0); }
const m = (ms) => new Promise((r) => setTimeout(r, ms));

/* ★URLバーが 出ている 高さ★でも 見る（745）＝ここが 本番の 姿 */
console.log('\n  ── 実際に 押して 測る（幅390／高745＝URLバーが 出ている時） ──');
for (const g of GAMEN) {
  const pg = await (await b.newContext({ viewport: { width: 390, height: 745 } })).newPage();
  const h = await hairu(pg, 'http://localhost:' + PORT + g.url, g.matsu);
  if (!h.haitta) { console.log('   🟡 ' + g.na + ' … 入れなかった（未測定）'); ng++; await pg.close(); continue; }
  await m(2500); await toziru(pg);
  const mae = await pg.evaluate(() => ({ kami: document.documentElement.scrollHeight, mieru: window.innerHeight }));
  await pg.evaluate(() => window.scrollTo(0, 99999)); await m(500);
  const y = await pg.evaluate(() => Math.round(window.scrollY));
  const nagai = mae.kami > mae.mieru + 4;      /* 元から 中身が 長い画面（給与など） */
  if (nagai) {
    iu(y > 0, g.na.padEnd(7) + ' 中身が 長い … ★ちゃんと 転がる★（scrollY ' + y + '）');
  } else {
    iu(y === 0, g.na.padEnd(7) + ' 中身が 収まる … ★1pxも 転がらない★（scrollY ' + y + '／はみ出し ' + (mae.kami - mae.mieru) + 'px）');
    /* ★止めすぎていない事★＝長い物を 足したら 転がる */
    await pg.evaluate(() => { const d = document.createElement('div'); d.id = 'muda-test'; d.style.height = '2000px'; document.body.appendChild(d); });
    await m(400);
    await pg.evaluate(() => window.scrollTo(0, 99999)); await m(500);
    const y2 = await pg.evaluate(() => Math.round(window.scrollY));
    iu(y2 > 500, '   ' + g.na.padEnd(7) + ' 長い物を 足したら 転がる（止めすぎていない・scrollY ' + y2 + '）');
    await pg.evaluate(() => { const d = document.getElementById('muda-test'); if (d) d.remove(); });
  }
  await pg.close();
}
console.log('\n  ★赤 ' + ng + '件★');
await b.close(); srv.close();
process.exit(ng ? 1 : 0);
