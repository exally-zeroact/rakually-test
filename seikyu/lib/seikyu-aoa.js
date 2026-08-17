/* seikyu-aoa.js — ★Excelに出す時の中身（行と列の並び・列幅）を作る唯一の場所★
 * ==============================================================================
 * ここは ★表の中身を作るだけ★。SheetJS も Blob も触らない（＝素のNodeで全部測れる）。
 * 実際に .xlsx を組むのは seikyu/js/seikyu-xlsx.js。
 *
 * ★渡した相手の画面で ######## にしない★
 *   日付や金額の列に幅を付けずに出すと、相手のExcelで列が狭く ######## になる（既知の前科）。
 *   だから列幅(cols)をここで必ず返す。
 *
 * ★数は数のまま出す★
 *   金額を "1,234円" のような文字で出すと、相手が足し算できない＝Excelで渡す意味が消える。
 *   桁区切りは書式(z)で付ける。
 *
 * ★税率の数字を1つも書かない★（区分は totals.byRate をそのまま並べる）
 *
 * 【利用】ブラウザ window.SeikyuAoa ／ Node require('./seikyu-aoa.js')
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./seikyu-cols.js'), require('./seikyu-carry.js'), require('./seikyu-doc.js'), require('./seikyu-paper.js'));
  else root.SeikyuAoa = factory(root.SeikyuCols, root.SeikyuCarry, root.SeikyuDoc, root.SeikyuPaper);
})(typeof self !== 'undefined' ? self : this, function (COLS, CARRY, DOC, PAPER) {
  'use strict';
  if (!COLS) throw new Error('seikyu-cols.js を先に読んでください');
  /* ★振込先の分け方は紙と同じ物を使う★（seikyu-paper.js の bankLines） */
  if (!PAPER) throw new Error('seikyu-paper.js を先に読んでください');

  var YEN_FMT = '#,##0';        // 金額（桁区切り・小数なし）
  var NUM_FMT = '#,##0.###';    // 数量（0.5 のような端数も出す）

  function jpDate(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
    if (!m) return '';
    return +m[1] + '年' + (+m[2]) + '月' + (+m[3]) + '日';
  }
  function honorOf(p) {
    var h = (p && (p.honor || p.keisho)) || '';
    if (!h || h === '（なし）' || h === '(なし)' || h === 'なし') return '';
    return h;
  }

  /**
   * build({ inv, tax, partner, org }) → { aoa, cols, numFmt, name }
   *   aoa    … 行の配列（値は数のまま）
   *   cols   … 列幅（[{wch:…}]）★これが無いと相手の画面で ######## になる★
   *   numFmt … [{r,c,z}] 数の書式（桁区切り）。呼ぶ側がセルに当てる
   *   name   … シート名
   */
  function build(o) {
    o = o || {};
    var inv = o.inv || {};
    var tax = o.tax || {};
    var p = o.partner || {};
    var g = o.org || {};
    var isQuote = (inv.doc_type === 'quote');
    var heading = isQuote ? '見積書' : '請求書';

    var aoa = [];
    var numFmt = [];
    function push(row) { aoa.push(row); return aoa.length - 1; }
    function money(r, c) { numFmt.push({ r: r, c: c, z: YEN_FMT }); }
    function qty(r, c) { numFmt.push({ r: r, c: c, z: NUM_FMT }); }

    push([heading]);
    push([]);
    push(['No.', inv.no || '（未採番）']);
    push([(isQuote ? '見積日' : '請求日'), jpDate(inv.issue_ymd) || '（未入力）']);
    if (inv.due_ymd) push(['お支払期限', jpDate(inv.due_ymd)]);
    push([]);
    push(['宛先', (p.name || '（取引先が未選択）') + (honorOf(p) ? ' ' + honorOf(p) : '')]);
    if (p.addr) push(['', p.addr]);
    push(['自社', g.yago || '（自社情報が未入力）']);
    if (g.addr) push(['', g.addr]);
    if (g.tel) push(['', 'TEL ' + g.tel]);
    if (g.invoiceNo) push(['', '登録番号 ' + g.invoiceNo]);
    push([]);
    var gr = push([(isQuote ? '御見積金額（税込）' : '御請求金額（税込）'), Number(tax.grandTotal) || 0]);
    money(gr, 1);
    if (inv.data && inv.data.subject) push(['件名', inv.data.subject]);
    push([]);

    /* ★列は会社が決めた並び（items）どおりに出す★ 紙とExcelで並びが違うと突き合わせできない。 */
    var spec = COLS.normalizeSpec((o.cols && o.cols.items && o.cols.items.length) ? o.cols : {
      items: ['#', '品名・内容', '数量', '単位', '単価', '金額', '税率'],
      widths: { '#': 28, '品名・内容': 220, '数量': 56, '単位': 44, '単価': 80, '金額': 100, '税率': 56 },
      aligns: {},
    });
    if (COLS.validate(spec.items).length) {
      spec = COLS.normalizeSpec({ items: ['#', '品名・内容', '数量', '単位', '単価', '金額', '税率'] });
    }
    var items = spec.items;

    push(items.slice());
    var lines = Array.isArray(tax.lines) ? tax.lines : [];
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      var row = [];
      var fmts = [];
      for (var c = 0; c < items.length; c++) {
        var cell = COLS.cellOf(ln, items[c], i);
        if (cell.text === '') { row.push(''); continue; }
        if (cell.kind === 'money') { row.push(Number(cell.text)); fmts.push([c, 'money']); continue; }
        if (cell.kind === 'num') {
          var n = Number(cell.text);
          if (Number.isFinite(n)) { row.push(n); fmts.push([c, 'qty']); continue; }
        }
        row.push(cell.text);
      }
      var r = push(row);
      for (var f = 0; f < fmts.length; f++) {
        if (fmts[f][1] === 'money') money(r, fmts[f][0]); else qty(r, fmts[f][0]);
      }
    }
    if (!lines.length) { var e0 = items.map(function () { return ''; }); e0[Math.min(1, e0.length - 1)] = '明細がまだ1行もありません'; push(e0); }

    /* 合計は「金額の列」に揃えて出す（無ければ右端） */
    var amtCol = items.findIndex ? items.findIndex(function (k) { return COLS.roleOf(k) === 'amount'; }) : -1;
    if (amtCol < 0) amtCol = items.length - 1;
    var labCol = Math.max(0, amtCol - 1);
    function sumRow(label, v) {
      var row = items.map(function () { return ''; });
      row[labCol] = label; row[amtCol] = Number(v) || 0;
      var r = push(row); money(r, amtCol);
    }
    push([]);
    sumRow('小計', tax.subtotal);
    sumRow('消費税', tax.taxTotal);
    sumRow('合計', tax.grandTotal);

    /* ★源泉徴収は Excel にも出す★
       紙にだけ出して Excel に出さないと、Excel で数えた人だけ違う額を振り込む。 */
    var gen = o.gensen || null;
    var carry = o.carry || null;
    if (gen && gen.on) {
      sumRow(gen.label, -Math.abs(Number(gen.amount) || 0));
      /* ★差引は「合計請求額（繰越こみ）− 源泉」★ 順番は seikyu-doc.js が唯一の正。
         紙と Excel で別々に足し引きすると、必ずどちらかが間違う。 */
      var pay = DOC.payableOf(tax, carry, gen);
      if (pay === null) {
        var rp = items.map(function () { return ''; });
        rp[labCol] = gen.netLabel; rp[amtCol] = '（未確認）';   // ★0を作らない★
        push(rp);
      } else {
        sumRow(gen.netLabel, pay);
      }
    }

    /* ★繰越も同じ★ 読めていない所は ★0にせず「（未確認）」と字で置く★ */
    if (carry && carry.state === 'first') {
      sumRow('', '');
      var rf = push((function () { var r = items.map(function () { return ''; }); r[labCol] = carry.label || '前回の請求はありません'; return r; })());
      if (rf) { /* 文字なので金額の書式は付けない */ }
    } else if (carry) {
      CARRY.ROWS.forEach(function (r) {
        if (r.key === 'thisTotal') return;                 // 上の「合計」と同じ
        var val = carry[r.key];
        if (val === null || val === undefined) {
          var row = items.map(function () { return ''; });
          row[labCol] = r.label; row[amtCol] = '（未確認）';   // ★0を作らない★
          push(row);
          return;
        }
        sumRow(r.label, val);
      });
      if (carry.label) {
        var rn = items.map(function () { return ''; });
        rn[labCol] = carry.label + (carry.prevNo ? '（前回 No. ' + carry.prevNo + '）' : '');
        push(rn);
      }
    }

    push([]);
    push(['区分', '対象額', '消費税']);
    var byRate = Array.isArray(tax.byRate) ? tax.byRate : [];
    for (var k = 0; k < byRate.length; k++) {
      var b = byRate[k];
      var rr = push([Number(b.pct) + '% 対象', Number(b.base) || 0, Number(b.tax) || 0]);
      money(rr, 1); money(rr, 2);
    }
    // ★非課税と対象外は別の行（同じ0%でも意味が違う）
    var nt = (tax.nontaxable && Number(tax.nontaxable.base)) || 0;
    if (nt !== 0) { var rn2 = push(['非課税', nt, '']); money(rn2, 1); }
    var ex = (tax.exempt && Number(tax.exempt.base)) || 0;
    if (ex !== 0) { var re = push(['消費税の対象外', ex, '']); money(re, 1); }
    if (!byRate.length && ex === 0 && nt === 0) push(['区分はまだありません', '', '']);

    /* ★振込先の分け方は 紙と同じ物を呼ぶ★（司さん 2026-08-16「全共通にしとんか？」）
       ＝1行目 銀行/支店/種別/口座番号、★2行目 名義★。
       Excel でも同じ形にする（紙だけ直すと、Excel を見た人には違う紙に見える）。 */
    if (g.bank) {
      push([]);
      var bl = PAPER.bankLines(g.bank);
      bl.forEach(function (line, i) { push([i === 0 ? 'お振込先' : '', line]); });
    }
    if (inv.data && inv.data.memo) { push([]); push(['備考', inv.data.memo]); }

    /* ★列幅★ 会社が決めた幅(pt)から Excel の文字幅(wch)に直す。
       ★これが無いと相手の画面で ######## になる★（列を足しても必ず幅を付ける）。 */
    var cols = items.map(function (k) {
      var w = Number((spec.widths || {})[k]);
      if (!Number.isFinite(w)) w = COLS.BASE_W[k] || 80;
      w = COLS.clampWidth(w);
      return { wch: Math.max(6, Math.min(60, Math.round(w / 5.5))) };
    });

    return { aoa: aoa, cols: cols, numFmt: numFmt, name: heading, YEN_FMT: YEN_FMT, NUM_FMT: NUM_FMT };
  }

  return { build: build, YEN_FMT: YEN_FMT, NUM_FMT: NUM_FMT, jpDate: jpDate, honorOf: honorOf };
});
