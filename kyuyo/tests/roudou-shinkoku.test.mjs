/* roudou-shinkoku.test.mjs — ★労働保険 年度更新（申告書）の 計算★
 * ============================================================================
 * ★原文は lib の 頭に 全部 写してある★（kyuyo/lib/roudou-shinkoku.js）
 *   端数／算定基礎額 千円未満／概算の 50%〜200%／延納 40万・20万／
 *   ★分けた 端数は 最初の 期に 合算★（国等の債権債務等の金額の端数計算に関する法律 第三条）／
 *   一般拠出金率 1000分の0.02（厚生労働省 本文）
 *
 * 使い方: node kyuyo/tests/roudou-shinkoku.test.mjs [--self-test]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = require(path.join(ROOT, 'lib/roudou-shinkoku.js'));
const SELF = process.argv.includes('--self-test');
let pass = 0, fail = 0;
const T = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + '：' : '') + '出た ' + JSON.stringify(a) + '／のはず ' + JSON.stringify(b)); };

console.log('\n[roudou-shinkoku] 労働保険 年度更新の 計算（★原文どおり★）');

T('★① 算定基礎額は 千円未満 切り捨て（法 第十五条第一項第一号）', () => {
  eq(S.santeiKiso(1233400), 1233000);
  eq(S.santeiKiso(999), 0, '999円は 0');
  eq(S.santeiKiso(1000), 1000, 'ちょうど 1000円');
  eq(S.santeiKiso(0), 0);
});

T('★② 同額なら 合計率に 乗じてから 切り捨て（厚労省 Ｑ３）', () => {
  const r = S.hokenryo(1233400, 1233400, 2.5 / 1000, 15.5 / 1000);
  eq(r.gokei, 22194, '★合計★');
  eq(r.awaseta, true, '★合わせた 印★');
  /* 別々に 切り捨てると 22193＝★1円 少ない★ */
  eq(r.rousai + r.koyo, 22193, '別々に 切り捨てた 場合（比べる為）');
});

T('★③ 算定基礎額が 違えば 別々に 切り捨てる', () => {
  const r = S.hokenryo(1233400, 1000400, 2.5 / 1000, 15.5 / 1000);
  eq(r.awaseta, false);
  eq(r.gokei, Math.floor(1233000 * 2.5 / 1000) + Math.floor(1000000 * 15.5 / 1000));
});

T('★④ 率が 分からない時は null（0を 返さない）', () => {
  eq(S.hokenryo(1233400, 1233400, null, 15.5 / 1000).gokei, null, '労災率が 無い');
  eq(S.hokenryo(1233400, 1233400, 2.5 / 1000, null).gokei, null, '雇用率が 無い');
});

T('★⑤ 一般拠出金＝1000分の0.02・確定のみ（概算払い 無し）', () => {
  eq(S.IPPAN_PERMIL, 0.02);
  const r = S.ippanKyoshutsukin(1233400);
  eq(r.base, 1233000, '千円未満 切り捨て');
  eq(r.gaku, 24, '1,233,000×0.02/1000＝24.66 → ★24円★（切り捨て）');
  eq(r.gaisanNashi, true, '★概算払いは 無い★');
  eq(S.ippanKyoshutsukin(49999).gaku, 0, '49,000×0.02/1000＝0.98 → 0円');
  eq(S.ippanKyoshutsukin(50000).gaku, 1, '50,000×0.02/1000＝1.0 → 1円（境界）');
});

T('★⑥ 概算の 算定基礎額＝見込が 前年度の 50%〜200% なら 前年度（施行規則 第二十四条）', () => {
  eq(S.gaisanBase(1200000, 1000000).tsukatta, 'zennendo', '120%＝前年度');
  eq(S.gaisanBase(1200000, 1000000).base, 1000000);
  eq(S.gaisanBase(500000, 1000000).tsukatta, 'zennendo', '★ちょうど 50%★＝前年度');
  eq(S.gaisanBase(2000000, 1000000).tsukatta, 'zennendo', '★ちょうど 200%★＝前年度');
  eq(S.gaisanBase(499000, 1000000).tsukatta, 'mikomi', '★49.9%＝見込★');
  eq(S.gaisanBase(2001000, 1000000).tsukatta, 'mikomi', '★200.1%＝見込★');
  eq(S.gaisanBase(null, 1000000).tsukatta, 'zennendo', '見込を 出していない＝前年度');
});

T('★⑦ 延納は 概算保険料「のみ」で 40万円以上（Ｑ４）', () => {
  eq(S.ennoDekiruka(400000, false).ok, true, '★ちょうど 40万円★');
  eq(S.ennoDekiruka(399999, false).ok, false, '39万9999円');
  ok(/確定の 不足額と 足しても/.test(S.ennoDekiruka(399999, false).riyu), '★足せば 良いと 誤解させない 文★');
  eq(S.ennoDekiruka(200000, true).ok, true, '★片方だけ＝20万円★');
  eq(S.ennoDekiruka(199999, true).ok, false);
  eq(S.ennoDekiruka(null, false).ok, false, '概算が 出ていない');
});

T('★⑧ 期に 分けた 端数は ★最初の 期★に 合算（端数計算法 第三条）', () => {
  const r = S.ennoKibetsu(400001, 3);
  eq(r.ki.length, 3);
  eq(r.hito, 133333, '÷3');
  eq(r.amari, 2, '余り');
  eq(r.ki[0], 133335, '★1期に 余りを 足す★');
  eq(r.ki[1], 133333);
  eq(r.ki[2], 133333);
  eq(r.ki[0] + r.ki[1] + r.ki[2], 400001, '★足したら 元に 戻る★');
});

T('★⑨ 精算＝確定と 前年度の 概算の 差', () => {
  eq(S.seisan(500000, 400000).kubun, 'fusoku');
  eq(S.seisan(500000, 400000).gaku, 100000);
  eq(S.seisan(300000, 400000).kubun, 'amari');
  eq(S.seisan(300000, 400000).gaku, 100000);
  eq(S.seisan(400000, 400000).kubun, 'nashi');
  eq(S.seisan(null, 400000).measured, false, '★出ていない物を 0に しない★');
});

if (SELF) {
  console.log('\n[roudou-shinkoku] ★自己確認★（★境界を 1つずつ★）');
  let ng = 0;
  const say = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  say('千円未満 … 999→0／1000→1000', S.santeiKiso(999) === 0 && S.santeiKiso(1000) === 1000);
  say('★50%ちょうどは 前年度★', S.gaisanBase(500000, 1000000).tsukatta === 'zennendo');
  say('★49.9%は 見込★', S.gaisanBase(499000, 1000000).tsukatta === 'mikomi');
  say('★200%ちょうどは 前年度★', S.gaisanBase(2000000, 1000000).tsukatta === 'zennendo');
  say('★200.1%は 見込★', S.gaisanBase(2001000, 1000000).tsukatta === 'mikomi');
  say('★延納 40万ちょうど＝できる★', S.ennoDekiruka(400000, false).ok === true);
  say('★延納 399,999円＝できない★', S.ennoDekiruka(399999, false).ok === false);
  say('★片方だけ 20万ちょうど＝できる★', S.ennoDekiruka(200000, true).ok === true);
  say('★分けた 端数は 1期★（余り2円→1期が +2）', S.ennoKibetsu(400001, 3).ki[0] - S.ennoKibetsu(400001, 3).ki[1] === 2);
  say('★分けても 合計は 変わらない★', S.ennoKibetsu(400001, 3).ki.reduce((a, b) => a + b, 0) === 400001);
  say('一般拠出金 50,000円で 1円（境界）', S.ippanKyoshutsukin(50000).gaku === 1);
  say('一般拠出金 49,999円で 0円', S.ippanKyoshutsukin(49999).gaku === 0);
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★12通り ぜんぶ 思った通り★');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
