/* ledger-source.test.js — 台帳→期間の実績値(ctx)の純関数テスト
 * 契約 = docs/SPEC_E2_ledger.md
 *   出口＝Kyually lib/pay-rule.js がそのまま食う形:
 *     ctx = { sales, workDays, workMin, count, commission }
 *   ★Exallyは支給額(円)を計算しない。出すのは生の実績値だけ(司さん判断 2026-07-26)。
 *   ★hikazei(非課税)は commission に混ぜず別枠。混ぜるとK4で課税額が狂う。
 *   ★workDays=「1行でもある日の数」(同じ日に3件でも1日)。
 * 実数値リテラルで検算する(自己参照で計算しない)。
 */
'use strict';
const assert = require('assert');
const LA = require('../lib/ledger-source.js');

const T = [];
function test(name, fn) { T.push({ name, fn }); }

function row(employeeId, ymd, data) { return { id: 'lg_' + ymd + '_' + Math.random().toString(36).slice(2, 6), employeeId, ymd, data }; }
function emp(id, name, business) { return { id, name, business: business || '', employmentType: '従業員' }; }

/* ═══ 期間への振り分け ═══ */

test('10日締めで3期間に振り分く(境界の日が正しい側に入る)', () => {
  const r = LA.byPeriod({
    ym: '2026-07', method: 'ten',
    employees: [emp('e1', '鈴木', '代行')],
    ledgerRows: [
      row('e1', '2026-07-10', { uriage: 100 }),   // P1の最終日
      row('e1', '2026-07-11', { uriage: 200 }),   // P2の初日
      row('e1', '2026-07-20', { uriage: 400 }),   // P2の最終日
      row('e1', '2026-07-21', { uriage: 800 })    // P3の初日
    ]
  });
  assert.deepStrictEqual(r.periods.map(p => p.key), ['P1', 'P2', 'P3']);
  const s = (k) => r.byPeriod[k].employees[0].ctx.sales;
  assert.strictEqual(s('P1'), 100);
  assert.strictEqual(s('P2'), 600, '11日と20日の両方がP2');
  assert.strictEqual(s('P3'), 800);
});

test('その月に無い日付の行は入らない(他の月を混ぜない)', () => {
  const r = LA.byPeriod({
    ym: '2026-07', method: 'ten', employees: [emp('e1', '鈴木')],
    ledgerRows: [row('e1', '2026-06-30', { uriage: 999 }), row('e1', '2026-08-01', { uriage: 999 }), row('e1', '2026-07-05', { uriage: 100 })]
  });
  assert.strictEqual(r.byPeriod.P1.employees[0].ctx.sales, 100);
  assert.strictEqual(r.outOfRange, 2, '範囲外だった行数を正直に返す');
});

/* ═══ ctx の中身(実数値) ═══ */

test('ctx が pay-rule の形で、実数値で合う', () => {
  const r = LA.byPeriod({
    ym: '2026-07', method: 'ten',
    employees: [emp('e1', '鈴木', '代行')],
    ledgerRows: [
      row('e1', '2026-07-01', { uriage: 4200, minutes: 90, count: 1, amount: 500 }),
      row('e1', '2026-07-01', { uriage: 3800, minutes: 75, count: 1 }),      // 同じ日に2件目
      row('e1', '2026-07-03', { uriage: 5100, minutes: 165, count: 2, amount: 300 })
    ]
  });
  const e = r.byPeriod.P1.employees[0];
  assert.deepStrictEqual(Object.keys(e.ctx).sort(), ['commission', 'count', 'sales', 'workDays', 'workMin']);
  assert.strictEqual(e.ctx.sales, 13100);          // 4200+3800+5100
  assert.strictEqual(e.ctx.workMin, 330);          // 90+75+165
  assert.strictEqual(e.ctx.count, 4);              // 1+1+2
  assert.strictEqual(e.ctx.commission, 800);       // 500+300
  assert.strictEqual(e.ctx.workDays, 2, '7/1に2件あっても出勤は1日。7/1と7/3で2日');
  assert.strictEqual(e.rowCount, 3, '行数は3');
});

test('★workDays は「1行でもある日の数」(同じ日に何件でも1日)', () => {
  const r = LA.byPeriod({
    ym: '2026-07', method: 'monthly', employees: [emp('e1', '鈴木')],
    ledgerRows: [
      row('e1', '2026-07-01', { uriage: 1 }), row('e1', '2026-07-01', { uriage: 1 }),
      row('e1', '2026-07-01', { uriage: 1 }), row('e1', '2026-07-02', { uriage: 1 })
    ]
  });
  assert.strictEqual(r.byPeriod.P1.employees[0].ctx.workDays, 2);
  assert.strictEqual(r.byPeriod.P1.employees[0].rowCount, 4);
});

test('★非課税は commission に混ぜず別枠(混ぜると課税額が狂う)', () => {
  const r = LA.byPeriod({
    ym: '2026-07', method: 'monthly', employees: [emp('e1', '鈴木')],
    ledgerRows: [
      row('e1', '2026-07-01', { amount: 5000 }),                      // 課税
      row('e1', '2026-07-02', { amount: 3000, hikazei: true }),       // 非課税(立替の精算など)
      row('e1', '2026-07-03', { amount: 2000, hikazei: false })       // 課税
    ]
  });
  const e = r.byPeriod.P1.employees[0];
  assert.strictEqual(e.ctx.commission, 7000, '課税ぶんだけ(5000+2000)');
  assert.strictEqual(e.hikazeiAmount, 3000, '非課税は別枠');
  assert.strictEqual(e.ctx.commission + e.hikazeiAmount, 10000, '合計は一致する(どこにも消えない)');
});

test('数字が文字列/カンマ付き/空でも落ちずに足せる', () => {
  const r = LA.byPeriod({
    ym: '2026-07', method: 'monthly', employees: [emp('e1', '鈴木')],
    ledgerRows: [
      row('e1', '2026-07-01', { uriage: '4,200', count: '2' }),
      row('e1', '2026-07-02', { uriage: '3800' }),
      row('e1', '2026-07-03', { uriage: null, count: '' }),
      row('e1', '2026-07-04', { uriage: 'あああ' })
    ]
  });
  const e = r.byPeriod.P1.employees[0];
  assert.strictEqual(e.ctx.sales, 8000);
  assert.strictEqual(e.ctx.count, 2);
  assert.strictEqual(e.ctx.workDays, 4, '金額が0でも「その日に記録がある」なら出勤');
});

/* ═══ 人の並び・事業 ═══ */

test('人ごとに分かれ、その期間に記録がある人だけ出る', () => {
  const r = LA.byPeriod({
    ym: '2026-07', method: 'ten',
    employees: [emp('e1', '山田', '空調'), emp('e2', '鈴木', '代行'), emp('e3', '佐藤', '')],
    ledgerRows: [row('e1', '2026-07-01', { uriage: 100 }), row('e2', '2026-07-02', { uriage: 200 }), row('e2', '2026-07-15', { uriage: 300 })]
  });
  assert.deepStrictEqual(r.byPeriod.P1.employees.map(e => e.name), ['山田', '鈴木'], '記録のある2人だけ・従業員の並び順');
  assert.deepStrictEqual(r.byPeriod.P2.employees.map(e => e.name), ['鈴木']);
  assert.deepStrictEqual(r.byPeriod.P3.employees, [], '記録が無い期間は空');
});

test('事業は 行の指定 → その人の既定 → 未分類（集計と同じ順）', () => {
  const r = LA.byPeriod({
    ym: '2026-07', method: 'monthly',
    employees: [emp('e1', '山田', '空調'), emp('e2', '佐藤', '')],
    ledgerRows: [
      row('e1', '2026-07-01', { uriage: 100, business: '代行' }),
      row('e1', '2026-07-02', { uriage: 200 }),
      row('e2', '2026-07-03', { uriage: 300 })
    ]
  });
  const es = r.byPeriod.P1.employees;
  assert.deepStrictEqual(es[0].businesses, ['代行', '空調'], '1人が期間中に複数事業をやり得る');
  assert.deepStrictEqual(es[1].businesses, ['未分類']);
});

test('台帳に居ない人の行でも落ちない(名前は不明として出す)', () => {
  const r = LA.byPeriod({
    ym: '2026-07', method: 'monthly', employees: [emp('e1', '山田')],
    ledgerRows: [row('e_unknown', '2026-07-01', { uriage: 500 })]
  });
  const e = r.byPeriod.P1.employees[0];
  assert.strictEqual(e.employeeId, 'e_unknown');
  assert.strictEqual(e.ctx.sales, 500);
  assert.ok(/不明|未登録/.test(e.name), '名前が空のままにしない: ' + e.name);
});

/* ═══ 期間の合計 ═══ */

test('期間の合計が人の合計と一致する', () => {
  const r = LA.byPeriod({
    ym: '2026-07', method: 'ten',
    employees: [emp('e1', '山田'), emp('e2', '鈴木')],
    ledgerRows: [
      row('e1', '2026-07-01', { uriage: 100, count: 1, minutes: 60 }),
      row('e2', '2026-07-02', { uriage: 200, count: 2, minutes: 30 }),
      row('e2', '2026-07-03', { uriage: 300, count: 1, minutes: 90 })
    ]
  });
  const p = r.byPeriod.P1;
  assert.strictEqual(p.total.sales, 600);
  assert.strictEqual(p.total.count, 4);
  assert.strictEqual(p.total.workMin, 180);
  assert.strictEqual(p.total.people, 2);
  assert.strictEqual(p.total.sales, p.employees.reduce((s, e) => s + e.ctx.sales, 0));
});

/* ═══ 空・壊れた入力 ═══ */

test('記録が無ければ全期間が空(数字を作らない)', () => {
  const r = LA.byPeriod({ ym: '2026-07', method: 'ten', employees: [emp('e1', '山田')], ledgerRows: [] });
  assert.strictEqual(r.empty, true);
  assert.strictEqual(r.periods.length, 3, '期間の枠は出る(入れ物は見せる)');
  r.periods.forEach(p => {
    assert.deepStrictEqual(r.byPeriod[p.key].employees, []);
    assert.strictEqual(r.byPeriod[p.key].total.sales, 0);
  });
});

test('引数が無くても落ちない', () => {
  const r = LA.byPeriod();
  assert.strictEqual(r.empty, true);
  assert.deepStrictEqual(r.periods, []);
});

test('締め方が未設定なら月まとめ(1期間)として扱う', () => {
  const r = LA.byPeriod({ ym: '2026-07', employees: [emp('e1', '山田')], ledgerRows: [row('e1', '2026-07-05', { uriage: 100 })] });
  assert.strictEqual(r.periods.length, 1);
  assert.strictEqual(r.method, 'monthly');
  assert.strictEqual(r.byPeriod.P1.employees[0].ctx.sales, 100);
});

/* ═══ 1人ぶんの期間内訳(画面で「その日の一覧」を出す用) ═══ */

test('1人の期間の行を日付順に取り出せる(同じ日は入れた順)', () => {
  const rows = [
    row('e1', '2026-07-03', { uriage: 300 }),
    row('e1', '2026-07-01', { uriage: 100 }),
    row('e1', '2026-07-01', { uriage: 200 })
  ];
  const r = LA.byPeriod({ ym: '2026-07', method: 'ten', employees: [emp('e1', '山田')], ledgerRows: rows });
  const got = r.byPeriod.P1.employees[0].rows;
  assert.deepStrictEqual(got.map(x => [x.ymd, x.data.uriage]), [
    ['2026-07-01', 100], ['2026-07-01', 200], ['2026-07-03', 300]
  ]);
});

/* ═══ 実行 ═══ */
(async () => {
  let ng = 0;
  for (const t of T) {
    try { await t.fn(); console.log('  ok   ' + t.name); }
    catch (e) { ng++; console.log('  NG   ' + t.name + '\n       ' + (e && e.message)); }
  }
  console.log('\nledger-source: ' + (T.length - ng) + '/' + T.length + ' passed');
  if (ng) process.exit(1);
})();
