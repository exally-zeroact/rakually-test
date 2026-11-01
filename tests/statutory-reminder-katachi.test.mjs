/* statutory-reminder-katachi.test.mjs — ★法定データの 年度更新の 催促が「いつ・何を」正しく 出し、lib の 形が 変わった時に 黙って「更新不要」と 言わないか★
 * ==============================================================================
 * ★なぜ 要るか（2026-11-01・taiketsu 11-01 別件）★
 *   kyuyo/scripts/statutory-reminder.mjs は 前、`SAI.saiteiStale && …`／`k && k.stale` で 判じていた。
 *   lib の 関数名が 変わる・返りの 形が 変わると その 項目が ★黙って 抜け★ exit 0＝「更新は 要らない」、
 *   statutory-watch.yml は code 0 で 開いている Issue「法定データの年度更新が必要です」を ★閉じていた★。
 *   KOYO.RATES／D.PARAMS も {} だと Math.max()=-Infinity、鍵が 年で ないと NaN＝比べが 黙って 偽。
 *
 * ★測り方★（台本を 一時の 木（kyuyo/scripts＋kyuyo/lib）へ 写し、★作り物の lib 4本★ で 本当に node で 走らせる）
 *   ㋐ 暦の 網 … 境の 月と その 前の 月（01/02/03/08/09/11/12）で、4項目 それぞれ
 *       収録年＝必要年度 → code 0／収録年＝必要年度の 1年前 → code 10 で ★その 項目だけ★ TODO に 出る
 *       （必要年度・境の 月・12月の 先取りが ずれたら 赤＝taiketsu 11-01 2回目 止1）
 *       作り物は 本物の 年度の 決め（saiteiNendoOf＝10月から／shahoYearOf＝3月から／RATES・PARAMS の 鍵）を 写す。
 *   ㋑ 形が 壊れた 作り物 14通り → ★exit 1 と ::error::★（年の 鍵と 年で ない 鍵が 混ざる 物も）
 *   ㋒ 本物の lib … ★写さず その場の 木で★（root の package.json の 読み方まで 本物と 同じ）
 *       2026-11／2026-12 → 0 か 10（年度の 変わり目で 動く）
 *       2099-12 → code 10 かつ ★4項目の 名が 1回ずつ★（lib が どれだけ 新しくても 届かない＝全部が 出口へ 届くか）
 *   ★repo の 木には 何も 書かない★（一時の 木は os.tmpdir・終われば 消す・途中で 落ちても 残るのは tmp だけ）
 *
 * 使い方: node tests/statutory-reminder-katachi.test.mjs            … 今の 台本を 数える
 *         node tests/statutory-reminder-katachi.test.mjs --self-test … ★台本を わざと 壊して 赤に なるか★（13通り・㋐㋑ で 数える）
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'kyuyo/scripts/statutory-reminder.mjs');

// ── 仕様（役所の 改定時期）＝この 見張りの 正。台本と 別に 書く ──
//   最賃＝9月から 当年度・健保＝2月から 当年・雇用＝3月から 当年度・所得税＝12月から 翌年分
const KOUMOKU = [
  { key: 'saitei', label: '最低賃金 ', need: (y, m) => (m >= 9 ? y : y - 1) },
  { key: 'kenko', label: '社会保険料率(健保/介護) ', need: (y, m) => (m >= 2 ? y : y - 1) },
  { key: 'koyo', label: '雇用保険料率 ', need: (y, m) => (m >= 3 ? y : y - 1) },
  { key: 'shotoku', label: '所得税(源泉/年末調整) ', need: (y, m) => (m >= 12 ? y + 1 : y) },
];

// ── 作り物の lib（収録年 L を 焼き込む）。年度の 決めは 本物の lib を 写す ──
const FAKE = {
  saitei: (L) => 'module.exports = { saiteiStale: function (ym) { var y = +String(ym).slice(0, 4), m = +String(ym).slice(5, 7); var nendo = m >= 10 ? y : y - 1; return nendo !== ' + L + '; } };',
  kenko: (L) => 'module.exports = { getKenko: function (pref, ym) { var y = +String(ym).slice(0, 4), m = +String(ym).slice(5, 7); var sy = m >= 3 ? y : y - 1; return { stale: sy > ' + L + ' }; } };',
  koyo: (L) => 'module.exports = { RATES: { ' + (L - 1) + ': {}, ' + L + ': {} } };',
  shotoku: (L) => 'module.exports = { PARAMS: { ' + (L - 1) + ': {}, ' + L + ': {} } };',
};
const FILE = { saitei: 'saitei-chingin.js', kenko: 'shakaihoken-hyo.js', koyo: 'koyo-hoken.js', shotoku: 'shotokuzei-densan.js' };

// 形が 壊れた 作り物（今日＝2026-11・他の 項目は 収録済み）
const KATACHI = [
  { name: 'saiteiStale が 無い', key: 'saitei', src: 'module.exports = { isStale: function () { return true; } };' },
  { name: 'saiteiStale が 返さない', key: 'saitei', src: 'module.exports = { saiteiStale: function () {} };' },
  { name: 'saiteiStale が 字を 返す', key: 'saitei', src: 'module.exports = { saiteiStale: function () { return "yes"; } };' },
  { name: 'getKenko が 無い', key: 'kenko', src: 'module.exports = { kenko: function () { return { stale: true }; } };' },
  { name: 'getKenko が null', key: 'kenko', src: 'module.exports = { getKenko: function () { return null; } };' },
  { name: 'getKenko に stale が 無い', key: 'kenko', src: 'module.exports = { getKenko: function () { return { isStale: true }; } };' },
  { name: 'RATES が 無い', key: 'koyo', src: 'module.exports = { RATE: { 2026: {} } };' },
  { name: 'RATES が 空', key: 'koyo', src: 'module.exports = { RATES: {} };' },
  { name: 'RATES の 鍵が 年で ない', key: 'koyo', src: 'module.exports = { RATES: { r7: {} } };' },
  { name: 'RATES に 年と 年で ない 鍵が 混ざる', key: 'koyo', src: 'module.exports = { RATES: { 2025: {}, 2026: {}, note: {} } };' },
  { name: 'RATES に 5桁の 打ち間違い（20260）', key: 'koyo', src: 'module.exports = { RATES: { 2025: {}, 20260: {} } };' },
  { name: 'PARAMS が 無い', key: 'shotoku', src: 'module.exports = {};' },
  { name: 'PARAMS が 空', key: 'shotoku', src: 'module.exports = { PARAMS: {} };' },
  { name: 'PARAMS に 年と 年で ない 鍵が 混ざる', key: 'shotoku', src: 'module.exports = { PARAMS: { 2025: {}, 2026: {}, memo: {} } };' },
];
const TSUKI = ['2026-01', '2026-02', '2026-03', '2026-08', '2026-09', '2026-11', '2026-12'];

function hashiru(file, today) {
  const r = spawnSync(process.execPath, [file], {
    encoding: 'utf8', env: { ...process.env, STATUTORY_TODAY: today }, timeout: 30000,
  });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
const head3 = (out) => '\n        ' + out.trim().split('\n').slice(0, 3).join('\n        ');
const todoOf = (out, label) => out.split('\n').filter((l) => l.startsWith('TODO: ' + label)).length;
const todoAll = (out) => (out.match(/^TODO: /gm) || []).length;

// 1つの 台本の 字を 作り物で 全部の 通り 走らせ、赤の 数を 返す（repo の 木には 書かない）
function kazoeruFake(src, say) {
  let aka = 0;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stat-katachi-'));
  try {
    fs.mkdirSync(path.join(dir, 'kyuyo/scripts'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'kyuyo/lib'), { recursive: true });
    const file = path.join(dir, 'kyuyo/scripts/statutory-reminder.mjs');
    fs.writeFileSync(file, src);
    // 作り物の lib を CommonJS として 読ませる（一時の 木の 上に package.json が 在っても 揺れない）
    fs.writeFileSync(path.join(dir, 'kyuyo/lib/package.json'), '{"type":"commonjs"}');
    const oku = (L, over = {}) => {
      for (const k of KOUMOKU) fs.writeFileSync(path.join(dir, 'kyuyo/lib', FILE[k.key]), over[k.key] != null ? over[k.key] : FAKE[k.key](L[k.key]));
    };
    // ㋐ 暦の 網
    for (const t of TSUKI) {
      const y = +t.slice(0, 4), m = +t.slice(5, 7);
      const N = Object.fromEntries(KOUMOKU.map((k) => [k.key, k.need(y, m)]));
      oku(N);
      let r = hashiru(file, t);
      let ok = r.code === 0;
      if (!ok) aka++;
      say((ok ? '  ok  ' : '  ★赤 ') + t + ' 全部 収録：want 0／got ' + r.code + (ok ? '' : head3(r.out)));
      for (const k of KOUMOKU) {
        oku({ ...N, [k.key]: N[k.key] - 1 });
        r = hashiru(file, t);
        ok = r.code === 10 && todoOf(r.out, k.label) === 1 && todoAll(r.out) === 1;
        if (!ok) aka++;
        say((ok ? '  ok  ' : '  ★赤 ') + t + ' ' + k.label.trim() + ' だけ 未収録（' + (N[k.key] - 1) + '）：want 10・TODO その項目 1行／got ' + r.code + '・TODO ' + todoAll(r.out) + (ok ? '' : head3(r.out)));
      }
    }
    // ㋑ 形
    const N = Object.fromEntries(KOUMOKU.map((k) => [k.key, k.need(2026, 11)]));
    for (const c of KATACHI) {
      oku(N, { [c.key]: c.src });
      const r = hashiru(file, '2026-11');
      const ok = r.code === 1 && /::error::/.test(r.out);
      if (!ok) aka++;
      say((ok ? '  ok  ' : '  ★赤 ') + '形：' + c.name + '：want 1＋::error::／got ' + r.code + (ok ? '' : head3(r.out)));
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  return aka;
}

// ㋒ 本物の lib・その場の 木で（今の 台本 だけ）
function kazoeruHonmono(say) {
  let aka = 0;
  for (const t of ['2026-11', '2026-12', '2099-12']) {
    const r = hashiru(SCRIPT, t);
    let ok;
    if (t === '2099-12') ok = r.code === 10 && todoAll(r.out) === 4 && KOUMOKU.every((k) => todoOf(r.out, k.label) === 1);
    else ok = r.code === 0 || r.code === 10;
    if (!ok) aka++;
    say((ok ? '  ok  ' : '  ★赤 ') + '本物の lib（' + t + '）：' + (t === '2099-12' ? '10・4項目の 名が 1回ずつ' : '0 か 10') + '／got ' + r.code + '・TODO ' + todoAll(r.out) + (ok ? '' : head3(r.out)));
  }
  return aka;
}

const src = fs.readFileSync(SCRIPT, 'utf8');

if (process.argv.includes('--self-test')) {
  console.log('\n[statutory-reminder-katachi --self-test] 台本を わざと 壊して 赤に なるか');
  const KOWASU = [
    { name: 'kowareta を exit 0 に（前の 黙って 通す 形）', from: /function kowareta\(what\) \{([\s\S]*?)process\.exit\(1\);/, to: (m, a) => 'function kowareta(what) {' + a + 'process.exit(0);' },
    { name: 'exit 10 を 0 に', from: /process\.exit\(10\);/, to: 'process.exit(0);' },
    { name: '最賃の 判じを 前の `&&` に', from: /if \(typeof SAI\.saiteiStale !== 'function'\)[^\n]*\n\s*if \(bool\(SAI\.saiteiStale\(need \+ '-10'\), [^)]*\)\)/, to: "if (SAI.saiteiStale && SAI.saiteiStale(need + '-10'))" },
    { name: '健保の 判じを 前の `k && k.stale` に', from: /if \(!k \|\| typeof k !== 'object'\)[^\n]*\n\s*if \(bool\(k\.stale, [^)]*\)\)/, to: 'if (k && k.stale)' },
    { name: '所得税の 項目を 黙って 消す（if (false)）', from: /(const latest = saishinNen\(D\.PARAMS[^\n]*\n\s*)if \(need > latest\)/, to: (m, a) => a + 'if (false)' },
    { name: '最賃の 必要年度を 1年 前へ', from: /const need = \(m >= 9 \? y : y - 1\);/, to: 'const need = (m >= 9 ? y - 1 : y - 2);' },
    { name: '雇用の 必要年度を 1年 前へ', from: /const need = \(m >= 3 \? y : y - 1\);/, to: 'const need = (m >= 3 ? y - 1 : y - 2);' },
    { name: '所得税の 12月の 先取りを 消す', from: /const need = \(m >= 12 \? y \+ 1 : y\);/, to: 'const need = y;' },
    { name: '最賃の 境の 月を 9→11月', from: /const need = \(m >= 9 \? y : y - 1\);/, to: 'const need = (m >= 11 ? y : y - 1);' },
    { name: '健保の 境の 月を 2→11月', from: /const need = \(m >= 2 \? y : y - 1\);/, to: 'const need = (m >= 11 ? y : y - 1);' },
    { name: '鍵の 確かめ every→some', from: /ks\.every\(/, to: 'ks.some(' },
    { name: '鍵の 確かめを 4桁ちょうど→数字なら何でも（/^\\d+$/）', from: /\/\^\\d\{4\}\$\//, to: '/^\\d+$/' },
    { name: '鍵の 確かめを 抜く', from: /if \(!ks\.length \|\| [^\n]*\n/, to: '' },
  ];
  let nuke = 0;
  for (const k of KOWASU) {
    if (!k.from.test(src)) { console.log('  ★赤 空振り（壊す 字が 台本に 無い）：' + k.name); nuke++; continue; }
    const bad = src.replace(k.from, k.to);
    if (bad === src) { console.log('  ★赤 空振り（置き換えても 同じ）：' + k.name); nuke++; continue; }
    const aka = kazoeruFake(bad, () => {});
    if (aka === 0) { console.log('  ★赤 壊しても 緑：' + k.name); nuke++; }
    else console.log('  ok  ' + k.name + ' → 赤 ' + aka);
  }
  console.log(nuke ? '\n★赤 ' + nuke + '（見張りが 壊しを 見逃す）' : '\n緑：壊し ' + KOWASU.length + '通り 全部 赤に なった');
  process.exit(nuke ? 1 : 0);
}

console.log('\n[statutory-reminder-katachi] 催促が「いつ・何を」正しく 出し、lib の 形が 変わった時に 黙って「更新不要」と 言わないか');
const say = (s) => console.log(s);
const aka = kazoeruFake(src, say) + kazoeruHonmono(say);
const zen = TSUKI.length * (1 + KOUMOKU.length) + KATACHI.length + 3;
console.log(aka ? '\n★赤 ' + aka + '／' + zen : '\n緑：' + zen + '通り');
process.exit(aka ? 1 : 0);
