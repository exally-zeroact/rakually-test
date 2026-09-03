/* furikomi-shikyubi.test.mjs — ★支給日が 読めない時は 銀行へ 出さない★
 * ============================================================================
 * ★なぜ（2026-09-03 実測・指示役の裁定＝乙＋丙）★
 *   会社の 支給日が ★空でも 0でも 文字でも★、振込指定日が ★黙って 25日★で 出て、
 *   ★全銀ファイルも 作れて しまった★（＝当てずっぽうの 日付で お金が 動く）。
 *   さらに ★全角の「１０」を 入れると 10日では なく 25日★に なる（★お客の 入力と 違う日★）。
 *     実測（対象月 2026-09・翌月払い）…
 *       空/0/文字/全角「２５」/「１０」 → ★2026-10-23（25日から）★
 *       「1o」→ 1日 ／ 「-5」→ 1日 ／ 「3.5」→ 3日扱い ／ 「99」→ 月末に 丸め
 *   ⇒ 紙は 人が 読んで 気づけるが、★振込は 気づかず 送金される★。
 *   ⇒★裁定＝銀行へ 出す 物は 作らない（乙）／画面は「決められません」＋設定で 聞く（丙）★
 *
 * ★ここで 固定する事★
 *   ① ★読めない 支給日★（空・0・文字・全角数字・負・小数・99）は ★振込指定日を 出さない（null）★
 *   ② ★読める 支給日★（1〜31・「末日」）は ★1日も 動かない★（お金の 値を 変える 直しでは ない）
 *   ③ 取組日（全銀 4桁）も 同じ＝★出せない時は 空★（呼んだ側が 1バイトも 作らない）
 *   ④ ★31 は 末日の 意味で 使える★（画面が「末日は 31」と 案内している＝わざと）
 *
 * 使い方: node kyuyo/tests/furikomi-shikyubi.test.mjs [--self-test]
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
const YM = '2026-09';
const hi = (v) => {
  const o = PM.furikomiDateObj({ month: YM, company: { paydayRel: 'next', paydayDay: v } });
  return o ? (o.y + '-' + String(o.m).padStart(2, '0') + '-' + String(o.d).padStart(2, '0')) : null;
};
const mmdd = (v) => PM.furikomiMMDD({ month: YM, company: { paydayRel: 'next', paydayDay: v } });

console.log('\n[furikomi-shikyubi] 支給日が 読めない時は 銀行へ 出さない（2026-09-03 実測＝黙って 25日で 出ていた）');

T('★① 読めない 支給日では 振込指定日を 出さない', () => {
  const dame = ['', '0', 'あ', '２５', '１０', '-5', '3.5', '1o', '99', '  ', null];
  const deta = dame.filter((v) => hi(v) !== null);
  ok(deta.length === 0, '★読めないのに 日付が 出た★ … ' + deta.map((v) => '「' + v + '」→' + hi(v)).join(' , '));
  console.log('     読めない ' + dame.length + '通り … ぜんぶ 出ない');
});

T('★② 読める 支給日は 1日も 動かない（お金を 変えていない）', () => {
  /* 直す前に 実測した 値（2026-09・翌月払い）＝この まま でなければ ならない */
  const exp = { '25': '2026-10-23', '31': '2026-10-30', '末日': '2026-10-30', '10': '2026-10-09', '1': '2026-10-01' };
  /* ★「1」を 2026-11-02 と 書いて 外した★（2026-09-03）＝翌月払いの 1日は ★10-01（木・営業日）★。
     ★期待値は 頭で 作らず 実測から 取る★。 */
  for (const k of Object.keys(exp)) {
    ok(hi(k) === exp[k], '★「' + k + '」の 日が 動いた★ … ' + hi(k) + '（前は ' + exp[k] + '）');
  }
  console.log('     25→' + hi('25') + ' ／ 31→' + hi('31') + ' ／ 末日→' + hi('末日') + ' ／ 10→' + hi('10'));
});

T('★③ 取組日（全銀の4桁）も 出せない時は 空', () => {
  ok(mmdd('') === '', '★空の 支給日で 取組日が 出た★ … 「' + mmdd('') + '」');
  ok(/^\d{4}$/.test(mmdd('25')), '★読める時に 取組日が 出ない★ … 「' + mmdd('25') + '」');
  console.log('     空 → 「' + mmdd('') + '」 ／ 25 → 「' + mmdd('25') + '」');
});

T('★④ 31 は 末日の 意味で 使える（画面が そう 案内している）', () => {
  ok(hi('31') === hi('末日'), '★31 と 末日が 違う★ … 31=' + hi('31') + ' ／ 末日=' + hi('末日'));
});

T('★⑤ 決められない時の 札は「押せる」（丙＝設定で 聞く）', () => {
  const fs2 = require('node:fs');
  const app = fs2.readFileSync(path.join(ROOT, 'kyuyo/js/app.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  ok(/data-fix-payday/.test(app), '★「決められません」の 札に 押せる所が 無い★＝人が 自分で 探す');
  /* ★`data-fix-payday]` で 数えて 1個しか 拾えなかった★（出す所は `data-fix-payday>`）＝
     ★閉じ括弧まで 書いた 物差しは 書き方で 外す★（2026-09-03）。名前だけで 数える。 */
  const uke = (app.match(/data-fix-payday/g) || []).length;
  ok(uke >= 2, '★出す所と 受ける所の どちらかが 無い★（今 ' + uke + '）');
  ok(/c-payday-day/.test(app), '★連れて行く先（支給日の 入れる所）を 指していない★');
});

T('★⑥ 支給日が 読めない時に 壊れた文を 出さない（毎月「日」）', () => {
  const fs2 = require('node:fs');
  const app = fs2.readFileSync(path.join(ROOT, 'kyuyo/js/app.js'), 'utf8');
  /* ★日が 抜けた「毎月日・翌月払い」を 出していた★＝読む人が 何日か 分からない。
     いまは 読めない時に そもそも 日付を 出さない（furikomiDateObj が null）＝この文に 来ない。
     ★念のため 文を 作る所が 支給日の 空を そのまま 埋め込んでいないか 見る★ */
  const i = app.indexOf("会社の決まり「毎月");
  ok(i > 0, '★根拠の 文が 見つからない（形が 変わった？）★');
  const chikaku = app.slice(i - 200, i + 200);
  ok(/paydayDay/.test(chikaku), '★支給日を 使っていない★');
  ok(!PM.furikomiDateObj({ month: YM, company: { paydayRel: 'next', paydayDay: '' } }),
    '★空の 支給日で 日付が 出る＝壊れた文の 道が 生きている★');
});

if (SELF) {
  console.log('\n[furikomi-shikyubi] ★自己確認★（★わざと 壊すと 赤に なるか★）');
  let ng = 0;
  const say = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  say('読める日と 読めない日で 答えが 違う（物差しが 効いている）', hi('25') !== null && hi('') === null);
  say('月が 変われば 日も 変わる（月を 見ている）',
    (PM.furikomiDateObj({ month: '2026-10', company: { paydayRel: 'next', paydayDay: '25' } }) || {}).m === 11);
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★2通り ぜんぶ 思った通り★');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
