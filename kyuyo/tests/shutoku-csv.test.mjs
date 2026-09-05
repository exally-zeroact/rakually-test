/* shutoku-csv.test.mjs — ★資格取得届の 電子申請CSV（様式2200700・34項目）★
 * ============================================================================
 * ★出どころ（2026-09-05 に 落として ★表として★ 字を 取った）★
 *   zidoucheck.files/★csv200_202412.pdf★（全34項目・チェック118行）
 *   ★1回 空振りした★＝csv220.pdf は 無く、12,949バイトの ★お知らせHTML★が
 *     落ちてきていた（先頭5バイトが '%PDF-' でない）。
 *     ⇒★落とした物が 本当に その物か を 見てから 読む★（名前だけで 信じない）。
 *   ★正しい 名前は zidoucheck.html の 一覧から 取った★。
 *
 * ★算定（2225700）と 並びが 違う★
 *   算定 … 5＝被保険者整理番号
 *   取得 … ★5＝事業所番号／6＝被保険者整理番号★（1つ ずれる）
 *   ⇒★使い回さない★（写すと 全部 1つ ずれた CSV を 出す）
 *
 * ★このアプリは マイナンバーを お預かりしない★（司さんの決め）
 *   ⇒ 原文の 相関で ★29 郵便番号（親）・30 郵便番号（子）・31 住所（カナ）が 必須★
 *   ⇒ 足りない人は ★ファイルに 入れず 名前を 挙げて 知らせる★
 *
 * 使い方: node kyuyo/tests/shutoku-csv.test.mjs [--self-test]
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(pathToFileURL(path.join(ROOT, 'package.json')));
const T = require_('./kyuyo/lib/todokede-csv.js');
const C = require_('./kyuyo/lib/todokede-check.js');
const SELF = process.argv.includes('--self-test');

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || '違います'); };

const JIMU = { todofuken: '38', gunshiku: '01', kigou: 'ｱｲ', jigyoshoNo: '12345',
  zipOya: '790', zipKo: '0001', address: '愛媛県松山市1-2-3', name: '株式会社テスト', nushi: '山田　太郎',
  tel1: '089', tel2: '123', tel3: '4567' };
const EMP = { seiriNo: '1', kana: 'ﾔﾏﾀﾞ ﾀﾛｳ', kanji: '山田　太郎', birthYmd: '1985-05-15',
  seibetsu: 'male', zip: '790-0001', jushoKana: 'ｴﾋﾒｹﾝ ﾏﾂﾔﾏｼ 1-2-3', jushoKanji: '愛媛県松山市1-2-3' };
const KYOU = '2026-09-05';
const base = (over = {}) => Object.assign({
  jimusho: JIMU, emp: Object.assign({}, EMP), shutokuYmd: '2026-04-01', kyou: KYOU,
  tsuka: 260000, genbutsu: 0, bikou: { fuyo: false },
}, over);

console.log('\n[shutoku-csv] 資格取得届（2200700）— 出どころ csv200_202412.pdf');

t('★34項目★（算定53・月変49・賞与21とは 別）', () => {
  ok(T.shutokuRow(base()).length === 34, '項目数が 34 でない');
});

t('★様式コードは 2200700★', () => {
  ok(T.shutokuRow(base())[0] === '2200700', '様式コードが 違う');
});

t('★5＝事業所番号／6＝被保険者整理番号★（算定とは 1つ ずれる）', () => {
  const r = T.shutokuRow(base());
  ok(r[4] === '12345', '5番が 事業所番号でない: ' + r[4]);
  ok(r[5] === '1', '6番が 被保険者整理番号でない: ' + r[5]);
});

t('公式の 検査を 1件も 出さずに 通る（ふつうの1人）', () => {
  const e = C.shutoku(T.shutokuRow(base()), KYOU);
  ok(e.length === 0, '赤が 出た: ' + JSON.stringify(e));
});

t('★取得区分は 1（健保・厚年に加入する者）／種別は 性別から★', () => {
  const r = T.shutokuRow(base());
  ok(r[11] === '1', '取得区分が 1 でない');
  ok(r[10] === '1', '男性が 1 でない');
  ok(T.shutokuRow(base({ emp: Object.assign({}, EMP, { seibetsu: 'female' }) }))[10] === '2', '女性が 2 でない');
  ok(T.shutokuRow(base({ emp: Object.assign({}, EMP, { seibetsu: 'kounai' }) }))[10] === '3', '坑内員が 3 でない');
});

t('★マイナンバーは 入れない／代わりに 郵便番号と住所カナ★', () => {
  const r = T.shutokuRow(base());
  ok(r[12] === '', '個人番号に 何か 入っている');
  ok(r[28] === '790' && r[29] === '0001', '郵便番号が 分かれていない');
  ok(r[30] === 'ｴﾋﾒｹﾝ ﾏﾂﾔﾏｼ 1-2-3', '住所カナが 入っていない');
});

t('★住所カナが 無い人は 出さない★（原文＝個人番号を省略するなら 必須）', () => {
  const inp = base({ emp: Object.assign({}, EMP, { jushoKana: '' }) });
  ok(T.dasuKaShutoku(inp) === false, '出せる事に なっている');
  ok(T.shutokuWarn(inp).join('／').indexOf('住所（カナ）') >= 0, '理由を 言っていない');
  const e = C.shutoku(T.shutokuRow(inp), KYOU);
  ok(e.some((x) => x.no === 31), '検査が 31番を 拾っていない');
});

t('★郵便番号が 無い人は 出さない★', () => {
  const inp = base({ emp: Object.assign({}, EMP, { zip: '' }) });
  ok(T.dasuKaShutoku(inp) === false, '出せる事に なっている');
  const e = C.shutoku(T.shutokuRow(inp), KYOU);
  ok(e.some((x) => x.no === 29) && e.some((x) => x.no === 30), '検査が 29・30番を 拾っていない');
});

t('★性別が 無い人は 出さない★（取得区分1なら 種別は 必須）', () => {
  const inp = base({ emp: Object.assign({}, EMP, { seibetsu: '' }) });
  ok(T.dasuKaShutoku(inp) === false, '出せる事に なっている');
  const e = C.shutoku(T.shutokuRow(inp), KYOU);
  ok(e.some((x) => x.no === 11), '検査が 11番を 拾っていない');
});

t('★入社日が 先の日付なら 出さない★（原文＝取得日 ≦ システムチェック実施日）', () => {
  const inp = base({ shutokuYmd: '2026-12-01' });
  ok(T.dasuKaShutoku(inp) === false, '未来の 入社日が 出せる事に なっている');
  const e = C.shutoku(T.shutokuRow(inp), KYOU);
  ok(e.some((x) => x.no === 18), '検査が 未来日を 拾っていない');
});

t('★合計＝通貨＋現物／1,000円未満は 出さない★', () => {
  const r = T.shutokuRow(base({ tsuka: 200000, genbutsu: 30000 }));
  ok(Number(r[22]) === 230000, '合計が 通貨＋現物 でない: ' + r[22]);
  ok(T.dasuKaShutoku(base({ tsuka: 900, genbutsu: 0 })) === false, '900円が 出せる事に なっている');
  const e = C.shutoku(T.shutokuRow(base({ tsuka: 900, genbutsu: 0 })), KYOU);
  ok(e.some((x) => x.no === 23), "検査が 「合計≧'1000'」を 拾っていない");
});

t('★70歳以上は 出さない★（基礎年金番号が 要るのに 持っていない）', () => {
  const inp = base({ bikou: { over70: true } });
  ok(T.dasuKaShutoku(inp) === false, '70歳以上が 出せる事に なっている');
  ok(T.shutokuWarn(inp).join('／').indexOf('基礎年金番号') >= 0, '理由を 言っていない');
});

t('★住所（漢字）の 半角スペースは 全角1つに 直す★（原文＝半角スペース不可）', () => {
  const r = T.shutokuRow(base({ emp: Object.assign({}, EMP, { jushoKanji: '愛媛県松山市1-2-3 ｺｰﾎﾟ101' }) }));
  ok(r[31].indexOf(' ') < 0, '半角スペースが 残っている: ' + JSON.stringify(r[31]));
  ok(C.shutoku(r, KYOU).length === 0, '赤が 出た');
});

t('★1件でも 合わなければ ファイルを 作らない（門）★', () => {
  const bad = T.shutokuRow(base({ emp: Object.assign({}, EMP, { jushoKana: '' }) }));
  const f = T.shutokuCsv({ jimusho: JIMU, baitai: { tsuban: '001', ymd: KYOU }, kyou: KYOU, rows: [bad] });
  ok(f.bytes.length === 0, '★赤が 在るのに ファイルを 作った★');
  ok(f.kensa.errors.length > 0, '検査が 何も 言っていない');
});

t('★通れば ファイルが 出る（媒体・事業所・データ）★', () => {
  const f = T.shutokuCsv({ jimusho: JIMU, baitai: { tsuban: '001', ymd: KYOU }, kyou: KYOU,
    rows: [T.shutokuRow(base())] });
  ok(f.kensa.errors.length === 0, '赤が 出た: ' + JSON.stringify(f.kensa.errors));
  ok(f.bytes.length > 0, '1バイトも 作っていない');
  ok(f.name === 'SHFD0006.CSV', 'ファイル名が 違う: ' + f.name);
  ok(f.text.indexOf('2200700') >= 0, 'データ行が 入っていない');
  ok(f.text.indexOf(T.DAIHYO_CODE) >= 0, '代表届書コードが 入っていない');
});

t('★見た事の無い 様式は 未測定★（緑に しない）', () => {
  const r = T.shutokuRow(base()); r[0] = '9999999';
  ok(C.check(r).measured === false, '知らない 様式を 測った事に している');
});

/* ── ★わざと壊して 赤に なるか★ ───────────────────────────── */
if (SELF) {
  console.log('\n★自己確認（わざと壊す）★');
  let aka = 0;
  const iu = (nm, hit) => { if (hit) aka++; console.log('  ' + (hit ? '✓ 赤に なった' : '✗ ★赤に ならない★') + ' … ' + nm); };
  iu('様式コードを 算定の 物に すり替える', C.shutoku(Object.assign(T.shutokuRow(base()), { 0: '2225700' }), KYOU).length > 0);
  iu('★1つ ずらす（算定の 並びで 作る）★', (() => {
    const r = T.shutokuRow(base()); r.splice(4, 1); r.push('');   /* 事業所番号を 抜く＝以降が 全部 ずれる */
    return C.shutoku(r, KYOU).length > 0;
  })());
  iu('住所カナを 空に する', C.shutoku(T.shutokuRow(base({ emp: Object.assign({}, EMP, { jushoKana: '' }) })), KYOU).some((x) => x.no === 31));
  iu('合計を 手で 変える（通貨＋現物と 合わなくする）', (() => {
    const r = T.shutokuRow(base()); r[22] = '0000001';
    return C.shutoku(r, KYOU).some((x) => x.no === 23);
  })());
  iu('入社日を 未来に する', C.shutoku(T.shutokuRow(base({ shutokuYmd: '2099-01-01' })), KYOU).some((x) => x.no === 18));
  iu('氏名カナに 姓名の すきまを 入れない', (() => {
    const r = T.shutokuRow(base({ emp: Object.assign({}, EMP, { kana: 'ﾔﾏﾀﾞﾀﾛｳ' }) }));
    return C.shutoku(r, KYOU).some((x) => x.no === 7);
  })());
  console.log('\n  わざと壊した 6件のうち 赤に なった … ' + aka + '件');
  if (aka < 6) { console.log('  ★見張りが 効いていません★'); process.exit(1); }
  console.log('  ✓ ★壊したら 6件とも 赤に なった＝この試験は 本当に 見張っています★');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
