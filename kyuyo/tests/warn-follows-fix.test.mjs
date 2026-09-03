/* warn-follows-fix.test.mjs — ★直したら 警告も ついてくる★（穴②）
 * ============================================================================
 * ★なぜ（2026-09-03 実UIで 再現）★
 *   設定▸従業員マスタ で 県を 空に しても ★その場では 警告が 出ない（0個）★。
 *   画面を 出入りして 描き直すと ★1個 出る★。
 *   ★そのまま 県を 選んでも 警告は 1個 出たまま★＝★直したのに 消えない★。
 *   もう一度 描き直すと ★0個★。
 *   ⇒ ★中身（判定）は 正しいのに、画面が 描き直しでしか 追いつかない★
 *     ＝★同じ状態を 2か所（中身と 画面）で 別々に 持っている★のと 同じ事が 起きる。
 *   ⇒ 直す人は「直したのに 怒られたまま」＝★直った 手応えが 無い★。
 *
 * ★直し方（丸ごと 描き直さない）★
 *   ・警告は ★名前の 付いた 箱（#emp-warn）★に 入れる
 *   ・県を 変えた その場で ★その箱だけ★ 描き直す（★札を 閉じない・入力中の 場所を 飛ばさない★）
 *   ・同じ理由で ★社会保険の 自動計算（refreshShaho）★も 県で 動くので 一緒に 更新する
 *
 * 使い方: node kyuyo/tests/warn-follows-fix.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = process.argv.includes('--self-test');
let pass = 0, fail = 0;
const T = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };

export function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
const app = strip(fs.readFileSync(path.join(ROOT, 'kyuyo/js/app.js'), 'utf8'));

console.log('\n[warn-follows-fix] 直したら 警告も ついてくる（2026-09-03 実測＝直しても 1個 出たままだった）');

T('★① 警告は 名前の 付いた 箱に 入っている（そこだけ 描き直せる）', () => {
  ok(/id="emp-warn"/.test(app), '★#emp-warn の 箱が 無い★＝丸ごと 描き直すしか 無くなる');
});

T('★② その箱だけを 描き直す 手が 在る', () => {
  ok(/function\s+refreshEmpWarn/.test(app), '★refreshEmpWarn が 無い★');
  ok(/refreshEmpWarn\(\)/.test(app), '★作っただけで 呼んでいない★');
});

T('★③ 県を 変えた その場で 呼んでいる（描き直し待ちに しない）', () => {
  /* change の 受け口で f==='pref' を 見て 呼んでいるか（★書き方に よらず★ 近くに 在る事で 見る） */
  const i = app.indexOf("f==='pref'");
  ok(i > 0, "★f==='pref' を 見ている所が 無い★");
  const chikaku = app.slice(i, i + 160);
  ok(/refreshEmpWarn\(\)/.test(chikaku), '★県を 変えても 警告を 描き直していない★ … ' + chikaku.slice(0, 60));
  ok(/refreshShaho\(/.test(chikaku), '★県で 動く 社会保険の 表示を 更新していない★（同じ 取り残し）');
});

T('★④ 丸ごと 描き直していない（札が 閉じる・入力中の 場所が 飛ぶ のを 防ぐ）', () => {
  const i = app.indexOf("f==='pref'");
  const chikaku = app.slice(i, i + 160);
  ok(!/renderEmpMaster\(\)/.test(chikaku), '★県で 丸ごと 描き直している★＝開いていた札が 閉じる');
});

if (SELF) {
  console.log('\n[warn-follows-fix] ★自己確認★（★わざと 戻すと 赤に なるか★）');
  let ng = 0;
  const say = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  say('直す前の 形（pref を 見ていない）なら ③が 赤に なると 分かる', "if(f==='payType')".indexOf("f==='pref'") < 0);
  say('注記の中の refreshEmpWarn は 数えない', !/refreshEmpWarn/.test(strip('/* refreshEmpWarn を 呼ぶ事 */')));
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★2通り ぜんぶ 思った通り★');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
