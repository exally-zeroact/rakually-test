/* aggregate.test.js — 事業別集計(E1の骨)の純関数テスト
 * 契約 = docs/SPEC_E1_hub.md §1-4
 *   ・事業の決まり方は 台帳行の business → その人の business → 「未分類」
 *   ・読める一覧＋横バーだけ(散布図なし)。構成比は売上基準、売上が全部0なら金額基準
 *   ・0件は正直に空(数字を作らない)
 *   ・並びは多い順・「未分類」は必ず最後
 * ★実数値リテラルで検算する(自己参照で計算しない)。
 */
'use strict';
const assert = require('assert');
const Agg = require('../lib/aggregate.js');

const T = [];
function test(name, fn) { T.push({ name, fn }); }

// 台帳行(suite-data の ledger.list が返す形)
function row(employeeId, ymd, data) { return { id: 'lg_' + Math.random().toString(36).slice(2), employeeId, ymd, data }; }
// 従業員(suite-data の employees.list が返す形)
function emp(id, name, business, employmentType) { return { id, name, business: business || '', employmentType: employmentType || '従業員' }; }

/* ═══ 事業の決まり方 ═══ */

test('事業は 台帳行の business が最優先', () => {
  const r = Agg.byBusiness({
    ledgerRows: [row('e1', '2026-07-01', { uriage: 1000, business: '空調' })],
    employees: [emp('e1', '山田', '代行')]
  });
  assert.strictEqual(r.rows.length, 1);
  assert.strictEqual(r.rows[0].business, '空調', '行の指定が人の既定に負けている');
});

test('台帳行に business が無ければ その人の business', () => {
  const r = Agg.byBusiness({
    ledgerRows: [row('e1', '2026-07-01', { uriage: 1000 })],
    employees: [emp('e1', '山田', '代行')]
  });
  assert.strictEqual(r.rows[0].business, '代行');
});

test('どちらも無ければ「未分類」（勝手に名前を作らない）', () => {
  const r = Agg.byBusiness({
    ledgerRows: [row('e1', '2026-07-01', { uriage: 1000 })],
    employees: [emp('e1', '山田', '')]
  });
  assert.strictEqual(r.rows[0].business, '未分類');
});

test('台帳に居ない人の行でも落ちず「未分類」になる', () => {
  const r = Agg.byBusiness({
    ledgerRows: [row('e_unknown', '2026-07-01', { uriage: 1000 })],
    employees: [emp('e1', '山田', '代行')]
  });
  assert.strictEqual(r.rows[0].business, '未分類');
  assert.strictEqual(r.total.uriage, 1000);
});

test('空白だけの business は未設定として扱う', () => {
  const r = Agg.byBusiness({
    ledgerRows: [row('e1', '2026-07-01', { uriage: 1000, business: '   ' })],
    employees: [emp('e1', '山田', '  ')]
  });
  assert.strictEqual(r.rows[0].business, '未分類');
});

/* ═══ 合計の正しさ(実数値) ═══ */

test('件数・売上・金額・時間が実数値で合う', () => {
  const r = Agg.byBusiness({
    ledgerRows: [
      row('e1', '2026-07-01', { uriage: 4200, amount: 1470, minutes: 90 }),
      row('e1', '2026-07-01', { uriage: 3800, amount: 1330, minutes: 75 }),
      row('e2', '2026-07-05', { uriage: 500, amount: 175, minutes: 20 })
    ],
    employees: [emp('e1', '山田', '代行'), emp('e2', '鈴木', '代行')]
  });
  assert.strictEqual(r.rows.length, 1);
  const d = r.rows[0];
  assert.strictEqual(d.business, '代行');
  assert.strictEqual(d.count, 3);
  assert.strictEqual(d.uriage, 8500);
  assert.strictEqual(d.amount, 2975);
  assert.strictEqual(d.minutes, 185);
  assert.strictEqual(r.total.count, 3);
  assert.strictEqual(r.total.uriage, 8500);
  assert.strictEqual(r.total.amount, 2975);
});

test('数字が文字列で入っていても足せる(カンマ付きも)', () => {
  const r = Agg.byBusiness({
    ledgerRows: [
      row('e1', '2026-07-01', { uriage: '4,200' }),
      row('e1', '2026-07-02', { uriage: '3800' })
    ],
    employees: [emp('e1', '山田', '代行')]
  });
  assert.strictEqual(r.total.uriage, 8000);
});

test('数字でない値は0として扱い、落ちない', () => {
  const r = Agg.byBusiness({
    ledgerRows: [
      row('e1', '2026-07-01', { uriage: 'あああ' }),
      row('e1', '2026-07-02', { uriage: null }),
      row('e1', '2026-07-03', {}),
      row('e1', '2026-07-04', { uriage: 500 })
    ],
    employees: [emp('e1', '山田', '代行')]
  });
  assert.strictEqual(r.total.uriage, 500);
  assert.strictEqual(r.total.count, 4, '件数は行数なので4');
});

/* ═══ 並び順 ═══ */

test('売上の多い順に並ぶ', () => {
  const r = Agg.byBusiness({
    ledgerRows: [
      row('e1', '2026-07-01', { uriage: 210000, business: '空調' }),
      row('e1', '2026-07-01', { uriage: 420000, business: '代行' }),
      row('e1', '2026-07-01', { uriage: 300000, business: 'EC' })
    ],
    employees: [emp('e1', '山田', '')]
  });
  assert.deepStrictEqual(r.rows.map(x => x.business), ['代行', 'EC', '空調']);
});

test('「未分類」は金額が大きくても必ず最後', () => {
  const r = Agg.byBusiness({
    ledgerRows: [
      row('e1', '2026-07-01', { uriage: 999999 }),                    // 未分類
      row('e1', '2026-07-01', { uriage: 100, business: '代行' }),
      row('e1', '2026-07-01', { uriage: 50, business: '空調' })
    ],
    employees: [emp('e1', '山田', '')]
  });
  assert.deepStrictEqual(r.rows.map(x => x.business), ['代行', '空調', '未分類']);
});

/* ═══ 構成比とバー ═══ */

test('構成比は売上基準・合計100%付近・バー幅は生の比率', () => {
  const r = Agg.byBusiness({
    ledgerRows: [
      row('e1', '2026-07-01', { uriage: 750, business: 'A' }),
      row('e1', '2026-07-01', { uriage: 250, business: 'B' })
    ],
    employees: [emp('e1', '山田', '')]
  });
  assert.strictEqual(r.basis, 'uriage');
  assert.strictEqual(r.rows[0].pct, 75);
  assert.strictEqual(r.rows[1].pct, 25);
  assert.strictEqual(r.rows[0].bar, 1, '一番大きい行のバーは満幅');
  assert.strictEqual(Math.round(r.rows[1].bar * 1000) / 1000, 0.333, 'バーは最大値に対する比');
});

test('売上が全部0なら金額基準に切り替わる', () => {
  const r = Agg.byBusiness({
    ledgerRows: [
      row('e1', '2026-07-01', { uriage: 0, amount: 6000, business: 'A' }),
      row('e1', '2026-07-01', { amount: 2000, business: 'B' })
    ],
    employees: [emp('e1', '山田', '')]
  });
  assert.strictEqual(r.basis, 'amount');
  assert.strictEqual(r.rows[0].pct, 75);
  assert.deepStrictEqual(r.rows.map(x => x.business), ['A', 'B'], '金額基準で並ぶ');
});

test('売上も金額も0ならバーは出さない(0で割らない)', () => {
  const r = Agg.byBusiness({
    ledgerRows: [
      row('e1', '2026-07-01', { minutes: 60, business: 'A' }),
      row('e1', '2026-07-01', { minutes: 30, business: 'B' })
    ],
    employees: [emp('e1', '山田', '')]
  });
  assert.strictEqual(r.basis, null);
  r.rows.forEach(x => { assert.strictEqual(x.pct, 0); assert.strictEqual(x.bar, 0); });
  assert.strictEqual(r.total.minutes, 90, '時間は集計されている');
});

/* ═══ 0件 ═══ */

test('台帳が0件なら empty=true・数字を作らない', () => {
  const r = Agg.byBusiness({ ledgerRows: [], employees: [emp('e1', '山田', '代行')] });
  assert.strictEqual(r.empty, true);
  assert.deepStrictEqual(r.rows, []);
  assert.strictEqual(r.total.count, 0);
  assert.strictEqual(r.total.uriage, 0);
});

test('引数が無くても落ちない(空として扱う)', () => {
  const r = Agg.byBusiness();
  assert.strictEqual(r.empty, true);
  assert.deepStrictEqual(r.rows, []);
});

/* ═══ 期間の出し方(今月/先月/期間指定) ═══ */

test('今月の期間が正しく出る(月末をまたがない)', () => {
  assert.deepStrictEqual(Agg.periodOf('thisMonth', '2026-07-15'), { from: '2026-07-01', to: '2026-07-31' });
  assert.deepStrictEqual(Agg.periodOf('thisMonth', '2026-02-05'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepStrictEqual(Agg.periodOf('thisMonth', '2024-02-05'), { from: '2024-02-01', to: '2024-02-29' }, 'うるう年');
});

test('先月の期間が正しく出る(1月なら前年12月)', () => {
  assert.deepStrictEqual(Agg.periodOf('lastMonth', '2026-07-15'), { from: '2026-06-01', to: '2026-06-30' });
  assert.deepStrictEqual(Agg.periodOf('lastMonth', '2026-01-10'), { from: '2025-12-01', to: '2025-12-31' });
  assert.deepStrictEqual(Agg.periodOf('lastMonth', '2026-03-31'), { from: '2026-02-01', to: '2026-02-28' }, '31日→2月');
});

test('月末日の当日でも今月が正しい(月をまたぐ計算をしない)', () => {
  assert.deepStrictEqual(Agg.periodOf('thisMonth', '2026-01-31'), { from: '2026-01-01', to: '2026-01-31' });
  assert.deepStrictEqual(Agg.periodOf('thisMonth', '2026-12-31'), { from: '2026-12-01', to: '2026-12-31' });
});

/* ═══ 実行 ═══ */
(async () => {
  let ng = 0;
  for (const t of T) {
    try { await t.fn(); console.log('  ok   ' + t.name); }
    catch (e) { ng++; console.log('  NG   ' + t.name + '\n       ' + (e && e.message)); }
  }
  console.log('\naggregate: ' + (T.length - ng) + '/' + T.length + ' passed');
  if (ng) process.exit(1);
})();
