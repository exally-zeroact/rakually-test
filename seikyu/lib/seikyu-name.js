/* seikyu-name.js — ★保存/DL/PDF の「推奨ファイル名」を中身から作る★
 * ==============================================================================
 * なぜ要るのか:
 *   落とした物が「請求書.pdf」「download(3).xlsx」だと、客の手元で ★どれが何か分からない★。
 *   探せない・間違えて送る・上書きする。だから ★中身（日付・相手・種類・金額）から名前を作り、
 *   落とす前に画面に出して人が直せるようにする★（司さんの決まり・全アプリ共通）。
 *
 * 例) 20260930_藤原建設株式会社_請求書_142660.pdf
 *
 * ★端（実測してテストに埋めてある）★
 *   ・相手が空       → 「取引先未選択」（空欄を作らない）
 *   ・日付が読めない → 「日付未定」（今日の日付を勝手に入れない＝紙と食い違う名前を作らない）
 *   ・合計がマイナス → 先頭に「-」（返金の請求だと名前で分かる）
 *   ・使えない文字   → \ / : * ? " < > | と制御文字を「_」に（Windows/iOS/Android どれでも落とせる）
 *   ・長すぎ         → ★相手の名前だけを削って全体を収める★（日付・種類・金額は消さない）
 *
 * ★画面に依らない（DOMを1つも触らない）／時計を持たない★＝素のNodeで全パターン回せる。
 *
 * 【利用】ブラウザ window.SeikyuName ／ Node require('./seikyu-name.js')
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SeikyuName = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* 落とせる種類。★ここに無い拡張子は名前を作らない（js/file-out.js の MIME と揃える）★ */
  var EXTS = ['pdf', 'xlsx', 'csv'];

  /* ★領収書は doc_type ではない★（棚を増やさない）が、落とす紙としては3種類目。
     呼び名は seikyu-doc.js の DOC_LABEL と同じ物にする（画面・紙・ファイル名で別々に書かない）。 */
  var KIND_LABEL = { invoice: '請求書', quote: '見積書', receipt: '領収書' };

  var NO_PARTNER = '取引先未選択';
  var NO_DATE = '日付未定';

  /* ファイル名の全体の長さの上限（拡張子込み）。
     255 が多くのファイルシステムの上限だが、クラウド同期や zip でさらに縮む物があるので余裕を取る。 */
  var MAX_LEN = 120;
  /* 相手の名前だけはここまで削る（これ以下には削らない＝誰宛か分からない名前にしない） */
  var MIN_PARTNER = 4;

  /* ★ファイル名に使えない文字を落とす★
     Windows: \ / : * ? " < > |  ／ 制御文字 ／ 末尾の . と空白（Windowsが黙って消す）
     区切りに使う "_" を潰さないよう、置き換え先も "_" にして連続は1つにまとめる。 */
  function sanitize(s) {
    var t = String(s == null ? '' : s);
    t = t.replace(/[\\/:*?"<>|]/g, '_');
    // ★制御文字（改行・タブ・NUL など）は正規表現に書かず文字コードで判定する。
    //   ソースに生の制御文字を紛れ込ませないため（見えない文字はレビューで消えない）。
    t = t.split('').map(function (c) { var n = c.charCodeAt(0); return (n < 32 || n === 127) ? '_' : c; }).join('');
    t = t.replace(/\s+/g, ' ').trim();          // 連続する空白は1つに
    t = t.replace(/^[.\s]+|[.\s]+$/g, '');      // 先頭末尾の . と空白
    t = t.replace(/_{2,}/g, '_');
    return t;
  }

  /* 'YYYY-MM-DD' → 'YYYYMMDD'。読めなければ空（★今日を勝手に入れない★） */
  function ymd8(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
    if (!m) return '';
    var y = +m[1], mo = +m[2], d = +m[3];
    var t = new Date(Date.UTC(y, mo - 1, d));
    if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return '';
    return m[1] + m[2] + m[3];
  }

  /* 金額。整数でなければ空にせず四捨五入しない＝★作れない時は '金額不明'★（0円と混ぜない） */
  function moneyPart(v) {
    if (v === undefined || v === null || v === '') return '金額不明';
    var n = Number(v);
    if (!Number.isFinite(n)) return '金額不明';
    if (!Number.isInteger(n)) return '金額不明';
    return String(n); // マイナスはそのまま先頭に '-' が付く
  }

  /**
   * suggest({ docType, issueYmd, partnerName, grandTotal, ext })
   *   → '20260930_藤原建設株式会社_請求書_142660.pdf'
   * ★呼ぶ側はこれを画面に出して、人が直したうえで落とす★
   */
  function suggest(o) {
    o = o || {};
    var ext = String(o.ext || '').toLowerCase().replace(/^\./, '');
    if (EXTS.indexOf(ext) < 0) {
      throw new Error('この種類のファイル名は作れません（' + (o.ext || '(空)') + '）。使えるのは ' + EXTS.join(' / '));
    }
    var kind = KIND_LABEL[o.docType || 'invoice'] || KIND_LABEL.invoice;
    var date = ymd8(o.issueYmd) || NO_DATE;
    var partner = sanitize(o.partnerName) || NO_PARTNER;
    var money = moneyPart(o.grandTotal);

    var tail = '_' + kind + '_' + money + '.' + ext;
    var head = date + '_';
    var room = MAX_LEN - head.length - tail.length;
    if (partner.length > room) {
      // ★削るのは相手の名前だけ。日付・種類・金額は消さない（何の紙か分からなくなるので）
      partner = partner.slice(0, Math.max(MIN_PARTNER, room));
    }
    return sanitizeJoin(head + partner + tail);
  }

  /* 組み立てたあとの最終掃除（連続 "_" と末尾の "_" だけ。拡張子は触らない） */
  function sanitizeJoin(name) {
    var m = /^(.*)(\.[A-Za-z0-9]+)$/.exec(name);
    var body = m ? m[1] : name, ext = m ? m[2] : '';
    body = body.replace(/_{2,}/g, '_').replace(/_+$/, '');
    return body + ext;
  }

  return {
    suggest: suggest,
    sanitize: sanitize,
    ymd8: ymd8,
    EXTS: EXTS,
    KIND_LABEL: KIND_LABEL,
    NO_PARTNER: NO_PARTNER,
    NO_DATE: NO_DATE,
    MAX_LEN: MAX_LEN,
  };
});
