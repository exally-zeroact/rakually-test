/* brand.test.js — ★Rakunally ブランドの後戻り防止★（旧「ZEROACT」「Kyually」表記の再発検知）。
 * 2026-08-18: 司さん「ささっと Exally から切り離せ」で Kyually → Rakunally に統一（10月まで待たない）。
 * 認証オーバーレイ(auth.js)はSupabase依存でUIスモーク対象外なので、ソース検査でロックする。 */
'use strict';
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');

function read(f) { return fs.readFileSync(path.join(root, f), 'utf8'); }

T('ブランド: auth.js のログインロゴが Rakunally（旧 ZEROACT / Kyually 表記なし）', function () {
  var src = read('js/auth.js');
  ok(/auth-logo">Rakunally</.test(src), 'ログインロゴが Rakunally');
  ok(!/ZEROACT/.test(src), 'auth.js に旧「ZEROACT」表記が残っていない');
  ok(!/Kyually/.test(src), 'auth.js に旧「Kyually」表記が残っている');
});

T('ブランド: 見せる字に Kyually が1つも残っていない（題・ロゴ・ホーム画面の名前）', function () {
  var idx = read('index.html'), man = read('manifest.json'), amn = read('admin-manifest.json');
  ok(idx.indexOf('<title>給与 — Rakunally</title>') >= 0, '題が「給与 — Rakunally」でない');
  ok(/class="logo">給与</.test(idx), 'appbar のロゴが「給与」でない');
  ok(!/Kyually/.test(idx), 'index.html に Kyually が残っている');
  ok(!/Kyually/.test(man) && !/Kyually/.test(amn), 'manifest に Kyually が残っている');
});

T('ヘルプ: すべての data-help="X" に HELP[X] 定義がある(死んだ💡が無い)', function () {
  var app = read('js/app.js'), idx = read('index.html');
  var keys = {};
  (app.match(/([a-zA-Z]+):\{ ?t:'💡/g) || []).forEach(function (m) { keys[m.replace(/:\{.*/, '')] = 1; });
  var refs = [];
  (app + idx).replace(/data-help="([a-zA-Z]+)"/g, function (_, k) { refs.push(k); return _; });
  // ★拾えているかを先に見る。両方0件だと「未定義の💡は0件」で緑になるが、何も見ていない。
  ok(Object.keys(keys).length > 0, 'HELPの定義を1つも拾えていない(この検査が空振り。書き方を変えたら正規表現も直す)');
  ok(refs.length > 0, 'data-help を1つも拾えていない(この検査が空振り)');
  var missing = refs.filter(function (k, i) { return refs.indexOf(k) === i && !keys[k]; });
  ok(missing.length === 0, 'HELP未定義の💡: ' + missing.join(', '));
});
