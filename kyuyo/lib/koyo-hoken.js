/* koyo-hoken.js — 雇用保険 従業員負担料率(年度＋業種で自動選択・単一ソース)
 * これまで app.js の EMPLOY_RATES と lib(payroll-calc/shoyo-zei)の既定0.0055が二系統だった(app側が正・libは令和7で取り残し)。
 * 本ファイルを唯一の真実源にし、app・payroll-calc から参照する(健保率を getKenko で年度自己選択したのと同型)。
 * 【出典】厚労省 雇用保険料率(労働者負担)。令和7→令和8で引下げ: 一般 5.5→5.0/1000・建設/農林水産/清酒製造 6.5→6.0/1000。照合日2026-07。
 * 【年度】労働保険年度(4/1〜翌3/31)で切替。1〜3月は前年度扱い(例 2026-03=令和7年度)。収録は RATES のキー(今は令和7(2025)/令和8(2026))。収録の外は employStale=true。
 * 【利用】ブラウザ window.KoyoHoken / Node require('./koyo-hoken.js')
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.KoyoHoken = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // 従業員(労働者)負担率。年度キー=労働保険年度。業種3区分で全国共通。
  var RATES = {
    2025: { ippan: 0.0055, kensetsu: 0.0065, norin: 0.0065 }, // 令和7年度
    2026: { ippan: 0.005, kensetsu: 0.006, norin: 0.006 },     // 令和8年度(引下げ)
  };
  // 事業主負担率(=失業等給付分＋雇用保険二事業分)。★労働保険 年度更新の雇用保険料算定用。全体率=労働者+事業主★
  // 【一次情報照合(厚労省)2026-07】令和7: 一般 労5.5+事9.0=14.5 / 建設 労6.5+事11.0=17.5 / 農林 労6.5+事10.0=16.5(‰)
  //                            令和8: 一般 労5.0+事8.5=13.5 / 建設 労6.0+事10.5=16.5 / 農林 労6.0+事9.5=15.5(‰)
  var EMPLOYER = {
    2025: { ippan: 0.009, kensetsu: 0.011, norin: 0.010 },  // 令和7年度 事業主
    2026: { ippan: 0.0085, kensetsu: 0.0105, norin: 0.0095 }, // 令和8年度 事業主
  };
  /* ★2026-11-06 候補⑥ 年を 決め打ちで 寄せない＝RATES の キーで 選ぶ★
     前は employYearOfYm が `fy>=2026?2026:2025`＝令和9年度の 率を ここに 足しても 中央（hydrate）から 来ても
     2027-04〜 は 黙って 令和8の 率で 計算し、黄警告（payroll-warnings）も 雇用を 見ていなかった。
     ⇒ 収録の 年は RATES の キー（lib に 足しても hydrate で 足しても 届く）。収録の 外は employStale で 名乗る（値は 捏造しない）。 */
  function years() { return Object.keys(RATES).filter(function (k) { return /^\d{4}$/.test(k); }).map(Number).sort(function (a, b) { return a - b; }); }
  function latest() { var ys = years(); return ys.length ? ys[ys.length - 1] : 2026; }
  // 労働保険年度(月>=4→その年/<4→前年)。ym が 読めなければ 最新の 収録年。
  function fiscalYearOf(ym) {
    ym = String(ym || '');
    var y = parseInt(ym.slice(0, 4), 10), m = parseInt(ym.slice(5, 7), 10) || 1;
    if (!y) return latest();
    return (m >= 4) ? y : y - 1;
  }
  // 計算に 使う 年度＝収録に 在れば その年・無ければ その年 以下で 一番 新しい 収録年・それも 無ければ 一番 古い 収録年
  //（今の 収録 2025/2026 では 前と 同じ 値：2027-01→2026・2024-06→2025）。app.js employYearOfYm は これに 委ねる。
  function employYearOfYm(ym) {
    var fy = fiscalYearOf(ym); if (RATES[fy]) return fy;
    var ys = years(), pick = null;
    ys.forEach(function (k) { if (k <= fy) pick = k; });
    return pick != null ? pick : (ys.length ? ys[0] : 2026);
  }
  // その月の 労働保険年度が 収録に 無い＝直近の 収録年の 率で 暫定計算＝黄警告を 出す 印
  function employStale(ym) { return !RATES[fiscalYearOf(ym)]; }
  // 従業員負担率(業種, 年度)。未知業種→一般・未知年度→最新表。
  function employRate(gyoshu, year) {
    var t = RATES[year] || RATES[latest()];
    var v = t[gyoshu];
    return v != null ? v : t.ippan;
  }
  // 対象月(payYm)から直接(労働保険年度で自動選択)。
  function employRateByYm(gyoshu, ym) { return employRate(gyoshu, employYearOfYm(ym)); }

  // 事業主負担率(業種, 年度)。未収録年度→null(=呼び出し側で「率未収録」表示)。
  function employerRate(gyoshu, year) { var t = EMPLOYER[year]; if (!t) return null; return t[gyoshu] != null ? t[gyoshu] : t.ippan; }
  // 全体率(=労働者＋事業主・業種, 年度)。労働保険 年度更新の雇用保険料算定用。未収録年度→null。
  function fullRate(gyoshu, year) { var er = employerRate(gyoshu, year); if (er == null) return null; return employRate(gyoshu, year) + er; }
  // 中央(Supabase statutory kind=koyo)の値で年度別に上書き。不正なら何もしない=ハードコードのまま(フォールバック)。
  function hydrate(year, rates) {
    if (year && rates && typeof rates === 'object' && rates.ippan != null) RATES[year] = { ippan: rates.ippan, kensetsu: rates.kensetsu, norin: rates.norin };
    if (year && rates && rates.employer && rates.employer.ippan != null) EMPLOYER[year] = { ippan: rates.employer.ippan, kensetsu: rates.employer.kensetsu, norin: rates.employer.norin };
  }
  var API = { RATES: RATES, EMPLOYER: EMPLOYER, fiscalYearOf: fiscalYearOf, employYearOfYm: employYearOfYm, employStale: employStale, employRate: employRate, employRateByYm: employRateByYm, employerRate: employerRate, fullRate: fullRate, hydrate: hydrate };
  // LATEST＝収録の 最新年（app.js koyoRateNote・askSource が 読む）。数で 持つと hydrate で 足した 年に 追いつかない＝毎回 キーから 出す
  Object.defineProperty(API, 'LATEST', { get: latest, enumerable: true });
  return API;
});
