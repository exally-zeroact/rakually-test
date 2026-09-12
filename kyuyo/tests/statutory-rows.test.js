/* statutory-rows.test.js — 中央statutory投入行の生成(lib/statutory-rows.js)をロック。
 *   seedとadmin.htmlが同一行を出す単一ソース。行の網羅(kind,year)と差分検出の正しさを守る。 */
'use strict';
var SR = require('../lib/statutory-rows.js');
var SHH = require('../lib/shakaihoken-hyo.js');
var SAI = require('../lib/saitei-chingin.js');
var KOYO = require('../lib/koyo-hoken.js');
var D = require('../lib/shotokuzei-densan.js');
var H = require('../lib/shotokuzei-hei.js');
var NI = require('../lib/shotokuzei-nichi.js');
var SZ = require('../lib/shoyo-zei.js');
var N = require('../lib/nenmatsu.js');
var WM = require('../lib/warimashi.js');
var SHZ = require('../lib/shouhizei-ritsu.js');
var RR = require('../lib/rousai-ritsu.js');   /* ★労災も 渡す＝渡さないと 労災の行が 作られず ALLOWED_KINDS の穴が 緑のままに なる（2026-09-11）★ */

var rows = SR.buildStatutoryRows({ SHH: SHH, SAI: SAI, KOYO: KOYO, D: D, H: H, NI: NI, SZ: SZ, N: N, WM: WM, SHZ: SHZ, RR: RR });

T('buildStatutoryRows: 14行・想定の(kind,year)を網羅', function () {
  eq(rows.length, 14, '行数');
  var keys = rows.map(function (r) { return r.kind + ':' + r.year; }).sort().join(',');
  var want = ['saitei_chingin:2026', 'shakaihoken:2025', 'shakaihoken:2026', 'koyo:2025', 'koyo:2026',
    'shotokuzei_densan:2025', 'shotokuzei_densan:2026', 'shotokuzei_hei:2026', 'shotokuzei_nichi:2026',
    'shoyo:2026', 'nenmatsu:2026', 'warimashi:2023', 'shouhizei:2019', 'rousai_ritsu:2024'].sort().join(',');
  eq(keys, want, 'kind:year 集合');
});

T('★名簿(ALLOWED_KINDS)と 作る行は 両方向で 一致★（名簿に足せば直ると思い込ませない）', function () {
  /* ★2026-09-11＝今まで「作った行の kind が 名簿に在るか」の片方向しか 見ていなかった。
     ⇒ ★在りもしない kind を 名簿に 足しても 緑★だった＝「名簿に足せば直る」と 思い込ませる。 */
  var made = rows.map(function (r) { return r.kind; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort().join(',');
  var list = SR.ALLOWED_KINDS.slice().sort().join(',');
  eq(made, list, '作る行の kind 集合 == 名簿');
});

T('各行: data非空・source_url有り・kindは許可集合内', function () {
  rows.forEach(function (r) {
    ok(r.data && typeof r.data === 'object' && Object.keys(r.data).length > 0, r.kind + ' data非空');
    ok(typeof r.source_url === 'string' && /^https:\/\//.test(r.source_url), r.kind + ' source_url');
    ok(SR.ALLOWED_KINDS.indexOf(r.kind) >= 0, r.kind + ' 許可kind');
  });
});

T('社保: 2026は令和8健保表(KENKO_2026)・支援金あり / 2025は総額表・支援金0', function () {
  var r26 = rows.filter(function (r) { return r.kind === 'shakaihoken' && r.year === 2026; })[0];
  var r25 = rows.filter(function (r) { return r.kind === 'shakaihoken' && r.year === 2025; })[0];
  eq(SR.stableStr(r26.data.kenko_total), SR.stableStr(SHH.KENKO_2026), '2026健保=KENKO_2026');
  ok(r26.data.shienkin_total > 0, '2026支援金>0');
  eq(r25.data.shienkin_total, 0, '2025支援金0');
  eq(r26.data.kosei_total, SHH.KOSEI_NENKIN_RITSU_TOTAL, '厚年total');
});

T('最賃: todofuken/全国平均/年度をlibから写す', function () {
  var r = rows.filter(function (x) { return x.kind === 'saitei_chingin'; })[0];
  // ★中央は発効日を和暦で持ち、lib は判定に使うのでISOで持つ。形の違いは saiteiForCentral が吸収する。
  //   値そのものは中央が唯一の正（scripts/pull-statutory.mjs が lib へ機械で書き戻す）。
  eq(SR.stableStr(r.data.todofuken), SR.stableStr(SR.saiteiForCentral(SAI)), '47県(名前と額)');
  eq(Object.keys(r.data.todofuken).length, 47, '47県そろっている');
  eq(r.data.todofuken.tokyo.hatsuko, '令和8年10月1日', '★発効日は中央の書き方(和暦)で送る');
  eq(r.data.todofuken.tokyo.prev, 1226, '前年額も送る');
  eq(r.data.zenkoku_heikin, SAI.ZENKOKU_HEIKIN, '全国平均');
  /* ★2026-09-12＝ここが 嘘を 守っていた（経営者1が 見つけた）★
     `eq(r.data.nendo, SAI.NENDO)` は ★中央の字と libの字を 比べるだけ★＝
     ★両方 同じ古い字なら 緑★。実際 令和8の額を 入れても
     「令和7年度（2025年度）」のまま 通り、★客に 嘘が 出た★。
     ⇒ ★数字(NENDO_YEAR)から 作った字と 突き合わせる★＝手書きと 数字の ずれが 赤に なる。 */
  eq(r.data.nendo, SAI.NENDO, '年度（中央とlibで同じ）');
  /* ★年度の欄は 年度だけ＝完全一致で 見られる★（2026-09-12 経営者1の指摘で 欄を 分けた）
     前は '…年度）・発効日は予定' と 1つの欄に 2つ 入れていて ★前方一致でしか 見られず 緩んだ★ */
  eq(r.data.nendo, '令和' + (SAI.NENDO_YEAR - 2018) + '年度（' + SAI.NENDO_YEAR + '年度）',
     '★年度の字が 数字(NENDO_YEAR)と 合っている（字だけ 古いまま を 弾く）★');
  eq(r.data.hatsuko_chui, SAI.HATSUKO_CHUI || '', '★発効日の注意は 別の欄で 送る★');
});

T('diffRows: 未収録=new / 一致=same / 相違=changed を判定', function () {
  var desired = SR.buildStatutoryRows({ SHH: SHH, SAI: SAI, KOYO: KOYO, D: D, H: H, NI: NI, SZ: SZ, N: N, WM: WM, SHZ: SHZ, RR: RR });
  // 中央が空 → 全行 new
  var allNew = SR.diffRows(desired, []);
  ok(allNew.every(function (d) { return d.status === 'new'; }), '空中央=全new');
  // 中央が desired と同一 → 全行 same
  var central = desired.map(function (d) { return { kind: d.kind, year: d.year, data: d.data }; });
  var allSame = SR.diffRows(desired, central);
  ok(allSame.every(function (d) { return d.status === 'same'; }), '同一=全same');
  // 1行だけ値を変える → その行 changed
  var central2 = central.map(function (r) { return { kind: r.kind, year: r.year, data: JSON.parse(JSON.stringify(r.data)) }; });
  var t = central2.filter(function (r) { return r.kind === 'shouhizei'; })[0];
  t.data.hyojun = 0.12;
  var d2 = SR.diffRows(desired, central2);
  eq(d2.filter(function (x) { return x.kind === 'shouhizei'; })[0].status, 'changed', '値相違=changed');
  eq(d2.filter(function (x) { return x.status === 'changed'; }).length, 1, 'changedは1件だけ');
});

T('stableStr: キー順に依らず一致(比較の安定性)', function () {
  eq(SR.stableStr({ a: 1, b: 2 }), SR.stableStr({ b: 2, a: 1 }), 'キー順不問');
  ok(SR.stableStr({ a: 1 }) !== SR.stableStr({ a: 2 }), '値相違は不一致');
});
