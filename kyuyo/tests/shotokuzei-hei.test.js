/* shotokuzei-hei.test.js — 所得税 日額表 丙欄(日雇い)の公式値ロック＋computePayslip通し
 * 出典: 国税庁 給与所得の源泉徴収税額表(令和8年分) 日額表 丙欄(実値・2026-07照合) */
'use strict';
var Hei = require('../lib/shotokuzei-hei.js');
var PayslipCalc = require('../lib/calc.js');

/* 丙欄 令和8 公式値ロック(表引き・実値) */
T('丙欄: 9,800円未満=0 / 9,800=1 / 9,900=5 / 10,000=8', function () {
  eq(Hei.heiTax(9700), 0); eq(Hei.heiTax(9799), 0);
  eq(Hei.heiTax(9800), 1); eq(Hei.heiTax(9850), 1);
  eq(Hei.heiTax(9900), 5); eq(Hei.heiTax(10000), 8);
});
T('丙欄: 15,000=193 / 上限手前 23,900〜24,000未満=738', function () {
  eq(Hei.heiTax(15000), 193);
  eq(Hei.heiTax(23900), 738); eq(Hei.heiTax(23999), 738);
});
T('丙欄: 142段・start9800/step100', function () {
  eq(Hei.HEI_R8.arr.length, 142); eq(Hei.HEI_R8.start, 9800); eq(Hei.HEI_R8.step, 100);
});
/* 丙欄 ブラケット境界の実値ロック(lib非依存の実リテラル) */
T('丙欄 境界: 未満0 / 先頭9800=1 / 中間 / 上限手前738 / 上超近似', function () {
  eq(Hei.heiTax(0), 0); eq(Hei.heiTax(-100), 0); eq(Hei.heiTax(5000), 0);
  eq(Hei.heiTax(9800), 1); eq(Hei.heiTax(9899), 1);
  eq(Hei.heiTax(12000), 79); eq(Hei.heiTax(20000), 419);
  eq(Hei.heiTax(23900), 738);
  // ★2026-11-02 24,000円以上は 表の 文の 通り（746＋超える分×10.21%）。前は 738／738+8 の 近似を 固めていた＝表と 違う★
  eq(Hei.heiTax(24000), 746); eq(Hei.heiTax(24100), 756);
});
/* year解決: 2026以降=R8表 / 2026未満=直近(=R8) */
T('丙欄 year解決: 2026/2025/年無し=R8表・2027/2030=R9表', function () {
  eq(Hei.heiTax(12000, { year: 2026 }), 79);
  eq(Hei.heiTax(12000, { year: 2025 }), 79);
  eq(Hei.heiTax(12000), 79, '年無しは 2026（最新に しない）');
  eq(Hei.heiTax(12000, { year: 2027 }), 72, '令和9 丙 12,000円＝72円（R9 日額表 丙欄）');
  eq(Hei.heiTax(12000, { year: 2030 }), 72, '収録より 新しい 年は 一番 近い 年以下＝R9');
});
/* hydrate: 中央データで上書き / 不正はフォールバック */
T('丙欄 hydrate: 正常データで上書き→復元', function () {
  var orig = Hei.HEI_BY_YEAR[2026];
  Hei.hydrate(2026, { start: 9800, step: 100, arr: [999, 888, 777] });
  eq(Hei.heiTax(9800, { year: 2026 }), 999);
  eq(Hei.heiTax(9900, { year: 2026 }), 888);
  eq(Hei.heiTax(10000, { year: 2026 }), 777);
  Hei.HEI_BY_YEAR[2026] = orig; // 復元
  eq(Hei.heiTax(9800, { year: 2026 }), 1);
});
T('丙欄 hydrate: 不正データ(arr欠落/空/負)はフォールバック維持', function () {
  var orig = Hei.HEI_BY_YEAR[2026];
  Hei.hydrate(2026, { start: 9800, step: 100 });           // arr欠落
  Hei.hydrate(2026, { start: 9800, step: 100, arr: [] });  // 空配列
  Hei.hydrate(2026, { start: 0, step: 100, arr: [5] });    // start不正
  Hei.hydrate(2026, { start: 9800, step: 0, arr: [5] });   // step不正
  Hei.hydrate(2026, null);                                  // null
  Hei.hydrate(2026, { start: 9800, step: 100, arr: 'x' }); // arr非配列
  eq(Hei.HEI_BY_YEAR[2026], orig); // 未変更(同一参照)
  eq(Hei.heiTax(9800, { year: 2026 }), 1);
  eq(Hei.heiTax(12000, { year: 2026 }), 79);
});

/* computePayslip通し: taxClass='hei'は heiTaxAmount をそのまま所得税に(甲乙の算式不使用) */
T('通し: 丙欄 日給12,000×出勤20日 → 所得税=heiTax(12000)*20', function () {
  var per = Hei.heiTax(12000); // 79
  var r = PayslipCalc.computePayslip({
    shikyu: [{ label: '基本給', value: 12000 * 20 }], birthYmd: '1990-01-01', payYm: '2026-06',
    taxClass: 'hei', heiTaxAmount: per * 20, hyojunBase: 240000, apply: { health: false, pension: false, kaigo: false, employ: false }
  });
  eq(r.incomeTax, per * 20); eq(per, 79); eq(r.incomeTax, 1580);
});
T('通し: 丙欄はincomeTaxオフで0', function () {
  var r = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 240000 }], birthYmd: '1990-01-01', payYm: '2026-06', taxClass: 'hei', heiTaxAmount: 1580, apply: { incomeTax: false }, hyojunBase: 240000 });
  eq(r.incomeTax, 0);
});

/* ── 丙 24,000円以上（令和8年分 日額表 08-14.xls の 文の 通り・2026-11-02）──
   前は 末尾＋100円ごと 8.4円の 近似＝24,000円 738・30,000円 1,242・60,000円 3,762（表は 746・1,715・9,450）。 */
T('丙 24,000円以上：各段の 頭と 段の 中が 表の 文の 通り', function () {
  var H2 = require('../lib/shotokuzei-hei.js');
  function h(a) { return H2.heiTax(a, { year: 2026 }); }
  eq(h(23999), 738); eq(h(24000), 746); eq(h(26500), 1001); eq(h(32500), 2226); eq(h(57500), 8608); eq(h(116500), 28486);
  eq(h(30000), 1715); eq(h(60000), 9450); eq(h(26499), 746 + Math.floor(2499 * 0.1021)); eq(h(200000), 28486 + Math.floor(83500 * 0.4084));
});

/* ★令和9年分（2027）丙欄の 公式値ロック★（2026-11-02）
 * 出典: 国税庁 令和9年分 日額表 丙欄 https://www.nta.go.jp/publication/pamph/gensen/zeigakuhyo2027/data/08-14.pdf（203行 lib と 違い0）。
 * 10,000円未満=0（令和8 は 9,800円から）・24,000円以上は 731円＋10.21%… */
T('令和9 丙: 9,999=0 / 10,000=1 / 12,000=72 / 20,000=404 / 23,900=722 / 24,000=731', function () {
  var h = function (a) { return Hei.heiTax(a, { year: 2027 }); };
  eq(h(9999), 0); eq(h(10000), 1); eq(h(12000), 72); eq(h(20000), 404); eq(h(23900), 722); eq(h(24000), 731);
  eq(h(26500), 986); eq(h(58000), 8720);
});
