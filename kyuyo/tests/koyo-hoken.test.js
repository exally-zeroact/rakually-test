/* koyo-hoken.test.js — 雇用保険 従業員負担率の単一ソース(年度+業種)＋payroll-calc自己選択＋厚年単一ソース整合 */
'use strict';
var KH = require('../lib/koyo-hoken.js');
var PC = require('../lib/payroll-calc.js');
var SH = require('../lib/shakaihoken-hyo.js');
var SZ = require('../lib/shoyo-zei.js');

/* --- 労働保険年度(4月切替)＋収録年クランプ: app.js employYear/employYearOfYm と同一 --- */
T('雇用 年度: 2026-04→2026 / 2026-03→2025(前年度) / 2025-06→2025', function () {
  eq(KH.employYearOfYm('2026-04'), 2026);
  eq(KH.employYearOfYm('2026-03'), 2025);
  eq(KH.employYearOfYm('2025-06'), 2025);
});
T('雇用 年度: 収録外はクランプ(2027-01→2026 / 2023-06→2024)', function () {
  eq(KH.employYearOfYm('2027-01'), 2026);
  eq(KH.employYearOfYm('2023-06'), 2024);
});
/* ★2026-11-06 令和6年度（2024-04〜2025-03）の率を足した★
   前は 令和6の 月（例 2025-01〜03 の 給与）を 令和7の 5.5‰ で 計算＝本当は 6‰（少なく 取っていた）。
   出典＝厚労省 LL060215保01 https://www.mhlw.go.jp/content/001211914.pdf（令和5年度と同率） */
T('雇用 料率 令和6(2024): 一般 労6・事9.5／農林 労7・事10.5／建設 労7・事11.5（‰）', function () {
  eq(KH.employYearOfYm('2024-04'), 2024);
  eq(KH.employYearOfYm('2025-03'), 2024, '2025-03＝令和6年度');
  eq(KH.employYearOfYm('2025-04'), 2025);
  eq(KH.employRateByYm('ippan', '2025-02'), 0.006);
  eq(KH.employRate('ippan', 2024), 0.006);
  eq(KH.employRate('norin', 2024), 0.007);
  eq(KH.employRate('kensetsu', 2024), 0.007);
  eq(KH.employerRate('ippan', 2024), 0.0095);
  eq(KH.employerRate('norin', 2024), 0.0105);
  eq(KH.employerRate('kensetsu', 2024), 0.0115);
  eq(Math.round(KH.fullRate('ippan', 2024) * 10000), 155, '全体 15.5‰');
  eq(KH.employStale('2024-06'), false);
  eq(KH.employStale('2025-03'), false);
});

/* ★2026-11-06 候補⑥ 年を 決め打ちで 寄せない＝RATES の キーで 選ぶ★
   前は employYearOfYm が `fy>=2026?2026:2025`＝令和9年度の 率を lib に 足しても 中央から 来ても 2027-04〜 は 令和8の 率のまま・黄警告も 無し。 */
T('雇用 年度: RATES に 2027 を 足すと 2027-04 は 2027（決め打ちで 2026 に 寄せない）', function () {
  KH.RATES[2027] = { ippan: 0.0041, kensetsu: 0.0051, norin: 0.0051 };
  try {
    eq(KH.employYearOfYm('2027-04'), 2027);
    eq(KH.employYearOfYm('2027-03'), 2026);
    eq(KH.employRateByYm('ippan', '2027-04'), 0.0041);
    eq(KH.employRate('ippan', 2099), 0.0041, '未知年度＝キーの 最新');
    eq(KH.employStale('2027-04'), false);
  } finally { delete KH.RATES[2027]; }
});
T('雇用 年度: 中央の hydrate(2027) でも 2027-04 に 届く', function () {
  KH.hydrate(2027, { ippan: 0.0042, kensetsu: 0.0052, norin: 0.0052 });
  try {
    eq(KH.employRateByYm('ippan', '2027-04'), 0.0042);
    eq(KH.employRateByYm('ippan', '2026-04'), 0.005, '令和8の 月は 変わらない');
  } finally { delete KH.RATES[2027]; }
});
T('雇用 employStale: 収録の 外（2027-04・2024-03）＝true／内（2026-04・2026-03）＝false', function () {
  eq(KH.employStale('2027-04'), true);
  eq(KH.employStale('2024-03'), true, '2024-03＝令和5年度＝未収録');
  eq(KH.employStale('2026-04'), false);
  eq(KH.employStale('2026-03'), false);
  eq(KH.employStale('2027-03'), false, '2027-03＝令和8年度');
});

/* --- 料率(厚労省照合済・実数リテラル) --- */
T('雇用 料率 令和7(2025): 一般0.55%/建設・農林0.65%', function () {
  eq(KH.employRate('ippan', 2025), 0.0055);
  eq(KH.employRate('kensetsu', 2025), 0.0065);
  eq(KH.employRate('norin', 2025), 0.0065);
});
T('雇用 料率 令和8(2026): 一般0.50%/建設・農林0.60%(引下げ)', function () {
  eq(KH.employRate('ippan', 2026), 0.005);
  eq(KH.employRate('kensetsu', 2026), 0.006);
  eq(KH.employRate('norin', 2026), 0.006);
});
T('雇用 料率: 未知業種→一般 / 未知年度→最新(2026)', function () {
  eq(KH.employRate('xxx', 2026), 0.005);
  eq(KH.employRate('ippan', 2099), 0.005);
});
T('雇用 employRateByYm: 対象月から労働保険年度で自動選択', function () {
  eq(KH.employRateByYm('ippan', '2026-06'), 0.005);
  eq(KH.employRateByYm('ippan', '2026-03'), 0.0055); // 労働保険年度=令和7
  eq(KH.employRateByYm('kensetsu', '2026-06'), 0.006);
});

/* --- (か) payroll-calc が雇用率を lib単体で年度自己選択(gyoshu+payYm)。明示employRate最優先=回帰ゼロ --- */
T('雇用 自己選択: gyoshu+payYmだけで年度率を導出(employRate省略)', function () {
  var base = { payTotal: 300000, hyojunBase: 300000, hasKaigo: false };
  var r8 = PC.calcSocialInsurance(Object.assign({}, base, { gyoshu: 'ippan', payYm: '2026-06' }));
  eq(r8.employ, SH.han50(300000 * 0.005));       // 令和8一般
  var r7 = PC.calcSocialInsurance(Object.assign({}, base, { gyoshu: 'ippan', payYm: '2026-03' }));
  eq(r7.employ, SH.han50(300000 * 0.0055));      // 労働保険年度=令和7
  var rk = PC.calcSocialInsurance(Object.assign({}, base, { gyoshu: 'kensetsu', payYm: '2026-06' }));
  eq(rk.employ, SH.han50(300000 * 0.006));       // 建設
});
T('雇用 自己選択: 明示employRateが最優先(gyoshu/payYm無視=回帰ゼロ)', function () {
  var r = PC.calcSocialInsurance({ payTotal: 300000, hyojunBase: 300000, hasKaigo: false, gyoshu: 'ippan', payYm: '2026-06', employRate: 0.0065 });
  eq(r.employ, SH.han50(300000 * 0.0065));
});
T('雇用 自己選択: gyoshu無し+employRate無しは既定0.0055のまま(空呼び出し回帰ゼロ)', function () {
  var r = PC.calcSocialInsurance({ payTotal: 300000, hyojunBase: 300000, hasKaigo: false, payYm: '2026-06' });
  eq(r.employ, SH.han50(300000 * 0.0055));
});

/* --- (き) 厚生年金率(18.3%/従業員9.15%)の単一ソース: payroll-calc・shoyo-zei が shakaihoken-hyo と一致 --- */
T('厚年 単一ソース: payroll-calcの厚年額 = han50(厚年標準報酬 × shakaihoken-hyo従業員率)', function () {
  var r = PC.calcSocialInsurance({ payTotal: 300000, hyojunBase: 300000, hasKaigo: false, employRate: 0.005 });
  var hyP = SH.getHyojunPension ? SH.getHyojunPension(300000) : SH.getHyojunHoshu(300000);
  eq(r.pension, SH.han50(hyP * SH.KOSEI_NENKIN_RITSU_JUGYOIN));
});
T('厚年 単一ソース: shoyo-zeiの厚年従業員率 = shakaihoken-hyoの従業員率(0.0915)', function () {
  eq(SZ.KOSEI_RITSU_JUGYOIN, SH.KOSEI_NENKIN_RITSU_JUGYOIN);
  eq(SH.KOSEI_NENKIN_RITSU_JUGYOIN, 0.0915);
});
