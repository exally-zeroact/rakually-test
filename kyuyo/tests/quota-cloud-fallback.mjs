/* quota-cloud-fallback.mjs — ★localStorage 枠超(容量オーバー)でも、フル中身をクラウドへ退避し・全画面の帯で警告する安全網を固定★
 * =============================================================================
 * ★守る事（Phase5=IndexedDB の代わりに選んだ、より小さい一歩・2026-10-08）★
 *   Rakunally の想定規模(小規模事業者・30人=約110KB)では localStorage 枠超(約5MB)はほぼ起きず、
 *   iOS の7日 eviction は IndexedDB にも効く(=IDB は耐久を足さない・足すのは容量だけ)＝フルIDBは過剰。
 *   その代わり、今ある安全網＝persistSave(app.js 6652-)の
 *     ①localStorage.setItem が枠超で throw しても catch で lsOk=false にするだけで、
 *     ②snap(フル中身)を lsOk と無関係に Store.cloudSaveState(snap) でクラウドへ送り、
 *     ③全画面で見える帯 #save-alert に「⚠ 保存できません（空き容量）」を出す
 *   を歯で固定する。将来 `return` 一つ・`&&lsOk` 一つで黙って壊れても赤で気づけるように。
 *   ★app.js の判定・金額・計算は1文字も変えない★（test-only＝__PAYSLIP_TEST に persistSave を1行露出しただけ）。
 * ★この歯★… 本物の app.js を jsdom に読み、Storage.prototype.setItem を throw に差し替え(=枠超を再現)、
 *   Store.cloudSaveState を「渡された snap を捕らえて {ok:true} を resolve」に差し替え、A.persistSave() を await する。
 *     ① 枠超でも cloudSaveState が呼ばれた(capturedSnap!==null)
 *     ② 送られた snap がフル中身(employees.length 一致・base 金額が残る＝縮めて送っていない)
 *     ③ #save-alert が出る(hidden===false かつ textContent に「空き容量」)
 *     ④ lsOk=false なら #save-status が「自動保存済」になっていない(嘘の保存済を出さない)
 *   ★前提の自己検証★… jsdom が将来変わって setItem が無言で throw しなくなると ③④ が vacuously-true で
 *     偽の緑になる(一番見つけにくい飾りの歯)ので、冒頭で「直接 setItem が本当に throw するか」を assert する
 *     (taiketsu 2026-10-08 実測＝instanceへの代入では throw せず Proxy に化ける。Storage.prototype を差し替えよ)。
 * ★わざと(--waza)★… fs-replace で app.js の `if(window.Store&&Store.cloudSaveState){` →
 *   `if(window.Store&&Store.cloudSaveState&&lsOk){`(＝枠超でクラウド退避を止める旧退化を注入)。
 *   通常実行では①が崩れて赤。--waza では「capturedSnap===null を再現できる＝歯が新旧を見分ける」を✓で通す
 *   (paycycle-pinned/bonus-nolib-block と同型の裏返し検証)。anchor がずれれば --waza が赤。
 * ★この歯で守れない穴(正直に)★…
 *   ・③(帯が出る)は kyuyo/tests/hozon-fuda-ui.mjs(WebKit)と重なる(あちらはネット失敗の道)。本歯の主眼は①②④(枠超の道)。
 *   ・★未ログイン＋枠超は対象外★… stub は {ok:true}＝ログイン済でクラウド成功した場合だけを演じる。
 *     未ログインだと cloudSaveState は {ok:false,reason:'no-user'} でクラウドにも書かず、reload で消失する(warn only・消失は残る)。
 *     ＝本歯は「枠超でも警告は出す・クラウド退避は試みる」を守るだけで、データ消失そのものは防がない。
 * 依存: jsdom。使い方: node kyuyo/tests/quota-cloud-fallback.mjs   ／   --waza
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WAZA = process.argv.includes('--waza');
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
for (const src of srcs) {
  let code = fs.readFileSync(path.join(ROOT, src), 'utf8');
  if (WAZA && src.indexOf('app.js') >= 0) {
    /* ★旧退化を注入＝枠超(lsOk=false)でクラウド退避を止める★ */
    code = code.replace('if(window.Store&&Store.cloudSaveState){', 'if(window.Store&&Store.cloudSaveState&&lsOk){');
  }
  const el = doc.createElement('script'); el.textContent = code; doc.body.appendChild(el);
}

let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };

const A = win.__PAYSLIP_TEST;
if (!A || !A.persistSave || !A.state || !A.defEmp) { console.log('✗ ★persistSave/state/defEmp が 取れない（__PAYSLIP_TEST に persistSave を足したか）★'); process.exit(1); }

console.log('\n[quota-cloud-fallback] localStorage 枠超でも フル中身をクラウドへ退避し 全画面の帯で警告する' + (WAZA ? '  ★★旧退化(＆＆lsOk)を注入した回★★' : ''));

/* ★前提の自己検証★＝直接 setItem が本当に throw するか。throw しなければ ③④ が vacuously-true で偽の緑になるので即赤。 */
let throws = false;
win.Storage.prototype.setItem = function () { throw new Error('QuotaExceededError (test)'); };
try { win.localStorage.setItem('__probe__', 'x'); } catch (e) { throws = true; }
T('⓪ ★前提: Storage.prototype.setItem 差し替えで localStorage.setItem が本当に throw する（飾りの歯でない証し）★', throws, 'throw しない＝jsdom が変わった／instance代入になっている');
if (!throws) { console.log('\n' + pass + ' passed, ' + fail + ' failed'); console.log('KEKKA {"passed":' + pass + ',"failed":' + fail + ',"mimiso":0}'); process.exit(1); }

/* 在籍1名・base に非空の金額（②を意味あるものにする＝空の存在チェックだけにしない） */
const e1 = Object.assign(A.defEmp('退避 太郎'), { id: 'q1', base: '300000', pref: '東京都' });
A.state.company = A.state.company || {}; A.state.company.name = '株式会社テスト';
A.state.employees = [e1];
A.state.month = '2026-10';

/* Store を差し替え＝cloudSaveState は snap を捕らえて {ok:true}（★必ず ok:true。ok:false だと 6723 が帯を『⚠クラウド未保存』で上書きし③が割れる）。
   setSnapshotFn は app.js 起動時に呼ばれ得るので no-op で用意。 */
let capturedSnap = null, cloudCalls = 0;
win.Store = {
  cloudSaveState: function (snap) { cloudCalls++; capturedSnap = snap; return Promise.resolve({ ok: true }); },
  setSnapshotFn: function () {},
};

/* ★await 必須★＝cloudSaveState は Promise.resolve().then(...) のマイクロタスク内で呼ばれる（app.js 6673）。
   persistSave() 直後は capturedSnap はまだ null。返り Promise を await すると then 鎖(setS で #save-alert/#save-status を同期更新)の後に settle する。 */
const r = await A.persistSave();

if (!WAZA) {
  T('① ★枠超でも cloudSaveState が呼ばれた（フル中身をクラウドへ退避）★', cloudCalls >= 1 && capturedSnap !== null, 'cloudCalls=' + cloudCalls);
  T('② ★送られた snap がフル中身（従業員数一致・base 金額が残る＝縮めて送っていない）★',
    !!capturedSnap && Array.isArray(capturedSnap.employees) && capturedSnap.employees.length === 1 && capturedSnap.employees[0].base === '300000',
    JSON.stringify(capturedSnap ? { len: (capturedSnap.employees || []).length, base: (capturedSnap.employees || [])[0] && capturedSnap.employees[0].base } : null));
} else {
  /* --waza＝旧退化を注入＝枠超でクラウド退避が止まる（capturedSnap===null を再現できる＝歯が新旧を見分ける） */
  T('① ★--waza: 旧退化(＆＆lsOk)だと 枠超でクラウド退避が止まる（cloudCalls=0・capturedSnap===null）★', cloudCalls === 0 && capturedSnap === null, 'cloudCalls=' + cloudCalls);
}

/* ③④ は fix/waza 共通＝枠超なので帯は出て「自動保存済」にはならない（警告の道は lsOk で決まり、クラウド退避の有無に依らない）。 */
const alertEl = doc.getElementById('save-alert');
const statusEl = doc.getElementById('save-status');
T('③ ★全画面の帯 #save-alert が出て「空き容量」警告（hidden===false・textContent に「空き容量」）★',
  !!alertEl && alertEl.hidden === false && alertEl.textContent.indexOf('空き容量') >= 0,
  JSON.stringify(alertEl ? { hidden: alertEl.hidden, txt: alertEl.textContent } : null) + '  ※③は hozon-fuda-ui と重複・本歯の主眼は①②④');
T('④ ★枠超なので #save-status が「自動保存済」になっていない（嘘の保存済を出さない）★',
  !statusEl || statusEl.textContent.indexOf('自動保存済') < 0,
  JSON.stringify(statusEl ? { txt: statusEl.textContent } : 'no #save-status'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('KEKKA {"passed":' + pass + ',"failed":' + fail + ',"mimiso":0}');
process.exit(fail ? 1 : 0);
