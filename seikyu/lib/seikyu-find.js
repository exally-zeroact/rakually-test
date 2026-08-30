/* seikyu-find.js — ★探す（取引先・請求日・金額で 絞る）★
 * ============================================================================
 * ★司さん 2026-08-30「ほかの競合のアプリなどが 当たり前にしてる事は こちらも
 *   当たり前にしてな」★
 *   請求書ソフトは どこも 一覧を ★探せる★。うちは 状態の切替（下書き/発行済…）だけで、
 *   ★相手の名前でも 番号でも 探せなかった★＝紙が増えるほど 使えなくなる。
 *
 * ★法律の側からも 同じ形が 要る（国税庁 電子帳簿保存法・電子取引の保存）★
 *   検索要件は 次の3つ
 *     ① ★取引年月日・取引金額・取引先★ で 探せる
 *     ② ★日付・金額は 範囲★を決めて 探せる
 *     ③ ★2つ以上を 組み合わせて★ 探せる
 *   （売上5,000万円以下 等の 免除もあるが、★出来る形にしておく★のが 筋）
 *   ⇒ ここは その3つを そのまま 作った。
 *
 * ★数えない・書き換えない★
 *   ここは ★絞るだけ★。合計や 入金の数え方は 触らない（正は seikyu-doc / seikyu-report）。
 *
 * 公開API（window.SeikyuFind）:
 *   .match(inv, q, ctx)   … 1通が 条件に当たるか
 *   .filter(list, q, ctx) … 当たる物だけ返す
 *   .isEmpty(q)           … 何も入れていない条件か
 *   .normalize(q)         … 使える形に そろえる（空白・全角の数字など）
 */
(function (global) {
  'use strict';

  function s(v) { return String(v === undefined || v === null ? '' : v).trim(); }

  /* ★全角の数字・記号でも 探せる★（スマホの入力で よく混ざる） */
  function han(t) {
    return s(t).replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[，、]/g, ',').replace(/[－ー―‐]/g, '-').replace(/　/g, ' ');
  }
  function numOf(v) {
    var t = han(v).replace(/[,¥￥\s]/g, '');
    if (t === '') return null;
    var n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  function ymdOf(v) {
    var t = han(v).replace(/\//g, '-');
    return /^\d{4}-\d{1,2}(-\d{1,2})?$/.test(t)
      ? t.replace(/-(\d)(?=-|$)/g, '-0$1') : '';
  }

  function normalize(q) {
    var o = q || {};
    return {
      text: han(o.text).toLowerCase(),
      from: ymdOf(o.from), to: ymdOf(o.to),
      min: numOf(o.min), max: numOf(o.max),
    };
  }
  function isEmpty(q) {
    var n = normalize(q);
    return !n.text && !n.from && !n.to && n.min === null && n.max === null;
  }

  /** 1通が 当たるか。ctx.partnerName(inv) … 相手の名前を返す関数（無ければ 写しから拾う） */
  function match(inv, q, ctx) {
    var v = inv || {}, n = normalize(q), c = ctx || {};
    /* ── ★取引先★（名前・番号・件名・備考の どれかに 含まれていれば 当たり） */
    if (n.text) {
      var name = c.partnerName ? s(c.partnerName(v))
        : s(v.snapshot && v.snapshot.partner && v.snapshot.partner.name);
      var hay = [name, s(v.no), s(v.data && v.data.subject), s(v.data && v.data.memo)]
        .join(' ').toLowerCase();
      /* 空白で区切った言葉は ★ぜんぶ 含む★（2つ以上の組み合わせ） */
      var words = han(n.text).split(/\s+/).filter(Boolean);
      for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) < 0) return false;
    }
    /* ── ★取引年月日（範囲）★ … 日付の無い紙は 範囲を決めた時だけ 落とす */
    var ymd = s(v.issue_ymd);
    if (n.from) { if (!ymd || ymd < n.from) return false; }
    if (n.to) {
      /* 「2026-08」まで＝その月の 末日まで（月だけ入れた人を 落とさない） */
      var to = (n.to.length === 7) ? (n.to + '-31') : n.to;
      if (!ymd || ymd > to) return false;
    }
    /* ── ★取引金額（範囲）★ … 金額の無い下書きは 範囲を決めた時だけ 落とす */
    var g = (v.totals && v.totals.grandTotal);
    var amt = (g === undefined || g === null || g === '') ? null : Number(g);
    if (n.min !== null) { if (amt === null || amt < n.min) return false; }
    if (n.max !== null) { if (amt === null || amt > n.max) return false; }
    return true;
  }

  function filter(list, q, ctx) {
    if (isEmpty(q)) return (list || []).slice();
    return (list || []).filter(function (v) { return match(v, q, ctx); });
  }

  var API = { match: match, filter: filter, isEmpty: isEmpty, normalize: normalize };
  global.SeikyuFind = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
