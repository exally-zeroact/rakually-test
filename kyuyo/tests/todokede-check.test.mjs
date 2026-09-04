/* todokede-check.test.mjs — ★年金機構の 検査を こちらで 再現した 物★
 * ============================================================================
 * ★なぜ（2026-09-04 司さん）★
 *   「おれにUIとか以外で見さすなや／★お前らが確認してリサーチして間違えてないか確認するんやろが★」
 *   ⇒★司さんに 年金機構の プログラムを 触らせない★。公式の 項目表の チェックを こちらで 走らせる。
 *
 * ★出どころ★ zidoucheck.files/csv225.pdf（算定・53項目・チェック143行）／csv221.pdf（月変・49項目）
 *
 * ★これで 見つけた 本物の 間違い（2026-09-04）★
 *   ★従前の 改定月が 空の 人を そのまま 出していた★（算定）
 *     ＝項番15・16・17「入力されていること」で ★年金機構に 3件 弾かれる★。
 *     月変（dasuKaGekkaku）は 見ていたのに、算定（dasuKa）は 見ていなかった。
 *
 * 使い方: node kyuyo/tests/todokede-check.test.mjs [--self-test]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TD = require(path.join(ROOT, 'lib/todokede-csv.js'));
const C = require(path.join(ROOT, 'lib/todokede-check.js'));
const PM = require(path.join(ROOT, 'lib/payroll-monthly.js'));
const SELF = process.argv.includes('--self-test');
let pass = 0, fail = 0;
const T = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const R = (st) => PM.santeiRule({ shortTimeType: st });
const M = (d, t, g) => ({ days: d, tsuka: t, genbutsu: g || 0 });
/* ★事務所の 情報は 実物と 同じ 形で 持つ★（1〜4行目も 検査に かかる）
   仕様書の 作成例そのもの＝21,01,ｹｲﾄ,123,100,0000,東京都千代田区霞が関１－２－２,…,健保　良一,03,1234,5678 */
const JIM = { todofuken: '21', gunshiku: '01', kigou: 'ｹｲﾄ', jigyoshoNo: '123',
  zipOya: '100', zipKo: '0000', address: '東京都千代田区霞が関１－２－２',
  name: '健保サービス株式会社', nushi: '健保' + String.fromCharCode(0x3000) + '良一',
  tel1: '03', tel2: '1234', tel3: '5678' };
const EMP = { seiriNo: '1', kana: 'ﾈﾝｷﾝ ﾀﾛｳ', kanji: '年金' + C.ZEN_SP + '太郎', birthYmd: '1975-01-11' };
const ZEN = { health: 260000, pension: 260000, kaiteiYmd: '2025-09-01' };
const santei = (ov) => TD.santeiRow(Object.assign({
  jimusho: JIM, emp: EMP, zenzen: ZEN, tekiyoYm: '2026-09',
  months: [M(17, 300000), M(16, 200000), M(18, 310000)], rule: R(''), bikou: {} }, ov || {}));
const gekkaku = (ov) => TD.gekkakuRow(Object.assign({
  jimusho: JIM, emp: EMP, zenzen: ZEN, henkoYm: '2026-04',
  months: [M(20, 300000), M(21, 310000), M(20, 320000)], bikou: {} }, ov || {}));
const naka = (errs) => errs.map((x) => '項番' + x.no + ' ' + x.name + '／' + x.why).join(' ／ ');

console.log('\n[todokede-check] 年金機構の 検査を こちらで 再現（★司さんに 触らせない★）');

T('★① うちが 出している 算定・月変が そのまま 通る', () => {
  const a = C.check(santei());
  ok(a.measured && !a.errors.length, '★算定で ' + a.errors.length + '件★ … ' + naka(a.errors));
  const b = C.check(gekkaku());
  ok(b.measured && !b.errors.length, '★月変で ' + b.errors.length + '件★ … ' + naka(b.errors));
});

T('★② 見た事の無い 様式は 🟡未測定（緑に しない）', () => {
  const r = C.check(['9999999']);
  ok(r.measured === false, '★知らない 様式を 緑に している★');
});

T('★③ 従前の 改定月が 空＝3件 出る（★実物で 見つけた 穴★）', () => {
  const e = C.check(santei({ zenzen: { health: 260000, pension: 260000, kaiteiYmd: '' } })).errors;
  ok(e.length === 3, '★' + e.length + '件★（3件 のはず）… ' + naka(e));
  ok(e.every((x) => [15, 16, 17].indexOf(x.no) >= 0), '★項番が 15・16・17 でない★');
});

T('★④ 名前の 形（すき間・長さ）を 捕まえる', () => {
  ok(C.check(santei({ emp: Object.assign({}, EMP, { kana: 'ﾈﾝｷﾝﾀﾛｳ' }) })).errors.some((x) => x.no === 6), '★カナの すき間なし★');
  ok(C.check(santei({ emp: Object.assign({}, EMP, { kanji: '年金' + C.ZEN_SP + C.ZEN_SP + '太郎' }) })).errors.some((x) => x.no === 7), '★漢字の すき間 2つ★');
  ok(C.check(santei({ emp: Object.assign({}, EMP, { kana: 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿ ﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉ' }) })).errors.some((x) => x.no === 6), '★カナ 26バイト★');
  ok(!C.check(santei()).errors.length, '★正しい 名前を 赤に している★');
});

T('★⑤ 事業所の 番号（記号・郡市区符号・整理番号）を 捕まえる', () => {
  ok(C.check(santei({ jimusho: { todofuken: '21', gunshiku: '01', kigou: 'ケイト' } })).errors.some((x) => x.no === 4), '★全角の 事業所記号★');
  ok(C.check(santei({ jimusho: { todofuken: '21', gunshiku: '00', kigou: 'ｹｲﾄ' } })).errors.some((x) => x.no === 3), "★郡市区符号 '00'★");
  ok(C.check(santei({ jimusho: { todofuken: '21', gunshiku: '99', kigou: 'ｹｲﾄ' } })).errors.some((x) => x.no === 3), "★郡市区符号 '99'★");
  ok(C.check(santei({ emp: Object.assign({}, EMP, { seiriNo: '0' }) })).errors.some((x) => x.no === 5), "★整理番号 '0'★");
});

T('★⑥ 金額の 相関（合計＝通貨＋現物）を 捕まえる', () => {
  const r = santei();
  r[33] = '0000001';                                   /* 4月の 合計を わざと 壊す */
  const e = C.check(r).errors;
  ok(e.some((x) => x.no === 34), '★合計の ズレを 見ていない★ … ' + naka(e));
});

T('★⑦ 月変だけの 決まり（続きの 月・日数の 下限・平均額÷3）', () => {
  const r = gekkaku();
  r[23] = '08';                                        /* 前一ヶ月を わざと 飛ばす */
  ok(C.check(r).errors.some((x) => x.no === 24), '★続きの 月を 見ていない★');
  const r2 = gekkaku({ months: [M(16, 300000), M(20, 310000), M(20, 320000)] });
  ok(C.check(r2).errors.some((x) => x.no === 25), "★前三ヶ月 16日（17〜31の 外）を 見ていない★");
  const r3 = gekkaku();
  r3[37] = '0000001';                                  /* 平均額を わざと 壊す */
  ok(C.check(r3).errors.some((x) => x.no === 38), '★平均額÷3 を 見ていない★');
});

T('★⑧ 短時間労働者（備考欄項目3）なら 11日から 通す', () => {
  const r = gekkaku({ months: [M(11, 100000), M(12, 100000), M(11, 100000)], bikou: { tanjikan: true } });
  ok(!C.check(r).errors.length, '★短時間の 11日を 赤に している★ … ' + naka(C.check(r).errors));
  const r2 = gekkaku({ months: [M(11, 100000), M(12, 100000), M(11, 100000)], bikou: {} });
  ok(C.check(r2).errors.filter((x) => x.no >= 25 && x.no <= 27).length === 3, '★印が 無いのに 11日を 通している★');
});

T('★⑨ ファイル まとめて 見られる（何行目かが 分かる）', () => {
  const r = C.checkRows([santei(), santei({ zenzen: { kaiteiYmd: '' } })]);
  ok(r.hito === 2, '★人数★');
  ok(r.errors.length === 3 && r.errors.every((x) => x.gyo === 2), '★何行目かが 出ていない★ … ' + JSON.stringify(r.errors));
});

T('★⑩ 従前の 改定月が 空の 人は 出さない（穴を 塞ぐ）', () => {
  const inp = { jimusho: JIM, emp: EMP, zenzen: { health: 260000, pension: 260000, kaiteiYmd: '' },
    tekiyoYm: '2026-09', months: [M(17, 300000), M(16, 200000), M(18, 310000)], rule: R(''), bikou: {} };
  ok(TD.dasuKa(inp) === false, '★従前の 改定月が 空の 人を 入れてしまう★＝年金機構で 3件 弾かれる');
  const w = TD.santeiWarn(inp).join('／');
  ok(/従前の 改定月|従前の改定月/.test(w), '★知らせていない★ … ' + (w || '（何も 出ていない）'));
});

T('★⑪ 出す前に 必ず 検査を 通す（1件でも 出たら ファイルを 作らない）', () => {
  const good = TD.santeiCsv({ jimusho: JIM, baitai: { tsuban: '001', ymd: '2026-07-01' }, rows: [santei()] });
  ok(good.bytes.length > 0, '★正しい 物まで 止めている★');
  ok(good.kensa && good.kensa.errors.length === 0, '★検査の 結果が 付いていない★');
  const bad = santei();
  bad[33] = '0000001';                                  /* 合計を わざと 壊す */
  const f = TD.santeiCsv({ jimusho: JIM, baitai: { tsuban: '001', ymd: '2026-07-01' }, rows: [bad] });
  ok(f.kensa && f.kensa.errors.length > 0, '★壊れた 物を 検査していない★');
  ok(f.bytes.length === 0, '★壊れた 物を そのまま ファイルに している★');
  const g = TD.gekkakuCsv({ jimusho: JIM, baitai: { tsuban: '001', ymd: '2026-07-01' }, rows: [gekkaku()] });
  ok(g.bytes.length > 0 && g.kensa.errors.length === 0, '★月変が 通らない★');
});

T('★⑫ 1行目（媒体管理レコード）の 代表届書コードは「22223」固定', () => {
  /* ★出どころ★ ＣＳＶ形式届書作成仕様書（電子申請）第16.2版 表４．１．１－１
       「６ 代表届書コード 数字 ５ ★「22223」を設定する★」
       作成例「21,01,ｹｲﾄ,001,20170101,★22223★」
     ★2026-09-04 実測★＝うちは ★空★のまま 出していた＝「代表届書コード不正」で 弾かれる */
  const f = TD.santeiCsv({ jimusho: JIM, baitai: { tsuban: '001', ymd: '2026-07-01' }, rows: [santei()] });
  const line1 = f.text.split(TD.CRLF)[0].split(',');
  ok(line1.length === 6, '★1行目が ' + line1.length + '項目★（6 のはず）');
  ok(line1[3] === '001', '★媒体通番★ … ' + line1[3]);
  ok(/^[0-9]{8}$/.test(line1[4]), '★作成年月日 8桁★ … ' + line1[4]);
  ok(line1[5] === '22223', '★代表届書コードが ' + JSON.stringify(line1[5]) + '★（22223 のはず）');
});

T('★⑬ 1〜4行目（媒体管理・事業所情報）も 検査する', () => {
  /* ★出どころ★ ＣＳＶ形式届書作成仕様書（電子申請）第16.2版
       表４．１．１－１（媒体管理）／表４．３．１－１（事業所数情報）／表４．３．２．１－１（事業所情報）
     ★事業所番号 数字1〜5／郵便番号 親3・子4／所在地 漢字1〜37／名称 漢字1〜25／
       事業主氏名 漢字1〜12・★姓と名の間に全角スペースを１文字★★ */
  ok(typeof C.checkHeader === 'function', '★checkHeader が 無い★＝1〜4行目を 見ていない');
  const JI = { todofuken: '21', gunshiku: '01', kigou: 'ｹｲﾄ', jigyoshoNo: '123',
    zipOya: '100', zipKo: '0000', address: '東京都千代田区霞が関１－２－２',
    name: '健保サービス株式会社', nushi: '健保' + C.ZEN_SP + '良一', tel1: '03', tel2: '1234', tel3: '5678' };
  ok(!C.checkHeader(JI, { tsuban: '001', ymd: '20260701' }).length,
    '★仕様書の 作成例そのものを 赤に している★ … ' + JSON.stringify(C.checkHeader(JI, { tsuban: '001', ymd: '20260701' })));
  const bad = function (ov) { return C.checkHeader(Object.assign({}, JI, ov), { tsuban: '001', ymd: '20260701' }); };
  ok(bad({ jigyoshoNo: '' }).length, '★事業所番号が 空★');
  ok(bad({ jigyoshoNo: '123456' }).length, '★事業所番号 6桁★（1〜5）');
  ok(bad({ zipOya: '10' }).length, '★郵便番号 親が 2桁★');
  ok(bad({ zipKo: '00000' }).length, '★郵便番号 子が 5桁★');
  ok(bad({ nushi: '健保 良一' }).length, '★事業主氏名が 半角すき間★');
  ok(bad({ nushi: '健保良一' }).length, '★事業主氏名に すき間なし★');
  ok(bad({ nushi: '健保' + C.ZEN_SP + '良一郎左衛門尉之介助' }).length, '★事業主氏名が 13文字★（1〜12）');
  ok(bad({ name: 'あ'.repeat(26) }).length, '★事業所名称 26文字★（1〜25）');
  ok(bad({ address: 'あ'.repeat(38) }).length, '★所在地 38文字★（1〜37）');
  ok(C.checkHeader(JI, { tsuban: '000', ymd: '20260701' }).length, "★媒体通番 '000'★（001〜999）");
});

T('★⑭ 1〜4行目が だめなら ファイルを 作らない', () => {
  const JI = { todofuken: '21', gunshiku: '01', kigou: 'ｹｲﾄ', jigyoshoNo: '123',
    zipOya: '100', zipKo: '0000', address: '東京都千代田区1-1', name: 'テスト',
    nushi: '健保 良一', tel1: '03', tel2: '1234', tel3: '5678' };   /* ★半角すき間★ */
  const f = TD.santeiCsv({ jimusho: JI, baitai: { tsuban: '001', ymd: '2026-07-01' }, rows: [santei()] });
  ok(f.kensa.errors.length > 0, '★1〜4行目を 検査していない★');
  ok(f.bytes.length === 0, '★だめな 1行目のまま ファイルを 作っている★');
});

if (SELF) {
  console.log('\n[todokede-check] ★自己確認★（★物差し そのもの★）');
  let ng = 0;
  const say = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  say('バイト数 … 半角カナは 1バイト', C.sjisBytes('ﾈﾝｷﾝ') === 4);
  say('バイト数 … 漢字は 2バイト', C.sjisBytes('年金') === 4);
  say('バイト数 … 全角すき間も 2バイト', C.sjisBytes(C.ZEN_SP) === 2);
  say('★すき間 … 無い＝だめ★', C.sepOk('ﾈﾝｷﾝﾀﾛｳ', ' ') === false);
  say('★すき間 … 1つ＝よい★', C.sepOk('ﾈﾝｷﾝ ﾀﾛｳ', ' ') === true);
  say('★すき間 … 2つ続く＝だめ★', C.sepOk('ﾈﾝｷﾝ  ﾀﾛｳ', ' ') === false);
  say('すき間 … 離れて 2つ＝よい（連続していない）', C.sepOk('ｱ ｲ ｳ', ' ') === true);
  say('実存日 … 2月30日は だめ', C.jitsuzonbi('500230') === false);
  say('実存日 … 4月31日は だめ', C.jitsuzonbi('500431') === false);
  say('実存日 … 1月31日は よい', C.jitsuzonbi('500131') === true);
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★10通り ぜんぶ 思った通り★');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
