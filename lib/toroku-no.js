/* toroku-no.js — ★インボイスの登録番号（T＋13桁）を 通信なしで確かめる★
 * =============================================================================
 * なぜ要るか（指示役 2026-08-18）:
 *   ★登録番号は当てない★。当てられる物ではない（相手が国税庁からもらった番号）。
 *   出来るのは ★打ち間違いだけ弾く★。国税庁の公表サイトは ★叩かない（通信なし）★。
 *
 * 見る所は2つ:
 *   ①形 … 先頭が T ／ 続きが 13桁の数字。ここが違えば ★弾く★（直してもらう）。
 *   ②検査用数字 … 法人番号（13桁）は ★1桁目が検査用数字★で、残り12桁から計算できる。
 *        検査用数字 = 9 −（Σ P(n)×Q(n)）÷ 9 の余り
 *          P(n) … 基礎番号（下12桁）の 下から n 桁目の数字
 *          Q(n) … n が奇数なら 1／偶数なら 2
 *        （余りが 0 の時は 9）
 *      ★合わない時でも 止めない★。理由:
 *        個人事業者などは 法人番号を持たないので ★国税庁が新しく13桁を付番★する。
 *        その13桁に この検査用数字の決まりが在るかは ★公表されていない★。
 *        ＝「法人番号として合わない」だけで、間違いと断言できない。
 *        ★分からない物を 間違いと言わない★＝「打ち間違いかもしれません」と言うに留める。
 *
 * 返す物 … { ok, level:'ok'|'empty'|'shape'|'digit', msg, no }
 *   ok=false は ★形が違う時だけ★（level:'shape'）。'digit' は注意（ok=true）。
 *
 * 【利用】ブラウザ window.TorokuNo ／ Node require('./toroku-no.js')
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.TorokuNo = api;
  else if (typeof globalThis !== 'undefined') globalThis.TorokuNo = api;
})(this, function () {
  'use strict';

  /* 全角の英数字とハイフン・空白を 半角に寄せてから見る（スマホの入力で混ざる） */
  function normalize(s) {
    var t = String(s == null ? '' : s);
    t = t.replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
    t = t.replace(/[\s　\-‐-―ー]/g, '');
    return t.toUpperCase();
  }

  /** 12桁の基礎番号から 検査用数字（0〜9）を作る。※12桁でなければ null */
  function checkDigitOf(base12) {
    var s = String(base12 || '');
    if (!/^[0-9]{12}$/.test(s)) return null;
    var sum = 0;
    for (var n = 1; n <= 12; n++) {
      var p = Number(s.charAt(12 - n));      // 下から n 桁目
      var q = (n % 2 === 1) ? 1 : 2;         // 奇数=1 / 偶数=2
      sum += p * q;
    }
    var r = sum % 9;
    return 9 - r;                            // 余り 0 の時は 9
  }

  /** 13桁の法人番号として 検査用数字が合っているか */
  function digitsOk(no13) {
    var s = String(no13 || '');
    if (!/^[0-9]{13}$/.test(s)) return false;
    return checkDigitOf(s.slice(1)) === Number(s.charAt(0));
  }

  /**
   * 登録番号を確かめる。
   * @param {string} raw 人が打った文字
   * @param {{required?:boolean}} [opt] required=true なら 空も弾く
   */
  function check(raw, opt) {
    var o = opt || {};
    var s = normalize(raw);
    if (!s) {
      return o.required
        ? { ok: false, level: 'empty', no: '', msg: '登録番号を入れてください（T のあと 13桁）。' }
        : { ok: true, level: 'empty', no: '', msg: '' };
    }
    if (!/^T[0-9]{13}$/.test(s)) {
      var why = /^T/.test(s)
        ? ('T のあとが ' + s.slice(1).replace(/[^0-9]/g, '').length + '桁です（13桁 入ります）')
        : 'T から始まります';
      return { ok: false, level: 'shape', no: s, msg: '★この形では登録番号になりません★（' + why + '）。' };
    }
    if (!digitsOk(s.slice(1))) {
      return {
        ok: true, level: 'digit', no: s,
        msg: '★打ち間違いかもしれません★（法人番号の検査用数字と合いません）。'
          + '個人の事業者の番号は この検査が効かないので、合っていればそのままで大丈夫です。',
      };
    }
    return { ok: true, level: 'ok', no: s, msg: '形も検査用数字も合っています。' };
  }

  return { normalize: normalize, checkDigitOf: checkDigitOf, digitsOk: digitsOk, check: check };
});
