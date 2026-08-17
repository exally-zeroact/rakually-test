/* zengin.js — 全銀協規定形式「総合振込」固定長ファイル(120バイト/レコード)の生成(純関数)。
 * 【一次情報】全国銀行協会規定フォーマット(総合振込)。各行公式レイアウト照合(大分銀行/神奈川銀行/SMBC 2026-07)。
 *   レコード長=120バイト・半角文字(カナ/英大/数字/一部記号)。N=数字(右詰・前0埋)、C=半角文字(左詰・後スペース)。
 *   構成: ヘッダー(区分1)＋データ(区分2・件数分)＋トレーラー(区分8・合計件数/金額)＋エンド(区分9)。
 *   ヘッダー: 区分1(1)+種別"21"(2)+コード区分"0"(1)+委託者コード(10N)+委託者名(40C)+取組日MMDD(4N)+仕向銀行番号(4N)+仕向銀行名(15C)+仕向支店番号(3N)+仕向支店名(15C)+預金種目(1N)+口座番号(7N)+ダミー(17)=120
 *   データ: 区分2(1)+被仕向銀行番号(4N)+被仕向銀行名(15C)+被仕向支店番号(3N)+被仕向支店名(15C)+手形交換所(4N)+預金種目(1N)+口座番号(7N)+受取人名(30C)+振込金額(10N)+新規コード(1N)+顧客コード1(10C)+顧客コード2(10C)+振込区分(1N)+識別表示(1C)+ダミー(7)=120
 *   トレーラー: 区分8(1)+合計件数(6N)+合計金額(12N)+ダミー(101)=120  / エンド: 区分9(1)+ダミー(119)=120
 * 【出力】.text=120桁×行(改行は下の NEWLINES) / .bytes=Shift-JIS(Uint8Array)。実銀行に上げるのはbytes(Shift-JIS)。
 * 【★改行コード】★銀行ごとに違う＝1つに固定してはいけない★。既定は CRLF(=今まで通っている形)。
 *   変わるのは会社の設定で選んだ時だけ。一次情報の対応表は docs/zengin-newline-banks.md。
 * 【利用】ブラウザ window.Zengin / Node require('./zengin.js')
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.Zengin = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── 全角→半角カナ変換(受取人名・委託者名は半角カナで格納)。濁点/半濁点は独立文字に分解 ──
  var KANA = { 'ガ':'ｶﾞ','ギ':'ｷﾞ','グ':'ｸﾞ','ゲ':'ｹﾞ','ゴ':'ｺﾞ','ザ':'ｻﾞ','ジ':'ｼﾞ','ズ':'ｽﾞ','ゼ':'ｾﾞ','ゾ':'ｿﾞ','ダ':'ﾀﾞ','ヂ':'ﾁﾞ','ヅ':'ﾂﾞ','デ':'ﾃﾞ','ド':'ﾄﾞ','バ':'ﾊﾞ','ビ':'ﾋﾞ','ブ':'ﾌﾞ','ベ':'ﾍﾞ','ボ':'ﾎﾞ','パ':'ﾊﾟ','ピ':'ﾋﾟ','プ':'ﾌﾟ','ペ':'ﾍﾟ','ポ':'ﾎﾟ','ヴ':'ｳﾞ',
    'ア':'ｱ','イ':'ｲ','ウ':'ｳ','エ':'ｴ','オ':'ｵ','カ':'ｶ','キ':'ｷ','ク':'ｸ','ケ':'ｹ','コ':'ｺ','サ':'ｻ','シ':'ｼ','ス':'ｽ','セ':'ｾ','ソ':'ｿ','タ':'ﾀ','チ':'ﾁ','ツ':'ﾂ','テ':'ﾃ','ト':'ﾄ','ナ':'ﾅ','ニ':'ﾆ','ヌ':'ﾇ','ネ':'ﾈ','ノ':'ﾉ','ハ':'ﾊ','ヒ':'ﾋ','フ':'ﾌ','ヘ':'ﾍ','ホ':'ﾎ','マ':'ﾏ','ミ':'ﾐ','ム':'ﾑ','メ':'ﾒ','モ':'ﾓ','ヤ':'ﾔ','ユ':'ﾕ','ヨ':'ﾖ','ラ':'ﾗ','リ':'ﾘ','ル':'ﾙ','レ':'ﾚ','ロ':'ﾛ','ワ':'ﾜ','ヲ':'ｦ','ン':'ﾝ','ァ':'ｧ','ィ':'ｨ','ゥ':'ｩ','ェ':'ｪ','ォ':'ｫ','ッ':'ｯ','ャ':'ｬ','ュ':'ｭ','ョ':'ｮ','ー':'ｰ','　':' ','・':'･','（':'(','）':')' };
  // 全角英数記号→半角
  function z2hAscii(s) { return s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }); }
  // 銀行が受理する文字集合: 半角カナ・英大文字・数字・空白・一部記号。それ以外は空白に落とす(壊れた文字を送らない)。
  function toHankaku(str) {
    var s = z2hAscii(String(str == null ? '' : str));
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (KANA[ch] != null) { out += KANA[ch]; continue; }
      // ひらがな→カナ→半角
      if (ch >= 'ぁ' && ch <= 'ん') { var k = String.fromCharCode(ch.charCodeAt(0) + 0x60); out += (KANA[k] != null ? KANA[k] : ' '); continue; }
      var code = ch.charCodeAt(0);
      if (code === 0x20) { out += ' '; continue; }
      if (code >= 0x30 && code <= 0x39) { out += ch; continue; }       // 0-9
      if (code >= 0x41 && code <= 0x5A) { out += ch; continue; }       // A-Z
      if (code >= 0x61 && code <= 0x7A) { out += ch.toUpperCase(); continue; } // a-z→大文字
      if (code >= 0xFF61 && code <= 0xFF9F) { out += ch; continue; }   // 既に半角カナ
      if ('().-/'.indexOf(ch) >= 0) { out += ch; continue; }           // 許容記号
      out += ' ';                                                       // 未対応文字は空白
    }
    return out;
  }

  function num(v) { var s = String(v == null ? '' : v).replace(/[^0-9\-]/g, ''); var n = parseInt(s, 10); return isNaN(n) ? 0 : n; } // 符号保持(負額が正の振込に化けるのを防ぐ)
  // N: 数字・右詰・前0埋・超過は下位len桁
  function padN(v, len) { var s = String(Math.max(0, num(v))); if (s.length > len) s = s.slice(s.length - len); while (s.length < len) s = '0' + s; return s; }
  // C: 半角文字・左詰・後スペース・超過はlen文字で切詰(半角=1文字1バイト前提)
  function padC(v, len) { var s = toHankaku(v); if (s.length > len) s = s.slice(0, len); while (s.length < len) s += ' '; return s; }
  function space(len) { var s = ''; while (s.length < len) s += ' '; return s; }

  // 科目名/コード。1=普通,2=当座,4=貯蓄,9=その他
  var YOKIN = { '普通': 1, '当座': 2, '貯蓄': 4, 'その他': 9, '1': 1, '2': 2, '4': 4, '9': 9 };
  function yokinCode(v) { return YOKIN[String(v == null ? '' : v).trim()] || 1; }

  // ヘッダー(120)。c=委託者{code,name,torikumiMMDD,bankNo,bankName,branchNo,branchName,yokin,account}
  function header(c) {
    c = c || {};
    var r = '1' + '21' + '0'
      + padN(c.code, 10) + padC(c.name, 40) + padN(c.torikumiMMDD, 4)
      + padN(c.bankNo, 4) + padC(c.bankName, 15) + padN(c.branchNo, 3) + padC(c.branchName, 15)
      + padN(yokinCode(c.yokin), 1) + padN(c.account, 7) + space(17);
    return r;
  }
  // データ(120)。d=受取{bankNo,bankName,branchNo,branchName,yokin,account,name,amount,customerCode}
  function dataRec(d) {
    d = d || {};
    var r = '2'
      + padN(d.bankNo, 4) + padC(d.bankName, 15) + padN(d.branchNo, 3) + padC(d.branchName, 15)
      + padN(0, 4)                                   // 手形交換所番号(未使用0)
      + padN(yokinCode(d.yokin), 1) + padN(d.account, 7) + padC(d.name, 30) + padN(d.amount, 10)
      + padN(d.newCode || 0, 1)                      // 新規コード(0=その他)
      + padC(d.customerCode || '', 10) + space(10)   // 顧客コード1/2
      + padN(7, 1)                                    // 振込区分(7=電信)
      + space(1) + space(7);                          // 識別表示 + ダミー
    return r;
  }
  function trailer(count, total) { return '8' + padN(count, 6) + padN(total, 12) + space(101); }
  function endRec() { return '9' + space(119); }

  /* ── 改行コード ────────────────────────────────────────────────────────
   * ★全銀の改行は【銀行ごとに違う】。「LFで弾かれた」＝「CRLFが間違い」ではない。★
   * 【一次情報 2026-08-08 実測】
   *   大分/京都/JAバンク/きらぼし/イオン … 「CR+LF(0d0a)・CR(0d)・LF(0a)」いずれも可＋★改行なしも可★
   *   群馬/東和/広島/三菱UFJ信託        … 「120バイト、改行(CRLF)をつける場合は後ろに2バイト」
   *   三菱UFJ(BizSTATION)               … レコード長120バイト または 改行コードあり＝「標準」
   *   楽天銀行                          … ★「120byte固定長、改行は不要」★(改行なし前提)
   *   ⇒ ★CRLFが通る銀行が多数派。だから既定はCRLFのまま動かさない。★
   *     LFのみを要求する銀行は一次情報では見つからなかったが、規定上LFも認める銀行があるので
   *     選べるようにしておく（銀行から指定された時に、その銀行だけ変えられる）。
   * ★知らない値・空・未設定は必ず既定(CRLF)へ倒す。黙ってLFにしない。★ */
  var NEWLINES = { CRLF: '\r\n', LF: '\n', CR: '\r', NONE: '' };
  var NEWLINE_DEFAULT = 'CRLF';
  function newlineKey(v) {
    var k = String(v == null ? '' : v).toUpperCase().replace(/[^A-Z]/g, '');
    if (k === 'NASHI' || k === 'NONE') return 'NONE';
    return NEWLINES[k] != null ? k : NEWLINE_DEFAULT;
  }

  /* ── ★銀行の表（これが唯一の正。画面はここから作る）★ ──────────────────
   * ★並べ方：中小企業のメインバンクは【地方銀行39.76%＋信用金庫】が最多（2025年 全国160万社調査）。
   *   だから【地銀・信金を先頭】に置き、司さんの地域(愛媛)から埋める。メガ・ネットは後回し。
   *   ★目標は「全銀行を網羅」ではなく「今いる客の銀行が全部ある」。★
   * ★confirmed:false（未確認）は「公式仕様に改行の記載を確認できていない」という意味。
   *   ★未確認は改行を動かさない＝既定(CR+LF)のまま。「未確認」は「変える理由が無い」ということ。★
   * 出典の全文引用は docs/zengin-newline-banks.md（この表と機械で突き合わせている）。 */
  var BANKS = [
    // ── 地方銀行・信用金庫・JA（ここから埋める） ──
    { key: 'iyo', name: '伊予銀行', newline: 'CRLF', confirmed: true, source: 'https://www.iyobank.co.jp/business/pdf/ieb_manual.pdf' },
    { key: 'oita', name: '大分銀行', newline: 'CRLF', confirmed: true, source: 'https://www.dhbk.co.jp/business/efficiency/ib/pdf/sougou_furikomi_zenginkyou.pdf' },
    { key: 'kyoto', name: '京都銀行', newline: 'CRLF', confirmed: true, source: 'https://www.kyotobank.co.jp/houjin/webeb/manual/pdf/sougou_file.pdf' },
    { key: 'hirogin', name: '広島銀行', newline: 'CRLF', confirmed: true, source: 'https://www.hirogin.co.jp/bizweb/inc/pdf/fileformat_file.pdf' },
    { key: 'gunma', name: '群馬銀行', newline: 'CRLF', confirmed: true, source: 'https://www.gunmabank.co.jp/hojin/biznb/service/pdf/z_format1.pdf' },
    { key: 'towa', name: '東和銀行', newline: 'CRLF', confirmed: true, source: 'https://www.towabank.co.jp/houjin/file_format.pdf' },
    { key: 'kiraboshi', name: 'きらぼし銀行', newline: 'CRLF', confirmed: true, source: 'https://www.kiraboshibank.co.jp/hojin/kouritsuka/biz-net/fileformat/pdf/sogofurikomi.pdf' },
    { key: 'ja', name: 'JAバンク', newline: 'CRLF', confirmed: true, source: 'https://www.houjinnet.jabank.jp/faq/pdf/format.pdf' },
    // ── 流通・ネット ──
    { key: 'aeon', name: 'イオン銀行', newline: 'CRLF', confirmed: true, source: 'https://www.aeonbank.co.jp/business/pdf/manual_other_03.pdf' },
    { key: 'rakuten', name: '楽天銀行', newline: 'NONE', confirmed: true, source: 'https://www.rakuten-bank.co.jp/business/howto/pdf/h07_06_05.pdf' },
    // ── メガ・信託（シェアが小さいので後回し） ──
    { key: 'mufg', name: '三菱UFJ銀行（BizSTATION）', newline: 'CRLF', confirmed: true, source: 'https://web.bizstn.bk.mufg.jp/biz/help/pdf/manual_a-14-3.pdf' },
    { key: 'mufgtr', name: '三菱UFJ信託銀行', newline: 'CRLF', confirmed: true, source: 'https://www.tr.mufg.jp/houjin/mbd/manual/pdf/manual05.pdf' },
    // ── ★未確認（公式仕様に改行の記載を確認できていない）★ 改行は既定のまま動かさない ──
    { key: 'ehime', name: '愛媛銀行', newline: 'CRLF', confirmed: false, source: '' },
    { key: 'ehime-shinkin', name: '愛媛信用金庫', newline: 'CRLF', confirmed: false, source: '' },
    { key: 'imabari-shinkin', name: '今治信用金庫', newline: 'CRLF', confirmed: false, source: '' },
    { key: 'shinkin', name: 'その他の信用金庫', newline: 'CRLF', confirmed: false, source: '' },
    { key: 'mizuho', name: 'みずほ銀行', newline: 'CRLF', confirmed: false, source: '' },
    { key: 'smbc', name: '三井住友銀行', newline: 'CRLF', confirmed: false, source: '' },
    { key: 'yucho', name: 'ゆうちょ銀行', newline: 'CRLF', confirmed: false, source: '' }
  ];
  function bankOf(key) {
    var k = String(key == null ? '' : key);
    for (var i = 0; i < BANKS.length; i++) { if (BANKS[i].key === k) return BANKS[i]; }
    return null;
  }
  /* 実際に使う改行を決める。
   *   ① 手で選んでいれば それ（'AUTO'/空 は「選んでいない」）
   *   ② 銀行を選んでいて【確認済み】なら その銀行の形
   *   ③ どちらでもなければ ★既定 CR+LF★（一覧にない銀行・未確認の銀行・未設定 は全部ここ） */
  function resolveNewlineKey(opts) {
    opts = opts || {};
    var manual = String(opts.newline == null ? '' : opts.newline).toUpperCase().replace(/[^A-Z]/g, '');
    if (manual && manual !== 'AUTO') return newlineKey(manual);
    var b = bankOf(opts.bank);
    if (b && b.confirmed) return newlineKey(b.newline);
    return NEWLINE_DEFAULT;
  }

  // Shift-JIS(半角のみ)へエンコード。ASCII=そのまま/半角カナ(U+FF61..FF9F)=0xA1..0xDF。改行はそのまま通す。
  function toShiftJisBytes(text) {
    var bytes = [];
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i);
      if (code === 0x0D) { bytes.push(0x0D); continue; }
      if (code === 0x0A) { bytes.push(0x0A); continue; }
      if (code >= 0xFF61 && code <= 0xFF9F) { bytes.push(0xA1 + (code - 0xFF61)); continue; }
      if (code >= 0x00 && code <= 0x7F) { bytes.push(code); continue; }
      bytes.push(0x20); // 想定外はスペース
    }
    return new Uint8Array(bytes);
  }

  /** 総合振込ファイルを生成。
   * @param {object} committer 委託者 {code,name,torikumiMMDD,bankNo,bankName,branchNo,branchName,yokin,account}
   * @param {Array} transfers 明細 [{bankNo,bankName,branchNo,branchName,yokin,account,name,amount}]
   * @param {object} [opts] {bank:'iyo'…, newline:'AUTO'|'CRLF'|'LF'|'CR'|'NONE'}
   *   ★既定CRLF。空/未設定/知らない値/未確認の銀行/一覧にない銀行 は全部 既定へ倒す
   * @returns {object} {text, bytes, count, total, records[], newline}  (amount<=0の明細は除外)
   */
  function build(committer, transfers, opts) {
    var list = (transfers || []).filter(function (t) { return num(t.amount) > 0; });
    var recs = [header(committer)];
    var total = 0;
    list.forEach(function (t) { recs.push(dataRec(t)); total += num(t.amount); });
    recs.push(trailer(list.length, total));
    recs.push(endRec());
    var key = resolveNewlineKey(opts);
    var nl = NEWLINES[key];
    // 改行ありの時は末尾にも付ける(エンドレコード後の改行は各行「任意」＝今までの形を変えない)。
    var text = nl ? recs.join(nl) + nl : recs.join('');
    return { text: text, bytes: toShiftJisBytes(text), count: list.length, total: total, records: recs, newline: key };
  }

  return {
    build: build, header: header, dataRec: dataRec, trailer: trailer, endRec: endRec,
    toHankaku: toHankaku, padN: padN, padC: padC, yokinCode: yokinCode, toShiftJisBytes: toShiftJisBytes,
    newlineKey: newlineKey, resolveNewlineKey: resolveNewlineKey, bankOf: bankOf,
    NEWLINES: NEWLINES, NEWLINE_DEFAULT: NEWLINE_DEFAULT, BANKS: BANKS
  };
});
