/* kintai-csv-money.mjs — ★勤怠CSVの「時間外60時間超」が 本当に 法定50%割増として払われるか★
 * =============================================================================
 * なぜ要るか（指示役の宿題 2026-08-23）:
 *   受け口に「時間外60時間超」の置き場が無く、★普通の残業（25%）として入っていた★。
 *   ＝★法定50%割増が付かない＝払い足りない★。
 *   ★中の値どうしで確かめない★＝本物のエンジンに通して ★お金の差★ を出す。
 *
 * 使い方: node kyuyo/tests/kintai-csv-money.mjs
 *         node kyuyo/tests/kintai-csv-money.mjs --self-test
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

const SELF = process.argv.includes('--self-test');
let pass = 0, fail = 0;
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + 'ほしい ' + b + ' / 出た ' + a); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = async (n, f) => { try { await f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const yen = (n) => '¥' + Number(n).toLocaleString('ja-JP');

const INDEX = path.join(ROOT, 'kyuyo/index.html');
const html = fs.readFileSync(INDEX, 'utf8');

async function boot() {
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/kyuyo/index.html',
  });
  const win = dom.window, doc = win.document;
  win.fetch = () => Promise.reject(new Error('no net'));
  win.alert = () => {}; win.confirm = () => true; win.scrollTo = () => {}; win.print = () => {};
  for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
    const src = m[1].split('?')[0];
    const base = src.split('/').pop();
    if (/^https?:/.test(src) || ['supa-config.js', 'auth.js', 'env-badge.js', 'rakually-login.js'].includes(base)) continue;
    const p = path.resolve(path.dirname(INDEX), src);
    if (!fs.existsSync(p)) continue;
    const el = doc.createElement('script');
    el.textContent = fs.readFileSync(p, 'utf8');
    doc.body.appendChild(el);
  }
  await sleep(400);
  const A = win.__PAYSLIP_TEST;
  ok(A, 'app.js が動いていない');
  return { win, doc, A };
}

/* ★同じ人・同じ月給・同じ総残業時間★で、55時間の入れ方だけ変えて お金を比べる */
function makeEmp(A) {
  const e = A.defEmp('山田 太郎');
  e.payType = '月給'; e.base = '300000';
  if (e.shikyu && e.shikyu[0]) e.shikyu[0].value = '300000';
  e.pref = 'ehime';
  return e;
}
const CSV_60 = '氏名,時間外,時間外60時間超\n山田 太郎,45:00,10:00\n';
const CSV_ALL_OT = '氏名,時間外\n山田 太郎,55:00\n';

async function run(label) {
  console.log('\n[' + label + '] ★押す物の一覧（先に書く）★');
  console.log('  ① CSVを取り込む（60超あり） ② 置き場に入ったか ③ お金が増えるか ④ くわしくに切り替わるか');

  const K = require_(path.join(ROOT, 'kyuyo/lib/kintai-csv.js'));

  await T('① ★CSVの「時間外60時間超」が over60 に入る★', async () => {
    const r = K.parse(CSV_60);
    eq(r.rows[0].otMin, 2700); eq(r.rows[0].over60Min, 600);
  });

  let with60 = 0, allOt = 0;
  await T('② ★取り込むと「くわしく」に入り、60超が over60 の欄に載る★', async () => {
    const { A } = await boot();
    const e = makeEmp(A);
    A.state.company = A.defCompany(); A.state.company.pref = 'ehime';
    A.state.month = '2026-08'; A.state.employees = [e];
    A.applyKintaiRows(K.parse(CSV_60).rows);
    eq(e.warimashi.mode, 'detail', '★かんたんのままだと 60超の置き場が無い★');
    eq(e.warimashi.detail.over60.h, '10');
    eq(e.warimashi.detail.ot.h, '45');
    with60 = A.compute(e).shikyuTotal;
  });

  await T('③ ★55時間を全部「普通の残業」にした時より 総支給が多い★（法定50%が付いている）', async () => {
    const { A } = await boot();
    const e = makeEmp(A);
    A.state.company = A.defCompany(); A.state.company.pref = 'ehime';
    A.state.month = '2026-08'; A.state.employees = [e];
    A.applyKintaiRows(K.parse(CSV_ALL_OT).rows);
    eq(e.warimashi.mode, 'easy');
    allOt = A.compute(e).shikyuTotal;
    console.log('      60超あり ' + yen(with60) + ' ／ 全部ふつうの残業 ' + yen(allOt)
      + ' ／ ★差 ' + yen(with60 - allOt) + '★');
    ok(with60 > allOt, '★60時間超なのに 総支給が増えない＝法定50%が付いていない★');
  });

  await T('④ ★差が「10時間ぶんの 25%上乗せ」と合う★（中の値でなく 出た金額で見る）', async () => {
    /* 60時間超は 25%→50%＝★+25%ぶん★だけ増える。1時間あたり＝月給÷所定月平均時間。 */
    ok(with60 - allOt > 0, '差が0');
    const perH = (with60 - allOt) / 10 / 0.25;   // 1時間あたりの単価に戻す
    console.log('      差から戻した 1時間あたり ≒ ' + yen(Math.round(perH)));
    ok(perH > 1000 && perH < 3000, '★1時間あたりが 月給30万の人として おかしい（' + Math.round(perH) + '円）★');
  });
}

if (!SELF) {
  await run('本物の app.js');
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
} else {
  /* ★わざと壊す★ … 60超の置き場を無くす（＝直す前の姿）と 赤になるか */
  console.log('\n★自己診断★ … 「60時間超」を 普通の残業に混ぜる姿へ戻して 赤が出るかを見る');
  const p = path.join(ROOT, 'kyuyo/lib/kintai-csv.js');
  const keep = fs.readFileSync(p, 'utf8');
  const mark = "    if (/60\\s*(時間|h|H)?\\s*(超|以上|超過)|時間外60|残業60/.test(s)) return 'over60'; // ★時間外より先★\n";
  if (keep.indexOf(mark) < 0) { console.log('  ★壊す場所が見つからない＝この自己診断は古い★'); process.exit(2); }
  try {
    fs.writeFileSync(p, keep.replace(mark, ''));
    await run('60超の置き場を消した app.js（わざと壊した）');
  } finally { fs.writeFileSync(p, keep); }
  console.log('\n  わざと壊した時に 赤になった数 … ' + fail + '件（①②が赤になるはず＝2件以上）');
  if (fail < 2) { console.log('  ✗ ★空振りです★ 壊しても赤にならない'); process.exit(1); }
  console.log('  ✓ ★壊したら赤になった＝この試験は本当に見張っています★');
  process.exit(0);
}
