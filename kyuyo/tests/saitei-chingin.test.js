/* saitei-chingin.test.js — 地域別最低賃金(令和7年度)の公式値ロック
 * 出典: 厚生労働省「令和7年度 地域別最低賃金 全国一覧」公式PDF(001571192.pdf)を機械抽出して照合(2026-07)
 * ★年度依存の法定数値は自己参照でなく"公式の実数値"をassertしてロックする(据え置き・推定の再発防止)★ */
'use strict';
var SC = require('../lib/saitei-chingin.js');
/* ★流し込みの試験で 触る前の 姿を 控える★（この lib は みんなで 使い回す物） */
var HOZON = { todofuken: JSON.parse(JSON.stringify(SC.todofuken)), heikin: SC.ZENKOKU_HEIKIN, nendo: SC.NENDO_YEAR };

/* 47都道府県の令和7確定額(厚労省公式・改定後) */
var R7 = {
  hokkaido:1075, aomori:1029, iwate:1031, miyagi:1038, akita:1031, yamagata:1032, fukushima:1033,
  ibaraki:1074, tochigi:1068, gunma:1063, saitama:1141, chiba:1140, tokyo:1226, kanagawa:1225,
  niigata:1050, toyama:1062, ishikawa:1054, fukui:1053, yamanashi:1052, nagano:1061, gifu:1065,
  shizuoka:1097, aichi:1140, mie:1087, shiga:1080, kyoto:1122, osaka:1177, hyogo:1116,
  nara:1051, wakayama:1045, tottori:1030, shimane:1033, okayama:1047, hiroshima:1085, yamaguchi:1043,
  tokushima:1046, kagawa:1036, ehime:1033, kochi:1023, fukuoka:1057, saga:1030, nagasaki:1031,
  kumamoto:1034, oita:1035, miyazaki:1023, kagoshima:1026, okinawa:1023
};

/* ★47都道府県の令和8確定額（厚労省公式・改定後）★
   出典＝厚生労働省「令和8年度 地域別最低賃金 答申状況」(別紙) 001745621.pdf を ★機械抽出★（2026-09-12）
   ★手で打っていない★／取り出した後に 7通りの検算を 通した：
     47県ある／最高1,280(発表と一致)／最低1,085(一致)／改定額-前年=引上げ額 が47県とも一致／
     引上げ額 54〜65(発表と一致)／東京1,280・10/01(東京労働局と一致)／高知1,086・10/29(高知労働局と一致)
   ★さらに PDFの「前年額」が 当時のlibの47県と 1円も違わなかった★＝並びが正しい最終証拠
   ★令和7の表(R7)は 消さない★＝過去の値も 守り続ける（据え置き・推定の再発防止） */
var R8 = {
  hokkaido:1131, aomori:1090, iwate:1090, miyagi:1098, akita:1090, yamagata:1092, fukushima:1094,
  ibaraki:1136, tochigi:1125, gunma:1120, saitama:1196, chiba:1195, tokyo:1280, kanagawa:1279,
  niigata:1108, toyama:1119, ishikawa:1113, fukui:1112, yamanashi:1113, nagano:1117, gifu:1121,
  shizuoka:1154, aichi:1195, mie:1143, shiga:1136, kyoto:1180, osaka:1231, hyogo:1172,
  nara:1107, wakayama:1101, tottori:1090, shimane:1092, okayama:1104, hiroshima:1141, yamaguchi:1101,
  tokushima:1103, kagawa:1092, ehime:1093, kochi:1086, fukuoka:1114, saga:1095, nagasaki:1087,
  kumamoto:1092, oita:1096, miyazaki:1085, kagoshima:1090, okinawa:1086
};

T('★最賃 令和8 公式値ロック(厚労省・全47県)★', function () {
  eq(Object.keys(R8).length, 47);
  Object.keys(R8).forEach(function (p) {
    eq(SC.getChingin(p), R8[p], p + ' 最賃=' + SC.getChingin(p) + ' 期待' + R8[p]);
  });
});
T('★最賃 令和8 全国加重平均=1177(公式)★', function () { eq(SC.ZENKOKU_HEIKIN, 1177); });
T('★最賃 令和8 最高=東京1280 / 最低=宮崎1085★', function () {
  var v = Object.keys(SC.todofuken).map(function (k) { return SC.todofuken[k].chingin; });
  eq(Math.max.apply(null, v), 1280);
  eq(Math.min.apply(null, v), 1085);
});
T('★最賃 令和8 発効日は47県とも2026年・10〜12月★', function () {
  Object.keys(SC.todofuken).forEach(function (k) {
    var h = SC.todofuken[k].hatsuko;
    ok(/^2026-(1[0-2])-\d\d$/.test(h), k + ' 発効日=' + h);
  });
});
T('★最賃 令和8 前年(prev)は 令和7の公式値と 一致★', function () {
  Object.keys(R7).forEach(function (p) { eq(SC.todofuken[p].prev, R7[p], p + ' prev'); });
});

T('★古い中央を 流し込んでも 新しいlibを 潰さない★（2026-09-12 実測で 踏んだ）', function () {
  /* ★なぜ 要るか★＝中央は「唯一の正」だが、★人が 中央を 直すまでの間 lib の方が 新しい★事が 起きる。
     そのまま 流し込むと ★客の画面が 古い額に 戻る★。
     2026-09-12 実測＝lib に令和8(東京1,280)を入れた状態で 中央(令和7)を流し込むと
     ★NENDO_YEAR は 2026 のまま 額だけ 1,226 に 戻った＝一番 危ない 噛み合わせ★ */
  var now = SC.getChingin('tokyo'), nendo = SC.NENDO_YEAR;
  var furui = { todofuken: {}, zenkoku_heikin: 1121 };
  Object.keys(SC.todofuken).forEach(function (k) {
    furui.todofuken[k] = { name: SC.todofuken[k].name, chingin: 1, prev: 1, hatsuko: '令和7年10月1日' };
  });
  SC.hydrate(furui, 2025);                      // ★古い年度の 中央★
  eq(SC.getChingin('tokyo'), now, '★古い中央に 潰された★');
  eq(SC.ZENKOKU_HEIKIN, 1177, '★全国平均も 潰された★');
  eq(SC.NENDO_YEAR, nendo, '年度も 戻された');
});
T('★新しい中央が 来たら ちゃんと 入る（弾きすぎない）★', function () {
  var mae = SC.getChingin('tokyo');
  var atarashii = { todofuken: {}, zenkoku_heikin: 9999 };
  Object.keys(SC.todofuken).forEach(function (k) {
    atarashii.todofuken[k] = { name: SC.todofuken[k].name, chingin: 9999, prev: 1, hatsuko: '令和9年10月1日' };
  });
  SC.hydrate(atarashii, 2027);
  eq(SC.getChingin('tokyo'), 9999, '★新しい中央が 入らない＝直しすぎ★');
  eq(SC.NENDO_YEAR, 2027, '年度も 上がる');
  /* ★元へ戻す★＝後ろの試験を 汚さない（この lib は 1つの物を みんなで 使い回す） */
  SC.todofuken = HOZON.todofuken;
  SC.ZENKOKU_HEIKIN = HOZON.heikin;
  SC.NENDO_YEAR = HOZON.nendo;
  eq(SC.getChingin('tokyo'), 1280, '戻せていない');
  eq(SC.NENDO_YEAR, 2026, '年度を 戻せていない');
});

T('最賃: 47都道府県すべて存在', function () {
  eq(Object.keys(SC.todofuken).length, 47);
  eq(Object.keys(R7).length, 47);
});
/* ★令和7は「今の額」では なく「前年(prev)」に 移った★＝上の R8 の試験で prev を 見ている。
   ★R7 の表は 消さない★（据え置き・推定の再発防止／後から 追える） */


/* ── 年度追従(最賃は毎年10月改定=会計年度)。値は令和7のまま・未収録年度を検知して暫定警告する仕組み ── */
T('最賃 最賃年度(10月改定境界): 2025-10/2026-09→2025年度 / 2026-10→2026年度', function () {
  eq(SC.saiteiNendoOf('2025-10'), 2025);
  eq(SC.saiteiNendoOf('2026-09'), 2025);   // 令和7年度最賃は2026-09まで有効
  eq(SC.saiteiNendoOf('2026-10'), 2026);   // 令和8年度最賃(2026-10発効)
  eq(SC.saiteiNendoOf('2026-06'), 2025);
});
T('最賃 未収録年度の検知 saiteiStale(収録=令和8年度2026のみ)', function () {
  eq(SC.NENDO_YEAR, 2026);
  eq(SC.saiteiStale('2026-10'), false);    // ★令和8年度＝収録済（2026-09-12 に入れた）★
  eq(SC.saiteiStale('2027-06'), false);    // 令和8年度の範囲
  eq(SC.saiteiStale('2026-06'), true);     // ★令和7年度＝もう持っていない→暫定(要更新)★
  eq(SC.saiteiStale('2025-06'), true);     // 令和6年度=未収録
  eq(SC.saiteiStale(''), false);           // 未指定=従来互換(暫定でない)
});
T('最賃 getChingin は ym を渡しても現行(令和8)値を返す(値は捏造しない)', function () {
  eq(SC.getChingin('tokyo', '2027-10'), 1280);   /* ★未収録の先の年を渡しても 現行値★（捏造しない） */
  eq(SC.getChingin('tokyo'), 1280);
});
