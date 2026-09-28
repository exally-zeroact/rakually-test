/* slip-doji.test.mjs — ★明細の 保存を ★同時 何本まで★ に して いるか★
 * =============================================================================
 * ★なぜ 要るか（2026-09-28 実測）★
 *   WebKit run `36355182975` で こう 出ました:
 *     ・★同時に 飛んで いた 最大 ★299本★★（その 前の 回は 45本）
 *     ・★保存(POST)の 失敗 276本＝全部「Load request cancelled」★
 *     ・★送ってから 失敗まで ★25,952〜36,411ms★★
 *   ⇒ Supabase は HTTP/2＝★同時に 流せる 数に 上限が 在り、超えた 分は
 *     ブラウザが 並べて 待たせます★（★客の 電話なら もっと 細い★）
 *   ⇒ ★★客が 26〜36秒 待たずに 画面を 閉じたら ★その 保存は 切られる★★★
 *   ⇒ ★★＝客に「○名分を保存できませんでした（台帳・年末調整に入っていません）」が 出る★★
 *      （`app.js` の `saveFailed` が 自分で 数えて 出して います）
 *
 * ★この 紙が 見る 事★
 *   ①★同時に 飛んだ 最大が 上限を 超えない★（★超えたら 赤★）
 *   ②★人数より 上限が 小さい 時 ★待たせた 本数★ が 出る★（＝★働いた 証し★）
 *   ③★全員 送り終わる★（★上限を 付けて 1人も 落とさない★）
 *   ④★上限を 変えたら 最大も 変わる★（＝★上限が 効いて いる★）
 *   ⑤★約束を 返す★（＝★『いつ 全部 届いたか』が 掴める★／★後の 直しが これに 乗ります★）
 *
 * ★★上限の 数（今 5）は ★まだ 測って いません★★
 *   ＝★指示役1 と 決めた やり方＝★2・4・6・8 で 走らせて
 *     『同時に 飛んだ 最大』『閉じる 前の 失敗』『1人分が 終わるまでの 秒』を 並べて から 決める★★
 *   ⇒ ★この 紙は ★『上限が 効いて いる』だけ★ を 見ます（★数の 良し悪しは 見ません★）
 *
 * ★★遅さ（40ms）も ★測って いない 数★です★★＝★字に 残します★
 *   ＝★但し ★0ms でも 同じ 判じに なる★事を ⑥で 見ます（★数の 大小に 寄らない★）
 *
 * 使い方: node kyuyo/tests/slip-doji.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

let JSDOM;
try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdom が 入って いません。この 検証は 飛ばせません（SKIP を 緑と 呼ばない）。npm install して ください。'); process.exit(1); }

let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };

/* ── 本物の アプリを jsdom に 読み込む（`naoshitara-todoku` と 同じ 形）── */
function loadApp() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1].replace(/\?.*$/, ''))
    .filter((s) => !/^https?:/.test(s) && !/supabase|supa-config|auth/.test(s));
  const domHtml = html.replace(/<script[\s\S]*?<\/script>/g, '');
  const dom = new JSDOM(domHtml, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
  const win = dom.window;
  win.fetch = () => Promise.reject(new Error('no network in test'));
  for (const src of srcs) {
    const el = win.document.createElement('script');
    el.textContent = fs.readFileSync(path.join(ROOT, src), 'utf8');
    win.document.body.appendChild(el);
  }
  if (!win.__PAYSLIP_TEST) { console.log('  ✗ ★__PAYSLIP_TEST が 出て いません（app.js の init が 失敗）★'); process.exit(1); }
  return win;
}

const win = loadApp();
const A = win.__PAYSLIP_TEST;

console.log('\n[slip-doji] ★明細の 保存を 同時 何本まで に して いるか★');

if (typeof win.PayslipDojiNoKazu !== 'function' || typeof win.PayslipDojiUeSet !== 'function') {
  console.log('  ✗ ★★`PayslipDojiNoKazu` / `PayslipDojiUeSet` の 口が 画面に 在りません★★'
    + '（★上限の 直しが 届いて いません＝この 紙は 何も 見られません★）');
  process.exit(1);
}

/* ★★偽物の 倉庫★★＝★遅い（本物と 同じ 形）★／★同時に 何本 飛んで いたかを 自分で 数える★
   ★`okureMs`＝0 でも 試す★（★数の 大小に 寄らない 事を 見る★） */
function souko(win2, okureMs) {
  const kiroku = [];
  let ima = 0, saidai = 0;
  win2.Store = win2.Store || {};
  win2.Store.savePayslip = function (ym, id) {
    kiroku.push(id);
    ima++; if (ima > saidai) saidai = ima;
    return new Promise((r) => setTimeout(() => { ima--; r({ ok: true }); }, okureMs));
  };
  win2.Store.publishMeisai = function () { return Promise.resolve({ ok: true }); };
  return { kiroku, mita: () => ({ saidai }) };
}

/* ★人を N人 置く★（★全員 未確定＝全員 書かれる★） */
function shitaku(nin, tsuki) {
  const st = A.state;
  const emps = [];
  for (let i = 1; i <= nin; i++) {
    const e = A.defEmp('人' + i); e.id = 'p' + i; e.payType = '月給'; e.base = '250000';
    emps.push(e);
  }
  st.employees = emps; st.month = tsuki; st.confirmed = {}; st._naoshita = {};
  return st;
}

/* ── ①②③⑤ 上限 5・人 30人 ───────────────────────────── */
{
  const NIN = 30, UE = 5, OKURE = 40;   /* ★40ms は 測って いない 数★（⑥で 0ms も 見る） */
  const s = souko(win, OKURE);
  shitaku(NIN, '2026-04');
  win.PayslipDojiUeSet(UE);
  const p = A.saveMonthlyPayslips(false);
  T('⑤ ★`saveMonthlyPayslips` が 約束を 返す★（★後の 直しが これに 乗ります★）',
    !!(p && typeof p.then === 'function'), '返り … ' + Object.prototype.toString.call(p));
  await (p && p.then ? p : Promise.resolve());
  const k = win.PayslipDojiNoKazu();
  T('③ ★全員 送った（' + NIN + '人）★', s.kiroku.length === NIN, '送った … ' + s.kiroku.length + '本');
  T('★★① 同時に 飛んだ 最大が 上限（' + UE + '）を 超えない★★',
    s.mita().saidai <= UE, '★最大 ' + s.mita().saidai + '本★（口の 数 ' + k.saidai + '）');
  T('★★② 待たせた 本数が 出る（' + (NIN - UE) + '本）★★',
    k.mataseta === NIN - UE, '待たせた … ' + k.mataseta + '本');
  T('★口の 最大と 自分で 数えた 最大が 合う★', k.saidai === s.mita().saidai,
    '口 ' + k.saidai + ' ／ 自分 ' + s.mita().saidai);
}

/* ── ④ 上限を 変えたら 最大も 変わる（＝★効いて いる★） ─────────── */
{
  const NIN = 30, UE = 2;
  const s = souko(win, 40);
  shitaku(NIN, '2026-05');
  win.PayslipDojiUeSet(UE);
  await A.saveMonthlyPayslips(false);
  T('★★④ 上限を ' + UE + ' に したら 最大も ' + UE + ' に なる★★',
    s.mita().saidai <= UE && s.mita().saidai > 0, '★最大 ' + s.mita().saidai + '本★');
  T('④ ★全員 送った★', s.kiroku.length === NIN, '送った … ' + s.kiroku.length + '本');
}

/* ── ⑥ 0ms でも 同じ 判じ（★数の 大小に 寄らない★） ─────────────── */
{
  const NIN = 30, UE = 5;
  const s = souko(win, 0);
  shitaku(NIN, '2026-06');
  win.PayslipDojiUeSet(UE);
  await A.saveMonthlyPayslips(false);
  T('★★⑥ 遅さ 0ms でも 上限を 超えない★★（★40ms という 数に 寄って いない★）',
    s.mita().saidai <= UE, '★最大 ' + s.mita().saidai + '本★');
  T('⑥ ★全員 送った★', s.kiroku.length === NIN, '送った … ' + s.kiroku.length + '本');
}

/* ── ⑦ 1人だけ 名指しでも 壊れない ───────────────────────── */
{
  const s = souko(win, 20);
  shitaku(10, '2026-07');
  win.PayslipDojiUeSet(5);
  await A.saveMonthlyPayslips(false, 'p3');
  T('⑦ ★1人だけ 名指し＝1本だけ 送る★', s.kiroku.length === 1 && s.kiroku[0] === 'p3',
    '送った … ' + s.kiroku.join(','));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
