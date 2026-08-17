/* pref.test.js — 都道府県別 健康保険料率が正しく適用されるか（協会けんぽ折半・府県別） */
'use strict';
var PayslipCalc = require('../lib/calc.js');
var SH = require('../lib/shakaihoken-hyo.js');

/* データ整合 */
T('KENKO_RITSU: 47都道府県すべて存在', function () {
  eq(Object.keys(SH.KENKO_RITSU).length, 47);
});
T('各府県: name/total/jugyoin を持ち、従業員負担=全体÷2（折半）', function () {
  Object.keys(SH.KENKO_RITSU).forEach(function (k) {
    var p = SH.KENKO_RITSU[k];
    ok(p.name && typeof p.total === 'number' && typeof p.jugyoin === 'number', k + ' フィールド欠落');
    ok(Math.abs(p.jugyoin - p.total / 2) < 1e-6, k + ' 折半でない (' + p.jugyoin + ' vs ' + p.total / 2 + ')');
    ok(p.total > 0.09 && p.total < 0.11, k + ' 全体料率が異常: ' + p.total);
  });
});

/* app.js prefRate と同じ参照（bare）で府県別に取れる */
T('府県別に料率が異なる: 大阪 > 東京（同一標準報酬で健保が変わる）', function () {
  ok(SH.KENKO_RITSU.osaka.jugyoin > SH.KENKO_RITSU.tokyo.jugyoin, '大阪>東京');
});

/* 計算適用：標準報酬を固定し、府県の料率で健保が変わることを実額で確認 */
function healthOf(prefCode) {
  var r = PayslipCalc.computePayslip({
    shikyu: [{ label: '基本給', value: 300000 }], birthYmd: '1990-01-01', payYm: '2026-06',
    fuyou: 0, healthRate: SH.KENKO_RITSU[prefCode].jugyoin, hyojunBase: 300000
  });
  return r.si.health;
}
T('東京: 標準報酬300,000 × 0.04955 = 14,865', function () {
  eq(SH.KENKO_RITSU.tokyo.jugyoin, 0.04955);
  eq(healthOf('tokyo'), SH.han50(300000 * SH.KENKO_RITSU.tokyo.jugyoin));
  eq(healthOf('tokyo'), 14865);
});
T('大阪: 標準報酬300,000 × 大阪料率 = 表どおり・東京と異なる', function () {
  eq(healthOf('osaka'), SH.han50(300000 * SH.KENKO_RITSU.osaka.jugyoin));
  ok(healthOf('osaka') > healthOf('tokyo'), '大阪の健保 > 東京');
});
T('全47府県: 健保=han50(標準報酬×その府県のjugyoin) と一致', function () {
  Object.keys(SH.KENKO_RITSU).forEach(function (k) {
    eq(healthOf(k), SH.han50(300000 * SH.KENKO_RITSU[k].jugyoin), k + ' で計算不一致');
  });
});

/* 標準報酬月額 上限/下限の公式値ロック(厚年32等級=88,000〜650,000 / 健保50等級=〜1,390,000) */
T('標準報酬 上限/下限(厚年650,000・健保1,390,000・最低88,000)', function () {
  eq(SH.getHyojunPension(700000), 650000); // 厚年 上限32等級
  eq(SH.getHyojunPension(650000), 650000);
  eq(SH.getHyojunPension(50000), 88000);   // 厚年 下限1等級
  eq(SH.getHyojunHealth(1500000), 1390000); // 健保 上限50等級
  eq(SH.getHyojunHealth(1400000), 1390000);
});

/* 不正コードはフォールバックで落ちない（東京等の既定） */
T('未知の府県コードでも例外なく数値（フォールバック）', function () {
  var r = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 300000 }], birthYmd: '1990-01-01', payYm: '2026-06', fuyou: 0, hyojunBase: 300000 });
  eq(typeof r.si.health, 'number'); ok(r.si.health > 0);
});

/* ══ ★都道府県の未選択（黙って東京で計算されるのを止める）★ ═══════════════════
 * 【2026-08-09 実測】県が空だと:
 *   ・健保 … getKenko('') は★東京にフォールバック★（名前も「東京都」）＝黙って違う率で計算される
 *   ・最賃 … getChingin('') が null → minWageInfo が null ＝★最賃割れの判定が動かない★
 * だから「未選択」という状態を持ち、黄色で知らせて確定を止める。
 * ★既に入っている県は書き換えない★（東京のままの人は数えて出すだけ）。 */
var PW = require('../lib/payroll-warnings.js');

T('★県が空だと 健保は東京に倒れ、最賃は判定できない（止める理由の実測）', function () {
  var k = SH.getKenko('', '2026-09');
  eq(k.name, '東京都', '空なのに東京の名前が出る');
  eq(k.total, SH.getKenko('tokyo', '2026-09').total, '空なのに東京の率で計算される');
  var SA = require('../lib/saitei-chingin.js');
  eq(SA.getChingin(''), null, '最賃は引けない');
  eq(SA.getChingin('ehime'), 1033, '愛媛は引ける(令和7年度)');
});

T('★prefStats: 未選択の人を数える／東京のままの人も数える（書き換えない）', function () {
  var s = PW.prefStats([{ id: 'a', name: '甲', pref: '' }, { id: 'b', name: '乙', pref: 'tokyo' },
    { id: 'c', name: '丙', pref: 'ehime' }, { id: 'd', name: '丁' }, { id: 'e', name: '戊', pref: '  ' }]);
  eq(s.missingCount, 3, '空・未設定・空白は未選択');
  eq(s.missing.map(function (x) { return x.name; }).join(','), '甲,丁,戊');
  eq(s.tokyoCount, 1, '東京のままの人数');
  eq(s.total, 5);
});
T('prefStats: 空配列・undefined でも落ちない（0件）', function () {
  eq(PW.prefStats([]).missingCount, 0); eq(PW.prefStats().missingCount, 0); eq(PW.prefStats([]).tokyoCount, 0);
});

T('★未選択が居れば黄色が出て、居なければ何も出ない', function () {
  var w = PW.prefMissingWarn([{ name: '甲', pref: '' }]);
  ok(/都道府県が未選択/.test(w), '黄色の文が出ない: ' + w);
  ok(/cr-warn/.test(w), '黄色(cr-warn)になっていない');
  ok(/選ぶまで正しい額になりません/.test(w), '理由が書かれていない');
  ok(/最低賃金の判定もできません/.test(w), '最賃が止まることを言っていない');
  ok(/従業員マスタ/.test(w), 'どこで直すか書かれていない');
  eq(PW.prefMissingWarn([{ name: '乙', pref: 'ehime' }]), '', '全員選んでいれば出さない');
  eq(PW.prefMissingWarn([]), '', '0人なら出さない');
});
T('未選択が3人以上なら「ほか○名」に縮める（1行に収める）', function () {
  var w = PW.prefMissingWarn([{ name: '甲', pref: '' }, { name: '乙', pref: '' }, { name: '丙', pref: '' }]);
  ok(/甲ほか2名/.test(w), '縮めていない: ' + w);
});
T('★東京のままの人数は「知らせるだけ」（黄色にしない・書き換えない）', function () {
  var n = PW.prefTokyoNote([{ name: '甲', pref: 'tokyo' }, { name: '乙', pref: 'tokyo' }, { name: '丙', pref: 'ehime' }]);
  ok(/2名/.test(n), '人数が出ていない: ' + n);
  eq(/cr-warn/.test(n), false, '★黄色にしてはいけない（勝手に直させない・知らせるだけ）');
  eq(PW.prefTokyoNote([{ name: '丙', pref: 'ehime' }]), '', '0人なら出さない');
});
