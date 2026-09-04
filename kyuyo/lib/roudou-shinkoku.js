/* roudou-shinkoku.js — ★労働保険 年度更新（申告書）の 計算★
 * ============================================================================
 * ★出どころ（2026-09-04 に 全部 原文で 確かめた／★画像では なく 字が 取れる 物★）★
 *
 *  ① ★保険料の 端数＝切り捨て／算定基礎額が 同額なら 合計率に 乗じてから★
 *     厚生労働省「令和８年度 労働保険年度更新申告書の書き方（継続事業用）」Ｑ３
 *       「…★切り捨て★になります。なお、労災保険と雇用保険の算定基礎額が★同額の場合★は、
 *         ★別々に計算して切り捨てるのではなく、両保険の算定基礎額を両保険の料率の合計に乗じ、
 *           その後切り捨てて★ください。」
 *
 *  ② ★算定基礎額は 千円未満 切り捨て★
 *     労働保険の保険料の徴収等に関する法律 第十五条第一項第一号
 *       「…に係る賃金総額（★その額に千円未満の端数があるときは、その端数は、切り捨てる★。以下同じ。）」
 *
 *  ③ ★概算保険料の 賃金総額★
 *     同 第十五条第一項第一号「…賃金総額の★見込額★（厚生労働省令で定める場合にあつては、
 *       ★直前の保険年度に使用したすべての労働者に係る賃金総額★）に…一般保険料率を乗じて算定した一般保険料」
 *     同 施行規則 第二十四条
 *       「法第十五条第一項各号の厚生労働省令で定める場合は、当該保険年度の保険料算定基礎額の見込額が、
 *         ★直前の保険年度の保険料算定基礎額の百分の五十以上百分の二百以下★である場合とする。」
 *       ⇒★見込が 前年度の 50%〜200% に 収まるなら「前年度の 額」を そのまま 使う★
 *
 *  ④ ★延納（分割納付）★
 *     同 施行規則 第二十七条第一項
 *       「…納付すべき概算保険料の額が★四十万円★（労災保険に係る保険関係又は雇用保険に係る保険関係のみが
 *         成立している事業については、★二十万円★）以上のもの…を、
 *         ★四月一日から七月三十一日まで、八月一日から十一月三十日まで及び十二月一日から翌年三月三十一日まで★
 *         の各期に分けて納付することができる。」
 *     同 第二十七条第二項「★その概算保険料の額を期の数で除して得た額を各期分の概算保険料として★…」
 *     ★申告書の書き方 Ｑ４★「令和８年度概算保険料★だけでは★40万円に満たないのですが、
 *       令和７年度確定保険料の不足額と合計すると40万円以上となります。この場合、延納はできますか？
 *       Ａ．★延納することはできません★。（★概算保険料のみで40万円以上の場合★が延納可能となります。）」
 *
 *  ⑤ ★分けた時の 端数は ★最初の 期★に 合算★
 *     国等の債権債務等の金額の端数計算に関する法律 第三条
 *       「…二以上の履行期限を定め、一定の金額に分割して履行することとされている場合において、
 *         その履行期限ごとの分割金額に一円未満の端数があるとき、…その端数金額又は分割金額は、
 *         ★すべて最初の履行期限に係る分割金額に合算する★ものとする。」
 *     （同 第一条第二項「他の法令中の端数計算に関する規定が この法律の規定に矛盾し…場合には、
 *       ★この法律の規定が優先する★」）
 *
 *  ⑥ ★一般拠出金★
 *     厚生労働省「石綿健康被害救済法に基づく一般拠出金の徴収制度について」本文
 *       「(２)[納付方法]★労働保険料（確定保険料）と併せて申告・納付★します。
 *        (３)[料率]★一般拠出金率は1000分の0.02★です。」
 *       「平成26年4月1日から、一般拠出金率が1000分の0.05から1000分の0.02に引き下げられました。」
 *     ★概算払いは 無い（確定のみ）★＝上の ページに「労働保険料（確定保険料）と併せて」と 在り、
 *       ★延納の 対象にも しない★。
 *
 * ★まだ 測っていない（数字を 作らない）★
 *   ・★一般拠出金の 賃金総額が 労災の 算定基礎額と 同じか★は 原文で 読み切れていない
 *     （申告書の 該当ページが ★画像で 字が 取れない★）。
 *     ⇒ ここでは ★呼ぶ側が 渡した 賃金総額★で 計算する（勝手に 労災の 額を 使わない）。
 *   ・メリット制（労災率の 増減）は 未着手。
 *
 * 【利用】ブラウザ window.RoudouShinkoku / Node require('./roudou-shinkoku.js')
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.RoudouShinkoku = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var IPPAN_PERMIL = 0.02;          /* ⑥ 一般拠出金率＝1000分の0.02 */
  var ENNO_YEN = 400000;            /* ④ 概算保険料 40万円以上で 延納できる */
  var ENNO_YEN_KATAHOU = 200000;    /* ④ 労災か雇用の 片方だけなら 20万円以上 */
  var MIKOMI_MIN = 0.5, MIKOMI_MAX = 2.0;   /* ③ 前年度の 50%〜200% */

  function n(v) { var x = Number(v); return (isFinite(x) && x > 0) ? x : 0; }
  /* ② 算定基礎額は 千円未満 切り捨て */
  function santeiKiso(wage) { return Math.floor(n(wage) / 1000) * 1000; }

  /* ① 労働保険料（労災＋雇用）
       ★算定基礎額（千円未満 切り捨て後）が 同額なら 合計率に 乗じてから 1回だけ 切り捨てる★
       ★率が 分からない時は null★（0を 返さない） */
  function hokenryo(rousaiWage, koyoWage, rousaiRate, koyoRate) {
    var rb = santeiKiso(rousaiWage), kb = santeiKiso(koyoWage);
    var rr = (rousaiRate == null) ? null : Number(rousaiRate);
    var kr = (koyoRate == null) ? null : Number(koyoRate);
    var rousai = (rr == null) ? null : Math.floor(rb * rr);
    var koyo = (kr == null) ? null : Math.floor(kb * kr);
    if (rr == null || kr == null) return { rousaiBase: rb, koyoBase: kb, rousai: rousai, koyo: koyo, gokei: null, awaseta: false };
    if (rb === kb) return { rousaiBase: rb, koyoBase: kb, rousai: rousai, koyo: koyo, gokei: Math.floor(rb * (rr + kr)), awaseta: true };
    return { rousaiBase: rb, koyoBase: kb, rousai: rousai, koyo: koyo, gokei: rousai + koyo, awaseta: false };
  }

  /* ⑥ 一般拠出金＝賃金総額（千円未満 切り捨て）× 0.02/1000（1円未満 切り捨て）
       ★概算払いは 無い＝確定のみ★ */
  function ippanKyoshutsukin(wage) {
    var b = santeiKiso(wage);
    return { base: b, gaku: Math.floor(b * (IPPAN_PERMIL / 1000)), permil: IPPAN_PERMIL, gaisanNashi: true };
  }

  /* ③ 概算の 算定基礎額＝見込が 前年度の 50%〜200% なら ★前年度の 額★
       ★見込を 出していない（null）時は 前年度の 額★（実務の 既定＝法の「厚生労働省令で定める場合」） */
  function gaisanBase(mikomiWage, zennendoWage) {
    var zen = santeiKiso(zennendoWage);
    if (mikomiWage == null || mikomiWage === '') return { base: zen, tsukatta: 'zennendo', riyu: '見込を 出していない＝前年度の 額' };
    var mi = santeiKiso(mikomiWage);
    if (!zen) return { base: mi, tsukatta: 'mikomi', riyu: '前年度が 無い＝見込の 額' };
    var hi = mi / zen;
    if (hi >= MIKOMI_MIN && hi <= MIKOMI_MAX) {
      return { base: zen, tsukatta: 'zennendo', riyu: '見込が 前年度の 50%〜200%（' + Math.round(hi * 1000) / 10 + '%）＝前年度の 額' };
    }
    return { base: mi, tsukatta: 'mikomi', riyu: '見込が 前年度の 50%〜200% の 外（' + Math.round(hi * 1000) / 10 + '%）＝見込の 額' };
  }

  /* ④ 延納できるか（★概算保険料「のみ」で 見る★＝不足額と 足さない） */
  function ennoDekiruka(gaisanGokei, katahouDake) {
    if (gaisanGokei == null) return { ok: false, riyu: '概算保険料が まだ 出ていません' };
    var sen = katahouDake ? ENNO_YEN_KATAHOU : ENNO_YEN;
    if (n(gaisanGokei) >= sen) return { ok: true, sen: sen, riyu: '概算保険料 ' + Math.floor(n(gaisanGokei)).toLocaleString() + '円 ≧ ' + sen.toLocaleString() + '円' };
    return { ok: false, sen: sen,
      riyu: '概算保険料 ' + Math.floor(n(gaisanGokei)).toLocaleString() + '円 が ' + sen.toLocaleString() + '円 未満'
        + '（★確定の 不足額と 足しても 延納は できません★）' };
  }

  /* ④⑤ 期ごとに 分ける＝÷期数、★端数は すべて 最初の 期に 合算★ */
  function ennoKibetsu(gaku, kiSuu) {
    var g = Math.floor(n(gaku)), k = Math.floor(n(kiSuu)) || 3;
    if (!g) return { ki: [], amari: 0 };
    var hito = Math.floor(g / k);
    var arr = [];
    for (var i = 0; i < k; i++) arr.push(hito);
    var amari = g - hito * k;
    arr[0] += amari;                       /* ★最初の 履行期限に 合算★（端数計算法 第三条） */
    return { ki: arr, amari: amari, hito: hito };
  }

  /* 確定 と 概算（前年度に 納めた 額）の 精算
       確定 ＞ 概算 … 不足（今年の 概算と 一緒に 納める）
       確定 ＜ 概算 … 余り（★今年の 概算に 充当★ するのが 既定／★還付は 別に 請求書が 要る★） */
  function seisan(kakuteiGokei, zennendoGaisan) {
    if (kakuteiGokei == null || zennendoGaisan == null) return { measured: false, why: '確定か 前年度の 概算が 出ていません' };
    var sa = Math.floor(n(kakuteiGokei)) - Math.floor(n(zennendoGaisan));
    if (sa > 0) return { measured: true, kubun: 'fusoku', gaku: sa };
    if (sa < 0) return { measured: true, kubun: 'amari', gaku: -sa };
    return { measured: true, kubun: 'nashi', gaku: 0 };
  }

  return {
    IPPAN_PERMIL: IPPAN_PERMIL, ENNO_YEN: ENNO_YEN, ENNO_YEN_KATAHOU: ENNO_YEN_KATAHOU,
    MIKOMI_MIN: MIKOMI_MIN, MIKOMI_MAX: MIKOMI_MAX,
    santeiKiso: santeiKiso, hokenryo: hokenryo, ippanKyoshutsukin: ippanKyoshutsukin,
    gaisanBase: gaisanBase, ennoDekiruka: ennoDekiruka, ennoKibetsu: ennoKibetsu, seisan: seisan
  };
}));
