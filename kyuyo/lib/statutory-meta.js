/* statutory-meta.js — 法定データの【出典・確認日・指紋】を返す口。
 *
 * ★2026-08-03 に作り直し: 出典・確認日・指紋は【中央 statutory 表が唯一の正】。
 *   このファイルは値を持たず、機械が作った lib/statutory-central.generated.js を読むだけ。
 *   ★人が直すのは中央だけ。★ lib にも手書きすると2箇所に手書きが残り、
 *   どちらを触っても片方が腐る（＝確認日が静かに嘘になる）。
 *   作り直し: node scripts/pull-statutory.mjs ／ ズレ検査: 同 --check（CI）
 *
 * ここに残す物（＝中央に無い物だけ）:
 *   NOTES … 人が書く覚え書き。「何をどこまで確かめたか」「何が未確認か」。
 *           ★数値でも日付でもない。中央の verified_at と競合しない。
 *
 * 指紋の役目: 中央の値から作った指紋と、lib が持つ値から作り直した指紋を突き合わせる。
 *   違えば「値が中央とズレている」＝赤（tests/statutory-freshness.test.mjs）。
 *
 * ★なぜ provenance に要るか
 *   オフラインで内蔵値を使った時こそ「その数字どこですか」と聞かれる。
 *   中央から取れた時は中央の値を、取れない時はこの写しを返す＝どちらでも空にしない。
 *
 * 【利用】ブラウザ window.StatutoryMeta / Node require('./statutory-meta.js')
 */
(function (root, factory) {
  var central = null;
  if (typeof module !== 'undefined' && module.exports) central = require('./statutory-central.generated.js');
  else central = (typeof window !== 'undefined' ? window.StatutoryCentral : (typeof globalThis !== 'undefined' ? globalThis.StatutoryCentral : null));
  var api = factory(central);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.StatutoryMeta = api;
  else if (typeof globalThis !== 'undefined') globalThis.StatutoryMeta = api;
})(typeof self !== 'undefined' ? self : this, function (Central) {
  'use strict';

  /* 安定化JSON → FNV-1a(32bit) を8桁16進で。決定論（OS・改行差で揺れない）。 */
  function sortDeep(v) {
    if (Array.isArray(v)) return v.map(sortDeep);
    if (v && typeof v === 'object') {
      return Object.keys(v).sort().reduce(function (o, k) { o[k] = sortDeep(v[k]); return o; }, {});
    }
    return v;
  }
  function fingerprintOf(data) {
    var s = JSON.stringify(sortDeep(data));
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  /* ★人の覚え書き（中央に無い情報だけ）。値も日付も書かない＝中央と競合させない。 */
  var NOTES = {
    'saitei_chingin:2025': '2026-08-03に厚労省の公式PDF(001571192.pdf)を pdftotext でテキスト化し、47県の額・前年額・発効日と'
      + '全国加重平均を1件ずつ突き合わせた（不一致0）。並び順は同PDF本文の並びと、東京(10/3)・大阪(10/16)・北海道(10/4)・'
      + '青森(11/21)を各労働局ページで別途確認して裏を取った。★判定は県ごとの発効日で分けている（lib の chinginOn / monthSplit）。'
      + '令和8年度は目安答申のみで実額未確定＝未収録（推測値を入れない）。',
    'shakaihoken:2026': '2026-08-03に協会けんぽの令和8年度ページを開き、東京9.85%/大阪10.13%/北海道10.28%/佐賀10.55%/沖縄9.44%・'
      + '介護1.62%・子ども子育て支援金0.23% を突き合わせた（47県のうち5県）。厚年18.3%固定・労使折半は日本年金機構で確認。'
      + '★2026-08-03に指示役が中央の確認日と出典も更新済み（値は1文字も変えていない）。',
    'koyo:2026': '2026-08-03に厚労省(愛知労働局)の令和8年度ページを開き、一般=労5/1000・事業主8.5/1000、建設=労6・事10.5、'
      + '農林=労6・事9.5 を突き合わせた。★元の出典URL(koyouhoken_ryouritsu.html)は2026-08-03時点で404だったため、'
      + '指示役が中央の出典を上のページへ差し替え、確認日も更新済み。',
    'shouhizei:2019': '2026-08-03に国税庁No.6101を開き、標準10%（うち地方消費税2.2%）・軽減8%（うち1.76%）を突き合わせた。'
      + '★2026-08-03に指示役が中央の確認日も更新済み。',
  };

  function keyOf(kind, year) { return kind + ':' + year; }
  function centralMeta() { return (Central && Central.META) || {}; }
  function get(kind, year) {
    var m = centralMeta()[keyOf(kind, year)];
    if (!m) return null;
    return {
      source_url: m.source_url || null, verified_at: m.verified_at || null,
      fingerprint: m.fingerprint || null, note: NOTES[keyOf(kind, year)] || null,
    };
  }
  function keys() { return Object.keys(centralMeta()).sort(); }
  function all() { return keys().reduce(function (o, k) { var p = k.split(':'); o[k] = get(p[0], +p[1]); return o; }, {}); }

  return { get: get, keys: keys, all: all, keyOf: keyOf, fingerprintOf: fingerprintOf, sortDeep: sortDeep, NOTES: NOTES };
});
