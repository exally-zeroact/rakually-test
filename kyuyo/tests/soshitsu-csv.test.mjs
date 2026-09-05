/* soshitsu-csv.test.mjs — ★資格喪失届の 電子申請CSV（様式2201700・27項目）★
 * ============================================================================
 * ★出どころ★ zidoucheck.files/★csv201.pdf★（2026-09-05 に 表として 字を 取った）
 *   ★数えた 結果は 紙に 残してある★＝kyuyo/docs/soshitsu-2201700.md
 *
 * ★作る前に 壁を 見つけた★（2026-09-05）
 *   項番12「★『個人番号』に 入力がない場合 入力されていること★」（基礎年金番号 課所符号）
 *   ⇒★マイナンバーか 基礎年金番号の どちらかが 必須★／うちは どちらも 持っていなかった
 *   ⇒★1件も 出せない★と 分かり、★作らずに 司さんへ 上げた★
 *   ⇒ 司さん 2026-09-05「★競合がやりよることはやれ★」＝★基礎年金番号を お預かりする★
 *     （マネーフォワードも 従業員ごとに どちらかを 選ばせている／
 *       基礎年金番号を 選ぶ時は 住所のフリガナが 要る＝うちは もう 聞いている）
 *
 * ★取得届（2200700）と 1つも 同じ 場所に ない★
 *   取得 …  9-10 生年月日／11 種別／12 取得区分／13 個人番号／16-17 基礎年金番号
 *   喪失 …  9-10 生年月日／★11 個人番号★／★12-13 基礎年金番号★／14-15 資格喪失年月日
 *   ⇒★使い回すと 全部 ずれる★（自己確認で「1つ ずらす」を 必ず 見る）
 *
 * ★一番 間違えやすい 所（原文の まま）★
 *   ・資格喪失年月日 ＝ ★退職日死亡日 ＋１日★（原因'4'退職等／'5'死亡）
 *   ・不該当年月日   ＝ ★退職日死亡日 そのもの（＋１日では ない）★
 *
 * 使い方: node kyuyo/tests/soshitsu-csv.test.mjs [--self-test]
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
  zipOya: '790', zipKo: '0001', address: '愛媛県松山市1-2-3', name: '株式会社テスト', nushi: '健保　良一',
  tel1: '089', tel2: '123', tel3: '4567' };
const EMP = { seiriNo: '1', kana: 'ﾔﾏﾀﾞ ﾀﾛｳ', kanji: '山田　太郎', birthYmd: '1985-05-15',
  kisoNenkin: '1234-567890' };
const KYOU = '2026-09-05';
const base = (over = {}) => Object.assign({
  jimusho: JIMU, emp: Object.assign({}, EMP),
  taishokuYmd: '2026-08-31', soshitsuYmd: '2026-09-01', kyou: KYOU, bikou: {},
}, over);

console.log('\n[soshitsu-csv] 資格喪失届（2201700）— 出どころ csv201.pdf');

t('★27項目★（取得届34・算定53・月変49・賞与21とは 別）', () => {
  ok(T.soshitsuRow(base()).length === 27, '項目数が 27 でない');
});

t('★様式コードは 2201700★', () => {
  ok(T.soshitsuRow(base())[0] === '2201700', '様式コードが 違う');
});

t('★11＝個人番号／12-13＝基礎年金番号★（取得届とは 場所が ちがう）', () => {
  const r = T.soshitsuRow(base());
  ok(r[10] === '', '11番（個人番号）に 何か 入っている');
  ok(r[11] === '1234' && r[12] === '567890', '12-13番が 基礎年金番号でない: ' + r[11] + '/' + r[12]);
});

t('公式の 検査を 1件も 出さずに 通る（ふつうの1人）', () => {
  const e = C.soshitsu(T.soshitsuRow(base()), KYOU);
  ok(e.length === 0, '赤が 出た: ' + JSON.stringify(e));
});

t('★基礎年金番号を 1つの 欄で 聞いて 中で 割る★（4桁-6桁）', () => {
  ok(JSON.stringify(T.splitKisoNenkin('1234-567890')) === '{"kasho":"1234","renban":"567890"}', 'ハイフン有り');
  ok(JSON.stringify(T.splitKisoNenkin('1234567890')) === '{"kasho":"1234","renban":"567890"}', 'ハイフン無し');
  ok(JSON.stringify(T.splitKisoNenkin('１２３４－５６７８９０')) === '{"kasho":"1234","renban":"567890"}', '全角');
  ok(T.splitKisoNenkin('0000-123456') === null, "★'0000'は 通さない★");
  ok(T.splitKisoNenkin('1234-000000') === null, "★'000000'は 通さない★");
  ok(T.splitKisoNenkin('123-4567890') === null, '桁が 違う物を 通した');
  ok(T.splitKisoNenkin('') === null, '空を 通した');
});

t('★基礎年金番号が 無い人は 出さない★（原文＝個人番号が 無ければ 必須）', () => {
  const inp = base({ emp: Object.assign({}, EMP, { kisoNenkin: '' }) });
  ok(T.dasuKaSoshitsu(inp) === false, '出せる事に なっている');
  ok(T.soshitsuWarn(inp).join('／').indexOf('基礎年金番号') >= 0, '理由を 言っていない');
  ok(C.soshitsu(T.soshitsuRow(inp), KYOU).some((x) => x.no === 12), '検査が 12番を 拾っていない');
});

t('★★資格喪失日 ＝ 退職日 ＋１日★★（原文 項番14・原因4）', () => {
  const r = T.soshitsuRow(base());
  ok(r[15] === '4', '喪失原因が 4（退職等）でない');
  ok(r[17] === '080831', '18番（退職日）が 違う: ' + r[17]);
  ok(r[14] === '080901', '15番（喪失日）が 退職日＋1日でない: ' + r[14]);
  /* ★＋1日で ない 物は 門が 止める★ */
  const bad = T.soshitsuRow(base({ soshitsuYmd: '2026-08-31' }));   /* 退職日と 同じ日 */
  ok(C.soshitsu(bad, KYOU).some((x) => x.no === 14), '★＋1日でない 物を 通した★');
});

t('★月をまたぐ 退職でも ＋1日★（8/31 → 9/1）', () => {
  const r = T.soshitsuRow(base({ taishokuYmd: '2026-08-31', soshitsuYmd: '2026-09-01' }));
  ok(C.soshitsu(r, KYOU).length === 0, '赤が 出た: ' + JSON.stringify(C.soshitsu(r, KYOU)));
  ok(C.hiPlus('2026-08-31', 1) === '2026-09-01', '＋1日の 計算が 違う');
  ok(C.hiPlus('2026-02-28', 1) === '2026-03-01', 'うるう年でない 2月末');
});

t('★退職日が 無い人は 出さない★', () => {
  const inp = base({ taishokuYmd: '', soshitsuYmd: '' });
  ok(T.dasuKaSoshitsu(inp) === false, '出せる事に なっている');
  ok(T.soshitsuWarn(inp).join('／').indexOf('退職日') >= 0, '理由を 言っていない');
});

t('★喪失日が 先の日付なら 出さない★（原文＝≦ システムチェック実施日）', () => {
  const inp = base({ taishokuYmd: '2026-12-31', soshitsuYmd: '2027-01-01' });
  ok(T.dasuKaSoshitsu(inp) === false, '未来の 喪失日が 出せる事に なっている');
  ok(C.soshitsu(T.soshitsuRow(inp), KYOU).some((x) => x.no === 14), '検査が 未来日を 拾っていない');
});

t('★氏名（カナ）が 無い人は 出さない★（4つの 届出 ぜんぶで 必須）', () => {
  const inp = base({ emp: Object.assign({}, EMP, { kana: '' }) });
  ok(T.dasuKaSoshitsu(inp) === false, '出せる事に なっている');
  ok(C.soshitsu(T.soshitsuRow(inp), KYOU).some((x) => x.no === 7), '検査が 7番を 拾っていない');
});

t('★喪失原因は 4/5/7/9/11 だけ★（原文 項番16）', () => {
  ok(T.SOSHITSU_GEN.taishoku === '4' && T.SOSHITSU_GEN.shibou === '5'
    && T.SOSHITSU_GEN.nanajugo === '7' && T.SOSHITSU_GEN.shougai === '9'
    && T.SOSHITSU_GEN.kyoutei === '11', '原因の 値が ちがう');
  const r = T.soshitsuRow(base()); r[15] = '3';
  ok(C.soshitsu(r, KYOU).some((x) => x.no === 16), "検査が '3' を 通した");
  r[15] = '';
  ok(C.soshitsu(r, KYOU).some((x) => x.no === 16), '検査が 空を 通した');
});

t('★原因が 4・5 以外なら 退職日死亡日は 省略★（原文 項番17-18）', () => {
  const r = T.soshitsuRow(base({ gen: '7' }));           /* 75歳到達 */
  ok(r[16] === '' && r[17] === '', '退職日死亡日を 入れてしまっている');
});

t('★75歳到達なら 生年月日＋75年 以降★（原文 項番14）', () => {
  /* 1951-05-15 生まれ → 75歳は 2026-05-15 */
  const emp = Object.assign({}, EMP, { birthYmd: '1951-05-15' });
  const yoi = T.soshitsuRow(base({ emp: emp, gen: '7', taishokuYmd: '', soshitsuYmd: '2026-05-15' }));
  ok(C.soshitsu(yoi, KYOU).length === 0, '75歳ちょうどで 赤: ' + JSON.stringify(C.soshitsu(yoi, KYOU)));
  const hayai = T.soshitsuRow(base({ emp: emp, gen: '7', taishokuYmd: '', soshitsuYmd: '2026-05-14' }));
  ok(C.soshitsu(hayai, KYOU).some((x) => x.no === 14), '★75歳より 前を 通した★');
});

t('★★不該当年月日 ＝ 退職日死亡日 そのもの（＋1日では ない）★★', () => {
  const r = T.soshitsuRow(base({ bikou: { fugaito: true } }));
  ok(r[23] === '1', '70歳不該当の 印が 無い');
  ok(r[25] === '080831', '不該当年月日が 退職日 そのものでない: ' + r[25]);
  ok(r[14] === '080901', '喪失日は ＋1日の まま でない: ' + r[14]);
  ok(C.soshitsu(r, KYOU).length === 0, '赤が 出た: ' + JSON.stringify(C.soshitsu(r, KYOU)));
  /* ★＋1日に して しまうと 門が 止める★ */
  const bad = T.soshitsuRow(base({ bikou: { fugaito: true } })); bad[25] = '080901';
  ok(C.soshitsu(bad, KYOU).some((x) => x.no === 25), '★＋1日に しても 通った★');
});

t('★保険証を 返せない 時の 枚数（項番22・23）★', () => {
  const r = T.soshitsuRow(base({ bikou: { kaishu: 1, henfunou: 2 } }));
  ok(r[21] === '1' && r[22] === '2', '枚数が 入っていない');
  ok(C.soshitsu(r, KYOU).length === 0, '赤が 出た');
  const bad = T.soshitsuRow(base()); bad[22] = 'あ';
  ok(C.soshitsu(bad, KYOU).some((x) => x.no === 23), '数字でない物を 通した');
});

t('★1件でも 合わなければ ファイルを 作らない（門）★', () => {
  const bad = T.soshitsuRow(base({ emp: Object.assign({}, EMP, { kisoNenkin: '' }) }));
  const f = T.soshitsuCsv({ jimusho: JIMU, baitai: { tsuban: '001', ymd: KYOU }, kyou: KYOU, rows: [bad] });
  ok(f.bytes.length === 0, '★赤が 在るのに ファイルを 作った★');
  ok(f.kensa.errors.length > 0, '検査が 何も 言っていない');
});

t('★通れば ファイルが 出る（媒体・事業所・データ）★', () => {
  const f = T.soshitsuCsv({ jimusho: JIMU, baitai: { tsuban: '001', ymd: KYOU }, kyou: KYOU,
    rows: [T.soshitsuRow(base())] });
  ok(f.kensa.errors.length === 0, '赤が 出た: ' + JSON.stringify(f.kensa.errors));
  ok(f.bytes.length > 0, '1バイトも 作っていない');
  ok(f.name === 'SHFD0006.CSV', 'ファイル名が 違う: ' + f.name);
  ok(f.text.indexOf('2201700') >= 0, 'データ行が 入っていない');
  ok(f.text.indexOf(T.DAIHYO_CODE) >= 0, '代表届書コードが 入っていない');
});

/* ── ★わざと壊して 赤に なるか★ ───────────────────────────── */
if (SELF) {
  console.log('\n★自己確認（わざと壊す）★');
  let aka = 0;
  const iu = (nm, hit) => { if (hit) aka++; console.log('  ' + (hit ? '✓ 赤に なった' : '✗ ★赤に ならない★') + ' … ' + nm); };
  iu('様式コードを 取得届の 物に すり替える', C.soshitsu(Object.assign(T.soshitsuRow(base()), { 0: '2200700' }), KYOU).length > 0);
  iu('★1つ ずらす（取得届の 並びで 作る）★', (() => {
    const r = T.soshitsuRow(base()); r.splice(10, 1); r.push('');   /* 個人番号を 抜く＝以降 全部 ずれる */
    return C.soshitsu(r, KYOU).length > 0;
  })());
  iu('★喪失日を ＋1日に しない★', C.soshitsu(T.soshitsuRow(base({ soshitsuYmd: '2026-08-31' })), KYOU).some((x) => x.no === 14));
  iu('★不該当年月日を ＋1日に して しまう★', (() => {
    const r = T.soshitsuRow(base({ bikou: { fugaito: true } })); r[25] = '080901';
    return C.soshitsu(r, KYOU).some((x) => x.no === 25);
  })());
  iu('基礎年金番号を 空に する', C.soshitsu(T.soshitsuRow(base({ emp: Object.assign({}, EMP, { kisoNenkin: '' }) })), KYOU).some((x) => x.no === 12));
  iu('課所符号だけ 入れて 一連番号を 消す', (() => {
    const r = T.soshitsuRow(base()); r[12] = '';
    return C.soshitsu(r, KYOU).some((x) => x.no === 13);
  })());
  iu('喪失日を 未来に する', C.soshitsu(T.soshitsuRow(base({ taishokuYmd: '2099-01-01', soshitsuYmd: '2099-01-02' })), KYOU).some((x) => x.no === 14));
  iu('喪失原因を 空に する', (() => {
    const r = T.soshitsuRow(base()); r[15] = '';
    return C.soshitsu(r, KYOU).some((x) => x.no === 16);
  })());
  console.log('\n  わざと壊した 8件のうち 赤に なった … ' + aka + '件');
  if (aka < 8) { console.log('  ★見張りが 効いていません★'); process.exit(1); }
  console.log('  ✓ ★壊したら 8件とも 赤に なった＝この試験は 本当に 見張っています★');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
