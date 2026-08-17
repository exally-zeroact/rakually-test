/* shaho-kanyu.js — 社会保険(健保/厚年)の加入判定(短時間労働者)。純関数UMD。
 * ================================================================
 * 【出典・一次情報(2026-07照合)】
 *  ・日本年金機構「短時間労働者に対する健康保険・厚生年金保険の適用の拡大」
 *      https://www.nenkin.go.jp/service/kounen/tekiyo/jigyosho/tanjikan.html
 *  ・厚生労働省「社会保険加入の要件(適用拡大特設サイト)」
 *      https://www.mhlw.go.jp/tekiyoukakudai/jugyouin/taisho/
 *  ・年金機構FAQ(4分の3基準)
 *      https://www.nenkin.go.jp/faq/kounen/hihokensha/20140902-07.html
 * 【判定は2系統】
 *  (1) 3/4基準【規模不問=全適用事業所】: 週の所定労働時間 が通常労働者(正社員)の 3/4以上 → 加入対象。
 *      ※法は「週所定 かつ 月所定労働日数」の両方が3/4以上。本アプリは週所定時間ベースで判定(入力を薄く/司さん設計)。
 *  (2) 適用拡大【特定適用事業所=厚年被保険者51人以上(2024.10〜)のみ】: 3/4未満でも次を全て満たせば加入対象。
 *      ア) 週の所定労働時間 20時間以上
 *      イ) 所定内賃金 月額 88,000円以上 ※残業/賞与/通勤/家族/精皆勤手当は含めない
 *      ウ) 学生でない
 *      エ) 2か月以内の期間を定めた雇用でない(=2か月超の見込み)
 * 【★将来変更(要更新)】イの賃金要件は【令和8年(2026年)10月に撤廃予定】。
 *   ★2026-08-08 再照合(一次情報を実際に叩いた結果)★
 *     (1) 日本年金機構(ページ更新 2026-04-17): 「令和8年10月に撤廃予定です」= ★まだ「予定」★
 *         https://www.nenkin.go.jp/service/kounen/tekiyo/jigyosho/tanjikan.html
 *     (2) 根拠法: 令和7年法律第74号(2025-06-20 公布)。撤廃の施行日は「公布から3年以内で政令で定める日」
 *     (3) 施行期日を含む政令案のパブリックコメント: 公示 2026-05-22 / 締切 2026-06-20 /
 *         施行予定日 令和8年10月1日 (e-Gov 案件番号 495260060)
 *     (4) ★e-Gov法令データ(実測 2026-08-08): 厚生年金保険法の【2026-10-01施行版】にも
 *         第12条5号ロ「…八万八千円未満であること。」が★まだ残っている★= 撤廃は法令データに未反映。
 *         (e-Gov API /law_data/329AC0000000115_20261001_507AC0000000074 を実際に取得して確認)
 *   ⇒ ★確定と言えないので WAGE_88K_REMOVED_YM は null のまま(未確定の将来法を先取りしない)。★
 *     切替の可否は scripts/check-wage88k-removal.mjs が e-Gov を叩いて機械で判定する。
 *     ★期限 2026-09-15★ までに再実行し、消えていたら WAGE_88K_REMOVED_YM='2026-10' にする
 *     (10月分の給与計算に間に合わせる)。撤廃後は賃金要件を課さない＝加入対象が増える。
 * 【企業規模要件】51人以上 → 令和9年10月 36人以上 → 令和11年10月 21人以上 → 令和14年10月 11人以上
 *      (年金機構の同ページ。本エンジンは人数を数えず「特定適用事業所か」のチェックで受ける)
 * ================================================================
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.ShahoKanyu = api;
  else if (typeof globalThis !== 'undefined') globalThis.ShahoKanyu = api;
})(this, function () {
  'use strict';
  function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }

  // 法定しきい値(一次情報)。★自己参照でなく上記出典の実数。
  var WEEK_MIN_H = 20;        // 適用拡大: 週20時間以上
  var WAGE_88K = 88000;       // 適用拡大: 所定内月額88,000円以上
  var RATIO_34 = 3 / 4;       // 3/4基準
  var WAGE_88K_REMOVED_YM = null; // 令和8年10月に賃金要件撤廃予定→施行確定後に'2026-10'を設定(それまでnull=現行どおり課す)

  /* 特定適用事業所の人数(厚年被保険者)。★段階引下げは【法律で日付が決まっている】ので数字ではなく表で持つ。
   *  出典: 年金機構「令和9年10月から36人以上/令和11年10月から21人以上/令和14年10月から11人以上」
   *  (e-Gov でも厚年法に 2027-10-01 / 2029-10-01 施行の版が実在する) */
  var TOKUTEI_MIN_NOW = 51;
  var TOKUTEI_STEPS = [{ ym: '2027-10', n: 36 }, { ym: '2029-10', n: 21 }, { ym: '2032-10', n: 11 }];
  // その月に適用される人数(境界=その月から新しい人数)。空/未設定は現行の人数。
  function tokuteiMinInsured(ym) {
    var y = String(ym || ''), n = TOKUTEI_MIN_NOW;
    if (!/^\d{4}-\d{2}$/.test(y)) return n;
    for (var i = 0; i < TOKUTEI_STEPS.length; i++) { if (y >= TOKUTEI_STEPS[i].ym) n = TOKUTEI_STEPS[i].n; }
    return n;
  }

  /* ym('YYYY-MM')時点で「賃金要件」が有効か(撤廃日の月からfalse)。
   *  @param removedYm 撤廃の切替点。省略時は法令の値(WAGE_88K_REMOVED_YM)。
   *    ★テスト専用の裏口ではない：撤廃日が政令で決まるまで動くので、
   *      「その日だったらどうなるか」を実物の数で測れるようにしてある(境界テスト用でもある)。
   *  ★境界: 撤廃月ちょうど(等号)は【課さない】。空/未設定/壊れたymは【課す】=現行法どおり(安全側)。 */
  function wageReqActive(ym, removedYm) {
    var cut = (removedYm === undefined) ? WAGE_88K_REMOVED_YM : removedYm;
    if (!cut) return true;                      // 撤廃日が決まっていない=現行どおり課す
    return String(ym || '') < String(cut);      // '' < '2026-10' → true = 課す(安全側)
  }

  // 加入判定。誤警告ゼロ最優先=適用拡大は特定適用事業所(51人以上)のときだけ判定する。
  //  inp: {
  //    weeklyH,            従業員の週所定労働時間(h)
  //    fullTimeWeeklyH,    通常労働者(正社員)の週所定労働時間(h)。0/未設定なら3/4基準は判定不能(false)。
  //    monthlyShoteiWage,  所定内月額賃金(円・残業/賞与/通勤/家族/精皆勤除外)
  //    isStudent,          学生か(true=適用拡大の対象外)
  //    tokuteiTekiyo,      特定適用事業所(厚年被保険者51人以上)か
  //    employMonthsExpect, 雇用見込み月数(null/未設定=継続=2か月超とみなす)
  //    ym                  対象月('YYYY-MM'・賃金要件撤廃日の判定用・任意)
  //    wageReqRemovedYm    賃金要件の撤廃点('YYYY-MM'・省略=法令の値)。境界を実物で測るための口。
  //  }
  //  返り: { required, san34, kakudai, reasons:[..], wageReqActive }
  function judge(inp) {
    inp = inp || {};
    var wk = num(inp.weeklyH), ft = num(inp.fullTimeWeeklyH);
    var reasons = [];

    // (1) 3/4基準(規模不問)。週所定が正社員の3/4以上。
    var san34 = (ft > 0 && wk > 0 && wk + 1e-9 >= ft * RATIO_34);
    if (san34) reasons.push('3/4基準（週の所定労働時間が正社員の3/4以上）');

    // (2) 適用拡大(特定適用事業所のみ)。3/4未満でも4要件で加入。
    var kakudai = false;
    if (inp.tokuteiTekiyo && !san34) {
      var wReq = wageReqActive(inp.ym, inp.wageReqRemovedYm);
      var okWeek = wk + 1e-9 >= WEEK_MIN_H;
      var okWage = !wReq || num(inp.monthlyShoteiWage) >= WAGE_88K; // 撤廃後は賃金要件を課さない
      var okStudent = !inp.isStudent;
      var okMonths = (inp.employMonthsExpect == null) || num(inp.employMonthsExpect) > 2; // 未設定=継続とみなす
      if (okWeek && okWage && okStudent && okMonths) {
        kakudai = true;
        // ★文の中に法定の数字を書かない。上の定数から組み立てる
        //   ＝撤廃/改定で計算だけ直って、画面の文だけ古い数字で残るのを防ぐ。
        reasons.push('適用拡大（' + weekReqText() + '・' + (wReq ? wageReqText() + '・' : '')
          + '学生でない・2か月超の見込み／特定適用事業所）');
      }
    }
    return { required: san34 || kakudai, san34: san34, kakudai: kakudai, reasons: reasons,
      wageReqActive: wageReqActive(inp.ym, inp.wageReqRemovedYm) };
  }

  /* ★画面や説明に出す「要件の言い方」は必ずここを通す（数字を文に直書きしない）。 */
  function yen(n) { return String(n).replace(/\B(?=(\d{3})+$)/g, ','); }
  function weekReqText() { return '週' + WEEK_MIN_H + '時間以上'; }
  function wageReqText() { return '月' + yen(WAGE_88K) + '円以上'; }
  function tokuteiText(ym) { return '常時' + tokuteiMinInsured(ym) + '人以上'; }
  /* 対象月時点の適用拡大4要件の文。撤廃後は賃金要件の1つが消える。 */
  function kakudaiReqText(ym, removedYm) {
    return [weekReqText()]
      .concat(wageReqActive(ym, removedYm) ? [wageReqText()] : [])
      .concat(['学生でない', '2か月超の雇用見込み']).join(' / ');
  }

  return { judge: judge, wageReqActive: wageReqActive, tokuteiMinInsured: tokuteiMinInsured,
    weekReqText: weekReqText, wageReqText: wageReqText, kakudaiReqText: kakudaiReqText, tokuteiText: tokuteiText,
    WEEK_MIN_H: WEEK_MIN_H, WAGE_88K: WAGE_88K, RATIO_34: RATIO_34,
    WAGE_88K_REMOVED_YM: WAGE_88K_REMOVED_YM, TOKUTEI_MIN_NOW: TOKUTEI_MIN_NOW, TOKUTEI_STEPS: TOKUTEI_STEPS };
});
