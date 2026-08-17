/* seikyu-book.js — ★客が上げた自社Excelを「読む・数える・書く場所を当てる」★
 *
 * ここが請求書の一番の武器：★客のいつもの紙のまま出す★（問い合わせ扱いにしない）。
 *
 * ★守る決まり（全部 実測で決めた）★
 *
 * ① ★何も書かない時は、元のバイト列をそのまま返す★
 *    Exally の xlsx-edit.save() は、開くたび workbook.xml に fullCalcOnLoad="1" を足す。
 *    さらに zip の extraフィールド（Excelが書く詰め物）が落ちる。
 *    2026-08-11 実測: 10,523 → 8,668 バイト（−1,855）。
 *      内訳 = extraフィールド 1,832 ＋ workbook.xml の圧縮差 23
 *      中身は ★12部品中11本が完全一致・消えた0・増えた0★（欠けてはいない）
 *    それでも「開いて何も変えずに保存したのに別のファイル」は客が不安になる。
 *    ⇒ ★書く物が1つも無い時は save() を通さない★。これでバイト一致は自明になる。
 *
 * ② ★数式は数えて出す。読めなかったら「読めませんでした」と言う★
 *    数え方は ★本番の経路（zipのXMLを直接見る）★ を正とする。0 で埋めない。
 *
 * ③ ★書く場所は「見本の値が入っているセル」を当てる★
 *    2026-08-11 実測でここを3回 間違えた。「右が空ならそこ」にしていたため：
 *      請求書番号 → 空の E4（正しくは A-0001 が入っている F3）
 *      お支払期限 → 空の E8（正しくは 2026/10/31 が入っている F7）
 *      ご請求金額 → 空の B9（正しくは =E17 が入っている F9）
 *    ★客のテンプレは「見本の値」が入った状態で渡される★。
 *    その見本こそが入れる場所。空いているセルは、たいてい ただの余白。
 *
 * ④ ★当てた結果は必ず人に見せてから使う★
 *    「どのセルに入れるか」と「今そこに何が入っているか」を並べて出す。
 *    当てられなかった物は ★「当てられません」と言う（空欄にも 0 にもしない）★。
 *
 * 使い方:
 *   const r = await SeikyuBook.inspect(bytes);      // 読むだけ（1バイトも書かない）
 *   const plan = SeikyuBook.guessSlots(r);          // 書く場所の候補（人に見せる）
 *   const out = await SeikyuBook.fill(bytes, plan, values);   // 書いて出す
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../../lib/zip-surgeon.js'), require('../../lib/xlsx-edit.js'));
  } else {
    root.SeikyuBook = factory(root.ZipSurgeon, root.XlsxEdit);
  }
})(typeof self !== 'undefined' ? self : this, function (ZipSurgeon, XlsxEdit) {
  'use strict';
  if (!ZipSurgeon) throw new Error('lib/zip-surgeon.js を先に読んでください');
  if (!XlsxEdit) throw new Error('lib/xlsx-edit.js を先に読んでください');

  /* 上げてよい大きさ。これを超えたら断る（倉庫にも画面にも重すぎる） */
  var MAX_BYTES = 4 * 1024 * 1024;

  /* ★入れる物の種類★ 画面・紙・Excel で同じ言葉を使う（言い換えない）
     want = そこに入る物の形。当てる時の手がかりにする。 */
  var SLOTS = [
    { key: 'partnerName', label: '請求先の名前', want: 'text' },
    { key: 'issueYmd', label: '請求日', want: 'date' },
    { key: 'no', label: '請求番号', want: 'text' },
    { key: 'subject', label: '件名', want: 'text' },
    { key: 'dueYmd', label: 'お支払期限', want: 'date' },
    { key: 'subtotal', label: '小計', want: 'number' },
    { key: 'taxTotal', label: '消費税', want: 'number' },
    { key: 'grandTotal', label: 'ご請求金額', want: 'number' },
    { key: 'linesTop', label: '明細の1行目', want: 'text' },
  ];

  /* 当てる時に探す言葉。★うちの言い方だけでなく、よくある言い方も見る★
     （うちの実物は「正」ではなく1例。ここを狭くすると他社のテンプレで当たらない） */
  var HINTS = {
    partnerName: ['御中', '様', '請求先', '宛先', 'お客様名', '得意先'],
    issueYmd: ['請求日', '発行日', '発行年月日', '請求年月日', '日付'],
    no: ['請求書番号', '請求番号', '伝票番号', 'No.', 'ＮＯ', '番号'],
    subject: ['件名', '工事名', '案件名', '摘要'],
    dueYmd: ['支払期限', 'お支払期限', '支払期日', '振込期限', 'お支払日'],
    subtotal: ['小計', '税抜金額', '税抜合計'],
    taxTotal: ['消費税', '消費税額', '内消費税'],
    grandTotal: ['ご請求金額', '請求金額', '合計金額', 'お支払金額', '総額', '合計'],
    linesTop: ['品名', '品名・内容', '内容', '項目', '作業内容', '摘要'],
  };

  /* 「登録番号 T…」は請求番号ではない。取り違えると法定の欄が壊れる。 */
  var NOT_NO = /^T\d{13}$/;

  function colToNum(c) {
    var n = 0;
    for (var i = 0; i < c.length; i++) n = n * 26 + (c.charCodeAt(i) - 64);
    return n;
  }
  function numToCol(n) {
    var s = '';
    while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - 1 - m) / 26; }
    return s;
  }
  function splitAddr(a) {
    var m = /^([A-Z]+)(\d+)$/.exec(String(a || '').toUpperCase());
    return m ? { col: colToNum(m[1]), row: Number(m[2]) } : null;
  }
  function addrOf(col, row) { return numToCol(col) + row; }

  function looksDate(s) {
    var t = String(s == null ? '' : s).trim();
    return /^\d{4}[-/年]\s*\d{1,2}[-/月]\s*\d{1,2}日?$/.test(t) || /^\d{1,2}\/\d{1,2}$/.test(t);
  }

  /* ═══ 読む（★1バイトも書かない★） ═══ */

  /** 数式を数える。★本番の経路（zipのXML）を正とする★ */
  function countFormulasFromXml(zip, sheetParts) {
    var out = { total: 0, byKind: {}, perSheet: {}, unreadable: [] };
    var jobs = sheetParts.map(function (sp) {
      return zip.text(sp.part).then(function (xml) {
        var n = 0;
        var re = /<f[^>]*>([\s\S]*?)<\/f>|<f[^>]*\/>/g, m;
        while ((m = re.exec(xml))) {
          n++;
          var body = m[1] || '';
          var head = /^\s*([A-Z][A-Z0-9.]*)\s*\(/.exec(body);
          var kind = head ? head[1] : (body ? '参照・計算' : '共有された式');
          out.byKind[kind] = (out.byKind[kind] || 0) + 1;
        }
        out.perSheet[sp.name] = n;
        out.total += n;
      }, function (e) {
        // ★読めなかったを 0 にしない★
        out.unreadable.push({ sheet: sp.name, part: sp.part, why: (e && e.message) || '展開できません' });
        out.perSheet[sp.name] = null;
      });
    });
    return Promise.all(jobs).then(function () { return out; });
  }

  /** シートの一覧を workbook.xml と rels から引く（sheet1.xml が先頭とは限らない） */
  function sheetPartsOf(zip) {
    return zip.text('xl/workbook.xml').then(function (wbx) {
      return zip.text('xl/_rels/workbook.xml.rels').then(function (rels) {
        var out = [], re = /<sheet\b[^>]*\/>|<sheet\b[^>]*>/g, m;
        while ((m = re.exec(wbx))) {
          var tag = m[0];
          var name = (/name="([^"]*)"/.exec(tag) || [])[1];
          var rid = (/r:id="([^"]*)"/.exec(tag) || [])[1];
          if (!name || !rid) continue;
          var t = new RegExp('Id="' + rid + '"[^>]*Target="([^"]*)"').exec(rels)
            || new RegExp('Target="([^"]*)"[^>]*Id="' + rid + '"').exec(rels);
          var target = t ? t[1] : null;
          if (!target) continue;
          var part = target.charAt(0) === '/' ? target.slice(1) : ('xl/' + target.replace(/^\.\//, ''));
          out.push({ name: name, part: part });
        }
        return out;
      });
    });
  }

  /** 中身の入っているセルを全部 拾う（★空か・数か・数式か まで見る★） */
  function cellsOf(zip, part, sst) {
    return zip.text(part).then(function (xml) {
      var cells = [], re = /<c\b([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g, m;
      while ((m = re.exec(xml))) {
        var attr = m[1], body = m[3] || '';
        var addr = (/r="([A-Z]+\d+)"/.exec(attr) || [])[1];
        if (!addr) continue;
        var t = (/t="([^"]*)"/.exec(attr) || [])[1] || 'n';
        var v = (/<v>([\s\S]*?)<\/v>/.exec(body) || [])[1];
        var hasF = /<f[\s>/]/.test(body);
        var txt = null;
        if (t === 's' && v != null && sst) txt = sst[Number(v)] != null ? sst[Number(v)] : null;
        else if (t === 'inlineStr') txt = (/<t[^>]*>([\s\S]*?)<\/t>/.exec(body) || [])[1] || null;
        else if (t === 'str') txt = v != null ? v : null;
        else if (v != null) txt = v;
        var isNum = (t === 'n' || t === '') && v != null && v !== '';
        cells.push({
          addr: addr, text: txt == null ? '' : String(txt),
          isText: (t === 's' || t === 'inlineStr' || t === 'str'),
          isNum: isNum, hasF: hasF,
          /* ★空かどうかは「読める中身」で見る★
             共有文字列(t="s")の <v> に入っているのは ★文字ではなく番号★。
             そこを見ると、空文字のセルまで「中身あり」と数えてしまい、
             ただの余白が入れる場所の候補として競ってくる（2026-08-11 実測：
             空欄の E4 が 12点で、A-0001 が入っている F3 の 13点に並んだ）。 */
          empty: !hasF && (txt == null || String(txt).trim() === ''),
        });
      }
      return cells;
    }, function () { return []; });
  }

  function sstOf(zip) {
    if (!zip.has('xl/sharedStrings.xml')) return Promise.resolve([]);
    return zip.text('xl/sharedStrings.xml').then(function (xml) {
      var out = [], re = /<si>([\s\S]*?)<\/si>/g, m;
      while ((m = re.exec(xml))) {
        var inner = m[1], tre = /<t[^>]*>([\s\S]*?)<\/t>/g, tm, s = '';
        while ((tm = tre.exec(inner))) s += tm[1];
        out.push(s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
      }
      return out;
    }, function () { return []; });
  }

  /**
   * 上げられたブックを読む。★1バイトも書かない★
   * 戻り: { ok, kind, size, sheets, cells, formulas, unreadable, reason }
   */
  function inspect(bytes, opts) {
    var max = (opts && opts.maxBytes) || MAX_BYTES;
    var b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    if (!b.length) return Promise.resolve({ ok: false, reason: 'ファイルが空です' });
    if (b.length > max) {
      return Promise.resolve({
        ok: false,
        reason: 'ファイルが大きすぎます（' + Math.round(b.length / 1024) + 'KB／上限 ' + Math.round(max / 1024) + 'KB）',
      });
    }
    if (!(b[0] === 0x50 && b[1] === 0x4B)) {
      var old = (b[0] === 0xD0 && b[1] === 0xCF);
      return Promise.resolve({
        ok: false,
        reason: old ? '古い形式（.xls）は まだ使えません。Excel で「.xlsx」として保存し直してください。'
          : 'Excel のファイルとして読めませんでした',
      });
    }
    var zip;
    try { zip = ZipSurgeon.read(b); } catch (e) {
      return Promise.resolve({ ok: false, reason: 'ファイルが壊れているようです（' + ((e && e.message) || 'zip') + '）' });
    }
    var kind = XlsxEdit.kindOf(zip);
    if (kind === 'xlsb') {
      return Promise.resolve({ ok: false, kind: kind, reason: '.xlsb は まだ使えません。Excel で「.xlsx」として保存し直してください。' });
    }
    if (kind === 'unknown') {
      return Promise.resolve({ ok: false, kind: kind, reason: 'Excel のブックとして読めませんでした' });
    }

    return sheetPartsOf(zip).then(function (parts) {
      if (!parts.length) return { ok: false, kind: kind, reason: 'シートが1枚も見つかりませんでした' };
      return Promise.all([countFormulasFromXml(zip, parts), sstOf(zip)]).then(function (r) {
        var formulas = r[0], sst = r[1];
        return Promise.all(parts.map(function (p) {
          return cellsOf(zip, p.part, sst).then(function (cs) { return { name: p.name, part: p.part, cells: cs }; });
        })).then(function (sheets) {
          return {
            ok: true, kind: kind, size: b.length,
            sheets: sheets.map(function (s) {
              return { name: s.name, part: s.part, cellCount: s.cells.length };
            }),
            cells: sheets.reduce(function (a, s) { a[s.name] = s.cells; return a; }, {}),
            formulas: formulas,
            unreadable: formulas.unreadable,
          };
        });
      });
    }, function (e) {
      return { ok: false, kind: kind, reason: 'ブックの中を開けませんでした（' + ((e && e.message) || 'error') + '）' };
    });
  }

  /** 「数式 12本（SUM 1・TEXT 5・参照 6）」の1行。★読めなかったは隠さない★ */
  function formulaSummary(f) {
    if (!f) return '数式は数えられませんでした';
    var kinds = Object.keys(f.byKind).sort(function (a, b) { return f.byKind[b] - f.byKind[a]; });
    var head = '数式 ' + f.total + '本';
    if (kinds.length) head += '（' + kinds.map(function (k) { return k + ' ' + f.byKind[k]; }).join('・') + '）';
    if (f.unreadable && f.unreadable.length) {
      head += ' ／ ★読めなかったシート ' + f.unreadable.length + '枚：'
        + f.unreadable.map(function (u) { return u.sheet; }).join('・') + '★';
    }
    return head;
  }

  /* ═══ 書く場所を当てる ═══ */

  /** ラベルから見て、入れる先として ふさわしいか点を付ける */
  function scoreCandidate(cell, want) {
    if (!cell) return -1;                       // そのセルが無い＝候補にしない
    var s = 0;
    // ★見本の値が入っている＝ここが入れる場所★（空欄はたいてい ただの余白）
    if (!cell.empty) s += 10;
    if (want === 'number' && cell.isNum) s += 8;
    if (want === 'date' && (looksDate(cell.text) || cell.isNum)) s += 8;
    if (want === 'text' && cell.isText) s += 4;
    /* ★数式のセルは「入れる場所」ではない★
       そこに数字を書いても、Excel が開いて計算し直した瞬間に元の式の答えに戻る
       （＝画面と紙で額が食い違う）。合計は ★明細を入れて、その紙自身に計算させる★。
       候補からは外さず、★見つけた事だけ覚えておく★（人に「ここは自動計算です」と言うため）。 */
    if (cell.hasF) s -= 6;
    return s;
  }

  /**
   * 書く場所を当てる。
   * ★見つからない物は当てない（空欄を作らない・0を入れない）★
   * 戻りには ★今そこに何が入っているか（now）★ も付ける＝人が見て直せるように。
   */
  function guessSlots(info, sheetName) {
    if (!info || !info.ok) return { ok: false, reason: (info && info.reason) || '読めていません' };
    var name = sheetName || (info.sheets[0] && info.sheets[0].name);
    var cells = (info.cells && info.cells[name]) || [];
    var byAddr = {};
    cells.forEach(function (c) { byAddr[c.addr] = c; });
    var textCells = cells.filter(function (c) { return c.isText && c.text.trim() !== ''; });

    var found = {}, missing = [];
    SLOTS.forEach(function (slot) {
      var hints = HINTS[slot.key] || [];
      var best = null;
      var all = [];        // ★2位との差を見るため、候補を全部 覚えておく★

      for (var i = 0; i < textCells.length; i++) {
        var c = textCells[i], txt = c.text.replace(/\s+/g, '');
        var hit = null;
        for (var j = 0; j < hints.length; j++) if (txt.indexOf(hints[j]) >= 0) { hit = hints[j]; break; }
        if (!hit) continue;
        var at = splitAddr(c.addr); if (!at) continue;

        if (slot.key === 'partnerName') {
          // 「御中」はラベルではなく、宛名そのものが入っている事が多い
          var cand0 = { addr: c.addr, via: hit, mode: 'self', score: 20, now: c.text };
          if (!best || cand0.score > best.score) best = cand0;
          continue;
        }
        if (slot.key === 'linesTop') {
          // 見出しの1つ下＝明細の1行目（空でよい）
          var below0 = addrOf(at.col, at.row + 1);
          var cand1 = { addr: below0, via: hit, mode: 'below', score: 15, now: (byAddr[below0] && byAddr[below0].text) || '' };
          if (!best || cand1.score > best.score) best = cand1;
          continue;
        }

        /* ★同じ行を右へ数マス見て、いちばん「入れる場所らしい」セルを選ぶ★
           その次に、真下も見る（縦に並ぶテンプレもある）。 */
        var cands = [];
        for (var d = 1; d <= 4; d++) {
          var a = addrOf(at.col + d, at.row);
          cands.push({ addr: a, mode: 'right', cell: byAddr[a], near: d });
        }
        cands.push({ addr: addrOf(at.col, at.row + 1), mode: 'below', cell: byAddr[addrOf(at.col, at.row + 1)], near: 2 });

        for (var k = 0; k < cands.length; k++) {
          var cd = cands[k];
          var sc = scoreCandidate(cd.cell, slot.want);
          if (sc < 0) continue;
          // 「登録番号 T…」を請求番号として掴まない
          if (slot.key === 'no' && cd.cell && NOT_NO.test(String(cd.cell.text).trim())) continue;
          sc -= cd.near;                        // 近い方をわずかに優先
          var cand = { addr: cd.addr, via: hit, mode: cd.mode, score: sc, now: (cd.cell && cd.cell.text) || '' };
          all.push(cand);
          if (!best || cand.score > best.score) best = cand;
        }
      }

      /* ★見本も何も無い＝当てない★（空欄に書き込んで紙を崩さない） */
      if (best && best.score > 0) {
        var cellAt = byAddr[best.addr];
        // ★その紙が自分で計算する場所か★（式は残す・答えは埋める）
        best.computed = !!(cellAt && cellAt.hasF);

        /* ★同じ言葉が紙に2か所ある時は、機械で決めきらない★
           1位と2位の差が小さければ「ここでいいですか？」と人に確かめさせる。
           （客のテンプレは「合計」が見出しと明細の下の2か所にある事が多い） */
        var rivals = all.filter(function (c) { return c.addr !== best.addr; })
          .sort(function (a, b) { return b.score - a.score; });
        var second = rivals[0] || null;
        best.unsure = !!(second && (best.score - second.score) <= 2);
        best.others = rivals.slice(0, 3).map(function (c) {
          return { addr: c.addr, now: c.now, score: c.score, via: c.via };
        });
        found[slot.key] = best;
      } else missing.push(slot);
    });

    return {
      ok: true, sheet: name, slots: found,
      missing: missing.map(function (s) { return { key: s.key, label: s.label }; }),
      labelOf: labelOf,
    };
  }

  function labelOf(k) {
    for (var i = 0; i < SLOTS.length; i++) if (SLOTS[i].key === k) return SLOTS[i].label;
    return k;
  }

  /* ═══ 書く ═══ */

  /**
   * 値を入れて出す。
   * ★書く物が1つも無い時は save() を通さず、元のバイト列をそのまま返す★
   * 戻り: Promise<{ bytes, wrote, untouched, log }>
   */
  /* ★xlsx-edit に渡す形は { v, t }★（生の値を渡すと Number(文字)=NaN が書かれる。
     2026-08-11 実測: 客のテンプレ13か所すべてに <v>NaN</v> が入った）
     文字は t:'s'（共有文字列へ）、数は t を付けない。 */
  function specOf(v) {
    if (typeof v === 'number' && Number.isFinite(v)) return { v: v };
    var n = Number(v);
    if (v !== '' && v !== null && v !== undefined && !Array.isArray(v) && Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(String(v).trim())) {
      return { v: n };
    }
    return { v: String(v), t: 's' };
  }

  function fill(bytes, plan, values, lineCellMap, srcInfo) {
    var src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    var cells = {}, wrote = [], skipped = [], recalcAt = [], stale = [], lost = 0, beforeLen = 0;
    /* 明細（当てた列に並べた物）を先に入れる */
    if (lineCellMap) {
      Object.keys(lineCellMap).forEach(function (addr) {
        cells[addr] = specOf(lineCellMap[addr]);
        wrote.push({ key: '明細', addr: addr, value: lineCellMap[addr] });
      });
    }
    if (plan && plan.ok && plan.slots) {
      Object.keys(plan.slots).forEach(function (key) {
        if (!values || values[key] === undefined || values[key] === null || values[key] === '') return;
        var slot = plan.slots[key];
        /* ★その紙が自分で計算する場所には書かない★
           書いても、Excel が計算し直した瞬間に元の式の答えに戻る＝紙と画面で額が食い違う。
           （2026-08-11：合計が =E15+E16 のテンプレで、ここに書こうとしていた） */
        /* ★数式のマスには書かない★（うちの決まり・2026-08-09 飲み屋が実物で確定）
           答えだけ書き換えても、Excel が開いた時に計算し直して元の式の答えに戻る＝嘘になる。
           合計は ★明細を入れて、その紙自身に計算させる★。
           そのかわり ★どこを書かなかったか★ は必ず人に伝える（黙って空にしない）。
           古い答えが残ったマスは stale で数えて出す（fullCalcOnLoad は xlsx-edit が立てる）。 */
        if (slot.computed) { skipped.push({ key: key, addr: slot.addr, label: labelOf(key), why: 'この紙が自分で計算します（数式）' }); return; }
        cells[slot.addr] = specOf(values[key]);
        wrote.push({ key: key, addr: slot.addr, value: values[key] });
      });
    }
    if (!wrote.length) {
      // ★1つも書かない＝元のまま返す（バイト一致）★
      return Promise.resolve({ ok: true, bytes: src, wrote: [], skipped: skipped, recalcAt: recalcAt, stale: [], untouched: true, log: null, bad: [] });
    }
    /* ★入れる先のマスが元のファイルに在るか、先に確かめる★
       xlsx-edit は「無いマスは作らずに断る」（壊すより断る＝正しい）。
       確かめずに渡すと ★例外がそのまま外へ出て、画面が無反応になる★
       （2026-08-11 実測: tpl-invoice.xlsx の D10 で発生）。
       ここで先に見つけて、★人に読める言葉で断る★。 */
    var have = {};
    ((srcInfo && srcInfo.cells && srcInfo.cells[plan.sheet]) || []).forEach(function (c) { have[c.addr] = true; beforeLen++; });
    var noCell = Object.keys(cells).filter(function (a) { return !have[a]; });
    if (noCell.length) {
      return Promise.resolve({
        ok: false, bytes: null, wrote: wrote, skipped: skipped, recalcAt: recalcAt, stale: [],
        untouched: true, log: null, bad: noCell.map(function (a) { return { addr: a, want: '', got: '', why: 'このマスが元のファイルにありません' }; }),
        reason: 'このテンプレには 入れる先のマスが無い所があります（' + noCell.slice(0, 6).join('・')
          + (noCell.length > 6 ? ' ほか' + (noCell.length - 6) + 'か所' : '') + '）。'
          + '元のファイルは変えていません。Excel でその欄に一度 何か入力して保存し直すと入れられます。',
      });
    }

    return XlsxEdit.open(src).then(function (book) {
      return XlsxEdit.setValues(book, plan.sheet, cells).then(function () {
        return XlsxEdit.save(book);
      });
    }).catch(function (e) {
      // ★何があっても例外を外へ出さない（画面が無反応にならない）★
      return Promise.reject({ __seikyu: true, message: (e && e.message) || 'このExcelには書き込めませんでした' });
    }).then(function (out) {
      var bytes = out.bytes || out;
      /* ★書いた物を、出来上がったファイルから読み返して確かめる★
         2026-08-11 実測: 文字を t="str" で持つブックに書くと <v>NaN</v> が入った。
         それでも「保存しました」と出てしまう＝★壊れた請求書を客に渡す★。
         書いた物と読み返した物が違ったら、★ファイルを渡さずに断る★（壊すより断る）。 */
      return inspect(bytes).then(function (after) {
        var beforeCells = (srcInfo && srcInfo.cells && srcInfo.cells[plan.sheet]) || null;
        var afterCells = (after.ok && after.cells && after.cells[plan.sheet]) || null;
        stale = (beforeCells && afterCells) ? staleFormulas(beforeCells, afterCells) : [];

        /* ★セルが1個でも減っていたら渡さない★（罠①＝飲み屋が実物で踏んだ物）
           空のマスは <c r="A10" s="5"/> と自己完結タグで書かれる。
           書き換えの切り出しが欲張ると、そこに書いた時に ★隣のマスまで飲み込む★。
           「行が読めた」では足りない。★行の中のマスを数える★（148→148 を見る）。 */
        if (beforeCells && afterCells && afterCells.length < beforeCells.length) {
          lost = beforeCells.length - afterCells.length;
        }
        return verify(bytes, plan.sheet, wrote);
      }).then(function (bad) {
        if (lost > 0) {
          bad = bad.concat([{
            addr: '(シート全体)', want: beforeLen + 'マス', got: (beforeLen - lost) + 'マス',
            why: '★書き換えでマスが ' + lost + '個 消えました（空のマスを飲み込んでいます）★',
          }]);
        }
        if (bad.length) {
          return {
            ok: false, bytes: null, wrote: wrote, skipped: skipped, recalcAt: recalcAt, stale: stale, untouched: false,
            log: out.log || null, bad: bad,
            reason: 'このExcelには うまく書き込めませんでした（' + bad.length + 'か所）。'
              + '元のファイルは変えていません。Excel で開いて「.xlsx」として保存し直すと直る事があります。',
          };
        }
        return { ok: true, bytes: bytes, wrote: wrote, skipped: skipped, recalcAt: recalcAt, stale: stale, untouched: false, log: out.log || null, bad: [] };
      });
    }, function (e) {
      return {
        ok: false, bytes: null, wrote: wrote, skipped: skipped, recalcAt: recalcAt, stale: [],
        untouched: true, log: null, bad: [],
        reason: (e && e.message) || 'このExcelには書き込めませんでした（元のファイルは変えていません）',
      };
    });
  }

  /* ═══ 明細の列を当てる ═══
     見出しの行（品名・数量・単価…）から、どの列に何を入れるかを決める。
     ★見つからない列には書かない★（勝手に隣へ寄せると紙が崩れる）。 */
  var LINE_HINTS = {
    name: ['品名', '内容', '項目', '作業内容', '摘要', '品目'],
    qty: ['数量', '員数', '数'],
    unit: ['単位'],
    price: ['単価', '金額単価'],
    amount: ['金額', '小計'],
    memo: ['備考', '摘要欄'],
  };

  /** 明細の見出し行から、列の割り当てを作る */
  function guessLineCols(info, plan) {
    if (!plan || !plan.ok || !plan.slots.linesTop) return { ok: false, reason: '明細の場所が当てられていません' };
    var top = splitAddr(plan.slots.linesTop.addr);
    if (!top) return { ok: false, reason: '明細の場所が読めません' };
    var headRow = top.row - 1;                 // 見出しは1行上
    var cells = (info.cells && info.cells[plan.sheet]) || [];
    var cols = {}, used = {};
    cells.forEach(function (c) {
      var at = splitAddr(c.addr);
      if (!at || at.row !== headRow || !c.isText) return;
      var txt = c.text.replace(/\s+/g, '');
      Object.keys(LINE_HINTS).forEach(function (key) {
        if (cols[key] || used[at.col]) return;
        for (var i = 0; i < LINE_HINTS[key].length; i++) {
          if (txt.indexOf(LINE_HINTS[key][i]) >= 0) { cols[key] = at.col; used[at.col] = key; return; }
        }
      });
    });
    /* 何行ぶん書けるか＝見出しの下から、合計などの「文字の行」に当たるまで */
    var maxRow = top.row;
    for (var r = top.row; r < top.row + 200; r++) {
      var blocked = false;
      for (var i = 0; i < cells.length; i++) {
        var at2 = splitAddr(cells[i].addr);
        if (at2 && at2.row === r && cells[i].isText && cells[i].text.trim() !== '') { blocked = true; break; }
      }
      if (blocked) break;
      maxRow = r;
    }
    return {
      ok: !!cols.name, reason: cols.name ? '' : '明細の「品名」の列が見つかりませんでした',
      cols: cols, topRow: top.row, maxRow: maxRow, rows: Math.max(0, maxRow - top.row + 1),
    };
  }

  /** 明細の行を、当てた列に並べる（★入らなかったぶんは黙って捨てない★） */
  function lineCells(lineCols, lines, computed) {
    var out = {}, over = 0, recalcCols = {};
    if (!lineCols || !lineCols.ok) return { cells: out, over: (lines || []).length, wrote: 0 };
    var n = 0;
    (lines || []).forEach(function (ln, i) {
      var row = lineCols.topRow + i;
      if (row > lineCols.maxRow) { over++; return; }     // ★入りきらない＝数えて出す★
      Object.keys(lineCols.cols).forEach(function (key) {
        var v = ln[key];
        if (v === undefined || v === null || v === '') return;
        var addr = addrOf(lineCols.cols[key], row);
        /* ★その列がその紙で計算されているなら書かない★
           （金額＝数量×単価 のテンプレは多い。書くと再計算で戻り、額が食い違う） */
        if (computed && computed[addr]) { recalcCols[key] = true; return; }   // ★数式の列には書かない★
        out[addr] = v;
      });
      n++;
    });
    return { cells: out, over: over, wrote: n, recalcCols: Object.keys(recalcCols) };
  }

  /**
   * ★古い答えが残っている数式セルを数える★
   * 式は残るが <v> が古いままだと、Excel以外（Google/Numbers/メールのプレビュー/PDF変換）で
   * ★その数字だけ元のまま見える★。0 になるとは限らないので「変わっていない」で見る。
   * before = 入れる前のセル、after = 出来上がったブックのセル。
   */
  function staleFormulas(before, after) {
    var b = {}, out = [];
    (before || []).forEach(function (c) { b[c.addr] = c; });
    (after || []).forEach(function (c) {
      if (!c.hasF) return;
      var was = b[c.addr];
      if (!was) return;
      if (String(was.text) === String(c.text)) out.push({ addr: c.addr, now: c.text });
    });
    return out;
  }

  /** 出来上がったファイルを読み返して、書いた物がそのまま入っているか確かめる */
  function verify(bytes, sheetName, wrote) {
    if (!wrote.length) return Promise.resolve([]);
    return inspect(bytes).then(function (r) {
      if (!r.ok) return [{ addr: '(全体)', want: '', got: '', why: r.reason }];
      var cells = (r.cells && r.cells[sheetName]) || [];
      var byAddr = {};
      cells.forEach(function (c) { byAddr[c.addr] = c; });
      var bad = [];
      wrote.forEach(function (w) {
        var c = byAddr[w.addr];
        var got = c ? String(c.text) : '';
        var want = String(w.value);
        if (!c) { bad.push({ addr: w.addr, want: want, got: '（セルが無い）', why: 'セルが消えた' }); return; }
        if (/^NaN$/i.test(got)) { bad.push({ addr: w.addr, want: want, got: got, why: '数として書かれた（文字の入れ方に対応していないブック）' }); return; }
        if (got !== want && Number(got) !== Number(want)) {
          bad.push({ addr: w.addr, want: want, got: got, why: '書いた物と違う' });
        }
      });
      return bad;
    }, function (e) {
      return [{ addr: '(全体)', want: '', got: '', why: '読み返せませんでした（' + ((e && e.message) || 'error') + '）' }];
    });
  }

  /* ═══ どのテンプレの どの版で刷ったか ═══
     ★控えに残すのは「名前＋中身のSHA」だけ★（テンプレそのものは入れない＝倉庫が太る）。
     こうしておくと ★テンプレを差し替えても、過去に出した紙が何で出たか分かる★。
     置き場所は  <auth.uid()>/<取引先id または _default>/<ファイル名>  の形。 */
  function pathFor(uid, partnerId, fileName) {
    var who = partnerId ? String(partnerId) : '_default';
    var name = String(fileName || 'template.xlsx').replace(/[\/:*?"<>|]/g, '_');
    return String(uid) + '/' + who + '/' + name;
  }

  /** 中身のSHA-256（頭16文字）。同じ中身なら同じ・1バイト違えば変わる */
  function sha256Of(bytes) {
    var b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    var subtle = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle : null;
    if (!subtle) return Promise.resolve(null);          // ★取れない時は null（0や空にしない）★
    return subtle.digest('SHA-256', b).then(function (buf) {
      var v = new Uint8Array(buf), s = '';
      for (var i = 0; i < v.length; i++) s += ('0' + v[i].toString(16)).slice(-2);
      return s.slice(0, 16);
    }, function () { return null; });
  }

  /** 控えに残す形（★中身は入れない★） */
  function stampOf(o) {
    return {
      fileName: (o && o.fileName) || '',
      sha: (o && o.sha) || null,          // ★取れなければ null（「取れなかった」と分かる）
      partnerId: (o && o.partnerId) || '',
      sheet: (o && o.sheet) || '',
      at: (o && o.at) || '',
    };
  }

  /* ═══ 下見（入れる場所を指で選ぶための表） ═══
     ★見た目を再現する物ではない★（罫線・判子・グラフは出さない）。
     ★新しい道具を入れない★＝もう読んである info.cells だけで作る。
       ・SheetJS で作り直さない（罫線・判子・グラフが全滅する道。うちで実証済み）
       ・Exally の book.html を持ってこない（相手の持ち物・重い）
     ★空のマスも押せる★（客のテンプレの空欄こそ入れたい所）。 */
  function previewGrid(info, sheetName, opts) {
    if (!info || !info.ok) return { ok: false, reason: (info && info.reason) || '読めていません' };
    var name = sheetName || (info.sheets[0] && info.sheets[0].name);
    var cells = (info.cells && info.cells[name]) || [];
    var maxCols = (opts && opts.maxCols) || 12;
    var maxRows = (opts && opts.maxRows) || 60;

    var byAddr = {}, lastCol = 1, lastRow = 1;
    cells.forEach(function (c) {
      var at = splitAddr(c.addr); if (!at) return;
      byAddr[c.addr] = c;
      if (at.col > lastCol) lastCol = at.col;
      if (at.row > lastRow) lastRow = at.row;
    });
    // ★使っている範囲だけ★（1000列の空表を描かない）
    var cols = Math.min(lastCol, maxCols);
    var rows = Math.min(lastRow, maxRows);

    var head = [''];                       // 左上は行番号の見出し
    for (var c = 1; c <= cols; c++) head.push(numToCol(c));

    var body = [];
    for (var r = 1; r <= rows; r++) {
      var line = { row: r, cells: [] };
      for (var c2 = 1; c2 <= cols; c2++) {
        var addr = addrOf(c2, r);
        var cell = byAddr[addr];
        line.cells.push({
          addr: addr,
          text: cell ? String(cell.text) : '',
          hasF: !!(cell && cell.hasF),
          isNum: !!(cell && cell.isNum),
          exists: !!cell,                  // ★元のファイルにマスが在るか（無い所には書けない）★
        });
      }
      body.push(line);
    }
    return {
      ok: true, sheet: name, head: head, rows: body,
      cols: cols, rowCount: rows,
      truncated: (lastCol > cols || lastRow > rows),
      lastAddr: addrOf(lastCol, lastRow),
    };
  }

  return {
    MAX_BYTES: MAX_BYTES, SLOTS: SLOTS, HINTS: HINTS, LINE_HINTS: LINE_HINTS,
    pathFor: pathFor, sha256Of: sha256Of, stampOf: stampOf, previewGrid: previewGrid,
    verify: verify, staleFormulas: staleFormulas,
    guessLineCols: guessLineCols, lineCells: lineCells,
    inspect: inspect, guessSlots: guessSlots, fill: fill,
    formulaSummary: formulaSummary, labelOf: labelOf, looksDate: looksDate,
    colToNum: colToNum, numToCol: numToCol, splitAddr: splitAddr, addrOf: addrOf,
  };
});
