/* zei-nen-erabi.test.js — 日額表（甲乙）と 丙欄の「年の 選び方」と「中央からの 引き込み」（2026-11-02）
 * ★穴★ 前は tableFor が「収録の 最新」を 返した＝中央に 来年（2027）の 行が 入った 瞬間、
 *   ★今年（2026）の 日払い・丙が 来年の 表で 計算された★（2026 の 2,852点が 変わった・taiketsu 実測）。
 *   また 引き込みは 24,000円以上の 段を ★R8 の 段で 埋めた★／丙は 丸ごと 置き換えで lib の 段を 消した。
 * ここでは モジュールを 取り直して 引き込み、他の 試験に 汚れを 残さない（最後に 取り直す）。 */
'use strict';
var path = require('path');
var NP = path.join(__dirname, '../lib/shotokuzei-nichi.js'), HP = path.join(__dirname, '../lib/shotokuzei-hei.js');
function fresh() { delete require.cache[require.resolve(NP)]; delete require.cache[require.resolve(HP)]; return { N: require(NP), H: require(HP) }; }
function snap(N, H, y) {
  var o = [];
  for (var a = 0; a <= 130000; a += 50) {
    for (var f = 0; f < 8; f++) o.push(N.nichiTax(a, { taxClass: 'ko', deps: f, year: y }));
    o.push(N.nichiTax(a, { taxClass: 'otsu', year: y })); o.push(H.heiTax(a, { year: y }));
  }
  return o;
}
// 来年の 行（中身は 何でもよい＝今年の 値と 違えば 汚れが 見える）。段（koOver 等）は 付けない＝中央の 行の 片方の 形。
function rainen(N0, H0) {
  var t = N0.tableFor(2026);
  return {
    nichi: { start: t.start + 200, step: 100, ko: t.ko.slice(2), otsu: t.otsu.slice(2) },
    hei: { start: H0.HEI_R8.start + 200, step: 100, arr: H0.HEI_R8.arr.slice(2) }
  };
}

T('来年（2027）を 引き込んでも 2025・2026・年なしの 日額/丙は 1円も 変わらない', function () {
  var m = fresh(), N = m.N, H = m.H;
  var b25 = snap(N, H, 2025), b26 = snap(N, H, 2026);
  var r = rainen(N, H);
  H.hydrate(2027, r.hei);
  N.hydrate(2027, Object.assign({}, r.nichi, { koOver: N.tableFor(2026).koOver, otsuOver: N.tableFor(2026).otsuOver, otsuLowRate: 0.03063 }));
  var a25 = snap(N, H, 2025), a26 = snap(N, H, 2026), d = 0;
  a25.forEach(function (v, i) { if (v !== b25[i]) d++; }); a26.forEach(function (v, i) { if (v !== b26[i]) d++; });
  eq(d, 0, '変わった点');
  eq(N.tableFor(2027).start, 3700, '2027 は 来年の 表'); eq(N.tableFor(2026).start, 3500, '2026 は 今年の 表');
  eq(H.tableFor(2027).start, 10000, '丙 2027'); eq(H.tableFor(2026).start, 9800, '丙 2026');
  eq(N.tableFor(2030).start, 3700, '収録より 新しい 年は 一番 近い 年以下'); eq(N.tableFor(2020).start, 3500, '収録より 古い 年は 一番 古い 収録年');
  fresh();
});

T('日額：段（koOver/otsuOver）の 無い 来年の 行は 引き込まない（R8 の 段で 埋めない）', function () {
  var m = fresh(), N = m.N, H = m.H;
  var ok = N.hydrate(2027, rainen(N, H).nichi);
  eq(ok, false, '引き込みを 断る'); eq(N.tableFor(2027).start, 3500, '2027 は まだ 今年の 表のまま');
  fresh();
});

T('日額：同じ年の 行に 段が 無ければ lib の その年の 段を 残す', function () {
  var m = fresh(), N = m.N, t = N.tableFor(2026), before = N.nichiTax(60000, { taxClass: 'ko', deps: 0, year: 2026 });
  var ok = N.hydrate(2026, { start: t.start, step: t.step, ko: t.ko, otsu: t.otsu });
  eq(ok, true); eq(N.nichiTax(60000, { taxClass: 'ko', deps: 0, year: 2026 }), before, '60,000円 甲0');
  fresh();
});

T('丙：引き込みは lib の 同じ年の 他の 鍵を 消さない', function () {
  var m = fresh(), H = m.H;
  H.HEI_BY_YEAR[2026].over = [{ at: 24000, base: 746, rate: 0.1021 }];
  H.hydrate(2026, { start: 9800, step: 100, arr: H.HEI_R8.arr });
  ok(Array.isArray(H.HEI_BY_YEAR[2026].over), 'over が 残る');
  fresh();
});
