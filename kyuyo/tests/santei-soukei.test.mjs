/* santei-soukei.test.mjs — ★算定基礎届の「総計」は 一定の基礎日数以上の月だけ★
 * ============================================================================
 * ★なぜ（2026-09-04 一次情報を 読んで 見つけた）★
 *   うちは ★4月・5月・6月を 3つとも 足して 総計に していた★。
 *   ★官製の 様式に そのまま 書いてある★:
 *     「★⑭ 総計(一定の基礎日数以上の月のみ)★」
 *       （被保険者報酬月額算定基礎届／70歳以上被用者算定基礎届 の 様式）
 *   ★届書作成プログラム 操作説明書 第三部（第33.00版）40ページ 原文★:
 *     「総計不正 … ＜算定基礎届の場合＞『総計』は『★基礎日数以上あった月★』の合計に誤りがあります」
 *     ⇒★仕様チェックで はじかれる★＝司さんが 出せない
 *   ★どの月が 対象か（日本年金機構「定時決定（算定基礎届）」原文）★:
 *     ・一般 … ★支払基礎日数 17日以上★の月
 *     ・短時間就労者（パート）… 17日以上の月が 1か月以上 在れば その月
 *         3か月とも 17日未満なら ★15日以上17日未満★の月
 *         3か月とも ★15日未満★なら ★従前の 標準報酬月額で 引き続き 定時決定★
 *     ・特定適用事業所の ★短時間労働者★ … ★11日以上★の月
 *         3か月とも 11日未満なら ★従前の 標準報酬月額で 決定★
 *
 * ★平均額★ … 総計 ÷ ★対象の 月数★（3では 割らない）
 *
 * ★まだ 測っていない事（数字を でっち上げない）★
 *   ★対象の 月が 0 の時に 総計欄・平均額欄へ 何を 書くか★は
 *   官製の 記載例が ★画像の PDF で 字が 取れず★、一次情報を 読めていない。
 *   ⇒★0 と 書かない・その人を CSV に 入れない・名前を 挙げて 知らせる★（嘘を 書くより 出さない）
 *
 * 使い方: node kyuyo/tests/santei-soukei.test.mjs [--self-test]
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
const M = (d, y) => ({ days: d, tsuka: y, genbutsu: 0 });
/* ★日数の 線は 画面と 同じ物を 使う★（2026-09-04 指示役＝決まりを 2か所に 書かない） */
const PM = require(path.join(ROOT, 'lib/payroll-monthly.js'));
const RULE = (shortTimeType) => PM.santeiRule({ shortTimeType });
const idx = (r) => r.map((m, i) => m).map((_, i) => i);

console.log('\n[santei-soukei] 総計は「一定の基礎日数以上の月のみ」（2026-09-04＝3か月 全部 足していた）');

T('★① 対象月を 選ぶ 関数が 在る', () => {
  ok(typeof TD.taishoMonths === 'function', '★TD.taishoMonths が 無い★＝対象月を 選んでいない');
});

T('★② 一般＝17日以上の 月だけ（16日は 入れない）', () => {
  const r = TD.taishoMonths([M(17, 300000), M(16, 200000), M(18, 310000)], RULE(''));
  ok(r.kubun === '17', '区分が ' + r.kubun + '（17 のはず）');
  ok(String(r.index) === '0,2', '選んだ月 ' + r.index + '（0,2 のはず＝16日を 外す）');
});

T('★③ ★パート★＝3か月とも 17日未満なら 15日以上の 月（★一般には 当てない★）', () => {
  const r = TD.taishoMonths([M(15, 100000), M(14, 90000), M(16, 110000)], RULE('part'));
  ok(r.kubun === '15', '区分が ' + r.kubun + '（15 のはず）');
  ok(String(r.index) === '0,2', '選んだ月 ' + r.index + '（0,2 のはず＝14日を 外す）');
});

T('★④ 一般＝3か月とも 15日未満なら 対象なし（従前のまま）', () => {
  const r = TD.taishoMonths([M(14, 90000), M(10, 60000), M(0, 0)], RULE('part'));
  ok(r.index.length === 0, '対象が ' + r.index.length + '件（0 のはず）');
  ok(r.jusen === true, '★従前のまま★の 印が 立っていない');
});

T('★⑤ 短時間労働者＝11日以上（10日は 入れない・15/17の線は 使わない）', () => {
  const r = TD.taishoMonths([M(11, 80000), M(10, 70000), M(12, 90000)], RULE('tanjikan'));
  ok(r.kubun === '11', '区分が ' + r.kubun + '（11 のはず）');
  ok(String(r.index) === '0,2', '選んだ月 ' + r.index + '（0,2 のはず）');
});

T('★⑥ 短時間労働者＝3か月とも 11日未満なら 対象なし', () => {
  const r = TD.taishoMonths([M(10, 70000), M(9, 60000), M(0, 0)], RULE('tanjikan'));
  ok(r.index.length === 0 && r.jusen === true, '★従前のまま★に なっていない');
});

T('★⑦ 総計＝対象月だけの 合計（CSVの 37番目）', () => {
  const row = TD.santeiRow({
    jimusho: { todofuken: '21', gunshiku: '01', kigou: 'ｹｲﾄ' },
    emp: { kana: 'ﾈﾝｷﾝ ﾀﾛｳ', kanji: '年金 太郎', birthYmd: '1975-01-11', seiriNo: '1' },
    tekiyoYm: '2026-09',
    months: [M(17, 300000), M(16, 200000), M(18, 310000)], rule: RULE('')
  });
  /* 対象は 4月30万・6月31万＝★61万★（5月の20万は 入れない） */
  ok(row[36] === '0610000', '★総計が ' + row[36] + '★（0610000 のはず＝5月20万を 足している）');
  ok(row[37] === '0305000', '★平均額が ' + row[37] + '★（0305000 のはず＝61万÷★2★・3で 割っていない）');
});

T('★⑧ 合計（34〜36番目）は 3か月とも そのまま 出す（総計とは 別物）', () => {
  const row = TD.santeiRow({
    jimusho: { todofuken: '21', gunshiku: '01', kigou: 'ｹｲﾄ' },
    emp: { kana: 'ﾈﾝｷﾝ ﾀﾛｳ', kanji: '年金 太郎', birthYmd: '1975-01-11', seiriNo: '1' },
    tekiyoYm: '2026-09',
    months: [M(17, 300000), M(16, 200000), M(18, 310000)], rule: RULE('')
  });
  ok(row[33] === '0300000' && row[34] === '0200000' && row[35] === '0310000',
    '★月ごとの 合計まで 消している★ … ' + row[33] + '／' + row[34] + '／' + row[35]);
});

T('★⑨ 対象が 0の人は 知らせる（数字を でっち上げない）', () => {
  const w = TD.santeiWarn({
    emp: { kana: 'ﾈﾝｷﾝ ﾊﾅｺ', kanji: '年金　花子' },
    zenzen: { health: 260000, pension: 260000, kaiteiYmd: '2025-09-01' },
    months: [M(14, 90000), M(10, 60000), M(0, 0)], rule: RULE('')
  });
  ok(w.join('／').indexOf('入れていません') >= 0, '★入れない事を 知らせていない★ … ' + (w.join('／') || '（何も 出ていない）'));
  /* ★決め方（従前のまま／保険者算定）は ★未測定★＝言い切らない★ */
  ok(w.join('／').indexOf('年金事務所') >= 0, '★どこに 聞けばよいか 書いていない★');
});

T('★⑩ 従前のままの 人は CSV に 入れない（画面の 文と 実物を 合わせる）', () => {
  ok(typeof TD.dasuKa === 'function', '★TD.dasuKa が 無い★＝出す／出さないを 決めていない');
  /* ★従前の 改定月は 電子申請で 必須★（csv225 項番15-17）＝材料にも 入れる */
  const ZEN = { health: 260000, pension: 260000, kaiteiYmd: '2025-09-01' };
  const deru = { zenzen: ZEN, months: [M(17, 300000), M(18, 310000), M(20, 320000)], rule: RULE('') };
  const denai = { zenzen: ZEN, months: [M(14, 90000), M(10, 60000), M(0, 0)], rule: RULE('') };
  /* ★指示役が 見つけた 割れ★＝一般で 16日×3（画面は「入りません」と 言う） */
  const wareme = { zenzen: ZEN, months: [M(16, 100000), M(16, 100000), M(16, 100000)], rule: RULE('') };
  ok(TD.dasuKa(wareme) === false, '★一般 16日×3 を 入れてしまう★＝画面の 札が 嘘に なる');
  ok(TD.dasuKa(deru) === true, '★出せる人を 外している★');
  ok(TD.dasuKa(denai) === false, '★従前のままの 人を 入れてしまう★＝画面の 文が 嘘に なる');
});

T('★⑪ 画面（app.js）が その 決め方を 使っている', () => {
  const fs2 = require('node:fs');
  const app = fs2.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
  /* ★字の 並びで 探すと 死ぬ★＝'b-santei-csv' は ★2か所★（ボタンの 札と 押した時の 受け）。
     ★押した時の 受け★を 名指しする（2026-09-04＝1か所目を 拾って 空振りした）。 */
  const i = app.indexOf("closest('#b-santei-csv')");
  ok(i > 0, '★押した時の 受けが 見つからない★（書き方が 変わった？）');
  const box = app.slice(i, i + 1400);
  ok(/dasuKa/.test(box), '★落とす所で dasuKa を 使っていない★＝知らせた人が そのまま 入る');
});

/* ══ 氏名の 形（年金機構の エラー一覧に 載っている物）══════════════════════
   ★操作説明書 第三部（第33.00版）40ページ 原文★
     「氏名項目形式不正 … 漢字氏名項目の場合は姓と名の間に★全角スペースを１つ★設定してください。
       また、カナ氏名の場合は、姓と名の間に★半角スペースを１つ★設定してください。
       (例)正常な場合『東京△太郎』『ﾄｳｷｮｳ△ﾀﾛｳ』 エラーとなる場合『東京太郎』『東京△△太郎』」
     「最大桁数超過 … 漢字氏名項目が最大桁数を超えました。★スペース含め12文字以内★であることを確認してください」
   ⇒★2026-09-04 実測＝4通りとも 素通りしていた★（出した後に 年金機構で はじかれる） */
const nm = (kanji, kana) => TD.santeiWarn({ emp: { kanji, kana },
  zenzen: { health: 260000, pension: 260000, kaiteiYmd: '2025-09-01' },
  months: [M(20, 300000), M(20, 300000), M(20, 300000)], rule: RULE('') }).join('／');

T('★⑫ 姓と名の 間に スペースが 無い＝知らせる', () => {
  ok(nm('年金太郎', 'ﾈﾝｷﾝﾀﾛｳ').indexOf('すき間') >= 0, '★素通り★ … ' + (nm('年金太郎', 'ﾈﾝｷﾝﾀﾛｳ') || '（警告なし）'));
});

T('★⑬ スペースが 2つ＝知らせる', () => {
  ok(nm('年金　　太郎', 'ﾈﾝｷﾝ  ﾀﾛｳ').indexOf('すき間') >= 0, '★素通り★ … ' + (nm('年金　　太郎', 'ﾈﾝｷﾝ  ﾀﾛｳ') || '（警告なし）'));
});

T('★⑭ 正しい 形（漢字＝全角1つ／カナ＝半角1つ）は 赤に しない', () => {
  ok(nm('年金　太郎', 'ﾈﾝｷﾝ ﾀﾛｳ') === '', '★合っている 名前を 赤に している★ … ' + nm('年金　太郎', 'ﾈﾝｷﾝ ﾀﾛｳ'));
});

T('★⑮ 漢字氏名が スペース込み 13文字＝知らせる（12文字以内）', () => {
  /* ★数えてから 書く★（2026-09-04＝目分量で 13文字のつもりが 実は 11文字だった） */
  const w = nm('山田　三十五郎左衛門尉之介', 'ﾔﾏﾀﾞ ｻﾝｼﾞｭｳｺﾞﾛｳ');   /* ★13文字★ */
  ok(w.indexOf('12文字') >= 0, '★素通り★ … ' + (w || '（警告なし）'));
});

T('★⑯ ちょうど 12文字は 通す（境界を 1文字で 見る）', () => {
  ok(nm('山田　三十五郎左衛門尉之', 'ﾔﾏﾀﾞ ｻﾝｼﾞｭｳｺﾞﾛｳ') === '', '★ちょうど 12文字を 赤に している★');   /* ★12文字★ */
});

T('★⑰ 画面の 札と CSV の 扱いを 合わせる（同じ人で 別の 話を しない）', () => {
  const fs2 = require('node:fs');
  const app = fs2.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const i = app.indexOf('row.noQualify');
  ok(i > 0, '★画面の 判定が 見つからない★');
  const box = app.slice(i, i + 400);
  /* ★画面は 数字を 出す・CSV は その人を 入れない★＝★札に そう 書く★
     （2026-09-04＝札は「要確認」だけで、CSV に 入らない事が どこにも 出ていなかった） */
  ok(/電子申請/.test(box), '★札に「電子申請には 入らない」と 書いていない★＝画面と CSV が 別の 話を する');
});

/* ══ ★決まりは 1か所★（2026-09-04 指示役が 割れを 見つけた）════════════════
   ★画面の 決まり★ lib/payroll-monthly.js:108 santeiRule(e)
     短時間 primary 11 / fallback ★0★ ／ パート 17 / ★15★ ／ ★一般 17 / fallback 0★
   ★CSV は 一般にも 15日の 特例を 当てていた★
     ⇒★一般で 4〜6月とも 16日★の人＝画面は「CSVには 入りません」と 言うのに
       ★CSV は 入れて 総計 0300000 を 出していた★（実測）＝★札が 嘘★
   ⇒★決まりを 2か所に 書かない★＝CSV も santeiRule を 受け取る */
T('★⑱ 対象月の 決まりは 画面（santeiRule）と 同じ物を 使う', () => {
  const m3 = [M(16, 100000), M(16, 100000), M(16, 100000)];
  /* ★一般★＝fallback 0 ⇒ 対象なし（従前のまま） */
  const ippan = TD.taishoMonths(m3, RULE(''));
  ok(ippan.index.length === 0 && ippan.jusen === true,
    '★一般で 16日×3 を 入れている★ … 対象 ' + ippan.index.length + 'か月（画面は「入りません」と 言っている）');
  /* ★パート★＝fallback 15 ⇒ 3か月 とも 対象 */
  const part = TD.taishoMonths(m3, RULE('part'));
  ok(part.index.length === 3, '★パートで 15日の 特例が 効いていない★ … ' + part.index.length + 'か月');
  /* ★短時間★＝primary 11 */
  const tan = TD.taishoMonths([M(11, 80000), M(10, 70000), M(12, 90000)], RULE('tanjikan'));
  ok(tan.index.length === 2, '★短時間の 11日が 効いていない★ … ' + tan.index.length + 'か月');
});

T('★⑲ 同じ人を 両方に 通すと 対象月が 一致する（画面と CSV が 割れない）', () => {
  const kumi = [
    ['', [16, 16, 16]], ['', [17, 16, 18]], ['', [14, 14, 14]],
    ['part', [16, 16, 16]], ['part', [15, 14, 16]], ['part', [14, 14, 14]],
    ['tanjikan', [11, 10, 12]], ['tanjikan', [10, 9, 0]], ['tanjikan', [17, 16, 18]]
  ];
  const chigau = [];
  kumi.forEach(([st, ds]) => {
    const r = RULE(st);
    /* ★画面の 数え方★（app.js santeiKisoRow と 同じ 手順を そのまま） */
    let q = ds.filter((d) => d >= r.primary);
    if (!q.length && r.fallback > 0) q = ds.filter((d) => d >= r.fallback);
    /* ★CSV の 数え方★ */
    const c = TD.taishoMonths(ds.map((d) => M(d, 100000)), r).index.length;
    if (q.length !== c) chigau.push((st || '一般') + ' ' + ds.join('/') + '＝画面 ' + q.length + '／CSV ' + c);
  });
  ok(!chigau.length, '★割れている★ … ' + chigau.join(' ／ '));
  console.log('     9組 とも 一致（一般・パート・短時間 × 3通り）');
});

T('★⑳ 画面が CSV へ「日数の 線」を 渡している（渡さないと パートが 落ちる）', () => {
  const fs2 = require('node:fs');
  const app = fs2.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const i = app.indexOf('function santeiCsvInput');
  ok(i > 0, '★渡す所が 見つからない★');
  const box = app.slice(i, i + 1600);
  ok(/rule\s*:/.test(box) && /santeiRule/.test(box),
    '★rule を 渡していない★＝CSV が 既定（一般 17/0）で 走り、★パートの 15日・短時間の 11日が 消える★');
});

/* ══ ★備考欄（一次情報＝公式の 項目表 csv225.pdf を 読んで 照合した）★═══════════
   ★様式コード 2225700・全53項目★／★項目43＝備考欄項目1、44＝70歳算定基礎月、45〜51＝備考欄項目2〜8★
   ★官製様式の ⑱備考★:
     1.70歳以上被用者算定 2.二以上勤務 3.月額変更予定 4.途中入社 5.病休・育休・休職等
     ★6.短時間労働者（特定適用事業所等）★ ★7.パート★ 8.年間平均 9.その他
   ★2026-09-04 実測＝app が bikou を 1度も 渡しておらず、備考欄が ★全部 空★だった★
     ⇒★15日で 算定した 人に「パート」の 印が 付かない★＝根拠が 示されない
   ★70歳以上（備考欄項目1）は 付けられない★（公式の 相関チェック）:
     「41 基礎年金番号（課所符号）… ★『備考欄項目１』が'1' かつ 『個人番号』に入力がない場合 入力されていること★」
     ⇒うちは ★個人番号も 基礎年金番号も お預かりしない（裁定 甲）★
     ⇒★印だけ 付けると 必ず エラーに なる★／★付けずに 出すと 厚年の 70歳以上分が 漏れる★
     ⇒★その人は 出さず、名前を 挙げて 知らせる★ */
T('㉑ ★短時間労働者は 備考欄項目6（49番目）に 1★', () => {
  const row = TD.santeiRow({ jimusho: { todofuken: '21', gunshiku: '01', kigou: 'ｹｲﾄ' },
    emp: { kana: 'ｱ ｲ', kanji: '亜　井', birthYmd: '1990-01-01', seiriNo: '1' }, tekiyoYm: '2026-09',
    months: [M(12, 100000), M(12, 100000), M(12, 100000)], rule: RULE('tanjikan'),
    bikou: { tanjikan: true } });
  ok(row[48] === '1', '★備考欄項目6が ' + JSON.stringify(row[48]) + '★（1 のはず）');
  ok(row[49] === '', '★パートの 印まで 付けている★');
});

T('㉒ ★パートは 備考欄項目7（50番目）に 1★（15日で 算定した 根拠）', () => {
  const row = TD.santeiRow({ jimusho: { todofuken: '21', gunshiku: '01', kigou: 'ｹｲﾄ' },
    emp: { kana: 'ｱ ｲ', kanji: '亜　井', birthYmd: '1990-01-01', seiriNo: '1' }, tekiyoYm: '2026-09',
    months: [M(16, 100000), M(16, 100000), M(16, 100000)], rule: RULE('part'),
    bikou: { part: true } });
  ok(row[49] === '1', '★備考欄項目7が ' + JSON.stringify(row[49]) + '★（1 のはず）');
  ok(row[48] === '', '★短時間の 印まで 付けている★');
});

T('㉓ ★70歳以上の 人は 出さない（基礎年金番号を 持っていないから）★', () => {
  const inp = { emp: { kana: 'ｳ ｴ', kanji: '宇　江' }, months: [M(20, 300000), M(20, 300000), M(20, 300000)],
    rule: RULE(''), bikou: { over70: true } };
  ok(TD.dasuKa(inp) === false, '★70歳以上の 人を 入れてしまう★＝厚年の 70歳以上分が 黙って 漏れる');
  const w = TD.santeiWarn(inp).join('／');
  ok(w.indexOf('70歳') >= 0, '★知らせていない★ … ' + (w || '（何も 出ていない）'));
});

T('㉔ ★画面が 備考を 渡している★（渡さないと 印が 全部 空に なる）', () => {
  const fs2 = require('node:fs');
  const app = fs2.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const i = app.indexOf('function santeiCsvInput');
  const box = app.slice(i, i + 1800);
  ok(/bikou\s*:/.test(box), '★bikou を 1度も 渡していない★＝備考欄が 全部 空');
  ok(/isOver70/.test(box) && /stType|shortTimeType/.test(box), '★70歳・短時間/パートの どれかを 渡していない★');
});

if (SELF) {
  console.log('\n[santei-soukei] ★自己確認★（★境界を 1日ずつ★）');
  let ng = 0;
  const say = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  const one = (d, st) => TD.taishoMonths([M(d, 100000), M(0, 0), M(0, 0)], RULE(st));
  say('一般 17日 … 入る', one(17, '').index.length === 1 && one(17, '').kubun === '17');
  say('★一般 16日 … 入らない★（15の特例は パートだけ＝画面と 同じ）', one(16, '').index.length === 0 && one(16, '').jusen === true);
  say('パート 16日 … ★15の組で 入る★', one(16, 'part').kubun === '15' && one(16, 'part').index.length === 1);
  say('パート 15日 … 入る（15の組）', one(15, 'part').kubun === '15');
  say('★パート 14日 … 入らない★', one(14, 'part').index.length === 0 && one(14, 'part').jusen === true);
  say('短時間 11日 … 入る', one(11, 'tanjikan').index.length === 1);
  say('★短時間 10日 … 入らない★', one(10, 'tanjikan').index.length === 0);
  say('短時間 16日 … 入る（11以上なので）', one(16, 'tanjikan').index.length === 1 && one(16, 'tanjikan').kubun === '11');
  say('日数が 空 … 入らない（0と 同じ）', TD.taishoMonths([{}, {}, {}], RULE('')).index.length === 0);
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★9通り ぜんぶ 思った通り★');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
