/* fake-supa.js — テスト用の偽Supabaseクライアント(メモリ上のテーブル)
 * 目的: suite-data.js を「本物のDBに触らずに」実データ相当で検証する道具。
 *   supabase-js v2 のうち suite-data が使うチェーンだけを実装する:
 *     from(t).select(cols).eq/gte/lte/is/order/limit/maybeSingle/single
 *     from(t).upsert(rows) / update(obj).eq(...) / insert(rows) / delete().eq(...)
 *   すべて thenable(await できる) で {data, error} を返す＝本物と同じ形。
 * ★RLS相当も再現する: account_id != 自分 の行は「見えない・書けない」。
 *   （本番のRLSを模す＝他アカウント遮断のテストが書ける）
 */
'use strict';

function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

function createFakeSupa(opts) {
  opts = opts || {};
  var uid = opts.uid || 'u1';
  var db = opts.tables || {};                 // { tableName: [row, ...] }
  var pk = opts.pk || {};                     // { tableName: 'id' | ['a','b'] }
  // ★一意制約: { tableName: [['account_id','doc_type','no'], …] }
  //   本番の uq_pay_invoices_no のように「主キーとは別に二度使えない組」がある表を再現する。
  //   これが無いと「番号の重複は倉庫が止める」を、倉庫に触らずに測れない。
  var uniques = opts.unique || {};
  var calls = [];                             // 呼び出し記録(検証用)
  var failNext = null;                        // {table, op, message} 次の1回だけ失敗させる
  var nowSeq = 0;
  function now() { nowSeq++; return '2026-07-25T00:00:' + ('0' + nowSeq).slice(-2) + '.000Z'; }

  function rowsOf(t) { if (!db[t]) db[t] = []; return db[t]; }
  function keyOf(t) { return pk[t] || 'id'; }
  function sameKey(t, a, b) {
    var k = keyOf(t);
    var ks = Array.isArray(k) ? k : [k];
    return ks.every(function (x) { return String(a[x]) === String(b[x]); });
  }
  // ★RLS相当: account_id を持つテーブルは自分の行だけ
  function visible(row) { return !('account_id' in row) || String(row.account_id) === String(uid); }

  function Query(table, op, payload) {
    this._t = table; this._op = op; this._payload = payload;
    this._filters = []; this._cols = '*'; this._order = null; this._limit = null; this._single = null;
  }
  Query.prototype.select = function (cols, o) { this._cols = cols || '*'; this._count = !!(o && o.count); return this; };
  Query.prototype.eq = function (c, v) { this._filters.push(function (r) { return String(r[c]) === String(v); }); return this; };
  Query.prototype.gte = function (c, v) { this._filters.push(function (r) { return String(r[c]) >= String(v); }); return this; };
  Query.prototype.lte = function (c, v) { this._filters.push(function (r) { return String(r[c]) <= String(v); }); return this; };
  Query.prototype.is = function (c, v) { this._filters.push(function (r) { return v === null ? (r[c] == null) : (r[c] === v); }); return this; };
  Query.prototype.in = function (c, arr) { this._filters.push(function (r) { return arr.indexOf(r[c]) >= 0; }); return this; };
  Query.prototype.order = function (c, o) { this._order = { c: c, asc: !(o && o.ascending === false) }; return this; };
  Query.prototype.limit = function (n) { this._limit = n; return this; };
  Query.prototype.range = function (a, b) { this._range = { from: a, to: b }; return this; };  // ページング(両端含む)
  Query.prototype.maybeSingle = function () { this._single = 'maybe'; return this; };
  Query.prototype.single = function () { this._single = 'one'; return this; };

  Query.prototype._run = function () {
    var t = this._t, self = this;
    calls.push({ table: t, op: this._op, filters: this._filters.length, payload: clone(this._payload) });
    if (failNext && failNext.table === t && (!failNext.op || failNext.op === this._op)) {
      failNext = null;
      return { data: null, error: { message: 'fake-failure' } };
    }
    var rows = rowsOf(t);

    if (this._op === 'upsert' || this._op === 'insert') {
      var incoming = Array.isArray(this._payload) ? this._payload : [this._payload];
      var written = [];
      for (var i = 0; i < incoming.length; i++) {
        var row = clone(incoming[i]);
        if (!('account_id' in row)) row.account_id = uid;      // DB既定 default auth.uid()
        // ★RLS with check 相当: 他人の account_id では書けない
        if (String(row.account_id) !== String(uid)) return { data: null, error: { message: 'new row violates row-level security policy' } };
        if (!row.updated_at) row.updated_at = now();
        var idx = -1;
        for (var j = 0; j < rows.length; j++) { if (sameKey(t, rows[j], row)) { idx = j; break; } }
        // ★一意制約: 主キーが違うのに、二度使えない組が同じ行が既にある → 弾く
        var uq = uniques[t] || [];
        for (var u = 0; u < uq.length; u++) {
          var cols = uq[u];
          for (var k2 = 0; k2 < rows.length; k2++) {
            if (sameKey(t, rows[k2], row)) continue;                 // 自分自身の更新は除く
            var same = cols.every(function (c) { return String(rows[k2][c]) === String(row[c]); });
            if (same) {
              return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "uq_' + t + '_' + cols.join('_') + '"' } };
            }
          }
        }
        if (idx >= 0) {
          if (self._op === 'insert') return { data: null, error: { message: 'duplicate key value violates unique constraint' } };
          rows[idx] = Object.assign({}, rows[idx], row);
          written.push(clone(rows[idx]));
        } else { rows.push(row); written.push(clone(row)); }
      }
      return { data: written, error: null };
    }

    var match = rows.filter(function (r) {
      if (!visible(r)) return false;
      return self._filters.every(function (f) { return f(r); });
    });

    if (this._op === 'update') {
      match.forEach(function (r) { Object.assign(r, clone(self._payload)); });
      return { data: match.map(clone), error: null };
    }
    if (this._op === 'delete') {
      match.forEach(function (r) { var k = rows.indexOf(r); if (k >= 0) rows.splice(k, 1); });
      return { data: null, error: null };
    }

    // select
    var out = match.map(clone);
    var total = out.length;                       // count='exact' 相当(絞り込み後・件数上限を掛ける前)
    if (this._order) {
      var c = this._order.c, asc = this._order.asc;
      out.sort(function (a, b) { var x = a[c], y = b[c]; var d = (x > y) - (x < y); return asc ? d : -d; });
    }
    if (this._limit != null) out = out.slice(0, this._limit);
    // ★range(from,to): ページング(両端含む)。order後の並びに対して窓を取る。
    if (this._range) out = out.slice(this._range.from, this._range.to + 1);
    // ★本番PostgRESTは server 側 max-rows(Supabase既定1000)で黙って切る（range窓にも掛かる）。
    //   テストでも再現できるよう opts.maxRows で切って count は「切る前の総数」を返す。
    if (opts.maxRows != null && out.length > opts.maxRows) out = out.slice(0, opts.maxRows);
    if (this._cols && this._cols !== '*') {
      var keep = this._cols.split(',').map(function (s) { return s.trim(); });
      out = out.map(function (r) { var o = {}; keep.forEach(function (k) { if (k in r) o[k] = r[k]; }); return o; });
    }
    if (this._single === 'maybe') return { data: out[0] || null, error: null };
    if (this._single === 'one') return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { message: 'not exactly one row' } };
    return this._count ? { data: out, count: total, error: null } : { data: out, error: null };
  };
  Query.prototype.then = function (res, rej) { try { return Promise.resolve(this._run()).then(res, rej); } catch (e) { return Promise.reject(e); } };
  Query.prototype.catch = function (rej) { return this.then(null, rej); };

  var client = {
    from: function (t) {
      return {
        select: function (cols, o) { var q = new Query(t, 'select'); return q.select(cols, o); },
        upsert: function (rows) { return new Query(t, 'upsert', rows); },
        insert: function (rows) { return new Query(t, 'insert', rows); },
        update: function (obj) { return new Query(t, 'update', obj); },
        delete: function () { return new Query(t, 'delete'); }
      };
    },
    auth: { getUser: function () { return Promise.resolve({ data: { user: uid ? { id: uid, email: uid + '@test.local' } : null } }); } },
    // ── テスト用の覗き窓 ──
    _db: db,
    _calls: calls,
    _uid: function (v) { if (v !== undefined) uid = v; return uid; },
    _failNext: function (table, op) { failNext = { table: table, op: op }; },
    _reset: function () { calls.length = 0; }
  };
  return client;
}

module.exports = { createFakeSupa: createFakeSupa };
