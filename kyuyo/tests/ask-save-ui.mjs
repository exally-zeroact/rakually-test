/* ask-save-ui.mjs — ★司さんの HARD 要件「1問ごとに保存」(2026-08-16) を ★振る舞い★で守る門★（実ブラウザ・WebKit）
 * ============================================================================
 * ★守る 司さんの 言葉★ … 「聞いてあげる。埋めさせない。★1問ごとに保存★（途中で閉じても残る）」
 *   ⇒ この門が 守る＝★会社の設定を 1問 答えると、答えた値が 倉庫への 書きの 本文に 載る★（閉じる前に）。
 *
 * ★なぜ 振る舞いの門か（2026-10-03・指示役と）★
 *   前は company-ask.test / emp-ask.test が ★app.js の字に persistSave が在るか★を 静的に 見ていた。
 *   でも その呼び（askSave 内 `if(window.persistSaveDebounced)…`）は ★runtime 死★（window.persistSave* は
 *   IIFE の中＝代入0）。実際に 1問ごと保存を 満たしているのは ★6745（document capture の input/change/click）★。
 *   ＝字の門は 飾り（6745 を 誰かが 変えた日に 要件は 黙って 崩れ・門は 緑のまま）。so 門を 振る舞いに 替えた。
 *   （memory: feedback_kazari_no_ji_ni_tayotta_mon_wa_wareru）
 *
 * ★見る 事★ … 設定画面で 会社の欄（#c-payday-day＝振込指定日）に ★一意な値★を 打つ →
 *   倉庫への 書き（pay_companies・網で 偽200・update には 1行 返す＝⑦安全）の ★本文に その値が 在る★。
 *   #c-payday-day の 欄ごとの handler は 死んだ守り（if(window.persistSaveDebounced)）＝★保存するのは 6745 だけ★。
 *
 * ★空振り止め（--waza）★ … サーバで app.js の 6745（1行）を 外して 配る ⇒ 打っても 保存されない ⇒
 *   「答えた値が 本文に 在る」が ★偽★に なる＝門が 6745 を 守っている 証し。--waza の 時は それを 緑と 読む。
 *
 * 使い方: node kyuyo/tests/ask-save-ui.mjs          （本物＝値が本文に載る）
 *         node kyuyo/tests/ask-save-ui.mjs --waza    （6745を外す＝載らない＝門が効く証し）
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
const wk = await borrow('ask-save-ui', 'webkit');
if (!wk) { console.log('🟡 ★未測定★ playwright を 借りられない（0件＝合格 とは 書かない）'); process.exit(2); }

const WAZA = process.argv.indexOf('--waza') >= 0;
/* ★6745（1行）を 外す 置換★（--waza の時だけ・サーバで app.js を 配る時に） */
const S6745_MAE = 'document.addEventListener(ev, persistSaveDebounced, true);';
const S6745_ATO = 'void ev;';
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
    mongae = src.split(S6745_MAE).length - 1;
    rs.end(src.split(S6745_MAE).join(S6745_ATO));
    return;
  }
  rs.end(fs.readFileSync(p));
});
await new Promise((r) => srv.listen(0, r));
const URL = 'http://localhost:' + srv.address().port + '/kyuyo/index.html';
const b = await launch('ask-save-ui', wk);

let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };

console.log('\n[ask-save-ui] 1問ごとに保存（会社の設定を1問答えると 倉庫の書きの本文に 載る）' + (WAZA ? '  ★★6745を外した回★★' : ''));

const cx = await b.newContext();
const pg = await cx.newPage();
/* ★倉庫への 書きを 網で 止めて ★送った本文★を 捕まえる★（★abort★＝hozon-fuda-ui と同じ）
   ★なぜ 偽200 で なく abort か（2026-10-03・指示役が割った）★
     偽200で「書けた」と返すと、倉庫は 1ミリも 進まないのに store.js は 返りの updated_at（＝試験の now）を
     控えに する（lastCompanyUpdatedAt = _ua || now）。次の SELECT で ★倉庫(最後の本物の書きの時刻) ≠ 控え(試験のnow)★
     → 自分送りの名簿にも 偽値しか 無い → ★conflict の覆い★が 出て クリックを 塞ぐ（22分差＝偽書きと本物書きの差・
     時計ずれでない・GitHub run 0本と 合致）。abort なら 控えは 動かず 覆いも 出ない（帯は 出るが クリックは 塞がない）。
   ★判じは 送った本文で★＝abort の 前に postData を 読む（＝アプリが 答えた値を 倉庫へ 送ろうとしたか）。 */
const kaki = [];   /* { tbl, hou, body } */
await pg.route('**/rest/v1/pay_**', (rt) => {
  const m = rt.request().method();
  if (m === 'GET' || m === 'HEAD') return rt.continue();
  const u = rt.request().url();
  const tbl = (u.match(/\/rest\/v1\/([^/?]+)/) || [])[1] || '';
  let body = '';
  try { body = rt.request().postData() || ''; } catch (e) { body = ''; }
  kaki.push({ tbl, hou: m, body });
  return rt.abort();
});

const hai = await hairu(pg, URL, '.bn[data-scr]');
let shippai = 0, miso = 0;   /* miso＝真の未測定（KEKKA の mimiso・②の問いが出ない回）*/
if (!hai.haitta) { console.log('🟡 ★未測定★ ログインできない（' + (hai.naze || hai.kai + '回試') + '）'); await b.close().catch(() => {}); srv.close(); process.exit(2); }
await shizumaru(pg, 1500, 20000);

try {
  /* 設定画面へ */
  let settledOk = false;
  for (let i = 0; i < 30; i++) {
    if (await pg.click('.bn[data-scr="scr-settings"]', { timeout: 1000 }).then(() => true).catch(() => false)) { settledOk = true; break; }
    await new Promise((r) => setTimeout(r, 300));
  }
  T('設定画面へ行けた', settledOk);
  await shizumaru(pg, 1500, 20000);
  /* ★覆いを 閉じてから 打つ★（案内の覆いは閉じる／conflict は閉じない）＝共有口の外部書きで
     conflict が出た回は ★未測定★（この門の失敗ではない・他の実ブラウザ試験と同じ扱い） */
  await toziru(pg);
  const mi = await ooiWoMiru(pg);
  if (mi.conflict) {
    console.log('🟡 ★未測定★ 共有口 test@test.com に 外部の書きが入り conflict の覆いが出た（この門の失敗ではない・手元10分/concurrencyで避ける）／箱「' + (mi.ji || '').slice(0, 40) + '」');
    await pg.close().catch(() => {}); await cx.close().catch(() => {}); await b.close().catch(() => {}); srv.close();
    process.exit(2);
  }
  const RAN = '#c-payday-day';
  const aru = await pg.$(RAN);
  T('会社の欄（' + RAN + '）が在る', !!aru);
  if (!aru) throw new Error('ran-nai');

  /* ★有効な値を 1問 答える（打つ）★＝振込指定日は 1〜31。今と違う 有効な日に 変える（変わらないと 保存が出ない）。 */
  const ima = (await pg.$eval(RAN, (el) => el.value).catch(() => '')) || '';
  const ATAI = (ima === '27') ? '23' : '27';   /* 今と違う 有効な日（27/23・他欄と被りにくい） */
  kaki.length = 0;   /* 打つ前の 書きは 数えない */
  await pg.click(RAN);
  await pg.keyboard.press('Control+A');
  await pg.keyboard.press('Backspace');
  await pg.keyboard.type(ATAI, { delay: 40 });
  await pg.keyboard.press('Tab');
  /* 書きが 出るまで 待つ（6745 は 500ms デバウンス・倉庫の線は 時に遅い＝上限 40秒） */
  for (let i = 0; i < 160; i++) { if (kaki.some((k) => k.tbl === 'pay_companies')) break; await new Promise((r) => setTimeout(r, 250)); }
  await new Promise((r) => setTimeout(r, 1500));

  const coWrites = kaki.filter((k) => k.tbl === 'pay_companies');
  const atta = coWrites.some((k) => k.body.indexOf(ATAI) >= 0);
  console.log('     今=' + ima + ' → 打った値=' + ATAI + ' ／ 全書き ' + kaki.length + '本（' + kaki.map((k) => k.hou + ' ' + k.tbl).join('／') + '）');
  console.log('     pay_companies の書き ' + coWrites.length + '本 ／ 本文に値が載った=' + atta
    + (coWrites[0] ? ' ／ 本文先頭=' + coWrites[0].body.slice(0, 120) : ''));

  if (!WAZA) {
    T('★① 会社の欄(#c-payday-day)に答えると 値が pay_companies の本文に載る（6745の全体の守り）★', atta,
      'pay_companies書き ' + coWrites.length + '本・どれも本文に値なし');
  } else {
    T('★わざ置換が効いた（6745を1か所外した）★', mongae === 1, '外せた箇所=' + mongae);
    T('★① --waza: 6745を外すと 値が 書きに載らない★', !atta, '6745を外したのに 値が載った');
  }

  /* ═══ ★② #ask-host の問い（askSave道・司さん要件「1問ごとに保存」が指す所）★ ═══
     ①は 会社の設定の欄（6745の全体）。②は ★聞く形の問い（data-ask-yn=社保加入）★＝答えのボタンの click で
     state.company を変える道（app.js 5358〜）。問いの答えが 倉庫の書きの本文（state.company の鍵）に 載るかを 見る。 */
  await toziru(pg);
  const closeSel = '#ask-host select[data-ask="close"]';   /* 1問目＝締め日（答えるまで 常に 出る） */
  const hasClose = await pg.$(closeSel);
  if (!hasClose) {
    miso++; console.log('     🟡 ② #ask-host の 締め日(close)の 問いが 出ていない＝②は 未測定（①で 6745 は 守れている）');
  } else {
    const opt = await pg.$eval(closeSel, (el) => ({ cur: el.value, vals: Array.prototype.map.call(el.options, (o) => o.value) }));
    const pick = opt.vals.find((v) => v && v !== 'other' && v !== opt.cur) || opt.vals.find((v) => v && v !== 'other') || '';
    kaki.length = 0;
    await pg.selectOption(closeSel, pick);   /* 選ぶ＝change＝askSave道＋6745(change capture) */
    for (let i = 0; i < 160; i++) { if (kaki.some((k) => k.tbl === 'pay_companies')) break; await new Promise((r) => setTimeout(r, 250)); }
    await new Promise((r) => setTimeout(r, 1500));
    const co2 = kaki.filter((k) => k.tbl === 'pay_companies');
    const atta2 = co2.some((k) => k.body.indexOf('"close":"' + pick + '"') >= 0);
    console.log('     ② 締め日(close)=' + pick + ' を選んだ ／ pay_companies書き ' + co2.length + '本 ／ 本文に close=' + pick + ' が載った=' + atta2);
    if (!WAZA) {
      T('★② #ask-host の問い(締め日)に答えると 答えが pay_companies の本文に載る（close=' + pick + '・askSave道・司さん要件1問ごと保存）★', atta2,
        'pay_companies書き ' + co2.length + '本・本文に答えなし');
    } else {
      T('★② --waza: 6745を外すと 問いの答え(close)も 書きに載らない★', !atta2, '6745外したのに載った');
    }
  }
} catch (e) {
  if (String((e && e.message) || e) !== 'ran-nai') { console.log('  ✗ 途中で転んだ … ' + ((e && e.message) || e)); shippai++; }
  else shippai++;
} finally {
  await pg.close().catch(() => {});
  await cx.close().catch(() => {});
  await b.close().catch(() => {});
  srv.close();
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('KEKKA {"passed":' + pass + ',"failed":' + (fail + shippai) + ',"mimiso":' + miso + '}');   /* ★約束の行（_bunrui用）★mimiso＝②の問いが出なかった回 */
process.exit((fail + shippai) ? 1 : 0);
