/* seikyu-items.js — ★よく使う品目（品名を選ぶと 単位・単価・税率が 入る）★
 * ============================================================================
 * ★司さん 2026-08-30「ほかの競合のアプリなどが 当たり前にしてる事は こちらも
 *   当たり前にしてな」★
 *   freee も Misoca も ★品目マスタ★を持っていて、
 *   「登録しておくと 次からは 選ぶだけ」＝毎回 単価を打ち直さなくてよい。
 *   うちは 毎回 一から打たせていた。
 *
 * ★うちのやり方＝登録させない。過去の紙から 覚える★
 *   うちの決まりは「★聞いてあげる。埋めさせない★」。
 *   競合は ★人に登録させてから 選ばせる★（＝先に仕事が1つ増える）。
 *   うちは ★もう出した紙に 答えが書いてある★ので、そこから 数えて出す。
 *   ＝初めて使う人でも 準備が要らない。2通目から 勝手に楽になる。
 *
 * ★決め方★
 *   ・よく使う順（同じ回数なら 新しい順）
 *   ・同じ品名で 単価が違う時は ★いちばん新しい単価★（値上げしたら そちらに付いていく）
 *   ・★下書き・取り消しも 数に入れる★（打った品名は 打った事実＝候補に出してよい）
 *     ただし ★金額は 出した紙（issued）を 先に見る★（下書きの打ち間違いを 単価にしない）
 *   ・空の品名は 覚えない
 *
 * 公開API（window.SeikyuItems）:
 *   .learn(invoices, opts)   … 過去の紙から よく使う品目を数える
 *   .find(list, name)        … その品名の品目（無ければ null）
 *   .fill(line, item)        … ★空いている所だけ★ 埋めた新しい行を返す（打った物は 消さない）
 */
(function (global) {
  'use strict';

  var LIMIT = 40;                 // 候補に出す上限（多すぎると 選べない）

  function s(v) { return String(v === undefined || v === null ? '' : v).trim(); }

  /** 過去の紙から よく使う品目を数える。返り = [{name,unit,price,rate,nontax,n,lastYmd}] */
  function learn(invoices, opts) {
    var o = opts || {};
    var limit = o.limit || LIMIT;
    var kind = o.kind || null;                       // 種類で絞りたい時だけ
    var by = {};
    (invoices || []).forEach(function (v) {
      if (!v) return;
      if (kind && (v.doc_type || 'invoice') !== kind) return;
      var ymd = s(v.issue_ymd);
      var issued = (v.status === 'issued');
      (v.lines || []).forEach(function (ln) {
        var name = s(ln && ln.name);
        if (!name) return;
        var it = by[name] || (by[name] = { name: name, unit: '', price: '', rate: undefined,
          nontax: false, n: 0, lastYmd: '', priceYmd: '', priceIssued: false });
        it.n++;
        if (ymd > it.lastYmd) it.lastYmd = ymd;
        /* ★値段は「出した紙」を 先に信じる★＝下書きの打ちかけを 単価にしない。
           同じ強さなら 新しい方（値上げに 付いていく）。 */
        var price = s(ln.price);
        if (price !== '') {
          var better = (issued && !it.priceIssued) || ((issued === it.priceIssued) && ymd >= it.priceYmd);
          if (better) {
            it.price = price;
            it.unit = s(ln.unit) || it.unit;
            it.rate = (ln.rate === undefined || ln.rate === null || ln.rate === '') ? it.rate : ln.rate;
            it.nontax = !!ln.nontax;
            it.priceYmd = ymd; it.priceIssued = issued;
          }
        } else if (!it.unit) {
          it.unit = s(ln.unit) || it.unit;
        }
      });
    });
    return Object.keys(by).map(function (k) { return by[k]; })
      .sort(function (a, b) {
        if (b.n !== a.n) return b.n - a.n;
        return (b.lastYmd || '').localeCompare(a.lastYmd || '');
      })
      .slice(0, limit);
  }

  /** その品名の品目（大文字小文字・前後の空白は そろえて比べる） */
  function find(list, name) {
    var q = s(name);
    if (!q) return null;
    for (var i = 0; i < (list || []).length; i++) {
      if (s(list[i] && list[i].name) === q) return list[i];
    }
    return null;
  }

  /** ★空いている所だけ★ 埋める。★人が打った物は 1文字も 上書きしない★
   *  返り = { line, filled:[…] }（何を入れたかを 画面で言える様に） */
  function fill(line, item) {
    var ln = Object.assign({}, line || {});
    var filled = [];
    if (!item) return { line: ln, filled: filled };
    if (s(ln.unit) === '' && s(item.unit) !== '') { ln.unit = item.unit; filled.push('単位'); }
    if (s(ln.price) === '' && s(item.price) !== '') { ln.price = item.price; filled.push('単価'); }
    if ((ln.rate === undefined || ln.rate === null || ln.rate === '')
      && item.rate !== undefined && item.rate !== null && item.rate !== '') {
      ln.rate = item.rate;
      ln.nontax = !!item.nontax;
      filled.push('税率');
    }
    if (s(ln.qty) === '') { ln.qty = '1'; filled.push('数量'); }
    return { line: ln, filled: filled };
  }

  var API = { learn: learn, find: find, fill: fill, LIMIT: LIMIT };
  global.SeikyuItems = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
