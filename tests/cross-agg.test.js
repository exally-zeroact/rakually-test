/* cross-agg.test.js — E5 横断集計（事業別のまとめ）の純関数テスト
 * 契約 = docs/SPEC_E5_cross.md
 *   源 = pay_org.data.businesses（事業グループ）× pay_ledger（実績）
 *   「どの事業でいくら」を横断で出す。読める一覧＋バーのみ（散布図・凝ったグラフ禁止）。
 *
 * ★E1の集計(lib/aggregate.js)との違い★
 *   E1 = 期間を1つ選んで、その期間の事業別。
 *   E5 = 月をまたいで並べる。①事業ごとの合計（期間全体）②事業×月の推移 ③登録済みだが実績0の事業も出す
 *        （＝「動いていない事業」が見える。0を隠さない）。
 * ★実数値リテラルで検算する（自己参照で計算しない）。
 */
'use strict';
const assert = require('assert');
const CA = require('../lib/cross-agg.js');

const T = [];
function test(name, fn) { T.push({ name, fn }); }
function row(employeeId, ymd, data) { return { id: 'lg_' + ymd + '_' + Math.random().toString(36).slice(2, 6), employeeId, ymd, data }; }
function emp(id, name, business) { return { id, name, business: business || '' }; }

// 3か月・3事業の実データ相当
function fixture() {
  return {
    businesses: ['代行', '空調', 'EC'],
    employees: [emp('e1', '山田', '空調'), emp('e2', '鈴木', '代行'), emp('e3', '佐藤', '')],
    ledgerRows: [
      // 5月
      row('e2', '2026-05-10', { uriage: 10000 }),                    // 代行
      row('e1', '2026-05-20', { uriage: 50000 }),                    // 空調
      // 6月
      row('e2', '2026-06-05', { uriage: 20000 }),                    // 代行
      row('e2', '2026-06-06', { uriage: 5000, business: '空調' }),   // 行の指定が優先 → 空調
      row('e3', '2026-06-15', { uriage: 3000 }),                     // 未分類
      // 7月
      row('e1', '2026-07-01', { uriage: 70000 }),                    // 空調
      row('e2', '2026-07-02', { uriage: 30000 }),                    // 代行
      row('e2', '2026-07-03', { uriage: 1000, amount: 500, count: 2, minutes: 90 })  // 代行
    ]
  };
}

/* ═══ 事業ごとの合計（期間全体） ═══ */

test('★事業ごとの合計が実数値で合う', () => {
  const r = CA.crossByBusiness(Object.assign(fixture(), { from: '2026-05-01', to: '2026-07-31' }));
  const g = (b) => r.rows.filter(x => x.business === b)[0];
  assert.strictEqual(g('空調').sales, 125000, '50000+5000+70000');
  assert.strictEqual(g('代行').sales, 61000, '10000+20000+30000+1000');
  assert.strictEqual(g('未分類').sales, 3000);
  assert.strictEqual(r.total.sales, 189000, '125000+61000+3000');
  assert.strictEqual(r.total.rows, 8, '行数');
});

test('★登録済みだが実績0の事業も出す（動いていない事業が見える）', () => {
  const r = CA.crossByBusiness(Object.assign(fixture(), { from: '2026-05-01', to: '2026-07-31' }));
  const ec = r.rows.filter(x => x.business === 'EC')[0];
  assert.ok(ec, 'ECが消えている（登録した事業は0でも出す）');
  assert.strictEqual(ec.sales, 0);
  assert.strictEqual(ec.rows, 0);
  assert.strictEqual(ec.registered, true, '登録済みの印');
});

test('登録に無い事業（未分類など）は実績がある時だけ出る', () => {
  const f = fixture();
  const r = CA.crossByBusiness(Object.assign(f, { from: '2026-05-01', to: '2026-05-31' }));
  assert.strictEqual(r.rows.filter(x => x.business === '未分類').length, 0, '5月に未分類の実績は無い');
  const r2 = CA.crossByBusiness(Object.assign(fixture(), { from: '2026-06-01', to: '2026-06-30' }));
  assert.strictEqual(r2.rows.filter(x => x.business === '未分類')[0].registered, false, '登録済みではない印');
});

test('並びは多い順・未分類は最後・実績0の事業はその手前', () => {
  const r = CA.crossByBusiness(Object.assign(fixture(), { from: '2026-05-01', to: '2026-07-31' }));
  assert.deepStrictEqual(r.rows.map(x => x.business), ['空調', '代行', 'EC', '未分類'],
    '実績のある順 → 実績0の登録事業 → 未分類');
});

test('売上以外（金額・件数・時間）も横断で合う', () => {
  const r = CA.crossByBusiness(Object.assign(fixture(), { from: '2026-05-01', to: '2026-07-31' }));
  const daiko = r.rows.filter(x => x.business === '代行')[0];
  assert.strictEqual(daiko.amount, 500);
  assert.strictEqual(daiko.count, 2);
  assert.strictEqual(daiko.workMin, 90);
  assert.strictEqual(r.total.amount, 500);
});

/* ═══ 構成比とバー ═══ */

test('構成比は売上基準・バーは一番大きい事業が満幅', () => {
  const r = CA.crossByBusiness({
    businesses: ['A', 'B'], employees: [emp('e1', '甲', '')],
    ledgerRows: [row('e1', '2026-07-01', { uriage: 750, business: 'A' }), row('e1', '2026-07-01', { uriage: 250, business: 'B' })],
    from: '2026-07-01', to: '2026-07-31'
  });
  assert.strictEqual(r.basis, 'uriage');
  assert.strictEqual(r.rows[0].pct, 75);
  assert.strictEqual(r.rows[1].pct, 25);
  assert.strictEqual(r.rows[0].bar, 1);
  assert.strictEqual(Math.round(r.rows[1].bar * 1000) / 1000, 0.333);
});

test('売上が全部0なら金額基準・どちらも0ならバーを出さない（0で割らない）', () => {
  const a = CA.crossByBusiness({
    businesses: [], employees: [emp('e1', '甲', '')],
    ledgerRows: [row('e1', '2026-07-01', { amount: 6000, business: 'A' }), row('e1', '2026-07-01', { amount: 2000, business: 'B' })],
    from: '2026-07-01', to: '2026-07-31'
  });
  assert.strictEqual(a.basis, 'amount');
  assert.strictEqual(a.rows[0].pct, 75);
  const b = CA.crossByBusiness({
    businesses: [], employees: [emp('e1', '甲', '')],
    ledgerRows: [row('e1', '2026-07-01', { minutes: 60, business: 'A' })],
    from: '2026-07-01', to: '2026-07-31'
  });
  assert.strictEqual(b.basis, null);
  assert.strictEqual(b.rows[0].bar, 0);
  assert.strictEqual(b.rows[0].pct, 0);
});

/* ═══ 事業×月の推移 ═══ */

test('★月ごとの推移が実数値で合う（月の並びは古い順・抜けた月も0で出す）', () => {
  const r = CA.crossByBusiness(Object.assign(fixture(), { from: '2026-05-01', to: '2026-07-31' }));
  assert.deepStrictEqual(r.months, ['2026-05', '2026-06', '2026-07']);
  const g = (b) => r.rows.filter(x => x.business === b)[0];
  assert.deepStrictEqual(g('空調').byMonth, { '2026-05': 50000, '2026-06': 5000, '2026-07': 70000 });
  assert.deepStrictEqual(g('代行').byMonth, { '2026-05': 10000, '2026-06': 20000, '2026-07': 31000 });
  assert.deepStrictEqual(g('未分類').byMonth, { '2026-05': 0, '2026-06': 3000, '2026-07': 0 }, '実績が無い月は0で埋める');
  assert.deepStrictEqual(g('EC').byMonth, { '2026-05': 0, '2026-06': 0, '2026-07': 0 });
  assert.deepStrictEqual(r.totalByMonth, { '2026-05': 60000, '2026-06': 28000, '2026-07': 101000 });
});

test('月の合計が事業の合計と一致する（どこにも消えない）', () => {
  const r = CA.crossByBusiness(Object.assign(fixture(), { from: '2026-05-01', to: '2026-07-31' }));
  const monthSum = Object.values(r.totalByMonth).reduce((a, b) => a + b, 0);
  const bizSum = r.rows.reduce((a, x) => a + x.sales, 0);
  assert.strictEqual(monthSum, bizSum);
  assert.strictEqual(monthSum, r.total.sales);
});

test('1か月だけの期間でも推移が出る', () => {
  const r = CA.crossByBusiness(Object.assign(fixture(), { from: '2026-06-01', to: '2026-06-30' }));
  assert.deepStrictEqual(r.months, ['2026-06']);
  assert.strictEqual(r.total.sales, 28000);
});

test('年をまたぐ期間でも月が正しく並ぶ', () => {
  const r = CA.crossByBusiness({
    businesses: [], employees: [emp('e1', '甲', 'A')],
    ledgerRows: [row('e1', '2025-11-15', { uriage: 100 }), row('e1', '2026-01-10', { uriage: 300 })],
    from: '2025-11-01', to: '2026-01-31'
  });
  assert.deepStrictEqual(r.months, ['2025-11', '2025-12', '2026-01']);
  assert.deepStrictEqual(r.rows[0].byMonth, { '2025-11': 100, '2025-12': 0, '2026-01': 300 });
});

/* ═══ 事業の決まり方（E1/E2と同じ順） ═══ */

test('事業は 行の指定 → その人の既定 → 未分類', () => {
  const r = CA.crossByBusiness({
    businesses: [], employees: [emp('e1', '山田', '空調'), emp('e2', '佐藤', '')],
    ledgerRows: [
      row('e1', '2026-07-01', { uriage: 100, business: '代行' }),
      row('e1', '2026-07-02', { uriage: 200 }),
      row('e2', '2026-07-03', { uriage: 300 })
    ],
    from: '2026-07-01', to: '2026-07-31'
  });
  const by = {}; r.rows.forEach(x => { by[x.business] = x.sales; });
  assert.deepStrictEqual(by, { '代行': 100, '空調': 200, '未分類': 300 });
});

/* ═══ 空・壊れた入力 ═══ */

test('実績が無ければ empty=true・数字を作らない（登録事業は0で並ぶ）', () => {
  const r = CA.crossByBusiness({ businesses: ['代行', '空調'], employees: [], ledgerRows: [], from: '2026-07-01', to: '2026-07-31' });
  assert.strictEqual(r.empty, true);
  assert.strictEqual(r.total.sales, 0);
  assert.deepStrictEqual(r.rows.map(x => x.business), ['代行', '空調'], '登録した事業は0でも見せる');
  r.rows.forEach(x => assert.strictEqual(x.sales, 0));
});

test('事業も実績も無ければ行は空', () => {
  const r = CA.crossByBusiness({ businesses: [], employees: [], ledgerRows: [], from: '2026-07-01', to: '2026-07-31' });
  assert.strictEqual(r.empty, true);
  assert.deepStrictEqual(r.rows, []);
});

test('引数が無くても落ちない', () => {
  const r = CA.crossByBusiness();
  assert.strictEqual(r.empty, true);
  assert.deepStrictEqual(r.rows, []);
  assert.deepStrictEqual(r.months, []);
});

test('期間が逆・壊れていれば例外（黙って変な数字を出さない）', () => {
  assert.throws(() => CA.crossByBusiness({ from: '2026-07-31', to: '2026-07-01' }), /期間/);
  assert.throws(() => CA.crossByBusiness({ from: 'x', to: '2026-07-01' }), /期間/);
});

test('期間の外の行は入らない（他の月を混ぜない）', () => {
  const r = CA.crossByBusiness({
    businesses: [], employees: [emp('e1', '甲', 'A')],
    ledgerRows: [row('e1', '2026-06-30', { uriage: 999 }), row('e1', '2026-07-01', { uriage: 100 }), row('e1', '2026-08-01', { uriage: 999 })],
    from: '2026-07-01', to: '2026-07-31'
  });
  assert.strictEqual(r.total.sales, 100);
  assert.strictEqual(r.outOfRange, 2, '範囲外だった行数を正直に返す');
});

test('数字が文字列/カンマ付き/壊れていても落ちない', () => {
  const r = CA.crossByBusiness({
    businesses: [], employees: [emp('e1', '甲', 'A')],
    ledgerRows: [row('e1', '2026-07-01', { uriage: '4,200' }), row('e1', '2026-07-02', { uriage: 'あああ' }), row('e1', '2026-07-03', { uriage: null })],
    from: '2026-07-01', to: '2026-07-31'
  });
  assert.strictEqual(r.total.sales, 4200);
  assert.strictEqual(r.rows[0].rows, 3, '行数は3');
});

/* ═══ 実行 ═══ */
(async () => {
  let ng = 0;
  for (const t of T) {
    try { await t.fn(); console.log('  ok   ' + t.name); }
    catch (e) { ng++; console.log('  NG   ' + t.name + '\n       ' + (e && e.message)); }
  }
  console.log('\ncross-agg: ' + (T.length - ng) + '/' + T.length + ' passed');
  if (ng) process.exit(1);
})();
