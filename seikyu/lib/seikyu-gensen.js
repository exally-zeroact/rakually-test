/* seikyu-gensen.js — ★源泉徴収（報酬・料金）を請求書で引く★
 * ==============================================================================
 * 士業・デザイナー・ライター・講師など、個人への報酬は源泉徴収の対象。
 * 請求書に「源泉徴収税額」と「差引お支払額」が無いと ★その商売では1通も出せない★。
 *
 * ★率も式も ここには書かない★
 *   100万円以下 / 100万円超 の計算は ★kyuyo/lib/shiharai-chosho.js の gensenA()★ が唯一の正。
 *   給与(Kyually)が既に持っている物なので、請求書は ★呼ぶだけ★。
 *   （同じ物を2箇所に持つと、法が変わった日に片方だけ古くなる）
 *
 * ★このファイルの仕事は「対象額をいくらにするか」だけ★
 *   国税庁 タックスアンサー No.2798:
 *     ・弁護士や税理士などの業務に関する報酬・料金は源泉徴収の対象
 *     ・謝金・調査費・日当・旅費の名目でも対象に含まれる
 *     ・★消費税が明確に区分されている請求書は、消費税を除いた報酬額のみが対象★
 *   → だから
 *     ・行ごとに「源泉の対象か」を持つ（★立替の交通費は対象外／報酬は対象★）
 *     ・対象額は ★税抜★（内税で打っていても、消費税を除いた額に掛ける）
 *
 * ★「引いていない」と「0円」を作り分ける★
 *   対象の行が1本も無い＝そもそも引く商売ではない → on:false（紙に行を出さない）
 *   対象は在るが額が小さくて0円 → on:true・amount:0（紙に「0円」と出す）
 *
 * ★画面に依らない（DOMを1つも触らない）★＝素のNodeで全パターン回せる。
 *
 * 【利用】ブラウザ window.SeikyuGensen（先に kyuyo/lib/shiharai-chosho.js と seikyu-tax.js を読む）
 *         Node    require('./seikyu-gensen.js')
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./seikyu-tax.js'), require('../../kyuyo/lib/shiharai-chosho.js'));
  } else {
    root.SeikyuGensen = factory(root.SeikyuTax, root.ShiharaiChosho);
  }
})(typeof self !== 'undefined' ? self : this, function (TAX, CHOSHO) {
  'use strict';
  if (!TAX || !TAX.compute) throw new Error('seikyu-tax.js を先に読んでください');
  if (!CHOSHO || !CHOSHO.gensenA) throw new Error('kyuyo/lib/shiharai-chosho.js を先に読んでください（率の唯一の正）');

  var LABEL = '源泉徴収税額';
  var NET_LABEL = '差引お支払額';

  /* その行が源泉の対象か。★明細に付けた印だけを見る（金額や名前から当てない）★ */
  function isTarget(ln) { return !!(ln && ln.gensen); }

  /**
   * compute({ lines, taxMode, rounding, tax })
   *   lines … seikyu-tax.compute が返した行（gensen の印を持っている）
   *   tax   … その計算結果（合計を使う）
   * 返り = { on, base, amount, net, label, netLabel }
   *   on     … 源泉を引く紙かどうか（対象の行が1本でもあるか）
   *   base   … 対象額（★消費税を除いた報酬額★）
   *   amount … 源泉徴収税額（★1円未満切り捨て＝gensenA が持つ規則★）
   *   net    … 差引お支払額（合計 − 源泉徴収税額）
   */
  function compute(o) {
    o = o || {};
    var lines = o.lines || [];
    var tax = o.tax || {};
    var grand = Number(tax.grandTotal) || 0;

    var targets = [];
    for (var i = 0; i < lines.length; i++) if (isTarget(lines[i])) targets.push(lines[i]);

    if (!targets.length) {
      return { on: false, base: 0, amount: 0, net: grand, label: LABEL, netLabel: NET_LABEL };
    }

    /* ★対象額＝対象の行だけで、同じ丸め方でもう一度 税抜を出す★
       内税で打たれていても「消費税を除いた報酬額」に掛けるため。
       行ごとに割り戻すのではなく ★税率ごとに1回だけ丸める★（本体と同じ規則）。 */
    var sub = TAX.compute({
      lines: targets.map(function (ln) {
        return { name: ln.name, amount: ln.amount, rate: ln.rate, nontax: ln.nontax };
      }),
      taxMode: o.taxMode,
      rounding: o.rounding,
    });
    var base = sub.ok ? sub.subtotal : 0;

    var amount = CHOSHO.gensenA(base);   // ★率と式は給与の lib が持つ★
    return {
      on: true, base: base, amount: amount, net: grand - amount,
      label: LABEL, netLabel: NET_LABEL,
    };
  }

  /** 発行時に写しへ残す形（あとで率が変わっても、出した紙は変わらない） */
  function snapshotOf(r) {
    if (!r || !r.on) return null;
    return { base: r.base, amount: r.amount, net: r.net };
  }
  function fromSnapshot(s, grand) {
    if (!s) return { on: false, base: 0, amount: 0, net: Number(grand) || 0, label: LABEL, netLabel: NET_LABEL };
    return {
      on: true, base: Number(s.base) || 0, amount: Number(s.amount) || 0,
      net: (s.net === undefined || s.net === null) ? ((Number(grand) || 0) - (Number(s.amount) || 0)) : Number(s.net),
      label: LABEL, netLabel: NET_LABEL,
    };
  }

  return {
    compute: compute, isTarget: isTarget,
    snapshotOf: snapshotOf, fromSnapshot: fromSnapshot,
    LABEL: LABEL, NET_LABEL: NET_LABEL,
  };
});
