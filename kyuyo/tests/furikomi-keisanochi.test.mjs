/* furikomi-keisanochi.test.mjs — ★計算が転んだ人を 振込から 黙って落とさない★（jsdom・ブラウザ無し・⑧a）
 * ============================================================================
 * ★守る事（2026-10-03・指示役と）★ … compute/computeBonus が 1人分 転ぶと、前は net=0 に なり
 *   呼ぶ側の `amount>0` 絞りで ★画面からも 全銀ファイルからも 黙って 消えて いた＝その人だけ 未払いで 銀行へ★。
 *   直し＝buildTransfers が 転んだ事を keisanOchi 旗で 持ち回り（ready から 外す）、呼ぶ側が 名指しで 知らせ、
 *   全銀/Excel を 出す前に uiConfirm で 1回 聞く。
 * ★この門が 見る事★ … compute を 1人だけ 投げさせ、buildTransfers の 返りで その人が keisanOchi=true・ready=false、
 *   他の人は keisanOchi=false。倉庫も 共有口も 触らない＝決定的。
 * ★空振り止め（--waza）★ … app.js の `catch(_){ keisanOchi=true; }` の 旗立てを 外して 配る
 *   ⇒ 転んでも 旗が 立たない＝門が 旗を 守っている 証し。
 * 使い方: node kyuyo/tests/furikomi-keisanochi.test.mjs   ／   --waza
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

const KESU_MAE = 'catch(_){ keisanOchi=true; }';   /* ★旗を 立てる所（--waza で 外す）★ */
const KESU_ATO = 'catch(_){ }';
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
if (!A || !A.buildTransfers || !A.defEmp || !A.state) { console.log('✗ ★app.js から buildTransfers／defEmp／state が 取れない★'); process.exit(1); }
if (!win.PayrollMonthly || typeof win.PayrollMonthly.compute !== 'function') { console.log('✗ ★PayrollMonthly.compute が 読めない★'); process.exit(1); }

console.log('\n[furikomi-keisanochi] 計算が転んだ人を 振込から 黙って落とさない' + (WAZA ? '  ★★旗立てを外した回★★' : ''));

/* ★compute を 1人だけ 投げさせる★（印の id の 時だけ throw・他は 本物） */
const orig = win.PayrollMonthly.compute;
win.PayrollMonthly.compute = function (e, ctx) { if (e && e.id === 'THROW') throw new Error('test: compute が転んだ'); return orig.call(win.PayrollMonthly, e, ctx); };

const mk = (id) => Object.assign(A.defEmp(), { id: id, name: id === 'THROW' ? '転んだ 太郎' : '普通 花子',
  furiBankNo: '0001', furiBranchNo: '001', furiAccount: '1234567', furiKana: 'ﾊﾅｺ' });
A.state.company = A.defCompany ? A.defCompany() : (A.state.company || {});
A.state.month = '2026-07';
A.state.employees = [mk('OK'), mk('THROW')];

const tr = A.buildTransfers('monthly');
const ok = tr.find((t) => t.emp.id === 'OK');
const th = tr.find((t) => t.emp.id === 'THROW');

T('両方 一覧に 居る（黙って 消えない）', !!ok && !!th, '一覧 ' + tr.length + '件');
if (!WAZA) {
  T('★転んだ人に keisanOchi 旗が 立つ★', !!th && th.keisanOchi === true, 'th=' + JSON.stringify(th && { ko: th.keisanOchi, ready: th.ready, amount: th.amount }));
  T('★転んだ人は ready で ない（ファイルに 入れない）★', !!th && th.ready === false);
  T('普通の人は keisanOchi が 立たない', !!ok && !ok.keisanOchi);
  /* ★司さん 2026-10-04＝計算できない人が 1人でも 居たら ★ファイルを 作らない（止める）★★
     ＝furiKeisanOchiKaku は onOk を 呼ばない（前は「除いて 確かめを 聞く」＝押し流すと 足りない ファイルが 銀行へ）。 */
  if (A.furiKeisanOchiKaku) {
    let dashita = false;
    A.furiKeisanOchiKaku('monthly', function () { dashita = true; });
    T('★計算できない人が 居ると 振込ファイルは 作られない（onOk が 呼ばれない＝止める）★', dashita === false,
      '止まっていない＝onOk が 呼ばれた（足りないファイルが 出る）');
  }
} else {
  T('★わざ置換が効いた（旗立てを外した）★', kesita === 1, '外せた箇所=' + kesita);
  T('★--waza: 旗立てを外すと 転んでも keisanOchi が 立たない（門が旗を守る証し）★', !!th && !th.keisanOchi,
    '外したのに 旗が 立った');
  /* 旗が 立たない＝ko 0＝furiKeisanOchiKaku は 通す（onOk 呼ぶ）＝止まらない＝旗が 止めの 源の 証し */
  if (A.furiKeisanOchiKaku) {
    let dashita2 = false;
    A.furiKeisanOchiKaku('monthly', function () { dashita2 = true; });
    T('★--waza: 旗が 立たないと 止まらない（onOk が 呼ばれる）＝止めは 旗に 繋がっている証し★', dashita2 === true,
      '旗が無いのに 止まった');
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('KEKKA {"passed":' + pass + ',"failed":' + fail + ',"mimiso":0}');
process.exit(fail ? 1 : 0);
