/* book-open.js — ★受け取ったブックを開く／直して返す★（book.html から使う）
 *
 * ★設計の芯（2026-08-08〜09 の実測で決めた）★
 *   受け取ったファイルを直す → ★元のzipのバイト列を持ったまま、値だけ書き換えて閉じ直す★
 *   ゼロから表を作る        → 今までどおり gridToBook → writeBook（元々書式が無いので問題ない）
 *   ★どちらの道のファイルかを、ファイル単位で覚える★
 *   ★受け取ったファイルが writeBook に入ると判子が消える。分岐はここだけ。★
 *
 * ★読む＝見るだけ★
 *   画面に出すための読み取りは SheetJS で行う（.xlsx/.xlsm/.xlsb/.xls すべて読める）。
 *   ★保存はその結果を使わない★。保存は「元のバイト列」に対して行う。
 */
(function (root) {
  'use strict';

  /* 今 開いているファイル。null なら「ゼロから作った表」＝今までの保存の道 */
  var opened = null;

  function u8(ab) { return ab instanceof Uint8Array ? ab : new Uint8Array(ab); }

  /** ★拡張子を信じない。中身で見分ける★（客が拡張子を変えていても間違えない） */
  function detectKind(bytes, name) {
    var b = bytes;
    if (b.length > 8 && b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0) return 'xls';
    if (!(b[0] === 0x50 && b[1] === 0x4B)) return 'unknown';    // zip(PK) でない
    // zip の中身は開いてから見る。ここでは名前で仮置きして、開いた後に上書きする
    return /\.xlsb$/i.test(name || '') ? 'xlsb' : (/\.xlsm$/i.test(name || '') ? 'xlsm' : 'xlsx');
  }

  var MSG_XLS = 'この形式（.xls）は まだ直せません。今は開いて見るだけです。';

  /** ファイルを開く。★元のバイト列をそのまま持つ★ */
  function openFile(file) {
    return file.arrayBuffer().then(function (ab) {
      var bytes = u8(ab);
      var kind = detectKind(bytes, file.name);
      if (kind === 'unknown') throw new Error('Excelのファイルとして読めませんでした');

      // 中身で確定させる（zip の時だけ）
      if (kind !== 'xls' && root.ZipSurgeon) {
        try {
          var z = root.ZipSurgeon.read(bytes);
          if (z.has('xl/workbook.bin')) kind = 'xlsb';
          else if (z.has('xl/vbaProject.bin')) kind = 'xlsm';
          else if (z.has('xl/workbook.xml')) kind = 'xlsx';
        } catch (e) { /* 読めなければ名前のままにする */ }
      }

      // ★表示用の読み取り（見るだけ）★
      var wb = root.XLSX.read(bytes, { type: 'array', cellFormula: true, cellNF: true, sheetStubs: false });
      var out = wb.SheetNames.map(function (nm) { return sheetToGrid(wb.Sheets[nm], nm); });
      /* ★控えは「見せている文字」ではなく「元の生の値」から作る★（2026-08-09）
         画面用に 46043 を "1/21(水)" にして見せているので、その文字を控えにすると
         ★計算し直した瞬間に 46043 と食い違い、全部「変わった」ことになる★
         （実物14シートで 14,424セルが変わった扱いになり、保存が断られた）。 */
      var base = {};
      wb.SheetNames.forEach(function (nm) {
        var ws = wb.Sheets[nm];
        Object.keys(ws).forEach(function (a) {
          if (a.charAt(0) === '!') return;
          var rc = root.XLSX.utils.decode_cell(a);
          var v = ws[a].v;
          base[nm + '|' + rc.r + ',' + rc.c] = (v === undefined || v === null) ? '' : v;
        });
      });

      opened = {
        name: file.name, kind: kind, bytes: bytes,
        sheetNames: wb.SheetNames.slice(),
        /* ★開いた時の値を覚えておく★
           保存の時は「変わったセルだけ」書く。全部書こうとすると
           ・触っていない所まで書き換える危険
           ・答えがエラーの数式セル（記録11）に当たって★保存そのものが断られる★
           が起きる（実物14シート・2万セルで実際に起きた 2026-08-09）。 */
        base: base,
      };
      return { kind: kind, sheets: out, opened: opened };
    });
  }

  /* ★日本語の曜日（aaa / aaaa）を先に本物の文字へ置き換える★
     SheetJS の書式エンジンは この2つを知らないので、そのまま「(aaa)」と出る。
     実物の代行計算表は日付の書式が `m/d(aaa)` なので、★画面に (aaa) が並ぶ★（2026-08-09 実機で確認）。
     中身(シリアル値)は触らない。見せ方だけ直す。 */
  var WD = ['日', '月', '火', '水', '木', '金', '土'];
  function withWeekday(fmt, serial) {
    if (!/a{3,4}/.test(String(fmt))) return fmt;
    var d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
    var w = WD[d.getUTCDay()];
    return String(fmt).replace(/a{4}/g, '"' + w + '曜日"').replace(/a{3}/g, '"' + w + '"');
  }

  /** SheetJS の1シート → グリッドの形 { name, data:{'r,c':{v,f,d,numFmt}}, colW, ... } */
  function sheetToGrid(ws, name) {
    var data = {}, X = root.XLSX;
    Object.keys(ws).forEach(function (a) {
      if (a.charAt(0) === '!') return;
      var c = ws[a], rc = X.utils.decode_cell(a);
      var cell = { v: '', f: '', d: '' };
      if (c.f) {
        cell.f = '=' + c.f;
        cell.d = c.v !== undefined && c.v !== null ? c.v : '';   // ★ファイルの答え（キャッシュ）をそのまま出す★
      } else {
        cell.v = c.v !== undefined && c.v !== null ? c.v : '';
        cell.d = c.w !== undefined ? c.w : cell.v;               // w = Excelが表示していた文字
      }
      if (c.z) cell.numFmt = c.z;
      /* ★日付が 46043 という裸の数字で出るのを止める★
         SheetJS が表示用の文字(w)を作らない事がある（.xlsb で実際に起きた 2026-08-09）。
         その時は表示形式(z)を使って自分で作る。★中身(v)はシリアル値のまま持つ★
         ＝保存する時に日付として書き戻せる。 */
      if ((cell.d === '' || typeof cell.d === 'number') && c.z && typeof c.v === 'number') {
        try {
          var t = root.XLSX.SSF.format(withWeekday(c.z, c.v), c.v);
          if (t !== undefined && t !== null && t !== '') cell.d = t;
        } catch (e) { /* 作れなければ数のまま出す */ }
      }
      data[rc.r + ',' + rc.c] = cell;
    });
    var colW = {};
    (ws['!cols'] || []).forEach(function (col, i) {
      if (col && (col.wpx || col.wch)) colW[i] = col.wpx || Math.round(col.wch * 7);
    });
    return { name: name, data: data, colW: colW, rowH: {}, hiddenRows: {}, hiddenCols: {}, _fromFile: true };
  }

  /* ── 保存：★元のバイト列を書き換える★ ── */

  /** セルの「今の値」（式なら答え、そうでなければ打った値） */
  function valueOf(cell) {
    var isF = typeof cell.f === 'string' && cell.f.charAt(0) === '=';
    var v = isF ? cell.d : (cell.v !== undefined && cell.v !== '' ? cell.v : cell.d);
    return v === undefined || v === null ? '' : v;
  }
  /** 開いた時の値を控えておく（'シート名|r,c' → 値） */
  function baselineOf(sheets) {
    var base = {};
    (sheets || []).forEach(function (sh) {
      Object.keys(sh.data || {}).forEach(function (k) {
        base[sh.name + '|' + k] = valueOf(sh.data[k]);
      });
    });
    return base;
  }
  /** ★開いた時から変わったセルだけ★を集める（触っていない所は1つも書かない） */
  /* ★見た目の違いを「変わった」と数えない★（2026-08-09 指示役が実機で発見）
     開いた時の控えは ファイルの表示文字（例 "1,000"）、
     計算し直した後は 生の数（1000）になる。そのまま比べると
     ★1つも触っていないのに 数式セルが全部「変わった」ことになり、
       文字を返す数式セル（記録8）に当たって保存そのものが断られた★。
     司さんの実物には BrtFmlaString が 2,866個＝必ず当たる。 */
  function normForCompare(v) {
    if (v === undefined || v === null) return '';
    if (typeof v === 'number') return String(v);
    var s = String(v).trim().replace(/[,\s¥￥]/g, '');
    if (s !== '' && !isNaN(Number(s))) return String(Number(s));   // "1,000" と 1000 は同じ
    return String(v).trim();
  }
  function changedCells(sh) {
    var out = {}, base = opened.base || {};
    Object.keys(sh.data || {}).forEach(function (k) {
      var p = k.split(','), r = parseInt(p[0], 10), c = parseInt(p[1], 10);
      if (isNaN(r) || isNaN(c)) return;
      var now = valueOf(sh.data[k]);
      if (normForCompare(now) === normForCompare(base[sh.name + '|' + k])) return;  // 変わっていない
      if (now === '') return;                                        // 空にする操作は まだ扱わない
      /* ★うちの計算が答えを出せなかったセルは、元のまま置いておく★
         #ERROR や #NAME? を書き込むと、★開ける物を自分で壊す★。
         （実物には うちのエンジンが読めない式がある。読めない物は触らないのが正しい） */
      if (typeof now === 'string' && now.charAt(0) === '#') return;
      out[k] = now;
    });
    return out;
  }
  /** ★そのシートの控えを、今の値で取り直す★
   *  うちの計算エンジンは Excel と答えが違う式がある（実物で771セル）。
   *  それを「客が変えた」と数えると、★うちの間違った答えでファイルを上書きしてしまう★。
   *  ⇒ ★シートを計算する側へ流して計算し直した直後に、控えを取り直す★
   *     こうすると「控え＝うちのエンジンから見た今のファイル」になり、
   *     ★そのあとの違い＝客が触った所★だけになる。 */
  function rebaseSheet(sh) {
    if (!opened || !sh) return;
    Object.keys(sh.data || {}).forEach(function (k) {
      opened.base[sh.name + '|' + k] = valueOf(sh.data[k]);
    });
  }

  /** ブック全体で1つでも変わったか（★0件なら元のバイト列をそのまま返す★） */
  function anyChanged(sheets) {
    for (var i = 0; i < sheets.length; i++) {
      if (opened.sheetNames.indexOf(sheets[i].name) < 0) continue;
      if (Object.keys(changedCells(sheets[i])).length) return true;
    }
    return false;
  }

  /** .xlsx 用に A1 形式へ直す。★式のセルは <v>(答え)をうちの計算結果で埋める★ */
  function collectValues(sh) {
    var cells = {}, X = root.XLSX, ch = changedCells(sh);
    Object.keys(ch).forEach(function (k) {
      var p = k.split(','), val = ch[k];
      var num = typeof val === 'number' ? val : (val !== '' && !isNaN(Number(val)) ? Number(val) : null);
      cells[X.utils.encode_cell({ r: parseInt(p[0], 10), c: parseInt(p[1], 10) })] =
        num !== null ? { v: num, t: 'n' } : { v: String(val), t: 's' };
    });
    return cells;
  }

  /** .xlsx / .xlsm を直して返す */
  function saveXlsxLike(sheets) {
    return root.XlsxEdit.open(opened.bytes).then(function (book) {
      var chain = Promise.resolve();
      sheets.forEach(function (sh) {
        if (opened.sheetNames.indexOf(sh.name) < 0) return;      // 元に無いシートは触らない
        chain = chain.then(function () {
          return root.XlsxEdit.setValues(book, sh.name, collectValues(sh));
        });
      });
      return chain.then(function () { return root.XlsxEdit.save(book); });
    });
  }

  /** .xlsb を直して返す（★歩けなければ断る★） */
  function saveXlsb(sheets) {
    var Z = root.ZipSurgeon, E = root.XlsbEdit, X = root.XLSX;
    var zip = Z.read(opened.bytes);
    // シート名 → 部品名（workbook.bin を読まずに、開いた時の並びで対応させる）
    var parts = zip.names().filter(function (n) { return /^xl\/worksheets\/sheet\d+\.bin$/.test(n); })
      .sort(function (a, b) {
        return parseInt(a.replace(/\D+/g, ''), 10) - parseInt(b.replace(/\D+/g, ''), 10);
      });
    var chain = Promise.resolve(), touched = [];
    sheets.forEach(function (sh) {
      var i = opened.sheetNames.indexOf(sh.name);
      if (i < 0 || !parts[i]) return;
      chain = chain.then(function () {
        return zip.bytes(parts[i]).then(function (bin) {
          var cells = {}, ch = changedCells(sh);
          Object.keys(ch).forEach(function (k) {
            var val = ch[k];
            if (typeof val !== 'number' && (val === '' || isNaN(Number(val)))) return;  // 数だけ扱う
            cells[k] = Number(val);
          });
          if (!Object.keys(cells).length) return;
          var ed = E.editSheet(bin, cells);
          if (!ed.ok) throw new Error('このファイルは直せません（' + sh.name + '：' + ed.why + '）');
          zip.replace(parts[i], ed.bytes);
          touched.push(parts[i]);
        });
      });
    });
    return chain.then(function () {
      if (!touched.length) return zip.build();
      /* ★binaryIndex は「何バイト目に何がある」の索引。長さが変わると嘘になるので外す。
         ★部品を消すだけでは足りない。rels と [Content_Types].xml の参照も外す★ */
      return zip.text('[Content_Types].xml').then(function (ct) {
        var relsNames = zip.names().filter(function (n) { return /worksheets\/_rels\/sheet\d+\.bin\.rels$/.test(n); });
        var got = {}, c2 = Promise.resolve();
        relsNames.forEach(function (n) { c2 = c2.then(function () { return zip.text(n).then(function (t) { got[n] = t; }); }); });
        return c2.then(function () {
          var r = E.dropBinaryIndex(zip, ct, got);
          zip.replaceText('[Content_Types].xml', r.contentTypes);
          Object.keys(r.rels).forEach(function (n) { zip.replaceText(n, r.rels[n]); });
          return zip.build();
        });
      });
    });
  }

  /** 保存の入口。★受け取ったファイルかどうかで道を分ける★ */
  function saveOpened(sheets) {
    if (!opened) return Promise.reject(new Error('開いたファイルがありません'));
    if (opened.kind === 'xls') return Promise.reject(new Error(MSG_XLS));
    /* ★1つも変わっていないなら、元のバイト列をそのまま返す★
       作り直さないのが いちばん安全（1バイトも動かない）。 */
    if (!anyChanged(sheets)) {
      return Promise.resolve({ bytes: opened.bytes, log: { compressed: 0, stored: 0, why: '', noChange: true } });
    }
    return (opened.kind === 'xlsb' ? saveXlsb(sheets) : saveXlsxLike(sheets));
  }

  root.BookOpen = {
    openFile: openFile, saveOpened: saveOpened,
    isOpened: function () { return !!opened; },
    current: function () { return opened; },
    reset: function () { opened = null; },
    detectKind: detectKind, sheetToGrid: sheetToGrid, collectValues: collectValues,
    baselineOf: baselineOf, changedCells: changedCells, valueOf: valueOf, withWeekday: withWeekday,
    anyChanged: anyChanged, normForCompare: normForCompare, rebaseSheet: rebaseSheet,
    MSG_XLS: MSG_XLS,
  };
})(typeof self !== 'undefined' ? self : this);
