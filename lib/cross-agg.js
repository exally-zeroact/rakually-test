/* cross-agg.js — E5 横断集計（事業別のまとめ）の純関数。DBもDOMも触らない。
 * 契約 = docs/SPEC_E5_cross.md
 *
 * 源 = pay_org.data.businesses（登録した事業）× pay_ledger（実績）
 * 「どの事業でいくら」を月をまたいで横断で出す。読める一覧＋バーだけ（散布図・凝ったグラフは作らない）。
 *
 * ★E1の集計(lib/aggregate.js)との違い★
 *   E1 = 期間を1つ選んで、その期間の事業別（今どうなっているか）。
 *   E5 = 月をまたいで並べる（どの事業が伸びて/止まっているか）。
 *        ・**登録したのに実績0の事業も出す**＝「動いていない事業」が見える（0を隠さない）。
 *        ・事業×月の推移を出す（実績が無い月も0で埋める＝抜けを詰めて誤読させない）。
 *
 * ★支給額(円)は出さない★（E2と同じ。決め方は Kyually の pay-rule.js が唯一の源）。ここは実績値だけ。
 *
 * 【利用】ブラウザ window.CrossAgg / Node require('./cross-agg.js')
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.CrossAgg = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var UNCLASSIFIED = '未分類';

  function num(v) {
    if (v == null) return 0;
    var n = Number(String(v).replace(/[,  ]/g, ''));
    return isFinite(n) ? n : 0;
  }
  function trim(v) { return String(v == null ? '' : v).trim(); }
  function isYmd(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }
  function ymOf(ymd) { return String(ymd).slice(0, 7); }

  // from〜to に含まれる月を古い順に全部（実績が無い月も入れる＝抜けを詰めない）
  function monthsBetween(from, to) {
    var out = [];
    var y = +from.slice(0, 4), m = +from.slice(5, 7);
    var ey = +to.slice(0, 4), em = +to.slice(5, 7);
    while (y < ey || (y === ey && m <= em)) {
      out.push(y + '-' + (m < 10 ? '0' : '') + m);
      m++; if (m > 12) { m = 1; y++; }
      if (out.length > 600) break;   // 暴走よけ(50年)
    }
    return out;
  }

  /* 事業別の横断集計。
   * 引数: { businesses:[登録事業], employees:[{id,business}], ledgerRows:[{employeeId,ymd,data}], from, to }
   * 返り: {
   *   months: ['YYYY-MM', ...],
   *   rows: [{ business, sales, amount, count, workMin, rows, registered, pct, bar, byMonth:{ym:売上} }],
   *   total: { sales, amount, count, workMin, rows },
   *   totalByMonth: { ym: 売上 },
   *   basis: 'uriage'|'amount'|null,
   *   empty: boolean,
   *   outOfRange: number
   * }
   */
  function crossByBusiness(input) {
    input = input || {};
    var from = input.from, to = input.to;
    if (from == null && to == null && !input.ledgerRows && !input.businesses) {
      return { months: [], rows: [], total: { sales: 0, amount: 0, count: 0, workMin: 0, rows: 0 }, totalByMonth: {}, basis: null, empty: true, outOfRange: 0 };
    }
    if (!isYmd(from) || !isYmd(to)) throw new Error('期間は YYYY-MM-DD で指定してください: ' + from + ' 〜 ' + to);
    if (from > to) throw new Error('期間の終わりが始まりより前になっています: ' + from + ' 〜 ' + to);

    var months = monthsBetween(from, to);
    var registered = (input.businesses || []).map(trim).filter(Boolean);
    var emps = input.employees || [];
    var rows = input.ledgerRows || [];

    var empBiz = {};
    emps.forEach(function (e) { if (e && e.id != null) empBiz[e.id] = trim(e.business); });

    // 登録した事業は実績0でも先に器を作る（動いていない事業を見せる）
    var buckets = {}, order = [];
    function slot(biz, isRegistered) {
      if (!buckets[biz]) {
        buckets[biz] = {
          business: biz, sales: 0, amount: 0, count: 0, workMin: 0, rows: 0,
          registered: !!isRegistered, byMonth: {},
          // ★同じ数字が並んだ時は「登録した順」を尊重する（読み仮名順や文字コード順にしない）。
          //   登録に無い事業（未分類など）は登録済みの後ろ。
          _reg: registered.indexOf(biz)
        };
        months.forEach(function (m) { buckets[biz].byMonth[m] = 0; });   // 実績が無い月も0で埋める
        order.push(biz);
      }
      return buckets[biz];
    }
    registered.forEach(function (b) { slot(b, true); });

    var total = { sales: 0, amount: 0, count: 0, workMin: 0, rows: 0 };
    var totalByMonth = {};
    months.forEach(function (m) { totalByMonth[m] = 0; });
    var outOfRange = 0, used = 0;

    rows.forEach(function (r) {
      if (!r) return;
      var ymd = trim(r.ymd);
      if (!isYmd(ymd) || ymd < from || ymd > to) { outOfRange++; return; }
      var ym = ymOf(ymd);
      if (!(ym in totalByMonth)) { outOfRange++; return; }
      used++;
      var d = r.data || {};
      var biz = trim(d.business) || empBiz[r.employeeId] || UNCLASSIFIED;
      var b = slot(biz, registered.indexOf(biz) >= 0);
      var sales = num(d.uriage);
      b.sales += sales; b.amount += num(d.amount); b.count += num(d.count); b.workMin += num(d.minutes); b.rows += 1;
      b.byMonth[ym] += sales;
      total.sales += sales; total.amount += num(d.amount); total.count += num(d.count); total.workMin += num(d.minutes); total.rows += 1;
      totalByMonth[ym] += sales;
    });

    var out = order.map(function (k) { return buckets[k]; });

    // 構成比の基準: 売上が1円でもあれば売上・無ければ金額・どちらも0なら基準なし
    var basis = total.sales > 0 ? 'uriage' : (total.amount > 0 ? 'amount' : null);
    var field = basis === 'uriage' ? 'sales' : (basis === 'amount' ? 'amount' : null);
    var base = field ? total[field === 'sales' ? 'sales' : 'amount'] : 0;
    var max = 0;
    if (field) out.forEach(function (b) { if (b[field] > max) max = b[field]; });
    out.forEach(function (b) {
      b.pct = base > 0 ? Math.round((b[field] / base) * 100) : 0;
      b.bar = max > 0 ? (b[field] / max) : 0;
    });

    // 並び: 未分類は必ず最後。それ以外は多い順（同値は名前順）
    out.sort(function (a, c) {
      var au = a.business === UNCLASSIFIED, cu = c.business === UNCLASSIFIED;
      if (au !== cu) return au ? 1 : -1;
      if (field && c[field] !== a[field]) return c[field] - a[field];
      if (c.rows !== a.rows) return c.rows - a.rows;
      // 同じ数字なら登録した順（-1=未登録は後ろ）
      var ar = a._reg < 0 ? 1e9 : a._reg, cr = c._reg < 0 ? 1e9 : c._reg;
      if (ar !== cr) return ar - cr;
      return a.business.localeCompare(c.business, 'ja');
    });
    out.forEach(function (b) { delete b._reg; });

    return {
      months: months, rows: out, total: total, totalByMonth: totalByMonth,
      basis: basis, empty: used === 0, outOfRange: outOfRange
    };
  }

  return { crossByBusiness: crossByBusiness, UNCLASSIFIED: UNCLASSIFIED, _monthsBetween: monthsBetween };
});
