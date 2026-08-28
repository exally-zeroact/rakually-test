/* seikyu-paper-ask.js — ★紙の作りを「聞いてあげる」★（明細の列・紙の行数）
 * =============================================================================
 * 決まり（司さん 2026-08-16 `team/ask-dont-fill.md` ／ 指示役 2026-08-28 の順番 ⑤⑥）:
 *   ・★別ウィザードを作らない★＝設定の画面 そのものを対話にする
 *   ・★1回 決めれば ずっと効く物は 1通ごとに聞かない★＝ここは ★会社の設定★
 *   ・★答えたら その場で結果を返す★／★機械が当てた物は「当てた」と根拠を見せる★
 *   ・★AIは使わない★＝ルールベース・オフライン・決定論
 *
 * ★この2つは「聞く」より前に「数える」★
 *   列も行数も ★もう作った請求書を数えれば 答えが出る★物。
 *   だから ★空欄を並べて選ばせない★＝
 *     「この列、★過去◯通で 1度も使っていません★。消しますか？」
 *     「あなたの明細は ★いちばん多い月で ◯行★。枠は ◯行で足ります。」
 *   ★1通も作っていない時は 何も言わない★（材料が無いのに 当てない）。
 *
 * ★数えない物★
 *   ・「#」「品名・内容」「金額」… ★消せない列★（紙が成り立たない）＝聞かない
 *   ・「消費税」… ★人が打つ列ではない★（seikyu-tax.js が出す）。しまってある明細には入っていないので、
 *     ★空に見えても「使っていない」ではない★。すすめない（設定で自分で消すのは できる）。
 *   ・下書き … ★出していない紙は 実績ではない★ので 数えない（呼ぶ側が渡す物を選ぶ）
 *
 * 【利用】ブラウザ window.SeikyuPaperAsk ／ Node require('./seikyu-paper-ask.js')
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SeikyuPaperAsk = api;
  else if (typeof globalThis !== 'undefined') globalThis.SeikyuPaperAsk = api;
})(this, function () {
  'use strict';

  /** ★消せない列★（役割で見る＝名前を変えても効く）。紙が成り立たない。 */
  var KEEP_ROLES = ['index', 'name', 'amount'];
  /* ★人が打つ列ではない＝「空だから 使っていない」と 数えてはいけない列★
     （2026-08-29 実測で踏んだ）
       ・消費税(tax) … ★seikyu-tax.js が出す物★で、しまってある明細には 入っていない。
         空に見えるのは ★使っていないから ではなく 計算で出す列だから★。
       ・金額(amount) / 番号(index) … 同じく 打つ物ではない（KEEP_ROLES にも入っている）。
     ⇒ ★消す候補として すすめない★。★設定で 自分で消すのは できる★（止めてはいない）。 */
  var DERIVED_ROLES = ['index', 'amount', 'tax'];
  /** 数えるのに 最低これだけの通数が要る（1通で決めつけない） */
  var MIN_N = 3;

  function s(v) { return String(v == null ? '' : v).trim(); }
  function linesOf(inv) { return Array.isArray(inv && inv.lines) ? inv.lines : []; }

  /* ═══ ① 使っていない列 ═══════════════════════════════════
     ★「使った」の数え方★＝その列の中身が ★1文字でも入っている行★が 1行でも在れば「使った」。
     ★0の数字は「使った」に数える★（0円・0個は 意味が在る）。空だけを「使っていない」とする。 */
  function usedIn(inv, col, cellOf, spec) {
    var ls = linesOf(inv);
    for (var i = 0; i < ls.length; i++) {
      var c = cellOf(ls[i], col, i, spec);
      if (c && s(c.text) !== '') return true;
    }
    return false;
  }

  /** 列ごとに「何通で使ったか」を数える。cols=列名の並び、invoices=出した請求書 */
  function colUsage(ctx) {
    var c = ctx || {};
    var cols = (c.cols && c.cols.items) ? c.cols.items : [];
    var invs = c.invoices || [];
    var cellOf = c.cellOf, roleOf = c.roleOf;
    if (!cellOf || !roleOf) return [];
    return cols.map(function (col) {
      var role = roleOf(c.cols, col);
      var used = 0;
      invs.forEach(function (v) { if (usedIn(v, col, cellOf, c.cols)) used++; });
      return {
        col: col, role: role, used: used, total: invs.length,
        keep: KEEP_ROLES.indexOf(role) >= 0,     // ★消せない列★
        derived: DERIVED_ROLES.indexOf(role) >= 0, // ★打つ列ではない（空でも「使っていない」と言わない）★
      };
    });
  }

  /** ★1通も使っていない列★（消せない列は 出さない・通数が少なければ 出さない） */
  function unusedCols(ctx) {
    var invs = (ctx && ctx.invoices) || [];
    if (invs.length < MIN_N) return [];          // ★材料が足りない＝言わない★
    return colUsage(ctx).filter(function (x) { return !x.keep && !x.derived && x.used === 0; });
  }

  /* ═══ ② 紙の行数 ═══════════════════════════════════════
     ★当て方★ … 出した請求書の ★明細の行数★を数え、
       ・いちばん多い月（max）／よくある数（mode）を出す
       ・★枠は max が入る数★を すすめる（毎月おなじ場所に おなじ物が来る＝探し直しにならない）
       ・★既定より少なくてよい時だけ★ すすめる（増やす提案は 2枚目が出た時に 画面がやる） */
  function rowStats(ctx) {
    var invs = (ctx && ctx.invoices) || [];
    if (invs.length < MIN_N) return null;        // ★材料が足りない＝言わない★
    var ns = invs.map(function (v) { return linesOf(v).length; }).filter(function (n) { return n > 0; });
    if (!ns.length) return null;
    var max = Math.max.apply(null, ns);
    var counts = {}, mode = ns[0], best = 0;
    ns.forEach(function (n) { counts[n] = (counts[n] || 0) + 1; if (counts[n] > best) { best = counts[n]; mode = n; } });
    return { n: ns.length, max: max, mode: mode, modeN: best };
  }

  function rowsGuess(ctx) {
    var st = rowStats(ctx);
    if (!st) return null;
    var now = Number((ctx && ctx.rows) || 0) || Number((ctx && ctx.defaultRows) || 0);
    if (!now) return null;
    /* ★すすめるのは「今より減らせる時」だけ★（増やす話は 2枚になった時に 画面が出す） */
    if (st.max >= now) return null;
    return {
      value: st.max,
      why: '出した請求書 ' + st.n + '通のうち、明細がいちばん多い月で ' + st.max + '行でした'
        + '（よくあるのは ' + st.mode + '行・' + st.modeN + '通）。'
        + '今の枠は ' + now + '行なので、' + st.max + '行でも 全部 入ります。',
      stats: st,
    };
  }

  /* ═══ 問いの一覧 ═══════════════════════════════════════ */
  function questions(ctx) {
    var c = ctx || {};
    var out = [];

    var unused = unusedCols(c);
    unused.forEach(function (u) {
      out.push({
        key: 'col:' + u.col, kind: 'yesno', col: u.col,
        q: '「' + u.col + '」の列は 消しますか？',
        hint: '消しても、入れてある中身は 残ります（また足せます）。',
        guess: {
          value: '消す',
          why: '出した請求書 ' + u.total + '通で、この列に ★1度も 何も入っていません★。'
            + '使っていない列は 紙の幅を取るだけなので、消すと 品名の欄が広くなります。',
        },
        result: function (val) {
          return (val === 'yes')
            ? ('「' + u.col + '」を 紙から消します。品名・内容の欄が その分 広くなります。')
            : ('「' + u.col + '」は このまま 残します。');
        },
      });
    });

    var rg = rowsGuess(c);
    if (rg) {
      out.push({
        key: 'rows', kind: 'pick',
        q: '明細の枠は 何行にしますか？',
        hint: '枠の分だけ 空の行を残して刷ります。毎月おなじ場所に おなじ物が来ます。',
        now: s(c.rows),
        guess: rg,
        options: [
          { v: String(rg.value), t: rg.value + '行（すすめ）' },
          { v: String(c.defaultRows || ''), t: (c.defaultRows || '') + '行（様式の既定）' },
        ].filter(function (o) { return o.v; }),
        result: function (val) {
          var n = Number(val) || 0;
          if (!n) return '';
          var st = rg.stats;
          return n + '行の枠で刷ります。'
            + (st.max > n
              ? ('★' + st.max + '行の月は 2枚になります★（いちばん多い月が ' + st.max + '行）。')
              : ('いちばん多い月（' + st.max + '行）も 1枚に入ります。'));
        },
      });
    }
    return out;
  }

  function progress(ctx) {
    var qs = questions(ctx);
    var ok = (ctx && ctx.answered) || {};
    var list = qs.map(function (q) { return { key: q.key, q: q, done: !!ok[q.key] }; });
    var next = list.filter(function (x) { return !x.done; })[0] || null;
    return { total: list.length, done: list.filter(function (x) { return x.done; }).length, list: list, next: next && next.q };
  }

  return {
    questions: questions, progress: progress,
    colUsage: colUsage, unusedCols: unusedCols, rowStats: rowStats, rowsGuess: rowsGuess,
    KEEP_ROLES: KEEP_ROLES, DERIVED_ROLES: DERIVED_ROLES, MIN_N: MIN_N,
  };
});
