/* seikyu-carry.test.mjs — ★繰越（前回の残り）★
 *
 * なぜ必要か:
 *   掛け売り（毎月 締めて請求する商売）では ★ほぼ必須★の型。大手も既定で持っている。
 *   紙の頭に5行:
 *     前回請求額 ／ 入金額 ／ 繰越額 ／ 今回請求額 ／ 合計請求額
 *
 * ここで止めたい事故:
 *   ① ★入金が読めなかったのを 0円として繰越を計算する★
 *      → 払ってもらったのに「未入金」の紙を送る＝二重請求・誤督促。
 *      ★「未確認」と「0円」は必ず違う答えを返す★
 *   ② 初回（前回が無い）を「前回請求額 0円」と刷る
 *      → 0円の請求書を出したように読める。★「前回の請求はありません」★
 *   ③ 下書きや取り消した請求書を「前回」として辿る
 *   ④ ★出した紙が後から動く★（あとで入金が入ったら、去年の紙の繰越が変わる）
 *
 * 使い方: node seikyu/tests/seikyu-carry.test.mjs
 *         node seikyu/tests/seikyu-carry.test.mjs --self-test
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(path.join(ROOT, 'package.json'));
const CARRY = require_(path.join(ROOT, 'seikyu/lib/seikyu-carry.js'));

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };

const inv = (o) => Object.assign({
  id: 'iv1', partner_id: 'pt_a', doc_type: 'invoice', status: 'issued',
  no: '202608-001', issue_ymd: '2026-08-31', totals: { grandTotal: 50000 },
}, o);

/* ★純関数（self-test で作り物を通せる）★ やってはいけない方＝読めなかったを0にする */
export function carryNaive(prevTotal, receipts) {
  const paid = (receipts || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
  return { paid, carry: prevTotal - paid };
}

/* ── self-test：わざと壊して赤になるか ─────────────────────────────── */
if (process.argv.includes('--self-test')) {
  console.log('\n[seikyu-carry --self-test] わざと壊して赤になるか');
  let sp = 0, sf = 0;
  const S = (n, fn) => { try { fn(); sp++; console.log('  ✓ ' + n); } catch (e) { sf++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };

  S('① 読めなかったを0にする作り方は、払った相手に未入金の紙を送る', () => {
    const bad = carryNaive(50000, null);        // 読めなかった→0円扱い
    eq(bad.paid, 0, '作り物が0にしていない＝この検査が空振り');
    eq(bad.carry, 50000, '作り物が繰越を出している＝この検査が空振り');
    const good = CARRY.compute({ prev: inv(), receipts: null, thisTotal: 30000 });
    eq(good.state, 'unknown', '★本物が「未確認」を返していない★');
    eq(good.paid, null, '本物が入金を0にしている');
    eq(good.carry, null, '本物が繰越を数にしている（未確認なのに）');
  });

  S('② 初回を「前回請求額 0円」にすると、0円の請求書を出したように読める', () => {
    const naive = { prevTotal: 0 };
    eq(naive.prevTotal, 0, '作り物が0でない＝この検査が空振り');
    const good = CARRY.compute({ prev: null, receipts: [], thisTotal: 30000 });
    eq(good.state, 'first', '★本物が初回だと言っていない★');
    eq(good.prevTotal, null, '本物が前回請求額を0にしている');
  });

  console.log('\n[self-test] ' + sp + ' passed, ' + sf + ' failed');
  if (sf) process.exit(1);
}

/* ── 本体 ──────────────────────────────────────────────────────── */
console.log('\n[請求書 繰越]');

/* ① 前回を選ぶ ------------------------------------------------------ */
T('★「前回」＝同じ取引先の直前の発行済み（下書き・取り消しは辿らない）', () => {
  const all = [
    inv({ id: 'a', no: '202606-001', issue_ymd: '2026-06-30', status: 'issued' }),
    inv({ id: 'b', no: '202607-001', issue_ymd: '2026-07-31', status: 'void' }),
    inv({ id: 'c', no: '202607-002', issue_ymd: '2026-07-31', status: 'draft' }),
    inv({ id: 'd', no: '202608-001', issue_ymd: '2026-08-31', status: 'issued' }),
    inv({ id: 'e', no: '202608-002', issue_ymd: '2026-08-31', status: 'issued', partner_id: 'pt_b' }),
  ];
  const p = CARRY.prevOf(all, { id: 'new', partner_id: 'pt_a', issue_ymd: '2026-09-30' });
  eq(p && p.id, 'd', '直前の発行済みを選んでいない');

  // 取り消し・下書きしか無ければ「前回は無い」
  const only = [
    inv({ id: 'b', status: 'void', issue_ymd: '2026-07-31' }),
    inv({ id: 'c', status: 'draft', issue_ymd: '2026-07-31' }),
  ];
  eq(CARRY.prevOf(only, { id: 'new', partner_id: 'pt_a', issue_ymd: '2026-09-30' }), null);
});

T('★自分自身を「前回」にしない（開き直した時に自分を辿らない）', () => {
  const all = [inv({ id: 'me', no: '202609-001', issue_ymd: '2026-09-30' })];
  eq(CARRY.prevOf(all, { id: 'me', partner_id: 'pt_a', issue_ymd: '2026-09-30' }), null);
});

T('★同じ日に2通ある時は番号の大きい方が「前回」', () => {
  const all = [
    inv({ id: 'x', no: '202608-001', issue_ymd: '2026-08-31' }),
    inv({ id: 'y', no: '202608-002', issue_ymd: '2026-08-31' }),
  ];
  eq(CARRY.prevOf(all, { id: 'new', partner_id: 'pt_a', issue_ymd: '2026-09-30' }).id, 'y');
});

T('★未来の請求は「前回」にしない（請求日より後の物を辿らない）', () => {
  const all = [
    inv({ id: 'old', no: '202607-001', issue_ymd: '2026-07-31' }),
    inv({ id: 'future', no: '202612-001', issue_ymd: '2026-12-31' }),
  ];
  eq(CARRY.prevOf(all, { id: 'new', partner_id: 'pt_a', issue_ymd: '2026-09-30' }).id, 'old');
});

/* ② 5行の中身 ------------------------------------------------------- */
T('★5行が出る：前回請求額／入金額／繰越額／今回請求額／合計請求額', () => {
  const r = CARRY.compute({
    prev: inv({ id: 'p', totals: { grandTotal: 50000 } }),
    receipts: [{ invoice_id: 'p', amount: 30000, ymd: '2026-09-10' }],
    thisTotal: 20000,
  });
  eq(r.state, 'ok');
  eq(r.prevTotal, 50000);
  eq(r.paid, 30000);
  eq(r.carry, 20000, '繰越 = 前回 − 入金');
  eq(r.thisTotal, 20000);
  eq(r.grandTotal, 40000, '合計請求額 = 繰越 + 今回');
  eq(CARRY.ROWS.length, 5, '5行の並びが決まっていない');
});

T('★入金が複数回でも足す／別の請求の入金は数えない／消した入金は数えない', () => {
  const r = CARRY.compute({
    prev: inv({ id: 'p', totals: { grandTotal: 50000 } }),
    receipts: [
      { invoice_id: 'p', amount: 10000, ymd: '2026-09-05' },
      { invoice_id: 'p', amount: 15000, ymd: '2026-09-20' },
      { invoice_id: 'other', amount: 99999, ymd: '2026-09-20' },
      { invoice_id: 'p', amount: 5000, ymd: '2026-09-25', deleted_at: '2026-09-26T00:00:00Z' },
    ],
    thisTotal: 20000,
  });
  eq(r.paid, 25000);
  eq(r.carry, 25000);
  eq(r.grandTotal, 45000);
});

T('★過入金を0でクランプしない（繰越がマイナスになる事を隠さない）', () => {
  const r = CARRY.compute({
    prev: inv({ id: 'p', totals: { grandTotal: 50000 } }),
    receipts: [{ invoice_id: 'p', amount: 60000, ymd: '2026-09-10' }],
    thisTotal: 20000,
  });
  eq(r.paid, 60000);
  eq(r.carry, -10000, '★過入金を0にしている★');
  eq(r.grandTotal, 10000);
  eq(r.state, 'over');
});

/* ③ ★取れなかったを0や空にしない★ ---------------------------------- */
T('★入金が読めなかった時は「未確認」＝0件と必ず違う答え', () => {
  const unknown = CARRY.compute({ prev: inv({ id: 'p' }), receipts: null, thisTotal: 20000 });
  const zero = CARRY.compute({ prev: inv({ id: 'p' }), receipts: [], thisTotal: 20000 });
  ok(unknown.state !== zero.state, '未確認と0件が同じ答え');
  eq(unknown.state, 'unknown');
  eq(unknown.paid, null, '★読めなかったのに0円★');
  eq(unknown.carry, null, '★読めなかったのに繰越を数にしている★');
  eq(unknown.grandTotal, null, '★読めなかったのに合計請求額を出している★');
  // 0件の方は数で出る（払われていない、と分かっている）
  eq(zero.state, 'ok');
  eq(zero.paid, 0);
  eq(zero.carry, 50000);
});

T('★初回（前回が無い）は「前回の請求はありません」＝0円と書かない', () => {
  const r = CARRY.compute({ prev: null, receipts: [], thisTotal: 20000 });
  eq(r.state, 'first');
  eq(r.prevTotal, null, '前回請求額を0にしている');
  eq(r.paid, null);
  eq(r.carry, null);
  eq(r.thisTotal, 20000);
  eq(r.grandTotal, 20000, '初回は 合計請求額 = 今回請求額');
});

T('★言葉が用意されている（画面と紙で同じ物を使う）', () => {
  eq(CARRY.STATE_LABEL.unknown, '入金は未確認');
  eq(CARRY.STATE_LABEL.first, '前回の請求はありません');
  ok(CARRY.ROWS.every((r) => r.label && r.key), '5行の名前が揃っていない');
  eq(CARRY.ROWS.map((r) => r.key).join(','), 'prevTotal,paid,carry,thisTotal,grandTotal');
});

/* ④ ★出した紙は動かない★ ------------------------------------------ */
T('★発行時の5行は写しに残せる形（あとで入金しても過去の紙は動かない）', () => {
  const r = CARRY.compute({
    prev: inv({ id: 'p', no: '202608-001', totals: { grandTotal: 50000 } }),
    receipts: [{ invoice_id: 'p', amount: 30000, ymd: '2026-09-10' }],
    thisTotal: 20000,
  });
  const snap = CARRY.snapshotOf(r);
  eq(snap.prevNo, '202608-001', '前回の番号を残していない');
  eq(snap.prevTotal, 50000);
  eq(snap.paid, 30000);
  eq(snap.carry, 20000);
  eq(snap.grandTotal, 40000);
  eq(snap.state, 'ok');
  // 写しから読み直しても同じ物が出る
  const back = CARRY.fromSnapshot(snap);
  eq(back.grandTotal, r.grandTotal);
  eq(back.carry, r.carry);
  eq(back.state, r.state);
});

/* ⑤ ★入金を記録できるようになって初めて成り立つ筋★ -------------------
   2026-08-14 まで、入金を記録する所が無かった＝入金額は永久に0で、
   繰越は「前回請求額がそのまま繰り越される」だけの飾りだった。
   ★手計算★（実UIの検査 seikyu-ui.mjs 11-i と同じ数字を、libの側でも留める）
     前回 110,000 ／ 入金 40,000＋30,000＝70,000 ／ 繰越 110,000−70,000＝40,000
     今回 55,000 ／ 合計請求額 40,000＋55,000＝95,000 */
T('★★分けて払われた2回が繰越に効く（手計算 110,000 / 70,000 / 40,000 / 55,000 / 95,000）★★', () => {
  const prev = inv({ id: 'iv_sep', no: '202609-001', totals: { grandTotal: 110000 } });
  const r = CARRY.compute({
    prev: prev,
    receipts: [
      { invoice_id: 'iv_sep', amount: 40000, ymd: '2026-10-05' },
      { invoice_id: 'iv_sep', amount: 30000, ymd: '2026-10-20' },
      { invoice_id: 'iv_other', amount: 99999, ymd: '2026-10-21' },   // 別の請求＝混ぜない
    ],
    thisTotal: 55000,
  });
  eq(r.state, 'ok');
  eq(r.prevTotal, 110000, '前回請求額');
  eq(r.paid, 70000, '★入金額（ここが0のままなら、記録する所が繋がっていない）★');
  eq(r.carry, 40000, '繰越額');
  eq(r.thisTotal, 55000, '今回請求額');
  eq(r.grandTotal, 95000, '合計請求額');
});

T('★消した入金は繰越に入れない（打ち間違いを消したら、その場で数え直る）', () => {
  const prev = inv({ id: 'iv_sep', totals: { grandTotal: 110000 } });
  const rs = [
    { invoice_id: 'iv_sep', amount: 40000, ymd: '2026-10-05' },
    { invoice_id: 'iv_sep', amount: 30000, ymd: '2026-10-20' },
    { invoice_id: 'iv_sep', amount: 80000, ymd: '2026-10-25', deleted_at: '2026-10-26T00:00:00Z' },
  ];
  const r = CARRY.compute({ prev: prev, receipts: rs, thisTotal: 55000 });
  eq(r.paid, 70000, '消した入金を数えている');
  eq(r.carry, 40000);
  // 消していなければ 150,000 入って 40,000 の過入金（0でクランプしない）
  const live = CARRY.compute({
    prev: prev, thisTotal: 55000,
    receipts: rs.map((x) => ({ invoice_id: x.invoice_id, amount: x.amount, ymd: x.ymd })),
  });
  eq(live.paid, 150000);
  eq(live.carry, -40000, '★過入金が0でクランプされている★');
  eq(live.state, 'over');
  eq(live.grandTotal, 15000, '過入金は次回から引く（−40,000＋55,000＝15,000）');
});

T('★網羅：前回×入金×今回 を全部流して 繰越=前回−入金・合計=繰越+今回 が必ず一致', () => {
  const prevs = [null, 0, 1, 50000, 999999];
  const paids = [null, [], [0], [10000], [10000, 20000], [999999]];
  const thises = [0, 1, 20000, 1000000];
  let n = 0;
  for (const p of prevs) for (const rc of paids) for (const th of thises) {
    const prev = (p === null) ? null : inv({ id: 'p', totals: { grandTotal: p } });
    const receipts = (rc === null) ? null : rc.filter((x) => x !== 0).map((a) => ({ invoice_id: 'p', amount: a, ymd: '2026-09-10' }));
    const r = CARRY.compute({ prev: prev, receipts: receipts, thisTotal: th });
    n++;
    if (r.state === 'unknown' || r.state === 'first') {
      if (r.carry !== null && r.state === 'unknown') throw new Error('未確認なのに繰越が数');
      continue;
    }
    if (r.carry !== r.prevTotal - r.paid) throw new Error('繰越が合わない');
    if (r.grandTotal !== r.carry + r.thisTotal) throw new Error('合計請求額が合わない');
    for (const v of [r.prevTotal, r.paid, r.carry, r.thisTotal, r.grandTotal]) {
      if (!Number.isFinite(v)) throw new Error('NaN が出た');
      if (!Number.isInteger(v)) throw new Error('円未満が残った: ' + v);
    }
  }
  if (n < 80) throw new Error('組合せが少なすぎる（検査が空振り）: ' + n);
  console.log('     実測: ' + n + '通りで矛盾0件');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
