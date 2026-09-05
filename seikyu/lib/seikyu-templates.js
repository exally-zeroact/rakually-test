/* seikyu-templates.js — ★様式（テンプレ）＝見た目と初期の列だけ★
 * ==============================================================================
 * 代行請求アプリと同じ考え方（invoice-pdf.js:324/338 の pdfDesign = classic / elegant）。
 *   classic … 緑の帯で罫線のしっかりした、いつもの請求書
 *   elegant … 罫線を減らして字で見せる、落ち着いた請求書
 *
 * ★テンプレが決めてよいのは「見た目」と「最初に並ぶ列」だけ★
 *   ・金額・消費税・合計は ★1円もテンプレに依らない★（totalsOf がそれを守る）
 *   ・列は最初の並びを配るだけ。あとは会社が足す・消す・幅を変える
 *
 * ★既定の7列は、ここに置いた「std1 の初期値」であって、紙に焼き付いた物ではない★
 *
 * 【利用】ブラウザ window.SeikyuTemplates ／ Node require('./seikyu-templates.js')
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./seikyu-tax.js'), require('./seikyu-cols.js'));
  } else {
    root.SeikyuTemplates = factory(root.SeikyuTax, root.SeikyuCols);
  }
})(typeof self !== 'undefined' ? self : this, function (TAX, COLS) {
  'use strict';
  if (!TAX || !TAX.compute) throw new Error('seikyu-tax.js を先に読んでください');
  if (!COLS) throw new Error('seikyu-cols.js を先に読んでください');

  /* 色は★直hex★（このリポジトリの現行ルール）。緑は #2E7D54 だけ（濃い緑の禁止色は使わない）。 */
  var TEMPLATES = {
    std1: {
      id: 'std1',
      /* ★名前は「何が違うか」を言う★（司さん 2026-08-31「いつものってなんど」）
         ＝気分の言葉（いつもの／すっきり）では 選べない。★紙の中身★で 名前を付ける。 */
      label: '品名・数量・単価（罫線あり）',
      // ★人に見せる字に 別の製品の名前（内部の言葉）を出さない★（司さん 2026-08-16 ⑥）
      note: '品名・数量・単位・単価・金額・消費税の表。見出しに帯、明細に罫線。'
        + 'いちばん よく使う形です。',
      cols: {
        items: ['#', '品名・内容', '数量', '単位', '単価', '金額', '消費税'],
        widths: { '#': 28, '品名・内容': 220, '数量': 56, '単位': 44, '単価': 80, '金額': 100, '消費税': 72 },
        aligns: {},
      },
      theme: {
        /* ★読ませる字は薄い黒／線は1種類★（司さん 2026-08-16・見本＝代行請求 invoice-pdf.js） */
        ink: '#333333',       // 本文・数字・金額
        sub: '#6B6B6B',       // 補足
        line: '#B0B0B0',      // 罫線（★白黒/FAXで消えない濃さ★）
        accent: '#B0B0B0',    // 飾り線も同じ（色で強弱を作らない）
        band: '#F0FAF4',      // 帯の地
        headBg: '#F2F2F2',    // 表の見出しの地（無彩色の面）
        headInk: '#333333',
        grandInk: '#333333',
        rule: 'rows',         // 罫線 = 横線だけ（うちの紙は縦罫を引かない）
        titleSpacing: '.32em',
        grandGo: 'ご',        // 「ご請求金額（税込）」＝ classic系の言い方（invoice-pdf.js:957）
        /* ★備考の枠を 既定で 出す★（司さん 2026-09-05「他2つは おれの様式のように デフォで 備考欄つけとけよ」）
           ＝司さんの 実物には 空でも 備考の枠が 刷ってある。★koujo(控除の紙)には 足さない★
             （実物11通とも 備考の枠が 無い＝勝手に 増やさない）。 */
        memoBox: true,
      },
    },
    elegant: {
      id: 'elegant',
      label: '品名・数量・単価（罫線ひかえめ）',
      note: '列は上と同じ。罫線を減らして、字の大きさと余白で読ませる形です。',
      cols: {
        items: ['#', '品名・内容', '数量', '単位', '単価', '金額', '消費税'],
        widths: { '#': 28, '品名・内容': 240, '数量': 56, '単位': 44, '単価': 84, '金額': 108, '消費税': 72 },
        aligns: {},
      },
      theme: {
        ink: '#333333',
        sub: '#7A7A7A',       // すっきり＝補助文をもう一段 薄く
        line: '#C4C4C4',      // すっきり＝罫をもう一段 薄く（消えない範囲で）
        accent: '#C4C4C4',
        band: '#FFFFFF',
        headBg: '#FFFFFF',
        headInk: '#333333',
        grandInk: '#333333',
        rule: 'rows',         // 罫線 = 横線だけ
        titleSpacing: '.5em',
        grandGo: '御',        // 「御請求金額（税込）」＝ elegant系の言い方（invoice-pdf.js:479）
        /* ★備考の枠を 既定で 出す★（司さん 2026-09-05「他2つは おれの様式のように デフォで 備考欄つけとけよ」）
           ＝司さんの 実物には 空でも 備考の枠が 刷ってある。★koujo(控除の紙)には 足さない★
             （実物11通とも 備考の枠が 無い＝勝手に 増やさない）。 */
        memoBox: true,
      },
    },
    /* ★3つ目＝工事代金＋控除（差引で出す）★（指示役の裁定 2026-08-27）
       ─────────────────────────────────────────────────────────
       ★実物 47通のうち 11通（4分の1）がこの形★（八木工業10通＋ENEOS 25.3 の2ページ目）。
       ★std1/elegant に足さず 3つ目として作る★＝★表の列数から違う（2列）★ので、
       既存を条件分岐で汚すと ★両方 壊れる★。

       ★計算には1文字も触っていません★＝控除の仕組みは seikyu-doc.js に もう在る
       （deductionsOf／deductTotalOf／deductLines／恒等式 請求額＝（税抜＋値引き）＋消費税−控除）。
       ここが足すのは ★出し方だけ★＝2列の表／控除明細の呼び名／中計の呼び名／振込先を1行に。

       ★実物（八木工業 2025/9）★
         項目            金額            ← 2列だけ
         工事代金       197,600
         消費税          19,760
         小計           217,360          ← 税込の小計
         控除明細                        ← 見出しだけの行
         弁当代 矢原      7,310
         健康診断代      10,164
         中計            17,474          ← 控除の合計（★4通は「小計」と呼ぶ＝呼び名は会社が決める★）
         合計           199,886          ← 小計 − 中計
         振込先（1行だけ）／対象期間 2025/8/21 ~ 2025/9/20 */
    koujo: {
      id: 'koujo',
      /* ★別の製品の名前を 画面に出さない★（screen-words が 赤にする）
         ＝「工事・運転の請求」と 仕事の名前で 言う。 */
      label: '項目と金額だけ＋控除（工事・運転むけ）',
      note: '数量・単価を出さず、項目と金額だけの表。控除（弁当代など）を引いて'
        + '「請求額」を出します。対象期間も入れられます。',
      cols: {
        items: ['項目', '金額'],
        widths: { '項目': 340, '金額': 140 },
        aligns: {},
      },
      theme: {
        ink: '#333333',
        sub: '#6E6E6E',
        line: '#B7B7B7',
        accent: '#2E7D54',
        band: '#FFFFFF',
        headBg: '#F1F7F4',
        headInk: '#333333',
        grandInk: '#333333',
        rule: 'rows',
        titleSpacing: '.4em',
        grandGo: '御',
        /* ★呼び名は焼き付けない★＝会社ごとに変えられる（既定はこの2つ・指示役の裁定） */
        dedHead: '控除明細',
        dedSum: '中計',
        /* ★振込先は1行★（実物11通とも1行） */
        bankOneLine: true,
      },
    },
  };

  var DEFAULT_ID = 'std1';

  function get(id) {
    var t = TEMPLATES[String(id || '')] || null;
    return t ? clone(t) : null;
  }
  function getOrDefault(id) { return get(id) || get(DEFAULT_ID); }
  /** ★この様式は 控除を 出す紙か★（司さん 2026-09-05「今 控除ないやつ 選んどんのに 控除があるし」）
   *  ＝控除明細の 見出しを 持っている様式＝控除を 出す前提の 紙。
   *  ★紙そのものは どの様式でも 控除を 出せる★（seikyu-paper.js:336 は 控除の行が 在るかで 決める）。
   *  ここが 答えるのは ★設定の画面に 控除の欄を 出すか★だけ。 */
  function usesDeduction(id) {
    var t = get(id) || get(DEFAULT_ID);
    return !!(t && t.theme && t.theme.dedHead);
  }
  function list() {
    return Object.keys(TEMPLATES).map(function (k) {
      var t = TEMPLATES[k];
      return { id: t.id, label: t.label, note: t.note };
    });
  }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  /** その1通で使う列。会社が決めた物（inv.data.cols）が最優先、無ければテンプレの初期値。 */
  function colsOf(inv) {
    var d = (inv && inv.data) || {};
    var own = d.cols;
    if (own && Array.isArray(own.items) && own.items.length) return COLS.normalizeSpec(own);
    return COLS.normalizeSpec(getOrDefault(inv && inv.template_id).cols);
  }

  /**
   * ★金額は様式に依らない★
   *   ここは template_id を1度も見ない。見た瞬間に「見た目で金額が変わる」バグになる。
   *   totalsOf({ inv, lines }) → seikyu-tax.compute の返り
   */
  function totalsOf(o) {
    o = o || {};
    var inv = o.inv || {};
    return TAX.compute({
      lines: o.lines || inv.lines || [],
      taxMode: inv.tax_mode,
      rounding: inv.rounding,
    });
  }

  return {
    TEMPLATES: TEMPLATES, DEFAULT_ID: DEFAULT_ID,
    get: get, getOrDefault: getOrDefault, list: list,
    colsOf: colsOf, totalsOf: totalsOf, usesDeduction: usesDeduction,
  };
});
