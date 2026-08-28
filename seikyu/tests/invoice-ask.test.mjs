/* invoice-ask.test.mjs — ★この1通のことを「聞いてあげる」★（件名・支払期限）
 * =============================================================================
 * ★なぜ★（指示役 2026-08-28 の実測）
 *   請求書の画面は ★欄46・聞く形2（取引先だけ）★＝
 *   件名・支払期限・備考 などは ★空欄を並べて 埋めさせていた★（08-16の決定違反）。
 * ★決まり★ team/ask-dont-fill.md
 *   別ウィザードを作らない／1問ごと保存／答えたら その場で返す／
 *   ★機械が当てた物は「当てた」と根拠を見せる★／★AIは使わない（決定論）★
 *
 * ここで見る物
 *   ① 件名 … 前回から当てる／★「9月分」を 今回の月へ 置き換える★／根拠を持つ
 *   ② 前回が無ければ ★よく使う件名★から当てる（2通以上 同じ物が在る時だけ）
 *   ③ ★当てられない時は 当てない★（作り話をしない）
 *   ④ 支払期限 … ★型の持ち主は 取引先★／その型から出した日付を返す／根拠に日付を出す
 *   ⑤ ★読めない日・出せない日は 当てない★
 *   ⑥ その場の返し（result）が 数と日付で出る
 *   ⑦ ★同じ入力なら 同じ答え★（決定論・AIを呼んでいない）
 *
 * 使い方: node seikyu/tests/invoice-ask.test.mjs [--self-test]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);
const ASK = require_(path.join(HERE, '..', 'lib', 'seikyu-invoice-ask.js'));
const DOC = require_(path.join(HERE, '..', 'lib', 'seikyu-doc.js'));

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' … 期待 ' + JSON.stringify(b) + ' / 実際 ' + JSON.stringify(a)); };

/* 画面と同じ道具で 日付を出す（★2か所で別の計算をしない★） */
const dueFrom = (issue, term) => DOC.dueDateFrom(issue, term);
const PAY_TERMS = DOC.PAY_TERMS;

const inv = (o) => Object.assign({ no: '', due_ymd: '', data: {} }, o);
const base = (o) => Object.assign({
  inv: inv({}), issue: '2026-10-05', prev: null, others: [], partner: null,
  dueFrom, payTerms: PAY_TERMS, answered: {},
}, o);

console.log('\n[invoice-ask] この1通のことを 聞いてあげる（件名・支払期限）');

T('★① 件名は 前回から当てる（そのままの時）', () => {
  const g = ASK.subjectGuess(base({ prev: inv({ no: 'A-001', data: { subject: '運転代行ご利用料金' } }) }));
  ok(g, '当てられていない');
  eq(g.value, '運転代行ご利用料金', '当てた件名');
  ok(/前回（A-001）と同じ/.test(g.why), '根拠が「' + g.why + '」');
});

T('★①-b 「9月分」で始まる件名は 今回の月へ 置き換える', () => {
  const c = base({ issue: '2026-10-05', prev: inv({ no: 'A-001', data: { subject: '9月分 運転代行ご利用料金' } }) });
  const g = ASK.subjectGuess(c);
  /* 請求日 2026-10-05 の前月＝9月 … 同じなので そのまま */
  eq(g.value, '9月分 運転代行ご利用料金', '10月に出す＝9月分のまま');
  const c2 = base({ issue: '2026-11-05', prev: inv({ no: 'A-001', data: { subject: '9月分 運転代行ご利用料金' } }) });
  const g2 = ASK.subjectGuess(c2);
  eq(g2.value, '10月分 運転代行ご利用料金', '11月に出す＝10月分へ置き換え');
  ok(/月を、請求日の前月＝10月分 に置き換え/.test(g2.why), '根拠が「' + g2.why + '」');
});

T('★② 前回が無ければ よく使う件名から（2通以上の時だけ）', () => {
  const others = [
    inv({ data: { subject: '運転代行ご利用料金' } }),
    inv({ data: { subject: '運転代行ご利用料金' } }),
    inv({ data: { subject: '物販' } }),
  ];
  const g = ASK.subjectGuess(base({ others }));
  ok(g, '当てられていない');
  eq(g.value, '運転代行ご利用料金', 'いちばん多い件名');
  ok(/2通/.test(g.why), '根拠に 数が無い：「' + g.why + '」');
});

T('★③ 当てられない時は 当てない（作り話をしない）', () => {
  eq(ASK.subjectGuess(base({})), null, '材料が無いのに 当てている');
  /* 1通しか無い＝まだ「よく使う」とは言えない */
  eq(ASK.subjectGuess(base({ others: [inv({ data: { subject: '物販' } })] })), null, '1通で 決めつけている');
});

T('★④ 支払期限は 取引先の型から出す（型の持ち主は 取引先）', () => {
  const partner = { data: { name: '○○建設', payTerm: { kind: 'nextEom', n: 0 } } };
  const g = ASK.dueGuess(base({ issue: '2026-10-05', partner }));
  ok(g, '当てられていない');
  eq(g.value, '2026-11-30', '翌月末');
  ok(/この相手の「翌月末」から/.test(g.why), '根拠が「' + g.why + '」');
  ok(/2026年10月5日 → 2026年11月30日/.test(g.why), '根拠に 日付が出ていない：「' + g.why + '」');
});

T('★④-b 相手に型が無ければ 前回の型から（そう言う）', () => {
  const prev = inv({ no: 'A-001', data: { term: { kind: 'days', n: 30 } } });
  const g = ASK.dueGuess(base({ issue: '2026-10-05', prev }));
  ok(g, '当てられていない');
  eq(g.value, '2026-11-04', '30日後');
  ok(/前回（A-001）と同じ/.test(g.why), '根拠が「' + g.why + '」');
});

T('★⑤ 出せない時は 当てない（勝手な期限を作らない）', () => {
  eq(ASK.dueGuess(base({})), null, '材料が無いのに 当てている');
  eq(ASK.dueGuess(base({ partner: { data: { payTerm: { kind: 'none' } } } })), null, '「決めていない」から 日を作っている');
  eq(ASK.dueGuess(base({ issue: 'めちゃくちゃ', partner: { data: { payTerm: { kind: 'eom' } } } })), null,
    '読めない請求日から 日を作っている');
});

T('★⑥ その場の返しが 数と日付で出る', () => {
  const qs = ASK.questions(base({ issue: '2026-10-05' }));
  const sub = qs.filter((q) => q.key === 'subject')[0];
  const due = qs.filter((q) => q.key === 'due')[0];
  eq(sub.result('9月分 運転代行'), '紙の頭に「9月分 運転代行」と刷ります。', '件名の返し');
  eq(sub.result(''), '件名の行は 刷りません。', '空の時の返し');
  ok(/2026年11月30日 までに もらう約束/.test(due.result('2026-11-30')), '期限の返し：' + due.result('2026-11-30'));
  ok(/請求日から 56日後/.test(due.result('2026-11-30')), '日数が出ていない：' + due.result('2026-11-30'));
  eq(due.result('めちゃくちゃ'), '', '★読めない日に 何か言っている（嘘を返している）★');
});

T('★⑦ 1問ずつ進む（答えた物は もう聞かない）', () => {
  const p0 = ASK.progress(base({}));
  eq(p0.total, 2, '問いの数');
  eq(p0.done, 0, '答えた数');
  eq(p0.next.key, 'subject', '最初の問い');
  const p1 = ASK.progress(base({ inv: inv({ data: { subject: '物販' } }) }));
  eq(p1.done, 1, '件名が入っているのに 聞き直している');
  eq(p1.next.key, 'due', '次の問い');
  const p2 = ASK.progress(base({ inv: inv({ due_ymd: '2026-11-30', data: { subject: '物販' } }) }));
  eq(p2.done, 2, '両方 入っているのに 済みになっていない');
  eq(p2.next, null, 'まだ聞こうとしている');
});

T('★⑦-b 「要らない」と答えた物も 済み（空のまま 何度も聞かない）', () => {
  const p = ASK.progress(base({ answered: { subject: true } }));
  eq(p.done, 1, '「要らない」を 覚えていない');
  eq(p.next.key, 'due', '次の問い');
});

T('★⑧ 同じ入力なら 同じ答え（決定論・AIを呼んでいない）', () => {
  const mk = () => ASK.subjectGuess(base({ prev: inv({ no: 'A-1', data: { subject: '9月分 運転代行' } }), issue: '2026-12-03' }));
  const a = mk(), b = mk();
  eq(JSON.stringify(a), JSON.stringify(b), '2回で 答えが違う');
  eq(a.value, '11月分 運転代行', '12月に出す＝11月分');
  const src = ASK.questions.toString() + ASK.subjectGuess.toString() + ASK.dueGuess.toString();
  ok(!/fetch\(|XMLHttpRequest|Math\.random|new Date\(\)/.test(src),
    '★外へ出る／その時の時刻や運で変わる書き方が 混じっている★');
});

/* ═══ ★自己確認：わざと壊して 赤になるか★ ═══ */
if (process.argv.includes('--self-test')) {
  console.log('\n[invoice-ask --self-test] ★わざと壊して 赤になるか★');
  T('★自① 月の置き換えを止めたら 気づける', () => {
    const wrong = ASK.shiftMonth('9月分 運転代行', 'めちゃくちゃ');   // 請求日が読めない＝置き換えない
    eq(wrong, '9月分 運転代行', '読めない日で 勝手に置き換えている');
    const right = ASK.shiftMonth('9月分 運転代行', '2026-11-05');
    ok(right !== wrong, '★置き換えが 効いていない＝この検査は空振り★');
  });
  T('★自② 日数の計算が 効いている（0や null を返していない）', () => {
    eq(ASK.daysBetween('2026-10-05', '2026-11-30'), 56, '日数');
    eq(ASK.daysBetween('2026-10-05', 'x'), null, '読めない日で 数を作っている');
  });
  T('★自③ 当てた物には 必ず 根拠が付く', () => {
    const g = ASK.subjectGuess(base({ prev: inv({ no: 'A-1', data: { subject: '物販' } }) }));
    ok(g.why && g.why.length > 10, '★根拠が無い／短すぎる★「' + (g && g.why) + '」');
    const d = ASK.dueGuess(base({ partner: { data: { payTerm: { kind: 'eom' } } } }));
    ok(d.why && /→/.test(d.why), '★根拠に 出した日付が 無い★「' + (d && d.why) + '」');
  });
  T('★自④ 札（よく使う件名）は 多い順・重複なし', () => {
    const c = base({
      prev: inv({ data: { subject: 'A' } }),
      others: [inv({ data: { subject: 'B' } }), inv({ data: { subject: 'B' } }), inv({ data: { subject: 'A' } })],
    });
    const chips = ASK.subjectChips(c, 4);
    eq(chips.map((x) => x.v).join(','), 'A,B', '並びが ' + chips.map((x) => x.v).join(','));
  });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
