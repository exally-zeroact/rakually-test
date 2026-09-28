/* kakutei-fuda.test.mjs — ★「今月を確定」で ★2つの 札の どちらが 残るか★ を 押して 測る★
 * =============================================================================
 * ★なぜ 要るか（2026-09-28 指示役1）★
 *   `app.js:5741`「今月を確定」は こう 並んで います。
 *       `try{ saveMonthlyPayslips(true); }catch(_){}`   ← ★中は 約束＝try/catch を 通り抜ける★
 *       `publishMeisaiNow(…).then(→ toast('今月を確定しました（従業員のWeb明細に公開）'))`
 *   ⇒ ★保存が 落ちても ★紙は 画面の 値から 作る ので 成功する★★
 *   ⇒ ★だから ★2つの 札★が 出ます★
 *       ★緑★「今月を確定しました（従業員のWeb明細に公開）」
 *       ★赤★「N名分を保存できませんでした（台帳・年末調整に入っていません）」
 *
 * ★★私が 最初『2枚 同時に 出る』と 書いたのは ★間違い★でした★★
 *   `app.js:2163 toast()` は ★`#app-toast` ★1枚★に `textContent` を 上書き★ します。
 *   ⇒ ★★＝後から 出た 方が ★前の 札を 黙って 消します★★★
 *   ⇒ ★★＝どちらが 残るかは ★通信の 速さ次第＝運★★★
 *   ★時刻★
 *     `saveFailed()`（`:2169`）… ★最初の 失敗から ★400ms 後★ に 1回だけ★
 *     成功の 札 ……………… ★`publishMeisai` が 返った 時★（本番の 実測 ★200〜600ms★）
 *   ⇒ ★★＝★公開が 遅い 時、赤が 緑に 消される★★★
 *
 * ★この 見張りが 見る 事★
 *   ★出た 札を ★全部 順に★ 控えて、★赤が 一度でも 出たか★ と ★最後に 残ったのは どちらか★ を 出す。
 *   ＝★『どちらかが 出た』では なく ★並びと 残り★ を 数える★
 * ★この 見張りが 見ない 事（先に 書く）★
 *   ・★読めるか（幅・色）★ … 本物の ブラウザの 仕事
 *   ・★何ms が 本当か★ … ★下の 数は 測って いません（40/500/900 は 決め打ち）★
 *     ＝★但し 3通り 並べる ので ★大小に 寄りません★★
 *
 * ★★空振り止め（★直す 前の 数を 残す★）★★
 *   ★直す 前（`855d0d0`）★ … ★1 passed, 2 failed★
 *     公開 40ms … 緑 548ms → 赤 1004ms（赤が 残る）
 *     公開 500ms … ★緑 982ms のみ＝赤が 1枚も 出ない★
 *     公開 900ms … 赤 958ms → ★緑 1356ms が 赤を 消した★
 *   ★直した 後★ … ★4通り 緑★／3通り とも ★1枚の 札★に
 *     「今月を確定しました（従業員のWeb明細に公開）。★但し 2名分は 台帳・年末調整に 入って いません★…」
 *   ⇒ ★★＝『直す 前は 赤／直したら 緑』が ★両方 出て います★★★
 *
 * 使い方: node kyuyo/tests/kakutei-fuda.test.mjs
 *         node kyuyo/tests/kakutei-fuda.test.mjs --self-test
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const require_ = createRequire(pathToFileURL(path.join(ROOT, 'package.json')));
let JSDOM;
try { ({ JSDOM } = require_('jsdom')); }
catch { console.log('★jsdom が要ります（npm install）。飛ばせません（SKIPを緑と呼ばない）。'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const T = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };

/* ★判じ（★字を 渡して 判じる＝自己確認で わざと 壊せる 形★）★ */
/* ★★『落ちた 事を 言って いるか』で 見る＝★言い回しで 見ない★★
   2026-09-28 … 直す 前は 別の 札（「N名分を保存できませんでした」）だった。
   直した 後は ★1枚の 文の 中★（「但し N名分は 台帳・年末調整に 入って いません」）。
   ⇒ ★★字を 1つに 決め打ちすると ★直した 日に 門が 黙ります★★＝★両方 見る★ */
export const AKA = /名分を保存できませんでした|名分は 台帳・年末調整に 入って いません/;
export const MIDORI = /今月を確定しました/;
export function shiraberu(fudaList) {
  const aka = fudaList.filter((x) => AKA.test(x.ji));
  const midori = fudaList.filter((x) => MIDORI.test(x.ji));
  const owari = fudaList.length ? fudaList[fudaList.length - 1] : null;
  return {
    kazu: fudaList.length,
    akaDeta: aka.length > 0,
    midoriDeta: midori.length > 0,
    akaGaNokotta: !!(owari && AKA.test(owari.ji)),
    /* ★赤が 出た のに 最後に 残って いない＝★消された★★ */
    akaGaKesareta: aka.length > 0 && !!(owari && !AKA.test(owari.ji)),
    owariJi: owari ? owari.ji : '（1枚も 出ていません）',
  };
}

if (process.argv.includes('--self-test')) {
  console.log('\n[kakutei-fuda --self-test] ★わざと 並べ替えて 判じが 変わるか★');
  const A = { ji: '2名分を保存できませんでした（台帳・年末調整に入っていません）。もう一度 確定してください。', t: 500 };
  const M = { ji: '今月を確定しました（従業員のWeb明細に公開）', t: 900 };
  const say = (n, v) => { if (!v) { fail++; console.log('  ✗ ' + n + '  ★思っていたのと 違う★'); } else { pass++; console.log('  ✓ ' + n); } };
  say('★赤 → 緑 なら「赤が 消された」★', shiraberu([A, M]).akaGaKesareta === true);
  say('★赤 → 緑 なら「赤が 残った」は 偽★', shiraberu([A, M]).akaGaNokotta === false);
  say('★緑 → 赤 なら「赤が 残った」★', shiraberu([M, A]).akaGaNokotta === true);
  say('★緑 → 赤 なら「消された」は 偽★', shiraberu([M, A]).akaGaKesareta === false);
  say('★赤だけ なら 残った★', shiraberu([A]).akaGaNokotta === true);
  say('★緑だけ なら 赤は 出て いない★', shiraberu([M]).akaDeta === false);
  say('★1枚も 無ければ どちらも 偽★', (() => { const r = shiraberu([]); return !r.akaDeta && !r.akaGaNokotta && !r.akaGaKesareta; })());
  say('★別の 字は どちらでも ない★', (() => { const r = shiraberu([{ ji: 'こんにちは', t: 1 }]); return !r.akaDeta && !r.midoriDeta; })());
  console.log(fail ? '\n★自己確認 ' + fail + '件 おかしい★' : '\n★8通り ぜんぶ 思った通り★');
  process.exit(fail ? 1 : 0);
}

/* ══════════ 本物の app.js を 押す ══════════ */
async function osu(pubMs, saveMs) {
  const file = path.join(ROOT, 'kyuyo/index.html');
  const html = fs.readFileSync(file, 'utf8');
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/kyuyo/index.html',
  });
  const win = dom.window, doc = win.document;
  win.fetch = () => Promise.reject(new Error('no net'));
  win.alert = () => {}; win.confirm = () => true; win.scrollTo = () => {}; win.print = () => {};
  for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
    const src = m[1].split('?')[0];
    const base = src.split('/').pop();
    if (/^https?:/.test(src) || ['supa-config.js', 'auth.js', 'env-badge.js', 'rakunally-login.js'].includes(base)) continue;
    const p = path.resolve(path.dirname(file), src);
    if (!fs.existsSync(p)) continue;
    const el = doc.createElement('script');
    el.textContent = fs.readFileSync(p, 'utf8');
    doc.body.appendChild(el);
  }
  await sleep(400);
  const A = win.__PAYSLIP_TEST;
  if (!A) throw new Error('app.js が 動いて いない');

  /* ★倉庫だけ 差し替える★（★保存は 落ちる／公開は 通る★＝本番で 起きる 形） */
  win.Store = {
    savePayslip: () => new Promise((_r, j) => setTimeout(() => j(new Error('Load request cancelled')), saveMs)),
    publishMeisai: () => new Promise((r) => setTimeout(() => r(), pubMs)),
    listMeisaiPub: () => Promise.resolve([]),
  };

  /* ★出た 札を ★全部 順に★ 控える★（`#app-toast` は 1枚を 上書きする） */
  const fuda = [];
  const t0 = Date.now();
  let mae = '';
  const mihari = setInterval(() => {
    const t = doc.getElementById('app-toast');
    const ji = (t && t.textContent) || '';
    if (ji && ji !== mae) { fuda.push({ ji: ji, t: Date.now() - t0 }); mae = ji; }
  }, 5);

  const e1 = A.defEmp('山田 太郎'), e2 = A.defEmp('鈴木 花子');
  for (const e of [e1, e2]) {
    e.payType = '月給'; e.base = '260000'; if (e.shikyu && e.shikyu[0]) e.shikyu[0].value = '260000'; e.pref = 'ehime';
  }
  A.state.company = A.defCompany(); A.state.company.pref = 'ehime';
  A.state.month = '2026-08'; A.state.employees = [e1, e2];
  if (A.renderInput) A.renderInput();
  await sleep(200);

  /* ★★字で 探すな＝★印（data-confirm-month）で 名指しする★★
     2026-09-28 に 私は `/今月を確定/` で 探して ★誘導の 行（`当月を入力して確認…「今月を確定」`）★を
     押して いました ⇒ ★確定の 道を 1回も 通らずに 3通り 緑★＝★偽の 緑★。
     ⇒ ★`app.js:5734` が 見るのと ★同じ 印★ で 取る／★無ければ 止める（未測定を 緑に しない）★ */
  const b1 = doc.querySelector('[data-confirm-month]');
  if (!b1) throw new Error('★確定ボタン([data-confirm-month])が 画面に 無い＝★測れて いません★');
  if (b1.disabled) throw new Error('★確定ボタンが 押せない（disabled）＝★測れて いません★：'
    + (b1.textContent || '').trim());
  const oshita = (b1.textContent || '').trim();
  b1.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await sleep(200);
  const y = [...doc.querySelectorAll('button')].filter((x) => /^(はい|OK|確定)/.test((x.textContent || '').trim()))[0];
  if (y) y.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await sleep(Math.max(pubMs, saveMs) + 1400);
  clearInterval(mihari);
  dom.window.close();
  return { fuda: fuda, oshita: oshita };
}

console.log('\n[kakutei-fuda] ★「今月を確定」で 保存が 落ちた 時 ★どの 札が 残るか★★');
console.log('★押す物（先に 書く）★ … 本物の「今月を確定」を 押す／★倉庫だけ 差し替え（保存は 落ちる・公開は 通る）★');
console.log('★数は 測って いません★ … 公開 40/500/900ms は 決め打ち（★3通り 並べる ので 大小に 寄りません★）');

const kekka = [];
for (const pubMs of [40, 500, 900]) {
  const r = await osu(pubMs, 100);
  const s = shiraberu(r.fuda);
  kekka.push({ pubMs: pubMs, s: s, fuda: r.fuda, oshita: r.oshita });
  console.log('\n  ★公開が ' + pubMs + 'ms の 時★（押した物：' + (r.oshita || '★ボタンが 出ない（未測定）★') + '）');
  r.fuda.forEach((x) => console.log('     ' + String(x.t).padStart(5) + 'ms  「' + x.ji + '」'));
  console.log('     ⇒ 赤が 出た ' + (s.akaDeta ? '★はい★' : 'いいえ') + '／緑が 出た ' + (s.midoriDeta ? '★はい★' : 'いいえ')
    + '／★最後に 残った＝' + (s.akaGaNokotta ? '赤' : (s.midoriDeta ? '緑' : '無し')) + '★');
}

console.log('');
T('★保存が 落ちたら ★赤の 札は 必ず 一度は 出る★', () => {
  const dame = kekka.filter((k) => !k.s.akaDeta).map((k) => k.pubMs + 'ms');
  ok(dame.length === 0, '★出なかった 回 … ' + dame.join(',') + '（★客は 台帳に 入って いない事を 知れません★）');
});
T('★★保存が 落ちたら ★赤の 札が 最後に 残る★（緑で 消されない）★★', () => {
  const kesareta = kekka.filter((k) => k.s.akaGaKesareta).map((k) => k.pubMs + 'ms');
  ok(kesareta.length === 0, '★★緑が 赤を 消した 回 … ' + kesareta.join(',') + '★★'
    + '（`#app-toast` は 1枚＝★後の 札が 前を 上書きする★／★客は「確定しました」だけ 見ます★）');
});
T('★★落ちた 時 札は ★1枚★ に まとまって いる（2枚 争わない）★★', () => {
  const futatsu = kekka.filter((k) => k.s.kazu > 1).map((k) => k.pubMs + 'ms(' + k.s.kazu + '枚)');
  ok(futatsu.length === 0, '★2枚 出た 回 … ' + futatsu.join(',')
    + '（`#app-toast` は 1枚＝★後の 札が 前を 消す／どちらが 残るかは 運★）');
});
T('★札は 1枚も 出ない では ない（空振りしていない）', () => {
  ok(kekka.every((k) => k.s.kazu > 0), '★1枚も 出ていない 回が 在る＝★この 見張りは 何も 見て いません★');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
