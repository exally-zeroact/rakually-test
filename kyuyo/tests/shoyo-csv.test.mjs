/* shoyo-csv.test.mjs — ★賞与支払届の 電子申請 CSV★（様式2265700・21項目）
 * ============================================================================
 * ★一次情報（2026-09-05 に 落として 自分で 字を 取った）★
 *   日本年金機構「【ＣＳＶファイル添付方式】健康保険厚生年金保険被保険者賞与支払届／
 *   厚生年金保険７０歳以上被用者賞与支払届」（zidoucheck.files/★csv265.pdf★・チェック66行）
 *     ★様式コード＝2265700★／★全21項目★
 *   ★算定（2225700・53項目）月変（2221700・49項目）とは 別物★＝短い。
 *
 * ★原文の 相関チェック（そのまま）★
 *   10 賞与支払年月日（元号）「'7'（平成）、'9'（令和）の何れかであること」
 *     「実存日であること」「★『賞与支払年月日』≦『システムチェック実施日』であること★」
 *       ⇒★未来の 日付は 出せない★
 *   14 合計（賞与額）
 *     「★『合計（賞与額）』≧ '1000' であること★」
 *     「『通貨によるものの額』＋『現物によるものの額』≦'9999999'の場合
 *       ★『合計（賞与額）』＝((通貨＋現物)÷1000)×1000 であること★」
 *       ⇒★1,000円未満 切り捨て★（＝標準賞与額）
 *     「＞'9999999'の場合 『合計（賞与額）』＝'9999999'であること」
 *   15 個人番号「『備考欄項目１』が省略されている場合 省略されていること」
 *   16 基礎年金番号（課所符号）「『備考欄項目１』が'1' かつ 『個人番号』に入力がない場合 入力されていること」
 *     ⇒★70歳以上（備考欄項目1）は 付けられない★（番号を お預かりしない）＝算定・月変と 同じ 決め
 *
 * ★うちが 元から 持っていた 穴（2026-09-05 実測）★
 *   bonusHarauRows が ★genbutsu:0 打ち込み★／★goukei:tsuka（1000円未満を 切り捨てていない）★
 *
 * 使い方: node kyuyo/tests/shoyo-csv.test.mjs [--self-test]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TD = require(path.join(ROOT, 'lib/todokede-csv.js'));
const C = require(path.join(ROOT, 'lib/todokede-check.js'));
const SELF = process.argv.includes('--self-test');
let pass = 0, fail = 0;
const T = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const Z = C.ZEN_SP;
const JIM = { todofuken: '21', gunshiku: '01', kigou: 'ｹｲﾄ', jigyoshoNo: '123',
  zipOya: '100', zipKo: '0000', address: '東京都千代田区霞が関１－２－２',
  name: '健保サービス株式会社', nushi: '健保' + Z + '良一', tel1: '03', tel2: '1234', tel3: '5678' };
const EMP = { seiriNo: '1', kana: 'ﾈﾝｷﾝ ﾀﾛｳ', kanji: '年金' + Z + '太郎', birthYmd: '1975-01-11' };
const row = (ov) => TD.shoyoRow(Object.assign({ jimusho: JIM, emp: EMP,
  harauYmd: '2026-07-10', tsuka: 500000, genbutsu: 0, bikou: {} }, ov || {}));

console.log('\n[shoyo-csv] 賞与支払届の 電子申請 CSV（様式2265700・21項目）');

T('★① 作る 関数が 在る', () => {
  ok(typeof TD.shoyoRow === 'function', '★TD.shoyoRow が 無い★');
  ok(typeof TD.shoyoCsv === 'function', '★TD.shoyoCsv が 無い★');
  ok(typeof TD.dasuKaShoyo === 'function', '★TD.dasuKaShoyo が 無い★');
});

T('★② 様式コード 2265700・項目は 21個', () => {
  const r = row();
  ok(r[0] === '2265700', '★様式コードが ' + r[0] + '★');
  ok(r.length === 21, '★項目が ' + r.length + '個★（21 のはず）');
});

T('★③ 賞与支払年月日（元号・年月日）', () => {
  const r = row();
  ok(r[9] === '9', '★元号が ' + r[9] + '★（令和＝9）');
  ok(r[10] === '080710', '★年月日が ' + r[10] + '★（令和8年7月10日＝080710）');
});

T('★④ 合計（賞与額）＝(通貨＋現物) の 1,000円未満 切り捨て★', () => {
  ok(row({ tsuka: 500000, genbutsu: 0 })[13] === '0500000', '50万');
  ok(row({ tsuka: 500500, genbutsu: 0 })[13] === '0500000', '★500,500 → 500,000（切り捨て）★');
  ok(row({ tsuka: 500000, genbutsu: 999 })[13] === '0500000', '★現物 999 を 足しても 切り捨て★');
  ok(row({ tsuka: 500000, genbutsu: 1000 })[13] === '0501000', '★現物 1,000 は 乗る★');
  ok(row({ tsuka: 500500, genbutsu: 0 })[11] === '0500500', '★通貨は そのまま（切り捨てない）★');
});

T('★⑤ 1千万円以上は 9999999', () => {
  const r = row({ tsuka: 9999999, genbutsu: 500000 });
  ok(r[13] === '9999999', '★合計の 頭打ちが 効いていない★ … ' + r[13]);
});

T('★⑥ 1,000円未満は 出さない（原文＝合計 ≧ 1000）', () => {
  const KYOU = '2026-09-05';
  ok(TD.dasuKaShoyo({ emp: EMP, harauYmd: '2026-07-10', tsuka: 1000, genbutsu: 0, kyou: KYOU }) === true, '★ちょうど 1,000円★');
  ok(TD.dasuKaShoyo({ emp: EMP, harauYmd: '2026-07-10', tsuka: 999, genbutsu: 0, kyou: KYOU }) === false, '★999円★');
  ok(TD.dasuKaShoyo({ emp: EMP, harauYmd: '2026-07-10', tsuka: 1999, genbutsu: 0, kyou: KYOU }) === true, '1,999→1,000');
  ok(TD.dasuKaShoyo({ emp: EMP, harauYmd: '2026-07-10', tsuka: 500, genbutsu: 600, kyou: KYOU }) === true, '★現物と 足して 1,100→1,000★');
});

T('★⑦ 支払日が 空／未来なら 出さない（原文＝支払日 ≦ チェック実施日）', () => {
  /* ★今日は 外から 渡す★（lib は 時計を 持たない＝headless の 決まり）
     ⇒★偽の 時計で 測れる★＝月が 替わっても 赤に ならない */
  const kyou = '2026-09-05';
  ok(TD.dasuKaShoyo({ emp: EMP, harauYmd: '', tsuka: 500000, kyou }) === false, '★支払日が 空★');
  ok(TD.dasuKaShoyo({ emp: EMP, harauYmd: '2026-09-15', tsuka: 500000, kyou }) === false, '★未来の 支払日★');
  ok(TD.dasuKaShoyo({ emp: EMP, harauYmd: kyou, tsuka: 500000, kyou }) === true, '★今日は 出せる（≦）★');
  ok(TD.dasuKaShoyo({ emp: EMP, harauYmd: '2026-09-04', tsuka: 500000, kyou }) === true, '昨日は 出せる');
  /* ★今日を 渡さない時は 日付の 形だけ 見る（止めない）★ */
  ok(TD.dasuKaShoyo({ emp: EMP, harauYmd: '2099-01-01', tsuka: 500000 }) === true, '★今日を 渡さなければ 未来でも 通す（止めるのは 呼ぶ側）★');
});

T('★⑧ 70歳以上は 出さない（基礎年金番号を お預かりしない）', () => {
  const inp = { harauYmd: '2026-07-10', tsuka: 500000, bikou: { over70: true } };
  ok(TD.dasuKaShoyo(inp) === false, '★70歳以上を 入れてしまう★');
  ok(TD.shoyoWarn(Object.assign({ emp: EMP }, inp)).join('／').indexOf('70歳') >= 0, '★知らせていない★');
});

T('★⑨ 年金機構の 検査を そのまま 通る', () => {
  const r = C.check(row());
  ok(r.measured, '★様式を 知らない★');
  ok(!r.errors.length, '★' + r.errors.length + '件★ … ' + r.errors.map((x) => '項番' + x.no + ' ' + x.name + '／' + x.why).join(' ／ '));
});

T('★⑩ 検査は 賞与の 決まりも 見る（わざと 壊す）', () => {
  const bad = row();
  bad[13] = '0000999';                                  /* 合計を 1000未満に */
  ok(C.check(bad).errors.some((x) => x.no === 14), '★合計 ≧1000 を 見ていない★');
  const bad2 = row();
  bad2[13] = '0000001';                                 /* 合計の 足し算を 壊す */
  ok(C.check(bad2).errors.some((x) => x.no === 14), '★合計の 相関を 見ていない★');
});

T('★⑪ ファイルに なる（1行目 22223・[kanri]・[data]・CRLF）', () => {
  const f = TD.shoyoCsv({ jimusho: JIM, baitai: { tsuban: '001', ymd: '2026-07-15' }, rows: [row()] });
  ok(f.name === 'SHFD0006.CSV', '★名前★');
  ok(f.bytes.length > 0 && f.kensa.errors.length === 0, '★0バイト／検査で 落ちた★ … ' + JSON.stringify(f.kensa.errors));
  const lines = f.text.split(TD.CRLF).filter(Boolean);
  ok(lines[0].split(',')[5] === '22223', '★代表届書コード★');
  ok(lines[lines.length - 1].split(',').length === 21, '★データ行の 項目数★');
  ok(f.text.slice(-2) === TD.CRLF, '★最後が 改行★');
});

if (SELF) {
  console.log('\n[shoyo-csv] ★自己確認★（★境界を 1つずつ★）');
  let ng = 0;
  const say = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  const g = (t2, g2) => row({ tsuka: t2, genbutsu: g2 || 0 })[13];
  say('★999円 … 出せない★', TD.dasuKaShoyo({ emp: EMP, harauYmd: '2026-07-10', tsuka: 999 }) === false);
  say('★1,000円ちょうど … 出せる★', TD.dasuKaShoyo({ emp: EMP, harauYmd: '2026-07-10', tsuka: 1000 }) === true);
  say('1,999円 → 合計 1,000', g(1999) === '0001000');
  say('★500,999 → 500,000（切り捨て）★', g(500999) === '0500000');
  say('★501,000 → 501,000★', g(501000) === '0501000');
  say('通貨は 切り捨てない（500,999 のまま）', row({ tsuka: 500999 })[11] === '0500999');
  say('★1千万以上 → 9999999★', g(9999999, 1) === '9999999');
  say('★支払日が 空 … 出せない★', TD.dasuKaShoyo({ emp: EMP, harauYmd: '', tsuka: 500000, kyou: '2026-09-05' }) === false);
  say('★未来の 支払日 … 出せない（今日を 渡した時）★', TD.dasuKaShoyo({ emp: EMP, harauYmd: '2026-09-15', tsuka: 500000, kyou: '2026-09-05' }) === false);
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★9通り ぜんぶ 思った通り★');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
