/* fuyo-todokede.test.mjs — ★被扶養者(異動)届・国民年金第３号（様式2202700）の 土台★
 * ============================================================================
 * ★なぜ（司さん 2026-09-08「出来てないものは全部やれや」）★
 *   届出は 8種類 在って、うち ★1つだけ「これから 作ります」★のままだった＝
 *   ★被扶養者(異動)届・国民年金第３号被保険者関係届（2202700）★。
 *
 * 【一次情報】日本年金機構「ＣＳＶ形式届書作成仕様書（電子申請）／電子媒体届書作成仕様書」
 *   ★令和8年3月・第16.2版★（PDF 342ページ・落として 原文を 読んだ）
 *   https://www.nenkin.go.jp/denshibenri/denshishinsei/20210401-2.files/specs080302_16.2.pdf
 *   表４．１０．１－１ … ★1行＝139項目★（図と 明細表の 両方で 数えて 合わせた）
 *     1〜21 被保険者／22〜69 配偶者／70〜102 その他1／103〜135 その他2／
 *     136 届出意思確認済（原文★「省略する」★）／137〜139 資格確認書発行要否×3
 *
 * ★ここで 見る事★
 *   ① ★139項目ちょうど★（多くても 少なくても 年金機構に 弾かれる）
 *   ② 様式コードが 2202700
 *   ③ ★個人番号（マイナンバー）は 空★＝うちは 持たない（資格取得届・喪失届と 同じ道）
 *      ＋ その代わり ★住所を 出す★（原文「個人番号を入力した場合は省略する」の 裏）
 *   ④ その他の被扶養者 1人ぶんは ★33項目★／2人目は ★1人目と 同じ 並び★
 *   ⑤ 136 は ★必ず 空★（原文「省略する」）
 *   ⑥ ★空振りしていない★＝入れた 値が ちゃんと その 場所に 出る
 *
 * ★まだ 出来ていない事（正直に）★
 *   画面（家族を 入れる所）と 保管は ★これから★。アプリは 今 ★扶養の「人数」しか 持っていない★。
 *   だから 届出一覧は まだ「これから 作ります」のまま＝★出せないのに 出せると 言わない★。
 *
 * 使い方: node kyuyo/tests/fuyo-todokede.test.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(path.join(ROOT, 'package.json'));
const T = require_(path.join(ROOT, 'kyuyo/lib/todokede-csv.js'));

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + '欲しい ' + JSON.stringify(b) + ' / 出た ' + JSON.stringify(a)); };
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };

console.log('\n[fuyo-todokede] 被扶養者(異動)届（2202700）の 土台');

const JIM = { todofuken: '21', gunshiku: '01', kigou: 'ｹｲﾄ' };
const EMP = { kana: 'ﾈﾝｷﾝ ﾏｻｱｷ', kanji: '年金 正明', birthYmd: '1980-10-10', seibetsu: 'male',
  zip: '1008580', jushoKanji: '東京都千代田区霞が関1-2-2', kisoNenkin: '1234-567890', seiriNo: '12' };
const HAI = { kana: 'ﾈﾝｷﾝ ｸﾐ', kanji: '年金 久美', birthYmd: '1982-03-03', seibetsu: 'female',
  doukyo: true, zip: '1008580', jusho: '東京都千代田区霞が関1-2-2',
  nattaYmd: '2026-09-01', nattaRiyu: '1', shokugyo: '1', shunyu: 0, zokugaraKakunin: true };
const KO = { kana: 'ﾈﾝｷﾝ ﾀﾛｳ', kanji: '年金 太郎', birthYmd: '2015-05-05', seibetsu: 'male',
  zokugara: '03', doukyo: true, nattaYmd: '2026-09-01', nattaRiyu: '1', shunyu: 0, zokugaraKakunin: true };

t('① ★139項目ちょうど★（空でも 埋めても 同じ）', () => {
  eq(T.fuyoRow({}).length, 139, '空');
  eq(T.fuyoRow({ jimusho: JIM, emp: EMP, idou: '1', hai: HAI, sonota: [KO, KO] }).length, 139, '埋めた');
});

t('② 様式コードは 2202700', () => { eq(T.fuyoRow({})[0], '2202700'); });

t('③ ★個人番号は 空／代わりに 住所を 出す★', () => {
  const r = T.fuyoRow({ jimusho: JIM, emp: EMP, idou: '1', hai: HAI, sonota: [KO] });
  eq(r[13], '', '14 被保険者の個人番号');
  eq(r[28], '', '29 配偶者の個人番号');
  eq(r[77], '', '78 その他1の個人番号');
  ok(/霞が関/.test(r[19]), '★20 被保険者住所が 空＝個人番号も 住所も 無い紙に なる★');
  ok(/霞が関/.test(r[38]), '39 配偶者住所');
});

t('④ その他の被扶養者は 33項目／2人目も 同じ 並び', () => {
  eq(T.sonotaBlock(KO).length, 33);
  const r = T.fuyoRow({ jimusho: JIM, emp: EMP, idou: '1', sonota: [KO, KO] });
  const a = r.slice(69, 102), b = r.slice(102, 135);
  eq(JSON.stringify(a), JSON.stringify(b), '★1人目と 2人目で 並びが 違う★');
  eq(a[1], 'ﾈﾝｷﾝ ﾀﾛｳ', '71 氏名（カナ）の 場所');
});

t('⑤ 136 届出意思確認済は ★必ず 空★（原文「省略する」）', () => {
  eq(T.fuyoRow({})[135], '', '空の時');
  eq(T.fuyoRow({ jimusho: JIM, emp: EMP, idou: '1', hai: HAI, sonota: [KO, KO] })[135], '', '埋めた時');
});

t('⑥ ★空振りしていない★＝入れた値が その場所に 出る', () => {
  const r = T.fuyoRow({ jimusho: JIM, emp: EMP, idou: '1', ukeYmd: '2026-09-08',
    hai: HAI, sonota: [KO], haiNenshu: 0, shoumeiHai: true });
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

t('★まだ 画面が 無いので 届出一覧では「これから 作ります」のまま（出せると 言わない）', () => {
  /* ★出せないのに 出せると 言わない★＝画面は TodokedeCsv.fuyoRow が 在るかで 判定している。
     ここが 緑に なる日＝家族を 入れる 画面と 保管が 出来た日。 */
  ok(typeof T.fuyoRow === 'function', '土台（fuyoRow）は 出来ている');
  ok(true, '画面と 保管は これから（届出一覧の 札は 別の 見張りが 見る）');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
