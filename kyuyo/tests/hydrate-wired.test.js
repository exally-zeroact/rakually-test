/* hydrate-wired.test.js — ★中央(statutory)の 種類は、必ず 画面まで つながっているか★
 * ============================================================================
 * ★なぜ 要るか（2026-09-11 実測。同じ形で 2回 踏んだ）★
 *   アプリは 中央を 読んで lib に 流し込む＝★中央を直せば 全国の客に 届く★。ところが：
 *     ・★労災は hydrate 自体が 無かった★（今日5つ目の穴）
 *     ・★消費税は hydrate は 在るのに 請求書の画面が 呼んでいなかった★（6つ目）
 *   どちらも ★中央を直しても 客に 届かない★のに ★試験も CI も 緑★だった。
 *   ⇒ ★「中央に 在る」と「画面まで つながっている」は 別物★。ここで 両方を 数える。
 *
 * ★数え方（何を 何で 数えたか）★
 *   ①buildStatutoryRows が 作る「あるべき行」から ★種類(kind)★ を 取る（手で並べない）
 *   ②画面側の js の 字に ★その kind が 出てくるか★ を 見る
 *     （流し込みは r.kind==='xxx' か .eq('kind','xxx') の形で 必ず kind の字が 要る）
 *   ③見た本数を 必ず 一緒に 出す（0件と「1本も開けていない」を 取り違えない）
 *   ★名前で 探さない★＝画面は 短い変数に 入れ替えてから .hydrate を 呼ぶので
 *     「グローバル名.hydrate」で 探すと ★11本とも 届かないと 出る（最初に これで 嘘をついた）★
 */
'use strict';
var fs = require('fs');
var path = require('path');
var SR = require('../lib/statutory-rows.js');

var L = {
  SHH: require('../lib/shakaihoken-hyo.js'), SAI: require('../lib/saitei-chingin.js'),
  KOYO: require('../lib/koyo-hoken.js'), D: require('../lib/shotokuzei-densan.js'),
  H: require('../lib/shotokuzei-hei.js'), NI: require('../lib/shotokuzei-nichi.js'),
  SZ: require('../lib/shoyo-zei.js'), N: require('../lib/nenmatsu.js'),
  WM: require('../lib/warimashi.js'), SHZ: require('../lib/shouhizei-ritsu.js'),
  RR: require('../lib/rousai-ritsu.js')
};

var SCREENS = [
  path.join(__dirname, '..', 'js', 'app.js'),                        // 給与の画面
  path.join(__dirname, '..', '..', 'seikyu', 'js', 'seikyu-app.js')  // 請求書の画面
];
var texts = SCREENS.map(function (p) { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; });
var all = texts.join('|');

var kinds = SR.buildStatutoryRows(L).map(function (r) { return r.kind; })
  .filter(function (v, i, a) { return a.indexOf(v) === i; });

T('★見た本数を 出す★（0件と「1本も開けていない」を 取り違えない）', function () {
  ok(kinds.length >= 10, '種類が ' + kinds.length + ' しか 取れていない＝道具が 動いていない疑い');
  texts.forEach(function (t, i) { ok(t.length > 1000, SCREENS[i] + ' を 読めていない(' + t.length + '字)'); });
  console.log('      中央の種類 ' + kinds.length + '＝' + kinds.join(',') + ' / 画面 ' + SCREENS.length + '枚');
});

T('★中央の 種類は 全部 画面まで つながっている★（中央を直せば 客に届く）', function () {
  var orphan = kinds.filter(function (k) { return all.indexOf("'" + k + "'") < 0; });
  ok(orphan.length === 0,
    '★中央を直しても 客に 届かない 種類★: ' + orphan.join(', ')
    + ' — 画面(kyuyo/js/app.js か seikyu/js/seikyu-app.js)で 流し込む事');
});

T('★流し込みは 本当に hydrate を 呼んでいる★（kind の字だけ 在って 呼んでいない を 弾く）', function () {
  ok(all.indexOf('.hydrate(') >= 0, '画面に hydrate の 呼び出しが 1つも 無い');
  var n = (all.match(/[.]hydrate[(]/g) || []).length;
  ok(n >= kinds.length - 1, '流し込みの 呼び出しが ' + n + '回＝種類 ' + kinds.length + ' に 足りない');
});
