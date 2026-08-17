/* saitei-official.test.mjs — ★最低賃金が公式の実額と1円もズレていないことを、毎回機械で示す★
 *
 * なぜ必要か（前科がある行）:
 *   2026-07-10、Exallyの最賃が★47県中38県で誤値★だったことが一次情報で確定している
 *   （北海道 1107(誤)/1075(正)・青森 1055/1029・香川 1071/1036）。
 *   ★給与明細の「最低賃金割れ」チェックが、誤った額で動いていた実害★が出た唯一の行。
 *   2026-08-03 に一次情報で突き合わせたところ 47県すべて一致＝値は直っている。
 *   ★しかし「直っている」ことを機械で示せていなかった。だからここで示す。
 *
 * 真値: kyuyo/tests/fixtures/saitei-official-r7.json
 *   厚労省『令和7年度地域別最低賃金全国一覧』PDF から機械で抜き出した47県＋全国加重平均。
 *   ★人が打ち直していない（打ち直すと、それ自体が新しい誤値の入口になる）。
 *
 * 使い方: node tests/saitei-official.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(path.join(ROOT, 'package.json'));
const SAI = require_(path.join(ROOT, 'lib/saitei-chingin.js'));
const OFF = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/saitei-official-r7.json'), 'utf8'));

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };

console.log('\n[saitei-official] 最低賃金が公式の実額と一致しているか（47県・1円単位）');

T('★47県すべてが公式の額と1円も違わない', () => {
  const ng = [];
  for (const [key, o] of Object.entries(OFF.prefs)) {
    const lib = SAI.todofuken[key];
    if (!lib) { ng.push(key + ': libに無い'); continue; }
    if (lib.chingin !== o.chingin) ng.push(o.name + '(' + key + '): lib=' + lib.chingin + ' 公式=' + o.chingin + ' 差=' + (lib.chingin - o.chingin) + '円');
    if (lib.name !== o.name) ng.push(key + ': 名前が違う lib=' + lib.name + ' 公式=' + o.name);
  }
  if (ng.length) {
    throw new Error('公式と違う県が ' + ng.length + ' 件:\n' + ng.map(x => '   - ' + x).join('\n')
      + '\n   → ★最賃は「割れているか」の判定に直結します。1円違えば客の明細に誤警告が出ます。'
      + '\n     一次情報 ' + OFF.note.slice(0, 80) + '… を見て直してください。');
  }
});

T('★47県の【発効日】と【前年額】も公式と一致（判定に直結する・手で打ち直していない）', () => {
  const ng = [];
  const ymd = (h) => { const m = /令和(\d+)年(\d+)月(\d+)日/.exec(h || ''); return m ? (2018 + (+m[1])) + '-' + String(+m[2]).padStart(2, '0') + '-' + String(+m[3]).padStart(2, '0') : null; };
  for (const [key, o] of Object.entries(OFF.prefs)) {
    const lib = SAI.todofuken[key]; if (!lib) continue;
    const want = ymd(o.hatsuko);
    if (lib.hatsuko !== want) ng.push(o.name + ': 発効日 lib=' + lib.hatsuko + ' 公式=' + want);
    if (lib.prev !== o.prev) ng.push(o.name + ': 前年額 lib=' + lib.prev + ' 公式=' + o.prev);
  }
  if (ng.length) throw new Error('公式と違うものが ' + ng.length + ' 件:\n' + ng.map(x => '   - ' + x).join('\n')
    + '\n   → ★発効日がズレると、その県のその月だけ判定が変わります（誤警告 or 見逃し）。');
});

T('★全国加重平均も一致', () => {
  if (SAI.ZENKOKU_HEIKIN !== OFF.zenkoku_heikin) {
    throw new Error('lib=' + SAI.ZENKOKU_HEIKIN + ' 公式=' + OFF.zenkoku_heikin);
  }
});

T('県が47そろっている（減らしても増やしても赤）', () => {
  const off = Object.keys(OFF.prefs).length, lib = Object.keys(SAI.todofuken).length;
  if (off !== 47) throw new Error('公式一覧が47県でない: ' + off);
  if (lib !== 47) throw new Error('libが47県でない: ' + lib);
});

T('真値が「人が打ち直した物」でない（出典と取り方が書いてある）', () => {
  if (!/mhlw\.go\.jp/.test(OFF.note || '')) throw new Error('真値に出典が書いていない');
  if (!OFF.order_evidence) throw new Error('並び順の根拠が書いていない');
});

/* 発効日は県ごとに違う（令和7年10月3日〜令和8年3月31日に順次）。
   ★2026-08-03 に、判定を県ごとの発効日で行うよう直した（tests/saitei-hatsuko.test.mjs が守る）。
   ここでは「何県が10月中に発効しないか」を毎回出して、規模が変わったら気づけるようにしておく。 */
T('発効日が10月中でない県の数を可視化（判定を分ける必要がある範囲）', () => {
  const late = Object.entries(OFF.prefs).filter(([, o]) => !(o.hatsuko || '').startsWith('令和7年10月'));
  if (!late.length) throw new Error('発効日が1件も取れていない（真値が壊れている疑い）');
  console.log('      ' + late.length + '県が10月中に発効しない: '
    + late.slice(0, 6).map(([, o]) => o.name + ' ' + o.hatsuko).join(' / ') + ' …ほか' + Math.max(0, late.length - 6) + '県');
  console.log('      → 判定は県ごとの発効日で分けている（lib の monthSplit / chinginOn）');
});

console.log('\n── 実測 ──');
console.log('  照合: 47県 + 全国加重平均 ' + OFF.zenkoku_heikin + '円 / 年度 ' + OFF.nendo);
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
