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
 *   .summarize({invoices, receipts, partners, month, kind, amountOf})  … amountOf(v)＝1通の 額（画面は 紙の ご請求金額から 繰越を 除いた 額を 渡す・無ければ grandTotal）
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

    /* ★赤伝の 差し引き★（画面が 帳簿から 渡す creditOf・taiketsu 7回目 止1）＝「請求」は 紙の ご請求金額の まま（司さんの「揃えろ」）、
       赤伝で 別の 月の 紙から 引いた 分は 別の 列に 出し、残り＝請求 − 差し引き − 入金（一覧の 1通の 残りと 同じ 式） */
    var creditOf = typeof o.creditOf === 'function' ? o.creditOf : function () { return 0; };
    var rows = {}, totals = { total: 0, credit: 0, paid: receipts === null ? null : 0,
      remain: receipts === null ? null : 0, count: 0,
      unpaidCount: receipts === null ? null : 0 };

    target.forEach(function (v) {
      /* ★1通の 額は 画面が 渡す amountOf（紙の ご請求金額から 繰越を 除いた 額＝控除・源泉の 後）★
         渡されなければ 今まで どおり totals.grandTotal（控除の 後）。 */
      var total = num(o.amountOf ? o.amountOf(v) : (v.totals && v.totals.grandTotal));
      var st = DOC.paymentStateOf({ id: v.id, grand_total: total }, receipts);
      var pid = v.partner_id || '';
      var name = (byId[pid] && byId[pid].data && byId[pid].data.name)
        || (v.snapshot && v.snapshot.partner && v.snapshot.partner.name) || '（相手なし）';
      var r = rows[pid] || (rows[pid] = { partnerId: pid, name: name, total: 0, credit: 0,
        paid: receipts === null ? null : 0, remain: receipts === null ? null : 0, count: 0, state: 'unknown' });
      var cr = receipts === null ? 0 : num(creditOf(v));
      r.total += total;
      r.credit += cr;
      totals.credit += cr;
      r.count++;
      totals.total += total;
      totals.count++;
      if (receipts !== null) {
        r.paid += num(st.paid);
        totals.paid += num(st.paid);
        if (num(st.remain) - cr > 0) totals.unpaidCount++;   // 残りが ある 1通だけ（赤伝・差し引きで 済んだ 紙は 数えない）
      }
    });

    var list = Object.keys(rows).map(function (k) {
      var r = rows[k];
      if (receipts !== null) {
        r.remain = r.total - r.credit - r.paid;
        /* ★残りが マイナスなら 入金が 0 でも 過入金★（赤伝だけの 月＝こちらが 返す 額・一覧と 同じ 言葉・taiketsu 6回目 止B） */
        /* 残りが 0 なら 済み（赤伝を 差し引いて 0 に なった 月も・入金 0 でも 督促しない） */
        r.state = r.remain < 0 ? 'over' : r.remain > 0 ? (r.paid === 0 ? 'unpaid' : 'partial') : 'paid';
      }
      return r;
    }).sort(function (a, b) { return b.total - a.total; });

    if (receipts !== null) totals.remain = totals.total - totals.credit - totals.paid;
    return { totals: totals, rows: list, month: month, kind: kind, seen: target.length };
  }

  var API = { monthsOf: monthsOf, summarize: summarize, MONTH_ALL: MONTH_ALL };
  global.SeikyuReport = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
