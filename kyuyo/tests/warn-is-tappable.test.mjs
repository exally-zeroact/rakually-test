/* warn-is-tappable.test.mjs — ★案内は「押せる」まで作る★（穴①）
 * ============================================================================
 * ★なぜ★
 *   県が 未選択の 警告は 文で「設定 ▸ 従業員マスタ で選んでください」と 言うだけで、
 *   ★その人の 所へ 連れて行かない★＝★人が 自分で 探す★（人数が 多いほど 見つからない）。
 *   同じアプリの ★最低賃金割れの 警告は もう 押せる★（`data-fix-emp` で その人の 札を 開いて そこまで 送る）。
 *   ⇒★新しく 作らない★＝★在る 型を そのまま 借りる★（うちの決まり「作る前に 探す」）。
 *
 * ★ここで 固定する事★
 *   ① 県未選択の 警告に ★押せる所★が 在る（人ごと）
 *   ② 押し先は ★その人★（名前ではなく ★id★ で 指す＝並び替えや 絞り込みで ずれない）
 *   ③ 受け口は ★1つ★（最低賃金割れと 同じ道を 使う＝2つ目の 仕組みを 作らない）
 *   ④ 文は ★lib 1か所★のまま（画面ごとに 書かない）
 *
 * 使い方: node kyuyo/tests/warn-is-tappable.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = process.argv.includes('--self-test');
let pass = 0, fail = 0;
const T = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const PWsrc = strip(fs.readFileSync(path.join(ROOT, 'kyuyo/lib/payroll-warnings.js'), 'utf8'));
const app = strip(fs.readFileSync(path.join(ROOT, 'kyuyo/js/app.js'), 'utf8'));
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const PWm = require(path.join(ROOT, 'kyuyo/lib/payroll-warnings.js'));
const PW = PWm.default || PWm;

console.log('\n[warn-is-tappable] 案内は「押せる」まで作る（穴①＝前は 文で 言うだけだった）');

T('★① 県未選択の 警告に 押せる所が 在る（人ごと）', () => {
  const html = PW.prefMissingWarn([{ id: 'e1', name: '山田 太郎', pref: '' }, { id: 'e2', name: '鈴木 花子', pref: '' }], {});
  ok(html, '★警告そのものが 出ない★');
  const n = (html.match(/data-fix-emp-id=/g) || []).length;
  ok(n === 2, '★押せる所が 人数ぶん 無い★＝2人なのに ' + n + '個');
  console.log('     押せる所 … ' + n + '個（2人）');
});

T('★② 押し先は id で 指す（並び替え・絞り込みで ずれない）', () => {
  const html = PW.prefMissingWarn([{ id: 'e-xyz', name: '山田 太郎', pref: '' }], {});
  ok(html.indexOf('data-fix-emp-id="e-xyz"') >= 0, '★id で 指していない★ … ' + html.slice(0, 120));
});

T('★③ 受け口は 1つ（最低賃金割れと 同じ道）', () => {
  ok(/data-fix-emp-id/.test(app), '★app が id での 押し先を 受けていない★');
  /* ★「探す所の 数」では なく ★連れて行く 中身が 1つ★かを 見る★
     （id を 番号に 直す 為に closest は 2回 出る＝★数だけ 見て 1回 外した★／2026-09-03） */
  const michi = (app.match(/state\.open\[femp\.id\]\s*=\s*true/g) || []).length;
  ok(michi === 1, '★連れて行く 道が ' + michi + '本★＝2つ目の 仕組みを 作らない（1本に まとめる）');
  ok(/dataset\.fixEmpId/.test(app), '★id を 番号に 直す 所が 無い★');
});

T('★③-2 人数が 増えても 帯が 伸びない（境界を 実物で 測った）', () => {
  /* ★実測（2026-09-03）★ 1人=1個／2人=2個／3人=3個／★4人=4個（3人＋「ほか1名」）★／7人=4個（3人＋「ほか4名」）
     ＝★押せる所は 最大4個で 止まる★（帯が 伸びて 読まれなくなるのを 防ぐ）。
     「ほか◯名」も ★押せる★＝4人目の 未選択者へ 行く（そこを 直せば 次が 出る）。 */
  const mk = (n) => PW.prefMissingWarn(Array.from({ length: n }, (_, i) => ({ id: 'e' + i, name: '人' + (i + 1), pref: '' })), {});
  const kazu = (n) => (mk(n).match(/data-fix-emp-id=/g) || []).length;
  const got = [1, 2, 3, 4, 7].map(kazu);
  ok(JSON.stringify(got) === JSON.stringify([1, 2, 3, 4, 4]), '★増え方が 変わった★ … ' + got.join(','));
  ok(/ほか4名/.test(mk(7)), '★7人の時に「ほか4名」の 押せる所が 無い★');
  console.log('     1,2,3,4,7人 → 押せる所 ' + got.join(' , ') + '個');
});

T('★④ 文は lib 1か所（画面ごとに 書かない）', () => {
  ok(/都道府県が未選択/.test(PWsrc), '★lib に 文が 無い★');
  ok(!/都道府県が未選択/.test(app), '★app にも 同じ文を 書いている★＝2か所に なる');
});

if (SELF) {
  console.log('\n[warn-is-tappable] ★自己確認★（★わざと 壊すと 赤に なるか★）');
  let ng = 0;
  const say = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  say('県が 在る人だけなら 警告は 出ない', !PW.prefMissingWarn([{ id: 'a', name: 'A', pref: 'kagawa' }], {}));
  say('人が 0人なら 警告は 出ない', !PW.prefMissingWarn([], {}));
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★2通り ぜんぶ 思った通り★');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
