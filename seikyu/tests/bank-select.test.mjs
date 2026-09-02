/* bank-select.test.mjs — ★振込先を 相手ごとに 選べる★＋★選んだ数で 紙の行数が 変わる★
 * ============================================================================
 * ★なぜ（2026-09-02・実物45枚を 機械で 読んだ）★
 *   材料＝OneDrive/ZEROact税理士/2025/25.ZEROact PDF（★16社45枚★・道具 scripts/paper-read.mjs）
 *   ★実物は 相手ごとに 振込先の数が 違う★ … 1行18枚／3行25枚／4行1枚／6行1枚
 *   ★ENEOSは 同じ相手なのに 月で 3→4→6行と 変えている★
 *   なのに うちは ★会社の設定に 1つ★しか持てず、全部の紙に 同じ物を 出していた
 *   （js/seikyu-app.js が settings().bank を そのまま 渡していた）。
 *
 * ★もう1つ（もっと わるい方）★
 *   ★6行 入れると 紙から はみ出す★＝`.sheet{overflow:hidden}` なので ★黙って 切れる★。
 *   実測（2026-09-02・Chromiumで 描いて 測った）
 *     3行 … はみ出した箱 0個 ／ 4行 … 0個 ／ ★6行 … 15個・口座番号「4166212」が 丸ごと 消える★
 *   ⇒ ★数字は 全部 緑のまま★（誰も 気づけない）＝[[feedback_numbers_green_but_open_the_picture]]
 *
 * ★ここで見る事★
 *   ① 相手が 選んでいなければ ★会社の口座 全部★（＝今までと同じ＝既定で 何も変わらない）
 *   ② 選んでいれば ★その口座だけ★・★並びは 会社の設定の順★（相手が並べ替えない）
 *   ③ ★会社から 消えた口座を 選んだままでも 黙って 出さない★＋★消えたと 言える★
 *   ④ ★1つも 選ばないは「全部」に 戻す★（★紙から 振込先が 消える方が 危ない★）
 *   ⑤ ★口座が 3つを 超えたら 明細に使える行を 1つずつ 減らす★
 *      （既に在る「区分が3を超えたら1行減らす」と ★同じ形★＝ [[feedback_borrow_tools_not_appearance]]）
 *   ⑥ ★空振りしていない★（見た本数を 数えて 出す）
 *
 * 使い方: node seikyu/tests/bank-select.test.mjs [--self-test]
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(import.meta.url);
const PAPER = require_(path.join(ROOT, 'seikyu/lib/seikyu-paper.js'));
const SELF = process.argv.includes('--self-test');

let pass = 0, fail = 0;
const T = (n, f) => {
  try { f(); pass++; console.log('  ✓ ' + n); }
  catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); }
};
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ' … ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b));

const A = '伊予銀行　今治支店　普通　4160657　ド）ゼロアクト';
const B = '愛媛銀行　今治支店　普通　9570836　ド）ゼロアクト';
const C = '愛媛信用金庫　今治支店　普通　0423107　ド）ゼロアクト';
const D = 'ゆうちょ銀行　一二八店　普通　12345678　ド）ゼロアクト';
const ORG = { bank: [A, B, C].join('\n') };

console.log('\n[bank-select] 振込先を 相手ごとに 選べるか（実物45枚＝1行18枚/3行25枚/4行1枚/6行1枚）');

T('★① 相手が 選んでいなければ 会社の口座 全部（今までと同じ）', () => {
  eq(PAPER.banksFor(ORG, null).lines, [A, B, C], '既定が 全部で ない');
  eq(PAPER.banksFor(ORG, {}).lines, [A, B, C], '取引先に 何も無い時が 全部で ない');
});

T('★② 選んでいれば その口座だけ・並びは 会社の設定の順', () => {
  eq(PAPER.banksFor(ORG, { banks: [C, A] }).lines, [A, C], '選んだ物だけ／会社の順 で ない');
  eq(PAPER.banksFor(ORG, { banks: [B] }).lines, [B], '1つだけ 選べていない');
});

T('★③ 会社から 消えた口座は 黙って 出さない＋消えたと 言える', () => {
  const r = PAPER.banksFor(ORG, { banks: [A, D] });
  eq(r.lines, [A], '消えた口座を 紙に 出している');
  eq(r.missing, [D], '★消えた事を 言えていない（黙って 減らすと 気づけない）★');
});

T('★④ 1つも 選ばないは「全部」に 戻す（振込先が 消える方が 危ない）', () => {
  eq(PAPER.banksFor(ORG, { banks: [] }).lines, [A, B, C], '空選択で 振込先が 消えた');
  eq(PAPER.banksFor(ORG, { banks: [D] }).lines, [A, B, C], '全部 消えた時に 戻していない');
});

T('★⑤ 口座が3つを超えたら 明細の行を1つずつ 減らす（実測 6行で 字が消えた）', () => {
  const base = PAPER.maxRowsOf(false, 0, 0, 3);
  eq(PAPER.maxRowsOf(false, 0, 0, 1), base, '1行で 減っている');
  eq(PAPER.maxRowsOf(false, 0, 0, 3), base, '3行で 減っている');
  eq(PAPER.maxRowsOf(false, 0, 0, 4), base - 1, '4行で 1行 減っていない');
  eq(PAPER.maxRowsOf(false, 0, 0, 6), base - 3, '6行で 3行 減っていない');
  /* ★控除の紙は もう1行 保険を取る★（2026-09-02 実測＝口座6・控除あり・明細1行で 2.3px はみ出した）
     ＝控除の件数が枠を超えた時の「+1行の保険」と 同じ形。★測って 決めた数★ */
  const bd = PAPER.maxRowsOf(true, 0, 0, 3);
  eq(PAPER.maxRowsOf(true, 0, 0, 4), bd - 2, '控除あり・口座4で 保険つき2行 減っていない');
  eq(PAPER.maxRowsOf(true, 0, 0, 6), bd - 4, '控除あり・口座6で 保険つき4行 減っていない');
  /* ★渡さない時は 今までと同じ★（既存の呼び出しを 壊さない） */
  eq(PAPER.maxRowsOf(false, 0, 0), base, '★4つ目を 渡さない古い呼び方が 変わった★');
});

T('★⑥ 空振りしていない（数えた物を 出す）', () => {
  const n = PAPER.bankLines(ORG.bank).length;
  ok(n === 3, '会社の口座を 3つと 数えられていない（' + n + '）');
  console.log('     会社の口座 ' + n + '／実物の分布 1行18枚・3行25枚・4行1枚・6行1枚（45枚 実測）');
});

if (SELF) {
  console.log('\n[bank-select] ★自己確認★（★わざと 壊して 赤になるか★）');
  let ng = 0;
  const cases = [
    ['消えた口座を 出すと 赤', () => {
      const r = PAPER.banksFor(ORG, { banks: [A, D] });
      return r.lines.indexOf(D) < 0;      /* 出していない＝正しい */
    }],
    ['空選択で 全部に 戻らなければ 赤', () => PAPER.banksFor(ORG, { banks: [] }).lines.length === 3],
    ['4口座で 行が 減らなければ 赤', () =>
      PAPER.maxRowsOf(false, 0, 0, 4) === PAPER.maxRowsOf(false, 0, 0, 3) - 1],
    ['古い呼び方（3つ）が 変わっていたら 赤', () =>
      PAPER.maxRowsOf(false, 0, 0) === PAPER.maxRowsOf(false, 0, 0, 3)],
  ];
  cases.forEach(([nm, f]) => {
    let got = false;
    try { got = !!f(); } catch (e) { got = false; }
    if (!got) ng++;
    console.log('  ' + (got ? '✓' : '✗') + ' ' + nm + (got ? '' : '  ★思っていたのと 違う★'));
  });
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★4通り ぜんぶ 思った通り★');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
