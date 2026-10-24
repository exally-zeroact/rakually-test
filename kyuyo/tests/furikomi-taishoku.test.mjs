/* furikomi-taishoku.test.mjs — ★退職・削除の 人を 振込から 黙って 落とさない・黙って 払わない★（jsdom・ブラウザ無し）
 * ============================================================================
 * ★守る事（2026-10-23 司さん「直さなダメ」）★ … 前は buildTransfers が 退職の 印（retired）で 人を 外していたので、
 *   ①払う日より 前に「退職にする」を 押す ②削除した 人を 払う日の 後に 作り直す（遅れ・銀行から 返された）
 *   ③退職月の 人を 確定せずに 振込を 作る と、★その人の 給与が 振込（画面・全銀・Excel）から 黙って 落ちた★。
 * ★この門が 見る事★
 *   ・退職日が 在る 人＝在籍の 期間の 中なら 在籍の 人と 同じく 確定に 関係なく 入る
 *   ・「退職にする」だけ（退職日 無し）＝その月を 確定した 時だけ・押した 月まで 入る
 *   ・在籍の 期間の 外の 確定＝入らない（見えない 確定で 満額を 出さない）
 *   ・「退職にする」の 月の 後なのに 退職日が 先＝決められない＝名指しで 止めて 振込ファイルを 作らない
 *   ・賞与＝退職日の 在る 人は 支給日に 在籍して いれば 入れる／支給日より 前に 辞めた 人・日付が 読めない 人に 金額が 入っていたら 名指しで 止める（司さんの 決め 2026-10-23 案3）／「退職にする」だけの 人は 賞与から 外す
 *   ・削除した 人は「退職にする」の 古い 月を 見ない（作り直しの 振込を 止めない）
 *   ・止めの 字は 本当に 外れる 直し方だけ（「復帰させる」→「退職にする」・空に すると 届からも 外れる）
 *   倉庫も 共有口も 触らない＝決定的。
 * ★空振り止め（--waza）★ … app.js の「退職の 扱いを 判じる」1行を 外して 配る ⇒ 前の「退職は 外す」に 戻り、退職の 人が 消える。
 * 使い方: node kyuyo/tests/furikomi-taishoku.test.mjs   ／   --waza
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(pathToFileURL(path.join(ROOT, 'package.json')));
let JSDOM;
try { ({ JSDOM } = require_('jsdom')); }
catch { console.log('★jsdom が要ります（npm install）。飛ばせません（SKIPを緑と呼ばない）。'); process.exit(1); }
const WAZA = process.argv.includes('--waza');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const KESU_MAE = "      var tk=taishokuKubun(e,ym,bonus); if(tk==='ireru') return true; if(tk) return false;\n";   /* ★退職の 扱いを 判じる 1行（--waza で 外す）★ */
let kesita = 0;

const file = path.join(ROOT, 'kyuyo/index.html');
const html = fs.readFileSync(file, 'utf8');
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/kyuyo/index.html' });
const win = dom.window, doc = win.document;
win.fetch = () => Promise.reject(new Error('no net')); win.alert = () => {}; win.confirm = () => true; win.scrollTo = () => {}; win.print = () => {};
for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
  const src = m[1].split('?')[0]; const base = src.split('/').pop();
  if (/^https?:/.test(src) || ['supa-config.js', 'auth.js', 'env-badge.js', 'rakunally-login.js'].includes(base)) continue;
  const p = path.resolve(path.dirname(file), src); if (!fs.existsSync(p)) continue;
  let code = fs.readFileSync(p, 'utf8');
  if (base === 'app.js') {
    kesita = code.split(KESU_MAE).length - 1;
    if (WAZA) code = code.split(KESU_MAE).join('');
  }
  const el = doc.createElement('script'); el.textContent = code; doc.body.appendChild(el);
}
await sleep(400);

let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };

const A = win.__PAYSLIP_TEST;
if (!A || !A.buildTransfers || !A.defEmp || !A.state || !A.taishokuTomeruHito || !A.furiKeisanOchiKaku) { console.log('✗ ★app.js から buildTransfers／defEmp／state／taishokuTomeruHito／furiKeisanOchiKaku が 取れない★'); process.exit(1); }

console.log('\n[furikomi-taishoku] 退職・削除の 人を 振込から 黙って 落とさない・黙って 払わない' + (WAZA ? '  ★★判じる 1行を 外した回★★' : ''));
T('★退職の 扱いを 判じる 1行が app.js に ちょうど 1か所 在る★', kesita === 1, '在った 数=' + kesita);

/* 作り物の 人（口座あり・月給）。名前は 作り物だけ */
const mk = (id, extra) => Object.assign(A.defEmp(), { id: id, name: '試し ' + id,
  base: '300000', pref: 'ehime', furiBankNo: '0001', furiBranchNo: '001', furiAccount: '1234567', furiKana: 'ﾀﾒｼ' }, extra || {});
const ids = (tr) => tr.map((t) => t.emp.id).sort().join(',');
const tomeru = (mode) => A.taishokuTomeruHito(mode).map((e) => e.id).sort().join(',');
let saigoJi = '';
const dasuKa = (mode) => {
  let d = false; A.furiKeisanOchiKaku(mode, () => { d = true; });
  saigoJi = [...doc.querySelectorAll('.ui-modal-ov')].map((o) => o.textContent).join(' ');
  for (const ov of [...doc.querySelectorAll('.ui-modal-ov')]) ov.remove();   /* 止めの 箱を 閉じる */
  return d;
};
A.state.company = A.defCompany ? A.defCompany() : (A.state.company || {});

/* ── ① 2026-07＝退職の 月 ── */
A.state.month = '2026-07';
A.state.employees = [
  mk('ZAISEKI'),                                                            // 在籍・確定あり
  mk('BTN', { retired: true, retiredYmd: '2026-07' }),                      // 「退職にする」だけ（退職日 無し）・確定あり
  mk('BTN_NOCONF', { retired: true, retiredYmd: '2026-07' }),               // 「退職にする」だけ・確定 無し
  mk('TAI', { retired: true, taishokuYmd: '2026-07-31' }),                  // 退職日あり・確定あり
  mk('KESITA', { retired: true, taishokuYmd: '2026-07-31', kesita: '2026-08-30' }),  // 削除した 人・確定あり
  mk('TAI_NOCONF', { retired: true, taishokuYmd: '2026-07-31' }),           // 退職日あり・確定 無し
];
A.state.confirmed = { '2026-07': { ZAISEKI: true, BTN: true, TAI: true, KESITA: true } };
const tr7 = A.buildTransfers('monthly');
const ari = (id) => tr7.find((t) => t.emp.id === id);
T('在籍で 確定した 人は 振込に 居る・金額 > 0（試しの 人に 給与が 入っている＝金額の 確かめが 空振りしない）', !!ari('ZAISEKI') && ari('ZAISEKI').amount > 0, '一覧 ' + ids(tr7));
if (!WAZA) {
  for (const id of ['BTN', 'TAI', 'KESITA', 'TAI_NOCONF']) {
    const t = ari(id);
    T('★' + id + ' が 振込に 居る・金額 > 0・ready★', !!t && t.amount > 0 && t.ready === true,
      t ? JSON.stringify({ amount: t.amount, ready: t.ready, ko: t.keisanOchi }) : '居ない（一覧 ' + ids(tr7) + '）');
  }
} else {
  T('★--waza: 判じる 1行を 外すと 退職の 人が 振込から 消える（門が 1行を 守る 証し）★',
    !ari('BTN') && !ari('TAI') && !ari('KESITA') && !ari('TAI_NOCONF'), '一覧 ' + ids(tr7));
}
T('★「退職にする」だけで 確定していない 人は 入らない（確認の 字＝給与計算の 対象から 外れる）★', !ari('BTN_NOCONF'), '一覧 ' + ids(tr7));
T('止める 人は 居ない（月次）', tomeru('monthly') === '', tomeru('monthly'));
T('止める 人が 居ない 時は 振込ファイルを 作る', dasuKa('monthly') === true);

/* 確定を 取り消しても 退職日の 在る 人は 入る（在籍の 人と 同じ） */
delete A.state.confirmed['2026-07'].TAI;
if (!WAZA) T('★確定を 取り消しても 退職日の 在る 人は 入る（在籍の 人と 同じ）★', A.buildTransfers('monthly').some((t) => t.emp.id === 'TAI'));
A.state.confirmed['2026-07'].TAI = true;

/* ── ② 退職の 後の 月＝入らない ── */
A.state.month = '2026-08';
const tr8 = A.buildTransfers('monthly');
T('★退職の 後の 月は 退職の 人が 入らない★', !tr8.some((t) => ['BTN', 'BTN_NOCONF', 'TAI', 'KESITA', 'TAI_NOCONF'].includes(t.emp.id)), '一覧 ' + ids(tr8));

/* ── ③ 在籍の 期間の 外の 確定は 入らない（taiketsu 10-23＝見えない 確定で 満額が 出た） ── */
A.state.month = '2026-11';
A.state.employees = [
  mk('ZAI11'),
  mk('P1', { retired: true, taishokuYmd: '2026-10-15' }),   // 11月を 確定した 後に 退職日を 前の 月へ
  mk('P1b', { taishokuYmd: '2026-10-15' }),                 // 同じ・退職の 印 無し
  mk('P2', { joinYmd: '2026-12-01' }),                      // 11月を 確定した 後に 入社日を 12月へ
  mk('P3', { retired: true, retiredYmd: '2026-10' }),       // ボタンで 10月に 退職・11月の 確定が 残る
];
A.state.confirmed = { '2026-11': { ZAI11: true, P1: true, P1b: true, P2: true, P3: true } };
const trS = A.buildTransfers('monthly');
for (const id of ['P1', 'P1b', 'P2', 'P3']) T('★' + id + '（期間の 外の 確定）は 入らない★', !trS.some((t) => t.emp.id === id), '一覧 ' + ids(trS));

/* ── ④ 「退職にする」の 月の 後なのに 退職日が 先＝どちらが 本当か 決められない＝名指しで 止める（taiketsu 10-23 A） ── */
for (const kakutei of [false, true]) {
  A.state.employees = [mk('ZAI11'), mk('MUJUN', { retired: true, retiredYmd: '2026-10', taishokuYmd: '2026-12-31' })];
  A.state.confirmed = { '2026-11': kakutei ? { ZAI11: true, MUJUN: true } : { ZAI11: true } };
  const trM = A.buildTransfers('monthly');
  const na = '（11月の 確定 ' + (kakutei ? 'あり' : '無し') + '）';
  T('★食い違う 人は 振込に 入らない' + na + '★', !trM.some((t) => t.emp.id === 'MUJUN'), '一覧 ' + ids(trM));
  if (!WAZA) {
    T('★食い違う 人は 名指しで 止める 側に 居る' + na + '★', tomeru('monthly') === 'MUJUN', tomeru('monthly'));
    T('★食い違う 人が 居ると 振込ファイルを 作らない' + na + '★', dasuKa('monthly') === false);
    T('★止めの 字が 本当に 外れる 直し方（「復帰させる」→「退職にする」）を 言う' + na + '★', /復帰させる/.test(saigoJi) && /退職にする/.test(saigoJi), saigoJi.slice(0, 120));
  }
}

/* ── ⑤ 賞与＝退職日の 在る 人は 支給日に 在籍して いれば 入れる／前に 辞めた 人は 名指しで 止める
       （司さんの 決め 2026-10-23 案3。前は「金額が 入っていれば 一律 止める（司さんに 訊く）」） ── */
A.state.month = '2026-07';
const goBonus = (payDay) => {
  A.state.employees = [mk('ZAISEKI'),
    mk('MAE', { retired: true, taishokuYmd: '2026-07-05' }),    /* 支給日 07-10 の 前に 辞めた */
    mk('TOU', { retired: true, taishokuYmd: '2026-07-10' }),    /* 支給日 当日に 辞めた＝在籍 */
    mk('ATO', { retired: true, taishokuYmd: '2026-07-31' }),    /* 支給日の 後に 辞めた＝在籍 */
    mk('TAI0', { retired: true, taishokuYmd: '2026-07-31' })];  /* 金額 無し */
  A.state.confirmed = { '2026-07': { ZAISEKI: true, MAE: true, TOU: true, ATO: true, TAI0: true } };
  A.state.bonus = { payYm: '2026-07', payDay: payDay, byEmp: { ZAISEKI: { amount: '100000' }, MAE: { amount: '100000' }, TOU: { amount: '100000' }, ATO: { amount: '100000' }, TAI0: { amount: '' } } };
  try { return A.buildTransfers('bonus'); } catch (e) { return e; }
};
let bo = goBonus('2026-07-10');
if (Array.isArray(bo)) {
  T('賞与の 振込に 在籍の 人が 居る（金額が 入っている＝空振りしない）', bo.some((t) => t.emp.id === 'ZAISEKI'), '一覧 ' + ids(bo));
  T('★賞与＝支給日より 前に 辞めた 人・金額の 無い 人は 振込に 入らない★', !bo.some((t) => ['MAE', 'TAI0'].includes(t.emp.id)), '一覧 ' + ids(bo));
  if (!WAZA) {
    T('★賞与＝支給日 当日・後に 辞めた 人は 在籍の 人と 同じく 振込に 入る（金額も 同じ）★',
      ['TOU', 'ATO'].every((id) => { const t = bo.find((x) => x.emp.id === id); const z = bo.find((x) => x.emp.id === 'ZAISEKI'); return t && z && t.amount === z.amount && t.amount > 0 && t.ready; }), '一覧 ' + ids(bo));
    T('★賞与＝支給日より 前に 辞めた 人だけ 名指しで 止める（当日・後・金額の 無い 人は 止めない）★', tomeru('bonus') === 'MAE', tomeru('bonus'));
    T('★賞与＝止める 人が 居ると 振込ファイルを 作らない★', dasuKa('bonus') === false);
    T('★賞与の 止めの 字が「支給日より 前に 退職」と「空に すると 賞与支払届からも 外れる」を 言う★', /支給日より 前に 退職/.test(saigoJi) && /賞与支払届/.test(saigoJi) && /空に/.test(saigoJi), saigoJi.slice(0, 160));
  }
} else T('賞与の 振込が 作れる', false, String(bo && bo.message));
/* 支給日が 年-月-日 で 読めない 時は 退職日の 在る 人は 全員 止める（黙って 払わない） */
bo = goBonus('10');
if (Array.isArray(bo)) {
  T('★賞与＝支給日が 読めない 時は 退職日の 在る 人を 振込に 入れない★', !bo.some((t) => ['MAE', 'TOU', 'ATO', 'TAI0'].includes(t.emp.id)), '一覧 ' + ids(bo));
  if (!WAZA) T('★賞与＝支給日が 読めない 時は 金額の 入った 退職の 人を 全員 名指しで 止める★', tomeru('bonus') === 'ATO,MAE,TOU', tomeru('bonus'));
} else T('賞与の 振込が 作れる（支給日 読めず）', false, String(bo && bo.message));
/* 「退職にする」を 押した 月が 支給月より 前なのに 退職日が 支給日 以後＝どちらが 本当か 決められない＝名指しで 止める
   （司さんの 決め 2026-10-24・月次と 同じ。前は 案3 で 支給日 以後＝払う に なっていた＝本番前 taiketsu S1） */
A.state.month = '2026-12';
A.state.employees = [mk('ZAISEKI'), mk('KUICHI', { retired: true, retiredYmd: '2026-10', taishokuYmd: '2026-12-31' })];
A.state.confirmed = {};
A.state.bonus = { payYm: '2026-12', payDay: '2026-12-10', byEmp: { ZAISEKI: { amount: '100000' }, KUICHI: { amount: '100000' } } };
bo = (() => { try { return A.buildTransfers('bonus'); } catch (e) { return e; } })();
if (Array.isArray(bo)) {
  T('★賞与＝「退職にする」の 月の 後なのに 退職日が 先の 人は 振込に 入れない★', !bo.some((t) => t.emp.id === 'KUICHI') && bo.some((t) => t.emp.id === 'ZAISEKI'), '一覧 ' + ids(bo));
  if (!WAZA) {
    T('★賞与＝その人は 名指しで 止める（月次と 同じ）★', tomeru('bonus') === 'KUICHI', tomeru('bonus'));
    T('★賞与＝その人が 居ると 振込ファイルを 作らない★', dasuKa('bonus') === false);
    T('★賞与の 止めの 字が「退職にする」の 月と 退職日の 食い違いを 言う★', /退職にする/.test(saigoJi) && /退職日/.test(saigoJi), saigoJi.slice(0, 200));
  }
} else T('賞与の 振込が 作れる（食い違う 人）', false, String(bo && bo.message));
/* 一度「退職にする」を 押して「復帰させる」で 戻した 人（retired なし・古い 押した 月が 残る）が 支給月に 辞める＝決め通り 支給日で 決める（止めない）
   （taiketsu 10-24 K1＝「復帰させる」は 押した 月を 消さない。月次も 印の 無い 人に 押した 月を 見ない） */
A.state.employees = [mk('ZAISEKI'), mk('FUKKI', { retired: false, retiredYmd: '2026-10', taishokuYmd: '2026-12-31' })];
A.state.bonus = { payYm: '2026-12', payDay: '2026-12-10', byEmp: { ZAISEKI: { amount: '100000' }, FUKKI: { amount: '100000' } } };
bo = (() => { try { return A.buildTransfers('bonus'); } catch (e) { return e; } })();
if (Array.isArray(bo)) {
  if (!WAZA) {
    T('★賞与＝「復帰させる」で 戻した 人が 支給日 以後に 辞める＝止めずに 振込に 入る★', bo.some((t) => t.emp.id === 'FUKKI') && tomeru('bonus') === '', '一覧 ' + ids(bo) + '／止める ' + tomeru('bonus'));
  }
} else T('賞与の 振込が 作れる（復帰した 人）', false, String(bo && bo.message));
/* 支給日が 支給月と 違う 月（夏の 支給日が 残ったまま 冬を 作る）＝読めても 違う 回の 日付＝止める（taiketsu 10-23 止め2） */
A.state.month = '2026-12';
A.state.employees = [mk('ZAISEKI'), mk('FUYU', { retired: true, taishokuYmd: '2026-12-05' })];
A.state.confirmed = {};
A.state.bonus = { payYm: '2026-12', payDay: '2026-07-10', byEmp: { ZAISEKI: { amount: '100000' }, FUYU: { amount: '100000' } } };
bo = (() => { try { return A.buildTransfers('bonus'); } catch (e) { return e; } })();
if (Array.isArray(bo)) {
  T('★賞与＝支給日が 支給月と 違う 月の 時は 退職日の 在る 人を 振込に 入れない★', !bo.some((t) => t.emp.id === 'FUYU'), '一覧 ' + ids(bo));
  if (!WAZA) T('★賞与＝支給日が 支給月と 違う 月の 時は 名指しで 止める★', tomeru('bonus') === 'FUYU', tomeru('bonus'));
} else T('賞与の 振込が 作れる（支給日の 月が 違う）', false, String(bo && bo.message));
/* 退職日を 入れたが「退職にする」を 押していない 人にも 案3が 効く（taiketsu 10-23 止め1） */
A.state.month = '2026-07';
A.state.employees = [mk('ZAISEKI'), mk('NMAE', { taishokuYmd: '2026-07-05' }), mk('NTOU', { taishokuYmd: '2026-07-10' }), mk('NATO', { taishokuYmd: '2026-07-31' })];
A.state.confirmed = {};
A.state.bonus = { payYm: '2026-07', payDay: '2026-07-10', byEmp: { ZAISEKI: { amount: '100000' }, NMAE: { amount: '100000' }, NTOU: { amount: '100000' }, NATO: { amount: '100000' } } };
bo = (() => { try { return A.buildTransfers('bonus'); } catch (e) { return e; } })();
if (Array.isArray(bo)) {
  if (!WAZA) {
    T('★賞与＝「退職にする」を 押していない 人も 支給日より 前に 辞めたら 振込に 入らない★', !bo.some((t) => t.emp.id === 'NMAE'), '一覧 ' + ids(bo));
    T('★賞与＝「退職にする」を 押していない 人も 支給日 当日・後なら 入る★', ['NTOU', 'NATO', 'ZAISEKI'].every((id) => bo.some((t) => t.emp.id === id)), '一覧 ' + ids(bo));
    T('★賞与＝「退職にする」を 押していない 人も 支給日より 前に 辞めたら 名指しで 止める★', tomeru('bonus') === 'NMAE', tomeru('bonus'));
  }
} else T('賞与の 振込が 作れる（退職日だけ）', false, String(bo && bo.message));
/* 月次は 今の まま（退職日だけの 人は 在籍の 判定で 決まる・止めない） */
if (!WAZA) T('★月次＝「退職にする」を 押していない 人は 退職の 止めに 入らない（今の まま）★', tomeru('monthly') === '', tomeru('monthly'));

/* ── ⑥ 「退職にする」だけの 人に 前の 賞与の 金額が 残っていても、冬の 賞与ファイルは 作れる（taiketsu 10-23 止め1） ── */
A.state.month = '2026-12';
A.state.employees = [mk('ZAISEKI'), mk('OLD', { retired: true, retiredYmd: '2026-03' })];
A.state.confirmed = {};
A.state.bonus = { payYm: '2026-12', payDay: '10', byEmp: { ZAISEKI: { amount: '100000' }, OLD: { amount: '200000' } } };
let bo2 = null;
try { bo2 = A.buildTransfers('bonus'); } catch (e) { bo2 = e; }
if (Array.isArray(bo2)) {
  T('★ボタンだけの 退職者は 賞与の 振込に 入らない★', !bo2.some((t) => t.emp.id === 'OLD') && bo2.some((t) => t.emp.id === 'ZAISEKI'), '一覧 ' + ids(bo2));
  if (!WAZA) {
    T('★ボタンだけの 退職者に 古い 賞与の 金額が 残っていても 止めない★', tomeru('bonus') === '', tomeru('bonus'));
    T('★その 会社の 賞与の 振込ファイルは 作れる★', dasuKa('bonus') === true);
  }
} else T('賞与の 振込が 作れる', false, String(bo2 && bo2.message));

/* ── ⑦ 止めの 字の 通りに 直すと 払える（taiketsu 10-23 止め2＝字に 従うと 黙って 落ちた） ── */
A.state.month = '2026-07';
A.state.employees = [mk('ZAISEKI'), mk('PRE', { retired: true, retiredYmd: '2026-06', taishokuYmd: '2026-07-31' })];
A.state.confirmed = { '2026-07': { ZAISEKI: true, PRE: true } };
if (!WAZA) {
  T('★6月に 押して 退職日 7/31＝7月は 名指しで 止める★', tomeru('monthly') === 'PRE', tomeru('monthly'));
  A.state.employees[1].retiredYmd = '2026-07';   /* 字の 通り＝退職日の 月（7月）を 開いて「復帰させる」→「退職にする」を 押し直した 形 */
  T('★字の 通り 押し直すと 止めが 外れ、7月の 振込に 入る★', tomeru('monthly') === '' && A.buildTransfers('monthly').some((t) => t.emp.id === 'PRE' && t.ready), tomeru('monthly'));
}

/* ── ⑧ 削除した 人に 前に 押して 戻した「退職にする」の 古い 月が 残っても、作り直しの 振込は 止まらない（taiketsu 10-23 2回目 止め1） ── */
A.state.month = '2026-07';
A.state.employees = [mk('ZAISEKI'), mk('KES', { retired: true, retiredYmd: '2026-03', taishokuYmd: '2026-07-31', kesita: '2026-09-30' })];
A.state.confirmed = { '2026-07': { ZAISEKI: true, KES: true } };
if (!WAZA) {
  T('★削除した 人は 古い 月で 止めない★', tomeru('monthly') === '', tomeru('monthly'));
  T('★削除した 人は 作り直しの 7月の 振込に ready で 入る★', A.buildTransfers('monthly').some((t) => t.emp.id === 'KES' && t.ready));
  T('★その 会社の 7月の 振込ファイルは 作れる★', dasuKa('monthly') === true);
}

/* ── ⑨ 止める 人しか 居ない 時も、画面・全銀・Excel の 3つが 名指しする（taiketsu 10-23 本番前 止め1＝「対象がありません」で 黙っていた） ── */
if (!WAZA) T('★振込の 画面と 2つの ボタンを 試験から 呼べる（呼べないのに 飛ばして 緑に しない）★', !!(A.renderFuri && A.downloadZengin && A.downloadFuriExcel));
if (!WAZA && A.renderFuri && A.downloadZengin && A.downloadFuriExcel) {
  const naCheck = (na, fn) => {
    for (const ov of [...doc.querySelectorAll('.ui-modal-ov')]) ov.remove();
    try { fn(); } catch (e) { /* 呼べなかった＝下で 赤 */ }
    const ji = [...doc.querySelectorAll('.ui-modal-ov')].map((o) => o.textContent).join(' ');
    for (const ov of [...doc.querySelectorAll('.ui-modal-ov')]) ov.remove();
    return ji;
  };
  /* 賞与＝退職の 人だけに 金額 */
  A.state.printMode = 'bonus';
  A.state.month = '2026-07';
  A.state.employees = [mk('TAI', { retired: true, taishokuYmd: '2026-07-31', name: '試し 退職の人' })];
  A.state.confirmed = { '2026-07': { TAI: true } };
  A.state.bonus = { payYm: '2026-07', payDay: '10', byEmp: { TAI: { amount: '100000' } } };
  A.renderFuri();
  const gamen = (doc.querySelector('#furi-box') || {}).textContent || '';
  T('★賞与・止める 人だけ＝画面が 名指しする（「金額を 入れた 人が いません」と 言わない）★', /試し 退職の人/.test(gamen) && !/金額を入れた人がいません/.test(gamen), gamen.slice(0, 120));
  const jz = naCheck('全銀', () => A.downloadZengin());
  T('★賞与・止める 人だけ＝全銀の ボタンが 名指しする★', /試し 退職の人/.test(jz), jz.slice(0, 100));
  const jx = naCheck('Excel', () => A.downloadFuriExcel());
  T('★賞与・止める 人だけ＝Excel の ボタンが 名指しする★', /試し 退職の人/.test(jx), jx.slice(0, 100));
  /* 月次＝食い違いの 1人だけ */
  A.state.printMode = '';
  A.state.month = '2026-11';
  A.state.employees = [mk('MUJUN', { retired: true, retiredYmd: '2026-10', taishokuYmd: '2026-12-31', name: '試し 食い違い' })];
  A.state.confirmed = {};
  A.renderFuri();
  const gamen2 = (doc.querySelector('#furi-box') || {}).textContent || '';
  T('★月次・止める 人だけ＝画面が 名指しする（「在籍する 従業員が いません」と 言わない）★', /試し 食い違い/.test(gamen2) && !/在籍する従業員がいません/.test(gamen2), gamen2.slice(0, 120));
  const jz2 = naCheck('全銀', () => A.downloadZengin());
  T('★月次・止める 人だけ＝全銀の ボタンが 名指しする（「振込対象がありません」で 止めない）★', /試し 食い違い/.test(jz2), jz2.slice(0, 100));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('KEKKA {"passed":' + pass + ',"failed":' + fail + ',"mimiso":0}');
process.exit(fail ? 1 : 0);
