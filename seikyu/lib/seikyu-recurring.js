/* seikyu-recurring.js — ★毎月の請求（今月まだ出していない相手を 当てて見せる）★
 * ============================================================================
 * ★司さん 2026-08-30「ほかの競合のアプリなどが 当たり前にしてる事は こちらも
 *   当たり前にしてな」★
 *   Misoca も freee も ★定期請求★を持っている
 *   （毎月 同じ内容を 決めた日に 自動で作る）。うちは 何も無かった＝★出し忘れる★。
 *
 * ★うちのやり方＝勝手に作らない。「まだですよ」と 言う★
 *   ① うちは 端末の中だけで動く（★決まった時刻に 動く物が 居ない★）＝
 *      「自動で作る」は 出来ない。★出来ない物を 出来ると見せない★。
 *   ② それ以上に、★人が見ていない所で 請求書が出来ている★のは 怖い。
 *      間違った内容で 出来ていたら 取り消しの手間が 増える。
 *   ⇒ ★開いた時に「毎月 出している相手で 今月まだの人」を 出す★。
 *     押せば 前回の中身で 複製される（＝作るのは 人。押すのは1回）。
 *
 * ★登録も させない★（品目と同じ考え方）
 *   「毎月の相手」は ★もう出した紙を 数えれば 分かる★。先に設定を させない。
 *
 * ★毎月の相手★の決め方（＝ここが唯一の正）
 *   ・出した請求書（issued・請求書だけ）の 請求日の 年月を 相手ごとに 集める
 *   ・直近 LOOK か月の中に ★連続する2か月★が 在れば「毎月の相手」
 *     （2回きりの相手を 毎月と決めない／1回だけの相手は もちろん 出さない）
 *   ・その相手に ★今月の紙が 1枚も無い★時だけ 出す
 *     ★下書きでも 在れば 出さない★（もう作りかけ＝二重に作らせない）
 *
 * 公開API（window.SeikyuRecurring）:
 *   .dueList({invoices, partners, ym})  … 今月まだの相手（新しく出した順）
 *   .ymOf(dateOrYmd)                    … 'YYYY-MM'
 *   .LOOK / .NEED
 */
(function (global) {
  'use strict';

  var LOOK = 6;        // 何か月 さかのぼって見るか
  var NEED = 2;        // 連続で 何か月 出していれば「毎月の相手」か

  function s(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function ymOf(v) {
    var t = s(v);
    return /^\d{4}-\d{2}/.test(t) ? t.slice(0, 7) : '';
  }
  /** 'YYYY-MM' を n か月ずらす */
  function shift(ym, n) {
    var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) + n;
    y += Math.floor((m - 1) / 12);
    m = ((m - 1) % 12 + 12) % 12 + 1;
    return y + '-' + (m < 10 ? '0' : '') + m;
  }

  /** 今月まだ出していない「毎月の相手」。返り = [{partnerId,name,months,lastId,lastNo,lastYm}] */
  function dueList(o) {
    var opt = o || {};
    var ym = ymOf(opt.ym) || '';
    if (!ym) return [];
    var invoices = opt.invoices || [];
    var byId = {};
    (opt.partners || []).forEach(function (p) { if (p && p.id) byId[p.id] = p; });

    /* 相手ごとに「出した年月」と「今月 何か在るか」を集める */
    var acc = {};
    invoices.forEach(function (v) {
      if (!v) return;
      if ((v.doc_type || 'invoice') !== 'invoice') return;
      var pid = s(v.partner_id);
      if (!pid) return;
      var m = ymOf(v.issue_ymd);
      var a = acc[pid] || (acc[pid] = { months: {}, thisMonth: false, last: null, lastYm: '' });
      /* ★今月は 下書き・取り消しでも「在る」と数える★
         下書き＝もう作りかけ／取り消し＝一度 作った＝どちらも「気づいていない」ではない。 */
      if (m === ym) a.thisMonth = true;
      if (v.status !== 'issued') return;
      if (m) a.months[m] = true;
      if (m && m > a.lastYm) { a.lastYm = m; a.last = v; }
    });

    var out = [];
    Object.keys(acc).forEach(function (pid) {
      var a = acc[pid];
      if (a.thisMonth) return;                       // もう在る＝言わない
      if (!a.last) return;                           // 出した紙が1枚も無い
      /* 直近 LOOK か月（今月は含めない）に 連続 NEED か月が 在るか */
      var run = 0, best = 0;
      for (var i = LOOK; i >= 1; i--) {
        if (a.months[shift(ym, -i)]) { run++; if (run > best) best = run; }
        else run = 0;
      }
      if (best < NEED) return;
      out.push({
        partnerId: pid,
        name: (byId[pid] && byId[pid].data && byId[pid].data.name)
          || (a.last.snapshot && a.last.snapshot.partner && a.last.snapshot.partner.name) || '（相手なし）',
        months: Object.keys(a.months).sort(),
        run: best,
        lastId: a.last.id, lastNo: s(a.last.no), lastYm: a.lastYm,
        lastTotal: (a.last.totals && Number(a.last.totals.grandTotal)) || 0,
      });
    });
    return out.sort(function (x, y) { return (y.lastYm || '').localeCompare(x.lastYm || ''); });
  }

  var API = { dueList: dueList, ymOf: ymOf, shift: shift, LOOK: LOOK, NEED: NEED };
  global.SeikyuRecurring = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
