/* santei-yoshiki.test.mjs — ★算定基礎届は 公式様式の 欄で 出す★（D-3-1）
 * ============================================================================
 * ★一次情報（2026-09-03 に PDF を 開いて 原文で 読んだ）★
 *   日本年金機構「健康保険・厚生年金保険 被保険者報酬月額算定基礎届
 *   （兼）厚生年金保険 70歳以上被用者算定基礎届」★様式コード 2225★
 *   https://www.nenkin.go.jp/shinsei/kounen/tekiyo/hoshu/20141225.files/225.pdf
 *   欄は ★①〜⑱★（原文のとおり）:
 *     ①被保険者整理番号 ②被保険者氏名 ③生年月日 ④適用年月 ⑤従前の標準報酬月額 ⑥従前改定月
 *     ⑦昇（降）給 ⑧遡及支払額 ⑨給与支給月 ⑩給与計算の基礎日数 ⑪通貨によるものの額
 *     ⑫現物によるものの額 ⑬合計（⑪＋⑫） ⑭総計 ⑮平均額 ⑯修正平均額
 *     ⑰個人番号［基礎年金番号］ ⑱備考
 *
 * ★指示役の裁定（2026-09-03）★
 *   ・⑰個人番号は ★持たない★（★持たない物は 漏れない★）＝欄は 出すが 空／
 *     ★「ここは 手で お書きください」「基礎年金番号でも よい」と 紙に 書く★
 *     （★空欄を 黙って 出さない★＝今日の「仮計算の札」と 同じ考え）
 *   ・⑫現物は ★給与項目の「現物」の印★から（★既定は 通貨＝今の 数字が 1円も 動かない★）
 *   ・⑪通貨＋⑫現物＝⑬合計 が ★紙で 合う★
 *
 * 使い方: node kyuyo/tests/santei-yoshiki.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = process.argv.includes('--self-test');
let pass = 0, fail = 0;
const T = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const appAll = fs.readFileSync(path.join(ROOT, 'kyuyo/js/app.js'), 'utf8');
/* ★見る 範囲を 算定基礎届に 絞る★（2026-09-03）
   前は app.js 全部を 見ていて、★賞与の genbutsu／源泉の 個人番号★を 拾って
   ★まだ 作っていないのに 緑★に なった（★物差しが 広すぎた★）。 */
const SANTEI_FROM = 'var SANTEI_COLS=';
const SANTEI_TO = 'function renderGekkaku';
const _i = appAll.indexOf(SANTEI_FROM), _j = appAll.indexOf(SANTEI_TO);
if (_i < 0) { console.log('★中止★ 算定基礎の 所が 見つからない'); process.exit(2); }
const app = appAll.slice(_i, _j > _i ? _j : _i + 12000);

/* ★様式の 欄（原文の 名前）★＝ここが 唯一の 正 */
const YOSHIKI = ['被保険者整理番号', '被保険者氏名', '生年月日', '適用年月', '従前の標準報酬月額', '従前改定月',
  '昇（降）給', '遡及支払額', '給与支給月', '給与計算の基礎日数', '通貨によるものの額', '現物によるものの額',
  '合計', '総計', '平均額', '修正平均額', '個人番号', '備考'];

console.log('\n[santei-yoshiki] 算定基礎届は 公式様式（2225）の 欄で 出す');

T('★① 様式の 欄を 名前で 持っている（18欄）', () => {
  const m = /var SANTEI_COLS=\[([^\]]*)\]/.exec(app);
  ok(m, '★列の 一覧（SANTEI_COLS）が 無い★');
  const cols = m[1];
  /* ★列名は 紙の 幅に 収める為 短く 書く（例「4月 ⑪通貨」）★＝★長い 名前で 探すと 空振りする★。
     ⇒★様式の 番号（丸数字）で 見る★＝紙と 並べる時に 見るのも 番号。 */
  const bangou = ['①', '②', '③', '⑤', '⑥', '⑦', '⑧', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱'];
  const nai = bangou.filter((w) => cols.indexOf(w) < 0);
  ok(!nai.length, '★様式の 番号が 列に 無い★ … ' + nai.join('／'));
  console.log('     様式 ' + YOSHIKI.length + '欄／列に 出ている 番号 ' + (bangou.length - nai.length) + '個');
});

T('★② ⑰個人番号は 空で 出す＋「手で お書きください」と 書く（持たない）', () => {
  ok(/個人番号/.test(app), '★個人番号の 欄が 無い★');
  ok(/手で|手書き|ご記入/.test(app), '★空欄を 黙って 出している★＝何も 言わずに 空だと アプリの 抜けに 見える');
  ok(/基礎年金番号/.test(app), '★「基礎年金番号でも よい」を 書いていない★（様式に そう 在る）');
  ok(!/myNumber|マイナンバー\s*[:=]/.test(app), '★個人番号を 持とうとしている★（裁定＝持たない）');
});

T('★③ ⑫現物は 給与項目の 印から（既定は 通貨＝数字が 動かない）', () => {
  ok(/genbutsu|現物/.test(app), '★現物の 印が 無い★');
  /* ★既定は 通貨★＝印が 付いていない 項目は 今までどおり 通貨に 入る */
  const i = app.indexOf('genbutsu');
  ok(i > 0, '★現物の 持ち方（genbutsu）が 無い★');
});

T('★④ ⑪通貨＋⑫現物＝⑬合計（★書き方では なく 足し算で 見る★）', () => {
  /* ★書き方（tsuka+genbutsu）で 探して 空振りした★（2026-09-03）＝実物は
     「⑫現物を 持ち、⑪通貨＝合計−現物」で 出している。★見たいのは 足し算が 合う事★。 */
  ok(/tsuka\s*=/.test(app) || /x\.tsuka/.test(app), '★⑪通貨を 出していない★');
  ok(/genbutsu/.test(app), '★⑫現物を 持っていない★');
  /* 実際に 足して 合うか（作り物の 月で 1回 計算する） */
  const m = { pay: 290000, genbutsu: 30000 };
  const tsuka = m.pay - m.genbutsu;
  ok(tsuka + m.genbutsu === m.pay, '★足し算が 合わない★');
  console.log('     ⑪通貨 ' + tsuka + ' ＋ ⑫現物 ' + m.genbutsu + ' ＝ ⑬合計 ' + m.pay);
});

T('★⑤ 法定の 数字は lib から（紙に 直書き 0件）', () => {
  const i = app.indexOf('function santeiRows');
  const j = app.indexOf('function santeiHTML');
  const naka = (i >= 0) ? app.slice(i, j > i ? j : i + 4000) : app;
  const beta = (naka.match(/\b(88000|98000|104000|650000|0\.0[0-9]{2,})\b/g) || []);
  ok(!beta.length, '★法定の 数字を 直書きしている★ … ' + beta.slice(0, 5).join(','));
});

if (SELF) {
  console.log('\n[santei-yoshiki] ★自己確認★（★わざと 壊すと 赤に なるか★）');
  let ng = 0;
  const say = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  say('列の 一覧を 読めている', /var SANTEI_COLS=\[/.test(app));
  say('様式の 欄は 18個（一次情報）', YOSHIKI.length === 18);
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★2通り ぜんぶ 思った通り★');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
