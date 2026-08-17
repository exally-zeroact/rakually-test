/* shaho-kanyu.test.js — 社保 加入判定(短時間労働者)。厚労省/年金機構の一次情報を実数リテラルで固定。
 *   ★誤警告ゼロ最優先: 適用拡大(2)は特定適用事業所(51人以上)のときだけ。OFFでは絶対に出さない。 */
'use strict';
var SK = require('../lib/shaho-kanyu.js');

// 正社員=週40h想定。3/4=30h。
T('3/4基準: 週30h(=40×3/4)以上は加入対象・規模不問(トグルOFFでもsan34)', function () {
  var r = SK.judge({ weeklyH: 30, fullTimeWeeklyH: 40, tokuteiTekiyo: false });
  eq(r.san34, true, '30h=3/4ちょうど→該当');
  eq(r.required, true, '加入対象');
});
T('3/4基準: 週29hは非該当(30h未満)', function () {
  var r = SK.judge({ weeklyH: 29, fullTimeWeeklyH: 40, tokuteiTekiyo: false });
  eq(r.san34, false, '29h<30h→非該当');
});
T('3/4基準: 正社員週所定が未設定(0)なら判定不能=san34は出さない(誤警告防止)', function () {
  eq(SK.judge({ weeklyH: 35, fullTimeWeeklyH: 0 }).san34, false, 'ft=0→false');
});

// ★適用拡大=特定適用事業所(51人以上)のときだけ。小さい会社(OFF)では絶対に出さない。
T('★適用拡大: トグルOFF(小さい会社)では週25h・月10万でも一切出さない(誤警告ゼロ)', function () {
  var r = SK.judge({ weeklyH: 25, fullTimeWeeklyH: 40, monthlyShoteiWage: 100000, isStudent: false, tokuteiTekiyo: false });
  eq(r.kakudai, false, '★OFF=適用拡大は出さない');
  eq(r.san34, false, '25h<30h=3/4も非該当');
  eq(r.required, false, '★加入対象にしない(入らなくていいパートに誤警告しない)');
});
T('適用拡大: トグルON+週20h以上+月88,000以上+非学生+継続 → 加入対象', function () {
  var r = SK.judge({ weeklyH: 20, fullTimeWeeklyH: 40, monthlyShoteiWage: 88000, isStudent: false, tokuteiTekiyo: true });
  eq(r.kakudai, true, '4要件そろい→該当');
  eq(r.required, true);
});
T('適用拡大: 週19h(20h未満)は非該当', function () {
  eq(SK.judge({ weeklyH: 19, fullTimeWeeklyH: 40, monthlyShoteiWage: 100000, tokuteiTekiyo: true }).kakudai, false);
});
T('適用拡大: 月87,999円(88,000未満)は非該当', function () {
  eq(SK.judge({ weeklyH: 25, fullTimeWeeklyH: 40, monthlyShoteiWage: 87999, tokuteiTekiyo: true }).kakudai, false);
});
T('★適用拡大: 学生は除外(週25h・月10万でもkakudai=false)', function () {
  var r = SK.judge({ weeklyH: 25, fullTimeWeeklyH: 40, monthlyShoteiWage: 100000, isStudent: true, tokuteiTekiyo: true });
  eq(r.kakudai, false, '学生→対象外');
});
T('適用拡大: 2か月以内の雇用見込み(=2)は非該当(2か月超の見込みが必要)', function () {
  eq(SK.judge({ weeklyH: 25, fullTimeWeeklyH: 40, monthlyShoteiWage: 100000, tokuteiTekiyo: true, employMonthsExpect: 2 }).kakudai, false, '2か月ちょうど→除外');
  eq(SK.judge({ weeklyH: 25, fullTimeWeeklyH: 40, monthlyShoteiWage: 100000, tokuteiTekiyo: true, employMonthsExpect: 3 }).kakudai, true, '3か月→該当');
});
T('適用拡大: 見込み未設定(null)は継続とみなし該当しうる', function () {
  eq(SK.judge({ weeklyH: 25, fullTimeWeeklyH: 40, monthlyShoteiWage: 100000, tokuteiTekiyo: true, employMonthsExpect: null }).kakudai, true);
});

// 3/4該当なら適用拡大の4要件は見に行かない(3/4が優先・二重表示しない)
T('3/4該当時: kakudaiはfalse(3/4で既に加入=適用拡大の判定に回さない)', function () {
  var r = SK.judge({ weeklyH: 32, fullTimeWeeklyH: 40, monthlyShoteiWage: 60000, isStudent: true, tokuteiTekiyo: true });
  eq(r.san34, true); eq(r.kakudai, false, '3/4該当→適用拡大は判定しない'); eq(r.required, true);
});

/* ══ ★賃金要件(88,000円)の撤廃 — 境界を実物で測る★ ══════════════════════
 * 【2026-08-08 再照合】年金機構は「令和8年10月に撤廃予定」のまま／施行期日を含む政令案はパブコメ済
 *   (公示2026-05-22・締切2026-06-20・施行予定日 令和8年10月1日)。しかし
 *   ★e-Gov法令データの厚年法【2026-10-01施行版】に第12条5号ロ(八万八千円)がまだ残っている＝未確定★
 *   だから切替点は null のまま。確かめ直す道具: scripts/check-wage88k-removal.mjs
 * ★ここでは「今」と「切り替えた後」の両方を、撤廃点を渡して★実際の判定で★測る。
 *   切り替えは1行だが、その1行の効き方を先に固定しておく（当日に慌てて確かめるのでは遅い）。 */
T('★賃金要件[今]: 撤廃点nullなので、どの月でも課す(撤廃予定の2026-10でも)', function () {
  eq(SK.WAGE_88K_REMOVED_YM, null, '★切替点はまだ入れていない(未確定の将来法を先取りしない)');
  ['2026-09', '2026-10', '2026-11', '2030-01'].forEach(function (ym) {
    eq(SK.wageReqActive(ym), true, ym + ' は課す');
  });
});
T('★賃金要件[今]: 87,999円は非該当 / 88,000円ちょうどは該当(等号を含む)', function () {
  var base = { weeklyH: 25, fullTimeWeeklyH: 40, tokuteiTekiyo: true, ym: '2026-10' };
  eq(SK.judge(Object.assign({}, base, { monthlyShoteiWage: 87999 })).kakudai, false, '87,999→入らない');
  eq(SK.judge(Object.assign({}, base, { monthlyShoteiWage: 88000 })).kakudai, true, '★88,000ちょうど→入る');
  eq(SK.judge(Object.assign({}, base, { monthlyShoteiWage: 88001 })).kakudai, true, '88,001→入る');
});
T('★賃金要件[撤廃後]: 撤廃月の【前月/当月/翌月】で判定が変わる(等号=当月から課さない)', function () {
  var CUT = '2026-10';
  var base = { weeklyH: 25, fullTimeWeeklyH: 40, tokuteiTekiyo: true, monthlyShoteiWage: 50000, wageReqRemovedYm: CUT };
  eq(SK.judge(Object.assign({}, base, { ym: '2026-09' })).kakudai, false, '★前月は賃金要件あり→月5万は入らない');
  eq(SK.judge(Object.assign({}, base, { ym: CUT })).kakudai, true, '★撤廃月ちょうどから 月5万でも入る');
  eq(SK.judge(Object.assign({}, base, { ym: '2026-11' })).kakudai, true, '翌月も入る');
  eq(SK.wageReqActive('2026-09', CUT), true);
  eq(SK.wageReqActive(CUT, CUT), false, '★等号=撤廃月から課さない');
  eq(SK.wageReqActive('2026-11', CUT), false);
});
T('★賃金要件[撤廃後]: 他の3要件は生きている(週20h未満・学生・2か月以内・規模は入らないまま)', function () {
  var CUT = '2026-10';
  var base = { fullTimeWeeklyH: 40, tokuteiTekiyo: true, monthlyShoteiWage: 0, ym: CUT, wageReqRemovedYm: CUT };
  eq(SK.judge(Object.assign({}, base, { weeklyH: 19 })).kakudai, false, '★週19h→入らない');
  eq(SK.judge(Object.assign({}, base, { weeklyH: 20 })).kakudai, true, '週20hちょうど→入る');
  eq(SK.judge(Object.assign({}, base, { weeklyH: 25, isStudent: true })).kakudai, false, '★学生→入らない');
  eq(SK.judge(Object.assign({}, base, { weeklyH: 25, employMonthsExpect: 2 })).kakudai, false, '★2か月ちょうど→入らない');
  eq(SK.judge(Object.assign({}, base, { weeklyH: 25, tokuteiTekiyo: false })).kakudai, false, '★特定適用OFF→入らない');
});
T('★賃金要件[空・不明]: ym未設定/空/壊れた値は【課す】側に倒す(安全側・黙って外さない)', function () {
  var CUT = '2026-10';
  eq(SK.wageReqActive('', CUT), true, '空');
  eq(SK.wageReqActive(null, CUT), true, '未設定');
  eq(SK.wageReqActive(undefined, CUT), true, '未設定');
  eq(SK.wageReqActive('2026', CUT), true, '壊れた値(年だけ)');
  var r = SK.judge({ weeklyH: 25, fullTimeWeeklyH: 40, tokuteiTekiyo: true, monthlyShoteiWage: 50000, wageReqRemovedYm: CUT });
  eq(r.kakudai, false, '★ym未設定なら賃金要件を課したまま=月5万は入らない');
});
T('★賃金要件の文: 数字は lib の定数から組み立てる(撤廃後は文からも消える)', function () {
  eq(SK.wageReqText(), '月88,000円以上');
  eq(SK.weekReqText(), '週20時間以上');
  ok(SK.kakudaiReqText('2026-09').indexOf('88,000') >= 0, '今は文に賃金要件が出る');
  eq(SK.kakudaiReqText('2026-10', '2026-10').indexOf('88,000'), -1, '★撤廃後は文からも消える');
  ok(SK.kakudaiReqText('2026-10', '2026-10').indexOf('週20時間以上') >= 0, '週の要件は残る');
  var on = SK.judge({ weeklyH: 25, fullTimeWeeklyH: 40, tokuteiTekiyo: true, monthlyShoteiWage: 100000, ym: '2026-09' });
  ok(/88,000/.test(on.reasons.join()), '判定理由にも賃金要件が出る');
  var off = SK.judge({ weeklyH: 25, fullTimeWeeklyH: 40, tokuteiTekiyo: true, monthlyShoteiWage: 100000, ym: '2026-10', wageReqRemovedYm: '2026-10' });
  eq(/88,000/.test(off.reasons.join()), false, '★撤廃後は理由からも消える');
});

// ── 企業規模要件(特定適用事業所)の段階引下げ。日付は法律で決まっている＝数字ではなく表で持つ ──
T('★企業規模: 51人 → 令和9年10月36人 → 令和11年10月21人 → 令和14年10月11人(境界の前後)', function () {
  eq(SK.tokuteiMinInsured('2026-08'), 51); eq(SK.tokuteiMinInsured('2027-09'), 51);
  eq(SK.tokuteiMinInsured('2027-10'), 36, '★令和9年10月ちょうど');
  eq(SK.tokuteiMinInsured('2029-09'), 36); eq(SK.tokuteiMinInsured('2029-10'), 21, '★令和11年10月ちょうど');
  eq(SK.tokuteiMinInsured('2032-09'), 21); eq(SK.tokuteiMinInsured('2032-10'), 11, '★令和14年10月ちょうど');
  eq(SK.tokuteiMinInsured(''), 51, '空は現行');
  eq(SK.tokuteiMinInsured('こわれた'), 51, '壊れた値は現行');
  eq(SK.tokuteiText('2027-10'), '常時36人以上');
});

// 出典の実数がドリフトしていないか(定数の自己防衛)
T('法定しきい値の実数(出典照合): 週20h/88,000円/3-4/51人', function () {
  eq(SK.WEEK_MIN_H, 20); eq(SK.WAGE_88K, 88000); eq(SK.RATIO_34, 0.75); eq(SK.TOKUTEI_MIN_NOW, 51);
});
