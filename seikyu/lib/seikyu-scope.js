/* seikyu-scope.js — ★紙の作りを「誰が決めるか」を 1か所で決める★
 * =============================================================================
 * ★なぜ要るか★（司さん 2026-08-29
 *   「これは取引先ごとに請求書の様式をちゃんと設定できてる前提やけど その認識で合ってるか？」
 *    ＋前便「そのパターンは 八木工業だけやし 代行や空調系は また違うやろ」）
 *
 * ★直す前の実測★
 *   様式(template)  … 1通ごと（inv.template_id）＋その相手の前回から当てる
 *   明細の列 / 紙の行数 / 件名を紙に出すか … ★会社ぜんぶで1つ★（org）
 *   ⇒ ★「八木工業だけ 摘要の列が要る」が 出来なかった★
 *
 * ★決めた順番（強い順）★
 *   ① 出してしまった紙の写し（snapshot）… ★出した紙は 後から変えない★
 *   ② その1通（inv.data）             … その紙だけ 変えたい時
 *   ③ ★この相手の上書き（partner.data.paper）★ ← ここを 足した
 *   ④ 会社の既定（org）
 *   ⑤ 様式の初期値
 *
 * ★決まり★
 *   ・上書きが ★無い相手は ④のまま★＝★今までと 1ドットも 変わらない★
 *   ・「空欄」と「0」は 別物（0＝枠を作らず 詰める）。空欄＝決めていない。
 *   ・★どこで決まったか(from)も 返す★＝画面が「会社の既定のまま」と言えるようにする為。
 *     （言えないと、客は ★なぜ この紙になったのか★ 分からない）
 *
 * 【利用】ブラウザ window.SeikyuScope ／ Node require('./seikyu-scope.js')
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SeikyuScope = api;
  else if (typeof globalThis !== 'undefined') globalThis.SeikyuScope = api;
})(this, function () {
  'use strict';

  /** 相手ごとに 上書きできる物（★増やす時は ここと 画面の両方★） */
  var KEYS = [
    { key: 'template', label: '様式（どの紙で出すか）' },
    { key: 'cols', label: '明細の列' },
    { key: 'paperRows', label: '紙の明細の行数' },
    { key: 'subjectOn', label: '件名を紙に出すか' },
  ];

  function has(v) {
    if (v === undefined || v === null || v === '') return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') {
      if (Array.isArray(v.items)) return v.items.length > 0;
      return Object.keys(v).length > 0;
    }
    return true;
  }
  /** 0 を 落とさない（★空欄と 0 は 別物★） */
  function hasNum(v) { return !(v === undefined || v === null || v === ''); }

  function dataOf(x) { return (x && x.data) || {}; }
  /** この相手の上書き（無ければ空） */
  function partnerPaper(partner) {
    var p = dataOf(partner).paper;
    return (p && typeof p === 'object') ? p : {};
  }

  /**
   * 1つの決まりを 誰が決めたか
   * @param {string} key    KEYS のどれか
   * @param {object} src    { snapshot, inv, partner, org }（それぞれ 生の値）
   * @return {{value:*, from:'snapshot'|'inv'|'partner'|'org'|'none'}}
   */
  function pick(key, src) {
    var s = src || {};
    var isNum = (key === 'paperRows');
    var ok = isNum ? hasNum : has;
    if (ok(s.snapshot)) return { value: s.snapshot, from: 'snapshot' };
    if (ok(s.inv)) return { value: s.inv, from: 'inv' };
    if (ok(s.partner)) return { value: s.partner, from: 'partner' };
    if (ok(s.org)) return { value: s.org, from: 'org' };
    return { value: null, from: 'none' };
  }

  /**
   * 相手の上書きを 1枚に並べる（画面が「会社の既定のまま」と言える為）
   * @return [{ key, label, over:boolean, value }]
   */
  function overridesOf(partner) {
    var p = partnerPaper(partner);
    return KEYS.map(function (k) {
      var isNum = (k.key === 'paperRows');
      var over = isNum ? hasNum(p[k.key]) : has(p[k.key]);
      return { key: k.key, label: k.label, over: over, value: over ? p[k.key] : null };
    });
  }

  /** 相手の上書きが 1つでも在るか */
  function hasOverride(partner) {
    return overridesOf(partner).some(function (x) { return x.over; });
  }

  /** どこで決まったかを 人の言葉で（★根拠を そのまま出す★） */
  var FROM_WORD = {
    snapshot: 'この紙は もう出した物なので、出した時のまま',
    inv: 'この1通だけの決めごと',
    partner: 'この相手だけの決めごと',
    org: '会社の既定',
    none: '様式の初期値',
  };
  function fromWord(from) { return FROM_WORD[from] || FROM_WORD.none; }

  /**
   * まとめて解く（画面は これ1つを呼ぶ＝★2か所で 別々に判定しない★）
   * @param {object} a { inv, partner, org }  ※ org は settings() の返り
   * @return { template:{value,from}, cols:{...}, paperRows:{...}, subjectOn:{...} }
   */
  function resolve(a) {
    var o = a || {}, inv = o.inv || {}, org = o.org || {};
    var pp = partnerPaper(o.partner);
    var d = dataOf(inv);
    var snap = inv.snapshot || {};
    /* ★出してしまった紙は 写しのまま★（列だけ 写しを持っている） */
    var issued = !!(inv.id && inv.status && inv.status !== 'draft');
    return {
      template: pick('template', {
        snapshot: issued ? inv.template_id : null,
        inv: inv.template_id, partner: pp.template, org: org.template,
      }),
      cols: pick('cols', {
        snapshot: (snap.cols && snap.cols.items && snap.cols.items.length) ? snap.cols : null,
        inv: d.cols, partner: pp.cols, org: org.cols,
      }),
      paperRows: pick('paperRows', {
        snapshot: null, inv: d.paperRows, partner: pp.paperRows, org: org.paperRows,
      }),
      subjectOn: pick('subjectOn', {
        snapshot: null, inv: null,
        partner: (pp.subjectOn === true || pp.subjectOn === false) ? pp.subjectOn : null,
        org: ((org.paperStyle || {}).subjectOn === true) ? true : null,
      }),
    };
  }

  return {
    KEYS: KEYS, pick: pick, resolve: resolve,
    overridesOf: overridesOf, hasOverride: hasOverride,
    partnerPaper: partnerPaper, fromWord: fromWord,
    _has: has, _hasNum: hasNum,
  };
});
