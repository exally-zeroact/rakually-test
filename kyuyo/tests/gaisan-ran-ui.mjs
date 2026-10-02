/* gaisan-ran-ui.mjs — ★「前年度に 納めた 概算」の 欄に 続けて 打てるか★（実ブラウザ・WebKit）
 * ============================================================================
 * ★なぜ（2026-10-02）★
 *   帳票 → 労働保険 →「前年度に 納めた 概算保険料」は ★1文字 打つと 焦点が 外れ★、
 *   ★2桁以上 続けて 打てなかった★（WebKit 実測：3桁 打って 値「」・焦点 BODY）。
 *   訳＝打つ たびに renderChoView() で ★労働保険を「読込中…」から 作り直していた★。
 *   画面の 打てる 欄を ★954欄 全部 打って★ 崩れたのは ★この 1欄だけ★（指示役と 2人で 確かめた）。
 *   直し＝隣の 労災率の 欄と 同じ 形（★精算の 字だけ その場で 書き換える★）。
 *
 * ★ここで 見る 事★
 *   ① 3桁 打つ → ★値が 3桁 そろう AND 焦点が その 欄★（★値だけ 見ない＝作り直した 欄に 値が 入っていて 緑に 見える 型を 止める★）
 *   ② ★打っている 途中（2文字目の 後）に 精算の 字が 打った 額で 出ている★
 *      ＝2文字目と 3文字目で ★字が 変わる★（★確定が 無く「—」なら 未測定★）
 *   ③ ★同じ 計算★ … 打ち終えて 労働保険を 開き直した 時の 精算の 字 ＝ 打った 直後の 字
 *   ④ ★倉庫に 書かない★ … pay_ の 棚への GET 以外は ★網で 止める★（★止めた 本数を 出す・0本なら 網が 効いていない＝未測定★）
 *
 * ★わざと 壊す 回（--waza）★ … 配る 時だけ 受け手に ★renderChoView() を 戻す★ ⇒ ①が 赤に なる事を 見る
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const { kagiAru, hairu, shizumaru } = await import('../../tests/_hairu.mjs');
if (!(await kagiAru(ROOT))) {
  console.log('🟡 ★未測定★ ★本番の repo では 測りません★（試験用の 口が 居ません）');
  process.exit(0);
}
const { borrow, launch } = await import('../../scripts/_borrow-playwright.mjs');
const wk = await borrow('gaisan-ran-ui', 'webkit');
if (!wk) { console.log('🟡 ★未測定★ playwright を 借りられない（0件＝合格 とは 書かない）'); process.exit(2); }

const WAZA = process.argv.indexOf('--waza') >= 0;
const MON_MAE = 'var s=state._roudouSum; if(s){ s.seisan=roudouSeisan(s.gokeiRyo);';
const MON_ATO = 'renderChoView(); ' + MON_MAE;
let mongae = 0;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const srv = http.createServer((rq, rs) => {
  const u = decodeURIComponent(rq.url.split('?')[0]);
  let p = path.join(ROOT, u);
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { rs.writeHead(404); rs.end('x'); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  if (WAZA && u.indexOf('/kyuyo/js/app.js') === 0) {
    const src = fs.readFileSync(p, 'utf8');
    mongae = src.split(MON_MAE).length - 1;
    rs.end(src.split(MON_MAE).join(MON_ATO));
    return;
  }
  rs.end(fs.readFileSync(p));
});
await new Promise((r) => srv.listen(0, r));
const URL = 'http://localhost:' + srv.address().port + '/kyuyo/index.html';
const b = await launch('gaisan-ran-ui', wk);

let pass = 0, fail = 0, mi = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };
const MI = (n, m) => { mi++; console.log('  🟡 ★はかれない★ ' + n + (m ? ' … ' + m : '')); };
const RAN = '[data-zennendo-gaisan]';
const JI = '#roudou-seisan';
const matsu = (ms) => new Promise((r) => setTimeout(r, ms));
async function osu(pg, s) {
  for (let i = 0; i < 30; i++) {
    if (await pg.click(s, { timeout: 1000 }).then(() => true).catch(() => false)) { await matsu(800); return true; }
    await matsu(300);
  }
  return false;
}
async function roudouMade(pg) {
  for (const s of ['.bn[data-scr="scr-list"]', '.seg-b[data-view="cho"]', '[data-cho="roudou"]']) {
    if (!(await osu(pg, s))) return '押せない ' + s;
  }
  for (let i = 0; i < 40; i++) { if (await pg.$(RAN)) return ''; await matsu(250); }
  return '概算の 欄が 出ない';
}
const miru = (pg) => pg.evaluate(([R, J]) => {
  const e = document.querySelector(R), j = document.querySelector(J);
  return { v: e ? e.value : null, f: !!e && document.activeElement === e, act: (document.activeElement || {}).tagName, ji: j ? j.textContent : null };
}, [RAN, JI]);

console.log('\n[gaisan-ran-ui] 概算の 欄に 続けて 打てるか（実ブラウザ）' + (WAZA ? '  ★★わざと renderChoView() を 戻した 回★★' : ''));
let tometa = 0;
try {
  const cx = await b.newContext();
  const pg = await cx.newPage();
  await pg.route('**/rest/v1/pay_**', (rt) => {
    const m = rt.request().method();
    if (m === 'GET' || m === 'HEAD') return rt.continue();
    tometa++; return rt.abort();
  });
  const hai = await hairu(pg, URL, '.bn[data-scr]');
  if (!hai.haitta) { MI('アプリに 入れない', hai.naze || ('試した ' + hai.kai + '回')); throw new Error('skip'); }
  if (WAZA) T('★わざ 差し替えが 効いた（' + mongae + 'か所）★', mongae === 1, '★外したつもり★');
  await shizumaru(pg, 1500, 15000);
  const naze = await roudouMade(pg);
  if (naze) { MI('労働保険の 欄まで 行けない', naze); throw new Error('skip'); }

  /* ★精算の 字を 出す 支度★ … 確定保険料が 無いと 精算は「—」のまま（★②が 測れない★）。
     ★労災の 業種を 一覧から 1つ 選ぶ★（★倉庫への 書きは 網で 止めている＝この 窓の 中だけ★）。
     ★「一覧に無い(__te__)」は 選ばない★＝率が 空に 戻る 道 */
  const gyoshu = await pg.$eval('[data-rousai-shurui]', (s) => {
    const o = Array.from(s.options).find((x) => x.value && x.value !== '__te__');
    return o ? o.value : '';
  }).catch(() => '');
  if (gyoshu) {
    await pg.selectOption('[data-rousai-shurui]', gyoshu);
    for (let i = 0; i < 40; i++) { await matsu(250); if (await pg.$(RAN)) break; }
    await matsu(800);
  }
  console.log('    ── 支度 … 労災の 業種「' + (gyoshu || '（選べない）') + '」を この 窓の 中だけ 選んだ');
  await pg.click(RAN);
  await pg.keyboard.press('Control+A');
  await pg.keyboard.press('Backspace');
  const tochu = [];
  for (const c of '123') { await pg.keyboard.type(c); await matsu(300); tochu.push(await miru(pg)); }
  const o = tochu[2];
  console.log('    ── 打つ たびの 値 … ' + tochu.map((x) => '「' + x.v + '」' + (x.f ? '' : '(焦点 ' + x.act + ')')).join(' → '));
  console.log('    ── 打つ たびの 精算の 字 … ' + tochu.map((x) => '「' + x.ji + '」').join(' → '));

  /* ── ① ─────────────── */
  if (WAZA) {
    T('★わざ① renderChoView() を 戻したら 崩れる（値「' + o.v + '」・焦点 ' + (o.f ? 'その欄' : o.act) + '）★',
      !(o.v === '123' && o.f), '★戻しても 崩れない＝①は 何を しても 緑★');
  } else {
    T('★① 3桁 打って 値が「123」 AND 焦点が その 欄（値「' + o.v + '」・焦点 ' + (o.f ? 'その欄' : o.act) + '）★',
      o.v === '123' && o.f, '★打っている 間に 欄が 作り直された★');
  }

  /* ── ② ─────────────── */
  if (WAZA) { /* ①が 赤なら ②③は 測る 意味が 無い */ }
  else if (tochu[1].ji == null || tochu[2].ji == null) MI('② 精算の 字', '#roudou-seisan が 無い');
  else if (tochu[1].ji === '—' && tochu[2].ji === '—') MI('② 精算の 字', '確定保険料が 出ていない＝「—」のまま（この 口の 率が そろっていない）');
  else T('★② 打っている 途中に 精算の 字が 打った 額で 変わる（「' + tochu[1].ji + '」→「' + tochu[2].ji + '」）★',
    tochu[1].ji !== tochu[2].ji, '★2文字目と 3文字目で 字が 同じ＝その場で 書き換わっていない★');

  /* ── ③ ─────────────── */
  if (!WAZA && o.ji != null && o.ji !== '—') {
    await pg.keyboard.press('Tab');
    await osu(pg, '[data-cho="shakai"]');
    if (!(await osu(pg, '[data-cho="roudou"]'))) MI('③ 開き直し', '労働保険を 押せない');
    else {
      let ato = null;
      for (let i = 0; i < 40; i++) { ato = await pg.$eval(JI, (e) => e.textContent).catch(() => null); if (ato) break; await matsu(250); }
      T('★③ 開き直した 時の 精算の 字（「' + ato + '」）＝ 打った 直後の 字（「' + o.ji + '」）★', ato === o.ji,
        '★打っている 時と 作り直した 時で 計算が 違う★');
    }
  }
  await cx.close();
} catch (e) {
  if (String(e && e.message) !== 'skip') MI('途中で 止まった', String(e && e.message || e).slice(0, 160));
} finally {
  await b.close().catch(() => null);
  srv.close();
}

/* ── ④ ─────────────── */
console.log('    ── ④ 網で 止めた 倉庫への 書き … ' + tometa + '本');
if (tometa === 0) MI('④ 倉庫に 書いていない 証し', '止めた 本数が 0＝網が 効いていない');
else { pass++; console.log('  ✓ ★④ 倉庫への 書きは 全部 網で 止めた（' + tometa + '本・倉庫は 動かない）★'); }

if (WAZA) console.log('\n★わざと renderChoView() を 戻した 回の 読み方★ … ★①が 赤に なれば 門は 効いている★');
console.log('\n' + pass + ' passed, ' + fail + ' failed' + (mi ? ', ' + mi + ' ★はかれない★' : ''));
process.exit(fail ? 1 : (mi ? 2 : 0));
