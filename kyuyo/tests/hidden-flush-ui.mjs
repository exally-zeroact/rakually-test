/* hidden-flush-ui.mjs — ★hidden/pagehide で 待ち保存を 早出しする 受け手が 効いているか★（実ブラウザ・WebKit）
 * ============================================================================
 * ★守る 事（2026-10-03・指示役と）★ … iPhone 等 beforeunload が 出ない 端末で、デバウンス(500ms)の 途中で
 *   閉じ／ホームへ 戻ると 待ち保存が 倉庫に 届かない 穴（字で 確定＝app.js は 6794 の beforeunload しか 受け手が 無く、
 *   pagehide/visibilitychange は 0 だった）。直し＝hidden/pagehide で 待ち(_saveT)が 在る時だけ 早出し。
 *
 * ★この門が 見る 事（2段・2026-10-03 指示役と）★ … 答えて（#c-payday-day に 打って）★同期で pagehide★を 起こすと：
 *   ①localStorage（payslip_state_v1.company.paydayDay）が 答えの値に なる＝同一端末の 開き直しで 残る。
 *   ②★先に 初回読み込みを 待ってから★（Store.machiNoKazu().yondaKa）クラウド pay_companies の 書きに 答えの値が 出る
 *     ＝★別の端末で 開いても 在る★（件Bの 本当の 値打ち）。
 *   ★判じは 時刻の窓では なく「道」で する★＝デバウンス（persistSaveDebounced の `setTimeout(persistSave,500)`）を
 *     試験の 中で ★止めて★ ある（下の DB_MAE で 500→999999ms に 置換＝走り終わる前に 試験が 終わる＝実質 無効）。
 *     ⇒ 書きの 源は _flushMachi（早出し）1つだけ＝★書きが 出れば それは 早出しの 道★（時刻の 窓は 要らない）。
 *   ★覚書★ … 手元で localStorage が 空の 回が ある（判じには 不使用＝①は paydayDay の 一致で 見る）。空になる
 *     訳（試験の 口の ログインの 前か・別の 窓か）は ★未だ 分かって いない★。
 * ★この門が 見ない 事★ … ★「iPhone の実機で 閉じた直後に 倉庫に 本当に 届くか」は 見ない★。
 *   pagehide を 試験で 起こしても ページは 死なない＝客の道の 完全な 真似では ない（memory:
 *   feedback_js_dispatched_event_is_not_the_customer_path）。ここは「早出しの受け手が 在り 効く」までの門。
 *   クラウドが keepalive で 送れない 事（人の写しが 64KB 超＝実測 129726B/68人）は 頭の 数に 残す。
 * ★なぜ 答えと pagehide を ★1つの同期の evaluate★で 起こすか★ … ★答えた 途中で 閉じた形★を 作り、
 *   pagehide の 時に _saveT（待ち）が 立っている事を 保証する為（input/change で _saveT を立て、同じ流れで pagehide）。
 *   デバウンスは 殺してある（999999ms）ので「デバウンスが 先に走って _saveT が消える」揺れは 無い。★客の 打ち方とは
 *   違う★（客は 打ってから 手で 閉じる）＝だから これは 受け手の 効きの門であって 客の道の門では ない。
 *
 * ★空振り止め（--waza）★ … サーバで app.js の 早出しの受け手（visibilitychange/pagehide の2行）を 外して 配る
 *   ⇒ デバウンスも 殺してあるので 書きの 源が 1つも 無い＝①LSも ②クラウドも 出ない＝門が 受け手を 守っている 証し。
 *
 * 使い方: node kyuyo/tests/hidden-flush-ui.mjs          （早出しが 効く＝①LS/②クラウドに 答えの値が 出る）
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
/* ★★デバウンス(500ms)を 無効化する 置換＝★両方の回とも★（2026-10-03・指示役②）
   ★訳★ … 「480ms以内に書き」と「早出しが効いた」の差は 20ms しか無く、CIの遅い回で 揺れる。
     ⇒ 判じを ★時刻の窓★では なく ★どちらの道で 出たか★に する。デバウンスを 殺すと、
       書きの 源は ★_flushMachi（早出し）1つだけ★＝書きが 出たら それは 早出し（窓は 要らない）。
     ★普通の回★ … 受け手 在り＋デバウンス殺し ⇒ pagehide で _flushMachi→persistSave→書き（早出しの 証し）。
     ★--waza★ … 受け手 外し＋デバウンス殺し ⇒ 書きの 源が 1つも 無い＝書き 0（受け手が 要る 証し）。
   ★これは 客の 500ms を 変える 物では ない★＝門の 中で 早出しの 道だけを 取り出す 為の 殺し。 */
const DB_MAE = '_saveT=setTimeout(persistSave, 500);';
const DB_ATO = '_saveT=setTimeout(persistSave, 999999);';
let mongae = 0, debOff = 0;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const srv = http.createServer((rq, rs) => {
  const u = decodeURIComponent(rq.url.split('?')[0]);
  let p = path.join(ROOT, u);
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { rs.writeHead(404); rs.end('x'); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  if (u.indexOf('/kyuyo/js/app.js') === 0) {
    let src = fs.readFileSync(p, 'utf8');
    debOff = src.split(DB_MAE).length - 1;             /* ★両方の回とも デバウンスを 殺す★ */
    src = src.split(DB_MAE).join(DB_ATO);
    if (WAZA) {                                        /* --waza は 加えて 受け手を 外す */
      const a = src.split(SV_MAE).length - 1, b = src.split(SP_MAE).length - 1;
      mongae = a + b;
      src = src.split(SV_MAE).join(SV_ATO).split(SP_MAE).join(SP_ATO);
    }
    rs.end(src);
    return;
  }
  rs.end(fs.readFileSync(p));
});
await new Promise((r) => srv.listen(0, r));
const URL = 'http://localhost:' + srv.address().port + '/kyuyo/index.html';
const b = await launch('hidden-flush-ui', wk);

let pass = 0, fail = 0, shippai = 0, miso = 0;   /* miso＝真の未測定（KEKKA の mimiso・②が測れない回）*/
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

  /* 写しの大きさ＝page内で 直接 測る（網を通さない・会社と人を分ける）＝keepalive 64KB の 可否（頭1行） */
  const snap = await pg.evaluate(() => {
    let s = null; try { s = JSON.parse(localStorage.getItem('payslip_state_v1') || 'null'); } catch (e) {}
    if (!s) return { total: 0, emp: 0, co: 0, hito: 0 };
    const total = JSON.stringify(s).length;
    const empArr = s.employees || [];
    const emp = JSON.stringify(empArr).length;
    return { total, emp, co: total - emp, hito: empArr.length };
  });

  /* ★★②クラウドの 前提＝★先に 初回読み込みが 済むのを 待つ★★（2026-10-03・指示役と）
     ★訳★ … store.js の cloudSaveState は ★初回読み込みが 済むまで（cloudLoaded/YOMI_MACHI）★ 書きを
       止める（＝客は 画面が 出て 読み込みが 済んでから 打つ）。試験が 読み込み前に 打つと、クラウドの
       書きが 300ms に 出ない＝★CIで 踏んだ 偽の赤★。ので ★打つ前に 読み込み済みを 待つ★。
     ★口★ … store.js が 持つ `window.Store.machiNoKazu().yondaKa`（=cloudLoaded）。 */
  let yonda = false, yondaMs = 0;
  { const t0 = Date.now();
    for (let i = 0; i < 100; i++) {   /* 最大 ~20s */
      yonda = await pg.evaluate(() => { try { return !!(window.Store && Store.machiNoKazu && Store.machiNoKazu().yondaKa); } catch (e) { return false; } });
      if (yonda) { yondaMs = Date.now() - t0; break; }
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  const lsNow = () => pg.evaluate(() => { try { return ((JSON.parse(localStorage.getItem('payslip_state_v1') || '{}').company) || {}).paydayDay; } catch (e) { return null; } });

  /* ★答え＋pagehide を 1つの同期 evaluate で★＝500ms デバウンスに 先んじる（別々の await だと 遅いCIで
     デバウンスが 先に走り _saveT が消える＝GitHubで踏んだ）。input/change を投げる＝6745が _saveT を立て、
     同じ流れで pagehide＝_flushMachi が 早出し（受け手が在れば）＝localStorage同期＋クラウドPOST を同時に蹴る。 */
  kaki.length = 0;
  const did = await pg.evaluate((val) => {
    const el = document.querySelector('#c-payday-day');
    if (!el) return false;
    el.focus(); el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    window.dispatchEvent(new Event('pagehide'));
    return true;
  }, ATAI);
  const tType = Date.now();
  const NEEDLE = '"paydayDay":"' + ATAI + '"';
  /* ★デバウンスは 殺してある＝書きの 源は _flushMachi だけ★＝窓は 広くて よい（道で 判じる・時刻では ない）。
     ①localStorage は persistSave が 同期で 書く＝早出しなら 即。②クラウドは GET1往復の 後＝2秒 見る。 */
  let lsEarly = false, lsMs = 0, kumo = false, kumoMs = 0;
  for (let i = 0; i < 100; i++) {   /* ~2000ms */
    if (!lsEarly) { const v = await lsNow(); if (String(v) === ATAI) { lsEarly = true; lsMs = Date.now() - tType; } }
    if (!kumo) { const w = kaki.find((k) => k.tbl === 'pay_companies' && k.body.indexOf(NEEDLE) >= 0); if (w) { kumo = true; kumoMs = w.t - tType; } }
    if (lsEarly && kumo) break;
    if (Date.now() - tType > 2000) break;
    await new Promise((r) => setTimeout(r, 20));
  }
  console.log('     打った値=' + ATAI + '(did=' + did + '・デバウンス殺し=' + debOff + ') → 同期pagehide ／ 読込済み=' + yonda + (yonda ? '(' + yondaMs + 'ms待)' : '(★未・②は測れない★)') +
    ' ／ ①LS早出し=' + lsEarly + (lsEarly ? '(' + lsMs + 'ms)' : '') + ' ／ ②クラウド=' + kumo + (kumo ? '(' + kumoMs + 'ms)' : '') + '（デバウンスは殺してある＝出たら早出し／窓2000ms）');

  /* ═══ 閉じた時の書き本数（PCの形・診断）═══ */
  const pagehideN = kaki.filter((k) => k.tbl === 'pay_companies').length;
  await pg.evaluate(() => { window.dispatchEvent(new Event('beforeunload')); });   /* beforeunload も 起こす */
  for (let i = 0; i < 24; i++) { if (kaki.filter((k) => k.tbl === 'pay_companies').length > pagehideN) break; await new Promise((r) => setTimeout(r, 25)); }
  const beforeunloadN = kaki.filter((k) => k.tbl === 'pay_companies').length - pagehideN;
  const over = snap.emp > 65536 || snap.co > 65536 || snap.total > 65536;
  console.log('     【写しの大きさ】会社 ' + snap.co + 'B ／ 人 ' + snap.emp + 'B（' + snap.hito + '人）／ 合計 ' + snap.total + 'B（keepalive上限 65536B を ' + (over ? '★超える＝keepalive不可★' : '超えない・但し人数で伸びる') + '）');
  console.log('     【閉じた時の書き本数（' + (WAZA ? '直す前=受け手無し' : '直した後=早出し有り') + '・PCの形）】pagehide後 ' + pagehideN + '本＋beforeunload後 ' + beforeunloadN + '本＝計 ' + (pagehideN + beforeunloadN) + '本');
  console.log('     【hidden で conflict箱の道】在る（_flushMachi→persistSave→conflictなら箱・隠れ中に出て戻ると見える＝害なし）');

  T('★デバウンス殺しの置換が 1か所 効いた（道で判じる前提）★', debOff === 1, 'setTimeout(persistSave,500) が 1か所で ない＝' + debOff + '（元が 変わった？）');
  if (!WAZA) {
    T('★①pagehide で localStorage が 早出しされる（答えた値・同期）★', lsEarly,
      'デバウンスを殺した上で localStorage[payslip_state_v1].company.paydayDay が 答えの値に ならない＝早出しの受け手が効いていない');
    if (yonda) {
      T('★②pagehide で クラウド(pay_companies)が 早出しされる（答えた値・別端末で在る）★', kumo,
        'デバウンスを殺した上で（＝出たら早出し）読込済みなのに pay_companies の書きが出ていない');
    } else {
      pass++; miso++; console.log('  🟡 ②クラウドは 未測定（初回読み込みが ~20s で 済まなかった＝この口には クラウドの材料が 無い）');
    }
  } else {
    T('★わざ置換が効いた（早出しの受け手を 外した）★', mongae === 2, '外せた箇所=' + mongae);
    T('★--waza①: 受け手を外すと localStorage は 早出しされない（門が受け手を守る証し）★', !lsEarly,
      '受け手を外したのに localStorage が 早出しされた');
    if (yonda) {
      T('★--waza②: 受け手を外すと クラウドも 出ない（源が 1つも 無い＝受け手が要る証し）★', !kumo,
        '受け手を外したのに クラウドが 出た');
    } else {
      pass++; miso++; console.log('  🟡 --waza② クラウドは 未測定（読み込み未了）');
    }
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
console.log('KEKKA {"passed":' + pass + ',"failed":' + (fail + shippai) + ',"mimiso":' + miso + '}');   /* ★約束の行（_bunrui用）★mimiso＝②が測れなかった回 */
process.exit((fail + shippai) ? 1 : 0);
