/* aggregate.js — 事業別集計(E1の骨)の純関数。DBもDOMも触らない＝そのままテストできる。
 * 契約 = docs/SPEC_E1_hub.md §1-4
 *
 * 事業の決まり方(優先順): 台帳行の business → その人の business → 「未分類」
 *   ＝ 同じ人が別の事業をやった日を、行の指定で正しく分けられる。
 * 構成比: 売上(uriage)基準。売上が全部0なら金額(amount)基準。両方0ならバーを出さない(0で割らない)。
 * 並び: 基準の多い順。ただし「未分類」は金額が大きくても必ず最後(実データの事業を上に見せる)。
 * 0件: 数字を作らず empty:true を返す(捏造禁止)。
 *
 * 【利用】ブラウザ window.Aggregate / Node require('./aggregate.js')
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.Aggregate = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var UNCLASSIFIED = '未分類';

  // 「4,200」「4200」「あああ」「null」を安全に数にする(数でなければ0)
  function num(v) {
    if (v == null) return 0;
    var n = Number(String(v).replace(/[,  ]/g, ''));
    return isFinite(n) ? n : 0;
  }
  function trim(v) { return String(v == null ? '' : v).trim(); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // その月の日数(うるう年込み)。Date は「年月日から日数を引く」用途にのみ使う(現在時刻に依存しない)
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

  /* 期間を出す。today は 'YYYY-MM-DD'(呼び出し側が渡す＝関数は現在時刻に依存しない=テストできる)
   * kind: 'thisMonth' | 'lastMonth'
   * 返り: { from:'YYYY-MM-DD', to:'YYYY-MM-DD' }
   */
  function periodOf(kind, today) {
    var t = String(today || '');
    var y = +t.slice(0, 4), m = +t.slice(5, 7);
    if (!(y >= 1900 && m >= 1 && m <= 12)) throw new Error('today は YYYY-MM-DD です: ' + today);
    if (kind === 'lastMonth') { m -= 1; if (m === 0) { m = 12; y -= 1; } }
    else if (kind !== 'thisMonth') throw new Error('kind は thisMonth か lastMonth です: ' + kind);
    var ym = y + '-' + pad2(m);
    return { from: ym + '-01', to: ym + '-' + pad2(daysInMonth(y, m)) };
  }

  /* 事業別に集計する。
   * 引数: { ledgerRows: [{employeeId, ymd, data}], employees: [{id, business}] }
   *   ※期間の絞り込みは呼び出し側(suite-data.ledger.list)が済ませている前提。
   * 返り: {
   *   rows: [{ business, count, uriage, amount, minutes, pct, bar }],
   *   total: { count, uriage, amount, minutes },
   *   basis: 'uriage'|'amount'|null,   // 構成比の基準(null=バーを出さない)
   *   empty: boolean
   * }
   */
  function byBusiness(input) {
    input = input || {};
    var rows = input.ledgerRows || [];
    var emps = input.employees || [];

    var empBiz = {};
    emps.forEach(function (e) { if (e && e.id != null) empBiz[e.id] = trim(e.business); });

    var buckets = {}, order = [];
    var total = { count: 0, uriage: 0, amount: 0, minutes: 0 };

    rows.forEach(function (r) {
      if (!r) return;
      var d = r.data || {};
      // 行の指定 → その人の既定 → 未分類
      var biz = trim(d.business) || empBiz[r.employeeId] || UNCLASSIFIED;
      if (!buckets[biz]) { buckets[biz] = { business: biz, count: 0, uriage: 0, amount: 0, minutes: 0 }; order.push(biz); }
      var b = buckets[biz];
      b.count += 1; total.count += 1;
      b.uriage += num(d.uriage); total.uriage += num(d.uriage);
      b.amount += num(d.amount); total.amount += num(d.amount);
      b.minutes += num(d.minutes); total.minutes += num(d.minutes);
    });

    var out = order.map(function (k) { return buckets[k]; });

    // 構成比の基準: 売上が1円でもあれば売上・無ければ金額・どちらも0なら基準なし
    var basis = total.uriage > 0 ? 'uriage' : (total.amount > 0 ? 'amount' : null);
    var base = basis ? total[basis] : 0;
    var max = 0;
    if (basis) out.forEach(function (b) { if (b[basis] > max) max = b[basis]; });

    out.forEach(function (b) {
      b.pct = base > 0 ? Math.round((b[basis] / base) * 100) : 0;
      b.bar = max > 0 ? (b[basis] / max) : 0;                    // 一番大きい行が満幅
    });

    // 多い順。ただし未分類は必ず最後
    out.sort(function (a, b) {
      var au = a.business === UNCLASSIFIED, bu = b.business === UNCLASSIFIED;
      if (au !== bu) return au ? 1 : -1;
      if (basis && b[basis] !== a[basis]) return b[basis] - a[basis];
      if (b.count !== a.count) return b.count - a.count;
      return a.business.localeCompare(b.business, 'ja');
    });

    return { rows: out, total: total, basis: basis, empty: rows.length === 0 };
  }

  return { byBusiness: byBusiness, periodOf: periodOf, UNCLASSIFIED: UNCLASSIFIED, _num: num };
});
