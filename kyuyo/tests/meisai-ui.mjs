/* meisai-ui.mjs — ★従業員が 自分の 明細を 開く 道★を 実ブラウザで 1本 通す
 * ============================================================================
 * ★なぜ（2026-09-19 実測）★
 *   `kyuyo/meisai.html` ＝★従業員が 自分の スマホで 開く 紙★。
 *   ★開く 試験は 2本 在る★（`tests/scroll-muda.mjs`／`tests/sumaho-haba.mjs`）が
 *   ★どちらも 幅と 転がりだけ★＝★鍵（?t=）を 渡して いない★＝★中身は 出て いない★。
 *   `kyuyo/tests/ui-smoke.mjs` は ★21行で 通信を 切って いる★＝★倉庫から 描く 物は 原理的に 出ない★。
 *   ⇒ ★★明細の 中身が 従業員の 画面に 出る所を、どの 試験も 見て いなかった★★
 *
 * ★ここで見る事★
 *   ① 鍵が 無ければ 中身を 出さない（`sc-bad`）
 *   ② ★正しい 初回コード★で 合言葉を 決められる ⇒ ★一覧が 出る★
 *   ③ ★中身の 字★＝★差引支給額が 会社側で 入れた 数と 1字 違わず 同じ★
 *   ④ ★間違った 初回コード★は 断られる（★②と 出る 字を 変える★）
 *   ⑤ ★他人の token では その人の 紙は 出ない★
 *
 * ★線引き★
 *   ★支度（人・鍵・紙を 作る）は 倉庫に 直に★／★測るのは 従業員の 道（本物の click／打ち込み）★
 *   ＝[[feedback_js_dispatched_event_is_not_the_customer_path]] と 同じ 分け方。
 * ★名前には 席の 印★（`shikenNa`）＝★会社の 検査と 混ざらない★
 * ★本物の 名前・金額・口座は 入れない★（rakually-test は 公開 repo）
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const { kagiAru } = await import('../../tests/_hairu.mjs');
if (!(await kagiAru(ROOT))) {
  console.log('🟡 ★未測定★ ★本番の repo では 測りません★（試験用の 口が 居ません）');
  process.exit(0);
}
const { borrow, launch } = await import('../../scripts/_borrow-playwright.mjs');
const G = await import('./_souko-kazoeru.mjs');
const wk = await borrow('meisai-ui', 'webkit');
if (!wk) { console.log('🟡 ★未測定★ playwright を 借りられない（0件＝合格 とは 書かない）'); process.exit(2); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const srv = http.createServer((rq, rs) => {
  const u = decodeURIComponent(rq.url.split('?')[0]);
  let p = path.join(ROOT, u);
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { rs.writeHead(404); rs.end('x'); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  rs.end(fs.readFileSync(p));
});
await new Promise((r) => srv.listen(0, r));
const PORT = srv.address().port;
const b = await launch('meisai-ui', wk);
const machi = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0, mi = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };
const MI = (n, m) => { mi++; console.log('  🟡 ★はかれない★ ' + n + (m ? ' … ' + m : '')); };

console.log('\n[meisai-ui] 従業員が 自分の 明細を 開く 道（実ブラウザ）');
const soukoMae = await G.kazoeru();
if (!soukoMae.ok) {
  if (G.kankyoKa(soukoMae.naze)) { console.log('  ' + G.kankyoIu('従業員の 明細の 道を 測って いません')); await b.close(); srv.close(); process.exit(0); }
  MI('倉庫を 数えられない', soukoMae.naze); await b.close(); srv.close(); process.exit(1);
}
console.log('  ★席★ ' + G.seki() + ' ／ ★土台★ 人 ' + soukoMae.hito + '／公開 ' + soukoMae.koukai + '／紙 ' + soukoMae.kami);

const NET = 123456;                       /* ★測る 字（わざと 珍しい 数）★＝本物の 金額では ない */
const NA = G.shikenNa('明細試験' + String(Date.now()).slice(-6)) + '　太郎';
let hito = null, tok = null, hito2 = null, tok2 = null;
const shimau = async () => {
  if (hito) { await G.shitakuKesu(hito).catch(() => null); await G.hitoKesu(hito).catch(() => null); }
  if (hito2) { await G.shitakuKesu(hito2).catch(() => null); await G.hitoKesu(hito2).catch(() => null); }
};

try {
  /* ── 支度（★倉庫に 直に★＝測る 所では ない） ───────────── */
  const h = await G.hitoTsukuru(NA);
  if (!h.ok) { MI('支度＝人を 作れない', h.naze); throw new Error('skip'); }
  hito = h.id;
  const k = await G.kagiTsukuru(hito);
  if (!k.ok || !k.token) { MI('支度＝鍵を 作れない', k.naze); throw new Error('skip'); }
  tok = k.token;
  const kami = await G.kamiTsukuru(tok, { net: NET, ym: '2026-06', na: NA });
  if (!kami.ok) { MI('支度＝紙を 作れない', kami.naze); throw new Error('skip'); }
  const h2 = await G.hitoTsukuru(G.shikenNa('明細他人' + String(Date.now()).slice(-6)) + '　太郎');
  if (h2.ok) { hito2 = h2.id; const k2 = await G.kagiTsukuru(hito2); if (k2.ok) tok2 = k2.token; }
  console.log('  支度 … 人「' + NA + '」／鍵 1本／紙 1枚（★差引支給額 ¥' + NET.toLocaleString('en-US') + '★）');

  const URL0 = 'http://localhost:' + PORT + '/kyuyo/meisai.html';
  const mise = () => pg.evaluate(() => {
    const d = ['sc-bad', 'sc-login', 'sc-setup', 'sc-list', 'sc-view', 'sc-consent'].filter((x) => {
      const e = document.getElementById(x); return e && e.offsetParent;
    });
    /* ★★探す 字を 切らない★★（2026-09-19 実測で 踏んだ）
       前は ここで 400字に 切って いた ⇒ ★一覧の 金額が その 外に 在った★
       ⇒ ★「出て いない」と 出た★＝★私が 切った から★（今日 3回目）
       ⇒ ★全部 返す／切るのは 出す 時だけ★ */
    return { ima: d, ji: (document.body.textContent || '').replace(/[ 　]+/g, ' ') };
  });

  /* ── ① 鍵が 無ければ 中身を 出さない ───────────────── */
  let ctx = await b.newContext({ viewport: { width: 390, height: 900 } });
  let pg = await ctx.newPage();
  await pg.goto(URL0, { waitUntil: 'domcontentloaded' }).catch(() => null);
  await machi(2200);
  const a1 = await mise();
  T('★① 鍵（?t=）が 無ければ 中身を 出さない', a1.ima.indexOf('sc-bad') >= 0 && a1.ima.indexOf('sc-list') < 0,
    '出て いる 画面 … ' + a1.ima.join('/'));
  await ctx.close();

  /* ── ④ 間違った 初回コード ─────────────────────── */
  ctx = await b.newContext({ viewport: { width: 390, height: 900 } });
  pg = await ctx.newPage();
  await pg.goto(URL0 + '?t=' + tok + '&c=CHIGAUCODE', { waitUntil: 'domcontentloaded' }).catch(() => null);
  await machi(2400);
  const a4 = await mise();
  const dame = a4.ji.indexOf('コード') >= 0 || a4.ima.indexOf('sc-bad') >= 0 || a4.ima.indexOf('sc-setup') >= 0;
  T('★④ 間違った 初回コードでは 中身を 出さない', a4.ima.indexOf('sc-list') < 0 && a4.ima.indexOf('sc-view') < 0,
    '出て いる 画面 … ' + a4.ima.join('/') + ' ／ 字 … ' + a4.ji.slice(0, 80));
  await ctx.close();

  /* ── ②③ 正しい 初回コード → 合言葉 → 一覧 → 中身の 字 ──── */
  ctx = await b.newContext({ viewport: { width: 390, height: 900 } });
  pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', (e) => errs.push(String((e && e.message) || e).slice(0, 120)));
  await pg.goto(URL0 + '?t=' + tok + '&c=TESTCODE', { waitUntil: 'domcontentloaded' }).catch(() => null);
  await machi(2600);
  const a2 = await mise();
  console.log('       鍵つきで 開いた … 出て いる 画面 ' + a2.ima.join('/'));
  if (a2.ima.indexOf('sc-setup') >= 0) {
    await pg.fill('#setup-pw', 'shiken-aikotoba-1').catch(() => null);
    await pg.fill('#setup-pw2', 'shiken-aikotoba-1').catch(() => null);
    await pg.click('#setup-go', { timeout: 8000 }).catch((e) => console.log('       ★合言葉を 決められない★ ' + String(e.message).slice(0, 60)));
    await machi(2600);
  }
  let a3 = await mise();
  if (a3.ima.indexOf('sc-consent') >= 0) {
    await pg.click('#consent-go', { timeout: 8000 }).catch(() => null);
    await machi(2200);
    a3 = await mise();
  }
  T('★② 正しい 初回コードで 合言葉を 決めて 一覧が 出る',
    a3.ima.indexOf('sc-list') >= 0 || a3.ima.indexOf('sc-view') >= 0,
    '出て いる 画面 … ' + a3.ima.join('/') + ' ／ 字 … ' + a3.ji.slice(0, 120));

  /* 中身を 開く */
  /* ★一覧の 行は `div.drow`（字から 引いた・meisai.js:103）★＝★当てずっぽうの 印を 使わない★
     ★なお 一覧にも 金額が 出る（`yen(p.net)`）★＝★開かなくても ③は 見られる★ */
  await pg.evaluate(() => { const x = document.querySelector('#dlist .drow'); if (x) x.click(); }).catch(() => null);
  await machi(2400);
  const a5 = await mise();
  const kazu = ['¥' + NET.toLocaleString('en-US'), String(NET), NET.toLocaleString('en-US')];
  T('★③ ★差引支給額の 字★が 会社側で 入れた 数と 同じ（¥' + NET.toLocaleString('en-US') + '）',
    kazu.some((x) => a5.ji.indexOf(x) >= 0), '出て いる 字 … ' + a5.ji.slice(0, 200));
  console.log('       ★JSエラー … ' + errs.length + '件★' + (errs.length ? ' … ' + errs.join(' | ') : ''));
  await ctx.close();

  /* ── ⑤ 他人の token では この人の 金額が 出ない ─────────── */
  if (tok2) {
    ctx = await b.newContext({ viewport: { width: 390, height: 900 } });
    pg = await ctx.newPage();
    await pg.goto(URL0 + '?t=' + tok2 + '&c=TESTCODE', { waitUntil: 'domcontentloaded' }).catch(() => null);
    await machi(2600);
    const a6 = await mise();
    T('★⑤ 他人の token で ★この人の 金額★が 出ない',
      !kazu.some((x) => a6.ji.indexOf(x) >= 0), '出て いる 字 … ' + a6.ji.slice(0, 160));
    await ctx.close();
  } else MI('⑤ 他人の token を 作れなかった');
} catch (e) {
  if (String((e && e.message) || e) !== 'skip') { fail++; console.log('  ✗ ★途中で 落ちた★ … ' + String((e && e.message) || e).slice(0, 160)); }
} finally {
  await shimau();
  await b.close().catch(() => null);
  srv.close();
  const sou = await G.awaseru(soukoMae, 20);
  if (sou.han === '環境') { mi++; console.log('  ' + sou.iu); }
  else if (sou.han === '未測定') { mi++; console.log('  🟡 ★未測定★ 後始末を 倉庫で 数えられない … ' + sou.iu); }
  else T('★⑥ 後始末＝倉庫が 元に 戻った', sou.han === '緑', sou.iu);
}

console.log('\n  ' + pass + ' passed, ' + fail + ' failed' + (mi ? ' ／ 🟡未測定 ' + mi : ''));
process.exit((fail || mi) ? 1 : 0);
