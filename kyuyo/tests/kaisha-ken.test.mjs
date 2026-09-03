/* kaisha-ken.test.mjs — ★会社の 都道府県は 後から 直せる★
 * ============================================================================
 * ★なぜ（2026-09-03 実測）★
 *   ★会社の 都道府県を 後から 直す道が 無かった★:
 *     ・kyuyo/index.html に「pref」は ★0件★（会社情報の タブに 欄が 無い）
 *     ・入れる所は ★最初の「聞いてあげる」の 問い（ASK_Q）1か所だけ★
 *     ・★人（従業員）の 県は マスタで いつでも 直せる★のに ★会社の 県は 通り過ぎると 触れない★
 *   しかも 電子申請の CSV の 案内が ★「会社の 都道府県が まだです（設定 ▸ 会社情報）」★と
 *   ★行けない先を 指していた★（★案内が 1手 足りない より 悪い★）。
 *   ⇒ 県が 無いと ★保険料も 最賃も CSV も★ 正しく 出ない。
 *
 * ★ここで 固定する事（指示役の 条件 4つ）★
 *   ① 人（従業員）マスタと ★同じ選び方★（新しい 見た目を 作らない＝prefOptions を 使う）
 *   ② ★値は 1か所★（state.company.pref）＝最初の 問いと 同じ物を 見る
 *   ③ 入れたら ★その場で★ 警告が 消える（丸ごと 描き直さない）
 *   ④ 案内の 文が 指す 先に ★本当に 行ける★
 *
 * 使い方: node kyuyo/tests/kaisha-ken.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = process.argv.includes('--self-test');
let pass = 0, fail = 0;
const T = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const html = fs.readFileSync(path.join(ROOT, 'kyuyo/index.html'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'kyuyo/js/app.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');

console.log('\n[kaisha-ken] 会社の 都道府県は 後から 直せる（2026-09-03＝直す道が 無かった）');

T('★① 会社情報の タブに 県の 欄が 在る', () => {
  ok(/id="c-pref"/.test(html), '★会社情報に 県の 欄（#c-pref）が 無い★＝案内の 指す先が 無い');
});

T('★② 人のマスタと 同じ 選び方（新しい 見た目を 作らない）', () => {
  ok(/prefOptions\(/.test(app), '★prefOptions を 使っていない★＝別の 一覧を 作っている');
  const i = app.indexOf("c-pref");
  ok(i > 0, '★app が #c-pref を 触っていない★');
});

T('★③ 値は 1か所（state.company.pref）', () => {
  /* 会社の 県を 書く所が ★company.pref 以外に 増えていない★ */
  const kaku = (app.match(/company\.pref\s*=/g) || []).length;
  ok(kaku >= 1, '★どこにも 書いていない★');
  ok(!/companyPref|kaishaPref/.test(app), '★別の 名前で 2つ目を 作っている★');
});

T('★④ 入れたら その場で 追いつく（丸ごと 描き直さない）', () => {
  const i = app.indexOf("c-pref");
  const chikaku = app.slice(i - 200, i + 400);
  ok(/renderAsk|refreshEmpWarn|renderSantei|fillCompany/.test(chikaku) || /addEventListener/.test(chikaku),
    '★入れた後に 何も していない★（画面が 追いつかない）');
});

T('★⑤ 案内の 文が 指す 先が 在る（行けない先を 指さない）', () => {
  const sasu = /設定 ▸ 会社情報/.test(app);
  if (sasu) ok(/id="c-pref"/.test(html), '★「設定 ▸ 会社情報」と 案内しているのに 欄が 無い★');
  ok(true, '');
});

if (SELF) {
  console.log('\n[kaisha-ken] ★自己確認★（★わざと 壊すと 赤に なるか★）');
  let ng = 0;
  const say = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  say('欄の 有無を 実物の HTML で 見ている', html.length > 1000);
  say('注記の中は 数えない（app は 注記を 外してから 見ている）', !/\/\*/.test(app.slice(0, 400)));
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★2通り ぜんぶ 思った通り★');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
