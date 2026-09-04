/* todokede-csv.test.mjs — ★算定基礎届の CSV（電子申請）★の 土台
 * ============================================================================
 * ★一次情報（2026-09-03 に PDF 342ページを 開いて 原文で 読んだ）★
 *   「ＣＳＶ形式届書作成仕様書（電子申請）／電子媒体届書作成仕様書」★令和8年3月・第16.2版★
 *   https://www.nenkin.go.jp/denshibenri/denshishinsei/20210401-2.files/specs080302_16.2.pdf
 *   ・項目区切り …「★“,”（カンマ）と設定する／項目区切りは省略しない★」（35p）
 *   ・改行 …「★改行 0D0A（１６進）★／項目区切り 2C」（38p）＝★CRLF★
 *   ・文字 …「1バイト＝ＪＩＳ８単位符号（JIS X 0201-1976）／2バイト＝★シフトＪＩＳコード
 *      （JIS X 0208-1990（第一水準・第二水準））★」（38p）
 *   ・様式コード …「★2225700★を設定する」（136p）
 *   ・元号 …「★昭和：「5」・平成：「7」・令和：「9」★」（137p）
 *   ・個人番号 …「★70歳以上被用者の場合に設定★／入力できない場合は基礎年金番号を必須」（141p）
 *   ・引用符（" で囲む）の 記載 … ★342ページ 探して 0件★＝★囲まない で 進む（未測定と 書き続ける）★
 *
 * ★ここで 固定する事★
 *   ① 元号を 数字に する（昭和5・平成7・令和9）＋年月日は YYMMDD 6桁
 *   ② ★Shift_JIS（JIS X 0208 第一・第二水準）で 出せない 字は 止める★
 *      ＝★cp932 では 出せる 髙・﨑・①・㈱ も 止める★（★出せた つもりで 弾かれる★を 防ぐ）
 *   ③ ★カンマ・改行が 混ざっていたら 止める★（囲まないので ★列が ずれる★）
 *   ④ 止めた時は ★どの 字か 名指し★（人が 直せる）
 *   ⑤ ★1件も 作れない時は 0バイト★（全銀と 同じ＝中途半端な ファイルを 出さない）
 *
 * 使い方: node kyuyo/tests/todokede-csv.test.mjs [--self-test]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = process.argv.includes('--self-test');
const Tm = require(path.join(ROOT, 'kyuyo/lib/todokede-csv.js'));
const TD = Tm.default || Tm;

let pass = 0, fail = 0;
const T = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };

console.log('\n[todokede-csv] 算定基礎届の CSV（電子申請・第16.2版）の 土台');

T('★① 元号を 数字に する（昭和5・平成7・令和9）', () => {
  ok(TD.gengoOf('1980-05-15').code === '5', '★昭和が 5に ならない★ … ' + JSON.stringify(TD.gengoOf('1980-05-15')));
  ok(TD.gengoOf('1995-04-01').code === '7', '★平成が 7に ならない★');
  ok(TD.gengoOf('2026-09-03').code === '9', '★令和が 9に ならない★');
  /* 原文の 例＝昭和21年5月27日 */
  const s = TD.gengoOf('1946-05-27');
  ok(s.code === '5' && s.ymd6 === '210527', '★原文の 例（昭和21年5月27日→5／210527）と 合わない★ … ' + JSON.stringify(s));
  console.log('     1946-05-27 → 元号 ' + s.code + '／' + s.ymd6);
});

T('★② 境目の 日（改元の 日）で 変わる', () => {
  ok(TD.gengoOf('1989-01-07').code === '5', '★1989-01-07 は 昭和★');
  ok(TD.gengoOf('1989-01-08').code === '7', '★1989-01-08 から 平成★');
  ok(TD.gengoOf('2019-04-30').code === '7', '★2019-04-30 は 平成★');
  ok(TD.gengoOf('2019-05-01').code === '9', '★2019-05-01 から 令和★');
});

T('★③ 出せない 字を 名指しで 止める（cp932では 出せる 字も 止める）', () => {
  ok(TD.badChars('山田 太郎').length === 0, '★ふつうの 名前を 止めている★');
  for (const [nm, ch] of [['髙橋 太郎', '髙'], ['山﨑 花子', '﨑'], ['①番 太郎', '①'], ['㈱ゼロ', '㈱']]) {
    const bad = TD.badChars(nm);
    ok(bad.length === 1 && bad[0] === ch, '★「' + nm + '」で 止まらない／字が 違う★ … ' + JSON.stringify(bad));
  }
  console.log('     髙・﨑・①・㈱ … ぜんぶ 名指しで 止まる（cp932 では 通る 字）');
});

T('★④ カンマ・改行が 入っていたら 止める（囲まないので 列が ずれる）', () => {
  ok(TD.badChars('山田,太郎').length >= 1, '★カンマを 通している★');
  ok(TD.badChars('山田\n太郎').length >= 1, '★改行を 通している★');
});

T('★⑤ Shift_JIS の バイトに する（漢字が 空白に ならない）', () => {
  const b = TD.toSjis('山田');
  ok(b.length === 4, '★2文字が 4バイトに ならない★ … ' + b.length);
  ok(b[0] === 0x8E && b[1] === 0x52, '★「山」が 0x8E52 に ならない★ … ' + b[0].toString(16) + b[1].toString(16));
  /* ★既に在る 全銀の 変換は 半角だけ（漢字は 0x20 に 落ちる）★＝ここで それを 使わない事を 見る */
  ok(b[0] !== 0x20, '★漢字が 空白に 落ちている（全銀の 変換を 使っている）★');
});

T('★⑥ 1行の 組み立て＝区切りは カンマ・囲まない', () => {
  const line = TD.joinLine(['2225700', '38', '01', 'ｹｲﾄ', '1']);
  ok(line === '2225700,38,01,ｹｲﾄ,1', '★区切りが カンマで ない／囲んでいる★ … ' + line);
});

T('★⑦ ファイルの 改行は CRLF（0D0A）', () => {
  const f = TD.build([['a'], ['b']]);
  ok(f && f.bytes, '★ファイルが 出ない★');
  const s = Array.from(f.bytes);
  ok(s.indexOf(0x0D) >= 0 && s[s.indexOf(0x0D) + 1] === 0x0A, '★CRLF に なっていない★');
  ok(s.indexOf(0x0A) - 1 === s.indexOf(0x0D), '★LF だけの 改行が 在る★');
});

T('★⑧ 1件も 作れない時は 0バイト（中途半端な ファイルを 出さない）', () => {
  const f = TD.build([]);
  ok(f && f.bytes && f.bytes.length === 0, '★空でも 何か 出している★ … ' + (f && f.bytes && f.bytes.length));
});

/* ────────── 53項目の 行（算定基礎届データレコード） ────────── */
const SAMPLE = {
  jimusho: { todofuken: '38', gunshiku: '01', kigou: 'ｹｲﾄ' },
  emp: { seiriNo: '12', kana: 'ﾔﾏﾀﾞ ﾀﾛｳ', kanji: '山田　太郎', birthYmd: '1980-05-15' },
  tekiyoYm: '2026-09',
  zenzen: { health: 260000, pension: 260000, kaiteiYmd: '2025-09-01' },
  months: [ { days: 30, tsuka: 260000, genbutsu: 0 }, { days: 31, tsuka: 260000, genbutsu: 0 }, { days: 30, tsuka: 260000, genbutsu: 0 } ],
};

T('★⑨ 53項目 ちょうど 出る（多くも 少なくも ない）', () => {
  const row = TD.santeiRow(SAMPLE);
  ok(Array.isArray(row), '★行が 配列で 返らない★');
  ok(row.length === 53, '★' + row.length + '項目★（様式は 53）');
  console.log('     項目数 … ' + row.length);
});

T('★⑩ 決まっている 値は 原文どおり', () => {
  const r = TD.santeiRow(SAMPLE);
  ok(r[0] === '2225700', '★様式コードが 違う★ … ' + r[0]);          /* 136p */
  ok(r[7] === '5', '★元号（生年月日）が 昭和5で ない★ … ' + r[7]);   /* 137p */
  ok(r[8] === '550515', '★生年月日 YYMMDD が 違う★ … ' + r[8]);
  ok(r[21] === '04' && r[22] === '05' && r[23] === '06', '★支給月が 04/05/06 で ない★');
});

T('★⑪ 境界①＝1千万円以上は 9999999（★黙って 丸めない★）', () => {
  const mk = (v) => TD.santeiRow(Object.assign({}, SAMPLE, {
    months: [ { days: 30, tsuka: v, genbutsu: 0 }, { days: 30, tsuka: 0, genbutsu: 0 }, { days: 30, tsuka: 0, genbutsu: 0 } ] }));
  ok(mk(9999999)[27] === '9999999', '★9,999,999 が そのまま 出ない★ … ' + mk(9999999)[27]);
  ok(mk(10000000)[27] === '9999999', '★1千万で 9999999 に ならない★ … ' + mk(10000000)[27]);
  ok(mk(10000001)[27] === '9999999', '★1千万超で 9999999 に ならない★');
  /* ★丸めた事を 言えるか★（画面に 出す為） */
  const w = TD.santeiWarn(Object.assign({}, SAMPLE, {
    months: [ { days: 30, tsuka: 12000000, genbutsu: 0 }, { days: 30, tsuka: 0, genbutsu: 0 }, { days: 30, tsuka: 0, genbutsu: 0 } ] }));
  ok(w.some((x) => /9999999|1千万/.test(x)), '★丸めたのに 何も 言わない★ … ' + JSON.stringify(w));
  console.log('     9,999,999→そのまま／10,000,000→9999999（★言う★）');
});

T('★⑫ 境界②＝報酬が 無い月は 0000000／基礎日数 0日は 00', () => {
  const r = TD.santeiRow(Object.assign({}, SAMPLE, {
    months: [ { days: 0, tsuka: 0, genbutsu: 0 }, { days: 31, tsuka: 260000, genbutsu: 0 }, { days: 30, tsuka: 260000, genbutsu: 0 } ] }));
  ok(r[24] === '00', '★基礎日数 0日が 00 で ない★ … ' + r[24]);
  ok(r[27] === '0000000', '★報酬が 無い月が 0000000 で ない★ … ' + r[27]);
});

T('★⑬ 境界③＝前ゼロを 付けて 桁を 揃える（1つに 決める）', () => {
  const r = TD.santeiRow(SAMPLE);
  ok(r[27] === '0260000', '★通貨に 前ゼロが 付いていない★ … ' + r[27]);
  ok(r[33] === '0260000', '★合計に 前ゼロが 付いていない★ … ' + r[33]);
  ok(/^\d{7}$/.test(r[36]), '★総計が 7桁で ない★ … ' + r[36]);
});

T('★⑭ ⑬合計＝⑪通貨＋⑫現物（紙と 同じ 足し算）', () => {
  const r = TD.santeiRow(Object.assign({}, SAMPLE, {
    months: [ { days: 30, tsuka: 230000, genbutsu: 30000 }, { days: 31, tsuka: 260000, genbutsu: 0 }, { days: 30, tsuka: 260000, genbutsu: 0 } ] }));
  ok(r[27] === '0230000' && r[30] === '0030000' && r[33] === '0260000',
    '★通貨/現物/合計が 合わない★ … ' + [r[27], r[30], r[33]].join(' / '));
});

T('★⑮ 個人番号は いつも 空（持たない）', () => {
  const r = TD.santeiRow(SAMPLE);
  ok(r[39] === '', '★個人番号に 何か 入っている★ … ' + r[39]);
});

/* ────────── 1行目（媒体管理）・2行目（事業所管理） ────────── */
const JIM = { todofuken: '21', gunshiku: '01', kigou: 'ｹｲﾄ', jigyoshoNo: '123',
  zipOya: '100', zipKo: '0000', address: '東京都千代田区霞が関１－２－２',
  name: '健保サービス株式会社', nushi: '健保　良一', tel1: '03', tel2: '1234', tel3: '5678' };

T('★⑯ 1行目＝媒体管理レコード（原文の 例と 同じ 並び）', () => {
  const r = TD.baitaiRow(JIM, { tsuban: 1, ymd: '2017-01-01', daihyo: '22223' });
  ok(TD.joinLine(r) === '21,01,ｹｲﾄ,001,20170101,22223',
    '★原文の 例と 違う★ … ' + TD.joinLine(r));
  console.log('     ' + TD.joinLine(r) + '（原文 64ページの 例と 同じ）');
});

T('★⑰ 媒体通番＝3桁・001から・999の次は001', () => {
  ok(TD.baitaiRow(JIM, { tsuban: 1 })[3] === '001', '★001に ならない★');
  ok(TD.baitaiRow(JIM, { tsuban: 999 })[3] === '999', '★999が 出ない★');
  ok(TD.nextTsuban(999) === 1, '★999の 次が 001に ならない★ … ' + TD.nextTsuban(999));
  ok(TD.nextTsuban(1) === 2 && TD.nextTsuban(0) === 1, '★上げ方が おかしい★');
});

T('★⑱ 2行目＝事業所管理レコード（[kanri] と [data] の 区切り符号）', () => {
  const f = TD.santeiCsv({ jimusho: JIM, baitai: { tsuban: 1, ymd: '2026-09-03' }, rows: [TD.santeiRow(SAMPLE)] });
  ok(f.text.indexOf('[kanri]') >= 0, '★[kanri] が 無い★');
  ok(f.text.indexOf('[data]') >= 0, '★[data] が 無い★');
  const lines = f.text.split(TD.CRLF).filter(Boolean);   /* ★'
' と 書くと 実際の 改行に なる（今日 3回目）★ */
  ok(lines[1] === '[kanri]', '★2行目が [kanri] で ない★ … ' + lines[1]);
  ok(lines[2] === ',001', '★事業所数情報が「,001」で ない★ … ' + lines[2]);
  ok(lines[4] === '[data]', '★[data] の 位置が 違う★ … ' + JSON.stringify(lines.slice(0, 6)));
  console.log('     行 … ' + lines.slice(0, 5).map((x) => x.slice(0, 22)).join(' ／ '));
});

T('★⑲ 1件も 作れない時は 0バイト（ヘッダだけ 出さない）', () => {
  const f = TD.santeiCsv({ jimusho: JIM, baitai: { tsuban: 1 }, rows: [] });
  ok(f.bytes.length === 0, '★人が 0人でも ヘッダを 出している★ … ' + f.bytes.length + 'バイト');
});

T('★⑳ ファイル名は 仕様どおり（電子申請は 拡張子 CSV）', () => {
  ok(TD.FILE_NAME === 'SHFD0006.CSV', '★ファイル名が 違う★ … ' + TD.FILE_NAME);
});

T('★㉑ 都道府県コードは 原文の 一覧（★総務省の 番号とは 違う★）', () => {
  /* 参考資料３（342p・原文）… 東京都=21／神奈川県=31／大阪府=41／愛知県=51／香川県=72／沖縄県=82
     ★総務省の コード（東京13・大阪27・愛知23）とは まったく 違う★＝★思い込みで 埋めない★ */
  ok(TD.KEN_CODE.tokyo === '21', '★東京都が 21で ない★ … ' + TD.KEN_CODE.tokyo);
  ok(TD.KEN_CODE.osaka === '41', '★大阪府が 41で ない★');
  ok(TD.KEN_CODE.aichi === '51', '★愛知県が 51で ない★');
  ok(TD.KEN_CODE.kagawa === '72', '★香川県が 72で ない★');
  ok(TD.KEN_CODE.hokkaido === '01' && TD.KEN_CODE.okinawa === '82', '★端（北海道・沖縄）が 違う★');
  ok(Object.keys(TD.KEN_CODE).length === 47, '★47県 そろっていない★ … ' + Object.keys(TD.KEN_CODE).length);
  console.log('     47県／東京21・大阪41・愛知51・香川72（総務省の 13・27・23 とは 違う）');
});

T('★㉒ 事業所整理記号を 分ける（原文の 例どおり）', () => {
  /* 原文（69p）…「０１－ケイト」→ 郡市区符号「01」／事業所記号「ｹｲﾄ」 */
  const r = TD.splitSeiriKigou('01-ｹｲﾄ');
  ok(r && r.gunshiku === '01' && r.kigou === 'ｹｲﾄ', '★分け方が 原文と 違う★ … ' + JSON.stringify(r));
  ok(TD.splitSeiriKigou('０１－ケイト').gunshiku === '01', '★全角で 入れても 分けられない★');
  ok(!TD.splitSeiriKigou('ケイト'), '★区切りが 無い物を 通している★');
});

T('★㉓ 道具（TextDecoder）が 無い時に ★黙って 空に しない★', () => {
  /* ★指示役が 自分の 測り台で 踏んだ★（2026-09-03）＝TextDecoder を 積み忘れたら
     ★漢字が 全部 0バイトに 消えた（281バイトに 見えた）★。
     ★読み取りの 道具が 無い時に 黙って 落とす★のは うちで 何度も 出ている 型
     （[[feedback_reader_library_drops_data_before_engine]]）。
     ⇒★道具が 無ければ badChars が 名指しで 止める★＝★静かに 消えない★ 事を 固定する。 */
  const keep = globalThis.TextDecoder;
  try {
    delete globalThis.TextDecoder;
    TD._resetSjisMap && TD._resetSjisMap();
    const bad = TD.badChars('山田 太郎');
    ok(bad.length >= 1, '★道具が 無いのに 何も 言わない★＝黙って 消える（' + JSON.stringify(bad) + '）');
    ok(bad.indexOf('山') >= 0, '★止めた 字を 名指ししていない★ … ' + JSON.stringify(bad));
    console.log('     道具が 無い時 … 「山田 太郎」で ' + bad.length + '字 止める（' + bad.join('') + '）');
  } finally {
    globalThis.TextDecoder = keep;
    TD._resetSjisMap && TD._resetSjisMap();
  }
});

T('★㉔ 4.5MB 以上は 出さない（★等号は 資料の 中で 割れている＝厳しい側に 倒す★）', () => {
  /* ★一次情報が 1つの ページの 中で 割れている★（操作説明書 第三部 18ページ・原文）:
       「＜電子申請の届書ファイルサイズが ★4.5MB以上★の場合＞…★電子申請が行えない★」
       「…届書ファイルを ★4.5MB以下★のファイルサイズとなるように分割し」
     ⇒★ちょうど 4.5MB は「行えない」でも「分割後の 合格」でも ある★＝★誰にも 決められない（未測定）★
     ⇒★両方の 読みが 揃って 許すのは「未満」だけ★＝★4.5MB 以上で 止める★（指示役の裁定 2026-09-04）
     ★MB の 数え方（1024×1024 か 1,000,000 か）も 原文に 無い★＝★小さい方（1,000,000）で 止める★
       ＝★早く 止まる＝安全側★。 */
  ok(TD.MAX_BYTES === 4500000, '★止める線が 4,500,000 バイトで ない★ … ' + TD.MAX_BYTES);
  ok(TD.tooBig(4499999) === false, '★4,499,999 で 止めている★');
  ok(TD.tooBig(4500000) === true, '★ちょうど 4.5MB を 通している★（★厳しい側に 倒す★）');
  ok(TD.tooBig(4500001) === true, '★4.5MB 超を 通している★');
  console.log('     4,499,999=出す ／ ★4,500,000=止める★ ／ 4,500,001=止める');
});

if (SELF) {
  console.log('\n[todokede-csv] ★自己確認★（★わざと 壊すと 赤に なるか★）');
  let ng = 0;
  const say = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  say('出る組と 出ない組で 答えが 違う（物差しが 効いている）',
    TD.badChars('髙').length === 1 && TD.badChars('高').length === 0);
  say('元号は 日で 変わる（年だけ 見ていない）',
    TD.gengoOf('2019-04-30').code !== TD.gengoOf('2019-05-01').code);
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★2通り ぜんぶ 思った通り★');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
