/* paper-ask.test.mjs — ★紙の作りを「聞いてあげる」★（⑤明細の列・⑥紙の行数）
 * =============================================================================
 * ★なぜ★（指示役 2026-08-28 の順番 ⑤⑥）
 *   明細の列も 紙の行数も ★空欄と数字の欄を並べて 決めさせていた★。
 *   ★この2つは「聞く」より前に「数える」★＝もう作った請求書を数えれば 答えが出る。
 *
 * ここで見る物
 *   ① 1通も使っていない列を ★通数つきで★ 見つける
 *   ② ★消せない列（#・品名・金額）は 出さない★（紙が成り立たない）
 *   ③ ★1回でも使っていれば 出さない★（0円・0個は「使った」）
 *   ④ ★材料が足りない（3通未満）時は 何も言わない★（当てない）
 *   ⑤ 行数 … いちばん多い月・よくある数を 数え、★減らせる時だけ★ すすめる
 *   ⑥ ★増やす提案はしない★（2枚になった時は 画面の別の道が出す）
 *   ⑦ その場の返しが 数で出る／★2枚になる時は そう言う★
 *   ⑧ ★同じ入力なら 同じ答え★（決定論・AIを呼んでいない）
 *
 * 使い方: node seikyu/tests/paper-ask.test.mjs [--self-test]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);
const ASK = require_(path.join(HERE, '..', 'lib', 'seikyu-paper-ask.js'));
const COLS = require_(path.join(HERE, '..', 'lib', 'seikyu-cols.js'));

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' … 期待 ' + JSON.stringify(b) + ' / 実際 ' + JSON.stringify(a)); };

/* ★本物の列の道具を使う★（2か所で別の判定をしない） */
const SPEC = COLS.normalizeSpec({
  items: ['#', '品名・内容', '数量', '単位', '単価', '金額', '消費税', '摘要'],
});
const base = (o) => Object.assign({
  cols: SPEC, invoices: [], rows: 12, defaultRows: 12, answered: {},
  cellOf: (ln, col, i, spec) => COLS.cellOf(ln, col, i, spec),
  roleOf: (spec, col) => COLS.roleOfIn(spec, col),
}, o);

/** 明細の行を作る。指定しない列は 空 */
const line = (o) => Object.assign({ name: '', qty: '', unit: '', price: '', amount: '', rate: '', memo: '' }, o);
const inv = (lines) => ({ lines: lines });

console.log('\n[paper-ask] 紙の作りを 聞いてあげる（明細の列・紙の行数）');

/* ふつうに使っている3通（摘要だけ 1度も使っていない） */
const NORMAL = [
  inv([line({ name: '運転代行', qty: '1', unit: '式', price: '10000', amount: '10000', rate: 10 })]),
  inv([line({ name: '待機料', qty: '2', unit: '時間', price: '2000', amount: '4000', rate: 10 })]),
  inv([line({ name: '運転代行', qty: '3', unit: '式', price: '10000', amount: '30000', rate: 10 })]),
];

T('★① 1通も使っていない列を 通数つきで 見つける', () => {
  const u = ASK.unusedCols(base({ invoices: NORMAL }));
  eq(u.map((x) => x.col).join(','), '摘要', '見つけた列');
  eq(u[0].total, 3, '数えた通数');
  eq(u[0].used, 0, '使った通数');
  console.log('     「摘要」… 3通で 使った 0通');
});

T('★①-b ★計算で出る列（消費税）を「使っていない」と言わない★（2026-08-29 踏んだ）', () => {
  /* 消費税は ★seikyu-tax.js が出す物★で、しまってある明細には 入っていない。
     ＝★空に見えるのは 使っていないからではない★。ここを数えると 全社で「消せ」と言ってしまう。 */
  const u = ASK.unusedCols(base({ invoices: NORMAL })).map((x) => x.col);
  ok(u.indexOf('消費税') < 0, '★計算で出る列を 消せと言っている★ ' + u.join(','));
  const all = ASK.colUsage(base({ invoices: NORMAL }));
  const tax = all.filter((x) => x.col === '消費税')[0];
  ok(tax && tax.derived, '★消費税が「打つ列ではない」と 印されていない★');
  console.log('     消費税 … 使った ' + tax.used + '通だが ★打つ列ではない★ので すすめない');
});

T('★② 消せない列（#・品名・金額）は 出さない', () => {
  /* 品名も金額も 空の3通＝それでも 消す候補に しない */
  const empty = [inv([line({})]), inv([line({})]), inv([line({})])];
  const u = ASK.unusedCols(base({ invoices: empty })).map((x) => x.col);
  ok(u.indexOf('#') < 0 && u.indexOf('品名・内容') < 0 && u.indexOf('金額') < 0,
    '★紙が成り立たない列を 消そうとしている★ ' + u.join(','));
  console.log('     消す候補 … ' + u.join(' / ') + '（#・品名・金額は 入っていない）');
});

T('★③ 1回でも使っていれば 出さない（0は「使った」）', () => {
  const withZero = NORMAL.concat([inv([line({ name: 'x', memo: '0' })])]);
  const u = ASK.unusedCols(base({ invoices: withZero })).map((x) => x.col);
  ok(u.indexOf('摘要') < 0, '★1通で「0」と入れているのに 消そうとしている★');
  console.log('     摘要に「0」が1通 → 消す候補から 外れた');
});

T('★④ 材料が足りない（3通未満）時は 何も言わない', () => {
  eq(ASK.unusedCols(base({ invoices: NORMAL.slice(0, 2) })).length, 0, '2通で 決めつけている');
  eq(ASK.unusedCols(base({ invoices: [] })).length, 0, '0通で 決めつけている');
  eq(ASK.rowStats(base({ invoices: NORMAL.slice(0, 2) })), null, '2通で 行数を決めつけている');
});

T('★⑤ 行数 … いちばん多い月・よくある数を 数える', () => {
  const many = [
    inv([line({ name: 'a' }), line({ name: 'b' })]),
    inv([line({ name: 'a' }), line({ name: 'b' })]),
    inv([line({ name: 'a' }), line({ name: 'b' }), line({ name: 'c' }), line({ name: 'd' })]),
  ];
  const st = ASK.rowStats(base({ invoices: many }));
  eq(st.n, 3, '数えた通数'); eq(st.max, 4, 'いちばん多い月'); eq(st.mode, 2, 'よくある数');
  const g = ASK.rowsGuess(base({ invoices: many, rows: 12, defaultRows: 12 }));
  ok(g, '当てられていない');
  eq(g.value, 4, 'すすめる行数');
  ok(/いちばん多い月で 4行/.test(g.why), '根拠が「' + g.why + '」');
  ok(/よくあるのは 2行・2通/.test(g.why), '根拠に よくある数が無い：「' + g.why + '」');
  console.log('     3通 … 最大4行／よくあるのは2行 → すすめ 4行（今の枠 12行）');
});

T('★⑥ 増やす提案はしない（減らせる時だけ言う）', () => {
  const many = [
    inv(Array.from({ length: 20 }, (_, i) => line({ name: 'x' + i }))),
    inv(Array.from({ length: 20 }, (_, i) => line({ name: 'y' + i }))),
    inv(Array.from({ length: 20 }, (_, i) => line({ name: 'z' + i }))),
  ];
  eq(ASK.rowsGuess(base({ invoices: many, rows: 12, defaultRows: 12 })), null,
    '★枠より多いのに「増やせ」と言っている★（2枚になった時の道は 画面が持っている）');
  /* ちょうど同じ数でも 言わない（減らせない） */
  const same = [inv([line({ name: 'a' })]), inv([line({ name: 'a' })]), inv([line({ name: 'a' })])];
  eq(ASK.rowsGuess(base({ invoices: same, rows: 1, defaultRows: 1 })), null, '減らせないのに 言っている');
});

T('★⑦ その場の返しが 数で出る（2枚になる時は そう言う）', () => {
  const many = [
    inv([line({ name: 'a' }), line({ name: 'b' })]),
    inv([line({ name: 'a' }), line({ name: 'b' })]),
    inv([line({ name: 'a' }), line({ name: 'b' }), line({ name: 'c' }), line({ name: 'd' })]),
  ];
  const qs = ASK.questions(base({ invoices: many, rows: 12, defaultRows: 12 }));
  const rq = qs.filter((q) => q.key === 'rows')[0];
  ok(rq, '行数の問いが 無い');
  ok(/いちばん多い月（4行）も 1枚に入ります/.test(rq.result('4')), '4行の返し：' + rq.result('4'));
  ok(/★4行の月は 2枚になります★/.test(rq.result('2')), '2行の返し：' + rq.result('2'));
  eq(rq.result(''), '', '空に 何か言っている');
  const cq = qs.filter((q) => /^col:/.test(q.key))[0];
  ok(cq, '列の問いが 無い');
  ok(/品名・内容の欄が その分 広くなります/.test(cq.result('yes')), '消す時の返し：' + cq.result('yes'));
  ok(/このまま 残します/.test(cq.result('no')), '残す時の返し：' + cq.result('no'));
});

T('★⑧ 1問ずつ進む／同じ入力なら 同じ答え（決定論）', () => {
  const c = base({ invoices: NORMAL, rows: 12, defaultRows: 12 });
  const p = ASK.progress(c);
  ok(p.total >= 1, '問いが 0個');
  eq(p.done, 0, '答えた数');
  const p2 = ASK.progress(base({ invoices: NORMAL, rows: 12, defaultRows: 12, answered: { 'col:摘要': true } }));
  eq(p2.done, 1, '答えた印が 効いていない');
  const a = JSON.stringify(ASK.unusedCols(c)), b = JSON.stringify(ASK.unusedCols(c));
  eq(a, b, '2回で 答えが違う');
  const src = ASK.questions.toString() + ASK.unusedCols.toString() + ASK.rowsGuess.toString();
  ok(!/fetch\(|XMLHttpRequest|Math\.random|new Date\(\)/.test(src),
    '★外へ出る／その時の時刻や運で変わる書き方が 混じっている★');
});

/* ═══ ★自己確認：わざと壊して 赤になるか★ ═══ */
if (process.argv.includes('--self-test')) {
  console.log('\n[paper-ask --self-test] ★わざと壊して 赤になるか★');
  T('★自① 使っている列を 消す候補に できない（＝数えが 効いている）', () => {
    const used = NORMAL.concat([inv([line({ name: 'x', memo: 'あり' })])]);
    const u = ASK.unusedCols(base({ invoices: used })).map((x) => x.col);
    ok(u.indexOf('摘要') < 0, '★使っているのに 消す候補に している★');
    const u2 = ASK.unusedCols(base({ invoices: NORMAL })).map((x) => x.col);
    ok(u2.indexOf('摘要') >= 0, '★使っていない時に 見つけられない＝この検査は空振り★');
  });
  T('★自② 通数の下限が 効いている（1通で決めつけない）', () => {
    ok(ASK.MIN_N >= 3, '下限が ' + ASK.MIN_N + '＝少なすぎる');
    eq(ASK.unusedCols(base({ invoices: NORMAL.slice(0, ASK.MIN_N - 1) })).length, 0, '下限が 効いていない');
    ok(ASK.unusedCols(base({ invoices: NORMAL.slice(0, ASK.MIN_N) })).length > 0, '下限ちょうどで 言わない');
  });
  T('★自③ 根拠に 数が入っている（「使っていません」だけにしない）', () => {
    const q = ASK.questions(base({ invoices: NORMAL }))[0];
    ok(/3通/.test(q.guess.why), '★根拠に 通数が無い★「' + q.guess.why + '」');
  });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
