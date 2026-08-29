/* kikan.js — ★締め期間（◯日〜◯日）★
 * =============================================================================
 * ★これは 借り物です。読みやすく書き直してはいけません★
 *   正本 … C:/Users/zeroa/timeally/lib/tc-calc.js の period(ym, closeDay)
 *   正本の試験 … timeally/tests/close-period.test.mjs（★締め日1〜31 × 月4種 ＝124通り★）
 *   ★借りてよいのは 道具・測り方・試験★（うちの決まり）。
 *   ★同じ形のまま★ 持ってきています。読みやすく直すと ★正本と食い違った時に 気づけません★。
 *   seikyu/tests/kikan.test.mjs が
 *     ・124通りを そのまま 測る
 *     ・★正本と 1文字ずつ 比べる★（同じ機械に timeally が在る時だけ。無ければ ★未測定★）
 *
 * ★決まり（正本のまま）★
 *   closeDay = 31 は 末日締め（その月まるごと）。それ以外は ★前月(closeDay+1) 〜 当月(closeDay)★。
 *   2月30日のような ★無い日は その月の末日に丸める★（穴を開けない）。
 *   客が言う「◯日から」→ 締め日は ★その日−1★（1日から＝31／10日から＝9／21日から＝20）。
 *
 * ★どのアプリからも 使う★（請求書＝対象期間／給与＝締め日）。★2か所に写さない★。
 *
 * ★なぜ 請求書に要るか★（司さん・指示役 ④「聞く形」の残り）
 *   紙に出す「対象期間 2025/8/21 〜 2025/9/20」を ★毎回 手で打たせない★。
 *   ただし ★締め日は 請求書のどこにも 持っていません★。
 *   ⇒ ★出した紙から 当てる★（seikyu-invoice-ask.js の periodGuess）。当てられない時は ★出さない★。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.Kikan = api;
  if (typeof window !== 'undefined') window.SeikyuKikan = api;   // ★前の名前でも読める（呼ぶ側を一度に直さない）
}(this, function () {
  'use strict';

  /* ══ ここから ★正本のまま★（timeally/lib/tc-calc.js） ══════════════════ */
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function period(ym, closeDay) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7);
    var cd = Number(closeDay) || 31;
    if (cd >= 31) {
      return { ym: ym, from: ym + '-01', to: ym + '-' + pad2(daysInMonth(y, m)) };
    }
    var pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
    var fromD = Math.min(cd + 1, daysInMonth(py, pm));
    var toD = Math.min(cd, daysInMonth(y, m));
    return {
      ym: ym,
      from: py + '-' + pad2(pm) + '-' + pad2(fromD),
      to: y + '-' + pad2(m) + '-' + pad2(toD),
    };
  }
  function pad2(n) { return ('0' + n).slice(-2); }
  /* ══ ★正本のまま★ ここまで ═══════════════════════════════════════════ */

  /** 客の言う「◯日から」→ 締め日（正本の決まり: その日−1／1日からは 末日締め＝31） */
  function closeDayFromStartDay(startDay) {
    var d = Number(startDay);
    if (!(d >= 1 && d <= 31)) return null;
    return d === 1 ? 31 : d - 1;
  }

  /** '2026-08-21' → '2026/8/21'（紙に出す形。★0埋めしない★＝実物32枚がこの形） */
  function slash(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
    return m ? (m[1] + '/' + (+m[2]) + '/' + (+m[3])) : '';
  }

  /** 紙に出す1行「対象期間 2025/8/21 〜 2025/9/20」（★言葉は呼ぶ側が決める★＝ここは日付だけ） */
  function rangeLabel(p) {
    if (!p || !p.from || !p.to) return '';
    return slash(p.from) + ' 〜 ' + slash(p.to);
  }

  return {
    period: period, daysInMonth: daysInMonth,
    closeDayFromStartDay: closeDayFromStartDay,
    slash: slash, rangeLabel: rangeLabel,
  };
}));
