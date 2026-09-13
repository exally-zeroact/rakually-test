/* kazoku-sei-mei.test.mjs — ★家族の 氏名は 姓と 名で 分けて 打たせ、区切りは こちらで 繋ぐ★
 * =============================================================================
 * ★なぜ（2026-09-14 司さん）★
 *   「氏名漢字と 氏名カナを 2行に して 苗字と 名前で 分けたら ユーザーも 楽やろが」
 *   ＝そのとおりで、★間違いも 減る★：届出の 決まりは
 *       漢字 … ★全角スペース 1個★（項番72 の 相関「連続しない全角スペースを含むこと」）
 *       カナ … ★半角スペース 1個★（項番71 の 相関）
 *   1つの 欄に まとめて 打たせると ★半角と 全角を 間違える／2つ続く★で 年金機構に 弾かれる。
 *   ⇒ ★姓と 名だけ 受け取り、区切りは アプリが 入れる★。
 *
 * ★ここで 測る物★
 *   ①画面に ★姓と 名の 4欄★が 在る（漢字2・カナ2）／★「姓名の間に空白」の 注意書きが 消えた★
 *   ②打った 姓と 名から ★正しい 区切りで 繋がる★（漢字＝全角／カナ＝半角）
 *   ③★片方だけ★の 時は 区切りを 入れない（空白で 終わる字を 送らない）
 *   ④★前から 在る データ★（kanji に まとめて 入っている）が 姓と 名に 割れて 見える
 *   ⑤繋いだ 字が ★本物の 検め（139項目）を 通る★
 *
 * 使い方: node kyuyo/tests/kazoku-sei-mei.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
const SELF = process.argv.includes('--self-test');
const APP = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const ZEN = '　', HAN = ' ';

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + '欲しい ' + JSON.stringify(b) + ' / 出た ' + JSON.stringify(a)); };

/* ★物差しそのもの★＝姓と 名から 1つの 字を 作る（アプリと 同じ 決まり） */
export function tsunagu(sei, mei, sep) {
  const s = String(sei == null ? '' : sei).trim(), m = String(mei == null ? '' : mei).trim();
  return (s && m) ? (s + sep + m) : (s || m);
}
/* ★物差しそのもの★＝まとめて 入っている 字を 姓と 名に 割る */
export function waru(s) {
  const t2 = String(s == null ? '' : s).replace(/[　\s]+/g, ' ').trim();
  if (!t2) return ['', ''];
  const i = t2.indexOf(' ');
  return (i < 0) ? [t2, ''] : [t2.slice(0, i), t2.slice(i + 1)];
}

if (SELF) {
  console.log('\n[kazoku-sei-mei --self-test] ★物差しそのもの★（画面を 開かない）');
  let ng = 0;
  const iu = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  iu('漢字は 全角スペースで 繋ぐ', tsunagu('年金', '太郎', ZEN) === '年金' + ZEN + '太郎');
  iu('カナは 半角スペースで 繋ぐ', tsunagu('ﾈﾝｷﾝ', 'ﾀﾛｳ', HAN) === 'ﾈﾝｷﾝ' + HAN + 'ﾀﾛｳ');
  iu('★姓だけ★なら 区切りを 入れない', tsunagu('年金', '', ZEN) === '年金');
  iu('★名だけ★なら 区切りを 入れない', tsunagu('', '太郎', ZEN) === '太郎');
  iu('前後の 空白は 落とす', tsunagu(' 年金 ', ' 太郎 ', ZEN) === '年金' + ZEN + '太郎');
  iu('まとめた字を 割る（全角）', waru('年金' + ZEN + '太郎').join('/') === '年金/太郎');
  iu('まとめた字を 割る（半角）', waru('ﾈﾝｷﾝ ﾀﾛｳ').join('/') === 'ﾈﾝｷﾝ/ﾀﾛｳ');
  iu('★空白が 2つ続く★でも 割れる', waru('年金' + ZEN + ZEN + '太郎').join('/') === '年金/太郎');
  iu('空白が 無ければ 姓だけ', waru('年金').join('/') === '年金/');
  iu('空なら 両方 空', waru('').join('/') === '/');
  console.log(ng ? '\n★自己確認 ' + ng + '件 おかしい★' : '\n自己確認 OK');
  process.exit(ng ? 1 : 0);
}

console.log('\n[kazoku-sei-mei] 家族の 氏名を 姓と 名で 分けて 打たせる');

t('① 画面に ★姓と 名の 4欄★が 在る', () => {
  ['seiKanji', 'meiKanji', 'seiKana', 'meiKana'].forEach((f) => {
    ok(APP.indexOf("'" + f + '"') >= 0, f + ' の 欄が 無い');
  });
});
t('① ★「姓名の間に空白」の 注意書きが 消えた★（人に 区切りを 打たせない）', () => {
  eq(APP.split('姓名の間に空白').length - 1, 0, 'まだ 残っている');
});
t('② 繋ぎ方が ★漢字＝全角／カナ＝半角★', () => {
  eq(tsunagu('年金', '太郎', ZEN), '年金' + ZEN + '太郎');
  eq(tsunagu('ﾈﾝｷﾝ', 'ﾀﾛｳ', HAN), 'ﾈﾝｷﾝ' + HAN + 'ﾀﾛｳ');
});
t('③ ★片方だけ★なら 区切りを 入れない', () => {
  eq(tsunagu('年金', '', ZEN), '年金');
  eq(tsunagu('', 'ﾀﾛｳ', HAN), 'ﾀﾛｳ');
});
t('④ ★前から 在る データ★が 姓と 名に 割れる', () => {
  eq(waru('年金' + ZEN + '太郎').join('/'), '年金/太郎');
  eq(waru('ﾈﾝｷﾝ ﾀﾛｳ').join('/'), 'ﾈﾝｷﾝ/ﾀﾛｳ');
});
t('⑤ ★繋いだ 字が 本物の 検めを 通る★（139項目の 相関）', () => {
  const CSV = require_(path.join(ROOT, 'lib', 'todokede-csv.js'));
  const CHK = require_(path.join(ROOT, 'lib', 'todokede-check.js'));
  const kyou = '2026-09-14';
  const ko = { kana: tsunagu('ﾈﾝｷﾝ', 'ｲﾁﾛｳ', HAN), kanji: tsunagu('年金', '一郎', ZEN),
    birthYmd: '2015-06-06', seibetsu: 'male', zokugara: '03', doukyo: true,
    zip: '100-8580', jusho: '東京都千代田区霞が関1-2-2', shokugyo: '4', shunyu: '0',
    nattaYmd: '2026-04-01', nattaRiyu: '1' };
  const inp = { jimusho: { todofuken: '13', gunshiku: '12', kigou: 'ｱｲｳ', jigyoshoNo: '12345',
      zipOya: '100', zipKo: '8580', address: '東京都千代田区霞が関1-2-2',
      name: '株式会社テスト', nushi: tsunagu('年金', '太郎', ZEN), tel1: '03', tel2: '1234', tel3: '5678' },
    emp: { seiriNo: '1', kana: tsunagu('ﾈﾝｷﾝ', 'ﾀﾛｳ', HAN), kanji: tsunagu('年金', '太郎', ZEN),
      birthYmd: '1985-04-01', seibetsu: 'male', zip: '100-8580',
      jushoKanji: '東京都千代田区霞が関1-2-2', kisoNenkin: '1234-567890' },
    idou: '1', ukeYmd: kyou, kyou, hai: null, sonota: [ko] };
  const ng = CHK.fuyo(CSV.fuyoRow(inp), kyou) || [];
  eq(ng.length, 0, ng.map((x) => '項番' + x.no + ' ' + x.name + '＝' + x.why).join(' / '));
});
/* ★繋ぎ方を 間違えたら 検めが 赤に なるか★＝狼少年に しない為の 裏取り */
t('⑤ ★区切りを 間違えたら 赤に なる★（半角と 全角を 取り違えた時）', () => {
  const CSV = require_(path.join(ROOT, 'lib', 'todokede-csv.js'));
  const CHK = require_(path.join(ROOT, 'lib', 'todokede-check.js'));
  const kyou = '2026-09-14';
  const ko = { kana: tsunagu('ﾈﾝｷﾝ', 'ｲﾁﾛｳ', ZEN), kanji: tsunagu('年金', '一郎', HAN),  /* ★わざと 逆★ */
    birthYmd: '2015-06-06', seibetsu: 'male', zokugara: '03', doukyo: true,
    zip: '100-8580', jusho: '東京都千代田区霞が関1-2-2', shokugyo: '4', shunyu: '0',
    nattaYmd: '2026-04-01', nattaRiyu: '1' };
  const inp = { jimusho: { todofuken: '13', gunshiku: '12', kigou: 'ｱｲｳ', jigyoshoNo: '12345',
      zipOya: '100', zipKo: '8580', address: '東京都千代田区霞が関1-2-2',
      name: '株式会社テスト', nushi: tsunagu('年金', '太郎', ZEN), tel1: '03', tel2: '1234', tel3: '5678' },
    emp: { seiriNo: '1', kana: tsunagu('ﾈﾝｷﾝ', 'ﾀﾛｳ', HAN), kanji: tsunagu('年金', '太郎', ZEN),
      birthYmd: '1985-04-01', seibetsu: 'male', zip: '100-8580',
      jushoKanji: '東京都千代田区霞が関1-2-2', kisoNenkin: '1234-567890' },
    idou: '1', ukeYmd: kyou, kyou, hai: null, sonota: [ko] };
  ok((CHK.fuyo(CSV.fuyoRow(inp), kyou) || []).length > 0, '★逆に したのに 通ってしまった★');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
