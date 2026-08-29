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
  /* ★2026-08-29 直した★（司さん「件名はどこにでる？」）
     前は「紙の頭に刷ります」と返していたが ★実測では 紙に0回★＝★嘘を返していた★。
     ★出る所を そのまま言う★に直した。 */
  const r1 = sub.result('9月分 運転代行');
  ok(/Excelの「件名」に「9月分 運転代行」と入ります/.test(r1), '件名の返し：' + r1);
  ok(/紙には 出ません/.test(r1), '★紙に出ない事を 言っていない★：' + r1);
  ok(!/紙の頭に/.test(r1), '★まだ「紙の頭に刷ります」と言っている★：' + r1);
  /* ★「出す」にした時は 言い方が変わる★（設定に追わせる＝言い切らない） */
  const sub2 = ASK.questions(base({ issue: '2026-10-05', subjectOnPaper: true }))
    .filter((q) => q.key === 'subject')[0];
  const r2 = sub2.result('9月分 運転代行');
  ok(/紙の宛名の下に「件名　9月分 運転代行」と刷ります/.test(r2),
    '★「出す」にしたのに 出ないと言っている★：' + r2);
  ok(!/出ません/.test(r2), '★「出す」なのに「出ません」と言っている★：' + r2);
  ok(/空のまま/.test(sub.result('')), '空の時の返し：' + sub.result(''));
  ok(/2026年11月30日 までに もらう約束/.test(due.result('2026-11-30')), '期限の返し：' + due.result('2026-11-30'));
  ok(/請求日から 56日後/.test(due.result('2026-11-30')), '日数が出ていない：' + due.result('2026-11-30'));
  eq(due.result('めちゃくちゃ'), '', '★読めない日に 何か言っている（嘘を返している）★');
});

T('★⑥-b ★本当に紙に出ないのか 実物の紙で数える★（言葉だけ直さない）', () => {
  const PAPER = require_(path.join(HERE, '..', 'lib', 'seikyu-paper.js'));
  const TPL = require_(path.join(HERE, '..', 'lib', 'seikyu-templates.js'));
  const TAX = require_(path.join(HERE, '..', 'lib', 'seikyu-tax.js'));
  const MARK = 'ZZ件名テストZZ';
  const lines = [{ name: '運転代行', qty: '1', unit: '式', price: '10000', rate: 10 }];
  const tax = TAX.compute({ lines: lines, mode: 'exclusive', rounding: 'floor' });
  const v = { no: 'A-1', issue_ymd: '2026-10-05', due_ymd: '2026-11-30', kind: 'invoice',
    data: { subject: MARK }, lines: lines, totals: { grandTotal: 11000 } };
  const ids = TPL.list().map((t) => t.id || t.key || t);
  ok(ids.length >= 3, '様式が ' + ids.length + '個＝数えられていない');
  const hit = ids.map((id) => {
    const h = PAPER.build({ inv: v, tax: tax, partner: { name: '○○建設株式会社', honor: '御中' },
      org: { yago: '合同会社Rakunally', addr: '愛媛県今治市', invoiceNo: 'T3500003003293' },
      template: TPL.getOrDefault(id) });
    const str = typeof h === 'string' ? h : ((h && h.html) || JSON.stringify(h));
    ok(str.length > 500, id + ' … 紙が作れていない（' + str.length + '字）＝数えても意味が無い');
    return { id: id, n: (str.match(new RegExp(MARK, 'g')) || []).length };
  });
  const out = hit.map((x) => x.id + '=' + x.n).join(' / ');
  ok(hit.every((x) => x.n === 0), '★既定なのに 紙に件名が出ている★ ' + out);
  /* ★出る組でも 数える★（片方だけ見て「効いている」と言わない）
     ＝司さん 2026-08-29「件名がいる会社もあるやろうから対応させとけ」で 出せるようにした所。 */
  const on = ids.map((id) => {
    const h = PAPER.build({ inv: v, tax: tax, partner: { name: '○○建設株式会社', honor: '御中' },
      org: { yago: '合同会社Rakunally', addr: '愛媛県今治市', invoiceNo: 'T3500003003293' },
      template: TPL.getOrDefault(id), style: { subjectOn: true } });
    const str = typeof h === 'string' ? h : ((h && h.html) || JSON.stringify(h));
    return { id: id, n: (str.match(new RegExp(MARK, 'g')) || []).length };
  });
  const out2 = on.map((x) => x.id + '=' + x.n).join(' / ');
  ok(on.every((x) => x.n === 1), '★「出す」にしたのに 紙に出ない（または2回出ている）★ ' + out2);
  console.log('     紙に件名が出た回数 … 既定 ' + out + ' ／ 「出す」 ' + out2
    + '（★出る組・出ない組の 両方で数えた★）');
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

/* ═══ ★対象期間（締め期間から当てる）★ ═══════════════════════════════
   ★締め日は 請求書に 持っていません★（給与の締めとは 別物）＝出した紙から 当てる。
   期間の計算そのものは ★正本のまま借りた seikyu-kikan.js★（124通りは kikan.test.mjs が測る）。
   ここで見るのは ★当て方★＝「いつ当てるか」「★いつ当てないか★」。 */
const KIK = require_(path.join(HERE, '..', 'lib', 'seikyu-kikan.js'));
/* ★相手を付ける★（2026-08-29 司さんの指摘で ★相手ごと★に数える形へ変えた。
   相手の無い見本は もう 当たらない＝それが 正しい）。 */
const withLead = (lead) => inv({ partner_id: 'p1', status: 'issued', data: { lead } });
const baseP = (o) => base(Object.assign({ inv: inv({ partner_id: 'p1' }) }, o));

T('★⑨ 出した紙 2通から 締め日を当てる（21日〜20日 → 締め日20）', () => {
  const c = baseP({ others: [withLead('対象期間 2025/6/21 〜 2025/7/20'), withLead('対象期間 2025/7/21 〜 2025/8/20')] });
  const g = ASK.closeDayGuess(c);
  ok(g, '★2通 揃っているのに 当てていない★');
  eq(g.closeDay, 20, '締め日');
  eq(g.n, 2, '根拠の通数');
  console.log('     締め日 ' + g.closeDay + '（' + g.n + '通から）');
});

T('★⑩ 1通しか無い時は 当てない（決めつけない）', () => {
  const c = baseP({ others: [withLead('対象期間 2025/6/21 〜 2025/7/20')] });
  eq(ASK.closeDayGuess(c), null, '1通で 当てている');
  eq(ASK.periodGuess(c), null, '1通で 期間を出している');
});

T('★⑪ 請求日から「締まったばかりの月」を出す（請求日が 締め日より前なら 前の月）', () => {
  const others = [withLead('2025/6/21 〜 2025/7/20'), withLead('2025/7/21 〜 2025/8/20')];
  const a = ASK.periodGuess(baseP({ issue: '2025-09-25', others }));
  eq(a.value, '2025/8/21 〜 2025/9/20', '締め日より後に出した時');
  const b = ASK.periodGuess(baseP({ issue: '2025-09-15', others }));
  eq(b.value, '2025/7/21 〜 2025/8/20', '★締め日より前に出した時（まだ 締まっていない）★');
  console.log('     9/25発行 → ' + a.value + ' ／ 9/15発行 → ' + b.value);
});

T('★⑫ 末日締めは「◯/1 〜 ◯/末日」（2月を 実物で確かめる）', () => {
  const others = [withLead('2025/12/1 〜 2025/12/31'), withLead('2026/1/1 〜 2026/1/31')];
  eq(ASK.closeDayGuess(baseP({ others })).closeDay, 31, '末日締めを 31 と読めていない');
  const p = ASK.periodGuess(baseP({ issue: '2026-03-05', others }));
  eq(p.value, '2026/2/1 〜 2026/2/28', '★平年2月の末日★');
  const q = ASK.periodGuess(baseP({ issue: '2024-03-05', others }));
  eq(q.value, '2024/2/1 〜 2024/2/29', '★うるう年2月の末日★');
  console.log('     平年 ' + p.value + ' ／ うるう年 ' + q.value);
});

T('★⑬ 読めない紙・読めない請求日では 当てない', () => {
  eq(ASK.closeDayGuess(baseP({ others: [withLead('毎月ぶん'), withLead('いつもの')] })), null, '言葉から 数を作っている');
  const others = [withLead('2025/6/21 〜 2025/7/20'), withLead('2025/7/21 〜 2025/8/20')];
  eq(ASK.periodGuess(baseP({ issue: 'めちゃくちゃ', others })), null, '★読めない請求日で 期間を作っている★');
});

T('★⑭ 当てられた時だけ 問いが増える（答えられない欄を 増やさない）', () => {
  const none = ASK.questions(baseP({})).map((q) => q.key);
  ok(none.indexOf('period') < 0, '★材料が無いのに 対象期間を 聞いている★ ' + none.join(','));
  const others = [withLead('2025/6/21 〜 2025/7/20'), withLead('2025/7/21 〜 2025/8/20')];
  const qs = ASK.questions(baseP({ issue: '2025-09-25', others }));
  const q = qs.filter((x) => x.key === 'period')[0];
  ok(q, '★当てられるのに 聞いていない★ ' + qs.map((x) => x.key).join(','));
  ok(/締め日/.test(q.guess.why), '★根拠に 締め日が 無い★「' + q.guess.why + '」');
  ok(/1行/.test(q.hint), '★どこに出るかを 言っていない★');
  console.log('     問い ' + qs.map((x) => x.key).join(' → '));
  console.log('     根拠: ' + q.guess.why);
});

/* ★★相手ごとに 数える★★（司さん 2026-08-29
     「複数種類の請求書を作成する会社に対しては？ おれの場合でも そのパターンは 八木工業だけやし
       代行や 空調系は また違うやろ」）
   ★実測で 出た欠陥★＝会社ぜんぶの紙を数えていたので、代行の相手（末日締め）に出す1通に
     八木工業の「21日〜20日」が 出た。 */
const ivp = (pid, lead) => inv({ partner_id: pid, status: 'issued', data: { lead } });
const MIXED = [
  ivp('yagi', '2026/6/21 〜 2026/7/20'), ivp('yagi', '2026/7/21 〜 2026/8/20'), ivp('yagi', '2026/8/21 〜 2026/9/20'),
  ivp('daiko', '2026/8/1 〜 2026/8/31'), ivp('daiko', '2026/9/1 〜 2026/9/30'),
  ivp('kucho', '2026/9/11 〜 2026/10/10'),
];
const forP = (pid) => base({ inv: inv({ partner_id: pid }), issue: '2026-10-25', others: MIXED });

T('★⑯ 相手ごとに 締めが違う会社で、相手ごとの答えを出す（よその型を 混ぜない）', () => {
  eq(ASK.periodGuess(forP('yagi')).value, '2026/9/21 〜 2026/10/20', '★八木（21〜20）★');
  eq(ASK.periodGuess(forP('daiko')).value, '2026/9/1 〜 2026/9/30', '★代行（末日締め）に 八木の型が 出ている★');
  eq(ASK.periodGuess(forP('kucho')), null, '★1通しか無い相手に 当てている★');
  console.log('     八木 ' + ASK.periodGuess(forP('yagi')).value
    + ' ／ 代行 ' + ASK.periodGuess(forP('daiko')).value + ' ／ 空調（1通だけ）★当てない★');
});

T('★⑰ 根拠に「この相手の紙」と書く（会社ぜんぶの紙では ない）', () => {
  const w = ASK.periodGuess(forP('daiko')).why;
  ok(/この相手に 出した紙/.test(w), '★どの紙を数えたか 言っていない★「' + w + '」');
  ok(/末日/.test(w), '★末日締めを そう言っていない★「' + w + '」');
  console.log('     ' + w);
});

T('★⑱ 同じ相手の中で 締めが割れていたら 当てない（種類ちがいを 多い方に寄せない）', () => {
  const mix = [ivp('mix', '2026/8/1 〜 2026/8/31'), ivp('mix', '2026/8/21 〜 2026/9/20'),
    ivp('mix', '2026/7/21 〜 2026/8/20')];
  const c = base({ inv: inv({ partner_id: 'mix' }), issue: '2026-10-25', others: mix });
  eq(ASK.closeDayGuess(c), null, '★2対1で 多い方に 寄せている＝少ない方が 静かに間違う★');
  eq(ASK.periodGuess(c), null, '割れているのに 期間を出している');
});

T('★⑲ 相手が決まっていない時は 当てない', () => {
  eq(ASK.closeDayGuess(base({ inv: inv({}), issue: '2026-10-25', others: MIXED })), null,
    '★相手が空なのに 当てている★');
});

T('★⑮ 期間の計算を 自分で書いていない（借り物を そのまま 通している）', () => {
  const others = [withLead('2025/12/1 〜 2025/12/31'), withLead('2026/1/1 〜 2026/1/31')];
  const g = ASK.periodGuess(baseP({ issue: '2026-03-05', others }));
  eq(g.value, KIK.rangeLabel(KIK.period('2026-02', 31)), '★借り物と 違う答えを 出している★');
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
