/* shotokuzei-hei.js — 所得税「日額表 丙欄」(日雇い) の表引き（純関数）
 * 丙欄=日々雇い入れられる人(日雇い・継続2か月を超えない)に適用。甲欄/乙欄は月額表(算式=電算機計算の特例)だが、
 * ★丙欄は電算機計算の特例が無い=国税庁「日額表」の表引きが正★。年分別テーブルが必要。
 * 出典: 国税庁 給与所得の源泉徴収税額表(令和8年分) 日額表 08-14.pdf を機械抽出した実値(2026-07照合)。
 *   令和8年分: その日の社保控除後の日額 9,800円未満=0 / 100円刻み(以上9,800〜未満24,000で142段・24,000で738円)。
 * 【利用】ブラウザ window.ShotokuzeiHei / Node require('./shotokuzei-hei.js')
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.ShotokuzeiHei = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function num(v) { var n = Number(String(v == null ? 0 : v).replace(/[, ]/g, '')); return isNaN(n) ? 0 : n; }
  // 令和8年分 日額表 丙欄(実値)。arr[i] = 日額 (9800 + i*100) 〜 未満(+100) の税額。
  var HEI_R8 = { start: 9800, step: 100, arr: [1,5,8,12,15,19,22,26,29,33,36,40,43,47,51,55,58,62,65,69,72,76,79,83,86,90,93,98,101,105,108,112,115,119,122,126,129,133,136,140,144,149,153,157,161,165,169,173,177,181,185,189,193,198,202,206,210,214,218,222,226,230,234,238,242,247,251,255,259,263,267,271,275,279,283,287,292,296,300,304,308,312,316,320,324,328,332,336,341,345,349,353,357,361,365,369,373,378,386,395,403,411,419,427,435,444,452,460,468,476,484,493,501,509,517,525,533,542,550,558,566,574,582,591,599,607,615,623,631,640,648,656,664,672,681,689,697,705,713,721,730,738],
    /* ★24,000円以上＝表の 文の 通り★（2026-11-02）。前は「末尾＋100円ごと 8.4円」の 近似＝表より 少なく 取っていた
       （24,000円 738→746・30,000円 1,242→1,715・60,000円 3,762→9,450）。出典＝令和8年分 日額表 08-14.xls 丙欄の 文。 */
    over: [
      { at: 24000, base: 746, rate: 0.1021 },
      { at: 26500, base: 1001, rate: 0.2042 },
      { at: 32500, base: 2226, rate: 0.25525 },
      { at: 57500, base: 8608, rate: 0.33693 },
      { at: 116500, base: 28486, rate: 0.4084 }
    ] };
  // ★令和9年分（令和9年1月1日以後に 支払うべき 給与等）★（2026-11-02）
  //   出典＝国税庁 令和9年分 日額表 https://www.nta.go.jp/publication/pamph/gensen/zeigakuhyo2027/data/08-14.pdf（.xls を 機械抽出）。
  //   10,000円未満＝0・10,000〜24,000円未満 100円刻み 140段。24,000円以上は 丙欄の 文（731円＋10.21%…・58,000円で 8,720円＋33.693%）。
  var HEI_R9 = { start: 10000, step: 100, arr: [1,4,8,11,15,18,22,25,29,32,36,39,43,46,51,54,58,61,65,68,72,75,79,82,86,89,93,96,101,104,108,111,115,118,122,125,129,133,137,141,146,150,154,158,162,166,170,174,178,182,186,190,195,199,203,207,211,215,219,223,227,231,235,239,244,248,252,256,260,264,268,272,276,280,284,288,293,297,301,305,309,313,317,321,325,329,333,337,342,346,350,354,358,362,366,370,374,379,387,396,404,412,420,428,436,445,453,461,469,477,485,494,502,510,518,526,535,543,551,559,567,575,584,592,600,608,616,624,633,641,649,657,665,673,682,690,698,706,714,722],
    over: [
      { at: 24000, base: 731, rate: 0.1021 },
      { at: 26500, base: 986, rate: 0.2042 },
      { at: 32500, base: 2211, rate: 0.25525 },
      { at: 58000, base: 8720, rate: 0.33693 },
      { at: 116500, base: 28430, rate: 0.4084 }
    ] };
  // 年分別テーブル(年度キー)。hydrate()で中央データ上書き可。
  var HEI_BY_YEAR = { 2026: HEI_R8, 2027: HEI_R9 };
  var LATEST = 2027;
  var NEN_NASHI = 2026; // 年が 読めない時の 年（densan の optYear・shoyo-zei の shoyoYearOf と 同じ 2026）
  // opts.year → 「その年 以下で 一番 近い 収録年」（2026-11-02）。収録より 古い 年は 一番 古い 収録年・年が 読めない時は 2026（densan・shoyo-zei と 同じ）。
  //  ★前は 収録の 最新を 返した＝中央から 2027 を 引き込むと 2026 の 丙が 来年の 表に なった★（nichi と 同じ 穴）。
  function tableFor(year) {
    var y = parseInt(year, 10);
    var ks = Object.keys(HEI_BY_YEAR).map(Number).filter(function (k) { return k > 0; }).sort(function (a, b) { return a - b; });
    if (!y) y = NEN_NASHI; // ★年が 読めない時は 2026（月額 densan・賞与 shoyo-zei と 同じ）＝最新に すると 年を 渡し忘れた 呼び元に 来年の 表が 当たる（2026-11-02 R9 を 足した時）
    var hit = null;
    for (var i = 0; i < ks.length; i++) { if (ks[i] <= y) hit = ks[i]; }
    return HEI_BY_YEAR[hit != null ? hit : ks[0]];
  }

  // 丙欄税額: その日の社保控除後の日額 → 税額。opts.year(令和8=2026以降)。
  // ※令和7年分以前(year<2026)の丙欄は未収録=令和8表を暫定使用(令和7の日雇いは極稀。要別途照合)。
  // ※日額24,000円以上(日雇いで実質発生しない超高額)は末尾値＋超過分の近似(上限%は割愛)。
  function heiTax(dailyAmount, opts) {
    var amt = num(dailyAmount);
    var T = tableFor(opts && opts.year);
    if (amt < T.start) return 0;
    var i = Math.floor((amt - T.start) / T.step);
    var lastAmt = T.start + T.arr.length * T.step; // =24,000
    if (Array.isArray(T.over) && T.over.length && amt >= T.over[0].at) {
      // その段の 頭の 税額＋（頭を 超える 金額 × 率）・1円未満 切り捨て
      var seg = T.over[0];
      for (var k = 0; k < T.over.length; k++) { if (amt >= T.over[k].at) seg = T.over[k]; }
      return seg.base + Math.floor((amt - seg.at) * seg.rate + 1e-9);
    }
    if (i < T.arr.length) return T.arr[i];
    return T.arr[T.arr.length - 1] + Math.floor((amt - lastAmt) / T.step * 8.4); // 段を 持たない 年だけ（旧い 近似）
  }

  // 中央(Supabase statutory kind=hei)の値で年分別に上書き。不正なら何もしない=ハードコードのまま(フォールバック)。
  // data 形状: { start:number>0, step:number>0, arr:number[](非空) }。
  function hydrate(year, data) {
    if (!year || !data || typeof data !== 'object') return;
    if (!Array.isArray(data.arr) || data.arr.length === 0) return;
    if (!(typeof data.start === 'number' && data.start > 0)) return;
    if (!(typeof data.step === 'number' && data.step > 0)) return;
    var y = parseInt(year, 10); if (!y) return;
    var cur = HEI_BY_YEAR[y], t = { start: data.start, step: data.step, arr: data.arr.slice() };
    // ★lib の 同じ年に 在る 他の 鍵（24,000円以上の 段など）は 消さない★（2026-11-02・丸ごと 置き換えで 段が 消えていた）
    if (cur) { for (var k in cur) { if (!(k in t)) t[k] = cur[k]; } }
    if (Array.isArray(data.over) && data.over.length && data.over.every(function (r) { return r && typeof r.at === 'number' && typeof r.base === 'number' && typeof r.rate === 'number'; })) t.over = data.over;
    // ★24,000円以上の 段が 無い 年は 受けない★（2026-11-02・taiketsu O1）＝lib にも 中央にも 段が 無いと 旧い 近似（表より 少なく 取る）に 倒れる。
    //   nichi の hydrate と 同じく 断る（その年の lib・他の 年の 表が 残る）。
    if (!Array.isArray(t.over) || !t.over.length) return;
    HEI_BY_YEAR[y] = t;
  }
  return { heiTax: heiTax, HEI_R8: HEI_R8, HEI_R9: HEI_R9, HEI_BY_YEAR: HEI_BY_YEAR, hydrate: hydrate, tableFor: tableFor };
});
