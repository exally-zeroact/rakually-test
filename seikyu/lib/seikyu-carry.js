/* seikyu-carry.js — ★繰越（前回の残り）★
 * ==============================================================================
 * 掛け売り（毎月 締めて請求する商売）では ほぼ必須の型。紙の頭に5行:
 *   前回請求額 ／ 入金額 ／ 繰越額 ／ 今回請求額 ／ 合計請求額
 *
 * ★取れなかったを 0 や空にしない★（このファイルの一番 大事な仕事）
 *   入金が読めなかった  → state:'unknown'。paid/carry/grandTotal は ★null★
 *     （0円にすると、払ってもらったのに「未入金」の紙を送る＝二重請求・誤督促）
 *   前回が無い（初回）  → state:'first'。prevTotal は ★null★
 *     （0円と書くと「0円の請求書を出した」ように読める）
 *   ★過入金を0でクランプしない★（多く入った事実を残す＝state:'over'）
 *
 * ★出した紙は動かない★
 *   発行した時の5行を写しに残す。あとで入金が入っても ★去年の紙の繰越は変わらない★。
 *
 * ★画面に依らない（DOMを1つも触らない）／時計を持たない★
 *
 * 【利用】ブラウザ window.SeikyuCarry ／ Node require('./seikyu-carry.js')
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SeikyuCarry = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* 紙と画面で同じ並び・同じ言葉を使う（★5行の定義はここが唯一の正★） */
  var ROWS = [
    { key: 'prevTotal', label: '前回請求額' },
    { key: 'paid', label: '入金額' },
    { key: 'carry', label: '繰越額' },
    { key: 'thisTotal', label: '今回請求額' },
    { key: 'grandTotal', label: '合計請求額' },
  ];

  var STATE_LABEL = {
    ok: '',
    first: '前回の請求はありません',
    unknown: '入金は未確認',
    over: '過入金',
  };

  function num(v) { var n = Number(v); return Number.isFinite(n) ? n : 0; }
  function totalOf(inv) { return num(inv && inv.totals && inv.totals.grandTotal); }

  /**
   * 「前回」を選ぶ。★同じ取引先の、この請求日以前の、直前の発行済み★
   *   ・下書き・取り消しは辿らない（出していない紙／無かった事にした紙）
   *   ・自分自身は選ばない
   *   ・同じ日に2通あれば番号の大きい方
   *   ・未来の請求は選ばない
   */
  function prevOf(all, cur) {
    var list = Array.isArray(all) ? all : [];
    var c = cur || {};
    var best = null;
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      if (!v || v.id === c.id) continue;
      if (v.status !== 'issued') continue;
      if ((v.partner_id || '') !== (c.partner_id || '')) continue;
      if ((v.doc_type || 'invoice') !== (c.doc_type || 'invoice')) continue;
      if (c.issue_ymd && v.issue_ymd && v.issue_ymd > c.issue_ymd) continue;   // 未来は辿らない
      if (!best) { best = v; continue; }
      var newer = (v.issue_ymd || '') > (best.issue_ymd || '')
        || ((v.issue_ymd || '') === (best.issue_ymd || '') && String(v.no || '') > String(best.no || ''));
      if (newer) best = v;
    }
    return best;
  }

  /**
   * compute({ prev, receipts, thisTotal })
   *   prev     … prevOf の返り（無ければ null）
   *   receipts … 入金の一覧。★読めなかった時は null を渡す（[] と区別する）★
   *   thisTotal… 今回の請求の合計
   * 返り = { state, prevNo, prevTotal, paid, carry, thisTotal, grandTotal, label }
   */
  function compute(o) {
    o = o || {};
    var thisTotal = num(o.thisTotal);
    var prev = o.prev || null;

    if (!prev) {
      return {
        state: 'first', prevNo: '', prevTotal: null, paid: null, carry: null,
        thisTotal: thisTotal, grandTotal: thisTotal, label: STATE_LABEL.first,
      };
    }
    var prevTotal = totalOf(prev);

    if (o.receipts == null) {
      // ★読めなかった＝数を作らない（0にしない）
      return {
        state: 'unknown', prevNo: prev.no || '', prevTotal: prevTotal, paid: null, carry: null,
        thisTotal: thisTotal, grandTotal: null, label: STATE_LABEL.unknown,
      };
    }

    var paid = 0;
    var rs = o.receipts;
    for (var i = 0; i < rs.length; i++) {
      var r = rs[i] || {};
      if (r.deleted_at) continue;                                   // 消した入金は数えない
      if (prev.id && r.invoice_id !== undefined && r.invoice_id !== prev.id) continue;  // 別の請求の入金
      paid += num(r.amount);
    }
    var carry = prevTotal - paid;                                   // ★0でクランプしない★
    return {
      state: carry < 0 ? 'over' : 'ok',
      prevNo: prev.no || '', prevTotal: prevTotal, paid: paid, carry: carry,
      thisTotal: thisTotal, grandTotal: carry + thisTotal,
      label: carry < 0 ? STATE_LABEL.over : '',
    };
  }

  /** 発行時に写しへ残す形（あとで入金が入っても、出した紙は変わらない） */
  function snapshotOf(r) {
    if (!r) return null;
    return {
      state: r.state, prevNo: r.prevNo || '', prevTotal: r.prevTotal, paid: r.paid,
      carry: r.carry, thisTotal: r.thisTotal, grandTotal: r.grandTotal,
    };
  }
  function fromSnapshot(s) {
    if (!s) return null;
    return {
      state: s.state, prevNo: s.prevNo || '', prevTotal: s.prevTotal, paid: s.paid,
      carry: s.carry, thisTotal: s.thisTotal, grandTotal: s.grandTotal,
      label: STATE_LABEL[s.state] || '',
    };
  }

  return {
    ROWS: ROWS, STATE_LABEL: STATE_LABEL,
    prevOf: prevOf, compute: compute, snapshotOf: snapshotOf, fromSnapshot: fromSnapshot,
  };
});
