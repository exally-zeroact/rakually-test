/* furikomi-taishoku.test.mjs — ★確定した 給与は 退職・削除の 人でも 振込に 入る★（jsdom・ブラウザ無し）
 * ============================================================================
 * ★守る事（2026-10-23 司さん「直さなダメ」）★ … 前は buildTransfers が 退職の 印（retired）で 人を 外していたので、
 *   ①払う日より 前に「退職にする」を 押す ②削除した 人を 払う日の 後に 作り直す（遅れ・銀行から 返された）と、
 *   ★確定した 給与が 振込（画面・全銀・Excel）から 黙って 落ちた★。
 * ★この門が 見る事★ … 2026-07 を 確定した 人は 退職の 形（ボタンだけ・退職日あり・削除）でも 振込に 居る。
 *   確定していない 退職の 人・確定の 無い 月・賞与は 今まで 通り 入らない。倉庫も 共有口も 触らない＝決定的。
 * ★空振り止め（--waza）★ … app.js の「確定を 先に 見る」1行を 外して 配る ⇒ 退職の 3人が 振込から 消える＝門が 1行を 守っている 証し。
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

const KESU_MAE = "      if(!bonus && e.retired && state.confirmed && state.confirmed[ym] && state.confirmed[ym][e.id] && isActiveInMonth(Object.assign({},e,{retired:false}),ym) && !(e.retiredYmd && !e.taishokuYmd && ym>e.retiredYmd)) return true;\n";   /* ★確定を 先に 見る 1行（--waza で 外す）★ */
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
    const n = code.split(KESU_MAE).length - 1;
    if (WAZA) { kesita = n; code = code.split(KESU_MAE).join(''); } else kesita = n;
  }
  const el = doc.createElement('script'); el.textContent = code; doc.body.appendChild(el);
}
await sleep(400);

let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };

const A = win.__PAYSLIP_TEST;
if (!A || !A.buildTransfers || !A.defEmp || !A.state) { console.log('✗ ★app.js から buildTransfers／defEmp／state が 取れない★'); process.exit(1); }

console.log('\n[furikomi-taishoku] 確定した 給与は 退職・削除の 人でも 振込に 入る' + (WAZA ? '  ★★確定を 見る 1行を 外した回★★' : ''));
T('★確定を 先に 見る 1行が app.js に ちょうど 1か所 在る★', kesita === 1, '在った 数=' + kesita);

/* 作り物の 人（口座あり・月給）。名前は 作り物だけ */
const mk = (id, extra) => Object.assign(A.defEmp(), { id: id, name: '試し ' + id,
  base: '300000', pref: 'ehime', furiBankNo: '0001', furiBranchNo: '001', furiAccount: '1234567', furiKana: 'ﾀﾒｼ' }, extra || {});
A.state.company = A.defCompany ? A.defCompany() : (A.state.company || {});
A.state.month = '2026-07';
A.state.employees = [
  mk('ZAISEKI'),                                                            // 在籍・確定あり
  mk('BTN', { retired: true, retiredYmd: '2026-07' }),                      // 「退職にする」を 押しただけ（退職日 無し）・確定あり
  mk('TAI', { retired: true, taishokuYmd: '2026-07-31' }),                  // 退職日あり・確定あり
  mk('KESITA', { retired: true, taishokuYmd: '2026-07-31', kesita: '2026-08-30' }),  // 削除した 人・確定あり
  mk('TAI_NOCONF', { retired: true, taishokuYmd: '2026-07-31' }),           // 退職・確定 無し
];
A.state.confirmed = { '2026-07': { ZAISEKI: true, BTN: true, TAI: true, KESITA: true } };

const ids = (tr) => tr.map((t) => t.emp.id).sort().join(',');
const tr7 = A.buildTransfers('monthly');
const ari = (id) => tr7.find((t) => t.emp.id === id);

T('在籍で 確定した 人は 振込に 居る・金額 > 0（試しの 人に 給与が 入っている＝金額の 確かめが 空振りしない）', !!ari('ZAISEKI') && ari('ZAISEKI').amount > 0, '一覧 ' + ids(tr7) + ' 金額 ' + (ari('ZAISEKI') && ari('ZAISEKI').amount));
if (!WAZA) {
  for (const id of ['BTN', 'TAI', 'KESITA']) {
    const t = ari(id);
    T('★' + id + '（退職・確定あり）が 振込に 居る・金額 > 0・ready★', !!t && t.amount > 0 && t.ready === true,
      t ? JSON.stringify({ amount: t.amount, ready: t.ready, ko: t.keisanOchi }) : '居ない（一覧 ' + ids(tr7) + '）');
  }
} else {
  T('★--waza: 確定を 見ないと 退職の 3人が 振込から 消える（門が 1行を 守る 証し）★',
    !ari('BTN') && !ari('TAI') && !ari('KESITA'), '一覧 ' + ids(tr7));
}
T('★確定していない 退職の 人は 入らない★', !ari('TAI_NOCONF'), '一覧 ' + ids(tr7));

/* ★在籍の 期間の 外の 確定は 入らない★（taiketsu 10-23＝確定の 後に 退職日・入社日を 直すと、見えない 確定で 満額が 出た） */
{
  const keep = A.state.employees, keepC = A.state.confirmed;
  A.state.month = '2026-11';
  A.state.employees = [
    mk('P1', { retired: true, taishokuYmd: '2026-10-15' }),   // 11月を 確定した 後に 退職日を 前の 月へ
    mk('P1b', { taishokuYmd: '2026-10-15' }),                 // 同じ・退職の 印 無し
    mk('P2', { joinYmd: '2026-12-01' }),                      // 11月を 確定した 後に 入社日を 12月へ
    mk('P3', { retired: true, retiredYmd: '2026-10' }),       // ボタンで 10月に 退職・11月の 確定が 残る
  ];
  A.state.confirmed = { '2026-11': { P1: true, P1b: true, P2: true, P3: true } };
  const trS = A.buildTransfers('monthly');
  for (const id of ['P1', 'P1b', 'P2', 'P3']) T('★' + id + '（期間の 外の 確定）は 入らない★', !trS.some((t) => t.emp.id === id), '一覧 ' + ids(trS));
  A.state.employees = keep; A.state.confirmed = keepC; A.state.month = '2026-07';
}

/* 確定の 無い 月（退職の 後）＝入らない */
A.state.month = '2026-08';
const tr8 = A.buildTransfers('monthly');
T('★確定の 無い 月（退職の 後）は 退職の 人が 入らない★', !tr8.some((t) => ['BTN', 'TAI', 'KESITA', 'TAI_NOCONF'].includes(t.emp.id)), '一覧 ' + ids(tr8));

/* 確定を 取り消すと 外れる */
A.state.month = '2026-07';
delete A.state.confirmed['2026-07'].TAI;
const trU = A.buildTransfers('monthly');
T('★確定を 取り消した 退職の 人は 入らない★', !trU.some((t) => t.emp.id === 'TAI'), '一覧 ' + ids(trU));
A.state.confirmed['2026-07'].TAI = true;

/* 賞与は 今の まま（退職の 人は 入らない） */
if (A.state.bonus !== undefined || A.bonusEntry) {
  let bo = null;
  try { bo = A.buildTransfers('bonus'); } catch (e) { bo = e; }
  if (Array.isArray(bo)) T('★賞与は 今の まま＝退職の 人は 入らない★', !bo.some((t) => ['BTN', 'TAI', 'KESITA'].includes(t.emp.id)), '一覧 ' + ids(bo));
  else T('賞与の 振込が 作れる', false, String(bo && bo.message));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('KEKKA {"passed":' + pass + ',"failed":' + fail + ',"mimiso":0}');
process.exit(fail ? 1 : 0);
