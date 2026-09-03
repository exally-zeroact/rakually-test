/* shoyo-furikomi.test.mjs — ★賞与も 振込に 出せる（読めた日付の 時だけ）★
 * ============================================================================
 * ★なぜ（2026-09-03 実測・指示役の裁定＝甲＋甲’）★
 *   賞与は ★計算も 紙も 確定も 在る★のに ★振込だけ 月次しか 見ていなかった★
 *   （buildTransfers が state.month と compute(e).net だけ／画面に 選び所も 無い）。
 *   さらに ★賞与の 支給日が「自由文」★（欄は ただの 文字・置き字は「例 12月10日」・形の 検査なし）。
 *   ⇒★D-1 で 潰した「読めない 日付で お金を 動かす」と 同じ形★＝★そのままでは 全銀の 取組日に 出来ない★。
 *
 * ★直し方（新しい 仕組みを 作らない）★
 *   ・賞与の 支給日を ★日付として 読める時だけ★ 振込に 使う（門番は ★D-1 の payDayReadable と 同じ考え★）
 *   ・★今 入っている 自由文は 1文字も 消さない★（読めない時は そのまま 残す＝県の 時と 同じ 逃し方）
 *   ・★紙に 出る 字は 今までどおり★（読めた時は 日付から／読めない時は 元の 文字）
 *   ・種別コードは ★会社の 契約★で（総合振込=21／給与振込=11・賞与=12）＝既定は 21＝★今のまま★
 *
 * 使い方: node kyuyo/tests/shoyo-furikomi.test.mjs [--self-test]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = process.argv.includes('--self-test');
const PMm = require(path.join(ROOT, 'kyuyo/lib/payroll-monthly.js'));
const PM = PMm.default || PMm;

let pass = 0, fail = 0;
const T = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };

console.log('\n[shoyo-furikomi] 賞与も 振込に 出せる（読めた日付の 時だけ）');

T('★① 賞与の 支給日を 読む 手が lib に 在る（月次と 同じ道）', () => {
  ok(typeof PM.bonusDateObj === 'function', '★bonusDateObj が 無い★（賞与の 日を 読む所）');
  ok(typeof PM.bonusMMDD === 'function', '★bonusMMDD が 無い★（全銀の 取組日 4桁）');
});

T('★② 日付として 読める時だけ 出す（読めなければ null）', () => {
  const yes = ['2026-12-10', '2026-12-25'];
  const no = ['', '12月10日', '１２月１０日', '12/10', 'あ', '2026-13-40', null, '2026-12-1o'];
  for (const v of yes) ok(PM.bonusDateObj({ bonus: { payDay: v } }), '★読めるはずの「' + v + '」で 出ない★');
  for (const v of no) ok(!PM.bonusDateObj({ bonus: { payDay: v } }), '★読めないはずの「' + v + '」で 出た★');
  console.log('     読める ' + yes.length + '通り／読めない ' + no.length + '通り … 思った通り');
});

T('★③ 銀行が 休みなら 月次と 同じ 寄せ方（会社の 決め方に 従う）', () => {
  /* 2026-12-27 は 日曜 … 既定（prev）なら 25日(金)へ／next なら 28日(月)へ */
  const prev = PM.bonusDateObj({ bonus: { payDay: '2026-12-27' }, company: {} });
  const next = PM.bonusDateObj({ bonus: { payDay: '2026-12-27' }, company: { paydayShift: 'next' } });
  ok(prev && next, '★寄せられない★');
  ok(prev.d !== 27 && next.d !== 27, '★休みの日に そのまま 出している★ … prev=' + prev.d + ' next=' + next.d);
  ok(prev.d < 27 && next.d > 27, '★寄せる向きが 逆★ … prev=' + prev.d + ' next=' + next.d);
  console.log('     12/27(日) … 前へ ' + prev.d + '日 ／ 次へ ' + next.d + '日');
});

T('★④ 取組日（全銀 4桁）は 読めた時だけ', () => {
  ok(PM.bonusMMDD({ bonus: { payDay: '2026-12-10' } }) === '1210', '★4桁に ならない★ … 「' + PM.bonusMMDD({ bonus: { payDay: '2026-12-10' } }) + '」');
  ok(PM.bonusMMDD({ bonus: { payDay: '12月10日' } }) === '', '★自由文で 取組日が 出た★');
});

T('★⑤ 自由文は 1文字も 消さない（画面と 紙は そのまま）', () => {
  const fs2 = require('node:fs');
  const app = fs2.readFileSync(path.join(ROOT, 'kyuyo/js/app.js'), 'utf8');
  /* 紙へ 渡す 所＝読めた時は 日付から／読めない時は ★元の 文字★ */
  ok(/bonusPayDateText|state\.bonus&&state\.bonus\.payDay/.test(app), '★紙へ 渡す 所が 消えた★');
  ok(!/state\.bonus\.payDay\s*=\s*''/.test(app), '★自由文を 消している所が 在る★');
});

if (SELF) {
  console.log('\n[shoyo-furikomi] ★自己確認★（★わざと 壊すと 赤に なるか★）');
  let ng = 0;
  const say = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  say('読める日と 読めない日で 答えが 違う',
    !!PM.bonusDateObj({ bonus: { payDay: '2026-12-10' } }) && !PM.bonusDateObj({ bonus: { payDay: '12月10日' } }));
  say('月次の 門番を 壊していない（支給日25は 今までどおり）',
    !!PM.furikomiDateObj({ month: '2026-09', company: { paydayRel: 'next', paydayDay: '25' } }));
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★2通り ぜんぶ 思った通り★');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
