/* shinda-settei.mjs — ★押しても 何も 変わらない 設定を 画面に 残さない★
 * =============================================================================
 * 司さん 2026-09-10
 *   「ごちゃごちゃするから ユーザーが ★設定で 詳細いじるのは 少しにしろよ★
 *     ★シンプルで 分かりやすい アプリにしろ★」
 *
 * ★実際に 1つ 見つけた★（2026-09-10）
 *   「お振込先の 出し方（口座ごとに改行／1行にまとめる）」
 *   ＝同じ日に 司さんが「1行で まとめなや」と 言って ★口座は いつも 1つ1行★に 決まり、
 *     紙は もう この設定（bankOneLine）を 見なくなった。
 *   ⇒ ★押しても 何も 変わらない 欄が 画面に 残っていた★。外した。
 *
 * 見る物:
 *   ① 設定の 欄が ★倉庫へ 書かれている★（読むだけ／書くだけ の 片道に なっていない）
 *   ② 倉庫へ 書いた 決めを ★紙か 画面が 読んでいる★（誰も 読まない 決めを 作らない）
 *   ③ 死んだ 設定の 名前が ★もう どこにも 無い★（bankOneLine）
 *   ④ 空振りしない（欄を 本当に 拾えている）
 *
 * 使い方: node seikyu/tests/shinda-settei.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = process.argv.includes('--self-test');
let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };

const html = fs.readFileSync(path.join(ROOT, 'seikyu', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'seikyu', 'js', 'seikyu-app.js'), 'utf8');
/* 紙・様式・列・doc … 決めを 読む 側 */
const libs = ['seikyu-paper.js', 'seikyu-templates.js', 'seikyu-cols.js', 'seikyu-doc.js',
  'seikyu-scope.js', 'seikyu-tax.js']
  .map((f) => path.join(ROOT, 'seikyu', 'lib', f))
  .filter((p) => fs.existsSync(p))
  .map((p) => fs.readFileSync(p, 'utf8')).join('\n');

/* ★設定の 画面に 出ている 欄★を 機械で 拾う（手で 名指ししない） */
const setI = html.indexOf('id="scr-set"');
const setJ = html.indexOf('</section>', setI);
const naka = html.slice(setI, setJ);
/* ★打つ 欄だけ★＝説明文（hint）・箱（card/box/row/note）は 欄では ない。
   ★2026-09-10 実測で 踏んだ★＝それらまで 拾って「片道」と 言っていた。 */
const ran = [...naka.matchAll(/<(?:input|select|textarea)[^>]*id="(s-[a-z0-9-]+)"/g)].map((m) => m[1]);
const uniq = [...new Set(ran)];

console.log('\n[shinda-settei] 押しても 何も 変わらない 設定を 残さない' + (SELF ? '（自分ためし）' : ''));
console.log('     設定の 欄 … ' + uniq.length + '個（機械で 拾った）');

T('★④ 空振りしていない（欄を 本当に 拾えている）', () => {
  ok(uniq.length >= 20, '★欄が 少なすぎ＝拾えていない★ ' + uniq.length);
});

T('★① どの 欄も 倉庫へ 書く 側で 触られている（片道に なっていない）', () => {
  /* ★読むだけ★＝画面に 出すが 保存しない ＝ 打っても 消える。
     ★書くだけ★＝保存するが 画面に 戻さない ＝ 開き直すと 消えたように 見える。
     ★どちらも 使えない 欄★なので、両方に 名前が 出ているかを 見る。 */
  const nashi = uniq.filter((id) => app.split("'" + id + "'").length - 1 < 2);
  ok(nashi.length === 0,
    '★画面に 出るのに 1回しか 触られていない 欄★（読むだけ／書くだけ）: ' + nashi.join(' / '));
});

T('★② 倉庫へ しまう 決めを 誰かが 読んでいる（死んだ 決めを 作らない）', () => {
  /* saveSettings が invoiceStyle に 入れる 名前を 拾い、
     ★紙の ライブラリが その名前を 読んでいるか★を 見る。 */
  const i = app.indexOf('invoiceStyle: (function () {');
  ok(i > 0, '★紙の書き方を しまう 所が 見つからない★');
  const j = app.indexOf('})(),', i);
  const blk = app.slice(i, j);
  const kime = [...blk.matchAll(/o\.([A-Za-z][A-Za-z0-9]*)\s*=/g)].map((m) => m[1]);
  ok(kime.length >= 3, '★決めが 少なすぎ＝拾えていない★ ' + kime.join(','));
  const shinda = kime.filter((k) => libs.indexOf(k) < 0);
  ok(shinda.length === 0,
    '★倉庫へ しまうのに 紙が 読んでいない 決め★（押しても 何も 変わらない）: ' + shinda.join(' / '));
  console.log('     紙の書き方の 決め … ' + kime.length + '個（' + kime.join(' / ') + '）＝全部 読まれている');
});

T('★③ 死んだ 設定（お振込先の出し方）が もう 無い', () => {
  /* ★字が コメントに 出るのは かまわない★＝
     ★画面の 欄★と ★様式の 決め★と ★紙が 見る所★に 無い事を 見る。 */
  ok(html.indexOf('id="s-bankline"') < 0, '★画面に まだ 欄が 在る★');
  const tpl = fs.readFileSync(path.join(ROOT, 'seikyu', 'lib', 'seikyu-templates.js'), 'utf8');
  ok(tpl.indexOf('bankOneLine:') < 0, '★様式が まだ 持っている★');
  const paper = fs.readFileSync(path.join(ROOT, 'seikyu', 'lib', 'seikyu-paper.js'), 'utf8');
  ok(paper.indexOf('TH.bankOneLine') < 0, '★紙が まだ 見ている★');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
