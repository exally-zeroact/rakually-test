/* ops-app-parity.test.mjs — ★「本当に契約経由に置き換えられるか」を先に証明する★
 *
 * なぜ必要か:
 *   契約v0で #b-xlsx（給与明細のExcel出力）を オペ経由へ差し替える。
 *   差し替えて客に渡るファイルが1セルでも変わったら事故なので、
 *   ★今の app.js の道（buildPeople → PayslipXlsx.download の中身）と
 *     オペの道（op.engine(inputs).cells）が【完全一致】することを先に測る。★
 *   （ops-golden-parity は「移設前に凍結したゴールデン」との比較。こちらは【今の app.js】との比較で、別物）
 *
 *   ★これが緑でないなら差し替えてはいけない。だから実装より先に置く。
 *
 * 使い方: node tests/ops-app-parity.test.mjs   （jsdom未導入ならSKIPせず赤＝SKIPを緑と呼ばない）
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const require_ = createRequire(path.join(ROOT, 'package.json'));
const op = require_(path.join(ROOT, 'ops/payroll.monthly.js'));
const input = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/payroll-input.json'), 'utf8'));

let JSDOM;
try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません。この比較は飛ばせません（SKIPを緑と呼ばない）。npm install してください。'); process.exit(1); }

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
function deep(a, b, where) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) return;
  // どこが最初に違うかを出す（大きいAOAでも読めるように）
  let i = 0; while (i < A.length && i < B.length && A[i] === B[i]) i++;
  throw new Error(where + ' が不一致\n    app側: …' + A.slice(Math.max(0, i - 60), i + 90)
    + '\n    op側 : …' + B.slice(Math.max(0, i - 60), i + 90));
}

/* 本物の index.html + 全lib + js/app.js を jsdom に読む（integration.mjs と同じ作り＝ログイン無しローカルモード） */
function loadApp() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1].replace(/\?.*$/, ''))
    .filter(s => !/^https?:/.test(s) && !/supabase|supa-config|auth/.test(s));
  const domHtml = html.replace(/<script[\s\S]*?<\/script>/g, '');
  const dom = new JSDOM(domHtml, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
  const win = dom.window;
  win.fetch = () => Promise.reject(new Error('no network in test'));
  for (const src of srcs) {
    const el = win.document.createElement('script');
    el.textContent = fs.readFileSync(path.join(ROOT, src), 'utf8');
    win.document.body.appendChild(el);
  }
  if (!win.__PAYSLIP_TEST) throw new Error('app.js の初期化に失敗（__PAYSLIP_TEST が無い）');
  return win;
}

const win = loadApp();
const A = win.__PAYSLIP_TEST;
const Xlsx = win.PayslipXlsx;

console.log('\n[ops-app-parity] 今の app.js の道と オペの道が同じ物を作るか');

let sheetsChecked = 0;
for (const ds of input.datasets) {
  T(`[${ds.id}] app.js(buildPeople) と op(cells) が完全一致`, () => {
    // ① app.js 側：画面と同じ状態にしてから buildPeople
    A.state.company = JSON.parse(JSON.stringify(ds.company));
    A.state.month = ds.month;
    A.state.employees = ds.employees.map(e => A.mergeEmp(JSON.parse(JSON.stringify(e))));
    const emps = A.state.employees;
    const people = A.buildPeople(emps);

    // ② オペ側
    const res = op.engine({ month: ds.month, company: ds.company, employees: ds.employees, otHistory: ds.otHistory || {} });
    if (res.errors && res.errors.length) throw new Error('オペが検証で弾いた: ' + JSON.stringify(res.errors.slice(0, 3)));

    // ③ 人ごとの中身（明細の元）
    deep(people, res.cells._people, `${ds.id} people`);

    // ④ ★実際にExcelへ書かれるセル（PayslipXlsx.download が内部でやるのと同じ組み立て）
    const opts = res.cells._opts;
    const used = {};
    const appSheets = [Object.assign({ name: '集計' }, Xlsx.shukeiAOA(people, opts))]
      .concat(people.map(p => Object.assign({ name: Xlsx.sheetName(p.name, used) }, Xlsx.meishiAOA(p, opts))));
    if (appSheets.length !== res.cells.sheets.length) throw new Error(`シート数 app=${appSheets.length} op=${res.cells.sheets.length}`);
    appSheets.forEach((s, i) => {
      const o = res.cells.sheets[i];
      if (s.name !== o.name) throw new Error(`シート名#${i} app=${s.name} op=${o.name}`);
      deep({ aoa: s.aoa, cols: s.cols, merges: s.merges }, { aoa: o.aoa, cols: o.cols, merges: o.merges }, `${ds.id} シート「${s.name}」`);
      sheetsChecked++;
    });
  });
}

T('比較が空振りしていない（実際にシートを比べている）', () => {
  if (sheetsChecked < 20) throw new Error('比べたシートが少なすぎます: ' + sheetsChecked);
});

console.log('\n── 実測 ──');
console.log('  データセット ' + input.datasets.length + '件 / 比べたシート ' + sheetsChecked + '枚');
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
