/* seikyu-report.js — ★売上の集計（月ごと・取引先ごとに いくら請求／入金／残り）★
 * ============================================================================
 * ★司さん 2026-08-30「ほかの競合のアプリなどが 当たり前にしてる事は こちらも当たり前にしてな」★
 *   請求書ソフトは ★どこも 集計（レポート）を 持っている★。うちだけ 無かった。
 *
 * ★測り方は 代行請求アプリ(daikou-seikyu.html:10812 renderReport)から 借りた★
 *   ＝「月を選ぶ → 請求／入金／残額 の3つ ＋ 取引先ごとの表（大きい順）」
 *   ★借りたのは 測り方だけ。見た目（表の形・色）は 借りていない★（うちの決まり）。
 *
 * ★ここが 唯一の正★ … 画面では 1つも 数え直さない。
 *   入金の数え方は seikyu-doc.paymentStateOf を そのまま呼ぶ（2つ目の正を作らない）。
 *
 * ★数に入れない物★
 *   ・取り消した紙（void）    … 請求していない
 *   ・下書き（draft）          … まだ請求していない（0円と混ぜない）
 *   ・見積書                   … 請求ではない（種類で分ける）
 * ★入金が読めていない時（receipts === null）★
 *   ・paid / remain は ★null★（0円と書かない）＝画面は「未確認」と出す
 *
 * 公開API（window.SeikyuReport）:
 *   .monthsOf(invoices)                     … 請求日の年月（新しい順・重複なし）
 *   .summarize({invoices, receipts, partners, month, kind})
 *   .MONTH_ALL                              … 「ぜんぶ」を表す印
 */
(function (global) {
  'use strict';

  var MONTH_ALL = '';

  function ymOf(v) {
    var s = String((v && v.issue_ymd) || '');
    return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : '';
  }
  function num(n) { var x = Number(n); return Number.isFinite(x) ? x : 0; }

  /** 請求日の年月（新しい順）。★日付の無い紙は 月に入れない（勝手に今月にしない）★ */
  function monthsOf(invoices) {
    var seen = {}, out = [];
    (invoices || []).forEach(function (v) {
      var m = ymOf(v);
      if (!m || seen[m]) return;
      seen[m] = 1; out.push(m);
    });
    return out.sort().reverse();
  }

  /** 集計する。★数えたのは何本かも返す（空振りに気づける）★ */
  function summarize(o) {
    o = o || {};
    var DOC = o.doc || global.SeikyuDoc;
    var invoices = o.invoices || [];
    var receipts = (o.receipts === null || o.receipts === undefined) ? null : o.receipts;
    var partners = o.partners || [];
    var month = o.month || MONTH_ALL;
    var kind = o.kind || 'invoice';

    var byId = {};
    partners.forEach(function (p) { if (p && p.id) byId[p.id] = p; });

    var target = invoices.filter(function (v) {
      if (!v) return false;
      if ((v.doc_type || v.kind || 'invoice') !== kind) return false;
      if (v.status !== 'issued') return false;                 // ★出した紙だけ★
      if (month && ymOf(v) !== month) return false;
      return true;
    });

    var rows = {}, totals = { total: 0, paid: receipts === null ? null : 0,
      remain: receipts === null ? null : 0, count: 0,
      unpaidCount: receipts === null ? null : 0 };

    target.forEach(function (v) {
      var total = num(v.totals && v.totals.grandTotal);
      var st = DOC.paymentStateOf({ id: v.id, grand_total: total }, receipts);
      var pid = v.partner_id || '';
      var name = (byId[pid] && byId[pid].data && byId[pid].data.name)
        || (v.snapshot && v.snapshot.partner && v.snapshot.partner.name) || '（相手なし）';
      var r = rows[pid] || (rows[pid] = { partnerId: pid, name: name, total: 0,
        paid: receipts === null ? null : 0, remain: receipts === null ? null : 0, count: 0, state: 'unknown' });
      r.total += total;
      r.count++;
      totals.total += total;
      totals.count++;
      if (receipts !== null) {
        r.paid += num(st.paid);
        totals.paid += num(st.paid);
        if (st.state === 'unpaid' || st.state === 'partial') totals.unpaidCount++;
      }
    });

    var list = Object.keys(rows).map(function (k) {
      var r = rows[k];
      if (receipts !== null) {
        r.remain = r.total - r.paid;
        r.state = r.paid === 0 ? 'unpaid' : r.remain > 0 ? 'partial' : r.remain === 0 ? 'paid' : 'over';
      }
      return r;
    }).sort(function (a, b) { return b.total - a.total; });

    if (receipts !== null) totals.remain = totals.total - totals.paid;
    return { totals: totals, rows: list, month: month, kind: kind, seen: target.length };
  }

  var API = { monthsOf: monthsOf, summarize: summarize, MONTH_ALL: MONTH_ALL };
  global.SeikyuReport = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
