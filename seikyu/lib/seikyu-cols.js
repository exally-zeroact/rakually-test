/* seikyu-cols.js — ★どんな項目にも対応できる（列を自分で決める）★
 * ==============================================================================
 * 元ネタ ＝ 代行請求アプリの実物（daikou-seikyu-test/invoice-pdf.js）。
 *   毎日 113通 を刷っている物なので、契約は ★名前ごと持ってくる★。
 *     colWidths(items, widths) … 列幅を「合計で紙幅に正規化」        invoice-pdf.js:294
 *     colAlign(m, k)           … 金額=右 / 日付=中央 / 他=左          invoice-pdf.js:308
 *     editColWidth             … 幅は 24〜400 にクランプ              daikou-seikyu.html:7155
 *
 * ★列は「名前の配列(items)」で決まる★
 *   { items: ['日付','行き先','金額','備考'], widths: {…}, aligns: {…} }
 *   知らない名前の列を足してよい。値は明細の extra に入る。
 *
 * ★金額の計算は列に依らない★
 *   どの列を出す／出さないを変えても、消費税と合計は1円も動かない。
 *   （計算は seikyu-tax.js が明細そのものから出す。列は「見せ方」だけ）
 *
 * ★幅は必ず紙幅に正規化する★
 *   打った幅の比率だけを使い、合計を紙幅に合わせる＝★列を何本足してもはみ出さない★。
 *   HTMLの紙なので「紙幅」＝表の幅100（％）。
 *
 * ★画面に依らない（DOMを1つも触らない）★＝素のNodeで全パターン回せる。
 *
 * 【利用】ブラウザ window.SeikyuCols ／ Node require('./seikyu-cols.js')
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SeikyuCols = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PAPER_WIDTH = 100;   // 表の幅（％）。ここに合計を必ず合わせる＝はみ出さない
  var MIN_W = 24;          // これ未満だと列が読めない
  var MAX_W = 400;         // これを超えると他の列が潰れる
  var MAX_COLS = 12;       // 1枚の紙に並べられる列の上限（超えると字が潰れて読めない）
  var DEFAULT_W = 80;

  /* 列の「役割」。★名前ではなく役割で明細と結ぶ★
     ＝列名を並べ替えても・消しても、金額や税率が迷子にならない。 */
  var ROLE_KEYS = ['index', 'name', 'qty', 'unit', 'price', 'amount', 'rate', 'tax', 'date', 'memo'];
  var ROLES = {
    '#': 'index',
    '品名・内容': 'name',
    '品名': 'name',
    '項目': 'name',        // ★うちの実物32枚は全部この呼び方★
    '数量': 'qty',
    '単位': 'unit',
    '単価': 'price',
    '金額': 'amount',
    '税率': 'rate',
    /* ★消費税＝行ごとの税額の列★
       うちの実物32枚は ★1枚残らず★ この列を持っている（=E12*0.1）。
       ＝「税率の列」より ★こちらが標準★。足したら必ず消費税の合計に一致する
       （端数の寄せは seikyu-tax.js が1か所でやる）。 */
    '消費税': 'tax',
    '日付': 'date',        // ★実物1枚（リエット請求書）が持っている★
    '摘要': 'memo',
    '備考': 'memo',
  };

  /* 幅の目安。★うちの実物32枚の列に合わせた物★
     （以前ここには「代行請求の base をそのまま持ち込み」と書いてあった＝★他アプリの器を
       持ち込んだ跡★。跡が残っていると次の人も引っ張られるので消した） */
  var BASE_W = {
    '日付': 64, '行き先': 240, '金額': 100, '備考': 80, '距離': 80, '人数': 64, '名前': 96,
    '#': 28, '品名・内容': 220, '品名': 220, '項目': 220, '数量': 56, '単位': 44, '単価': 80, '税率': 56, '消費税': 72, '摘要': 100,
  };

  /** ★会社が付けた列にも「役割」を与えられる★
   *  実物の「備考」は ★現場名★（東予市 川本邸／菊水ホテル／株式会社朝蔵）。
   *  会社が「現場」「物件」「車番」と名前を変えても ★役割で結べば紙と表がズレない★。
   *  spec.roles = { '現場': 'memo' }（★列名は会社の物・役割は器の物★） */
  function roleOfIn(spec, name) {
    var own = (spec && spec.roles && Object.prototype.hasOwnProperty.call(spec.roles, String(name)))
      ? spec.roles[String(name)] : null;
    if (own && ROLE_KEYS.indexOf(own) >= 0) return own;
    return roleOf(name);
  }

  function roleOf(name) {
    return Object.prototype.hasOwnProperty.call(ROLES, String(name)) ? ROLES[String(name)] : null;
  }

  /* 幅を 24〜400 に収める。数でない物は下限にする（0や空で列を消さない） */
  function clampWidth(n) {
    var v = Number(n);
    if (!Number.isFinite(v)) return MIN_W;
    return Math.max(MIN_W, Math.min(MAX_W, Math.round(v)));
  }

  /* ±ボタン1回ぶん。返りは新しい widths（元を書き換えない） */
  function bumpWidth(widths, col, delta) {
    var w = Object.assign({}, widths || {});
    var cur = Number(w[col]);
    if (!Number.isFinite(cur)) cur = BASE_W[col] || DEFAULT_W;
    w[col] = clampWidth(cur + (Number(delta) || 0));
    return w;
  }

  /**
   * 列幅（％）。★合計は必ず PAPER_WIDTH★ ＝ 何本足しても紙からはみ出さない。
   * 打った幅は「比率」としてだけ使う（★何本 足しても紙からはみ出さない★ための決め方）。
   */
  function widthsOf(items, widths) {
    var list = Array.isArray(items) ? items : [];
    if (!list.length) return [];
    var raw = list.map(function (k) {
      var w = (widths || {})[k];
      return clampWidth(w === undefined || w === null || w === '' ? (BASE_W[k] || DEFAULT_W) : w);
    });
    var sum = raw.reduce(function (a, b) { return a + b; }, 0);
    if (!sum) return list.map(function () { return PAPER_WIDTH / list.length; });
    var out = raw.map(function (w) { return (w / sum) * PAPER_WIDTH; });
    // ★丸め誤差を最後の列で吸収する（合計が紙幅と1ミリもズレないように）
    var got = out.reduce(function (a, b) { return a + b; }, 0);
    out[out.length - 1] += (PAPER_WIDTH - got);
    return out;
  }

  /* 揃え。会社の指定(spec.aligns)が最優先。無ければ役割の既定。 */
  function alignOf(spec, col) {
    var a = spec && spec.aligns && spec.aligns[col];
    if (a === 'left' || a === 'center' || a === 'right') return a;
    var r = roleOfIn(spec, col);
    if (r === 'amount' || r === 'qty' || r === 'price' || r === 'tax') return 'right';
    if (r === 'index') return 'center';
    if (r === 'unit') return 'center';
    if (r === 'rate') return 'center';
    if (r === 'date') return 'center';
    return 'left';
  }

  /* ★「取引の内容」を出せる列が1本でもあるか★
     法定の記載事項③＝取引の内容。列名が「品名」である必要は無い（代行なら「行き先」が内容）。
     数・金額・税率・日付・番号 だけの並びにすると ★何を売ったのか書いていない紙★になる。 */
  function hasContentColumn(items) {
    var list = Array.isArray(items) ? items : [];
    for (var i = 0; i < list.length; i++) {
      var k = String(list[i] == null ? '' : list[i]).trim();
      if (!k) continue;
      var r = roleOf(k);
      // 内容になれる＝品名・摘要、または役割を持たない自由な列（行き先・工事名 など）
      if (r === 'name' || r === 'memo' || r === null) {
        if (k === '日付') continue;      // 日付は「いつ」であって「何を」ではない
        return true;
      }
    }
    return false;
  }

  /* 列の並びそのものの検査（★空欄・重複のまま紙を作らせない★） */
  function validate(items) {
    var errs = [];
    var list = Array.isArray(items) ? items : [];
    if (!list.length) { errs.push('列が1本もありません（何を並べるか決めてください）'); return errs; }
    if (!hasContentColumn(list)) {
      // ★法定の記載事項③（取引の内容）。列名は自由だが、内容を書く列は1本 要る。
      errs.push('「何を売ったか」を書く列がありません（品名・内容／行き先／工事名 など、'
        + '内容を書ける列を1本は残してください。数字と日付だけの請求書は法律の要件を満たしません）');
    }
    if (list.length > MAX_COLS) errs.push('列が' + list.length + '本あります。1枚に並べられるのは' + MAX_COLS + '本までです');
    var seen = {};
    for (var i = 0; i < list.length; i++) {
      var k = String(list[i] == null ? '' : list[i]).trim();
      if (!k) { errs.push((i + 1) + '本目の列に名前がありません'); continue; }
      if (seen[k]) errs.push('「' + k + '」が2本あります（同じ名前の列は作れません）');
      seen[k] = true;
    }
    return errs;
  }

  /**
   * その列に出す値。★無い物は空のまま返す（0で埋めない）★
   *   返り = { text, kind }  kind: 'money' | 'num' | 'text'
   *   line … seikyu-tax.compute が返した行（amount は円の整数）
   *   i    … 0始まりの行番号
   */
  function cellOf(line, col, i, spec) {
    var ln = line || {};
    var r = spec ? roleOfIn(spec, col) : roleOf(col);
    if (r === 'index') return { text: String((i || 0) + 1), kind: 'num' };
    if (r === 'name') return { text: str(ln.name), kind: 'text' };
    if (r === 'unit') return { text: str(ln.unit), kind: 'text' };
    if (r === 'memo') return { text: str(ln.memo), kind: 'text' };
    if (r === 'qty') return { text: blankOrNum(ln.qty), kind: 'num' };
    if (r === 'price') return { text: blankOrNum(ln.price), kind: 'money' };
    if (r === 'amount') return { text: blankOrNum(ln.amount), kind: 'money' };
    if (r === 'rate') {
      if (ln.rate === undefined || ln.rate === null || ln.rate === '') return { text: '', kind: 'text' };
      return { text: Number(ln.rate) === 0 ? '—' : String(Number(ln.rate)) + '%', kind: 'text' };
    }
    /* ★行ごとの税額★（実物32枚が全部この列を持つ）
       ★seikyu-tax.js が出した ln.tax をそのまま出す★＝ここで数え直さない。
       数え直すと ★足しても消費税の合計に一致しない★（端数の寄せが効かなくなる）。 */
    if (r === 'tax') return { text: blankOrNum(ln.tax), kind: 'money' };
    if (r === 'date') return { text: str(ln.date || (ln.extra || {})[col]), kind: 'text' };
    // 知らない列＝明細の自由枠から取る（無ければ空欄。0にしない）
    var ex = ln.extra || {};
    return { text: str(ex[col]), kind: 'text' };
  }
  function str(v) { return (v === undefined || v === null) ? '' : String(v); }
  function blankOrNum(v) {
    if (v === undefined || v === null || v === '') return '';
    var n = Number(v);
    return Number.isFinite(n) ? String(n) : '';
  }

  /* 列の並びを整える（欠けていても落ちない形にする） */
  function normalizeSpec(spec) {
    var s = spec || {};
    return {
      items: Array.isArray(s.items) ? s.items.slice() : [],
      widths: Object.assign({}, s.widths || {}),
      aligns: Object.assign({}, s.aligns || {}),
      // ★会社が付けた役割も落とさない（落とすと列名を変えた瞬間に金額が迷子になる）
      roles: Object.assign({}, s.roles || {}),
    };
  }

  return {
    PAPER_WIDTH: PAPER_WIDTH, MIN_W: MIN_W, MAX_W: MAX_W, MAX_COLS: MAX_COLS,
    ROLES: ROLES, BASE_W: BASE_W,
    roleOf: roleOf, roleOfIn: roleOfIn, ROLE_KEYS: ROLE_KEYS, clampWidth: clampWidth, bumpWidth: bumpWidth,
    widthsOf: widthsOf, alignOf: alignOf, validate: validate, hasContentColumn: hasContentColumn,
    cellOf: cellOf, normalizeSpec: normalizeSpec,
  };
});
