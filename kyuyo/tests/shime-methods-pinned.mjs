/* shime-methods-pinned.mjs — ★締め方の 白名簿が 黙って ずれないように 固定する★（2026-10-08 ダイコメ横断(d)6）
 * =============================================================================
 * ★守る事（将来穴）★
 *   lib/periods.js の buildPeriods は `method = (METHODS.indexOf(method)>=0)?method:'monthly'`
 *   ＝★知らない締め方は 黙って「月まとめ(monthly)」に 倒す★。これ自体は安全側だが、
 *   ★UI(#c-shime)に 新しい締め方を 足した時 METHODS への 追加を 忘れると★、客が その締め方を 選んでも
 *   ★黙って 1期間(monthly)扱い＝期間分割されず 日給/時給の 按分が 狂う★（赤にならない＝気づけない）。
 *   ＝名前の白名簿は「門の札を足す前に 字を読めているか」([[feedback_mon_no_fuda_wo_tasu_mae_ni_ji_wo_yometeiru_ka]])と 同じ型の 将来穴。
 * ★この歯★… 本物の kyuyo/index.html の #c-shime の option value を すべて 取り出し、
 *   lib/periods.js の METHODS に ★全部 入っている★事を 固定する。入っていなければ 赤＝
 *   「UIに足した締め方を METHODS に足し忘れ＝黙って monthly に倒れる」を 押す前に 捕まえる。
 * ★覚書（直す人へ）★… #c-shime に `<option value="xxx">` を 足したら、必ず lib/periods.js の
 *   METHODS にも 'xxx' を 足し（そして buildPeriods に その期間の作り方を 書く）。この歯が 見張る。
 * ★わざと（--waza）★… 合成で「UIにMETHODSに無い値」を混ぜ、必ず赤になる事を確かめる（歯が飾りでない）。
 * 使い方: node kyuyo/tests/shime-methods-pinned.mjs   ／   --waza
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WAZA = process.argv.includes('--waza');

let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };

/* ① UIの #c-shime の option value を 取り出す */
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const selM = html.match(/<select[^>]*id="c-shime"[\s\S]*?<\/select>/i);
const uiMethods = selM ? [...selM[0].matchAll(/<option[^>]*value="([^"]*)"/gi)].map((m) => m[1]) : [];

/* ② periods.js の METHODS を 取り出す（配列リテラルを読む） */
const pjs = fs.readFileSync(path.join(ROOT, '..', 'lib', 'periods.js'), 'utf8');
const mm = pjs.match(/var\s+METHODS\s*=\s*\[([^\]]*)\]/);
const methods = mm ? mm[1].split(',').map((s) => s.replace(/['"\s]/g, '')).filter(Boolean) : [];

/* ③ わざと＝UIに METHODS に無い値を 混ぜる（歯が 赤にするか） */
const uiCheck = WAZA ? uiMethods.concat(['waza_unknown_shime']) : uiMethods;

console.log('\n[shime-methods-pinned] UIの締め方は すべて periods.js METHODS に在る' + (WAZA ? '  ★★わざと 未登録を 混ぜた回★★' : ''));
console.log('   UI #c-shime … ' + JSON.stringify(uiCheck));
console.log('   periods METHODS … ' + JSON.stringify(methods));

T('① UIの締め方も periods METHODS も 空でない（読めている）', uiMethods.length >= 2 && methods.length >= 2, 'ui=' + uiMethods.length + ' methods=' + methods.length);

const missing = uiCheck.filter((v) => methods.indexOf(v) < 0);
T('② ★UIが出す締め方は すべて periods.js METHODS に在る（無いと黙って monthly に倒れる）★',
  missing.length === 0, 'METHODS に 無い＝' + JSON.stringify(missing));

if (WAZA) {
  T('★--waza: 未登録を混ぜたら 必ず赤（②が落ちる＝歯が守っている）', missing.length > 0, '混ぜたのに 赤にならない＝飾りの歯');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('KEKKA {"passed":' + pass + ',"failed":' + fail + ',"mimiso":0}');
/* ★②が 本体の門。--waza の時は ②が わざと落ちるのが 正しい＝終了コードは ①と★わざと歯★で決める。 */
const realFail = WAZA ? (pass < 2) : (fail > 0);
process.exit(realFail ? 1 : 0);
