/* ledger-source.js — 日次台帳 → 期間ごとの「実績値」を出す純関数。DBもDOMも触らない。
 *
 * ★名前について: 元は lib/ledger-agg.js だったが、給与(kyuyo/lib/ledger-agg.js)に
 *   同名で【別物】(台帳を受け取る消費側)があり、1リポジトリに寄せた際に取り違える危険があるため
 *   出力側であるこちらを ledger-source.js に改名した。中身は1文字も変えていない。
 * 契約 = docs/SPEC_E2_ledger.md
 *
 * ★出口の形は Kyually lib/pay-rule.js がそのまま食う ctx★
 *     ctx = { sales, workDays, workMin, count, commission }
 *   sales      ... 売上の合計（rate: 売上×率% が食う）
 *   workDays   ... ★1行でもある日の数（同じ日に3件あっても1日）... daily: 日給×出勤日数 が食う
 *   workMin    ... 労働時間の合計（分）... hourly: 時給×時間 が食う
 *   count      ... 件数の合計 ... piece: 単価×件数 が食う
 *   commission ... その日に直接入れた金額の合計（★非課税ぶんを除く）... commission: 歩合額そのまま が食う
 *
 * ★★Exally は支給額(円)を計算しない★★（司さん判断 2026-07-26）
 *   決め方（時給/日給/率/段階/AかBの高い方）は Kyually の pay-rule.js が唯一の源。
 *   複製は「最賃38県ドリフト誤値」と同じ事故クラスのため禁止。ここは生の実績値までを出す。
 *
 * ★非課税(hikazei)は commission に混ぜず別枠で返す★
 *   混ぜると K4 で読み替えた時に課税額が狂う（お金の間違い）。
 *
 * 【利用】ブラウザ window.LedgerAgg / Node require('./ledger-source.js')
 *   ※グローバル名 LedgerAgg は据置(hub.html でしか読まないので給与側と同時に載らない)
 */
(function (root, factory) {
  var api = factory(
    (typeof module !== 'undefined' && module.exports) ? require('./periods.js')
      : (typeof window !== 'undefined' ? window.Periods : null)
  );
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LedgerAgg = api;
})(typeof self !== 'undefined' ? self : this, function (Periods) {
  'use strict';

  var UNCLASSIFIED = '未分類';

  function num(v) {
    if (v == null) return 0;
    var n = Number(String(v).replace(/[,  ]/g, ''));
    return isFinite(n) ? n : 0;
  }
  function trim(v) { return String(v == null ? '' : v).trim(); }
  function emptyCtx() { return { sales: 0, workDays: 0, workMin: 0, count: 0, commission: 0 }; }

  /* 台帳の行を、その月の締め方で期間ごと・人ごとに畳む。
   * 引数: { ledgerRows, employees, ym:'YYYY-MM', method:'monthly'|'half'|'ten'|'ndays', n }
   *   ※ ledgerRows は suite-data.ledger.list の返り（削除済みは既に除かれている前提）
   * 返り: {
   *   ym, method, n,
   *   periods: [{key,label,from,to,days}],
   *   byPeriod: { P1: { period, employees:[...], total:{sales,workMin,count,commission,hikazeiAmount,people,rows} } },
   *   empty: boolean,        // 期間内に1行も無い
   *   outOfRange: number     // その月の期間に入らなかった行数（他の月の行など・黙って捨てない）
   * }
   * employees[] の各要素:
   *   { employeeId, name, businesses:[...], ctx:{...}, hikazeiAmount, rowCount, rows:[...] }
   */
  function byPeriod(input) {
    input = input || {};
    var rows = input.ledgerRows || [];
    var emps = input.employees || [];
    var ym = trim(input.ym);
    var method = (Periods && Periods.METHODS.indexOf(input.method) >= 0) ? input.method : 'monthly';
    var n = input.n;

    var periods = (Periods && ym) ? Periods.buildPeriods(ym, method, n) : [];

    // 従業員の並び順（画面の並びと揃える）と名前/既定事業の引き当て
    var empIndex = {}, empOrder = {};
    emps.forEach(function (e, i) {
      if (!e || e.id == null) return;
      empIndex[e.id] = e; empOrder[e.id] = i;
    });

    var byPeriodOut = {};
    periods.forEach(function (p) {
      byPeriodOut[p.key] = {
        period: p, employees: [],
        total: { sales: 0, workMin: 0, count: 0, commission: 0, hikazeiAmount: 0, people: 0, rows: 0 }
      };
    });

    var outOfRange = 0, used = 0;
    // 期間キー → 従業員id → 集計
    var buckets = {};

    rows.forEach(function (r) {
      if (!r) return;
      var ymd = trim(r.ymd);
      var key = (Periods && ym) ? Periods.periodKeyOf(ymd, ym, method, n) : null;
      if (!key || !byPeriodOut[key]) { outOfRange++; return; }   // その月の期間に入らない行は黙って捨てず数える
      used++;
      var eid = r.employeeId;
      var b = (buckets[key] || (buckets[key] = {}));
      var slot = b[eid];
      if (!slot) {
        var e = empIndex[eid];
        slot = b[eid] = {
          employeeId: eid,
          name: (e && e.name) ? e.name : '(未登録の人)',
          _defaultBiz: (e && trim(e.business)) || '',
          _bizSet: {}, businesses: [],
          ctx: emptyCtx(), hikazeiAmount: 0, rowCount: 0, rows: [], _days: {}
        };
      }
      var d = r.data || {};
      slot.rowCount += 1;
      slot.rows.push(r);
      slot._days[ymd] = 1;                                   // ★出勤日数＝ユニークな日付の数
      slot.ctx.sales += num(d.uriage);
      slot.ctx.workMin += num(d.minutes);
      slot.ctx.count += num(d.count);
      if (d.hikazei) slot.hikazeiAmount += num(d.amount);    // ★非課税は別枠（commissionに混ぜない）
      else slot.ctx.commission += num(d.amount);
      var biz = trim(d.business) || slot._defaultBiz || UNCLASSIFIED;
      if (!slot._bizSet[biz]) { slot._bizSet[biz] = 1; slot.businesses.push(biz); }
    });

    Object.keys(buckets).forEach(function (key) {
      var b = buckets[key];
      var list = Object.keys(b).map(function (eid) {
        var s = b[eid];
        s.ctx.workDays = Object.keys(s._days).length;
        // 行は日付順（同じ日は入れた順＝元の並びを保つ安定ソート）
        s.rows.sort(function (x, y) { return x.ymd < y.ymd ? -1 : (x.ymd > y.ymd ? 1 : 0); });
        s.businesses.sort();
        delete s._days; delete s._bizSet; delete s._defaultBiz;
        return s;
      });
      // 従業員マスタの並び順。マスタに居ない人は最後
      list.sort(function (a, c) {
        var ia = (empOrder[a.employeeId] == null) ? 1e9 : empOrder[a.employeeId];
        var ic = (empOrder[c.employeeId] == null) ? 1e9 : empOrder[c.employeeId];
        return ia - ic;
      });
      var out = byPeriodOut[key];
      out.employees = list;
      list.forEach(function (s) {
        out.total.sales += s.ctx.sales;
        out.total.workMin += s.ctx.workMin;
        out.total.count += s.ctx.count;
        out.total.commission += s.ctx.commission;
        out.total.hikazeiAmount += s.hikazeiAmount;
        out.total.rows += s.rowCount;
      });
      out.total.people = list.length;
    });

    return {
      ym: ym, method: method, n: n,
      periods: periods, byPeriod: byPeriodOut,
      empty: used === 0, outOfRange: outOfRange
    };
  }

  // 分を「5時間30分」の形に（画面用・0分なら「5時間」）
  function hm(minutes) {
    var m = Math.max(0, Math.round(num(minutes)));
    var h = Math.floor(m / 60), mm = m % 60;
    if (!h && !mm) return '0分';
    return (h ? h + '時間' : '') + (mm ? mm + '分' : '');
  }

  return { byPeriod: byPeriod, hm: hm, UNCLASSIFIED: UNCLASSIFIED, _num: num };
});
