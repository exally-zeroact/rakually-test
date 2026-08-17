/* op-registry.js — オペレーション（業務の単位）を id で引くための唯一の場所。
 *
 *  ★契約の入口はこの1本だけ:  OpRegistry.get(id).engine(inputs)
 *    グリッドも、チャットも、給与アプリも、同じここを通る。
 *    返りは常に { value, cells, warnings, errors, provenance }（成功でも失敗でも同じ形）。
 *
 *  ここに業務ロジックは1行も書かない。置き場所と取り出し口だけ。
 *  設計: docs/SPEC_engine_grid_contract_v0.md
 *
 *  【利用】ブラウザ window.OpRegistry / Node require('./lib/op-registry.js')
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.OpRegistry = api;
  else if (typeof globalThis !== 'undefined') globalThis.OpRegistry = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var OPS = {};

  /* 登録。★同じidの二重登録は黙って上書きせず投げる。
     上書きを許すと「どっちのエンジンで計算したか」が分からなくなる＝provenanceが嘘になる。 */
  function register(op) {
    if (!op || typeof op !== 'object') throw new Error('OpRegistry.register: オペではありません');
    if (!op.id) throw new Error('OpRegistry.register: id がありません');
    if (typeof op.engine !== 'function') throw new Error('OpRegistry.register: ' + op.id + ' に engine がありません');
    if (OPS[op.id]) throw new Error('OpRegistry.register: ' + op.id + ' は既に登録されています（黙って上書きしません）');
    OPS[op.id] = op;
    return op;
  }

  function get(id) { return OPS[id] || null; }
  function has(id) { return !!OPS[id]; }

  /* カタログ。チャットの「何ができるか」一覧／グリッドの関数一覧に使う。 */
  function list() {
    return Object.keys(OPS).sort().map(function (id) {
      var o = OPS[id];
      return { id: o.id, title: o.title || '', desc: o.desc || '', version: o.version || '' };
    });
  }

  /* テスト用（登録をやり直したい時だけ）。本番の流れでは呼ばない。 */
  function _reset() { OPS = {}; }

  return { register: register, get: get, has: has, list: list, _reset: _reset };
});
