/* zengin.test.js — 全銀協 総合振込 固定長(120バイト)の項目位置・桁埋め・半角カナ・Shift-JIS・トレーラ合計をロック。
 * 期待値は公式レイアウト(桁数)から手構成(自己参照でない)。★120"文字"かつ120"バイト"=2バイト文字混入(=銀行が弾く)を検出★ */
'use strict';
var Z = require('../lib/zengin.js');

var committer = { code: '0123456789', name: 'カ)ゼロアクト', torikumiMMDD: '0725', bankNo: '0001', bankName: 'ﾐｽﾞﾎ', branchNo: '001', branchName: 'ﾎﾝﾃﾝ', yokin: '普通', account: '1234567' };
var t1 = { bankNo: '0005', bankName: 'ﾐﾂﾋﾞｼ', branchNo: '012', branchName: 'ｼﾌﾞﾔ', yokin: '普通', account: '7654321', name: 'ヤマダ ハナコ', amount: 328710 };

/* --- 桁埋め(N=右詰0埋 / C=左詰スペース) --- */
T('zengin padN: 数字右詰・前0埋・超過は下位桁', function () {
  eq(Z.padN(328710, 10), '0000328710'); eq(Z.padN(5, 3), '005'); eq(Z.padN(12345678, 7), '2345678'); eq(Z.padN('', 4), '0000');
});
T('zengin padC: 半角化して左詰・後スペース・超過切詰', function () {
  eq(Z.padC('ABC', 5), 'ABC  '); eq(Z.padC('ゼロ', 6), 'ｾﾞﾛ   '); // ゼ→ｾﾞ(2)+ﾛ(1)=3 → +3space
  eq(Z.padC('ABCDEF', 4), 'ABCD');
});
T('zengin 全角→半角カナ(濁点分解・ひらがな・全角英数)', function () {
  eq(Z.toHankaku('ヤマダ ハナコ'), 'ﾔﾏﾀﾞ ﾊﾅｺ'); // ダ→ﾀﾞ
  eq(Z.toHankaku('ゼロアクト'), 'ｾﾞﾛｱｸﾄ');
  eq(Z.toHankaku('やまだ'), 'ﾔﾏﾀﾞ');            // ひらがな→半角カナ
  eq(Z.toHankaku('ＡＢ１２'), 'AB12');            // 全角英数→半角
  eq(Z.toHankaku('カ）'), 'ｶ)');                 // 全角括弧→半角
});
T('zengin 科目コード: 普通1/当座2/貯蓄4/その他9', function () {
  eq(Z.yokinCode('普通'), 1); eq(Z.yokinCode('当座'), 2); eq(Z.yokinCode('貯蓄'), 4); eq(Z.yokinCode('2'), 2); eq(Z.yokinCode('xxx'), 1);
});

/* --- ヘッダーレコード(120) 項目位置 --- */
T('zengin ヘッダー: 120文字・区分1種別21・各項目が正位置', function () {
  var h = Z.header(committer);
  eq(h.length, 120, 'ヘッダー120文字');
  eq(h.slice(0, 4), '1210', '区分1+種別21+コード区分0');
  eq(h.slice(4, 14), '0123456789', '委託者コード10N');
  eq(h.slice(14, 54).slice(0, 8), 'ｶ)ｾﾞﾛｱｸﾄ', '委託者名40C(半角カナ)');
  eq(h.slice(14, 54).length, 40);
  eq(h.slice(54, 58), '0725', '取組日MMDD');
  eq(h.slice(58, 62), '0001', '仕向銀行番号4N');
  eq(h.slice(62, 77).slice(0, 4), 'ﾐｽﾞﾎ', '仕向銀行名15C');
  eq(h.slice(77, 80), '001', '仕向支店番号3N');
  eq(h.slice(95, 96), '1', '預金種目1N');
  eq(h.slice(96, 103), '1234567', '口座番号7N');
});

/* --- データレコード(120) 項目位置 --- */
T('zengin データ: 120文字・区分2・各項目が正位置・金額右詰', function () {
  var d = Z.dataRec(t1);
  eq(d.length, 120, 'データ120文字');
  eq(d.slice(0, 1), '2', '区分2');
  eq(d.slice(1, 5), '0005', '被仕向銀行番号4N');
  eq(d.slice(5, 20).slice(0, 5), 'ﾐﾂﾋﾞｼ', '被仕向銀行名15C');
  eq(d.slice(20, 23), '012', '被仕向支店番号3N');
  eq(d.slice(42, 43), '1', '預金種目1N(普通)');
  eq(d.slice(43, 50), '7654321', '口座番号7N');
  eq(d.slice(50, 80).slice(0, 8), 'ﾔﾏﾀﾞ ﾊﾅｺ', '受取人名30C(半角カナ)');
  eq(d.slice(80, 90), '0000328710', '振込金額10N');
  eq(d.slice(111, 112), '7', '振込区分7(電信)');
});

/* --- ★120"バイト"(Shift-JIS)=2バイト文字混入検出★ --- */
T('zengin Shift-JIS: 半角カナ→0xA1..0xDF・レコードは120バイト', function () {
  eq(Z.toShiftJisBytes('ｱ')[0], 0xB1); // ｱ=U+FF71→0xB1
  eq(Z.toShiftJisBytes('ｦ')[0], 0xA6);
  eq(Array.from(Z.toShiftJisBytes('A0')).join(','), '65,48');
  eq(Z.toShiftJisBytes(Z.header(committer)).length, 120, 'ヘッダー120バイト(2バイト文字なし)');
  eq(Z.toShiftJisBytes(Z.dataRec(t1)).length, 120, 'データ120バイト');
});

/* --- build 総合: ヘッダ+データ+トレーラ(合計)+エンド・0円除外 --- */
T('zengin build: 5レコード・トレーラ合計件数/金額・改行CRLF', function () {
  var t2 = { bankNo: '0009', bankName: 'ﾐﾂｲ', branchNo: '100', branchName: 'ｼﾝｼﾞｭｸ', yokin: '当座', account: '0011223', name: 'サトウ タロウ', amount: 250000 };
  var r = Z.build(committer, [t1, t2]);
  eq(r.count, 2); eq(r.total, 578710);
  eq(r.records.length, 5, 'ヘッダ+2データ+トレーラ+エンド');
  var tr = r.records[3]; // トレーラー
  eq(tr.length, 120); eq(tr.slice(0, 1), '8'); eq(tr.slice(1, 7), '000002'); eq(tr.slice(7, 19), '000000578710'); eq(tr.slice(19).trim(), '');
  eq(r.records[4].slice(0, 1), '9'); eq(r.records[4].length, 120);
  ok(r.text.indexOf('\r\n') > 0, 'CRLF区切り');
  eq(r.bytes.length, 120 * 5 + 2 * 5, '120×5レコード + CRLF×5'); // 各行末CRLF(末尾含む)
});
T('zengin build: 金額0以下は除外', function () {
  var r = Z.build(committer, [t1, { bankNo: '0009', account: '1', name: 'ゼロ', amount: 0 }]);
  eq(r.count, 1); eq(r.total, 328710);
});
T('zengin build: 負の金額は符号を保持して除外(正額に化けない)', function () {
  var r = Z.build(committer, [t1, { bankNo: '0009', branchNo: '001', account: '1', name: 'ﾏｲﾅｽ', amount: -500 }]);
  eq(r.count, 1); eq(r.total, 328710); // -500 が +500 として通らない
});

/* ══ ★改行コード（銀行ごとに違う）★ ═══════════════════════════════════
 * 【なぜ】全銀の改行は銀行ごとに違う（CR+LF／CR／LF／改行なし）。
 *   ★1つに固定すると、今 通っている銀行が明日 弾かれる。★
 *   だから「選べる／既定は今のまま(CRLF)」を、境界ごと実物のバイト数で固定する。
 * 【一次情報 2026-08-08 実測】docs/zengin-newline-banks.md
 *   大分/京都/JA/きらぼし/イオン = CR+LF・CR・LF いずれも可＋改行なしも可
 *   群馬/東和/広島/三菱UFJ信託  = 120バイト＋改行(CRLF)を付ける場合は後ろに2バイト
 *   楽天銀行                    = 「120byte固定長、改行は不要」
 * バイト数の期待値は 120×レコード数(+改行×レコード数) を【手で組んだ式】から出す（出力の写しではない）。 */
var t2n = { bankNo: '0009', bankName: 'ﾐﾂｲ', branchNo: '100', branchName: 'ｼﾝｼﾞｭｸ', yokin: '当座', account: '0011223', name: 'サトウ タロウ', amount: 250000 };
function bytesFor(nRec, nlLen) { return 120 * nRec + nlLen * nRec; }

T('★改行: 既定(引数なし)は今までどおりCRLF＝1バイトも変わらない', function () {
  var r = Z.build(committer, [t1, t2n]);
  eq(r.newline, 'CRLF', '既定の鍵');
  eq(r.bytes.length, bytesFor(5, 2), '120×5 + CRLF×5');
  eq(r.text.slice(120, 122), '\r\n', '1行目の後ろがCRLF');
  eq(r.text.slice(-2), '\r\n', '末尾にも改行(エンドレコード後は任意)');
});
T('★改行: 空・未設定・知らない値・日本語は【必ず既定CRLF】へ倒す(黙ってLFにしない)', function () {
  ['', null, undefined, '改行なし', 'xxx', 0, '  '].forEach(function (v) {
    eq(Z.newlineKey(v), 'CRLF', JSON.stringify(v) + ' → 既定');
    eq(Z.build(committer, [t1], { newline: v }).newline, 'CRLF', JSON.stringify(v) + ' → build も既定');
  });
  eq(Z.build(committer, [t1], {}).newline, 'CRLF', 'optsが空でも既定');
});
T('★改行: NONE=改行なし(楽天型)。120バイトの倍数ちょうど・改行バイトが0本', function () {
  var r = Z.build(committer, [t1, t2n], { newline: 'NONE' });
  eq(r.newline, 'NONE');
  eq(r.text.length, 120 * 5, '120×5文字ちょうど');
  eq(r.bytes.length, bytesFor(5, 0), '120×5バイト');
  eq(r.text.indexOf('\r'), -1, 'CRが1つも無い'); eq(r.text.indexOf('\n'), -1, 'LFが1つも無い');
  eq(Array.from(r.bytes).filter(function (b) { return b === 0x0D || b === 0x0A; }).length, 0, '改行バイト0本');
});
T('★改行: LF=0x0Aだけ。CRが1バイトも混ざらない', function () {
  var r = Z.build(committer, [t1, t2n], { newline: 'LF' });
  eq(r.newline, 'LF');
  eq(r.bytes.length, bytesFor(5, 1), '120×5 + LF×5');
  eq(r.text.slice(120, 121), '\n');
  eq(Array.from(r.bytes).filter(function (b) { return b === 0x0D; }).length, 0, '★CRが0本(LFのみ要求の銀行向け)');
  eq(Array.from(r.bytes).filter(function (b) { return b === 0x0A; }).length, 5, 'LFが5本');
});
T('★改行: CR=0x0Dだけ(全銀の規定にある3つ目)', function () {
  var r = Z.build(committer, [t1, t2n], { newline: 'CR' });
  eq(r.newline, 'CR');
  eq(r.bytes.length, bytesFor(5, 1));
  eq(Array.from(r.bytes).filter(function (b) { return b === 0x0A; }).length, 0, 'LFが0本');
});
T('★改行: 小文字・前後の空白・全角混じりでも鍵として読める(nashi/none は改行なし)', function () {
  eq(Z.newlineKey('crlf'), 'CRLF'); eq(Z.newlineKey(' lf '), 'LF');
  eq(Z.newlineKey('none'), 'NONE'); eq(Z.newlineKey('nashi'), 'NONE');
});
T('★改行: どの改行でも「レコードは必ず120バイト」が崩れない(0件=3レコードの境界も)', function () {
  ['CRLF', 'LF', 'CR', 'NONE'].forEach(function (k) {
    var nl = Z.NEWLINES[k].length;
    var r0 = Z.build(committer, [], { newline: k });                 // 対象0件=ヘッダ+トレーラ+エンド
    eq(r0.records.length, 3, k + ': 0件でも3レコード');
    eq(r0.count, 0); eq(r0.total, 0);
    eq(r0.bytes.length, bytesFor(3, nl), k + ': 0件のバイト数');
    var r1 = Z.build(committer, [t1], { newline: k });               // 1件=4レコード
    eq(r1.bytes.length, bytesFor(4, nl), k + ': 1件のバイト数');
    r1.records.forEach(function (rec) { eq(Z.toShiftJisBytes(rec).length, 120, k + ': 各レコード120バイト'); });
  });
});
/* ══ ★銀行の表（これが唯一の正）★ ═══════════════════════════════════════
 * 画面は lib のこの表から作る。表と docs/zengin-newline-banks.md が食い違ったら赤にする
 * ＝「表を直したのに対応表が古いまま」「対応表を直したのにアプリが古いまま」を止める。 */
var fs = require('fs'), path = require('path');
var DOC = fs.readFileSync(path.join(__dirname, '..', 'docs', 'zengin-newline-banks.md'), 'utf8');

T('★銀行の表: 地銀・信金が先頭で、1行目は伊予銀行（客が使う順・網羅ではない）', function () {
  eq(Z.BANKS[0].key, 'iyo', '1行目');
  eq(Z.BANKS[0].name, '伊予銀行');
  eq(Z.BANKS[0].confirmed, true);
  // メガ・ネットは後ろ（地銀・信金より前に来ていない）
  var iMega = Z.BANKS.findIndex(function (b) { return b.key === 'mufg'; });
  var iChiho = Z.BANKS.findIndex(function (b) { return b.key === 'oita'; });
  ok(iMega > iChiho, 'メガが地銀より前に来ている');
});
T('★銀行の表: 出典URLと改行が docs の対応表と一致（片方だけ古くならない）', function () {
  Z.BANKS.forEach(function (b) {
    ok(DOC.indexOf(b.name) >= 0, '対応表に ' + b.name + ' が無い');
    if (b.confirmed) {
      ok(!!b.source, b.name + ': 確認済みなのに出典URLが無い');
      ok(DOC.indexOf(b.source) >= 0, b.name + ': 出典URLが対応表に無い ' + b.source);
    } else {
      eq(b.source, '', b.name + ': 未確認なのに出典URLがある');
      eq(b.newline, 'CRLF', '★未確認の行は既定(CRLF)以外を持たない');
    }
    ok(Z.NEWLINES[b.newline] != null, b.name + ': 知らない改行 ' + b.newline);
  });
});
T('★銀行の表: 鍵が重複していない・確認済みが12行以上ある(表が空振りしていない)', function () {
  var seen = {};
  Z.BANKS.forEach(function (b) { if (seen[b.key]) throw new Error('鍵が重複: ' + b.key); seen[b.key] = 1; });
  ok(Z.BANKS.filter(function (b) { return b.confirmed; }).length >= 12, '確認済みが少なすぎる');
});

/* ══ ★銀行→改行の決まり方★ ═══════════════════════════════════════════ */
T('★決まり方: 何も選ばない＝今までどおり CR+LF（0件の設定でも変わらない）', function () {
  eq(Z.resolveNewlineKey(), 'CRLF');
  eq(Z.resolveNewlineKey({}), 'CRLF');
  eq(Z.resolveNewlineKey({ bank: '', newline: '' }), 'CRLF');
  eq(Z.resolveNewlineKey({ newline: 'AUTO' }), 'CRLF');
  eq(Z.build(committer, [t1]).newline, 'CRLF');
});
T('★決まり方: 確認済みの銀行を選ぶとその形（伊予=CR+LF / 楽天=改行なし）', function () {
  eq(Z.resolveNewlineKey({ bank: 'iyo' }), 'CRLF', '伊予銀行');
  eq(Z.resolveNewlineKey({ bank: 'rakuten' }), 'NONE', '楽天銀行');
  eq(Z.build(committer, [t1], { bank: 'rakuten' }).bytes.length, bytesFor(4, 0), '楽天=120の倍数ちょうど');
  eq(Z.build(committer, [t1], { bank: 'iyo' }).bytes.length, bytesFor(4, 2), '伊予=120+CRLF');
});
T('★決まり方: ★未確認の銀行を選んでも CR+LF のまま★（「未確認」は「変える理由が無い」）', function () {
  ['mizuho', 'smbc', 'yucho', 'shinkin', 'ehime', 'ehime-shinkin', 'imabari-shinkin'].forEach(function (k) {
    eq(Z.resolveNewlineKey({ bank: k }), 'CRLF', k);
    eq(Z.build(committer, [t1], { bank: k }).bytes.length, bytesFor(4, 2), k + ': 既定のまま');
  });
});
T('★決まり方: 一覧にない銀行・知らない鍵も CR+LF（黙って別の形にしない）', function () {
  eq(Z.resolveNewlineKey({ bank: '__other' }), 'CRLF');
  eq(Z.resolveNewlineKey({ bank: 'そんな銀行はない' }), 'CRLF');
  eq(Z.resolveNewlineKey({ bank: null }), 'CRLF');
});
T('★決まり方: 手で選んだ形は銀行より優先（銀行に従わせない逃げ道を残す）', function () {
  eq(Z.resolveNewlineKey({ bank: 'rakuten', newline: 'CRLF' }), 'CRLF', '楽天でもCR+LFにできる');
  eq(Z.resolveNewlineKey({ bank: 'iyo', newline: 'LF' }), 'LF', '伊予でもLFにできる');
  eq(Z.resolveNewlineKey({ bank: 'iyo', newline: 'NONE' }), 'NONE');
});
T('★決まり方: 伊予銀行は「120バイト＋CRLF(データ長122)」＝手引きの5パターンの②で通る', function () {
  var r = Z.build(committer, [t1], { bank: 'iyo' });
  eq(r.newline, 'CRLF');
  r.records.forEach(function (rec) { eq(Z.toShiftJisBytes(rec).length, 120, 'レコード長120バイト'); });
  eq(r.bytes.length / r.records.length, 122, 'データ長122バイト');
  ok(DOC.indexOf('１２０バイトの内に含める') >= 0, '★「120の内に含める」軸が記録に残っているか（今は作らない）');
});

T('★改行: 中身(120桁のレコード)は改行を変えても1文字も変わらない', function () {
  var a = Z.build(committer, [t1, t2n], { newline: 'CRLF' }).records.join('|');
  ['LF', 'CR', 'NONE'].forEach(function (k) {
    eq(Z.build(committer, [t1, t2n], { newline: k }).records.join('|'), a, k + ': レコード本体が変わっている');
  });
});
