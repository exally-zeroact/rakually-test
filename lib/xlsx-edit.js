/* xlsx-edit.js — ★受け取ったブックを「触った所だけ」直す★（.xlsx / .xlsm）
 *
 * ★なぜ作り直さないか（2026-08-08 実測）★
 *   SheetJS で読んで書き直すと 罫線84・判子1・結合7・列幅が★全部消える★。
 *   だから ★元のzipを持ったまま、セルの値だけ書き換えて閉じ直す★。
 *
 * ★守っている決まり（全部 実測で決めた）★
 *   ・シートは ★名前 → r:id → rels の Target★ で引く（`sheet1.xml` は先頭シートではない）
 *   ・文字列は sharedStrings に ★末尾へ足して番号だけ差し替える★
 *     （既にある <si> を書き換えると、同じ言葉のセルが全部変わる。実測で3セル巻き込んだ）
 *   ・★数式セルは <f> を残し、<v>(答えのキャッシュ)を自分の計算結果で埋める★
 *     Excelは開いても再計算しない。fullCalcOnLoad は Excel でしか効かないので、
 *     ★Google/Numbers/PDF変換/メールのプレビューのためには「自分で埋める」しかない★
 *   ・その上で ★fullCalcOnLoad="1" も立てる（保険）★
 *   ・書式(s属性)は触らない。無いセルは★作らずに断る★（壊すより断る）
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./zip-surgeon.js'));
  else root.XlsxEdit = factory(root.ZipSurgeon);
})(typeof self !== 'undefined' ? self : this, function (ZipSurgeon) {
  'use strict';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  /* 属性の中に出てくる特殊文字を正規表現用に逃がす */
  function rx(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /** ブックを開く。★元のバイト列は zip.raw に残る（作業用コピーはこれを保存する）★ */
  function open(bytes) {
    var zip = ZipSurgeon.read(bytes);
    var book = { zip: zip, sheets: [], sst: null, dirty: {} };
    return zip.text('xl/workbook.xml').then(function (wbx) {
      book.workbookXml = wbx;
      return zip.text('xl/_rels/workbook.xml.rels');
    }).then(function (rels) {
      book.relsXml = rels;
      var re = /<sheet\b[^>]*\/>/g, m;
      while ((m = re.exec(book.workbookXml))) {
        var tag = m[0];
        var name = (tag.match(/\bname="([^"]*)"/) || [])[1];
        var rid = (tag.match(/r:id="([^"]*)"/) || [])[1];
        if (!name || !rid) continue;
        var t = book.relsXml.match(new RegExp('<Relationship[^>]*Id="' + rx(rid) + '"[^>]*Target="([^"]+)"'));
        if (!t) continue;
        var target = t[1].replace(/^\//, '').replace(/^xl\//, '');
        book.sheets.push({ name: name, rid: rid, part: 'xl/' + target });
      }
      if (!book.sheets.length) throw new Error('シートが1枚も読み取れません（この形は まだ直せません）');
      return book;
    });
  }

  function sheetOf(book, name) {
    for (var i = 0; i < book.sheets.length; i++) if (book.sheets[i].name === name) return book.sheets[i];
    throw new Error('そのシートがありません: ' + name);
  }

  /* ── 共有文字列：★末尾に足して番号を返す★（既にある物は書き換えない） ── */
  function ensureSst(book) {
    if (book.sst) return Promise.resolve(book.sst);
    var name = 'xl/sharedStrings.xml';
    if (!book.zip.has(name)) {
      book.sst = { xml: null, count: 0, added: [] };   // 共有文字列が無いブックもある
      return Promise.resolve(book.sst);
    }
    return book.zip.text(name).then(function (xml) {
      var n = (xml.match(/<si[\s>]/g) || []).length;
      book.sst = { xml: xml, count: n, added: [] };
      return book.sst;
    });
  }
  function addString(book, s) {
    var sst = book.sst;
    var idx = sst.count + sst.added.length;
    sst.added.push(s);
    return idx;
  }

  /** セル1つを書き換える予約。
   *  spec: { v: 値, t: 'n'|'s'|'b', f: 式が有る場合は触らない }
   *  ★数式セルは <f> を残して <v> だけ入れ替える★ */
  function setCell(sheetXml, addr, spec, book) {
    var re = new RegExp('<c\\b([^>]*\\br="' + rx(addr) + '"[^>]*)(/>|>([\\s\\S]*?)</c>)');
    var m = sheetXml.match(re);
    if (!m) {
      throw new Error('セル ' + addr + ' が元のファイルにありません（新しいセルは まだ作れません）');
    }
    var attrs = m[1];
    var inner = m[3] || '';
    var hasF = /<f[\s>]/.test(inner);
    var fPart = hasF ? (inner.match(/<f[\s\S]*?<\/f>|<f\b[^>]*\/>/) || [''])[0] : '';

    // 型を表す t 属性を作り直す（書式 s= は そのまま残す）
    var keep = attrs.replace(/\s+t="[^"]*"/g, '');
    var t = '', body = '';
    if (spec.t === 's') {
      var idx = addString(book, spec.v == null ? '' : String(spec.v));
      t = ' t="s"'; body = '<v>' + idx + '</v>';
    } else if (spec.t === 'b') {
      t = ' t="b"'; body = '<v>' + (spec.v ? 1 : 0) + '</v>';
    } else {
      t = ''; body = '<v>' + Number(spec.v) + '</v>';   // 数値は t を付けないのが既定
    }
    var out = '<c' + keep + t + '>' + fPart + body + '</c>';
    return sheetXml.slice(0, m.index) + out + sheetXml.slice(m.index + m[0].length);
  }

  /** シート1枚ぶんの書き換えを予約する。cells = { 'A1': {v,t}, ... } */
  function setValues(book, sheetName, cells) {
    var sh = sheetOf(book, sheetName);
    return ensureSst(book).then(function () {
      return book.dirty[sh.part] ? Promise.resolve(book.dirty[sh.part]) : book.zip.text(sh.part);
    }).then(function (xml) {
      Object.keys(cells).forEach(function (addr) {
        xml = setCell(xml, addr, cells[addr], book);
      });
      book.dirty[sh.part] = xml;
      return book;
    });
  }

  /** 保存する。★触っていない部品は1バイトも変えずに写る★
   *  戻り: Promise<{ bytes, log }>（log = 書き換えた部品を圧縮できたか） */
  function save(book) {
    var zip = book.zip;
    Object.keys(book.dirty).forEach(function (part) { zip.replaceText(part, book.dirty[part]); });

    // 共有文字列に足した物を書き戻す（件数も増やす）
    if (book.sst && book.sst.xml && book.sst.added.length) {
      var add = book.sst.added.map(function (s) { return '<si><t xml:space="preserve">' + esc(s) + '</t></si>'; }).join('');
      var xml = book.sst.xml.replace(/<\/sst>\s*$/, add + '</sst>');
      var total = book.sst.count + book.sst.added.length;
      xml = xml.replace(/(<sst\b[^>]*?)\scount="\d+"/, '$1 count="' + total + '"')
        .replace(/(<sst\b[^>]*?)\suniqueCount="\d+"/, '$1 uniqueCount="' + total + '"');
      zip.replaceText('xl/sharedStrings.xml', xml);
    }

    // ★開いた時に必ず計算し直させる（保険。本命は <v> を自分で埋めること）★
    var wbx = book.workbookXml;
    if (/<calcPr\b[^>]*\/>/.test(wbx)) {
      wbx = wbx.replace(/<calcPr\b([^>]*?)\s*\/>/, function (_, a) {
        return '<calcPr' + a.replace(/\s+fullCalcOnLoad="[^"]*"/g, '') + ' fullCalcOnLoad="1"/>';
      });
    } else if (/<calcPr\b/.test(wbx)) {
      wbx = wbx.replace(/<calcPr\b([^>]*?)>/, '<calcPr$1 fullCalcOnLoad="1">');
    } else {
      wbx = wbx.replace(/<\/workbook>/, '<calcPr calcId="0" fullCalcOnLoad="1"/></workbook>');
    }
    zip.replaceText('xl/workbook.xml', wbx);

    return zip.build();
  }

  /** 中身から見て、どの形式か（拡張子を信じない） */
  function kindOf(zip) {
    if (zip.has('xl/workbook.bin')) return 'xlsb';
    if (zip.has('xl/vbaProject.bin')) return 'xlsm';
    if (zip.has('xl/workbook.xml')) return 'xlsx';
    return 'unknown';
  }

  return { open: open, setValues: setValues, save: save, sheetOf: sheetOf, kindOf: kindOf };
});
