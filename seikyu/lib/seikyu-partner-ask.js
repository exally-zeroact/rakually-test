/* seikyu-partner-ask.js — ★取引先を「聞いてあげる」★（埋めさせない）
 * =============================================================================
 * 決まり（司さん 2026-08-16／指示役 2026-08-18）:
 *   ・★空欄を並べない★＝前に出た値を ★よく出る順★で候補にする
 *   ・★答えたら その場で結果を返す★（この lib は「返す言葉」も作る）
 *   ・★当てた物は 根拠つき★（なぜそう当てたかを 必ず添える）
 *   ・★1問ごと保存★（保存は画面の仕事。この lib は「保存する中身」を返すだけ）
 *   ・★別ウィザードを作らない★＝取引先の画面 そのものを対話にする
 *
 * ★聞かない物★（測ってから外した。2026-08-18 実測）:
 *   ・郵便番号／電話番号 … 紙にも Excel にも ★0箇所★（snapshot に入るだけで誰も読まない）
 *   ・取引先の登録番号  … 紙 0箇所・Excel 0箇所。適格請求書の記載事項は
 *                        ★受け取る側は「名称」まで★（登録番号が要るのは ★出す側＝自社★）。
 *   ★消してはいない★＝「ぜんぶ見る」には残す（打ち間違いは lib/toroku-no.js が弾く）。
 *   ・取引先コード … ★番号の形が「取引先＋年月＋連番」の時だけ聞く★（使わない人には出さない）
 *
 * 【利用】ブラウザ window.SeikyuPartnerAsk ／ Node require('./seikyu-partner-ask.js')
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SeikyuPartnerAsk = api;
  else if (typeof globalThis !== 'undefined') globalThis.SeikyuPartnerAsk = api;
})(this, function () {
  'use strict';

  var HONORS = ['御中', '様', '（なし）'];
  /* 会社らしい言葉（この字が入っていれば「御中」＝人ではなく組織へ出す紙） */
  var CORP = ['株式会社', '有限会社', '合同会社', '合資会社', '合名会社', '（株）', '(株)', '（有）', '(有)',
    '事業協同組合', '協同組合', '組合', '財団法人', '社団法人', '医療法人', '学校法人', '宗教法人',
    'NPO法人', '法人', '公社', '公団', '商店', '工業', '建設', '運輸'];

  function s(v) { return String(v == null ? '' : v).trim(); }
  function dataOf(p) { return (p && p.data) || {}; }
  function honorOf(d) { return s(d.honor) || s(d.keisho) || ''; }
  function pad3(n) { var t = String(n); while (t.length < 3) t = '0' + t; return t; }

  /** ★よく出る順★に並べ替える道具。counts={値:回数} → [{v,n}] 多い順（同数は元の並び） */
  function byFreq(values, counts) {
    return values.map(function (v, i) { return { v: v, n: (counts[v] || 0), i: i }; })
      .sort(function (a, b) { return (b.n - a.n) || (a.i - b.i); });
  }

  /* ═══ ①敬称 ═══
     ★担当者が居る時は 会社行に 敬称を付けない★（御中＋様＝二重敬称）。
     作法そのものは seikyu-doc.js の addresseeOf が 1か所で持つ＝ここは「何を選ばせるか」だけ。 */
  function honorGuess(name, others, person) {
    var nm = s(name);
    var pn = s(person);
    if (pn) {
      return { value: '（なし）', kind: 'person',
        why: '担当者「' + pn + '」あてに 出すので、会社名には 敬称を付けません'
          + '（紙には「' + pn + '　様」と 出ます）。御中 と 様 を 一緒に付けるのは 二重敬称です。' };
    }
    var hit = null;
    for (var i = 0; i < CORP.length; i++) { if (nm.indexOf(CORP[i]) >= 0) { hit = CORP[i]; break; } }
    var counts = {};
    (others || []).forEach(function (p) { var h = honorOf(dataOf(p)); if (h) counts[h] = (counts[h] || 0) + 1; });
    var top = byFreq(HONORS, counts)[0];
    if (hit) {
      return { value: '御中', why: '会社名に「' + hit + '」が入っています＝組織あての紙なので「御中」', kind: 'name' };
    }
    if (top && top.n > 0) {
      return { value: top.v, why: 'ほかの取引先 ' + top.n + '社で いちばん多いのが「' + top.v + '」', kind: 'freq' };
    }
    return { value: '様', why: '会社らしい言葉が入っていないので、人あての「様」にしています', kind: 'name' };
  }

  /* ═══ ②支払期限の約束（よく出る順に並べる） ═══ */
  function termCandidates(terms, others, meId) {
    var counts = {};
    (others || []).forEach(function (p) {
      if (meId && p.id === meId) return;
      var t = dataOf(p).payTerm; var k = t && s(t.kind);
      if (k && k !== 'none') counts[k] = (counts[k] || 0) + 1;
    });
    var keys = (terms || []).map(function (t) { return t.key; });
    /* ★「決めていない」は 数が同じなら いちばん後ろ★（2026-08-18 DB-testの1周で判明）
       手がかりが0の時に 先頭が「決めていない」だと、急いで押した人が
       ★期限の無い請求書★になる。他の候補を先に見せる。 */
    return byFreq(keys, counts).sort(function (a, b) {
      if (a.n !== b.n) return 0;                       // 数が違う並びは byFreq のまま
      if (a.v === 'none' && b.v !== 'none') return 1;
      if (b.v === 'none' && a.v !== 'none') return -1;
      return 0;
    }).map(function (x) {
      var t = (terms || []).filter(function (y) { return y.key === x.v; })[0] || { key: x.v, label: x.v };
      return { key: x.v, label: t.label, n: x.n };
    });
  }

  /* ═══ ③源泉徴収の対象か（この相手への過去の請求＋ほかの取引先） ═══ */
  function gensenGuess(partnerId, invoices, others) {
    var mine = (invoices || []).filter(function (v) {
      return v && v.status === 'issued' && s(v.partner_id) === s(partnerId);
    });
    var on = mine.filter(function (v) { return !!((v.data || {}).gensen); }).length;
    if (mine.length) {
      return on > 0
        ? { value: true, why: 'この相手へ出した ' + mine.length + '通のうち ' + on + '通で 源泉を引いています', kind: 'past' }
        : { value: false, why: 'この相手へ出した ' + mine.length + '通とも 源泉を引いていません', kind: 'past' };
    }
    var yes = (others || []).filter(function (p) { return dataOf(p).gensen === true; }).length;
    var no = (others || []).filter(function (p) { return dataOf(p).gensen === false; }).length;
    if (yes + no > 0) {
      return yes > no
        ? { value: true, why: 'ほかの取引先 ' + yes + '社が「する」（' + no + '社が「しない」）', kind: 'freq' }
        : { value: false, why: 'ほかの取引先 ' + no + '社が「しない」（' + yes + '社が「する」）', kind: 'freq' };
    }
    return { value: false, why: '手がかりがありません（源泉を引くかは ★払う側が決めます★）', kind: 'none' };
  }

  /* ═══ ④住所の頭（都道府県＋市区町村まで）を よく出る順に ═══ */
  function addrHeads(others, meId) {
    var counts = {}, order = [];
    (others || []).forEach(function (p) {
      if (meId && p.id === meId) return;
      var a = s(dataOf(p).addr); if (!a) return;
      var m = a.match(/^(.{2,3}?[都道府県])?(.{1,8}?[市区町村郡])/);
      var head = m ? m[0] : a.slice(0, 6);
      if (!head) return;
      if (counts[head] === undefined) { counts[head] = 0; order.push(head); }
      counts[head]++;
    });
    return byFreq(order, counts).filter(function (x) { return x.n > 0; })
      .map(function (x) { return { head: x.v, n: x.n }; });
  }

  /* ═══ ⑤取引先コード（番号の形が使う時だけ）。空いている番号を当てる ═══ */
  function codeGuess(others, meId) {
    var used = {}, maxN = 0, pre = 'A', had = 0;
    (others || []).forEach(function (p) {
      if (meId && p.id === meId) return;
      var c = s(dataOf(p).code); if (!c) return;
      used[c] = true; had++;
      var m = c.match(/^([A-Za-z]*)(\d+)$/);
      if (m) { if (m[1]) pre = m[1].toUpperCase(); if (Number(m[2]) > maxN) maxN = Number(m[2]); }
    });
    var n = maxN + 1, code;
    do { code = pre + pad3(n); n++; } while (used[code] && n < 10000);
    return {
      value: code,
      why: had
        ? '今 使っている中で いちばん大きいのが ' + pre + pad3(maxN) + ' なので その次'
        : 'まだ1社も付けていないので ' + code + ' から',
      kind: 'freq',
    };
  }

  /* ═══ 聞く順（★使う順＝紙に出る順★） ═══ */
  /**
   * @param {{partner:object, partners:array, invoices:array, terms:array, numberFormat:string}} ctx
   * @returns {{list:array, total:number, done:number, next:object|null, usesCode:boolean}}
   */
  function questions(ctx) {
    var c = ctx || {};
    var p = c.partner || null;
    var d = dataOf(p);
    var ok = d.askOk || {};
    var others = (c.partners || []).filter(function (x) { return !p || x.id !== p.id; });
    var terms = c.terms || [];
    var usesCode = s(c.numberFormat) === 'p-ym-seq';
    var list = [];

    list.push({
      key: 'name', q: 'この相手の 会社名は？', kind: 'text', now: s(d.name),
      hint: '紙のあて名の1行目に そのまま出ます。',
      guess: null, done: !!s(d.name),
      result: function (v) {
        return s(v) ? '紙のあて名は「' + s(v) + (honorOf(d) ? '　' + honorOf(d) : '') + '」になります。' : '';
      },
    });

    list.push({
      key: 'honor', q: '「' + (s(d.name) || 'この相手') + '」の あとに付けるのは？', kind: 'pick',
      options: HONORS.map(function (h) { return { v: h, t: h }; }),
      now: honorOf(d), guess: honorGuess(d.name, others, d.person), done: !!ok.honor,
      hint: '紙のあて名の1行目に出ます。',
      result: function (v) {
        var h = (v === '（なし）') ? '' : s(v);
        return '紙のあて名は「' + (s(d.name) || '（会社名）') + (h ? '　' + h : '') + '」になります。';
      },
    });

    list.push({
      key: 'person', q: 'あて名に 担当者の名前を出しますか？', kind: 'text',
      now: s(d.person), guess: null, done: !!ok.person,
      skipLabel: '出さない', hint: 'あて名の2行目に「◯◯　様」と出ます。要らなければ「出さない」。',
      result: function (v) { return s(v) ? '2行目に「' + s(v) + '　様」と出ます。' : '2行目は出しません。'; },
    });

    var tc = termCandidates(terms, others, p && p.id);
    list.push({
      key: 'payTerm', q: 'いつまでに もらう約束ですか？', kind: 'pick',
      options: tc.map(function (t) { return { v: t.key, t: t.label + (t.n ? '（ほか ' + t.n + '社）' : '') }; }),
      now: (d.payTerm && s(d.payTerm.kind)) || '',
      guess: (tc[0] && tc[0].n)
        ? { value: tc[0].key, why: 'ほかの取引先 ' + tc[0].n + '社が この約束', kind: 'freq' } : null,
      done: !!ok.payTerm,
      hint: '請求日から 支払期限を自動で作ります（紙に出ます）。',
      /* ★日付の計算は seikyu-doc が持ち主★（ここで別に作ると 2か所が別々に答える） */
      result: null,
    });

    var gg = gensenGuess(p && p.id, c.invoices, others);
    list.push({
      key: 'gensen', q: 'この相手の請求では 源泉徴収を引きますか？', kind: 'yesno',
      now: (d.gensen === true ? 'yes' : d.gensen === false ? 'no' : ''),
      guess: { value: gg.value ? 'yes' : 'no', why: gg.why, kind: gg.kind },
      done: !!ok.gensen,
      hint: '引くかどうかを決めるのは ★払う側（この相手）★です。1通ごとに変える事も出来ます。',
      result: function (v) {
        return v === 'yes'
          ? 'これから作る請求書は 最初から「源泉徴収する」で出ます。'
          : 'これから作る請求書は 源泉を引きません。';
      },
    });

    var ah = addrHeads(others, p && p.id);
    list.push({
      key: 'addr', q: '住所は？', kind: 'text', now: s(d.addr),
      chips: ah.map(function (x) { return { v: x.head, t: x.head + '（' + x.n + '社）' }; }),
      guess: null, done: !!ok.addr, skipLabel: '入れない',
      hint: '★ふだんの紙（PDF）のあて名の下には 出しません★（司さん 2026-08-16）。'
        + '自社の Excel の様式を使う時だけ 出ます。',
      result: function (v) { return s(v) ? 'Excel の様式では あて名の下に出ます。' : '住所は持ちません。'; },
    });

    if (usesCode) {
      list.push({
        key: 'code', q: 'この相手の 取引先コードは？', kind: 'text', now: s(d.code),
        guess: codeGuess(others, p && p.id), done: !!ok.code,
        hint: '★請求番号の形を「取引先＋年月＋連番」にしているので★ この相手のコードが要ります。',
        result: function (v) { return s(v) ? '請求番号は「' + s(v) + '-YYYYMM-001」の形で作ります。' : ''; },
      });
    }

    var done = list.filter(function (x) { return x.done; }).length;
    var next = list.filter(function (x) { return !x.done; })[0] || null;
    return { list: list, total: list.length, done: done, next: next, usesCode: usesCode };
  }

  return {
    HONORS: HONORS, CORP: CORP,
    byFreq: byFreq, honorGuess: honorGuess, termCandidates: termCandidates,
    gensenGuess: gensenGuess, addrHeads: addrHeads, codeGuess: codeGuess,
    questions: questions,
  };
});
