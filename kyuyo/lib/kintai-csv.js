/* kintai-csv.js — 勤怠CSV(他社勤怠システムのエクスポート)を取り込んで給与入力に流し込むためのパーサ(純関数)。
 *  ★自社打刻は作らない。KING OF TIME/ジョブカン勤怠/自前Excel等のCSVを「氏名+列名」で柔軟に解釈するだけ★
 *  列名は表記ゆれに強くキーワードで対応: 氏名/出勤日数/欠勤/有給/労働時間/残業(時間外)/深夜/休日。
 *  時間値は "160:30"(時:分) / "160.5"(小数時) / "160"(時) を分に正規化。金額桁のカンマ・全角も吸収。
 * 【利用】ブラウザ window.KintaiCsv / Node require('./kintai-csv.js')
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.KintaiCsv = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 1行をCSVフィールドへ(ダブルクオート対応・"" エスケープ)。行内改行は非対応(単純CSV前提)。
  function splitLine(line) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else { if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; }
    }
    out.push(cur);
    return out.map(function (s) { return s.replace(/^﻿/, '').trim(); });
  }

  // 列名→正準フィールド。1つの見出しが複数該当しないよう優先順(★狭い物から先に★)。
  // ★2026-08-23 に直した所（指示役の宿題）★
  //   ①「時間外60時間超」と「休日深夜」の置き場が無かった。
  //      60時間超は ★法定50%割増★ の材料。置き場が無いと ★割増が付かない★。
  //   ②置き場が無いので「時間外60時間超」は /時間外/ に当たり ★普通の残業として入っていた★＝
  //      ★金額が黙って化ける（警告0）★。しかも ★どちらが勝つかは 列の並び順しだい★だった
  //      （先に出てきた列が勝つ作りのため）。
  //   ⇒ ★狭い物（休日深夜・60時間超）を先に判定する★＝並び順で結果が変わらない。
  function classify(h) {
    var s = String(h || '').replace(/\s|　/g, '');
    if ((/番号|コード|ＩＤ/i.test(s) || /ID/.test(s)) && /従業員|社員/.test(s)) return 'no'; // 「従業員番号」は氏名より先に
    if (/氏名|名前|従業員名|社員名|従業員|担当者/.test(s)) return 'name';
    /* ★狭い物から先に★＝並び順で結果が変わらない。★エンジンが読む欄は 全部 持つ★（下の決まり）
       割増の重なり方（kyuyo/lib/payroll-monthly.js の detail）:
         時間外25% ／ 深夜25% ／ 休日35% ／ ★60時間超50%★
         ★時間外深夜＝25+25＝50%★ ／ ★60時間超深夜＝50+25＝75%★ ／ ★休日深夜＝35+25＝60%★
       ＝★狭い欄が無いと 低い方の欄に落ちて 払い足りない★ */
    var over60 = /60\s*(時間|h|H)?\s*(超|以上|超過)|時間外60|残業60/.test(s);
    var night = /深夜|夜勤/.test(s);
    if (over60 && night) return 'over60Night';                    // ★いちばん狭い★
    if (night && /残業|時間外/.test(s)) return 'otNight';
    if (night && /休日/.test(s)) return 'holidayNight';
    if (over60) return 'over60';
    if (/深夜|深夜労働|夜勤/.test(s)) return 'night';
    if (/法定休日|休日出勤|休日労働|休日/.test(s)) return 'holiday';
    if (/残業|時間外|普通残業/.test(s)) return 'ot';
    if (/労働時間|実労働|実働|総労働|勤務時間/.test(s)) return 'worked';
    if (/出勤日数|出勤|勤務日数|出勤日/.test(s)) return 'shukkin';
    if (/欠勤/.test(s)) return 'kekkin';
    if (/有給|有休|年休/.test(s)) return 'yukyu';
    return null;
  }

  function znum(v) { return String(v == null ? '' : v).replace(/[，]/g, ',').replace(/[０-９．：]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).replace(/,/g, ''); }
  function toNum(v) { var n = Number(znum(v)); return isNaN(n) ? 0 : n; }
  // 時間文字列→分。"160:30"/"160.5"/"160"
  function toMinutes(v) {
    var s = znum(v).trim(); if (!s) return 0;
    if (s.indexOf(':') >= 0) { var p = s.split(':'); return Math.round((toNum(p[0]) * 60) + toNum(p[1])); }
    var h = Number(s); if (isNaN(h)) return 0; return Math.round(h * 60);
  }

  /** 勤怠CSVテキストをパース。
   * @returns {object} { headers, map(見出し→field), rows:[{name,no,shukkin,kekkin,yukyu,workedMin,otMin,nightMin,holidayMin, raw}], recognized:[field], warnings:[] }
   */
  function parse(text) {
    var warnings = [];
    var lines = String(text == null ? '' : text).split(/\r\n|\r|\n/).filter(function (l) { return l.replace(/[,\s]/g, '') !== ''; });
    if (!lines.length) return { headers: [], map: {}, rows: [], recognized: [], warnings: ['空のCSVです'] };
    var headers = splitLine(lines[0]);
    var idx = {}; // field -> column index
    var dup = [], skipped = [];
    headers.forEach(function (h, i) {
      var f = classify(h);
      if (!f) { if (String(h || '').trim()) skipped.push(h); return; }   // ★読まない列は 名前で残す★
      if (idx[f] == null) idx[f] = i; else dup.push(h);                 // ★同じ意味の列が2つ★
    });
    if (idx.name == null) warnings.push('「氏名」の列が見つかりません（氏名/名前/従業員名 等の見出しが必要）');
    var recognized = Object.keys(idx);
    var rows = [];
    for (var r = 1; r < lines.length; r++) {
      var cols = splitLine(lines[r]);
      var name = idx.name != null ? cols[idx.name] : '';
      if (!name) continue;
      rows.push({
        name: name,
        no: idx.no != null ? cols[idx.no] : '',
        shukkin: idx.shukkin != null ? toNum(cols[idx.shukkin]) : null,
        kekkin: idx.kekkin != null ? toNum(cols[idx.kekkin]) : null,
        yukyu: idx.yukyu != null ? toNum(cols[idx.yukyu]) : null,
        workedMin: idx.worked != null ? toMinutes(cols[idx.worked]) : null,
        otMin: idx.ot != null ? toMinutes(cols[idx.ot]) : null,
        nightMin: idx.night != null ? toMinutes(cols[idx.night]) : null,
        holidayMin: idx.holiday != null ? toMinutes(cols[idx.holiday]) : null,
        over60Min: idx.over60 != null ? toMinutes(cols[idx.over60]) : null,
        holidayNightMin: idx.holidayNight != null ? toMinutes(cols[idx.holidayNight]) : null,
        otNightMin: idx.otNight != null ? toMinutes(cols[idx.otNight]) : null,
        over60NightMin: idx.over60Night != null ? toMinutes(cols[idx.over60Night]) : null
      });
    }
    /* ★読まない列を 黙って捨てない★（列名が変わった/増えた時に 気づけるようにする）
       ★止めはしない★＝取り込みは出来るが、何を読まなかったかを 画面に出す。 */
    return {
      headers: headers, map: idx, rows: rows, recognized: recognized, warnings: warnings,
      skipped: skipped, duplicated: dup
    };
  }

  return { parse: parse, classify: classify, toMinutes: toMinutes, splitLine: splitLine };
});
