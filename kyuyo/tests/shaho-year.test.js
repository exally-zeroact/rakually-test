/* shaho-year.test.js — 健保/介護/子育て支援金の「年度自動切替」(社保年度=3月起算) */
'use strict';
var PayslipCalc = require('../lib/calc.js');
var SH = require('../lib/shakaihoken-hyo.js');
var PC = require('../lib/payroll-calc.js');

/* --- shahoYearOf: 3月起算 --- */
T('社保年度: 2026-06 → 2026(令和8年度)', function () { eq(SH.shahoYearOf('2026-06'), 2026); });
T('社保年度: 2026-03 → 2026(年度初め)', function () { eq(SH.shahoYearOf('2026-03'), 2026); });
T('社保年度: 2026-02 → 2025(前年度)', function () { eq(SH.shahoYearOf('2026-02'), 2025); });
T('社保年度: 2025-06 → 2025(令和7年度)', function () { eq(SH.shahoYearOf('2025-06'), 2025); });

/* --- getKenko: 年度で健保料率が変わる --- */
T('健保 東京 令和8(2026-06)=9.85%・折半=4.925%', function () {
  var k = SH.getKenko('tokyo', '2026-06');
  ok(Math.abs(k.total - 0.0985) < 1e-9, 'total ' + k.total);
  ok(Math.abs(k.jugyoin - k.total / 2) < 1e-9, '折半でない');
  eq(k.stale, false);
});
T('健保 東京 令和7(2025-06)=既存KENKO_RITSU(9.91%)', function () {
  var k = SH.getKenko('tokyo', '2025-06');
  ok(Math.abs(k.total - SH.KENKO_RITSU.tokyo.total) < 1e-9, 'total ' + k.total);
});
/* 令和7年度=協会けんぽ公式(rate_prefectures/r07・2026-07照合)。値をロックし再発防止 */
T('健保 令和7 公式値ロック(協会けんぽ2025年度)', function () {
  var exp = { hokkaido:0.1031, iwate:0.0962, miyagi:0.1011, yamagata:0.0975, fukushima:0.0962, ibaraki:0.0967, tochigi:0.0982, saitama:0.0976, chiba:0.0979, tokyo:0.0991, kanagawa:0.0992, niigata:0.0955, toyama:0.0965, fukui:0.0994, nagano:0.0969, gifu:0.0993, aichi:0.1003, osaka:0.1024, hyogo:0.1016, hiroshima:0.0997, yamaguchi:0.1036, tokushima:0.1047, kochi:0.1013, fukuoka:0.1031, saga:0.1078, nagasaki:0.1041, kagoshima:0.1031, okinawa:0.0944 };
  Object.keys(exp).forEach(function (p) {
    var k = SH.getKenko(p, '2025-06');
    ok(Math.abs(k.total - exp[p]) < 1e-9, p + ' 令和7=' + k.total + ' 期待' + exp[p]);
    ok(Math.abs(k.jugyoin - k.total / 2) < 1e-9, p + ' 折半でない');
  });
});
T('健保 令和7: 47都道府県すべて存在', function () { eq(Object.keys(SH.KENKO_RITSU).length, 47); });
/* 令和8年度=協会けんぽ公式PDF(R8_*.pdf)機械抽出済。実数リテラルでロック(自己参照でなく) */
T('健保 令和8 公式値ロック(協会けんぽ2026年度・KENKO_2026)', function () {
  eq(Object.keys(SH.KENKO_2026).length, 47);
  var exp = { hokkaido:0.1028, aomori:0.0985, iwate:0.0951, tokyo:0.0985, kanagawa:0.0992, niigata:0.0921, aichi:0.0993, osaka:0.1013, hyogo:0.1012, hiroshima:0.0978, yamaguchi:0.1015, fukuoka:0.1011, saga:0.1055, okinawa:0.0944 };
  Object.keys(exp).forEach(function (p) { ok(Math.abs(SH.KENKO_2026[p] - exp[p]) < 1e-9, p + ' 令和8=' + SH.KENKO_2026[p] + ' 期待' + exp[p]); });
});
T('健保 令和8で東京と新潟で料率が異なる(新潟9.21%)', function () {
  eq(SH.getKenko('niigata', '2026-06').total, 0.0921);
  ok(SH.getKenko('tokyo', '2026-06').total !== SH.getKenko('niigata', '2026-06').total);
});
T('健保 令和8: 47都道府県すべて存在', function () {
  eq(Object.keys(SH.KENKO_2026).length, 47);
  Object.keys(SH.KENKO_RITSU).forEach(function (k) { ok(SH.KENKO_2026[k] != null, k + ' が令和8に無い'); });
});

/* --- getKaigo: 介護料率の年度切替 --- */
T('介護 令和7(2025-06)=0.795% / 令和8(2026-06)=0.81%', function () {
  eq(SH.getKaigo('2025-06').jugyoin, 0.00795);
  eq(SH.getKaigo('2026-06').jugyoin, 0.0081);
});

/* --- getShienkin: 子育て支援金(令和8/4分〜・折半) --- */
T('支援金: 2026-04以降は0.115%、3月以前/令和7は0', function () {
  eq(SH.getShienkin('2026-04'), 0.0023 / 2);
  eq(SH.getShienkin('2026-06'), 0.00115);
  eq(SH.getShienkin('2026-03'), 0);
  eq(SH.getShienkin('2025-06'), 0);
});

/* --- computePayslip 通し: 同じ人で対象月だけ変えると健保/介護が変わる --- */
function buildEmp(payYm) {
  var rate = SH.getKenko('tokyo', payYm).jugyoin + SH.getShienkin(payYm); // = app.js prefRate と同じ
  return {
    shikyu: [{ label: '基本給', value: 300000 }],
    birthYmd: '1980-05-15', payYm: payYm, fuyou: 1, taxClass: '甲',
    residentTax: 0, healthRate: rate, employRate: 0.0055,
    hyojunBase: 300000, apply: {}, extraKojo: [],
  };
}
T('通し: 健保は令和8(支援金込)>令和7、介護も令和8>令和7', function () {
  var r25 = PayslipCalc.computePayslip(buildEmp('2025-06'));
  var r26 = PayslipCalc.computePayslip(buildEmp('2026-06'));
  var h25 = r25.kojo.filter(function (x) { return x.label === '健康保険'; })[0].value;
  var h26 = r26.kojo.filter(function (x) { return x.label === '健康保険'; })[0].value;
  var k25 = r25.kojo.filter(function (x) { return x.label === '介護保険'; })[0].value;
  var k26 = r26.kojo.filter(function (x) { return x.label === '介護保険'; })[0].value;
  ok(h26 > h25, '健保 令和8(' + h26 + ') が令和7(' + h25 + ')以下');
  ok(k26 > k25, '介護 令和8(' + k26 + ') が令和7(' + k25 + ')以下');
});
T('通し: 令和8の介護額 = han50(標準報酬(健保) × 0.81%)', function () {
  var hy = SH.getHyojunHealth(300000);
  var expect = SH.han50(hy * 0.0081);
  var r26 = PayslipCalc.computePayslip(buildEmp('2026-06'));
  var k26 = r26.kojo.filter(function (x) { return x.label === '介護保険'; })[0].value;
  eq(k26, expect);
});
T('通し: 令和8の健保額 = han50(標準報酬(健保) × (9.85%/2 + 0.115%))', function () {
  var hy = SH.getHyojunHealth(300000);
  var expect = SH.han50(hy * (0.0985 / 2 + 0.00115));
  var r26 = PayslipCalc.computePayslip(buildEmp('2026-06'));
  var h26 = r26.kojo.filter(function (x) { return x.label === '健康保険'; })[0].value;
  eq(h26, expect);
});

/* --- lib側でも健保率を年度自己選択(介護と対称・silent-wrong防止) ---
   これまで健保率はapp.jsのprefRateで年度選択してhealthRateスカラーを渡す前提=渡し忘れると黙って既定率。
   介護(getKaigo(payYm))と同様、pref+payYmを渡せばlib単体で年度自動選択できることを保証する。
   ★明示healthRateがあればそれが勝つ(=app.js現行パス不変=回帰ゼロ)★ */
T('健保 lib自己選択: pref+payYmだけで年度正しい率を導出(明示healthRate省略)', function () {
  var base = { payTotal: 300000, hyojunBase: 300000, employRate: 0.0055, hasKaigo: false };
  // 導出 = app.js prefRate('tokyo', ym) と同一(getKenko.jugyoin + getShienkin)
  var expR7 = SH.getKenko('tokyo', '2025-06').jugyoin + SH.getShienkin('2025-06');
  var expR8 = SH.getKenko('tokyo', '2026-06').jugyoin + SH.getShienkin('2026-06');
  var hyHealth = SH.getHyojunHealth(300000);
  var r7 = PC.calcSocialInsurance(Object.assign({}, base, { pref: 'tokyo', payYm: '2025-06' }));
  var r8 = PC.calcSocialInsurance(Object.assign({}, base, { pref: 'tokyo', payYm: '2026-06' }));
  eq(r7.health, SH.han50(hyHealth * expR7));
  eq(r8.health, SH.han50(hyHealth * expR8));
  ok(r8.health !== r7.health, '令和8健保が令和7と同額(年度選択が効いてない)');
});
T('健保 lib自己選択: 明示healthRateが最優先(pref/payYmを無視=回帰ゼロ)', function () {
  var hyHealth = SH.getHyojunHealth(300000);
  var r = PC.calcSocialInsurance({ payTotal: 300000, hyojunBase: 300000, employRate: 0.0055, hasKaigo: false,
    pref: 'tokyo', payYm: '2026-06', healthRate: 0.05 }); // 明示値=導出と別
  eq(r.health, SH.han50(hyHealth * 0.05));
});
/* ★2026-09-03 に 決め直した★（指示役の裁定・前は「既定0.04955のまま＝回帰ゼロ」だった）
   理由＝★同じ「県が 無い」状態で 3つの 違う 額が 出ていた★（実測）:
     getKenko の 代用 0.0504（260,000で 13,104円）／ここの 既定 0.04955（12,883円）／ops は 1人目の県。
   ★どれも 画面にも 紙にも 出ない＝静かに ずれる★ので、★代用の 値は 表 1か所★に 揃えた。
   ⇒ ここは もう「0.04955 のまま」では なく ★表の 代用率（daiyoJugyoinRate）と 同じ★である事を 見る。
   ★県が 入っている人の 額は 1円も 動かしていない★（pref を 渡す 上の 試験が それを 見ている）。 */
T('健保 lib自己選択: pref未指定+healthRate未指定は★表の代用率★と同じ(黙って別の既定を持たない)', function () {
  var hyHealth = SH.getHyojunHealth(300000);
  var r = PC.calcSocialInsurance({ payTotal: 300000, hyojunBase: 300000, employRate: 0.0055, hasKaigo: false, payYm: '2026-06' });
  eq(r.health, SH.han50(hyHealth * SH.daiyoJugyoinRate('2026-06')));
  ok(r.health !== SH.han50(hyHealth * 0.04955), '★古い既定 0.04955 に 戻っている★');
});
T('健保 lib自己選択: computePayslip(emp.pref)経由でも年度導出・emp.healthRate明示は勝つ', function () {
  var empBase = { shikyu: [{ label: '基本給', value: 300000 }], birthYmd: '1980-05-15', fuyou: 1,
    taxClass: '甲', residentTax: 0, employRate: 0.0055, hyojunBase: 300000, apply: {}, extraKojo: [] };
  var hyHealth = SH.getHyojunHealth(300000);
  // pref経由(healthRate省略)→令和8導出
  var rD = PayslipCalc.computePayslip(Object.assign({}, empBase, { pref: 'tokyo', payYm: '2026-06' }));
  var hD = rD.kojo.filter(function (x) { return x.label === '健康保険'; })[0].value;
  eq(hD, SH.han50(hyHealth * (SH.getKenko('tokyo', '2026-06').jugyoin + SH.getShienkin('2026-06'))));
  // emp.healthRate明示→そのまま(回帰ゼロ)
  var rE = PayslipCalc.computePayslip(Object.assign({}, empBase, { pref: 'tokyo', payYm: '2026-06', healthRate: 0.05 }));
  var hE = rE.kojo.filter(function (x) { return x.label === '健康保険'; })[0].value;
  eq(hE, SH.han50(hyHealth * 0.05));
});

/* ★2026-11-06 中央から 新しい 年度の 健保・介護が 来ても 令和8の 月を 書き換えない・新しい 年度の 月に 届く★
   前は hydrate(year>=2026) が KENKO_2026 を 上書き＝47県の 2027 を 入れると 令和8年度の 月（2026-06）の 額まで 黙って 変わり、
   2027-06 は 古い 印（stale）の まま。介護は KAIGO_NENDO[year] が 無いと 捨てていた。試験で 足した 年は finally で 消す（run.js は 1プロセス）。 */
function kenko47(v) { var o = {}; Object.keys(SH.KENKO_2026).forEach(function (p) { o[p] = v; }); return o; }
function cleanup2027() { if (SH.KENKO_NENDO) delete SH.KENKO_NENDO[2027]; delete SH.KAIGO_NENDO[2027]; }
T('★中央の hydrate(2027) は 令和8年度の 月（2026-06・2027-02）の 健保を 書き換えない', function () {
  var before = SH.getKenko('tokyo', '2026-06').total, b2 = SH.getKenko('osaka', '2027-02').total;
  try {
    SH.hydrate(2027, { kenko_total: kenko47(0.111) });
    eq(SH.getKenko('tokyo', '2026-06').total, before, '2026-06 東京');
    eq(SH.getKenko('osaka', '2027-02').total, b2, '2027-02 大阪（令和8年度の 終わり）');
    eq(SH.KENKO_2026.tokyo, 0.0985, '令和8の 表');
  } finally { cleanup2027(); }
});
T('★中央の hydrate(2027) の 健保は 2027-03〜 に 届き、古い 印が 消える', function () {
  eq(SH.getKenko('tokyo', '2027-06').stale, true, '前提：2027 は 未収録');
  try {
    SH.hydrate(2027, { kenko_total: kenko47(0.111) });
    var k = SH.getKenko('tokyo', '2027-06');
    eq(k.total, 0.111); eq(k.stale, false);
    eq(SH.getKenko('tokyo', '2027-03').total, 0.111, '年度初め');
    eq(SH.getKenko('tokyo', '2028-06').stale, true, '2028 は 未収録のまま');
    eq(SH.getKenko('tokyo', '2028-06').total, 0.111, '未収録の 年は 直近の 収録年（2027）');
  } finally { cleanup2027(); }
  eq(SH.getKenko('tokyo', '2027-06').total, 0.0985, '消した後は 令和8の 表に 戻る');
});
T('★中央の hydrate(2027) の 介護は 捨てずに 2027-03〜 に 届く（令和8は 変えない）', function () {
  try {
    SH.hydrate(2027, { kaigo_total: 0.017 });
    var g = SH.getKaigo('2027-06');
    eq(g.total, 0.017); eq(g.jugyoin, 0.0085); eq(g.stale, false);
    eq(SH.getKaigo('2026-06').total, 0.0162, '令和8');
    eq(SH.getKaigo('2028-06').total, 0.017, '未収録の 年は 直近の 収録年');
    eq(SH.getKaigo('2028-06').stale, true);
  } finally { cleanup2027(); }
});
T('★古い 年の hydrate(2024) は 令和7の 表を 書き換えない', function () {
  var before = SH.KENKO_RITSU.tokyo.total;
  var keep = {}; Object.keys(SH.KENKO_RITSU).forEach(function (p) { keep[p] = SH.KENKO_RITSU[p].total; });
  try {
    SH.hydrate(2024, { kenko_total: kenko47(0.2) });
    eq(SH.KENKO_RITSU.tokyo.total, before);
  } finally { Object.keys(keep).forEach(function (p) { SH.KENKO_RITSU[p].total = keep[p]; }); if (SH.KENKO_NENDO) delete SH.KENKO_NENDO[2024]; }
});
T('★収録より 古い 年（2025-02・2024-06）の 介護は 前と 同じ 0.0162（一番 古い 年 0.0159 に 黙って 変えない）', function () {
  eq(SH.getKaigo('2025-02').total, 0.0162, '2025-02');
  eq(SH.getKaigo('2025-02').stale, true);
  eq(SH.getKaigo('2024-06').total, 0.0162, '2024-06');
  eq(SH.getKaigo('2025-03').total, 0.0159, '2025-03＝令和7');
});
T('★中央に 2027 の 介護が 入っても 収録より 古い 年（2025-02・2024-06）の 介護は 0.0162 のまま（rebase 後 taiketsu 止1）', function () {
  try {
    SH.hydrate(2027, { kaigo_total: 0.017 });
    eq(SH.getKaigo('2025-02').total, 0.0162, '2025-02');
    eq(SH.getKaigo('2024-06').total, 0.0162, '2024-06');
    eq(SH.getKaigo('2024-06').stale, true);
    eq(SH.getKaigo('2027-06').total, 0.017, '2027 には 届く');
  } finally { cleanup2027(); }
});
T('★中央の 2027 の 健保が 47県 そろわない（大阪 抜け）なら 受け取らない＝大阪の 人を 黙って 東京の 率に しない（rebase 後 taiketsu 止2）', function () {
  try {
    var kt = kenko47(0.111); delete kt.osaka;
    SH.hydrate(2027, { kenko_total: kt });
    var k = SH.getKenko('osaka', '2027-06');
    eq(k.daiyo, undefined, '代用に しない');
    eq(k.total, SH.KENKO_2026.osaka, '令和8の 大阪の 率');
    eq(k.stale, true, '黄警告の 印');
    eq(SH.getKenko('tokyo', '2027-06').stale, true, '欠けた 表は 丸ごと 入れない');
  } finally { cleanup2027(); }
});
T('★中央の 健保の 壊れた 値（% のまま 9.85・字・true）は 入れない（叩き直し 任意1＝介護と 同じ 守り）', function () {
  var keep = {}; Object.keys(SH.KENKO_2026).forEach(function (p) { keep[p] = SH.KENKO_2026[p]; });
  var keep25 = SH.KENKO_RITSU.osaka.total, keepR = {}; Object.keys(SH.KENKO_RITSU).forEach(function (p) { keepR[p] = SH.KENKO_RITSU[p].total; });
  try {
    SH.hydrate(2027, { kenko_total: kenko47(9.85) });
    eq(SH.getKenko('tokyo', '2027-06').stale, true, '% のままの 2027 は 丸ごと 入れない');
    var kt = kenko47(0.111); kt.osaka = '0.111';
    SH.hydrate(2027, { kenko_total: kt });
    eq(SH.KENKO_NENDO[2027], undefined, '字が 混ざった 2027 は 丸ごと 入れない');
    var kx = kenko47(0.111); kx.zenkoku = 9.85;
    SH.hydrate(2027, { kenko_total: kx });
    eq(SH.KENKO_NENDO[2027], undefined, '余分な キーが % のままの 2027 も 丸ごと 入れない（最後の 叩き 任意2）');
    var kz = kenko47(0.111); kz.tokyo = 0;
    SH.hydrate(2027, { kenko_total: kz });
    eq(SH.KENKO_NENDO[2027], undefined, '0 が 混ざった 2027 も 丸ごと 入れない（下限）');
    var km = {}; Object.keys(keep).forEach(function (p) { km[p] = keep[p]; }); km.tokyo = -0.01;
    SH.hydrate(2026, { kenko_total: km });
    eq(SH.KENKO_2026.tokyo, keep.tokyo, '2026 の 負の 県は lib の 値を 残す（下限）');
    var k6 = {}; Object.keys(keep).forEach(function (p) { k6[p] = keep[p]; }); k6.tokyo = 9.85; k6.osaka = true;
    SH.hydrate(2026, { kenko_total: k6 });
    eq(SH.KENKO_2026.tokyo, keep.tokyo, '2026 の % のままの 県は lib の 値を 残す');
    eq(SH.KENKO_2026.osaka, keep.osaka, '2026 の true の 県は lib の 値を 残す');
    var k5 = kenko47(0.1); k5.osaka = 10.13;
    SH.hydrate(2025, { kenko_total: k5 });
    eq(SH.KENKO_RITSU.osaka.total, keep25, '2025 の % のままの 県は lib の 値を 残す');
  } finally {
    cleanup2027(); Object.keys(keep).forEach(function (p) { SH.KENKO_2026[p] = keep[p]; });
    Object.keys(keepR).forEach(function (p) { SH.KENKO_RITSU[p].total = keepR[p]; });
  }
});
T('★中央の 介護の 壊れた 値（% のまま 1.62・true・0・字）は 入れない', function () {
  try {
    [1.62, true, 0, 'abc', null].forEach(function (v) { SH.hydrate(2027, { kaigo_total: v }); eq(SH.KAIGO_NENDO[2027], undefined, '値 ' + v); });
  } finally { cleanup2027(); }
});
T('★中央の 年が 字（"2026"）でも 令和8の 健保に 届く（叩き直し 任2）', function () {
  var keep = SH.KENKO_2026.tokyo;
  try {
    var kt = {}; Object.keys(SH.KENKO_2026).forEach(function (p) { kt[p] = SH.KENKO_2026[p]; }); kt.tokyo = 0.0999;
    SH.hydrate('2026', { kenko_total: kt });
    eq(SH.getKenko('tokyo', '2026-06').total, 0.0999);
  } finally { SH.KENKO_2026.tokyo = keep; }
});
T('★中央の 古い 年（2024）の 介護は 入れない＝2025-02 以前の 介護を 変えない（叩き直し 任3）', function () {
  try {
    SH.hydrate(2024, { kaigo_total: 0.016 });
    eq(SH.KAIGO_NENDO[2024], undefined);
    eq(SH.getKaigo('2025-02').total, 0.0162);
  } finally { delete SH.KAIGO_NENDO[2024]; }
});
