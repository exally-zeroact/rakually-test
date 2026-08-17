/* shiharai-chosho.js — K3 源泉徴収(報酬・料金 204条)＋支払調書 の純関数。
 *   ★法定値は docs/SPEC_gensen_shiharai_tax_K3.md（国税庁 一次情報照合・出典URL付き）に準拠。実数値テストで1円一致。
 *   ★不可侵ガード: 運転代行・運送・軽貨物=204条非該当=源泉なし・支払調書なし。既定は「非該当」。全業務委託に源泉を掛けない。
 *   復興特別所得税込: 10.21%=10%×1.021 / 20.42%=20%×1.021。端数=1円未満切り捨て。
 *   区分(実装): none 非該当 / ippan 一般・士業(A) / shihou 司法書士等(B) / gaikou 外交員等(C) / sonota その他(要確認=非該当扱い)。
 *   出典: No.2795/2798(A) No.2801(B) No.2804(C) No.6929(税込/税抜) No.7431(支払調書) No.2793(義務者)。
 *   【利用】ブラウザ window.ShiharaiChosho / Node require('./shiharai-chosho.js')
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.ShiharaiChosho = api;
  else if (typeof globalThis !== 'undefined') globalThis.ShiharaiChosho = api;
})(this, function () {
  'use strict';

  function num(v) { var n = Number(String(v == null ? 0 : v).replace(/[, ]/g, '')); return isNaN(n) ? 0 : n; }
  var R1 = 0.1021, R2 = 0.2042; // 10.21% / 20.42%(復興込)

  // 報酬区分の器。gensen=204条該当(源泉対象&支払調書対象)か。threshold=支払調書 提出金額基準(超で提出)。
  //  ★'none'/'sonota'=非該当=源泉0・支払調書 対象外(不可侵)。sonota=区分曖昧の逃がし先(捏造で率を作らない)。
  var KUBUN = {
    none: { key: 'none', label: '非該当（運転代行・運送・軽貨物等＝源泉なし）', gensen: false, threshold: null },
    ippan: { key: 'ippan', label: '一般の報酬・料金／士業（弁護士・税理士・原稿・講演・デザイン等）', gensen: true, threshold: 50000, formula: 'A' },
    shihou: { key: 'shihou', label: '司法書士・土地家屋調査士・海事代理士', gensen: true, threshold: 50000, formula: 'B' },
    gaikou: { key: 'gaikou', label: '外交員・集金人・電力量計検針人', gensen: true, threshold: 500000, formula: 'C' },
    hostess: { key: 'hostess', label: 'ホステス・バンケットホステス等（接待業務）', gensen: true, threshold: 50000, formula: 'D' },
    sonota: { key: 'sonota', label: 'その他（要確認＝非該当扱い・源泉なし）', gensen: false, threshold: null },
    /* ★旧データ用（選択肢には出さない＝KUBUN_ORDER に入れない）。
       'genkou'(原稿料)は移設前のデータに残っていて、算式が無いまま【源泉0】で計算されていた。
       国税庁 No.2795「原稿料や講演料等を支払ったとき」
         https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2795.htm （2026-08-04 確認）
       100万円以下=A×10.21% / 100万円超=(A−100万円)×20.42%+102,100円・1円未満切捨
       ＝ ippan(一般・士業/所得税法204条1項1号)と★まったく同じ算式★なので A に寄せる。
       ★引き忘れは払う側(会社)の義務違反＝追徴されるのは会社。0のままにしない。 */
    genkou: { key: 'genkou', label: '原稿料・講演料（旧データ＝一般・士業と同じ扱い）', gensen: true, threshold: 50000, formula: 'A', legacy: true }
  };
  // ★画面に出す順（＝選べる区分）。legacy はここに入れない＝新しく選ばせない。
  var KUBUN_ORDER = ['none', 'ippan', 'shihou', 'gaikou', 'hostess', 'sonota'];
  function kubunOf(key) { return KUBUN[key] || KUBUN.none; }

  // A: 一般・士業。100万以下=額×10.21% / 100万超=(額−100万)×20.42%+102,100(=100万×10.21%)。
  function gensenA(amount) {
    var a = num(amount); if (a <= 0) return 0;
    if (a <= 1000000) return Math.floor(a * R1);
    return 102100 + Math.floor((a - 1000000) * R2);
  }
  // B: 司法書士等。(額−1万)×10.21%。1万以下=0。
  function gensenB(amount) {
    var a = num(amount); if (a <= 10000) return 0;
    return Math.floor((a - 10000) * R1);
  }
  // C: 外交員等。(その月の報酬 − 控除額)×10.21%。控除額=12万−その月の給与等(残額・0未満は0)。控除後が0以下=0。
  function gensenC(amount, monthlySalary) {
    var a = num(amount);
    var deduct = Math.max(0, 120000 - num(monthlySalary)); // 給与併給時は残額
    var base = a - deduct;
    return base <= 0 ? 0 : Math.floor(base * R1);
  }

  /* D: ホステス等（所得税法204条1項6号）。
     (支払金額 − 5,000円 × 計算期間の日数)×10.21%。同月中に給与等の支払があれば さらに控除。
     出典: 国税庁 No.2807「ホステス等に報酬・料金を支払ったとき」
       https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2807.htm （2026-08-04 確認）
     ページの例: 3/1〜3/31(31日)・報酬75万円 →(750,000−155,000)×10.21% = 60,749円
     ★日数が渡されない時は控除0で計算せず【0を返す】＝多く引く方に倒さない（日数は必ず渡す）。 */
  function gensenD(amount, days, monthlySalary) {
    var a = num(amount), d = num(days);
    if (a <= 0 || d <= 0) return 0;
    var base = a - (5000 * d) - num(monthlySalary);
    return base <= 0 ? 0 : Math.floor(base * R1);
  }

  // 区分別 源泉徴収税額。amount=対象額(既定は税込・区分明確なら税抜=呼び出し側で選択済みの額)。
  //  opts.monthlySalary = C(外交員)の同月給与等(控除残の計算用)。非該当/その他=0(不可侵)。
  function gensenFor(kubunKey, amount, opts) {
    var k = kubunOf(kubunKey);
    if (!k.gensen) return 0; // ★非該当(代行/その他)は必ず0
    if (k.formula === 'A') return gensenA(amount);
    if (k.formula === 'B') return gensenB(amount);
    if (k.formula === 'C') return gensenC(amount, (opts && opts.monthlySalary) || 0);
    if (k.formula === 'D') return gensenD(amount, (opts && opts.days) || 0, (opts && opts.monthlySalary) || 0);
    return 0;
  }

  // 支払調書の提出基準を満たすか(同一人・年間支払合計 annual が threshold 超)。非該当は常に false。
  function meetsThreshold(kubunKey, annual) {
    var k = kubunOf(kubunKey);
    return !!(k.gensen && k.threshold != null && num(annual) > k.threshold);
  }

  // 支払調書 一覧の行。people=[{name, kubun, annualPay, annualGensen}]。
  //  ★源泉額(annualGensen)は明細で実際に源泉した額の年間合計を入力=法定値の単一ソース(当libで再計算しない)。
  //  非該当/基準未満=target:false で対象外(理由つき・SPEC: 代行はデフォルト出さない)。
  function choshoRows(people) {
    return (people || []).map(function (p) {
      var k = kubunOf(p.kubun);
      var annual = num(p.annualPay);
      var target = meetsThreshold(p.kubun, annual);
      var reason = '';
      if (!k.gensen) reason = '204条非該当（支払調書の対象外）';
      else if (!target) reason = '年間支払が提出基準（' + fmtYen(k.threshold) + '超）未満＝対象外';
      return {
        name: p.name || '', kubunKey: k.key, kubunLabel: k.label,
        annualPay: annual, annualGensen: num(p.annualGensen),
        threshold: k.threshold, target: target, reason: reason
      };
    });
  }

  function fmtYen(n) { return '¥' + num(n).toLocaleString('en-US'); }

  return {
    KUBUN: KUBUN, KUBUN_ORDER: KUBUN_ORDER, kubunOf: kubunOf,
    gensenFor: gensenFor, gensenA: gensenA, gensenB: gensenB, gensenC: gensenC, gensenD: gensenD,
    meetsThreshold: meetsThreshold, choshoRows: choshoRows
  };
});
