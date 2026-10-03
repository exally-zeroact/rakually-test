/* hidden-flush-ui.mjs — ★hidden/pagehide で 待ち保存を 早出しする 受け手が 効いているか★（実ブラウザ・WebKit）
 * ============================================================================
 * ★守る 事（2026-10-03・指示役と）★ … iPhone 等 beforeunload が 出ない 端末で、デバウンス(500ms)の 途中で
 *   閉じ／ホームへ 戻ると 待ち保存が 倉庫に 届かない 穴（字で 確定＝app.js は 6794 の beforeunload しか 受け手が 無く、
 *   pagehide/visibilitychange は 0 だった）。直し＝hidden/pagehide で 待ち(_saveT)が 在る時だけ 早出し。
 *
 * ★この門が 見る 事★ … 答えて（#c-payday-day に 打って）デバウンスが 走っている間に ★pagehide を 起こす★と、
 *   ★500ms を 待たずに★ 倉庫への 書き（答えた値入り）が 出る＝★早出しの 受け手が 在って 効いている★。
 * ★この門が 見ない 事（頭に1行）★ … ★「iPhone の実機で 閉じた直後に 倉庫に 本当に 届くか」は 見ない★。
 *   pagehide を 試験で 起こしても ページは 死なない＝客の道の 完全な 真似では ない（memory:
 *   feedback_js_dispatched_event_is_not_the_customer_path）。ここは「早出しの受け手が 在り 効く」までの門。
 *
 * ★空振り止め（--waza）★ … サーバで app.js の 早出しの受け手（visibilitychange/pagehide の2行）を 外して 配る
 *   ⇒ pagehide を 起こしても 500ms 内に 書きが 出ない＝門が 受け手を 守っている 証し。
 *
 * 使い方: node kyuyo/tests/hidden-flush-ui.mjs          （早出しが 効く＝500ms内に 出る）
 *         node kyuyo/tests/hidden-flush-ui.mjs --waza    （受け手を外す＝出ない＝門が効く証し）
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const { kagiAru, hairu, shizumaru, toziru, ooiWoMiru } = await import('../../tests/_hairu.mjs');
if (!(await kagiAru(ROOT))) {
  console.log('🟡 ★未測定★ ★本番の repo では 測りません★（試験用の 口が 居ません）');
  process.exit(0);
}
const { borrow, launch } = await import('../../scripts/_borrow-playwright.mjs');
const wk = await borrow('hidden-flush-ui', 'webkit');
if (!wk) { console.log('🟡 ★未測定★ playwright を 借りられない（0件＝合格 とは 書かない）'); process.exit(2); }

const WAZA = process.argv.indexOf('--waza') >= 0;
/* ★早出しの受け手（2行）を 外す 置換★（--waza の時だけ） */
const SV_MAE = "document.addEventListener('visibilitychange', function(){ if(document.visibilityState==='hidden') _flushMachi(); });";
const SV_ATO = 'void 0;';
const SP_MAE = "window.addEventListener('pagehide', _flushMachi);";
const SP_ATO = 'void 0;';
let mongae = 0;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const srv = http.createServer((rq, rs) => {
  const u = decodeURIComponent(rq.url.split('?')[0]);
  let p = path.join(ROOT, u);
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { rs.writeHead(404); rs.end('x'); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  if (WAZA && u.indexOf('/kyuyo/js/app.js') === 0) {
    let src = fs.readFileSync(p, 'utf8');
    const a = src.split(SV_MAE).length - 1, b = src.split(SP_MAE).length - 1;
    mongae = a + b;
    src = src.split(SV_MAE).join(SV_ATO).split(SP_MAE).join(SP_ATO);
    rs.end(src);
    return;
  }
  rs.end(fs.readFileSync(p));
});
await new Promise((r) => srv.listen(0, r));
const URL = 'http://localhost:' + srv.address().port + '/kyuyo/index.html';
const b = await launch('hidden-flush-ui', wk);

let pass = 0, fail = 0, shippai = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };

console.log('\n[hidden-flush-ui] hidden/pagehide で 待ち保存を 早出し（デバウンス500msを 待たずに 出る）' + (WAZA ? '  ★★受け手を外した回★★' : ''));

const cx = await b.newContext();
const pg = await cx.newPage();
const kaki = [];   /* { tbl, body, t } */
await pg.route('**/rest/v1/pay_**', (rt) => {
  const m = rt.request().method();
  if (m === 'GET' || m === 'HEAD') return rt.continue();
  const u = rt.request().url();
  const tbl = (u.match(/\/rest\/v1\/([^/?]+)/) || [])[1] || '';
  let body = ''; try { body = rt.request().postData() || ''; } catch (e) { body = ''; }
  kaki.push({ tbl, body, t: Date.now() });
  return rt.abort();
});

const hai = await hairu(pg, URL, '.bn[data-scr]');
if (!hai.haitta) { console.log('🟡 ★未測定★ ログインできない（' + (hai.naze || hai.kai + '回試') + '）'); await b.close().catch(() => {}); srv.close(); process.exit(2); }
await shizumaru(pg, 1500, 20000);

try {
  let settledOk = false;
  for (let i = 0; i < 30; i++) {
    if (await pg.click('.bn[data-scr="scr-settings"]', { timeout: 1000 }).then(() => true).catch(() => false)) { settledOk = true; break; }
    await new Promise((r) => setTimeout(r, 300));
  }
  T('設定画面へ行けた', settledOk);
  await shizumaru(pg, 1500, 20000);
  await toziru(pg);
  const mi = await ooiWoMiru(pg);
  if (mi.conflict) {
    console.log('🟡 ★未測定★ 共有口に conflict の覆いが出た（この門の失敗ではない）／箱「' + (mi.ji || '').slice(0, 30) + '」');
    await pg.close().catch(() => {}); await cx.close().catch(() => {}); await b.close().catch(() => {}); srv.close();
    process.exit(2);
  }
  const RAN = '#c-payday-day';
  if (!(await pg.$(RAN))) throw new Error('ran-nai');
  const ima = (await pg.$eval(RAN, (el) => el.value).catch(() => '')) || '';
  const ATAI = (ima === '27') ? '23' : '27';

  /* ①写しのバイト（login/初期保存から・pay_employees は 人数で 伸びる＝keepalive64KB の 可否の数） */
  const bytes = (s) => Buffer.byteLength(String(s || ''), 'utf8');
  const coBytes0 = Math.max(0, ...kaki.filter((k) => k.tbl === 'pay_companies').map((k) => bytes(k.body)));
  const empBytes0 = Math.max(0, ...kaki.filter((k) => k.tbl === 'pay_employees').map((k) => bytes(k.body)));

  /* 打つ（＝デバウンス500msが 走り出す）→ すぐ pagehide を 起こす → 500ms を 待たずに 出るか */
  kaki.length = 0;
  await pg.click(RAN);
  await pg.keyboard.press('Control+A');
  await pg.keyboard.press('Backspace');
  await pg.keyboard.type(ATAI, { delay: 10 });
  const tType = Date.now();
  await pg.evaluate(() => { window.dispatchEvent(new Event('pagehide')); });   /* ★hidden/pagehide を 起こす★ */
  /* ★500ms(デバウンス)より 手前で 見る★＝早出しなら ここで 出ている・無ければ まだ 出ていない */
  let hayaDashi = false, tFirst = 0;
  for (let i = 0; i < 16; i++) {   /* 最大 ~320ms */
    const w = kaki.find((k) => k.tbl === 'pay_companies' && k.body.indexOf(ATAI) >= 0);
    if (w) { hayaDashi = true; tFirst = w.t - tType; break; }
    if (Date.now() - tType > 400) break;   /* 500ms デバウンスの手前で 止める */
    await new Promise((r) => setTimeout(r, 20));
  }
  console.log('     打った値=' + ATAI + ' → pagehide ／ 500ms手前で 書きが出た=' + hayaDashi + (hayaDashi ? '（' + tFirst + 'ms）' : '') + ' ／ pay_companies書き ' + kaki.filter((k) => k.tbl === 'pay_companies').length + '本');

  /* ═══ 指示役の3つの数 ═══ */
  const pagehideN = kaki.filter((k) => k.tbl === 'pay_companies').length;   /* ②pagehide後の本数 */
  await pg.evaluate(() => { window.dispatchEvent(new Event('beforeunload')); });   /* ②beforeunload も 起こす */
  for (let i = 0; i < 24; i++) { if (kaki.filter((k) => k.tbl === 'pay_companies').length > pagehideN) break; await new Promise((r) => setTimeout(r, 25)); }
  const beforeunloadN = kaki.filter((k) => k.tbl === 'pay_companies').length - pagehideN;
  console.log('     【数①写しのバイト】pay_companies=' + coBytes0 + 'B ／ pay_employees=' + empBytes0 + 'B（keepalive上限 65536B＝' + (empBytes0 > 65536 || coBytes0 > 65536 ? '★超え得る＝(b)不可★' : 'この口では未超・但し人数で伸びる') + '）');
  console.log('     【数②閉じた時の書き本数（' + (WAZA ? '直す前=受け手無し' : '直した後=早出し有り') + '・PCの形）】pagehide後 ' + pagehideN + '本＋beforeunload後 ' + beforeunloadN + '本＝計 ' + (pagehideN + beforeunloadN) + '本');
  console.log('     【数③hidden で conflict箱の道】在る（_flushMachi→persistSave→conflictなら箱・隠れ中に出て戻ると見える＝害なし）');

  if (!WAZA) {
    T('★pagehide で 待ち保存が 早出しされる（500msを待たず・答えた値入り）★', hayaDashi,
      '500ms手前で pay_companies の書きが出ていない＝早出しの受け手が効いていない');
  } else {
    T('★わざ置換が効いた（早出しの受け手を 外した）★', mongae === 2, '外せた箇所=' + mongae);
    T('★--waza: 受け手を外すと pagehide では 500ms手前に 出ない（門が受け手を守る証し）★', !hayaDashi,
      '受け手を外したのに 早出しされた');
  }
} catch (e) {
  if (String((e && e.message) || e) !== 'ran-nai') { console.log('  ✗ 途中で転んだ … ' + ((e && e.message) || e)); }
  shippai++;
} finally {
  await pg.close().catch(() => {});
  await cx.close().catch(() => {});
  await b.close().catch(() => {});
  srv.close();
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit((fail + shippai) ? 1 : 0);
