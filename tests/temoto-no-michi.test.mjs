/* temoto-no-michi.test.mjs — ★手元の 絶対パスを ★読み込みの 道★ に 使った 所を 止める★
 * ============================================================================
 * ★なぜ 在るか（2026-09-21 実測で 踏んだ）★
 *   `kyuyo/tests/jidou-gyou.mjs` が こう 書いて いた：
 *     await import('file:///C:/Users/zeroa/rakually-test/tests/_hairu.mjs')
 *   ★手元（Windows）では 通る★／★CI（Linux）では 通らない★
 *     Cannot find module '/C:/Users/zeroa/rakually-test/tests/_hairu.mjs'
 *   ⇒ ★★『手元は 緑・CI は 赤』の 教科書どおりの 形★★
 *   ⇒ ★同じ ファイルに 3か所★（1回 書くと 写して 増える）
 *
 * ★★一番 大事な 事★★
 *   ★決まりは 記憶に 在りました★（feedback_tesuto_ni_temoto_no_zettai_path_wo_yakikomuna）
 *   ★なのに 踏みました★ ⇒ ★★紙は 書いた だけでは 効かない★★
 *   ★近い 門は 在った★ … `tests/pages-hosting.test.mjs`
 *     ⇒ ★但し 見て いるのは ★配信の HTML の `href="/…"`★★＝★見る 範囲が 違う★
 *     ⇒ ★★『門が 在る』と『この 事を 見て いる』は 別★★
 *
 * ★★探す 字を 実物で 決め直した（★決めた 時点で 答えが 決まる★ので）★★
 *   ★はじめの 私の 決め★ … 「`C:/Users/` が 在れば 赤」
 *   ★実物を 数えたら★ … ★39行★。中を 見たら ★ほとんどが 正しい 使い方★だった：
 *     ・`scripts/shot-*.mjs`          … ★手元だけで 絵を 撮る 道具★（CI は 走らせない）
 *     ・★借り先を 並べる 紙★（scripts/ の 道具の 1本） … ★候補を 並べて ★在るか 見てから★ 使う★
 *   ⇒ ★★範囲を 広げすぎて いた★★（★正しい 物を 赤に する 見張りは 使われなく なる★）
 *   ★本当に 壊れるのは★ … ★★読み込みの 道に 使った 時だけ★★
 *     `import('C:/…')` ／ `require('C:/…')` ／ `from 'C:/…'`
 *     ＝★Linux に その 道は 無い★ ⇒ ★ERR_MODULE_NOT_FOUND★
 *
 * ★★この門が 見る 範囲（先に 数えて 書く）★★
 *   ・★どこを★ … `tests/` ／ `kyuyo/tests/` ／ `tools/` ／ `kyuyo/scripts/` ／ `scripts/`
 *                （★各 1段だけ★／`.mjs` `.js` `.cjs`）
 *   ・★何を★ … ★手元の 道の 形★ ＋ ★読み込みの 形★ が ★両方 揃った 行★
 *   ・★字の 説明（コメント）も 数える★＝★除くと「説明に 書いただけ」の 顔で 通る★
 *     ⇒ ★免除は ★行ごとに 名指し★★（下の MENJO）
 *
 * ★使い方★
 *   node tests/temoto-no-michi.test.mjs              … 実物を 数える
 *   node tests/temoto-no-michi.test.mjs --self-test  … 判じだけ 試す（ファイルを 読まない）
 *   node tests/temoto-no-michi.test.mjs --waza       … ★わざと 1本 足して 赤に なるか★
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ★見る 所★（★増やす 時は ここだけ★） */
export const MIRU = ['tests', 'kyuyo/tests', 'tools', 'kyuyo/scripts', 'scripts'];

/* ★★免除＝★行ごとに 名指し★★★（★黙って 除けない／訳を 必ず 書く★）
   ★免除は 1つ 足すだけで 静かに 広がる★ので ★本数を 決め打ち★し ★出しに 毎回 出す★。 */
export const MENJO = [
  { michi: 'tests/temoto-no-michi.test.mjs', ji: 'Users',
    naze: '★この門 自身★＝★訳の 文★と ★自己確認の 見本★に 手元の 道を 必ず 書くから。'
      + '★危うい 所★＝★この門の 中で 本物の 誤りを しても 捕まらない★'
      + '（その代わり ★--waza で 別の 紙を 作って 赤に なる事を 毎回 見ます★）' },
];
export const MENJO_HONSU = 1;   /* ★ここを 超えたら 赤★ */

/* ★★探す 字（1か所）★★＝★道の 形★ と ★読み込みの 形★ を 分けて 持つ（役割が 違う） */
/* ★`[\\/]+`★ … JS の 字では ★`C:\\\\Users`（逆斜線 2枚）★が 普通なので ★続きを 許す★
   （★自己確認で 1件 赤に なって 気づいた★＝★本物の 漏れだった★） */
export const MICHI = /(file:\/\/\/)?[A-Za-z]:[\\/]+Users[\\/]+/;
export const YOMU = /\b(import|require)\s*\(|\bfrom\s*['"]|\bimport\s+['"]/;

/* ★両方 揃った 行だけ★＝★正しい 使い方（印・候補）を 赤に しない★ */
export function sagasu(ji) {
  return String(ji || '').split('\n').map((g, i) => ({ i: i + 1, g }))
    .filter((x) => MICHI.test(x.g) && YOMU.test(x.g));
}

/* ★★判じ＝純粋な 関数★★（ファイルを 読まなくても わざと 壊せる） */
export function handan(atari, menjo) {
  const nokori = atari.filter((a) => !(menjo || []).some(
    (m) => a.michi === m.michi && String(a.gyo).indexOf(m.ji) >= 0));
  return { aka: nokori.length > 0, honsu: nokori.length, nokori };
}

function hirou(dir, de) {
  const p = path.join(ROOT, dir);
  if (!fs.existsSync(p)) return de;
  for (const na of fs.readdirSync(p)) {
    const f = path.join(p, na);
    if (fs.statSync(f).isDirectory()) continue;     /* ★1段だけ★＝範囲を 勝手に 広げない */
    if (!/\.(mjs|js|cjs)$/.test(na)) continue;
    de.push({ michi: dir + '/' + na, zen: f });
  }
  return de;
}

const SELF = process.argv.includes('--self-test');
const WAZA = process.argv.includes('--waza');
let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };

if (SELF) {
  console.log('\n[temoto-no-michi] ★自己確認★（★ファイルを 読みません＝判じだけ★）');
  let ng = 0;
  const iu = (n, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + n + (good ? '' : '  ★思っていたのと 違う★')); };
  const BS = String.fromCharCode(92);
  iu('★file:/// つきの 読み込みを 見つける（今日の 実物）★',
    sagasu("await import('file:///C:/Users/zeroa/rakually-test/tests/_hairu.mjs');").length === 1);
  iu('★file:/// 無しの 読み込みも 見つける★',
    sagasu("await import('C:/Users/zeroa/a.mjs');").length === 1);
  iu('★require の 道も 見つける★',
    sagasu("const x = require('C:/Users/zeroa/a.js');").length === 1);
  iu('★from の 道も 見つける★',
    sagasu("import a from 'C:/Users/zeroa/a.mjs';").length === 1);
  iu('★逆斜線の 道も 見つける★',
    sagasu('const p = require("C:' + BS + BS + 'Users' + BS + BS + 'zeroa");').length === 1);
  iu('★D: など 他の 玉でも 見つける★',
    sagasu("await import('D:/Users/foo/bar.mjs');").length === 1);
  /* ★★ここから 3つ＝★正しい 使い方を 赤に しない★★★（実物で 数え直して 足した） */
  iu('★★ただの 印（読み込みで ない）は 見ない★★＝shot-*.mjs の 形',
    sagasu("const ROOT = 'C:/Users/zeroa/rakually-test';").length === 0);
  /* ★★見本の 字は ★本物に 見える★★（2026-09-21＝今日 ★既に 在る 門に 3回 捕まった★）
     ① `refs-resolve` … 見本の 相対の 道を ★実在しない 読み込み★ と 読んだ
     ② `pw-borrow` …… 見本の 道を ★借り先を 自前で 持って いる★ と 読んだ
        （その 門は ★道具の 名前が 紙に 在る だけ★ で 「借りて いる」と 見ます）
     ⇒ ★★字だけ 見る 門には 見本と 本物の 別が 付かない★★
     ⇒ ★字を 割って 逃げる★のでは なく ★★見本から その 字を 消す★★
        （★逃げ道の 本数にも 門が 付いて います★＝★黙って 増やさない★） */
  iu('★★候補を 並べた だけの 行は 見ない★★＝借り先を 並べる 紙の 形',
    sagasu("  'C:/Users/zeroa/Daikou-app/node_modules/nanika/index.js',").length === 0);
  iu('★相対の 道は 見ない（当てない）★',
    sagasu("await import('./_hairu.mjs');").length === 0);
  /* ★見本の 道は ★本当に 在る 物★ に する（2026-09-21 実測で 踏んだ）
     ★前★ … ★上へ 2つ 上がる 道★（kyuyo/tests から 見た `_hairu`）を 見本に 書いた
     ★この 訳の 文にも その 道を そのまま 書けません★（同じ 門に また 捕まる）
     ⇒ ★既に 在る 門「相対の require/import が 全部 実在する」が
        ★見本の 字を 本物の 読み込みと 読んで 赤★（tests/ からは その 道は 無い）
     ⇒ ★★門は 正しい★★＝★字だけ見る 門には 見本も 本物に 見える★
     ⇒ ★見本にも 実在する 道を 使う★（`tests/_hairu.mjs` は 在る） */
  iu('★Users を 通らない 道は 見ない（範囲を 広げない）★',
    sagasu("await import('C:/Windows/System32/a.mjs');").length === 0);
  iu('★何行目かを 返す★', sagasu("あ\nい\nawait import('C:/Users/x')")[0].i === 3);
  iu('★当たりが 0なら 緑★', handan([], MENJO).aka === false);
  iu('★当たりが 1本 出たら 赤★',
    handan([{ michi: 'tools/x.mjs', gyo: "await import('C:/Users/a')" }], MENJO).aka === true);
  iu('★免除に 当たる 行は 赤に しない★',
    handan([{ michi: 'tests/temoto-no-michi.test.mjs', gyo: "import('C:/Users/x')" }], MENJO).aka === false);
  iu('★同じ 字でも ★別の ファイル★なら 赤（免除は 行ごと）★',
    handan([{ michi: 'tools/hoka.mjs', gyo: "import('C:/Users/x')" }], MENJO).aka === true);
  iu('★免除の 本数を 決め打って いる★', MENJO.length === MENJO_HONSU);
  console.log(ng ? '★自己確認 ' + ng + '件 おかしい★' : '  ★16通り ぜんぶ 思った通り★');
  process.exit(ng ? 1 : 0);
}

console.log('\n[temoto-no-michi] ★手元の 絶対パスを ★読み込みの 道★ に 使った 所を 数える');
console.log('  ★見る 所★ … ' + MIRU.join(' ／ ') + '（★各 1段だけ★／.mjs .js .cjs）');
console.log('  ★探す 字★ … 道 ' + String(MICHI) + ' ＋ 読み込み ' + String(YOMU) + ' の ★両方★');

const WAZA_F = path.join(ROOT, 'tools', '_waza-temoto-no-michi.mjs');
if (WAZA) {
  fs.writeFileSync(WAZA_F,
    '/* わざと（この門の 空振り止め）*/\n'
    + "const x = await import('C:/Users/zeroa/rakually-test/nai.mjs');\n"
    + 'export default x;\n');
}

const files = MIRU.reduce((a, d) => hirou(d, a), []);
const atari = [];
for (const f of files) {
  let ji = '';
  try { ji = fs.readFileSync(f.zen, 'utf8'); }
  catch (e) { console.log('  ✗ ★読めません★ ' + f.michi + ' … ' + e.message); fail++; continue; }
  sagasu(ji).forEach((x) => atari.push({ michi: f.michi, gyoNo: x.i, gyo: x.g.trim().slice(0, 120) }));
}
const de = handan(atari, MENJO);

console.log('  ★数えた ファイル ' + files.length + '本★ ／ 当たり ' + atari.length + '行 ／ ★免除 ' + MENJO.length + '件★ ／ ★残り ' + de.honsu + '行★');
MENJO.forEach((m) => console.log('    免除 … ' + m.michi + '（' + m.ji + '）＝' + m.naze));
de.nokori.forEach((x) => console.log('    ★★手元の 道で 読み込んで います★★ ' + x.michi + ':' + x.gyoNo + '  ' + x.gyo));

if (WAZA) {
  const yokatta = de.aka && de.nokori.some((x) => x.michi.indexOf('_waza-temoto-no-michi') >= 0);
  try { fs.unlinkSync(WAZA_F); }
  catch (e) { console.log('  ★★わざとの 紙を 消せません★★ ' + WAZA_F + ' … ' + e.message); }
  console.log(yokatta
    ? '  ✓ ★わざとの 1本で 赤に なった＝この門は 空振りして いません★'
    : '  ✗ ★わざとの 1本を 足しても 赤に なりません＝★空振り★★');
  console.log('\n' + (yokatta ? '1 passed, 0 failed' : '0 passed, 1 failed'));
  process.exitCode = yokatta ? 0 : 1;
} else {
  T('★数えた ファイルが 0本では ない（分母を 出す）', files.length > 0, String(files.length) + '本');
  T('★免除は ' + MENJO_HONSU + '件まで', MENJO.length <= MENJO_HONSU, String(MENJO.length) + '件');
  T('★手元の 絶対パスで 読み込んで いる 所が 無い', !de.aka,
    de.honsu + '行 在ります ⇒ ★相対の 道（../ や ./）に 直して ください★');
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exitCode = fail ? 1 : 0;
}
