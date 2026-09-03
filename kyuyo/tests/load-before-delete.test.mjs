/* load-before-delete.test.mjs — ★読めるまで 消さない・読めるまで 保存しない★
 * ============================================================================
 * ★なぜ（2026-09-03・DB-test で 10回 実測）★
 *   ★新しい端末で 開くだけ★で ★倉庫の 従業員が 消えた＝6回／10回★
 *   （倉庫 2人［山田 太郎・鈴木 花子］→ 1人［従業員 1］）
 *   時刻 … ★保存が 読み込みより 先に 走る＝10回／10回★（差 30〜60ms）
 *     開く → 自動保存1本目 2,637ms（手元は「従業員 1」だけ・cloudSynced=false なので 消さない）
 *          → ★その保存が 成功して cloudSynced=true になる★
 *          → 自動保存2本目 2,823ms ⇒ ★差分削除が 走って 山田・鈴木が 消える★
 *          → 2,695ms で 読み込みが 2人 返る（★もう 遅い★）
 *   ★正体＝「書けた」を「もう 倉庫の 中身を 知っている」と 取り違えている★
 *
 * ★指示役の裁定（2026-09-03）＝直しは 2つ★
 *   ①★差分削除の 条件を「保存できた(cloudSynced)」→「★読み込みが 成功した(cloudLoaded)★」に★
 *     ＝★消してよいかは「書けたか」ではなく「★読めたか★」で 決める★
 *     （`emps.length>0` の 条件は そのまま＝両方 満たした時だけ 消す）
 *   ②★初回の 読み込みが 終わるまで 自動保存を 走らせない★（保留して 済んでから 1回だけ 出す）
 *     ＝①だけでも 消えなくなるが、②が 無いと「古い一覧で 上書き」が 残る
 *
 * ★ここで見る事（源を 読むだけでなく 実物の 中身を 見る）★
 *   ① 差分削除の 条件に ★cloudLoaded が 入っている★／★cloudSynced だけでは 消さない★
 *   ② ★cloudLoaded は 読み込みが 成功した時にだけ true★（保存では true に しない）
 *   ③ ★読み込みが 終わるまで 自動保存を 出さない★（保留の 仕組みが 在る）
 *   ④ ★読み込みが 失敗した時は 保存しない・消さない★（今の 安全側を 壊していない）
 *   ⑤ ★P0の 守り（conflict）は そのまま★／★ふつうに 人を 消す道は 生きている★
 *
 * ★実際に 動かして 数える★のは `kyuyo/tests/load-before-delete-live.mjs`（DB-test・手で 走らせる）
 *   ここは ★CIで 毎回 走る 形の 見張り★（倉庫が 要らない）。
 *
 * 使い方: node kyuyo/tests/load-before-delete.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = process.argv.includes('--self-test');

let pass = 0, fail = 0;
const T = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };

/* ★注記を 外してから 数える★（「使うな」と 書いてある行が 一番 引っかかる） */
export function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
const store = strip(fs.readFileSync(path.join(ROOT, 'kyuyo/js/store.js'), 'utf8'));
const app = strip(fs.readFileSync(path.join(ROOT, 'kyuyo/js/app.js'), 'utf8'));

console.log('\n[load-before-delete] 読めるまで 消さない・読めるまで 保存しない（2026-09-03 実測 6/10 で 消えた）');

T('★① 差分削除は 読み込みが 成功した時だけ（cloudLoaded を 見ている）', () => {
  const m = /if\s*\(\s*([^)]*?)\s*&&\s*emps\.length\s*>\s*0\s*\)/.exec(store);
  ok(m, '★差分削除の 条件が 見つからない（形が 変わった？）★');
  ok(/cloudLoaded/.test(m[1]), '★条件に cloudLoaded が 無い★＝今は「' + m[1].trim() + '」');
  console.log('     条件 … ' + m[1].trim() + ' && emps.length>0');
});

T('★② cloudLoaded は 読み込みが 成功した時にだけ true（保存では 立てない）', () => {
  const set = [...store.matchAll(/cloudLoaded\s*=\s*true/g)].length;
  ok(set >= 1, '★cloudLoaded を true にする所が 無い★');
  /* 保存の中（doSave）で 立てていないか＝doSave の 塊の中に 無い事を 見る */
  const i = store.indexOf('function doSave');
  const j = i >= 0 ? store.indexOf('\n        }', i) : -1;
  const inSave = (i >= 0 && j > i) ? store.slice(i, j) : '';
  ok(!/cloudLoaded\s*=\s*true/.test(inSave), '★保存の中で cloudLoaded を true にしている★');
  console.log('     true にする所 ' + set + 'か所（保存の中には 無い）');
});

T('★③ 読み込みが 終わるまで 自動保存を 出さない（保留の 仕組みが 在る）', () => {
  /* ★字で 探して 1回 外した★（2026-09-03）＝画面の 文言に「クラウド保存は 保留」と 書いてあり、
     ★仕組みが 無いのに 緑★になった。⇒★物を 名指しで 読む★＝保存を 止める 旗そのものを 見る。 */
  ok(/cloudLoadedOnce|saveHold|holdSaveUntilLoad/.test(store),
    '★保存を 止める 旗が 無い★＝開いた直後の 自動保存が そのまま 出る（文言の「保留」は 数えない）');
  ok(/if\s*\(\s*!?\s*(?:Store\.)?(?:cloudLoadedOnce|saveHold)/.test(app + store),
    '★旗を 見て 保存を 止めている所が 無い★');
});

T('★④ 読み込みが 失敗した時は 保存しない（今の 安全側を 壊していない）', () => {
  ok(/sync-check-failed/.test(store), '★安全側の 返り（sync-check-failed）が 消えている★');
});

T('★⑤ P0の 守り（conflict）と 人を消す道は そのまま', () => {
  ok(/reason\s*:\s*'conflict'/.test(store), '★conflict の 返りが 無い★');
  ok(/delete\(\)\.in\('id'\s*,\s*rm\)/.test(store), '★差分削除 そのものが 消えている（消す道を 殺した）★');
});

if (SELF) {
  console.log('\n[load-before-delete] ★自己確認★（★わざと 戻すと 赤に なるか★）');
  let ng = 0;
  const say = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  /* 直す前の 形（cloudSynced だけ）を 食わせたら 赤に なるか */
  const old = 'if(cloudSynced && emps.length>0){ }';
  const m = /if\s*\(\s*([^)]*?)\s*&&\s*emps\.length\s*>\s*0\s*\)/.exec(strip(old));
  say('直す前の 形（cloudSynced だけ）を 読むと cloudLoaded が 無いと 分かる',
    !!m && !/cloudLoaded/.test(m[1]));
  say('注記の中の cloudLoaded は 数えない',
    !/cloudLoaded/.test(strip('/* cloudLoaded を 見る事 */ if(cloudSynced && emps.length>0){}')));
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★2通り ぜんぶ 思った通り★');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
