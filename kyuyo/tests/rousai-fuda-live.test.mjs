/* rousai-fuda-live.test.mjs — ★労災の札が 率入力で その場で 変わる★（jsdom・ブラウザ無し・⑧c）
 * ============================================================================
 * ★守る事（2026-10-03・指示役と）★ … 「一覧に無い（率を自分で入れる）」で 率を打つと、計算は合うのに
 *   札「労災（率を自分で入れてください）」が ★開き直すまで 変わらない★＝字だけ古い（一番気づかれにくい）。
 *   直し＝率入力の受け手で、state.company.rousaiRate を 新値にした「後」に 札だけ textContent で書き換える（全描画しない）。
 * ★この門が見る事★ … __te__ で描く→札は「率を 自分で 入れてください」→ data-rousai-rate に 3.5 を input→
 *   ★札が「自分で 入れた 率・3.5‰」に 変わる（開き直さず・打った値そのもの）★。「変わった」でなく ★打った値3.5‰が出る★で判じる。
 * ★空振り止め（--waza）★ … 札を書き換える1行を 外して配る→古いまま＝門が効く証し。
 * 使い方: node kyuyo/tests/rousai-fuda-live.test.mjs   ／   --waza
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

const KESU_MAE = "if(fj) fj.textContent='労災（'+rousaiFudaJi(state.company)+'）';";   /* ★札を更新する1行（--waza で外す）★ */
const KESU_ATO = 'if(fj) void 0;';
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
  if (WAZA && base === 'app.js') { const n = code.split(KESU_MAE).length - 1; kesita = n; code = code.split(KESU_MAE).join(KESU_ATO); }
  const el = doc.createElement('script'); el.textContent = code; doc.body.appendChild(el);
}
await sleep(400);

let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };

const A = win.__PAYSLIP_TEST;
if (!A || !A.renderChoView || !A.state || !A.defEmp) { console.log('✗ ★app.js から renderChoView／state／defEmp が 取れない★'); process.exit(1); }

console.log('\n[rousai-fuda-live] 労災の札が 率入力で その場で 変わる' + (WAZA ? '  ★★札更新を外した回★★' : ''));

/* 倉庫は スタブ（労働保険の描画は Store.getPayslipsByYm を読む・ネットは使わない）
   ＝賃金のある レコードを 返す＝「保険料の概算」の箱（労災の札＋率入力）が 出る（空だと 箱が 出ない）。 */
const FY = 2026;   /* 労働保険年度（4月〜翌3月）＝state.month 2026-07 の年度 */
const recs = [];
for (let i = 0; i < 12; i++) { const mm = 4 + i, yy = mm > 12 ? FY + 1 : FY; const ym = yy + '-' + ('0' + (mm > 12 ? mm - 12 : mm)).slice(-2);
  recs.push({ ym: ym, employee_id: 'a', data: { shikyuTotal: 300000, net: 240000, confirmed: true, kind: 'monthly' } }); }
win.Store = { getPayslipsByYm: () => Promise.resolve(recs) };
A.state.company = Object.assign(A.defCompany ? A.defCompany() : {}, { rousaiShurui: '__te__', rousaiRate: '' });
A.state.employees = [Object.assign(A.defEmp(), { id: 'a' })];
A.state.month = '2026-07';
A.state.confirmed = { }; for (let i = 0; i < 12; i++) { const mm = 4 + i, yy = mm > 12 ? FY + 1 : FY; const ym = yy + '-' + ('0' + (mm > 12 ? mm - 12 : mm)).slice(-2); (A.state.confirmed[ym] = A.state.confirmed[ym] || {})['a'] = true; }
A.state.choView = 'roudou';
A.renderChoView();
await sleep(200);   /* renderRoudou の .then を待つ */

const fuda = () => { const el = doc.querySelector('#rousai-fuda'); return el ? el.textContent : null; };
const rin = doc.querySelector('[data-rousai-rate]');
T('労災の札と 率入力欄が 描けた（__te__）', fuda() != null && !!rin, '札=' + fuda() + ' / 入力=' + !!rin);
T('初めは「率を 自分で 入れてください」', (fuda() || '').indexOf('率を 自分で 入れてください') >= 0, '札=' + fuda());

if (rin) {
  rin.value = '3.5';
  rin.dispatchEvent(new win.Event('input', { bubbles: true }));
  await sleep(60);
}
console.log('     率 3.5 を打った後の 札＝「' + fuda() + '」');

if (!WAZA) {
  T('★札が 打った値そのもの「3.5‰」に 変わる（開き直さず）★', (fuda() || '').indexOf('3.5‰') >= 0,
    '札が 打った値に なっていない＝' + fuda());
  T('★古い「率を 自分で 入れてください」は 消えた★', (fuda() || '').indexOf('率を 自分で 入れてください') < 0);
} else {
  T('★わざ置換が効いた（札更新を外した）★', kesita === 1, '外せた箇所=' + kesita);
  T('★--waza: 札更新を外すと 打っても 札が 古いまま（門が効く証し）★', (fuda() || '').indexOf('率を 自分で 入れてください') >= 0,
    '外したのに 札が 変わった＝' + fuda());
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('KEKKA {"passed":' + pass + ',"failed":' + fail + ',"mimiso":0}');
process.exit(fail ? 1 : 0);
