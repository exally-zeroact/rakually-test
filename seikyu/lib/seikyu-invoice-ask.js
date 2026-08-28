/* seikyu-invoice-ask.js — ★この1通のことを「聞いてあげる」★（埋めさせない）
 * =============================================================================
 * 決まり（司さん 2026-08-16 `team/ask-dont-fill.md` ／ 指示役 2026-08-28）:
 *   ・★別ウィザードを作らない★＝入力の画面 そのものを対話にする（同じ画面の2つの見え方）
 *   ・★1問ごと保存★（保存は画面の仕事。ここは「保存する中身」を返すだけ）
 *   ・★答えたら その場で結果を返す★（この lib が「返す言葉」も作る）
 *   ・★機械が当てた物は「当てた」と根拠を見せる★（勝手に埋めない）
 *   ・★AIは使わない★＝ルールベース・オフライン・決定論（同じ入力なら 同じ答え）
 *
 * ★取引先(seikyu-partner-ask.js)との違い★
 *   あちらは ★相手ごとに1回決めれば ずっと効く物★（敬称・支払サイト・源泉）。
 *   ここは ★その1通だけの物★（件名・支払期限の日）。
 *   ★同じ物を2か所で聞かない★＝支払サイトの「型」は取引先が持ち主。
 *   ここでは ★その型から出した「日付」を たしかめてもらう★だけ。
 *
 * ★聞かない物★（測ってから外した）
 *   ・★件名を紙に出すか★ … ★会社の設定★（1回 決めれば ずっと効く物は 1通ごとに聞かない）。
 *     既定は「出さない」＝うちの実物45通は 件名の欄が0通。要る会社は 設定で「出す」。
 *   ・備考 … 実物45通のうち ★決まり文句が入るだけ★。前回の物を当てて、直したい人だけ直す。
 *   ・「◯年◯月分」の行 … ★請求日から機械で出せる★（当てて、根拠を見せる）。
 *
 * 【利用】ブラウザ window.SeikyuInvoiceAsk ／ Node require('./seikyu-invoice-ask.js')
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SeikyuInvoiceAsk = api;
  else if (typeof globalThis !== 'undefined') globalThis.SeikyuInvoiceAsk = api;
})(this, function () {
  'use strict';

  function s(v) { return String(v == null ? '' : v).trim(); }
  function dataOf(x) { return (x && x.data) || {}; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* ═══ 日付の道具（★勝手な日は作らない★＝読めない物は空を返す） ═══ */
  function ymd(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s(v));
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return { y: y, m: mo, d: d };
  }
  function jp(v) { var t = ymd(v); return t ? (t.y + '年' + t.m + '月' + t.d + '日') : ''; }
  /** その月の前の月（1月の前は 前年12月） */
  function prevMonth(v) {
    var t = ymd(v); if (!t) return null;
    return t.m === 1 ? { y: t.y - 1, m: 12 } : { y: t.y, m: t.m - 1 };
  }

  /* ═══ ① 件名 ═══════════════════════════════════════════════
     ★当て方（この順に見る・全部 決定論）★
       1 同じ相手の ★前回の件名★（いちばん強い＝毎月 同じ言葉を使う人が多い）
       2 その件名が「◯月分」で始まっていたら ★今回の月に置き換える★
       3 前回が無ければ ★他の相手も含めて いちばん多い件名★
       4 それも無ければ ★当てない★（空のまま・作り話をしない）
     ★月の言い方は「請求日の前月」★（画面の e-lead と同じ考え＝2か所で違う事を言わない）。 */
  var MONTH_HEAD = /^(\d{1,2})月分\s*/;

  function monthWord(issueYmd) {
    var p = prevMonth(issueYmd);
    return p ? (p.m + '月分') : '';
  }
  /** 前回の件名を 今回の月へ 置き換える（「9月分 ○○」→「10月分 ○○」） */
  function shiftMonth(subject, issueYmd) {
    var t = s(subject);
    var w = monthWord(issueYmd);
    if (!w || !MONTH_HEAD.test(t)) return t;
    return t.replace(MONTH_HEAD, w + ' ');
  }
  function topOf(counts) {
    var best = null, bn = 0;
    Object.keys(counts).forEach(function (k) { if (counts[k] > bn) { bn = counts[k]; best = k; } });
    return best ? { value: best, n: bn } : null;
  }

  function subjectGuess(ctx) {
    var prev = ctx.prev, issue = ctx.issue;
    var p = prev ? s(dataOf(prev).subject) : '';
    if (p) {
      var moved = shiftMonth(p, issue);
      return {
        value: moved,
        why: (moved !== p)
          ? ('前回（' + s(prev.no || '前の1通') + '）の件名「' + p + '」の月を、'
            + '請求日の前月＝' + monthWord(issue) + ' に置き換えました。')
          : ('前回（' + s(prev.no || '前の1通') + '）と同じ件名です。'),
        from: 'prev',
      };
    }
    var counts = {};
    (ctx.others || []).forEach(function (v) {
      var t = s(dataOf(v).subject); if (t) counts[t] = (counts[t] || 0) + 1;
    });
    var top = topOf(counts);
    if (top && top.n >= 2) {
      return {
        value: shiftMonth(top.value, issue),
        why: 'ほかの請求書で いちばん多く使われている件名です（' + top.n + '通）。',
        from: 'freq',
      };
    }
    return null;                       // ★当てない★（空欄のまま出す）
  }

  /** よく使う件名を 多い順に（押すだけで入る札） */
  function subjectChips(ctx, max) {
    var counts = {};
    (ctx.others || []).forEach(function (v) {
      var t = s(dataOf(v).subject); if (t) counts[t] = (counts[t] || 0) + 1;
    });
    if (ctx.prev) { var pv = s(dataOf(ctx.prev).subject); if (pv) counts[pv] = (counts[pv] || 0) + 5; }
    return Object.keys(counts)
      .map(function (k) { return { v: shiftMonth(k, ctx.issue), n: counts[k] }; })
      .filter(function (x, i, a) { return a.findIndex(function (y) { return y.v === x.v; }) === i; })
      .sort(function (a, b) { return b.n - a.n; })
      .slice(0, max || 4);
  }

  /* ═══ ② 支払期限 ═══════════════════════════════════════════
     ★型（今月末・翌月末・◯日後・翌月◯日）の持ち主は 取引先★（2か所で持たない）。
     ここで聞くのは ★その型から出た日付で よいか★ だけ。
     ★型が決まっていない相手★の時だけ、型を1問 聞く（そして 取引先に保存する）。 */
  function termOf(partner) { var t = dataOf(partner).payTerm; return (t && t.kind) ? t : null; }

  function dueGuess(ctx) {
    var t = termOf(ctx.partner) || (ctx.prev ? dataOf(ctx.prev).term : null);
    if (!t || t.kind === 'none') return null;
    var due = ctx.dueFrom ? ctx.dueFrom(ctx.issue, t) : '';
    if (!ymd(due)) return null;                 // ★出せなければ 当てない★
    var src = termOf(ctx.partner)
      ? ('この相手の「' + termLabel(ctx, t) + '」から出しました。')
      : ('前回（' + s((ctx.prev && ctx.prev.no) || '前の1通') + '）と同じ「' + termLabel(ctx, t) + '」から出しました。');
    return { value: due, why: src + '請求日 ' + jp(ctx.issue) + ' → ' + jp(due), term: t };
  }
  function termLabel(ctx, t) {
    var list = ctx.payTerms || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].key === (t && t.kind)) {
        return list[i].label + ((t.kind === 'days' || t.kind === 'nextDay') && t.n ? '（' + t.n + '）' : '');
      }
    }
    return '決めていない';
  }

  /* ═══ 問いの一覧 ═══════════════════════════════════════════
     ★後の質問が減る順★＝件名（毎回 要る）→ 支払期限（相手で決まっていれば 出ない）。 */
  function questions(ctx) {
    var c = ctx || {};
    var inv = c.inv || {};
    var d = dataOf(inv);
    var out = [];

    var sg = subjectGuess(c);
    out.push({
      key: 'subject', kind: 'text',
      q: 'この請求書の件名は？',
      /* ★ここに「紙に出ます」と書いてはいけない★（2026-08-29 司さん「件名はどこにでる？」で発覚）
         ★実測★ … 紙(std1 / elegant / koujo の3様式)で 件名が出た回数 ★0回★。
                   出るのは ★Excelの「件名」の行★と ★領収書の但し書きの元★だけ。
         うちの実物45通（16社）も ★件名の欄は 無し★（現場名は備考に書く）。
         ⇒ ★出ない物を「出る」と言わない★。どこに出るかを そのまま言う。 */
      hint: (c.subjectOnPaper
        ? '紙の宛名の下に1行 出ます（設定で「出さない」にもできます）。空のままでも出せます。'
        : '紙には出ません（Excelと領収書で使います）。設定で「出す」にもできます。空のままでも出せます。'),
      now: s(d.subject),
      guess: sg,
      chips: subjectChips(c, 4),
      skipLabel: '件名は要らない',
      /* ★答えたら その場で返す★ */
      result: function (val) {
        var v = s(val);
        /* ★出る所を そのまま言う★（実測 2026-08-29）。
           ★紙に出すかは 会社の設定★（司さん「件名がいる会社もあるやろうから対応させとけ」）＝
           ★今の設定で 本当に出るかどうか★を そのまま言う（設定で変わるので 言い切らない）。 */
        if (!v) return '件名は 空のままにします（Excelの「件名」も 空になります）。';
        return c.subjectOnPaper
          ? ('紙の宛名の下に「件名　' + v + '」と刷ります。Excelの「件名」にも 入ります。')
          : ('Excelの「件名」に「' + v + '」と入ります。'
            + '領収書を出す時の但し書きにも 使われます。★紙には 出ません★（設定で 出せます）。');
      },
    });

    var dg = dueGuess(c);
    var due = s(inv.due_ymd);
    out.push({
      key: 'due', kind: 'date',
      q: 'いつまでに もらう約束ですか？',
      hint: (termOf(c.partner)
        ? 'この相手の支払サイトから出しました。違う時だけ 直してください。'
        : 'この1通だけの日付です。毎回 同じなら 相手の設定に入れると 次から聞きません。'),
      now: due,
      guess: dg,
      skipLabel: '期限は決めない',
      result: function (val) {
        var v = s(val);
        if (!v) return '期限は 紙に出しません。';
        var t = ymd(v);
        if (!t) return '';                              // ★読めない日は 何も言わない（嘘を返さない）
        var days = daysBetween(c.issue, v);
        return jp(v) + ' までに もらう約束として刷ります。'
          + (days === null ? '' : '（請求日から ' + days + '日後）');
      },
    });
    return out;
  }

  /** 請求日から 何日後か（読めない時は null＝作らない） */
  function daysBetween(a, b) {
    var x = ymd(a), y = ymd(b);
    if (!x || !y) return null;
    var ax = Date.UTC(x.y, x.m - 1, x.d), by = Date.UTC(y.y, y.m - 1, y.d);
    return Math.round((by - ax) / 86400000);
  }

  /** 答え終わったか＝1問ずつ進める為の数（画面が「◯問のうち◯問」を出す） */
  function progress(ctx) {
    var qs = questions(ctx);
    var d = dataOf((ctx && ctx.inv) || {});
    var ok = (ctx && ctx.answered) || {};
    var list = qs.map(function (q) {
      var done = !!ok[q.key];
      if (!done) {
        /* ★人が答えていなくても 中身が入っていれば 済み★（前から使っている1通を 聞き直さない） */
        if (q.key === 'subject') done = !!s(d.subject);
        if (q.key === 'due') done = !!s((ctx.inv || {}).due_ymd);
      }
      return { key: q.key, q: q, done: done };
    });
    var next = list.filter(function (x) { return !x.done; })[0] || null;
    return { total: list.length, done: list.filter(function (x) { return x.done; }).length, list: list, next: next && next.q };
  }

  return {
    questions: questions, progress: progress,
    subjectGuess: subjectGuess, subjectChips: subjectChips, dueGuess: dueGuess,
    shiftMonth: shiftMonth, monthWord: monthWord, daysBetween: daysBetween,
    _ymd: ymd, _jp: jp,
  };
});
