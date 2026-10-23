/* yen-onaji.test.mjs — ★数の 字を 整え方の 使い回しに 替えても、出る 字は 1文字も 変わらない★（node・ブラウザ無し）
 * ============================================================================
 * ★守る事（2026-10-23 司さん「150人で重くなるのが問題」）★ … app.js の yen／fmtN を
 *   toLocaleString('ja-JP')（呼ぶ たびに 整え方を 作る）から Intl.NumberFormat 1個の 使い回しに 替えた。
 *   ★お金の 字が 1文字でも 変われば 明細・振込の 画面が 嘘に なる★＝同じ 字かを 数で 見る。
 * ★この門が 見る事★
 *   ① 使い回しの 整え方と toLocaleString が、整数・小数・負・0・-0・NaN・±Infinity・大きい数で 同じ 字を 出す
 *   ② app.js の yen と fmtN が 使い回しの 形（_jp）を 通っている（黙って 元に 戻ると 赤）
 * ★空振り止め（--waza）★ … 違う 整え方（小数 1桁）を 比べに 入れると 違いが 出て 赤＝比べが 効いている 証し。
 * 使い方: node kyuyo/tests/yen-onaji.test.mjs   ／   --waza
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WAZA = process.argv.includes('--waza');
let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };
console.log('\n[yen-onaji] 数の 字の 整え方を 使い回しても 字は 同じ' + (WAZA ? '  ★★違う 整え方を 混ぜた回★★' : ''));

const F = WAZA ? new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 }) : new Intl.NumberFormat('ja-JP');
const kazu = [0, -0, 1, -1, 12, 999, 1000, 1234, 12345, 123456, 1234567, 216270, 248675, 1e9, 1e15, 1e21, -248675,
  0.5, 1.25, 1.234, 1.2345, 12345.678, -0.4, -0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER];
for (let i = 0; i < 20000; i++) kazu.push(Math.round((Math.sin(i) * 1e7) * 1000) / 1000);
let chigai = 0, rei = '';
for (const n of kazu) {
  const a = F.format(n), b = n.toLocaleString('ja-JP');
  if (a !== b) { chigai++; if (!rei) rei = n + ': ' + a + ' ≠ ' + b; }
  const ya = '¥' + F.format(Math.round(n)), yb = '¥' + Math.round(n).toLocaleString('ja-JP');
  if (ya !== yb) { chigai++; if (!rei) rei = 'yen ' + n + ': ' + ya + ' ≠ ' + yb; }
}
if (!WAZA) T('★使い回しの 整え方と toLocaleString が ' + kazu.length + '個 全部で 同じ 字（yen の 形も）★', chigai === 0, '違い ' + chigai + '個 例 ' + rei);
else T('★--waza: 違う 整え方を 混ぜると 違いが 出る（比べが 効いている 証し）★', chigai > 0, '違い 0＝比べが 効いていない');

const app = fs.readFileSync(path.join(ROOT, 'kyuyo/js/app.js'), 'utf8');
T('★app.js の yen が 使い回しの 形を 通る★', /var yen=function\(n\)\{return '¥'\+_jp\(Math\.round\(n\)\);\};/.test(app));
T('★app.js の fmtN が 使い回しの 形を 通る★', /var fmtN=function\(v\)\{var n=num\(v\);return n\?_jp\(n\):/.test(app));
T('★使い回しの 整え方は 1個だけ 作る★', (app.match(/new Intl\.NumberFormat\('ja-JP'\)/g) || []).length === 1);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('KEKKA {"passed":' + pass + ',"failed":' + fail + ',"mimiso":0}');
process.exit(fail ? 1 : 0);
