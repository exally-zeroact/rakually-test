/* kazu-no-kotoba.test.mjs — ★画面に 書いた「◯つ」は 本当に ◯個 か★
 * ============================================================================
 * ★なぜ（2026-09-04 指示役が 数えて 見つけた）★
 *   画面に「★下の 4つは『納入告知書』に 書いてあります★」と 書いてあるのに
 *   ★入れる欄は 5個★だった（seiriKigou／jigyoshoNo／zip／tel／nushi）。
 *   ★部品を 1つ 足した 日に 文が 嘘に なった★＝★数を 文字で 書いたから★。
 *   さらに ★出どころも 違った★ … 一次情報（CSV仕様書 69〜70ページ）を 読むと
 *     ・「納入告知書 納付書・領収証書」に 記載 … ★事業所整理記号・事業所番号の 2つだけ★
 *     ・郵便番号（親/子）＝★事業所所在地の 郵便番号★／電話（局番1〜3）＝★事業所の 電話番号★／
 *       事業主氏名＝★事業主の 氏名★ ⇒ ★会社の物★で 納入告知書の 話では ない
 *   ⇒★画面の 嘘は 画面で 止まらない★＝そのまま ★司さんへの 手順書に 写った★。
 *
 * ★ここで 固定する事★
 *   ① 画面の「◯つ」は ★その箱の 部品を 数えて 差し込む★（文字で 書かない）
 *   ② 出どころ別に 箱が 分かれている（納入告知書／会社の物）
 *   ③ ★合っている 所を 赤に しない★（他の「この2つ」「この3つ」は そのまま）
 *
 * 使い方: node kyuyo/tests/kazu-no-kotoba.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = process.argv.includes('--self-test');
let pass = 0, fail = 0;
const T = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const app = fs.readFileSync(path.join(ROOT, 'kyuyo/js/app.js'), 'utf8');

console.log('\n[kazu-no-kotoba] 画面の「◯つ」は 本当に ◯個 か（2026-09-04＝4つと書いて 5個 だった）');

T('★① 電子申請の 問いは 数を 文字で 書いていない', () => {
  /* ★2026-09-05 引っ越した★＝資格取得届でも 同じ 聞き取りが 要ったので
     ★jimushoToi 1か所★に 出した（写しを 2か所に 持たない）。見る所も そこへ 移す。
     ★移した事に この見張りが 気づいて 赤に なった★＝字で 探す 見張りが 効いた 証拠。 */
  const i = app.indexOf('function jimushoToi');
  const j = app.indexOf('function santeiCsvBox', i);
  const box = app.slice(i, j > i ? j : i + 4000);
  ok(i >= 0, '★jimushoToi が 無い（聞き取りの 1か所が 消えた）★');
  /* ★「下の 4つは」の様に 数を 打ち込んでいないか★（注記の 中は 数えない） */
  const nama = box.replace(/\/\*[\s\S]*?\*\//g, ' ').match(/[下上]の\s*[0-9０-９一二三四五六七八九十]+つ/g) || [];
  ok(!nama.length, '★数を 文字で 書いている★ … ' + nama.join('／'));
  ok(/kazu\(/.test(box) && /\.length/.test(box), '★数えて 差し込んでいない★');
});

T('★② 出どころ別に 箱が 分かれている（納入告知書／会社の物）', () => {
  const i = app.indexOf('function jimushoToi');
  const box = app.slice(i, app.indexOf('function santeiCsvBox', i));
  ok(/TOI_NOUNYU/.test(box) && /TOI_KAISHA/.test(box), '★出どころで 分けていない★');
  /* ★納入告知書の 箱は 2つだけ★（一次情報＝CSV仕様書 69p「納入告知書 納付書・領収証書に記載されている」
     のは ★事業所整理記号（郡市区符号＋事業所記号）★と ★事業所番号★） */
  const m = /TOI_NOUNYU\s*=\s*\[([\s\S]*?)\];/.exec(box);
  ok(m, '★納入告知書の 箱が 読めない★');
  const n = (m[1].match(/\['/g) || []).length;
  ok(n === 2, '★納入告知書の 箱が ' + n + '個★（一次情報では 2つ＝整理記号・事業所番号）');
  ok(!/zip|tel|nushi/.test(m[1]), '★会社の物が 納入告知書の 箱に 混ざっている★');
  console.log('     納入告知書 ' + n + '個 ／ 会社の物 ' + ((/TOI_KAISHA\s*=\s*\[([\s\S]*?)\];/.exec(box) || ['', ''])[1].match(/\['/g) || []).length + '個');
});

T('★③ 合っている 所を 赤に しない（他の「◯つ」は そのまま）', () => {
  /* ★見張りが 効きすぎて 正しい 文まで 赤に しないか★＝指示役が 数えた 2か所で 確かめる */
  const naka = app.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const hoka = (naka.match(/この\s*[0-9０-９一二三四五六七八九十]+つ/g) || []);
  ok(hoka.length >= 1, '★「この◯つ」が 1つも 無い★（実物が 変わった？）');
  console.log('     ほかの「この◯つ」… ' + hoka.length + 'か所（★ここは 赤に しない★）');
});

if (SELF) {
  console.log('\n[kazu-no-kotoba] ★自己確認★（★わざと 壊すと 赤に なるか★）');
  let ng = 0;
  const say = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  const nise = "'<p>下の 4つは</p>'";
  say('「下の 4つは」の様な 書き方を 見つけられる', /[下上]の\s*[0-9]+つ/.test(nise));
  say('注記の 中の 「4つ」は 数えない', !/[下上]の\s*[0-9]+つ/.test('/* 下の 4つは */'.replace(/\/\*[\s\S]*?\*\//g, ' ')));
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★2通り ぜんぶ 思った通り★');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
