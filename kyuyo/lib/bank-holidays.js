/* bank-holidays.js — ★銀行が休みの日★（＝振込ができない日）を 法令から出す（純関数）
 * ================================================================
 * ★根拠は法律です（一次情報を当たって確かめた）★
 *   ・銀行法 第十五条第一項
 *       「銀行の休日は、日曜日その他政令で定める日に限る。」
 *   ・銀行法施行令 第五条第一項（上の「政令で定める日」）
 *       一号 国民の祝日に関する法律に規定する休日
 *       二号 十二月三十一日から翌年の一月三日までの日（一号に掲げる日を除く。）
 *       三号 土曜日
 *   出典 … e-Gov 法令検索（法令ID 銀行法 356AC0000000059 ／ 銀行法施行令 357CO0000000040）
 *   ★確かめた日 2026-08-27★
 *
 *   ※ 施行令 第五条第二項に「金融庁長官が告示・承認・届出した日」も在るが、
 *      ★銀行ごと・営業所ごとに違う★ので ここでは持たない（持つなら 会社が足す物）。
 *   ※ 一号の「国民の祝日に関する法律に規定する休日」には ★振替休日・国民の休日も入る★。
 *      その計算は ★holidays.js が持っている★（同じ物を2箇所に置かない）。
 *
 * ★数字を説明文に直書きしない★
 *   年末年始の 12/31〜1/3 は ★下の YEAR_END 1か所★ に持ち、画面も試験もここから読む。
 *
 * 【利用】ブラウザ window.BankHolidays ／ Node require('./bank-holidays.js')
 * ================================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./holidays.js'));
  } else { root.BankHolidays = factory(root.Holidays); }
})(typeof self !== 'undefined' ? self : this, function (Holidays) {
  'use strict';

  /* ★銀行法施行令 第五条第一項第二号★＝12月31日から翌年1月3日まで */
  var YEAR_END = { fromMonth: 12, fromDay: 31, toMonth: 1, toDay: 3 };

  /* ★出典（画面や報告に出す時は ここから読む＝説明文に直書きしない）★ */
  var SOURCE = {
    law: '銀行法 第十五条第一項',
    order: '銀行法施行令 第五条第一項',
    lawId: '356AC0000000059',
    orderId: '357CO0000000040',
    checkedOn: '2026-08-27',
    where: 'e-Gov 法令検索',
  };

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  function dow(y, m, d) { return new Date(y, m - 1, d).getDay(); }   /* 0=日 … 6=土 */

  function inYearEnd(m, d) {
    if (m === YEAR_END.fromMonth && d >= YEAR_END.fromDay) return true;
    if (m === YEAR_END.toMonth && d <= YEAR_END.toDay) return true;
    return false;
  }

  /* ★休みかどうかと、その理由★（理由は画面に出す＝人に「なぜ動いたか」を見せる） */
  function reasonOf(y, m, d) {
    var w = dow(y, m, d);
    if (w === 0) return '日曜';                                   /* 銀行法15条1項 */
    if (w === 6) return '土曜';                                   /* 施行令5条1項3号 */
    var hs = Holidays.holidaysOfYear(y);
    var name = hs[ymd(y, m, d)];
    if (name) return name;                                        /* 施行令5条1項1号 */
    if (inYearEnd(m, d)) return '年末年始';                        /* 施行令5条1項2号 */
    return '';
  }

  function isBankHoliday(y, m, d) { return reasonOf(y, m, d) !== ''; }

  /* ★寄せる★ … which='prev'（前の営業日）／'next'（次の営業日）
     返り … {y,m,d,moved:0|1,from:'YYYY-MM-DD',reason:'土曜'} */
  function shift(y, m, d, which) {
    var from = ymd(y, m, d);
    var reason = reasonOf(y, m, d);
    if (!reason) return { y: y, m: m, d: d, moved: 0, from: from, reason: '' };
    var step = (which === 'next') ? 1 : -1;
    var dt = new Date(y, m - 1, d);
    /* 続けて休みでも 抜けるまで動く（年末年始＋土日＋祝日が連なる事が在る）。
       ★止まらない作りにしない★＝14日で打ち切って 出来なかったと言う。 */
    for (var i = 0; i < 14; i++) {
      dt.setDate(dt.getDate() + step);
      var yy = dt.getFullYear(), mm = dt.getMonth() + 1, dd = dt.getDate();
      if (!isBankHoliday(yy, mm, dd)) {
        return { y: yy, m: mm, d: dd, moved: 1, from: from, reason: reason };
      }
    }
    return null;    /* ★出来なかった＝呼んだ側が止める（黙って何かを返さない）★ */
  }

  function prevBusinessDay(y, m, d) { return shift(y, m, d, 'prev'); }
  function nextBusinessDay(y, m, d) { return shift(y, m, d, 'next'); }

  /* ★全銀の取組日は MMDD の4桁★（年は持たない＝仕様） */
  function mmdd(o) { return o ? pad(o.m) + pad(o.d) : ''; }

  return {
    YEAR_END: YEAR_END, SOURCE: SOURCE,
    isBankHoliday: isBankHoliday, reasonOf: reasonOf,
    shift: shift, prevBusinessDay: prevBusinessDay, nextBusinessDay: nextBusinessDay,
    mmdd: mmdd, ymd: ymd, dow: dow,
  };
});
