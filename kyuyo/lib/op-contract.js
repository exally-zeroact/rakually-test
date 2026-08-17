/* op-contract.js — オペレーション契約の型とバリデータ（headless・依存ゼロ）
 *
 * 目的: オペレーションの入口で境界を張る。「嘘の成功」を返さないための土台。
 *   ・検証NG → value を作らず errors を返す（0円の結果を黙って返さない）
 *   ・errors は {path, code, message} の構造。path は employees[3].fuyou 形式で場所が分かる
 *
 * 型: 'ym'|'ymd'|'string'|'int'|'number'|'bool'|'enum'|'array'|'object'|'map'
 * 制約: required / min / max / pattern / values(enum) / of(要素spec) / minLength
 *
 * 【利用】ブラウザ window.OpContract / Node require('./op-contract.js')
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.OpContract = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
  var YMD_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

  function isNumeric(v) {
    if (typeof v === 'number') return isFinite(v);
    if (typeof v !== 'string') return false;
    if (String(v).trim() === '') return false;
    return !isNaN(Number(String(v).replace(/[, ]/g, '')));
  }

  function err(path, code, message) { return { path: path, code: code, message: message }; }

  // 1つの値を spec に照らして検証。errors を out に積む。
  function checkValue(val, spec, path, out) {
    var t = spec.type;
    var empty = (val === undefined || val === null || val === '');
    if (empty) {
      if (spec.required) out.push(err(path, 'REQUIRED', (spec.label || path) + ' は必須です'));
      return;
    }
    switch (t) {
      case 'ym':
        if (typeof val !== 'string' || !YM_RE.test(val)) out.push(err(path, 'PATTERN', 'YYYY-MM 形式（01〜12月）で指定してください: ' + JSON.stringify(val)));
        break;
      case 'ymd':
        if (typeof val !== 'string' || !YMD_RE.test(val)) out.push(err(path, 'PATTERN', 'YYYY-MM-DD 形式で指定してください: ' + JSON.stringify(val)));
        break;
      case 'string':
        if (typeof val !== 'string') out.push(err(path, 'TYPE', '文字列で指定してください'));
        else if (spec.pattern && !spec.pattern.test(val)) out.push(err(path, 'PATTERN', '形式が不正です: ' + val));
        break;
      case 'enum':
        // ★正の値そのものは当然OK。別名(実データの書き方)は normalizeInputs が手前で寄せてある。
        if ((spec.values || []).indexOf(val) < 0) out.push(err(path, 'ENUM', '次のいずれかにしてください（' + (spec.values || []).join('/') + '）: ' + JSON.stringify(val)));
        break;
      case 'int':
      case 'number': {
        if (!isNumeric(val)) { out.push(err(path, 'TYPE', '数値で指定してください: ' + JSON.stringify(val))); break; }
        var n = Number(String(val).replace(/[, ]/g, ''));
        if (t === 'int' && !Number.isInteger(n)) out.push(err(path, 'TYPE', '整数で指定してください: ' + val));
        if (spec.min != null && n < spec.min) out.push(err(path, 'RANGE', spec.min + ' 以上にしてください: ' + val));
        if (spec.max != null && n > spec.max) out.push(err(path, 'RANGE', spec.max + ' 以下にしてください: ' + val));
        break;
      }
      case 'bool':
        if (typeof val !== 'boolean') out.push(err(path, 'TYPE', 'true/false で指定してください'));
        break;
      case 'array': {
        if (!Array.isArray(val)) { out.push(err(path, 'TYPE', '配列で指定してください')); break; }
        if (spec.minLength != null && val.length < spec.minLength) out.push(err(path, 'RANGE', spec.minLength + '件以上必要です（現在 ' + val.length + '件）'));
        if (spec.of) val.forEach(function (x, i) { checkShape(x, spec.of, path + '[' + i + ']', out); });
        break;
      }
      case 'object':
        if (typeof val !== 'object' || Array.isArray(val)) { out.push(err(path, 'TYPE', 'オブジェクトで指定してください')); break; }
        if (spec.of) checkShape(val, spec.of, path, out);
        break;
      case 'map': {
        if (typeof val !== 'object' || Array.isArray(val)) { out.push(err(path, 'TYPE', 'オブジェクト（キー→値）で指定してください')); break; }
        if (spec.of) Object.keys(val).forEach(function (k) { checkValue(val[k], spec.of, path + '.' + k, out); });
        break;
      }
      default:
        out.push(err(path, 'SHAPE', '未知の型指定: ' + t));
    }
  }

  // オブジェクトの各フィールドを spec(map: key→spec) で検証
  function checkShape(obj, shape, path, out) {
    if (obj == null || typeof obj !== 'object') { out.push(err(path, 'TYPE', 'オブジェクトで指定してください')); return; }
    Object.keys(shape).forEach(function (k) {
      checkValue(obj[k], shape[k], path ? path + '.' + k : k, out);
    });
  }

  // inputs 全体を op.inputs（配列）で検証
  function validateInputs(inputs, inputSpecs) {
    var out = [];
    inputs = inputs || {};
    (inputSpecs || []).forEach(function (spec) {
      checkValue(inputs[spec.key], spec, spec.key, out);
    });
    return { ok: out.length === 0, errors: out };
  }

  // オペレーション定義のヘルパ。engine を包んで「検証NGなら value を作らない」を強制する。
  /* ══ ★実データの書き方を、契約の値へ寄せる（検証の手前で1回だけ） ══════
   *  なぜ（2026-08-04・司さんの実機で機能が死んだ）:
   *    契約は employmentType を英語(employee/contractor)と決めていたが、
   *    ★実データは日本語(従業員/業務委託)★ だった。検証で弾かれてExcelが1枚も出なくなった。
   *  ★決まり:
   *    ・アプリの実データが正。契約が英語で持ちたいなら【契約に入る手前】で寄せる。
   *    ・面が持っている値は書き換えない（渡された物の写しだけを直す）。
   *    ・★対応表は spec.aliases の1箇所だけ★（2箇所に書いたらまたズレる）。
   *    ・対応表に無い値は【寄せない】＝そのまま検証へ行って弾かれる。
   *      黙って既定に寄せると、業務委託の人を従業員として計算する等、★お金が変わる★ため。
   */
  function normalizeValue(val, spec) {
    if (!spec || spec.type !== 'enum' || !spec.aliases) return val;
    if (typeof val !== 'string') return val;
    if ((spec.values || []).indexOf(val) >= 0) return val;          // 正の値はそのまま
    var k = val.trim();
    return Object.prototype.hasOwnProperty.call(spec.aliases, k) ? spec.aliases[k] : val;
  }
  function normalizeShape(obj, shape) {
    if (!obj || typeof obj !== 'object' || !shape) return obj;
    var out = Array.isArray(obj) ? obj.slice() : Object.assign({}, obj);
    Object.keys(shape).forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(out, k)) out[k] = normalizeValue(out[k], shape[k]);
    });
    return out;
  }
  /* inputs の写しを作って、決まった値の書き方だけ寄せる（元の inputs は触らない）。 */
  function normalizeInputs(inputs, inputSpecs) {
    if (!inputs || typeof inputs !== 'object') return inputs;
    var out = Object.assign({}, inputs);
    (inputSpecs || []).forEach(function (spec) {
      var v = out[spec.key];
      if (v === undefined || v === null) return;
      if (spec.type === 'array' && spec.of && Array.isArray(v)) out[spec.key] = v.map(function (x) { return normalizeShape(x, spec.of); });
      else if (spec.type === 'object' && spec.of) out[spec.key] = normalizeShape(v, spec.of);
      else out[spec.key] = normalizeValue(v, spec);
    });
    return out;
  }

  function defineOperation(def) {
    var raw = def.engine;
    var op = Object.assign({}, def);
    op.normalize = function (inputs) { return normalizeInputs(inputs, def.inputs); };
    op.validate = function (inputs) { return validateInputs(op.normalize(inputs), def.inputs); };
    op.engine = function (inputs) {
      inputs = op.normalize(inputs);          // ★寄せてから検証・計算（元の inputs は触らない）
      var v = validateInputs(inputs, def.inputs);
      if (!v.ok) {
        // ★嘘の成功を返さない: 検証NGでは計算せず、value=null と errors を返す
        return { value: null, cells: null, warnings: [], errors: v.errors, provenance: { op: def.id, version: def.version, validated: false } };
      }
      return raw(inputs);
    };
    return op;
  }

  return { validateInputs: validateInputs, normalizeInputs: normalizeInputs, defineOperation: defineOperation, checkShape: checkShape, checkValue: checkValue, isNumeric: isNumeric, YM_RE: YM_RE, YMD_RE: YMD_RE };
});
