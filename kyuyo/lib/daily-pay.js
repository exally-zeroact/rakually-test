/* daily-pay.js — 日払い/週払いの「日別集計」純関数。日別の労働時数・支給額を集計し、所得税は日ごと(丙欄=日雇い)に計算して合算。
 *  entries = [{ ymd:'2026-06-08', min:390, amount:12400, hikazei:false, count:8 }]  (min=労働分, amount=その日の支給額)
 *  opts = { taxClass:'hei'|'ko'|'otsu', year:2026, heiFn:fn(dailyAmount,{year}), dayTaxFn:fn(その日の課税額)->税額 }
 *  ★所得税は日ごとに計算して合算=正しい(月一括でない)。呼出側が dayTaxFn を渡す:
 *    丙欄(日雇い)=shotokuzei-hei / 甲・乙欄(継続雇用の日払週払)=shotokuzei-nichi 日額表。
 *    dayTaxFn 未指定(税区分に対応表なし)のときのみ tax=null。
 *  返り値: { days:[{ymd,min,amount,count,tax}], count(日数), totalMin, totalAmount, taxableTotal, tax(合計 or null), isHei }
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.DailyPay = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function num(v) { v = (v == null || v === '') ? 0 : +String(v).replace(/[^0-9.\-]/g, ''); return isFinite(v) ? v : 0; }

  function computeDaily(entries, opts) {
    opts = opts || {}; entries = (entries || []).filter(function (e) { return e && (num(e.amount) !== 0 || num(e.min) !== 0); });
    var taxClass = opts.taxClass;
    var isHei = (taxClass === 'hei');
    // その日の課税額→税額(最終整数)を返す関数。優先:dayTaxFn(甲/乙/丙を呼出側で決める)。後方互換:丙=heiFn。
    var dayTaxFn = (typeof opts.dayTaxFn === 'function') ? opts.dayTaxFn
      : (isHei && typeof opts.heiFn === 'function') ? function (t) { return opts.heiFn(t, { year: opts.year }); }
      : null;
    var perDay = !!dayTaxFn;
    var days = entries.map(function (e) {
      var amount = num(e.amount), taxable = e.hikazei ? 0 : amount;
      var tax = perDay ? Math.round(dayTaxFn(taxable, e.ymd || '')) : null; // ★その日の ymd も渡す＝税表の年を その日（支払日）で選べる（11-04）
      return { ymd: e.ymd || '', min: num(e.min), amount: amount, count: num(e.count), hikazei: !!e.hikazei, tax: tax };
    });
    var totalMin = days.reduce(function (a, d) { return a + d.min; }, 0);
    var totalAmount = days.reduce(function (a, d) { return a + d.amount; }, 0);
    var taxableTotal = days.reduce(function (a, d) { return a + (d.hikazei ? 0 : d.amount); }, 0);
    var totalCount = days.reduce(function (a, d) { return a + d.count; }, 0);
    var tax = perDay ? days.reduce(function (a, d) { return a + (d.tax || 0); }, 0) : null;
    return { days: days, count: days.length, totalMin: totalMin, totalAmount: totalAmount, taxableTotal: taxableTotal, totalCount: totalCount, tax: tax, isHei: isHei, taxClass: taxClass };
  }
  function hhmm(min) { min = Math.max(0, num(min)); var h = Math.floor(min / 60), m = min % 60; return h + ':' + ('0' + m).slice(-2); } // 負値は0:00にクランプ(M1)

  /* ★日別の 紙の 所得税の 表の 年＝支払日の 年★（2026-11-04 R9 押し3）
     日払い＝その日に 払う＝その日の 年。
     週払い＝★紙1枚＝1回の 払い★（紙は「今週支給額」と 手取りが 1つ）＝払うのは 入っている日の 一番遅い日の 後
       ＝★紙の 全部の日に「対象月の 年」と「一番遅い日の 年」の 大きい方★を 当てる。1枚の中で 令和8 と 令和9 を 混ぜない（支払日は 1つ）。
       対象月の 年を 下限に する訳＝1月の紙に 12月の日だけ（12-31 締め→1月払い）でも 払いは 1月＝新しい年の表
       （一番遅い日だけだと 前の年の表＝前より 取り過ぎ・同じ紙の 月次 taxYearOf とも 食い違う・taiketsu 11-04 5回目）。
       ★日の近くで 週を 推す形（その日から6日先まで）は 取らない＝週の頭の 欄が 無く、休みの 並びで 年が 変わる（taiketsu 11-04 4回目）★。
       12月の紙に 何週ぶんも 入れる 使い方は 紙の 作り（今週支給額）の 外。
     日付が 空・読めない 時は 対象月の 年（fallbackYear）。
     日付の 年は 対象月の 年の 前後1年 だけ 受ける（それ以外＝打ち間違い＝対象月の 年・2062 等 1つで 紙全体を 動かさない）。 */
  function taxYearForDay(ymd, opts) {
    opts = opts || {};
    var fy = parseInt(opts.fallbackYear, 10) || 2026;
    var yOf = function (v) { var y = parseInt(String(v || '').slice(0, 4), 10) || 0; return (y >= fy - 1 && y <= fy + 1) ? y : 0; };
    if (opts.cycle === 'weekly') {
      var last = (opts.entries || []).reduce(function (a, x) { var y = yOf(x && x.ymd); return y > a ? y : a; }, 0);
      return Math.max(fy, last);
    }
    return yOf(ymd) || fy;
  }

  /* ★日別の 紙（人ごとの 日の 並び）が 引く 所得税の 表の 年の 最大★（2026-11-04 候補③）
     ＝buildDailyData と 同じ 決まり（上の taxYearForDay）を 紙ごとに 回す。古い表の 黄警告（payroll-warnings statutoryStaleWarn の ctx.dayTaxYear）に 渡す。
     日払い/週払い 以外は 0（月次の 会社は 日の 年を 見ない）。 */
  function maxTaxYearOf(entryLists, opts) {
    opts = opts || {};
    if (opts.cycle !== 'daily' && opts.cycle !== 'weekly') return 0;
    var mx = 0;
    (entryLists || []).forEach(function (list) {
      var ents = (list || []).map(function (x) { return { ymd: x && x.ymd }; });
      ents.forEach(function (x) { var y = taxYearForDay(x.ymd, { cycle: opts.cycle, entries: ents, fallbackYear: opts.fallbackYear }); if (y > mx) mx = y; });
    });
    return mx;
  }

  return { computeDaily: computeDaily, hhmm: hhmm, taxYearForDay: taxYearForDay, maxTaxYearOf: maxTaxYearOf };
});
