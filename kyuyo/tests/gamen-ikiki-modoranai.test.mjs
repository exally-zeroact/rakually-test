/* gamen-ikiki-modoranai.test.mjs — ★選んだ物が 画面を 行き来しても 戻らない★（2026-10-25）
 * ============================================================================
 * ★司さん（2026-10-25・ダイコメで）★「何日からってのを 2026/10/1 に設定したのに 画面変えて 入力から やると
 *   また 2026/10/25 に もどってる 他の所も こうゆうのが ないか 確認して 直せ」「Rakunally にも 伝えて」
 * ★給与で 数えた（本物の 5画面の 欄を 全部 変えて 行き来）★ … 戻る欄は 印刷の「誰を 印刷するか」1つだけ
 *   （描くたびに「全員」へ 戻り、1人を 選んで 他の 画面へ 行き 戻ると 全員の 明細に なっていた）。
 *   ★給与に「何日から」（その日から 効く 設定の 日付）の 欄は 無い★。日付の 欄は どれも 人・月の 記録に 結ばれる。
 * ★この 門が 見る事★ … ①印刷の 人 ②入力の「要確認だけ表示」③振込の 自社の 欄（委託者名）＝行き来の 後も 同じ
 * ★空振り止め★ … --waza＝印刷の 人を 戻す 行を 外す＝①が 赤 ／ --waza=tsuki＝月を 変えた時に 選ぶ欄を 作り直さない（前の形）＝④が 赤
 * 使い方: node kyuyo/tests/gamen-ikiki-modoranai.test.mjs ／ --waza
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
const WAZA_TSUKI = process.argv.includes('--waza=tsuki');
const WAZA = process.argv.includes('--waza') || WAZA_TSUKI;   /* ★月を 変えた時に 選ぶ欄を 作り直す 行を 戻す★＝④が 赤 */
const TSUKI = "if($('#scr-print').classList.contains('active')) renderPrint();";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const file = path.join(ROOT, 'kyuyo/index.html');
const html = fs.readFileSync(file, 'utf8');
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/kyuyo/index.html' });
const win = dom.window, doc = win.document;
win.fetch = () => Promise.reject(new Error('no net')); win.alert = () => {}; win.confirm = () => true; win.scrollTo = () => {}; win.print = () => {}; win.open = () => null;
const MODOSU = "if(state._printEmpId){";
for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
  const src = m[1].split('?')[0]; const base = src.split('/').pop();
  if (/^https?:/.test(src) || /^supabase-js/.test(base) || ['supa-config.js', 'auth.js', 'env-badge.js', 'rakunally-login.js'].includes(base)) continue;
  const p = path.resolve(path.dirname(file), src); if (!fs.existsSync(p)) continue;
  let s = fs.readFileSync(p, 'utf8');
  if (WAZA_TSUKI && base === 'app.js') {
    if (s.indexOf(TSUKI) < 0) { console.log('✗ ★--waza=tsuki の 置き換え先が app.js に 無い★'); process.exit(1); }
    s = s.replace(TSUKI, "if($('#scr-print').classList.contains('active')) doPreview();");
  }
  if (WAZA && !WAZA_TSUKI && base === 'app.js') {
    if (s.indexOf(MODOSU) < 0) { console.log('✗ ★--waza の 置き換え先が app.js に 無い★'); process.exit(1); }
    s = s.replace(MODOSU, 'if(false && state._printEmpId){');
  }
  const el = doc.createElement('script'); el.textContent = s; doc.body.appendChild(el);
}
await sleep(500);
const A = win.__PAYSLIP_TEST;
if (!A || !A.state || !A.defEmp) { console.log('✗ ★app.js の 試験の 口が 取れない★'); process.exit(1); }
const emp = (id, name) => Object.assign(A.defEmp(), { id, name, pref: '東京都', birthYmd: '1990-01-01', base: 250000, joinYmd: '2026-04-01' });
A.state.employees = [emp('e1', '試験 一郎'), emp('e2', '試験 二郎')];
A.state.onboardDone = true;
const go = async (id) => { const b = doc.querySelector('.bn[data-scr="' + id + '"]'); if (b) b.click(); await sleep(200); };
const q = (s) => doc.querySelector(s);

let pass = 0, fail = 0; const akaNo = [];
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; akaNo.push(n); console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };
console.log('\n[gamen-ikiki-modoranai] 選んだ物が 画面を 行き来しても 戻らない' + (WAZA ? '  ★★戻す 行を 外した 回★★' : ''));

await go('scr-print');
const pe = q('#p-emp');
T('前提：印刷の 人を 選べる（全員＋2人）', !!pe && pe.options.length === 3, pe ? [...pe.options].map((o) => o.textContent).join(',') : '無い');
if (pe) { pe.value = '1'; pe.dispatchEvent(new win.Event('change', { bubbles: true })); await sleep(200); }
await go('scr-input');
const ro = q('#scr-input [data-reviewonly]');
if (ro) { ro.click(); await sleep(200); }
await go('scr-furikomi');
const fn = q('#scr-furikomi [data-fc="furiName"]');
if (fn) { fn.value = 'ｼｹﾝ'; fn.dispatchEvent(new win.Event('input', { bubbles: true })); await sleep(700); }
await go('scr-settings'); await go('scr-list');
await go('scr-print');
T('① ★印刷の「誰を 印刷するか」は 画面を 行き来しても 選んだ 人の まま（全員に 戻らない）★', q('#p-emp') && q('#p-emp').value === '1', '今=' + (q('#p-emp') && q('#p-emp').value));
/* 並びが 変わっても 別の人に ならない（id で 覚える） */
A.state.employees = [A.state.employees[1], A.state.employees[0]];
await go('scr-list'); await go('scr-print');
T('① 並びが 変わっても 同じ 人（試験 二郎）を 指す', q('#p-emp') && q('#p-emp').selectedOptions[0] && q('#p-emp').selectedOptions[0].textContent === '試験 二郎', '今=' + (q('#p-emp') && q('#p-emp').selectedOptions[0] && q('#p-emp').selectedOptions[0].textContent));
await go('scr-input');
T('② 入力の「要確認だけ表示」は 行き来の 後も 入ったまま', !!ro && q('#scr-input [data-reviewonly]') && q('#scr-input [data-reviewonly]').checked === true);
await go('scr-furikomi');
T('③ 振込の 自社の 欄（委託者名）は 行き来の 後も 入れた 字のまま', !!fn && q('#scr-furikomi [data-fc="furiName"]') && q('#scr-furikomi [data-fc="furiName"]').value === 'ｼｹﾝ', '今=' + (q('#scr-furikomi [data-fc="furiName"]') && q('#scr-furikomi [data-fc="furiName"]').value));

/* ④⑤ ★印刷の 画面の 中で 月を 変える★（taiketsu 10-25 止める-1・前からの 穴）
   前は 月を 変えても 選ぶ欄を 作り直さず、その月に 居ない 人を 選んだ まま 明細の 下絵・Excel の 対象に していた（お金の 紙）。 */
A.state.employees.push(Object.assign(emp('e3', '試験 三郎'), { joinYmd: '2026-08-01' }));
A.state.month = '2026-10';
await go('scr-list'); await go('scr-print');
const sanIdx = String(A.state.employees.findIndex((e) => e.id === 'e3'));
const pe2 = q('#p-emp');
if (pe2) { pe2.value = sanIdx; pe2.dispatchEvent(new win.Event('change', { bubbles: true })); await sleep(200); }
const pm = q('#p-month');
if (pm) { pm.value = '2026-06'; pm.dispatchEvent(new win.Event('change', { bubbles: true })); await sleep(300); }
const opts6 = q('#p-emp') ? [...q('#p-emp').options].map((o) => o.textContent) : [];
T('④ ★印刷の 画面で 月を 変えると、その月に 居ない 人（8月入社の 三郎）は 選べず「全員」に なる★', !!pm && q('#p-emp').value === '__all' && !opts6.includes('試験 三郎'),
  '選ぶ欄=' + opts6.join(',') + '／今=' + (q('#p-emp') && q('#p-emp').value));
if (pm) { pm.value = '2026-10'; pm.dispatchEvent(new win.Event('change', { bubbles: true })); await sleep(300); }
T('⑤ 「全員」に 落ちた 後は、月を 戻しても 黙って 三郎に 戻らない（全員の まま）', q('#p-emp') && q('#p-emp').value === '__all', '今=' + (q('#p-emp') && q('#p-emp').value));

if (WAZA) {
  const atatta = akaNo.some((n) => n.startsWith(WAZA_TSUKI ? '④ ★印刷' : '① ★印刷'));
  console.log('\n--waza：' + (atatta ? '★壊すと ' + (WAZA_TSUKI ? '④' : '①') + ' が 赤＝門が 守っている★' : '★壊しても ' + (WAZA_TSUKI ? '④' : '①') + ' が 赤に ならない＝空振り★'));
  console.log('KEKKA {"passed":' + (atatta ? 1 : 0) + ',"failed":' + (atatta ? 0 : 1) + ',"mimiso":0}');
  process.exit(atatta ? 0 : 1);
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('KEKKA {"passed":' + pass + ',"failed":' + fail + ',"mimiso":0}');
process.exit(fail ? 1 : 0);
