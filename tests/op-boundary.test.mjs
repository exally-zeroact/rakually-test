/* op-boundary.test.mjs — ★契約の線を機械で守る★
 *
 * 契約v0（docs/SPEC_engine_grid_contract_v0.md）の「守り方1〜4」と、
 * 指示役が足した完了条件⑤⑧をここで見る。言うだけでは守られないので、CIで止める。
 *
 *  守り方1 面に法定の数値を書かせない … tests/no-hardcoded-statutory.test.mjs（既存を流用）
 *                                        ★ここでは「その目がまだ生きていて、CIで回っているか」を見る
 *  守り方2 オペのtestsが実際にCIで回っているか（嘘のゲートを許さない）
 *  守り方3 同じ計算を2箇所に生やさない … tests/no-duplicate-libs.test.mjs（既存を流用・同上）
 *  守り方4 provenance を返さない engine を契約が受け付けない
 *  ⑤ ★呼ばれていない契約を「有る」と言わない
 *     ops配下・testsの外から、各オペが最低1箇所 実際に呼ばれていること
 *  ⑧ ★オペの中から画面側を呼び返さない
 *     ops/ から ../js/ や DOM への参照 = 0件。
 *     （呼び返すと「新旧AOA一致」は同じ物を2回呼ぶだけで必ず通り、契約を1ミリも証明しない）
 *
 * 使い方: node tests/op-boundary.test.mjs
 *         node tests/op-boundary.test.mjs --self-test
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };

/* ══ 判定の中身（純関数＝self-testで作り物を通せる） ═══════════════════ */

/* ⑧ オペが面(画面側)を呼び返していないか。
   ・require/import は ../lib/ だけ許す（../js/ や ../../ は赤）
   ・DOM・保存・通信・UIの物に触っていたら赤（headlessでなくなる＝グリッドやサーバから呼べない） */
const FORBIDDEN_TOKENS = ['document.', 'localStorage', 'sessionStorage', 'fetch(', 'alert(', 'XLSX.writeFile', 'window.__PAYSLIP_TEST'];
export function findUiLeaks(files) {
  const bad = [];
  for (const [rel, srcRaw] of Object.entries(files)) {
    const src = stripComments(srcRaw);
    const RE = /(?:require|import)\s*\(\s*(['"])([^'"\n]+)\1/g;
    let m;
    while ((m = RE.exec(src))) {
      const spec = m[2];
      if (spec[0] !== '.') continue;
      if (!/^\.\.\/lib\//.test(spec) && !/^\.\//.test(spec)) bad.push({ file: rel, what: 'require ' + spec, why: 'オペが読んでよいのは ../lib/ だけ' });
    }
    for (const tk of FORBIDDEN_TOKENS) {
      if (src.indexOf(tk) >= 0) bad.push({ file: rel, what: tk, why: 'オペは画面・保存・通信に触らない（headless）' });
    }
  }
  return bad;
}

/* ⑤ そのオペを、ops配下でもテストでもない所から誰かが呼んでいるか */
export function findUncalled(opNames, files) {
  const out = [];
  for (const name of opNames) {
    const callers = Object.keys(files).filter(rel => {
      if (rel.indexOf('/ops/') >= 0 || rel.indexOf('ops/') === 0) return false;
      if (rel.indexOf('/tests/') >= 0 || rel.indexOf('tests/') === 0) return false;
      return stripComments(files[rel]).indexOf(name) >= 0;
    });
    if (!callers.length) out.push(name);
  }
  return out;
}

/* コメントを落とす（文字列は残す）。refs-resolve と同じ考え方・後読みは使わない。 */
export function stripComments(src) {
  let out = '', i = 0, prev = '';
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (ch === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (ch === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; out += ' '; continue; }
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch; out += ch; i++;
      while (i < n) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] || ''); i += 2; continue; }
        out += src[i]; if (src[i] === q) { i++; break; } i++;
      }
      prev = q; continue;
    }
    if (ch === '/' && (prev === '' || '(,=:[!&|?{};+-*%~^'.indexOf(prev) >= 0)) {
      i++; let cls = false;
      while (i < n) {
        const c = src[i];
        if (c === '\\') { i += 2; continue; }
        if (c === '[') cls = true; else if (c === ']') cls = false;
        else if (c === '/' && !cls) { i++; break; }
        else if (c === '\n') break;
        i++;
      }
      out += ' '; prev = '/'; continue;
    }
    out += ch;
    if (!/\s/.test(ch)) prev = ch;
    i++;
  }
  return out;
}

/* ══ self-test ═══════════════════════════════════════════════════════ */
if (process.argv.includes('--self-test')) {
  console.log('\n[op-boundary --self-test] わざと壊して赤になるか');
  /* ★作り物のソースは組み立てて作る。ここに require('...') とそのまま書くと、
     refs-resolve(参照ガード)がこのファイルを走査した時に「実在しない参照」として拾ってしまう。 */
  const Q = "'";
  const REQ = (spec) => 'var a=require(' + Q + spec + Q + ');';

  T('⑧ オペが ../js/ を読んでいたら赤', () => {
    const bad = findUiLeaks({ 'kyuyo/ops/x.js': REQ('../js/app.js') });
    if (bad.length !== 1) throw new Error('赤になっていない: ' + JSON.stringify(bad));
  });
  T('⑧ ../lib/ なら緑', () => {
    const bad = findUiLeaks({ 'kyuyo/ops/x.js': REQ('../lib/calc.js') });
    if (bad.length) throw new Error('誤検知: ' + JSON.stringify(bad));
  });
  T('⑧ オペが document に触っていたら赤', () => {
    const bad = findUiLeaks({ 'kyuyo/ops/x.js': 'var e=document.getElementById("a");' });
    if (bad.length !== 1) throw new Error('赤になっていない');
  });
  T('⑧ コメントの中の document は数えない（誤検知を出さない）', () => {
    const bad = findUiLeaks({ 'kyuyo/ops/x.js': '// document.getElementById は使わない\nvar a=1;' });
    if (bad.length) throw new Error('誤検知: ' + JSON.stringify(bad));
  });
  T('⑤ 誰も呼んでいなければ赤', () => {
    const un = findUncalled(['OpPayrollMonthly'], { 'kyuyo/ops/payroll.monthly.js': 'OpPayrollMonthly', 'kyuyo/tests/a.mjs': 'OpPayrollMonthly' });
    if (un.length !== 1) throw new Error('赤になっていない: ' + JSON.stringify(un));
  });
  T('⑤ ops/tests の外から呼ばれていれば緑', () => {
    const un = findUncalled(['OpPayrollMonthly'], { 'kyuyo/ops/payroll.monthly.js': 'OpPayrollMonthly', 'kyuyo/js/app.js': 'OpPayrollMonthly' });
    if (un.length) throw new Error('誤検知: ' + JSON.stringify(un));
  });
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

/* ══ 本番（実物を見る） ═══════════════════════════════════════════════ */
const SKIP_DIRS = new Set(['node_modules', '.git', 'tmp', '.vercel', 'docs', 'supabase']);
function walk(rel, out = []) {
  for (const name of fs.readdirSync(path.join(ROOT, rel || '.'))) {
    if (SKIP_DIRS.has(name)) continue;
    const r = rel ? rel + '/' + name : name;
    if (fs.statSync(path.join(ROOT, r)).isDirectory()) walk(r, out);
    else if (/\.(js|mjs|html)$/i.test(name)) out.push(r);
  }
  return out;
}
const allFiles = walk('');
const src = {};
for (const r of allFiles) src[r] = fs.readFileSync(path.join(ROOT, r), 'utf8');

const opFiles = allFiles.filter(r => /(^|\/)ops\/[^/]+\.js$/.test(r));
const ops = opFiles.map(r => ({ rel: r, mod: require_(path.join(ROOT, r)) }));

// CI と各ランナーが実際に回しているテストの一覧
const ciYml = fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');
const runners = ['tests/run.js', 'kyuyo/tests/run.js'].map(p => fs.readFileSync(path.join(ROOT, p), 'utf8')).join('\n');
const isRun = (testPath) => {
  const base = testPath.split('/').pop();
  return ciYml.indexOf(testPath) >= 0 || ciYml.indexOf(base) >= 0 || runners.indexOf(base) >= 0;
};

console.log('\n[op-boundary] 契約の線を機械で守る');

T('オペが1本以上あり、契約の形（id/version/engine/tests）を持っている', () => {
  if (!ops.length) throw new Error('ops/ にオペがありません（検査が空振り）');
  for (const { rel, mod } of ops) {
    if (!mod || !mod.id) throw new Error(rel + ': id が無い');
    if (!mod.version) throw new Error(rel + ': version が無い');
    if (typeof mod.engine !== 'function') throw new Error(rel + ': engine が無い');
    if (!Array.isArray(mod.tests) || !mod.tests.length) throw new Error(rel + ': tests が無い');
  }
});

T('★守り方4: engine は必ず provenance を返す（検証NGの時も）', () => {
  for (const { rel, mod } of ops) {
    const r = mod.engine({});                       // わざと空＝検証NGの道
    if (!r || typeof r !== 'object') throw new Error(rel + ': engine が結果を返さない');
    for (const k of ['value', 'cells', 'warnings', 'errors', 'provenance']) {
      if (!(k in r)) throw new Error(rel + ': 返りに ' + k + ' が無い（契約の5つが揃っていない）');
    }
    if (!r.provenance || !r.provenance.op) throw new Error(rel + ': provenance が無い＝なぜその答えかを後から言えない');
    if (r.value !== null) throw new Error(rel + ': 検証NGなのに value を作っている（0円を成功として返さない）');
    if (!r.errors || !r.errors.length) throw new Error(rel + ': 検証NGなのに errors が空');
  }
});

T('★守り方2: オペが宣言した tests が、実際にCI/ランナーで回っている（嘘のゲートを許さない）', () => {
  for (const { rel, mod } of ops) {
    for (const t of mod.tests) {
      const full = rel.replace(/\/ops\/.*$/, '/') + t;      // 例: kyuyo/tests/....
      if (!fs.existsSync(path.join(ROOT, full))) throw new Error(rel + ': ' + t + ' が実在しない');
      if (!isRun(full)) throw new Error(rel + ': ' + t + ' がCIでもランナーでも回っていない（宣言だけのゲート）');
    }
  }
});

T('★守り方1/3: 既存の2つの目が生きていて、CIで回っている', () => {
  for (const g of ['tests/no-hardcoded-statutory.test.mjs', 'tests/no-duplicate-libs.test.mjs']) {
    if (!fs.existsSync(path.join(ROOT, g))) throw new Error(g + ' が消えている');
    if (!isRun(g)) throw new Error(g + ' がCIから外れている');
  }
});

const leaks = findUiLeaks(Object.fromEntries(opFiles.map(r => [r, src[r]])));
T('★⑧ オペの中から画面側を呼び返していない（../js/ もDOMも0件）', () => {
  if (leaks.length) {
    throw new Error('オペが面に触っています:\n'
      + leaks.map(b => '   - ' + b.file + ': ' + b.what + ' … ' + b.why).join('\n')
      + '\n   → ★呼び返すと「新旧一致」は同じ物を2回呼ぶだけで必ず通り、契約を1ミリも証明しません。');
  }
});

const globalNames = ops.map(({ rel, mod }) => {
  const m = /root\.(Op[A-Za-z0-9_]+)\s*=/.exec(src[rel]);
  return m ? m[1] : null;
}).filter(Boolean);
const uncalled = findUncalled(globalNames, src);
T('★⑤ 各オペが ops/ とテストの外から実際に呼ばれている（呼ばれていない契約は「有る」と言わない）', () => {
  if (!globalNames.length) throw new Error('オペのグローバル名を1つも取れていません（検査が空振り）');
  if (uncalled.length) {
    throw new Error('誰も呼んでいないオペがあります: ' + uncalled.join(', ')
      + '\n   → 作っただけで宙に浮いています。最低1箇所、実物から契約経由で呼ぶこと。');
  }
});

console.log('\n── 実測 ──');
console.log('  オペ: ' + ops.map(o => o.mod.id).join(', '));
console.log('  グローバル名: ' + globalNames.join(', ') + ' / 呼ばれていない: ' + uncalled.length + '件');
console.log('  面への漏れ: ' + leaks.length + '件 / 走査 ' + allFiles.length + 'ファイル');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
