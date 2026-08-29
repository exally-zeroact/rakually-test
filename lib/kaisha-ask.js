/* kaisha-ask.js — ★会社のことを「聞いてあげる」★（空欄を並べて 埋めさせない）
 * =============================================================================
 * ★なぜ★（司さん 2026-08-16 の決定 team/ask-dont-fill.md ／ 2026-08-29「できる機能を全てやってから報告しろ」）
 *   実測（2026-08-29）… 入口 index.html は ★欄11・聞く形0★＝
 *   屋号・住所・電話・登録番号を ★空欄で並べて 埋めさせていた★。
 *   会社の情報は ★第3の場所（会社の設定）★に集めた（08-28）が、聞く形は 入っていなかった。
 *
 * ★決まり（正本 team/ask-dont-fill.md）★
 *   ・別ウィザードを作らない＝この画面のまま 1問だけ増やす
 *   ・1問ごと保存／答えたら その場で 結果を返す
 *   ・★機械が当てられる物は 当てて「当てた」と 根拠を見せる★
 *   ・★AIは使わない★＝ルールベース・オフライン・決定論（同じ入力なら 同じ答え）
 *   ・★今 使わない物は 使う時に 初めて聞く★
 *
 * ★ここで 当てられる物／当てられない物（測ってから 決めた）★
 *   屋号     … ★当てられない★（人にしか分からない）→ 聞く。ただし ★法人格を 当てる★
 *              （「◯◯建設」→「株式会社◯◯建設 ですか？ ◯◯建設 のままですか？」は ★聞かない★＝
 *                勝手に 法人にしない。★入れた字を そのまま★使う）
 *   住所     … ★当てられない★→ 聞く（郵便番号から引く仕掛けは ★外に出る★ので 作らない）
 *   電話     … ★当てられない★→ 聞く。★形だけ その場で 見る★（数字とハイフン）
 *   登録番号 … ★形は 機械で見られる★（T＋13桁・検査用数字）＝入れた その場で 言う。
 *              ★国税庁のサイトは 叩かない★（外に出ない・決定論）
 *   事業     … ★1つ目は 当てない★／2つ目からは ★よく使う言葉★を 札で出す
 *
 * 【利用】ブラウザ window.KaishaAsk ／ Node require('./kaisha-ask.js')
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.KaishaAsk = api;
  else if (typeof globalThis !== 'undefined') globalThis.KaishaAsk = api;
})(this, function () {
  'use strict';

  function s(v) { return String(v == null ? '' : v).trim(); }

  /* ★法人格の言葉★（屋号に これが入っていれば 会社＝「御中」で出す相手になる）
     ★当てるのに使うだけ★＝勝手に 付け足さない。 */
  var CORP = ['株式会社', '有限会社', '合同会社', '合資会社', '合名会社', '（株）', '(株)', '（有）', '(有)'];

  /* ═══ 登録番号（★形だけ★ 見る・外に出ない） ═══
     国税庁の適格請求書発行事業者の登録番号＝「T」＋13桁。
     ★13桁の最後は 検査用数字★（前12桁から出す）。合わない時は ★止めずに 注意だけ★
     （番号の付け方は 国税庁が決める物で、うちが 断定してはいけない）。 */
  function checkToroku(v) {
    var t = s(v).replace(/[　\s-]/g, '').toUpperCase();
    if (!t) return { level: 'empty', ok: true, no: '', msg: '' };
    if (!/^T?\d{0,13}$/.test(t)) {
      return { level: 'bad', ok: false, no: t, msg: '「T」のあとに 数字13桁で入れてください。' };
    }
    var digits = t.replace(/^T/, '');
    if (digits.length < 13) {
      return { level: 'short', ok: true, no: 'T' + digits,
        msg: 'あと ' + (13 - digits.length) + '桁です（T のあと 13桁）。' };
    }
    var body = digits.slice(0, 12), cd = Number(digits.slice(12));
    var sum = 0;
    for (var i = 0; i < 12; i++) {
      var n = Number(body[11 - i]);
      sum += (i % 2 === 0) ? n * 1 : n * 2;
    }
    var want = 9 - (sum % 9);
    var okCd = (want === cd);
    return { level: okCd ? 'ok' : 'warn', ok: true, no: 'T' + digits,
      msg: okCd ? '形は 合っています（T＋13桁）。'
        : '形は T＋13桁ですが、最後の1桁が 合いません。打ち間違いが無いか 見てください。' };
  }

  /* ═══ 電話（★形だけ★） ═══ */
  function checkTel(v) {
    var t = s(v);
    if (!t) return { ok: true, level: 'empty', msg: '' };
    if (!/^[0-9()\-+　 ]+$/.test(t)) {
      return { ok: false, level: 'bad', msg: '数字と「-」だけで 入れてください。' };
    }
    var n = t.replace(/[^0-9]/g, '');
    if (n.length < 9 || n.length > 11) {
      return { ok: true, level: 'warn', msg: '数字が ' + n.length + '桁です（ふつうは 10桁か 11桁）。' };
    }
    return { ok: true, level: 'ok', msg: '' };
  }

  /** 屋号から 会社かどうかを 当てる（★付け足さない・見るだけ★） */
  function corpOf(name) {
    var nm = s(name);
    for (var i = 0; i < CORP.length; i++) if (nm.indexOf(CORP[i]) >= 0) return CORP[i];
    return '';
  }

  /** 事業の札（★2つ目から★ よく使う言葉を 出す） */
  var BIZ_COMMON = ['物販', '工事', 'サービス', '運送', '飲食'];
  function bizChips(now, max) {
    var have = (now || []).map(s);
    return BIZ_COMMON.filter(function (b) { return have.indexOf(b) < 0; }).slice(0, max || 4);
  }

  /**
   * 聞く順（★後の質問が減る順★／★今 使わない物は 聞かない★）
   * @param {object} ctx { org:{yago,addr,tel,invoiceNo}, businesses:[], answered:{} }
   */
  function questions(ctx) {
    var c = ctx || {}, o = c.org || {}, ok = c.answered || {};
    var out = [];

    out.push({
      key: 'yago', kind: 'text',
      q: '会社（お店）の 名前は？',
      hint: '請求書の紙と 給料明細に そのまま出ます。屋号でも かまいません。',
      now: s(o.yago), placeholder: '例：合同会社Rakunally',
      guess: null,                       // ★当てない★（人にしか分からない）
      skipLabel: 'あとで入れる',
      result: function (val) {
        var v = s(val);
        if (!v) return '名前は あとで入れます（紙の「発行者」は 空のままです）。';
        var hit = corpOf(v);
        return '紙の右上に「' + v + '」と 出ます。'
          + (hit ? '（「' + hit + '」が 入っているので 会社として あつかいます）' : '');
      },
    });

    out.push({
      key: 'addr', kind: 'text',
      q: '住所は？',
      hint: '請求書の紙の「発行者」の所に 出ます。番地まで 入れてください。',
      now: s(o.addr), placeholder: '例：愛媛県今治市○○町1-2-3',
      guess: null,
      skipLabel: 'あとで入れる',
      result: function (val) {
        var v = s(val);
        return v ? ('紙に「' + v + '」と 出ます。') : '住所は あとで入れます。';
      },
    });

    out.push({
      key: 'invoiceNo', kind: 'text',
      q: 'インボイスの登録番号は？',
      hint: '「T」のあと 13桁。持っていなければ 飛ばせます（紙には 出ません）。',
      now: s(o.invoiceNo), placeholder: 'T のあと 13桁',
      guess: null,
      skipLabel: '持っていない',
      /* ★打った その場で 形を見る★（外には 出ない） */
      live: function (val) { return checkToroku(val).msg; },
      result: function (val) {
        var r = checkToroku(val);
        if (r.level === 'empty') return '登録番号は 入れません（紙にも 出ません）。';
        if (!r.ok) return r.msg;
        return '紙に「登録番号　' + r.no + '」と 出ます。' + (r.level === 'warn' ? r.msg : '');
      },
    });

    /* ★電話は 今 使わない★＝紙にも Excel にも 出ない。
       ★使う時に 初めて聞く★（決まり7）。ここでは 聞かない。 */

    out.push({
      key: 'business', kind: 'text',
      q: 'どんな仕事ですか？（集計を この単位で 出します）',
      hint: 'あとから いくつでも 足せます。例：物販／工事／サービス',
      now: (c.businesses || [])[0] || '',
      chips: bizChips(c.businesses, 4),
      guess: null,
      skipLabel: '分けない',
      result: function (val) {
        var v = s(val);
        return v ? ('「' + v + '」ごとに 売上を まとめます。') : '仕事では 分けません（1つにまとめます）。';
      },
    });

    return out.map(function (q) { return Object.assign({ done: !!ok[q.key] }, q); });
  }

  /** 何問めか（★1問ずつ 進める★）。中身が入っていれば 答えたうち */
  function progress(ctx) {
    var c = ctx || {}, o = c.org || {};
    var qs = questions(c);
    var ok = c.answered || {};
    var list = qs.map(function (q) {
      var done = !!ok[q.key];
      if (!done) {
        if (q.key === 'yago') done = !!s(o.yago);
        if (q.key === 'addr') done = !!s(o.addr);
        if (q.key === 'invoiceNo') done = !!s(o.invoiceNo);
        if (q.key === 'business') done = ((c.businesses || []).length > 0);
      }
      return { key: q.key, q: q, done: done };
    });
    var next = list.filter(function (x) { return !x.done; })[0] || null;
    return { total: list.length, done: list.filter(function (x) { return x.done; }).length,
      list: list, next: next && next.q };
  }

  return {
    questions: questions, progress: progress,
    checkToroku: checkToroku, checkTel: checkTel, corpOf: corpOf, bizChips: bizChips,
    CORP: CORP, BIZ_COMMON: BIZ_COMMON,
  };
});
