/* seikyu-pdf-bridge.js — ★動いているPDFの道具に Rakunally の中身を 渡すだけ★
 * =============================================================================
 * ★司さん 2026-08-30「成功してるアプリを真似て 同じ形式でやれや／毎アプリ同じことを繰り返してるやろ」★
 *
 * ★やった事★
 *   代行請求書アプリ（司さんが毎日使っている・本番で回っている）の `invoice-pdf.js` を
 *   ★1文字も変えずに★ 借りた（`seikyu/lib/invoice-pdf.js`）。
 *   ★書き直さない★＝直したくなったら 元（代行）を直して また借りる。
 *   見張り＝`seikyu/tests/invoice-pdf-borrow.test.mjs`（★元と1バイトずつ 突き合わせる★）。
 *
 * ★なぜ 借りるのか（作り直さないのか）★
 *   ・代行のコードに 理由が書いてある：
 *     「iOS Safari の window.print() は ★ページ最下部に URL＋日付を 勝手に付ける★
 *       （ブラウザの仕様で CSS では消せない）。自前で PDF を組めば その足跡が出ない」
 *   ・字も ★BIZ UDPGothic を 全字形13,932字 埋め込み★＝★異体字（髙﨑邉）や ㈱№℡㊞ も出る★。
 *     端末のフォント任せ（今までの印刷）だと ★客の端末で 化ける★。
 *   ・★同じ物を もう一度 書けば、直す所が 2つになる★（毎アプリ 同じ事を 繰り返す＝司さんの指摘）。
 *
 * ★この紙（bridge）の仕事は 1つだけ★
 *   Rakunally の形（org / partner / inv / lines / cols）を
 *   代行の道具が 欲しがる形（master / co / rows / iss / month）へ ★並べ替える★。
 *   ★計算は 1つもしない★（合計も 税も seikyu-tax.js が 出した物を そのまま渡す）。
 *
 * 【利用】ブラウザ window.SeikyuPdfBridge ／ Node require('./seikyu-pdf-bridge.js')
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SeikyuPdfBridge = api;
  else if (typeof globalThis !== 'undefined') globalThis.SeikyuPdfBridge = api;
})(this, function () {
  'use strict';

  function s(v) { return String(v == null ? '' : v).trim(); }
  function num(v) {
    var n = Number(String(v == null ? '' : v).replace(/[, ]/g, ''));
    return isFinite(n) ? n : 0;
  }

  /* ★代行の紙が 必ず持っている列★（道具の中で 金額の位置を 名前で探している）
     ＝ここを 変えると 道具の中を 直す事になる＝★変えない★。 */
  var AMOUNT_COL = '金額';

  /**
   * Rakunally の1通 → 代行の道具の入口（buildOne の引数）
   * @param {object} a { inv, lines, tax, partner, org, cols }
   * @return {{master:object, co:string, rows:Array, month:string, iss:object, invoiceNo:string}}
   */
  function toDaikou(a) {
    var o = a || {};
    var inv = o.inv || {}, partner = o.partner || {}, org = o.org || {};
    var lines = o.lines || inv.lines || [];
    var tax = o.tax || {};

    /* ── 会社（あて先）＝道具は「会社名を キーにした 束」で 持つ ── */
    var co = s(partner.name) || '（取引先が未選択）';

    /* ── 列 ──
       Rakunally の列（seikyu-cols の items）を そのまま 使う。
       ★金額の列が 無い時だけ 足す★（道具が 金額を 名前で探す為）。 */
    var items = (o.cols && o.cols.items && o.cols.items.length)
      ? o.cols.items.slice()
      : ['品名・内容', '数量', '単価', AMOUNT_COL];
    if (items.indexOf(AMOUNT_COL) < 0) items = items.concat([AMOUNT_COL]);
    /* ★「#」は 道具側が 行番号を 自分で振る★ので 渡さない（二重に出る） */
    items = items.filter(function (k) { return k !== '#'; });

    var widths = (o.cols && o.cols.widths) ? o.cols.widths : {};
    var master = {};
    master[co] = {
      items: items, widths: widths,
      /* ★期限は 道具が そのまま刷る★＝先に 紙の形（2026/11/30）に しておく
         （ISOのまま渡すと 紙の中で 1か所だけ 別の書き方になる） */
      paymentDue: slash(inv.due_ymd),
      /* ★代行の固定の文言を そのまま出さない★（うちの紙では ない）
         道具は 会社ごとに 差し替えられる口を 持っている＝そこを 使う。 */
      lead: s(inv.data && inv.data.lead) || '下記の通り 御請求申し上げます。',
      tableTitle: s(o.tableTitle) || '明細',
    };

    /* ── 明細 ──
       道具は ★列の名前を そのまま キーにした物★を1行ずつ 読む。
       ★数は 1つも 作らない★＝入っている物を 文字にして 渡すだけ。 */
    var rows = lines.map(function (ln) {
      var r = {};
      items.forEach(function (k) {
        if (k === AMOUNT_COL) { r[k] = amountOf(ln); return; }
        r[k] = valueOf(ln, k);
      });
      return r;
    });

    /* ── 自社（発行者）── */
    var iss = {
      name: s(org.yago) || s(org.name),
      address: s(org.addr),
      tel: s(org.tel),
      registrationNo: s(org.invoiceNo),
      bank: bankLines(org.bank),
      paymentDue: slash(inv.due_ymd),
      logo: org.logoDataUrl || null,
      hanko: org.sealDataUrl || null,
      logoMode: org.logoDataUrl ? 'show' : 'hide',
      /* ★見た目は 代行の既定（エレガント）に そろえる★＝真似る、が 今回の指示 */
      pdfDesign: s(org.pdfDesign) || 'elegant',
      pdfFont: s(org.pdfFont) || 'BIZ UDPゴシック',
      /* ★合計は こちらが 出した物を そのまま★（道具に 数え直させない） */
      totals: {
        subtotal: num(tax.subtotal), tax: num(tax.taxTotal), grand: num(tax.grandTotal),
      },
    };

    var month = s(inv.issue_ymd).slice(0, 7) || '';
    return { master: master, co: co, rows: rows, month: month, iss: iss, invoiceNo: s(inv.no) };
  }

  /** 1行の「その列の中身」（会社が足した列も 落とさない） */
  function valueOf(ln, key) {
    var l = ln || {};
    var ex = l.extra || {};
    if (Object.prototype.hasOwnProperty.call(ex, key)) return s(ex[key]);
    switch (key) {
      case '品名・内容': case '品名': case '内容': return s(l.name);
      case '数量': return s(l.qty);
      case '単位': return s(l.unit);
      case '単価': return s(l.price);
      case '摘要': case '備考': return s(l.memo);
      case '消費税': return '';                 // ★税は 合計で 出す（行ごとに 割らない）
      default: return '';
    }
  }

  /** 行の金額（★入っている物だけ★。無い時は 空＝0円と 書かない） */
  function amountOf(ln) {
    var l = ln || {};
    if (l.amount !== undefined && l.amount !== null && l.amount !== '') return num(l.amount);
    if (l.qty !== undefined && l.qty !== '' && l.price !== undefined && l.price !== '') {
      return num(l.qty) * num(l.price);
    }
    return '';
  }

  /** '2026-11-30' → '2026/11/30'（★紙の中で 書き方を 1つにする★） */
  function slash(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s(ymd));
    return m ? (m[1] + '/' + (+m[2]) + '/' + (+m[3])) : s(ymd);
  }

  /** 振込先（1行の文字 → 道具が欲しがる 行の並び） */
  function bankLines(bank) {
    var t = s(bank);
    if (!t) return [];
    return t.split(/\r?\n/).map(s).filter(Boolean);
  }

  /* ══ ★合計と 言葉の「口」★ ═════════════════════════════════════════
     借りた道具は ★合計を 自分で 足さない★作りに なっている＝
     「MeisaiEngine.invoiceTotals / totalsLabels から 取る」と 決めてある
     （代行が 2026-08-11/12 に ★紙とExcelが 別々に足していた★のを 直した跡）。
     ★うちも 同じ考え★＝合計の持ち主は ★seikyu-tax.js ただ1本★。
     ⇒ ここでは ★数え直さない★。★もう出してある数を そのまま 答える口★を 置くだけ。
     ★これを 作り忘れると 道具は 例外で止まる★（＝黙って 別の合計を出す事は 無い）。 */
  function engineFor(tax) {
    var t = tax || {};
    return {
      invoiceTotals: function () {
        return {
          shoukei: num(t.subtotal),          // 小計（税抜）
          zei: num(t.taxTotal),              // 消費税
          goukei: num(t.grandTotal),         // 合計（税込）
          soto: true,                        // 見出しの言い方（下の labels で 上書きする）
          rate: rateOf(t),
        };
      },
      totalsLabels: function (m) {
        var kihon = {
          小計: '小計',
          消費税: zeiLabel(t),
          合計: '合計',
          前回繰越額: '前回繰越額',
          合計請求額: '合計請求額',
          ご入金額: 'ご入金額',
          今回お支払額: '今回お支払額',
        };
        var L = (m && m.labels) || {};
        Object.keys(kihon).forEach(function (k) { if (L[k]) kihon[k] = L[k]; });
        return kihon;
      },
    };
  }
  /** 使った税率（★計算に使った値から 組み立てる＝紙が嘘をつかない★） */
  function rateOf(t) {
    var by = (t && t.byRate) || [];
    var used = by.filter(function (r) { return num(r.base) !== 0 || num(r.tax) !== 0; });
    if (used.length === 1) return num(used[0].pct);
    if (by.length) return num(by[0].pct);
    return 0;
  }
  /** 消費税の見出し（★率も 内税/外税も 計算に使った物から★） */
  function zeiLabel(t) {
    var by = (t && t.byRate) || [];
    var used = by.filter(function (r) { return num(r.base) !== 0 || num(r.tax) !== 0; });
    if (used.length > 1) {
      return '消費税（' + used.map(function (r) { return num(r.pct) + '%'; }).join('・') + '）';
    }
    var pct = rateOf(t);
    return '消費税（' + pct + '%）';
  }

  return { toDaikou: toDaikou, engineFor: engineFor, slash: slash,
    _valueOf: valueOf, _amountOf: amountOf, _bankLines: bankLines,
    _rateOf: rateOf, _zeiLabel: zeiLabel, AMOUNT_COL: AMOUNT_COL };
});
