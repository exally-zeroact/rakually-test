/* count-osareta-ka.mjs — ★「一度も 押していない所」が 今も そうか を 数える★
 * =============================================================================
 * ★なぜ（2026-09-14 指示役1 の 注文）★
 *   「一度も 押していない」の 出どころは ★2026-09-08 の 引き継ぎ＝6日 前の 紙★。
 *   ★紙を 根拠に 計画を 立てるな。今 数えろ★（同日 指示役1 が 古い紙で 6回 間違えた）。
 *
 * ★何を 何で 数えるか（ここを 読めば 誤りを 指せる）★
 *   ・見る 範囲 … kyuyo/tests, seikyu/tests, tests の ★.mjs / .js を 全部★（本数を 出す）
 *   ・★実ブラウザで 押した★ … その ファイルが `_borrow-playwright` を 読み、
 *       かつ ★その 的の 印（下の shirushi）を 持つ★
 *   ・★jsdom で 通した★     … `jsdom` を 読み、かつ 的の 印を 持つ
 *   ・★分からない★          … 印は 在るが どちらでも ない（＝字だけ 見ている 見張り）
 *   ・★0本★                 … 1本も 無い＝★測っていない★（緑と 呼ばない）
 *   ★「借りている＝押している」では ない★ので、★的の 印★で 絞る。
 *   ★それでも 「その ボタンを 押した」までは 保証しない★＝この道具の 限界を ここに 書く。
 *     （本当に 押したかは 中を 読むしか ない。★分からない は 分からない と 出す★）
 *
 * 使い方: node scripts/count-osareta-ka.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['kyuyo/tests', 'seikyu/tests', 'tests'];

/* ★09-08 の 引き継ぎに「一度も 押していない」と 書かれていた 物＋今日の 分★
   印＝その 的を 指す 字（ファイルの 中に 在れば その 的を 見ている と 判じる） */
const MATO = [
  ['はじめかたガイド', ['onboardSteps', 'はじめかた']],
  ['移行（CSV取り込み）', ['applyMigrationRows', 'importLedgerForMonth', 'importKintaiCsv']],
  ['退職金の計算', ['taishokukin', '退職金']],
  ['給与パターンの一括適用', ['openBulkPatternApply', 'applyPayPattern']],
  ['賞与支払届CSV', ['shoyoCsv', 'shoyoRow']],
  ['算定基礎届CSV', ['santeiCsv', 'santeiRow']],
  ['admin.html（法定データの反映）', ['admin.html', 'statutory_upsert']],
  ['入口の「共有データ」', ['suite-data', 'SuiteData']],
  ['領収書・納品書の紙', ['receipt', '領収書', '納品書']],
  ['★被扶養者届CSV（今日 本番へ出した）', ['fuyoCsv', 'fuyoRow']],
  ['月額変更届CSV', ['gekkakuCsv', 'gekkakuRow']],
  /* ★前に「実ブラウザ 1本 在る」と 私が 言った 3つ★＝数え方を 直したので 当て直す */
  ['資格取得届CSV', ['shutokuCsv', 'shutokuRow', 'SHFD0006']],
  ['喪失届CSV', ['soshitsuCsv', 'soshitsuRow']],
  ['賞与の源泉（未定）', ['shoyoGensen', 'gensen']],
];

const files = [];
for (const d of DIRS) {
  const p = path.join(ROOT, d);
  if (!fs.existsSync(p)) continue;
  for (const f of fs.readdirSync(p)) {
    if (!/\.(mjs|js)$/.test(f)) continue;
    files.push({ na: d + '/' + f, src: fs.readFileSync(path.join(p, f), 'utf8') });
  }
}
console.log('\n[count-osareta-ka] 見た ファイル ★' + files.length + '本★（' + DIRS.join(' / ') + '）');
console.log('  ★これは 選別です。★押した 証拠では ありません★＝証拠は 実際に 押した 回にだけ 出ます★');
console.log('  数え方 … 実ブラウザ＝_borrow-playwright を 読む ／ jsdom＝jsdom を 読む');
console.log('           ＋ ★その 的の 印を 持つ★ 物だけ 数える（借りている＝押している では ない）\n');

let maru = 0, batsu = 0, wakaranai = 0;
for (const [na, shirushi] of MATO) {
  const ataru = files.filter((f) => shirushi.some((k) => f.src.indexOf(k) >= 0));
  /* ★★2026-09-14 指示役1 の 指摘で 数え方を 直した★★
     前は ★「playwright を 借りているか」だけ★で「押した」と 判じていた。
     ＝★借りていても 別の ボタンを 押している★物が 混ざる。
     ⇒ ★実際に 押している 所（click / osu / tataku）を 拾い、
       その 行に ★的の 印★が 在る物だけ ○★。無ければ △（借りているが 的は 不明）。 */
  /* ★★数え方を 2回 直した（2026-09-14）★★
     1回目 … 「playwright を 借りているか」だけ ⇒ ★甘い★（別の ボタンを 押していても ○に なる）
     2回目 … 「click の 行に 的の 字が 在るか」  ⇒ ★厳しすぎ★（選択子は #b-xxx なので 字が 無い。
              実際 shutoku-ui.mjs は SHFD0006.CSV を 落としているのに ×に なった＝★嘘の ×★）
     3回目（今）… ★押して 物が 落ちる 仕掛けが 在るか★で 見る
              ＝ acceptDownloads / waitForEvent('download') / suggestedFilename
              ＋ ★的の 印を 持つ★。これが 「客の 道で 出した」の 一番 近い 印。
     ★それでも 保証は しない★＝「その 的の ファイルが 落ちた」までは 見ていない。
     ⇒ ○＝落とす 仕掛けが 在る／△＝借りたが 落としていない／×＝1本も 無い。 */
  const otosu = (f) => /acceptDownloads|waitForEvent\(['"]download['"]\)|suggestedFilename/.test(f.src);
  const bro = ataru.filter((f) => f.src.indexOf('_borrow-playwright') >= 0 && otosu(f));
  const karita = ataru.filter((f) => f.src.indexOf('_borrow-playwright') >= 0 && !otosu(f));
  const jsd = ataru.filter((f) => f.src.indexOf('jsdom') >= 0 && f.src.indexOf('_borrow-playwright') < 0);
  const ji = ataru.filter((f) => bro.indexOf(f) < 0 && karita.indexOf(f) < 0 && jsd.indexOf(f) < 0);
  let mark;
  if (bro.length) { mark = '○'; maru++; }   /* ○＝★押している 見込み★（落とす 仕掛けが 在る） */
  else if (karita.length || jsd.length || ji.length) { mark = '△'; wakaranai++; }
  else { mark = '★×★'; batsu++; }
  console.log('  ' + mark + ' ' + na);
  console.log('       実ブラウザ ' + bro.length + '本 ／ jsdom ' + jsd.length + '本 ／ 字だけ ' + ji.length + '本'
    + ' ／ ★借りたが 的を 押していない ' + karita.length + '本★'
    + (ataru.length ? '' : '  ★1本も 無い＝測っていない★'));
  if (karita.length) console.log('       借りただけ … ' + karita.map((x) => x.na).join(', '));
  if (bro.length) console.log('       ★押している 見込み★ … ' + bro.map((f) => f.na).join(', '));
  else if (jsd.length) console.log('       jsdom     … ' + jsd.slice(0, 3).map((f) => f.na).join(', '));
  else if (ji.length) console.log('       字だけ    … ' + ji.slice(0, 3).map((f) => f.na).join(', '));
}
console.log('\n── 実測 ──');
console.log('  ○ ★押している 見込み★（実ブラウザで 落とす 仕掛けが 在る） … ' + maru + '件');
console.log('  △ jsdom か 字だけ（★押したかは 分からない★） … ' + wakaranai + '件');
console.log('  ★× 仕掛けが 1つも 無い（測っていない）★ … ' + batsu + '件');
console.log('  ★この道具の 限界★＝★「その 的の ファイルが 落ちた」までは 見ていない★。');
console.log('  だから ○は ★押した★では なく ★押している 見込み★。△ は ★分からない★ のまま 出す。');
