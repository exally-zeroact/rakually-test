/* xlsb-edit.js — ★.xlsb（BIFF12）の値だけを直す★
 *
 * 形: [記録の番号(可変長1〜2B)][長さ(可変長1〜4B)][中身] の繰り返し
 * ★終端ぴったりで終わらなければ、書き換えを中止して「直せません」と出す★（壊すより断る）
 *
 * 実測（司さんの代行計算表2026・2026-08-09）:
 *   16部品を最後まで歩けた（ズレ0・失敗0）／総記録 43,917／記録の種類 80種
 *   ★数式セル BrtFmlaNum 12,191 + BrtFmlaString 2,866★＝この形式は数式が主役。
 *   だから ★キャッシュ値を自分の計算結果で埋める★のが唯一の担保になる
 *   （.xlsb は再計算しない読み手が多い）。
 *
 * ★binaryIndex について★
 *   xl/worksheets/binaryIndex#.bin は「何バイト目に何がある」の索引。
 *   記録の長さが変わると古い位置を指したままになるので ★消す★。
 *   ただし部品を消すだけでは足りない。★参照が2か所ある★:
 *     ・xl/worksheets/_rels/sheetN.bin.rels の xlBinaryIndex の Relationship
 *     ・[Content_Types].xml の Override（シートの数だけ）
 *   両方を外す。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.XlsbEdit = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var R = {
    ROW: 0, BLANK: 1, RK: 2, ERROR: 3, BOOL: 4, REAL: 5, ST: 6, ISST: 7,
    FMLA_STRING: 8, FMLA_NUM: 9, FMLA_BOOL: 10, FMLA_ERROR: 11,
  };
  var VALUE_IDS = [R.BLANK, R.RK, R.ERROR, R.BOOL, R.REAL, R.ST, R.ISST];
  var FORMULA_IDS = [R.FMLA_STRING, R.FMLA_NUM, R.FMLA_BOOL, R.FMLA_ERROR];

  function readVar(b, p, maxBytes) {
    var v = 0, shift = 0, n = 0;
    for (;;) {
      if (p + n >= b.length) return null;
      var x = b[p + n];
      v |= (x & 0x7f) << shift;
      n++;
      if ((x & 0x80) === 0) break;
      shift += 7;
      if (n >= maxBytes) return null;
    }
    return { value: v >>> 0, bytes: n };
  }
  function varBytes(v) {
    var out = [];
    do { var b = v & 0x7f; v >>>= 7; if (v) b |= 0x80; out.push(b); } while (v);
    return out;
  }

  /* ★部品ごとの「先頭と末尾の記録」★（実物14シート＋workbook＋sharedStrings で実測・2026-08-09）
   *   終端ぴったりだけでは足りない。★1バイトずらしても終端は合ってしまった★ので、
   *   先頭と末尾も見る。ずらすと先頭が 129 でなくなるので、これで弾ける。 */
  var SHAPE = {
    sheet: { first: 129, last: 130 },
    workbook: { first: 131, last: 132 },
    sharedStrings: { first: 159, last: 160 },
  };
  function shapeOf(partName) {
    if (/worksheets\/sheet\d+\.bin$/.test(partName)) return SHAPE.sheet;
    if (/workbook\.bin$/.test(partName)) return SHAPE.workbook;
    if (/sharedStrings\.bin$/.test(partName)) return SHAPE.sharedStrings;
    return null;                                  // 知らない部品は形を見ない（歩けるかだけ見る）
  }

  /** ★記録を歩く。終端がぴったりでなければ ok:false（＝直させない）★
   *  expect を渡すと、先頭と末尾の記録番号も確かめる（ズレ検出の本命） */
  function parse(buf, expect) {
    var recs = [], p = 0;
    while (p < buf.length) {
      var id = readVar(buf, p, 2);
      if (!id) return { ok: false, why: '番号を読めない（位置 ' + p + '）', recs: recs };
      var q = p + id.bytes;
      var len = readVar(buf, q, 4);
      if (!len) return { ok: false, why: '長さを読めない（位置 ' + q + '）', recs: recs };
      q += len.bytes;
      if (q + len.value > buf.length) {
        return { ok: false, why: '中身がファイルの外へ出る（位置 ' + q + '・長さ ' + len.value + '）', recs: recs };
      }
      recs.push({ id: id.value, data: buf.subarray(q, q + len.value) });
      p = q + len.value;
    }
    if (p !== buf.length) return { ok: false, why: '終端がズレた（' + p + ' / ' + buf.length + '）', recs: recs };
    if (!recs.length) return { ok: false, why: '記録が1つも無い', recs: recs };
    if (expect) {
      var f = recs[0].id, l = recs[recs.length - 1].id;
      if (f !== expect.first) return { ok: false, why: '先頭の記録が違う（' + f + ' / ' + expect.first + 'のはず）', recs: recs };
      if (l !== expect.last) return { ok: false, why: '末尾の記録が違う（' + l + ' / ' + expect.last + 'のはず）', recs: recs };
    }
    return { ok: true, why: '', recs: recs };
  }

  /** 歩いた記録を書き戻す（長さは記録ごとに数え直す＝長さが変わってよい） */
  function build(recs) {
    var total = 0, i;
    for (i = 0; i < recs.length; i++) {
      total += varBytes(recs[i].id).length + varBytes(recs[i].data.length).length + recs[i].data.length;
    }
    var out = new Uint8Array(total), at = 0;
    for (i = 0; i < recs.length; i++) {
      var idB = varBytes(recs[i].id), lnB = varBytes(recs[i].data.length);
      out.set(idB, at); at += idB.length;
      out.set(lnB, at); at += lnB.length;
      out.set(recs[i].data, at); at += recs[i].data.length;
    }
    return out;
  }

  function dv(u8) { return new DataView(u8.buffer, u8.byteOffset, u8.byteLength); }

  /** セルの記録から 列番号を読む（先頭4バイト） */
  function colOf(rec) { return dv(rec.data).getUint32(0, true); }
  /** 行の記録から 行番号を読む */
  function rowOf(rec) { return dv(rec.data).getUint32(0, true); }

  /** 記録の一覧に「行・列」を付けて返す（探しやすくする） */
  function locate(recs) {
    var row = -1, map = {};
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i];
      if (r.id === R.ROW) { row = rowOf(r); continue; }
      if (VALUE_IDS.indexOf(r.id) < 0 && FORMULA_IDS.indexOf(r.id) < 0) continue;
      map[row + ',' + colOf(r)] = i;
    }
    return map;
  }

  /** 数値を入れ直す。
   *  ★数式セル(BrtFmlaNum)は キャッシュの8バイトを その場で書き換える（長さが変わらない）★
   *  値のセルは BrtCellReal に作り直す（長さが変わってよい） */
  function setNumber(recs, idx, num) {
    var r = recs[idx];
    if (r.id === R.FMLA_NUM) {
      var d = r.data.slice();                    // 元を壊さない
      dv(d).setFloat64(8, num, true);            // Cell(8) の直後が答えのキャッシュ
      recs[idx] = { id: r.id, data: d };
      return 'キャッシュを書き換えた（長さ不変）';
    }
    if (FORMULA_IDS.indexOf(r.id) >= 0) {
      // 文字/論理/エラーを返す式に数を入れるのは、形が変わるので ★やらない★
      throw new Error('この数式セルの答えの形は まだ直せません（記録 ' + r.id + '）');
    }
    var cell = r.data.subarray(0, 8);            // 列と書式はそのまま持っていく
    var nd = new Uint8Array(16);
    nd.set(cell, 0);
    dv(nd).setFloat64(8, num, true);
    recs[idx] = { id: R.REAL, data: nd };
    return '値のセルを実数にした';
  }

  /** シート1枚の中身（Uint8Array）を受け取り、値を入れ直して返す */
  function editSheet(bin, cells) {
    var p = parse(bin, SHAPE.sheet);
    if (!p.ok) return { ok: false, why: p.why };
    var map = locate(p.recs);
    var done = [], miss = [];
    Object.keys(cells).forEach(function (key) {         // key = "行,列"（0始まり）
      var i = map[key];
      if (i === undefined) { miss.push(key); return; }
      done.push(key + ':' + setNumber(p.recs, i, cells[key]));
    });
    if (miss.length) return { ok: false, why: 'そのセルが元のファイルにありません: ' + miss.join(' ') };
    return { ok: true, bytes: build(p.recs), done: done, count: p.recs.length };
  }

  /** binaryIndex を外す（★部品・rels・[Content_Types].xml の3か所★） */
  function dropBinaryIndex(zip, contentTypesXml, relsBySheet) {
    var dropped = [], names = zip.names();
    names.forEach(function (n) {
      if (/^xl\/worksheets\/binaryIndex\d+\.bin$/.test(n)) { zip.remove(n); dropped.push(n); }
    });
    // [Content_Types].xml の Override を外す
    var ct = contentTypesXml.replace(/<Override[^>]*binaryIndex\d+\.bin[^>]*\/>/g, '');
    // 各シートの rels から xlBinaryIndex の参照を外す
    var rels = {};
    Object.keys(relsBySheet).forEach(function (k) {
      rels[k] = relsBySheet[k].replace(/<Relationship[^>]*xlBinaryIndex[^>]*\/>/g, '');
    });
    return { dropped: dropped, contentTypes: ct, rels: rels };
  }

  return {
    R: R, VALUE_IDS: VALUE_IDS, FORMULA_IDS: FORMULA_IDS, SHAPE: SHAPE, shapeOf: shapeOf,
    parse: parse, build: build, locate: locate, editSheet: editSheet,
    dropBinaryIndex: dropBinaryIndex, colOf: colOf, rowOf: rowOf,
  };
});
