/* fuyo-todokede.test.mjs — ★被扶養者(異動)届・国民年金第３号（様式2202700）★
 * ============================================================================
 * ★なぜ（司さん 2026-09-08「出来てないものは全部やれや」）★
 *   届出は 8種類 在って、うち ★1つだけ「これから 作ります」★のままだった＝
 *   ★被扶養者(異動)届・国民年金第３号被保険者関係届（2202700）★。
 *
 * 【一次情報】日本年金機構「ＣＳＶ形式届書作成仕様書（電子申請）／電子媒体届書作成仕様書」
 *   ★令和8年3月・第16.2版★（PDF 342ページ・落として 原文を 読んだ）
 *   https://www.nenkin.go.jp/denshibenri/denshishinsei/20210401-2.files/specs080302_16.2.pdf
 *   表４．１０．１－１（★23ページ★）… ★1行＝139項目★
 *     1〜21 被保険者／22〜69 配偶者／70〜102 その他1／103〜135 その他2／
 *     136 届出意思確認済（原文★「省略する」★）／137〜139 資格確認書発行要否×3
 *   図４．１０．１－２ … ★年金機構が 載せている 作成例★（この試験の ⓪ で そのまま 通す）
 *
 * ★2026-09-08 に 原文を 1項目ずつ 写して 分かった「自分の 嘘」★
 *   ・項番76 続柄コードは 01実子養子／02それ以外の子／03父母養父母／04義父母／05弟妹／
 *     06兄姉／07祖父母／08曾祖父母／09孫／10その他。
 *     ⇒ 画面に 出していた「01夫 02妻 ★03子★ …11姉 99その他」は ★全部 私が 作った★。
 *        ★03 は 子ではなく 父母★＝子を 親として 届け出す 所だった。
 *   ・項番70／136 は ★文字数０＝必ず 空★
 *   ・項番28 は 性別ではなく ★続柄★（1夫／2妻／3夫未届／4妻未届）
 *   ・職業は 配偶者(48)が 4つ・その他(92)が ★6つ★／理由も 中身が 違う（46 と 95）
 *
 * ★ここで 見る事★
 *   ⓪ ★年金機構の 作成例が 赤 0件★（ここが 赤なら 私の 見張りが 間違い）
 *   ① 139項目ちょうど ② 様式コード ③ 個人番号は空・代わりに住所
 *   ④ その他1人＝33項目・2人目も 同じ並び ⑤ 136は必ず空 ⑥ 空振りしていない
 *   ⑦ ★様式2202700を 見張りが 測っている★（測らずに 素通りしていないか）
 *   ⑧ ★出せない材料で ファイルを 作らない★
 *   ⑨ ★わざと 壊すと 赤が 出る★（自己確認・壊した数 と 赤の数 を 並べる）
 *
 * 使い方: node kyuyo/tests/fuyo-todokede.test.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(path.join(ROOT, 'package.json'));
const T = require_(path.join(ROOT, 'kyuyo/lib/todokede-csv.js'));
const C = require_(path.join(ROOT, 'kyuyo/lib/todokede-check.js'));

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + '欲しい ' + JSON.stringify(b) + ' / 出た ' + JSON.stringify(a)); };
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };
const NL = String.fromCharCode(10);

console.log('\n[fuyo-todokede] 被扶養者(異動)届（2202700）');

const Z = '　';
const JIM = { todofuken: '21', gunshiku: '01', kigou: 'ｹｲﾄ', jigyoshoNo: '12345',
  zipOya: '100', zipKo: '8580', address: '東京都千代田区霞が関1-2-2', name: '株式会社テスト', nushi: '年金' + Z + '正明',
  tel1: '03', tel2: '3456', tel3: '7890' };
const EMP = { kana: 'ﾈﾝｷﾝ ﾏｻｱｷ', kanji: '年金' + Z + '正明', birthYmd: '1980-10-10', seibetsu: 'male',
  zip: '1008580', jushoKanji: '東京都千代田区霞が関1-2-2', kisoNenkin: '1234-567890', seiriNo: '12' };
const HAI = { kana: 'ﾈﾝｷﾝ ｸﾐ', kanji: '年金' + Z + '久美', birthYmd: '1982-03-03', seibetsu: 'female',
  doukyo: true, zip: '1008580', jusho: '東京都千代田区霞が関1-2-2',
  nattaYmd: '2026-09-01', nattaRiyu: '2', shokugyo: '1', shunyu: 0, zokugaraKakunin: true };
const KO = { kana: 'ﾈﾝｷﾝ ﾀﾛｳ', kanji: '年金' + Z + '太郎', birthYmd: '2015-05-05', seibetsu: 'male',
  zokugara: '01', doukyo: true, zip: '1008580', jusho: '東京都千代田区霞が関1-2-2',
  nattaYmd: '2026-09-01', nattaRiyu: '1', shokugyo: '4', shunyu: 0, zokugaraKakunin: true };
/* ★全部そろった 1枚★＝赤 0件 で なければ ならない */
const MARU = { jimusho: JIM, emp: EMP, idou: '1', ukeYmd: '2026-09-08', hai: HAI, sonota: [KO],
  haiNenshu: 0, shoumeiHai: true, kyou: '2026-09-08' };

/* ── ⓪ 年金機構の 作成例（図４．１０．１－２）を そのまま 通す ───────────── */
t('⓪ ★年金機構の 作成例が 赤 0件★（赤なら 私の 見張りが 間違い）', () => {
  const r = new Array(139).fill('');
  r[0] = '2202700'; r[1] = '21'; r[2] = '01'; r[3] = 'ｹｲﾄ'; r[4] = '1';
  r[5] = '9'; r[6] = '010708'; r[7] = '10';
  r[8] = 'ﾈﾝｷﾝ ﾏｻｱｷ'; r[9] = '年金' + Z + '正明';
  r[10] = '5'; r[11] = '551010'; r[12] = '1'; r[13] = '123456708900';
  r[16] = '3200000'; r[20] = '1';
  r[21] = '9'; r[22] = '010708';
  r[23] = 'ﾈﾝｷﾝ ｸﾐ'; r[24] = '年金' + Z + '久美';
  r[25] = '5'; r[26] = '560326'; r[27] = '2'; r[28] = '123456078900';
  r[34] = '1'; r[36] = '120'; r[37] = '8580'; r[38] = '東京都杉並区高井戸西３－５－２４';
  r[39] = '1'; r[40] = '03'; r[41] = '3456'; r[42] = '7890';
  r[43] = '9'; r[44] = '010707'; r[45] = '2'; r[47] = '1'; r[48] = '0';
  const errs = C.fuyo(r, '2026-09-08');
  eq(errs.length, 0, '作成例の 赤\n     ' + errs.map((x) => '項番' + x.no + ' ' + x.name + '／' + x.why).join('\n     '));
});

t('① ★139項目ちょうど★（空でも 埋めても 同じ）', () => {
  eq(T.fuyoRow({}).length, 139, '空');
  eq(T.fuyoRow(MARU).length, 139, '埋めた');
});

t('② 様式コードは 2202700', () => { eq(T.fuyoRow({})[0], '2202700'); });

t('③ ★個人番号は 空／代わりに 住所を 出す★', () => {
  const r = T.fuyoRow(MARU);
  eq(r[13], '', '14 被保険者の個人番号');
  eq(r[28], '', '29 配偶者の個人番号');
  eq(r[77], '', '78 その他1の個人番号');
  ok(/霞が関/.test(r[19]), '★20 被保険者住所が 空＝個人番号も 住所も 無い紙に なる★');
  ok(/霞が関/.test(r[38]), '39 配偶者住所');
  ok(/霞が関/.test(r[81]), '82 その他1住所');
});

t('④ その他の被扶養者は 33項目／2人目も 同じ 並び', () => {
  eq(T.sonotaBlock(KO).length, 33);
  const r = T.fuyoRow({ jimusho: JIM, emp: EMP, idou: '1', sonota: [KO, KO] });
  const a = r.slice(69, 102), b = r.slice(102, 135);
  eq(JSON.stringify(a), JSON.stringify(b), '★1人目と 2人目で 並びが 違う★');
  eq(a[1], 'ﾈﾝｷﾝ ﾀﾛｳ', '71 氏名（カナ）の 場所');
});

t('⑤ 136 届出意思確認済／70 被扶養者番号は ★必ず 空★（原文「省略する」）', () => {
  eq(T.fuyoRow({})[135], '', '136 空の時');
  eq(T.fuyoRow(MARU)[135], '', '136 埋めた時');
  eq(T.sonotaBlock({ bangou: '9' })[0], '', '★70 に 値を 入れても 空で 出す★');
});

t('⑥ ★空振りしていない★＝入れた値が その場所に 出る', () => {
  const r = T.fuyoRow(MARU);
  eq(r[1], '21', '2 都道府県コード');
  eq(r[3], 'ｹｲﾄ', '4 事業所記号');
  eq(r[5], '9', '6 元号（令和）');    /* 一次情報 137p：令和＝9 */
  eq(r[6], '080908', '7 受付年月日');
  eq(r[8], 'ﾈﾝｷﾝ ﾏｻｱｷ', '9 氏名（カナ）');
  eq(r[10], '5', '11 生年月日の元号（昭和＝5）');
  eq(r[11], '551010', '12 生年月日');
  eq(r[12], '1', '13 性別（男＝1）');
  eq(r[14], '1234', '15 基礎年金番号（課所符号）');
  eq(r[15], '567890', '16 基礎年金番号（一連番号）');
  eq(r[17], '100', '18 郵便番号（親）');
  eq(r[18], '8580', '19 郵便番号（子）');
  eq(r[20], '1', '21 異動の別（該当）');
  eq(r[23], 'ﾈﾝｷﾝ ｸﾐ', '24 配偶者 氏名（カナ）');
  eq(r[34], '1', '35 同居・別居（同居＝1）');
  eq(r[56], '1', '57 続柄確認');
  eq(r[136], '1', '137 資格確認書発行要否（配偶者）');
});

t('★異動の別の 印が 3つ そろっている', () => {
  eq(T.FUYO_IDOU.gaito, '1'); eq(T.FUYO_IDOU.higaito, '2'); eq(T.FUYO_IDOU.henko, '3');
});

/* ── ★原文どおりの 続柄コード★（前の 嘘を 二度と 戻さない為の 錠） ───────── */
t('★続柄コードは 原文の 10個だけ（01〜10）＝私が 作った 11・99 は 無い', () => {
  eq(JSON.stringify(C.FUYO_ZOKU), JSON.stringify(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10']));
  const bad = T.fuyoRow({ jimusho: JIM, emp: EMP, idou: '1', sonota: [Object.assign({}, KO, { zokugara: '99' })] });
  ok(C.fuyo(bad, '2026-09-08').some((x) => x.no === 76), "★'99' が 素通りしている★（前に 画面が 出していた 値）");
  const bad2 = T.fuyoRow({ jimusho: JIM, emp: EMP, idou: '1', sonota: [Object.assign({}, KO, { zokugara: '11' })] });
  ok(C.fuyo(bad2, '2026-09-08').some((x) => x.no === 76), "★'11' が 素通りしている★");
});

t('★配偶者の 28 は 続柄（未届も 出せる）＝性別の 使い回しでは ない', () => {
  eq(T.fuyoRow({ hai: { zokugara: 'tsumaMitodoke', seibetsu: 'female' } })[27], '4', '妻（未届）');
  eq(T.fuyoRow({ hai: { zokugara: 'ottoMitodoke', seibetsu: 'male' } })[27], '3', '夫（未届）');
  eq(T.fuyoRow({ hai: { seibetsu: 'female' } })[27], '2', '選んでいない時は 性別から（妻）');
});

/* ── ⑦ 見張りが この様式を 実際に 測っているか ───────────────────── */
t('⑦ ★2202700 を 見張りが 測っている★（未測定で 素通りしていない）', () => {
  const c = C.check(T.fuyoRow(MARU), '2026-09-08');
  eq(c.measured, true, '★measured が false＝見た事の無い様式として 素通りしている★');
  eq(c.yoshiki, '2202700');
  eq(c.errors.length, 0, 'そろった1枚の 赤\n     '
    + c.errors.map((x) => '項番' + x.no + ' ' + x.name + '／' + x.why).join('\n     '));
});

/* ── ⑧ 出せない材料で ファイルを 作らない ─────────────────────── */
t('⑧ ★1件でも 合わなければ 1バイトも 作らない★', () => {
  const warui = T.fuyoRow({ jimusho: JIM, emp: Object.assign({}, EMP, { kana: '' }), idou: '1', sonota: [KO] });
  const f = T.fuyoCsv({ jimusho: JIM, baitai: { tsuban: '001', ymd: '2026-09-08' }, kyou: '2026-09-08', rows: [warui] });
  eq(f.bytes.length, 0, '★赤なのに ファイルを 作っている★');
  ok(f.kensa.errors.length > 0, '赤を 数えていない');
  const yoi = T.fuyoCsv({ jimusho: JIM, baitai: { tsuban: '001', ymd: '2026-09-08' }, kyou: '2026-09-08', rows: [T.fuyoRow(MARU)] });
  ok(yoi.bytes.length > 0, '★そろっているのに 作れていない★');
  eq(yoi.name, 'SHFD0006.CSV');
  eq(yoi.kensa.mihakari, 0, '★未測定が 混ざっている★');
});

t('⑧-2 材料が 足りない時に「出せます」と 言わない（dasuKaFuyo）', () => {
  eq(T.dasuKaFuyo({}).ok, false, '空でも 出せると 言っている');
  ok(T.dasuKaFuyo({}).naze.length >= 3, '理由を 出していない');
  eq(T.dasuKaFuyo({ emp: EMP, idou: '1', sonota: [KO] }).ok, true, 'そろっているのに 止めている');
  eq(T.dasuKaFuyo({ emp: EMP, idou: '1', sonota: [KO, KO, KO] }).ok, false, '★1枚に 3人は 入らない★');
});

t('⑧-3 ★「出せます」と 言ったなら 本当に 出る★（ボタンと 門の 口裏を 合わせる）', () => {
  /* ★なぜ この見張りが 要るか（2026-09-08 実ブラウザで 踏んだ）★
     dasuKaFuyo が ok を 返して ボタンが 押せたのに、押したら
     「項番13・15・18・19・20 が 入力されていない」と ★５件 断られた★。
     ★出せない物の ボタンを 見せない★＝この2つは 必ず 同じ 答えに なる。 */
  const kumi = [
    ['全部 そろっている', MARU],
    ['本人の 性別が 無い', Object.assign({}, MARU, { emp: Object.assign({}, EMP, { seibetsu: '' }) })],
    ['本人の 基礎年金番号が 無い', Object.assign({}, MARU, { emp: Object.assign({}, EMP, { kisoNenkin: '' }) })],
    ['本人の 郵便番号が 無い', Object.assign({}, MARU, { emp: Object.assign({}, EMP, { zip: '' }) })],
    ['本人の 住所が 無い', Object.assign({}, MARU, { emp: Object.assign({}, EMP, { jushoKanji: '' }) })],
    ['家族の 住所が 無い（同居でも 要る）', Object.assign({}, MARU, { sonota: [Object.assign({}, KO, { jusho: '' })] })],
    ['家族の 郵便番号が 無い', Object.assign({}, MARU, { sonota: [Object.assign({}, KO, { zip: '' })] })],
    ['家族の 職業が 無い', Object.assign({}, MARU, { sonota: [Object.assign({}, KO, { shokugyo: '' })] })],
    ['家族の なった日が 無い', Object.assign({}, MARU, { sonota: [Object.assign({}, KO, { nattaYmd: '' })] })],
    ['家族の 同居別居が 無い', Object.assign({}, MARU, { sonota: [Object.assign({}, KO, { doukyo: null })] })],
  ];
  const zure = [];
  kumi.forEach(([na, inp]) => {
    const iu = T.dasuKaFuyo(inp).ok;
    const f = T.fuyoCsv({ jimusho: JIM, baitai: { tsuban: '001', ymd: '2026-09-08' },
      kyou: '2026-09-08', rows: [T.fuyoRow(inp)] });
    const deta = f.bytes.length > 0;
    if (iu !== deta) zure.push(na + '：画面は' + (iu ? '「出せます」' : '「出せません」')
      + '、門は' + (deta ? '出した' : '断った'));
  });
  console.log('     調べた ' + kumi.length + '通り → 食い違い ' + zure.length + '件');
  eq(zure.length, 0, '★ボタンと 門の 言うことが 違う★' + NL + '     ' + zure.join(NL + '     '));
});

/* ── ⑨ わざと 壊す（★緑のままなら 見張りが 効いていない★） ──────────── */
t('⑨ ★わざと 壊すと 赤が 出る★（壊した数 と 赤の数 を 並べる）', () => {
  const kowasu = [
    ['項番1 様式コードを 別の 届出に', (r) => { r[0] = '2200700'; }],
    ['項番9 氏名（カナ）を 空に', (r) => { r[8] = ''; }],
    ['項番9 氏名（カナ）の 姓名の 空白を 消す', (r) => { r[8] = 'ﾈﾝｷﾝﾏｻｱｷ'; }],
    ['項番12 生年月日を 実在しない日に', (r) => { r[11] = '550230'; }],
    ['項番13 性別に 3', (r) => { r[12] = '3'; }],
    ['項番15 基礎年金番号を 空に（個人番号も 空）', (r) => { r[14] = ''; r[15] = ''; }],
    ['項番20 住所を 空に（個人番号も 空）', (r) => { r[19] = ''; }],
    ['項番21 異動の別を 空に', (r) => { r[20] = ''; }],
    ['項番28 配偶者の 続柄に 5', (r) => { r[27] = '5'; }],
    ['項番35 同居別居を 空に（該当なのに）', (r) => { r[34] = ''; }],
    ['項番39 配偶者の 住所を 空に', (r) => { r[38] = ''; }],
    ['項番45 になった日を 空に（該当なのに）', (r) => { r[44] = ''; }],
    ['項番48 配偶者の 職業に 5（配偶者は 4つまで）', (r) => { r[47] = '5'; }],
    ['項番70 被扶養者番号に 値を 入れる', (r) => { r[69] = '1'; }],
    ['項番76 続柄コードに 99', (r) => { r[75] = '99'; }],
    ['項番82 その他の 住所を 空に', (r) => { r[81] = ''; }],
    ['項番92 その他の 職業に 7（6つまで）', (r) => { r[91] = '7'; }],
    ['項番136 届出意思確認済に 値を 入れる', (r) => { r[135] = '1'; }],
    ['項番137 資格確認書に 2', (r) => { r[136] = '2'; }],
    ['項目数を 1つ 減らす', (r) => { r.pop(); }],
    ['★1つ ずらす★（写し間違いの 型）', (r) => { r.splice(70, 0, ''); r.pop(); }],
  ];
  const moto = T.fuyoRow(MARU);
  eq(C.fuyo(moto, '2026-09-08').length, 0, '★壊す前が すでに 赤★');
  const nokotta = [];
  kowasu.forEach(([na, f]) => {
    const r = moto.slice(); f(r);
    if (!C.fuyo(r, '2026-09-08').length) nokotta.push(na);
  });
  console.log('     壊した ' + kowasu.length + '件 → 赤 ' + (kowasu.length - nokotta.length) + '件');
  eq(nokotta.length, 0, '★壊したのに 緑のまま★\n     ' + nokotta.join('\n     '));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
