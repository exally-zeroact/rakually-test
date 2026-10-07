/* othist-warn.mjs — ★過去の残業履歴が 読めない時、36協定チェックが 黙らない★（2026-10-08 ダイコメ横断(a)3）
 * =============================================================================
 * ★守る事★
 *   loadOtHistory（直近11か月の残業を 履歴から読む＝36協定の 複数月/年の 上限チェックの材料）は
 *   前は `.catch(function(){})` で ★黙って★ 失敗していた。読めないと state._otHist が 空のまま＝
 *   チェックが 発火せず 画面は「問題なし」に見える＝★客に「上限は大丈夫」と 誤って 伝わる★。
 *   直し＝兄弟 loadBonusYtd と 同形で catch に `_otHistErr=true`＋再描画、入力画面の警告帯に otHistErrWarn()
 *   が「過去の残業時間の履歴を読めませんでした（…このまま保存・計算はできます）」を出す（赤で止めない）。
 * ★この歯が 見る事★… 本物の app.js を jsdom に読み、Store.getPayslipsByYm を reject→入力画面に移る→
 *   ①警告が出る＋_otHistErr=true ②次に resolve で読み直す→警告が消える＋_otHistErr=false。
 * ★わざと戻すと赤★… catch を空(旧)に戻すと ①の警告が出ず 赤＝load-bearing。
 * 依存: jsdom。使い方: node kyuyo/tests/othist-warn.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let JSDOM;
try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません（SKIPを緑と呼ばない）。npm install してください。'); process.exit(1); }

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1].replace(/\?.*$/, ''))
  .filter((s) => !/^https?:/.test(s) && !/supabase|supa-config|auth/.test(s));
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
const win = dom.window, doc = win.document;
win.fetch = () => Promise.reject(new Error('no net'));
win.print = () => {};
for (const src of srcs) { const el = doc.createElement('script'); el.textContent = fs.readFileSync(path.join(ROOT, src), 'utf8'); doc.body.appendChild(el); }

let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };
const sleep = (ms) => new Promise((r) => win.setTimeout(r, ms));

const A = win.__PAYSLIP_TEST;
if (!A) { console.log('✗ ★__PAYSLIP_TEST が 取れない★'); process.exit(1); }

/* ★Store.getPayslipsByYm を 試験が 握る（reject/resolve 切替）★ */
let mode = 'reject';
win.Store = {
  getPayslipsByYm: function () { return mode === 'reject' ? Promise.reject(new Error('わざと失敗')) : Promise.resolve([]); },
};

/* サンプル：当月に 在籍する 1名 */
A.state.company.name = '株式会社テスト';
A.state.employees = [A.defEmp('山田 太郎')];
A.state.employees[0].base = '300000';
A.state.month = '2026-06';

const inputText = () => {
  const s = doc.querySelector('#scr-input');
  return s ? (s.textContent || '') : '';
};
async function gotoInput() {
  A.state._otHistYm = null;   /* 月ガードを外して 必ず読み直させる */
  const b = doc.querySelector('.bn[data-scr="scr-input"]');
  if (b) b.dispatchEvent(new win.Event('click', { bubbles: true }));
  for (let k = 0; k < 40; k++) { await sleep(5); if (A.state._otHistErr === true || A.state._otHistErr === false && mode === 'resolve') break; }
  await sleep(20);
}

console.log('\n[othist-warn] 過去の残業履歴が 読めない時 36協定チェックを 黙らせない');

/* ① 読めない（reject）＝警告が出る＋_otHistErr=true */
mode = 'reject';
await gotoInput();
T('① 履歴が読めないと _otHistErr=true', A.state._otHistErr === true, '_otHistErr=' + A.state._otHistErr);
T('① ★「読めませんでした」の警告が 画面に出る（黙らせない）★', /過去の残業時間の履歴.*読めませんでした|読めませんでした（36協定/.test(inputText().replace(/\s+/g, '')) || inputText().indexOf('読めませんでした') >= 0, 'warn? ' + (inputText().indexOf('読めませんでした') >= 0));

/* ② 読み直す（resolve）＝警告が消える＋_otHistErr=false */
mode = 'resolve';
await gotoInput();
T('② 読み直せたら _otHistErr=false', A.state._otHistErr === false, '_otHistErr=' + A.state._otHistErr);
T('② 読み直せたら 警告が消える', inputText().indexOf('過去の残業時間の履歴') < 0, 'まだ出ている');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('KEKKA {"passed":' + pass + ',"failed":' + fail + ',"mimiso":0}');
process.exit(fail ? 1 : 0);
