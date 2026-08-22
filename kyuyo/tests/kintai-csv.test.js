/* kintai-csv.test.js — 勤怠CSVパーサ: 列名の柔軟マッチ・時間パース・行解釈・表記ゆれ・氏名欠落警告 */
'use strict';
var K = require('../lib/kintai-csv.js');

T('kintai classify: 見出し→正準フィールド(表記ゆれ)', function () {
  eq(K.classify('氏名'), 'name'); eq(K.classify('従業員名'), 'name'); eq(K.classify('名 前'), 'name');
  eq(K.classify('従業員番号'), 'no'); eq(K.classify('社員コード'), 'no');
  eq(K.classify('出勤日数'), 'shukkin'); eq(K.classify('欠勤日数'), 'kekkin'); eq(K.classify('有給取得'), 'yukyu');
  eq(K.classify('労働時間'), 'worked'); eq(K.classify('実労働時間'), 'worked');
  eq(K.classify('残業時間'), 'ot'); eq(K.classify('時間外'), 'ot');
  eq(K.classify('深夜'), 'night'); eq(K.classify('深夜労働'), 'night');
  eq(K.classify('法定休日'), 'holiday'); eq(K.classify('休日出勤'), 'holiday');
  eq(K.classify('備考'), null);
});
T('kintai toMinutes: 時:分 / 小数時 / 整数時 / 全角', function () {
  eq(K.toMinutes('160:30'), 9630); eq(K.toMinutes('160.5'), 9630); eq(K.toMinutes('160'), 9600);
  eq(K.toMinutes('10:00'), 600); eq(K.toMinutes(''), 0); eq(K.toMinutes('１０：３０'), 630); // 全角
});
T('kintai parse: 見出し認識+行の値', function () {
  var csv = '氏名,出勤日数,欠勤日数,有給,労働時間,残業,深夜,休日\n山田太郎,21,0,1,160:00,10:30,2:00,8:00\n田中花子,20,1,0,152.5,5,0,0\n';
  var r = K.parse(csv);
  eq(r.rows.length, 2);
  eq(r.warnings.length, 0);
  var a = r.rows[0];
  eq(a.name, '山田太郎'); eq(a.shukkin, 21); eq(a.kekkin, 0); eq(a.yukyu, 1);
  eq(a.workedMin, 9600); eq(a.otMin, 630); eq(a.nightMin, 120); eq(a.holidayMin, 480);
  var b = r.rows[1];
  eq(b.name, '田中花子'); eq(b.shukkin, 20); eq(b.workedMin, 9150); eq(b.otMin, 300);
});
T('kintai parse: 氏名列なし→警告 / 空行・氏名空はスキップ / BOM・クオート', function () {
  var r = K.parse('日付,時間\n2026-06-01,8:00');
  ok(r.warnings.join('').indexOf('氏名') >= 0, '氏名列なし警告');
  var r2 = K.parse('﻿氏名,出勤日数\n"山田, 太郎",21\n,5\n\n田中,20');
  eq(r2.rows.length, 2, '氏名空とnull行はスキップ');
  eq(r2.rows[0].name, '山田, 太郎'); // クオート内カンマ
  eq(r2.rows[0].shukkin, 21);
  eq(r2.rows[1].name, '田中');
});
T('kintai parse: 認識した列だけ・未指定はnull(既存値を保持できる)', function () {
  var r = K.parse('氏名,残業\n山田,12:00');
  eq(r.recognized.sort().join(','), 'name,ot');
  eq(r.rows[0].otMin, 720); eq(r.rows[0].shukkin, null); eq(r.rows[0].workedMin, null);
});

/* ★2026-08-23 指示役の宿題★
 *  ①「時間外60時間超」「休日深夜」の置き場が無く、
 *    60時間超は ★法定50%割増の材料★ なのに ★普通の残業として入っていた（金額が黙って化ける）★。
 *  ②しかも ★どちらが勝つかは 列の並び順しだい★だった（先に出てきた列が勝つ作りのため）。
 *  ⇒ 狭い物を先に判定する／読まない列も名前で残す／★列順で結果が変わらない事を ここで固定する★。
 */
T('kintai classify: ★60時間超・休日深夜は それ自身の欄★（時間外・深夜に化けない）', function () {
  eq(K.classify('時間外60時間超'), 'over60');
  eq(K.classify('60時間超'), 'over60');
  eq(K.classify('月60時間以上'), 'over60');
  eq(K.classify('残業60h超'), 'over60');
  eq(K.classify('休日深夜'), 'holidayNight');
  eq(K.classify('法定休日深夜'), 'holidayNight');
  eq(K.classify('深夜休日'), 'holidayNight');
  /* 元の物は そのまま */
  eq(K.classify('時間外'), 'ot'); eq(K.classify('深夜'), 'night'); eq(K.classify('法定休日'), 'holiday');
});

T('kintai parse: ★列の並びを変えても 値が入れ替わらない★（並び順で金額が化けない）', function () {
  var a = '氏名,時間外60時間超,時間外,休日深夜,深夜,法定休日\n山田,10:00,45:30,3:00,2:00,8:00\n';
  var b = '氏名,法定休日,深夜,休日深夜,時間外,時間外60時間超\n山田,8:00,2:00,3:00,45:30,10:00\n';
  var pick = function (csv) { var r = K.parse(csv).rows[0];
    return [r.otMin, r.nightMin, r.holidayMin, r.over60Min, r.holidayNightMin].join('/'); };
  eq(pick(a), '2730/120/480/600/180');
  eq(pick(a), pick(b), '★列順を変えたら値が変わった＝並び順で化ける★');
});

T('kintai parse: ★60時間超が 普通の残業に混ざらない★（法定50%の材料を横取りしない）', function () {
  var r = K.parse('氏名,時間外,時間外60時間超\n山田,45:00,10:00\n').rows[0];
  eq(r.otMin, 2700); eq(r.over60Min, 600);
  /* ★置き場が無かった頃は 60時間超が ot に入り、45:00 か 10:00 のどちらかが消えていた★ */
  var r2 = K.parse('氏名,時間外60時間超,時間外\n山田,10:00,45:00\n').rows[0];
  eq(r2.otMin, 2700); eq(r2.over60Min, 600);
});

T('kintai parse: ★読まない列を 黙って捨てない★／同じ意味が2つなら知らせる', function () {
  var r = K.parse('氏名,時間外,遅刻回数,備考\n山田,45:00,2,あ\n');
  eq(r.skipped.join('・'), '遅刻回数・備考');
  eq(r.duplicated.length, 0);
  var d = K.parse('氏名,残業,時間外\n山田,45:00,10:00\n');
  eq(d.duplicated.join('・'), '時間外', '同じ意味の列が2つある事を出していない');
  eq(d.rows[0].otMin, 2700, '先に出てきた列だけ読む');
});

T('kintai parse: ★60時間超・休日深夜が無いCSVは これまでどおり null★（既存値を消さない）', function () {
  var r = K.parse('氏名,時間外,深夜\n山田,45:00,2:00\n').rows[0];
  eq(r.over60Min, null); eq(r.holidayNightMin, null);
});
