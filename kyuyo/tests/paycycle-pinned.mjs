/* paycycle-pinned.mjs — ★支給サイクルの白名簿が黙ってずれないように固定する★（2026-10-08 ダイコメ横断の続き・(d)6と同型の将来穴）
 * =============================================================================
 * ★守る事（将来穴）★
 *   payCycleOf()(app.js) は `(state.company&&state.company.payCycle)||'monthly'` ＝★知らない支給サイクルは 黙って monthly 扱い★。
 *   支給サイクルの選択肢は ★2か所★に 手で並んでいる：①設定画面 #c-paycycle(index.html) ②はじめかたの聞き取り ask-mode の opts(app.js)。
 *   ★片方に 新しいサイクルを 足して もう片方／下流(shimeSplit・needPayDays・明細の週/日表示・期間分割)への 配線を 忘れると★、
 *   客が それを 選んでも 黙って monthly っぽく 振る舞う（赤にならない）。(d)6 の periods.js METHODS と 同じ型の 将来穴。
 * ★この歯★… #c-paycycle の option value と ask-mode opts の value を 取り出し、★両方が KNOWN と 一致★する事を 固定。
 *   ずれたら 赤＝「設定とはじめかたの選択肢がずれた／KNOWN(＝配線済みの集合)に無いサイクルを足した」を 押す前に 捕まえる。
 * ★覚書（直す人へ）★… 支給サイクルを 足す/消す時は 次を 全部 揃える：
 *   ①index.html #c-paycycle ②app.js ask-mode の opts ③payCycleOf/shimeSplit/needPayDays/明細の表示(cyc==='…') ④この KNOWN。
 * ★わざと(--waza)★… KNOWN に無い値を 設定UI側に 混ぜ、必ず赤になる事を確かめる（飾りでない）。
 * 使い方: node kyuyo/tests/paycycle-pinned.mjs   ／   --waza
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WAZA = process.argv.includes('--waza');

let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };
const setEq = (a, b) => { const sa = [...new Set(a)].sort(), sb = [...new Set(b)].sort(); return sa.length === sb.length && sa.every((v, i) => v === sb[i]); };

/* ★配線済みの集合（覚書＝ここを足す時は上の①②③も揃える）★ */
const KNOWN = ['monthly', 'semimonthly', 'nmonth', 'weekly', 'nweeks', 'daily'];

/* ① 設定画面 #c-paycycle の option value */
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const selM = html.match(/<select[^>]*id="c-paycycle"[\s\S]*?<\/select>/i);
const uiSettings = selM ? [...selM[0].matchAll(/<option[^>]*value="([^"]*)"/gi)].map((m) => m[1]) : [];

/* ② ask-mode の payCycle opts（key:'payCycle' 〜 次の key:' までを切り出し、var opts=[['x',…],…] の第1要素を拾う） */
const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const i0 = app.indexOf("key:'payCycle'");
const i1 = i0 >= 0 ? app.indexOf("key:'", i0 + 10) : -1;
const slice = i0 >= 0 ? app.slice(i0, i1 > i0 ? i1 : i0 + 2000) : '';
const optsM = slice.match(/var\s+opts\s*=\s*\[([\s\S]*?)\]\s*;/);
const uiAsk = optsM ? [...optsM[1].matchAll(/\[\s*'([a-zA-Z]+)'/g)].map((m) => m[1]) : [];

/* ③ わざと＝設定UI側に KNOWN に無い値を混ぜる */
const settingsCheck = WAZA ? uiSettings.concat(['waza_unknown_cycle']) : uiSettings;

console.log('\n[paycycle-pinned] 支給サイクルの選択肢は 設定＝はじめかた＝KNOWN で揃っている' + (WAZA ? '  ★★わざと 未登録を 混ぜた回★★' : ''));
console.log('   #c-paycycle(設定) … ' + JSON.stringify(settingsCheck));
console.log('   ask-mode opts     … ' + JSON.stringify(uiAsk));
console.log('   KNOWN             … ' + JSON.stringify(KNOWN));

T('① 両UI源とも 読めている（空でない）', uiSettings.length >= 3 && uiAsk.length >= 3, 'settings=' + uiSettings.length + ' ask=' + uiAsk.length);
T('② はじめかたの opts は 設定 #c-paycycle と 同じ集合（片方に足して片方に忘れるを捕まえる）', setEq(uiSettings, uiAsk), 'settings=' + JSON.stringify([...uiSettings].sort()) + ' ask=' + JSON.stringify([...uiAsk].sort()));
/* ③ 本体の門。★--waza は 裏返し検証＝「混ぜた未登録を 検出できる」事を ✓ で通す（✗を出さない＝CIログ/集計を汚さない・bonus-nolib-block と同型）。
   退行で本当に赤になるのは 通常実行(fix/UI/KNOWN がずれると setEq が false)＝kensan が変異A〜Fで実証済み。 */
if (WAZA) {
  T('③ ★--waza: KNOWN に無い値を混ぜたら 検出する（setEq=false＝歯が新旧を見分けられる）★', !setEq(settingsCheck, KNOWN), '混ぜたのに 検出しない＝飾りの歯');
} else {
  T('③ ★設定の支給サイクルは すべて KNOWN(配線済み集合)に在る（無いと黙って monthly に倒れる）★', setEq(settingsCheck, KNOWN), '食い違い set=' + JSON.stringify([...settingsCheck].sort()) + ' known=' + JSON.stringify([...KNOWN].sort()));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('KEKKA {"passed":' + pass + ',"failed":' + fail + ',"mimiso":0}');
process.exit(fail ? 1 : 0);   /* 通常も --waza も 全て ✓ が正（--waza は 裏返し検証で ✓）＝✗が出たら 本当の赤 */
