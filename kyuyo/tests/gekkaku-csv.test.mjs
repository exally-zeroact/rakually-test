/* gekkaku-csv.test.mjs — ★月額変更届（随時改定）の 電子申請 CSV★
 * ============================================================================
 * ★一次情報（2026-09-04 に 落として 自分で 字を 取って 読んだ）★
 *   日本年金機構「【ＣＳＶファイル添付方式】健康保険厚生年金保険被保険者報酬月額変更届／
 *   厚生年金保険７０歳以上被用者月額変更届」（zidoucheck.files/csv221.pdf・全4ページ）
 *     ★様式コード＝2221700★／★全49項目★
 *   ★算定基礎届（2225700・53項目）とは 別物★＝項目の 数も 並びも 違う。
 *
 * ★原文の 相関チェック（そのまま）★
 *   25〜27 給与計算の基礎日数（前三／前二／前一ヶ月）
 *     「『備考欄項目３』が'1' かつ 改定年月＞平成18年6月 の場合 ★'11'～'31'であること★」
 *     「『備考欄項目３』が'1'でない場合 かつ 改定年月＞平成18年6月 の場合 ★'17'～'31'であること★」
 *     ⇒★備考欄項目3＝短時間労働者★（★この 相関そのものが 出どころ★＝思い込みでは ない）
 *     ⇒★算定と 違い、3か月 とも 日数を 満たしていないと 出せない★
 *   24 給与支給月（前一ヶ月）「★＋１ヶ月 ＝『改定年月（月）』であること★」
 *   23 「前二ヶ月」＝「前三ヶ月」＋1／24「前一ヶ月」＝「前二ヶ月」＋1
 *   34〜36 合計＝通貨＋現物（★9999999 以上なら 9999999★）
 *   37 総計＝合計3つの 足し算（★9999999 以上なら 9999999★）
 *   38 平均額＝（合計3つ）÷３（★修正平均額が 空の時★）／★平均額 ≧ '1000' であること★
 *   15〜17 従前の改定月（元号・年・月）＝★必須★
 *   41 基礎年金番号（課所符号）「『備考欄項目１』が'1' かつ 『個人番号』に入力がない場合 入力されていること」
 *     ⇒★70歳以上（備考欄項目1）は 付けられない★＝うちは 番号を お預かりしない（裁定 甲）
 *     ⇒★その人は 出さず、名前を 挙げて 知らせる★（算定と 同じ 決め）
 *
 * 使い方: node kyuyo/tests/gekkaku-csv.test.mjs [--self-test]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TD = require(path.join(ROOT, 'lib/todokede-csv.js'));
const SELF = process.argv.includes('--self-test');
let pass = 0, fail = 0;
const T = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const M = (d, tsuka, genbutsu) => ({ days: d, tsuka: tsuka, genbutsu: genbutsu || 0 });
const BASE = {
  jimusho: { todofuken: '21', gunshiku: '01', kigou: 'ｹｲﾄ' },
  emp: { seiriNo: '1', kana: 'ﾈﾝｷﾝ ﾀﾛｳ', kanji: '年金　太郎', birthYmd: '1975-01-11' },
  henkoYm: '2026-04',                          /* 変動した 月＝前三ヶ月 */
  zenzen: { health: 260000, pension: 260000, kaiteiYmd: '2025-09-01' },
  months: [M(20, 300000), M(21, 310000), M(20, 320000)]
};
const R = (over) => TD.gekkakuRow(Object.assign({}, BASE, over || {}));

console.log('\n[gekkaku-csv] 月額変更届の 電子申請 CSV（様式2221700・49項目）');

T('★① 作る 関数が 在る', () => {
  ok(typeof TD.gekkakuRow === 'function', '★TD.gekkakuRow が 無い★');
  ok(typeof TD.gekkakuCsv === 'function', '★TD.gekkakuCsv が 無い★');
  ok(typeof TD.dasuKaGekkaku === 'function', '★TD.dasuKaGekkaku が 無い★');
});

T('★② 様式コードは 2221700・項目は 49個（算定 2225700／53個と 別物）', () => {
  const r = R();
  ok(r[0] === '2221700', '★様式コードが ' + r[0] + '★（2221700 のはず）');
  ok(r.length === 49, '★項目が ' + r.length + '個★（49 のはず）');
});

T('★③ 改定年月＝変動月の 3か月後／給与支給月は 続きの 3か月', () => {
  const r = R();
  /* 変動 2026-04 ⇒ 前三04・前二05・前一06 ⇒ ★改定 07★（前一＋1＝改定） */
  ok(r[9] === '9' && r[10] === '08' && r[11] === '07', '★改定年月が ' + r[9] + '/' + r[10] + '/' + r[11] + '★（令和8年07月 のはず）');
  ok(r[21] === '04' && r[22] === '05' && r[23] === '06', '★給与支給月が ' + r[21] + '/' + r[22] + '/' + r[23] + '★');
});

T('★④ 従前の改定月は 必須（空だと 出さない）', () => {
  const r = R();
  ok(r[14] === '9' && r[15] === '07' && r[16] === '09', '★従前の改定月が ' + r[14] + '/' + r[15] + '/' + r[16] + '★（令和7年09月 のはず）');
  ok(TD.dasuKaGekkaku(Object.assign({}, BASE, { zenzen: { health: 260000, pension: 260000, kaiteiYmd: '' } })) === false,
    '★従前の改定月が 無いのに 出してしまう★（原文＝必須）');
});

T('★⑤ 合計・総計・平均額（原文の 相関どおり）', () => {
  const r = R();
  ok(r[33] === '0300000' && r[34] === '0310000' && r[35] === '0320000', '★合計が 合わない★ … ' + r.slice(33, 36).join('/'));
  ok(r[36] === '0930000', '★総計が ' + r[36] + '★（93万 のはず）');
  ok(r[37] === '0310000', '★平均額が ' + r[37] + '★（93万÷★3★＝31万 のはず）');
});

T('★⑥ 平均額は ★3で割る★（算定の様に 対象月では 割らない）', () => {
  /* 月変は ★3か月 とも 日数を 満たす★のが 前提＝いつも 3で 割る */
  const r = R({ months: [M(17, 300000), M(17, 200000), M(17, 100000)] });
  ok(r[36] === '0600000' && r[37] === '0200000', '★総計/平均が ' + r[36] + '/' + r[37] + '★（60万/20万 のはず）');
});

T('★⑦ 3か月とも 17日以上でないと 出さない（★算定と 違う所★）', () => {
  ok(TD.dasuKaGekkaku(BASE) === true, '★出せる人を 外している★');
  ok(TD.dasuKaGekkaku(Object.assign({}, BASE, { months: [M(20, 300000), M(16, 310000), M(20, 320000)] })) === false,
    '★16日の 月が 在るのに 出してしまう★（原文＝17〜31）');
  ok(TD.dasuKaGekkaku(Object.assign({}, BASE, { months: [M(32, 300000), M(20, 310000), M(20, 320000)] })) === false,
    '★32日を 通してしまう★（原文＝17〜31）');
});

T('★⑧ 短時間労働者は 11日以上で 出せる＋備考欄項目3に 1', () => {
  const inp = Object.assign({}, BASE, { months: [M(11, 100000), M(12, 100000), M(11, 100000)], bikou: { tanjikan: true } });
  ok(TD.dasuKaGekkaku(inp) === true, '★短時間の 11日を 外している★');
  const r = TD.gekkakuRow(inp);
  ok(r[44] === '1', '★備考欄項目3（45番目）が ' + JSON.stringify(r[44]) + '★（1 のはず＝この 印が 11日の 根拠）');
  ok(TD.dasuKaGekkaku(Object.assign({}, inp, { months: [M(10, 100000), M(12, 100000), M(11, 100000)] })) === false,
    '★短時間でも 10日は だめ★');
});

T('★⑨ 平均額が 1000円未満なら 出さない（原文＝平均額 ≧ 1000）', () => {
  ok(TD.dasuKaGekkaku(Object.assign({}, BASE, { months: [M(20, 900), M(20, 900), M(20, 900)] })) === false,
    '★平均額 900円を 出してしまう★');
  ok(TD.dasuKaGekkaku(Object.assign({}, BASE, { months: [M(20, 1000), M(20, 1000), M(20, 1000)] })) === true,
    '★ちょうど 1000円を 外している★（原文＝≧1000）');
});

T('★⑩ 1千万円以上は 9999999 で 頭打ち（合計も 総計も）', () => {
  const r = R({ months: [M(20, 9999999, 1), M(20, 5000000), M(20, 5000000)] });
  ok(r[33] === '9999999', '★合計の 頭打ちが 効いていない★ … ' + r[33]);
  ok(r[36] === '9999999', '★総計の 頭打ちが 効いていない★ … ' + r[36]);
});

T('★⑪ 70歳以上は 出さない（基礎年金番号を お預かりしないから）', () => {
  const inp = Object.assign({}, BASE, { bikou: { over70: true } });
  ok(TD.dasuKaGekkaku(inp) === false, '★70歳以上を 入れてしまう★');
  ok(TD.gekkakuWarn(inp).join('／').indexOf('70歳') >= 0, '★知らせていない★');
});

T('★⑫ ファイルに なる（1行目 媒体管理・[kanri]・[data]・CRLF）', () => {
  const f = TD.gekkakuCsv({ jimusho: BASE.jimusho, baitai: { tsuban: '001', ymd: '2026-07-01' }, rows: [R()] });
  ok(f.name === 'SHFD0006.CSV', '★名前が ' + f.name + '★');
  const t = f.text;
  ok(t.indexOf('[kanri]') > 0 && t.indexOf('[data]') > 0, '★区切りの 符号が 無い★');
  ok(t.slice(-2) === TD.CRLF, '★最後が 改行で 終わっていない★（原文＝データレコード不正）');
  const data = t.split(TD.CRLF).filter(Boolean);
  const last = data[data.length - 1].split(',');
  ok(last.length === 49, '★データ行が ' + last.length + '項目★（49 のはず）');
});

T('★⑬ 1人も 出せない時は 0バイト（空の ファイルを 作らない）', () => {
  const f = TD.gekkakuCsv({ jimusho: BASE.jimusho, baitai: { tsuban: '001', ymd: '2026-07-01' }, rows: [] });
  ok(f.bytes.length === 0, '★0人なのに ' + f.bytes.length + 'バイト 作っている★');
});

T('★⑭ 画面が CSV を 落とせる（ボタン・受け・渡す物）', () => {
  const fs2 = require('node:fs');
  const app = fs2.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
  ok(app.indexOf("id=\"b-gekkaku-csv\"") > 0, '★落とすボタンが 無い★');
  ok(app.indexOf("closest('#b-gekkaku-csv')") > 0, '★押した時の 受けが 無い★');
  const i = app.indexOf('function gekkakuCsvInput');
  ok(i > 0, '★渡す物を 作る所が 無い★');
  const box = app.slice(i, i + 1400);
  ok(/henkoYm/.test(box) && /zenzen/.test(box) && /genbutsu/.test(box),
    '★変動月・従前の改定月・現物の どれかを 渡していない★');
  ok(/tanjikan/.test(box) && /isOver70/.test(box), '★短時間・70歳の 印を 渡していない★');
});

T('★⑮ 落とす所でも 出せない人を 外し、4.5MBを 見ている', () => {
  const fs2 = require('node:fs');
  const app = fs2.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const i2 = app.indexOf("closest('#b-gekkaku-csv')");
  const box = app.slice(i2, i2 + 1600);
  ok(/dasuKaGekkaku/.test(box), '★dasuKaGekkaku で 外していない★＝出せない人が そのまま 入る');
  ok(/tooBig/.test(box), '★4.5MB の 線を 見ていない★');
  /* ★配線が 本当に 動くかは ここでは 見ない★＝
     ★kyuyo/tests/integration.mjs「月額変更届の CSV が 画面から 本当に 作れる（配線）」★が
     ★jsdom に 本物の index.html と app.js を 読ませて 実際に 328バイト 作る★所まで 見ている。 */
});

if (SELF) {
  console.log('\n[gekkaku-csv] ★自己確認★（★境界を 1つずつ★）');
  let ng = 0;
  const say = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  const days = (d, tan) => TD.dasuKaGekkaku(Object.assign({}, BASE,
    { months: [M(d, 300000), M(d, 300000), M(d, 300000)] }, tan ? { bikou: { tanjikan: true } } : {}));
  say('17日 … 出せる', days(17) === true);
  say('★16日 … 出せない★', days(16) === false);
  say('31日 … 出せる', days(31) === true);
  say('★32日 … 出せない★', days(32) === false);
  say('短時間 11日 … 出せる', days(11, true) === true);
  say('★短時間 10日 … 出せない★', days(10, true) === false);
  say('短時間 31日 … 出せる', days(31, true) === true);
  say('★平均額 999円 … 出せない★', TD.dasuKaGekkaku(Object.assign({}, BASE, { months: [M(20, 999), M(20, 999), M(20, 999)] })) === false);
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★8通り ぜんぶ 思った通り★');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
