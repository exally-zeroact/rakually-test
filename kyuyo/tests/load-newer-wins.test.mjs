/* load-newer-wins.test.mjs — ★ロード側 newer-wins＝古いクラウドが 新しいローカル編集を 消さない★（jsdom・本物の applyCloudState）
 * ============================================================================
 * ★守る事（2026-10-07・司さん方針）★
 *   離脱で クラウド保存を 取りこぼすと localStorage には 残るのに、前は 次回ロードで applyCloudState が
 *   ★updated_at を見ず クラウドで 無条件上書き★＝新しいローカル編集が 古いクラウドに 消えていた（remote-always-wins 退化）。
 *   直し＝store.js の 純関数 Store.reconcileOnLoad で判じ、apply==='local' なら クラウドで上書きしない（ローカル優先）＋
 *   保護ドメイン(confirmed/nencho/bonus/payPatterns)は Store.unionNeverLose で クラウドの分も 絶対に落とさない。
 * ★この門が 見る事★ … ①dirty無→クラウド採用(従来) ②ローカル編集(dirty) ③据置クラウド再ロード→
 *   ★ローカル編集が 残る(消えない)★＋confirmed は 両端末の分が 揃う(union)。★本物の applyCloudState を 呼ぶ(真似ない)★。
 * ★空振り止め（--waza）★ … reconcileOnLoad を「常に apply:'cloud'」に差し替えて注入＝退行すると ローカルが消える＝門が赤。
 * 使い方: node kyuyo/tests/load-newer-wins.test.mjs   ／   --waza
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

const file = path.join(ROOT, 'kyuyo/index.html');
const html = fs.readFileSync(file, 'utf8');
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/kyuyo/index.html' });
const win = dom.window, doc = win.document;
win.fetch = () => Promise.reject(new Error('no net')); win.alert = () => {}; win.confirm = () => true; win.scrollTo = () => {}; win.print = () => {};
for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
  const src = m[1].split('?')[0]; const base = src.split('/').pop();
  if (/^https?:/.test(src) || ['supa-config.js', 'auth.js', 'env-badge.js', 'rakunally-login.js'].includes(base)) continue;
  const p = path.resolve(path.dirname(file), src); if (!fs.existsSync(p)) continue;
  const el = doc.createElement('script'); el.textContent = fs.readFileSync(p, 'utf8'); doc.body.appendChild(el);
}
await sleep(400);

let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };

const A = win.__PAYSLIP_TEST;
if (!A || !A.applyCloudState || !A.state || !A.persistSaveDebounced) { console.log('✗ ★app.js から applyCloudState／state／persistSaveDebounced が 取れない★'); process.exit(1); }
if (!win.Store || typeof win.Store.reconcileOnLoad !== 'function' || typeof win.Store.unionNeverLose !== 'function') { console.log('✗ ★Store.reconcileOnLoad／unionNeverLose が 読めない★'); process.exit(1); }

if (WAZA) {
  /* ★わざと退行＝reconcileOnLoad を 常に クラウド採用(replace)に＝ロード側 newer-wins を 殺す★ */
  win.Store.reconcileOnLoad = function () { return { apply: 'cloud', push: false, conflict: false, protect: 'replace' }; };
}

console.log('\n[load-newer-wins] 古いクラウドが 新しいローカル編集を 消さない' + (WAZA ? '  ★★newer-wins を 殺した回★★' : ''));

const emp = (id, name) => Object.assign(A.defEmp(), { id: id, name: name });

/* ① 初回ロード（dirty無）＝クラウドを採る（従来）。baseCoUA=UA1 が立つ */
A.applyCloudState({ company: A.defCompany ? A.defCompany() : {}, employees: [emp('e1', 'クラウド太郎')], confirmed: { '2026-01': { e1: true } }, _coUA: 'UA1' });
const m1 = win.PayslipSyncMeta ? win.PayslipSyncMeta() : {};
T('① 初回ロードは クラウドを採る（dirty無）', (A.state.employees[0] && A.state.employees[0].name) === 'クラウド太郎', '名前=' + (A.state.employees[0] && A.state.employees[0].name));
T('① baseCoUA が UA1 に／dirty=false', m1.baseCoUA === 'UA1' && m1.dirty === false, JSON.stringify(m1));

/* ② ローカルで 編集（dirty=true）＝離脱で クラウドに 届かなかった体 */
A.state.employees[0].name = 'ローカル花子';
A.persistSaveDebounced();
const m2 = win.PayslipSyncMeta ? win.PayslipSyncMeta() : {};
T('② ローカル編集で dirty=true', m2.dirty === true, JSON.stringify(m2));

/* ③ 据置クラウド(同じ _coUA=UA1)を 再ロード＝★ローカル編集が 残る★＋confirmed は 両方 揃う(union) */
A.applyCloudState({ company: A.defCompany ? A.defCompany() : {}, employees: [emp('e1', 'クラウド太郎')], confirmed: { '2026-01': { e1: true }, '2026-02': { e2: true } }, _coUA: 'UA1' });
if (!WAZA) {
  T('③ ★古いクラウドで ローカル編集を 消さない（ローカル花子 のまま）★', (A.state.employees[0] && A.state.employees[0].name) === 'ローカル花子',
    '消えた＝' + (A.state.employees[0] && A.state.employees[0].name));
  T('③ ★confirmed は 両端末の分が 揃う（2026-01.e1＋2026-02.e2・union）★', !!(A.state.confirmed && A.state.confirmed['2026-01'] && A.state.confirmed['2026-01'].e1 && A.state.confirmed['2026-02'] && A.state.confirmed['2026-02'].e2),
    JSON.stringify(A.state.confirmed));
  /* ④ 真の競合（クラウドが進んだ UA2・自分送りでない）＝stage1 は クラウド採用（従業員はクラウド＝黙って他端末の人を消さない）、
     ★但し confirmed 等 保護ドメインは union で 1件も落とさない（司さん②・taiketsu B の直し）★。Q1(競合でローカル優先)は Phase4+司さんA 後の次段。 */
  A.applyCloudState({ company: A.defCompany ? A.defCompany() : {}, employees: [emp('e1', 'クラウド太郎')], confirmed: { '2026-03': { e3: true } }, _coUA: 'UA2' });
  T('④ 競合（クラウド進行）は 従業員はクラウド採用＝黙って他端末の人を消さない（stage1）', (A.state.employees[0] && A.state.employees[0].name) === 'クラウド太郎',
    '従業員=' + JSON.stringify((A.state.employees || []).map(function (x) { return x.name; })));
  T('④ ★競合でも confirmed は 1件も落とさない（2026-01/02＝ローカル分＋2026-03＝クラウド分・union）★',
    !!(A.state.confirmed && A.state.confirmed['2026-01'] && A.state.confirmed['2026-01'].e1 && A.state.confirmed['2026-02'] && A.state.confirmed['2026-02'].e2 && A.state.confirmed['2026-03'] && A.state.confirmed['2026-03'].e3),
    JSON.stringify(A.state.confirmed));
  var m4 = win.PayslipSyncMeta ? win.PayslipSyncMeta() : {};
  T('④ 競合でクラウドを採った後は baseCoUA=UA2／dirty=false', m4.baseCoUA === 'UA2' && m4.dirty === false, JSON.stringify(m4));

  /* ⑤ ★dirty=false の 通常ロード＝別端末が更新した 賞与の“値”が 古い値に 巻き戻らない（クラウド値が勝つ）★
     ＝taiketsu 2026-10-07 の「保護unionがローカル優先で値が巻き戻る」穴を 縛る。 */
  A.state.bonus = { payYm: '2026-06', payDay: '25', byEmp: { e1: { amount: 100 } } };   /* 手元＝古い値100（dirty=false＝④で clean） */
  A.applyCloudState({ company: A.defCompany ? A.defCompany() : {}, employees: [emp('e1', 'クラウド太郎')], bonus: { payYm: '2026-06', payDay: '25', byEmp: { e1: { amount: 200 }, e2: { amount: 9 } } }, _coUA: 'UA2' });
  T('⑤ ★dirty=false で 賞与の値が 巻き戻らない（クラウドの 200 になる・100 に戻らない）★', !!(A.state.bonus && A.state.bonus.byEmp && A.state.bonus.byEmp.e1 && A.state.bonus.byEmp.e1.amount === 200),
    '巻き戻った＝' + JSON.stringify(A.state.bonus && A.state.bonus.byEmp));
  T('⑤ 別端末が足した賞与(e2)も 入る（消さない）', !!(A.state.bonus && A.state.bonus.byEmp && A.state.bonus.byEmp.e2 && A.state.bonus.byEmp.e2.amount === 9), JSON.stringify(A.state.bonus && A.state.bonus.byEmp));
} else {
  T('③ ★--waza: newer-wins を 殺すと ローカル編集が クラウドで 消える（＝門が 守っている証し）★', (A.state.employees[0] && A.state.employees[0].name) === 'クラウド太郎',
    '殺したのに 残った＝' + (A.state.employees[0] && A.state.employees[0].name));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('KEKKA {"passed":' + pass + ',"failed":' + fail + ',"mimiso":0}');
process.exit(fail ? 1 : 0);
