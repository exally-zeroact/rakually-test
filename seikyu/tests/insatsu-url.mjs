/* insatsu-url.mjs — ★紙に URL を 刷り込まない（ブラウザの 印刷を 使わない）★
 * =============================================================================
 * 司さん 2026-09-10「印刷するのに ★この左下のやつ 消えてない★／
 *   なんで 他のアプリで ちゃんと やれとんのに 確認しながら やらんのど」
 *
 * ★実物で 確かめた（司さんの 写真）★
 *   出来た 請求書の 左下に「https://rakually.vercel.app/seikyu/」
 *   右下に「2026/09/11 12:53 ／ 1 / 1ページ」
 *   ＝ブラウザが 印刷の時に 勝手に 足す 頭と足。★CSS では 消せない★
 *     （端末の 印刷の 設定なので こちらから 触れない）。
 *   ＝★お客さんに 渡す 請求書に うちの URL が 刷り込まれていた★。
 *
 * ★給与（kyuyo/meisai.html）は 前から 避けていた★
 *   「PDF保存=jsPDFで自前生成(A4ぴったり1ページ・ブラウザのフッター無し)。
 *     iOSのwebページ印刷は必ずURL/日付フッターが付き…ため不使用。」
 *   ＝★同じ穴を 請求書だけ 持っていた★。
 *
 * 見る物:
 *   ① ★アプリが window.print() を 呼ばない★（請求書・領収書・納品書 どこからも）
 *   ② ★紙を 出す 道は 1本★（pdfDase）＝請求書も 領収書も そこを 通る
 *   ③ ★逃げ道に「印刷なら 出せます」と 言わない★（そこが URL を 刷り込む）
 *   ④ 空振りしない（本当に 紙を 出す 道が 在る／呼ぶ所が 在る）
 *
 * 使い方: node seikyu/tests/insatsu-url.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = process.argv.includes('--self-test');
let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };

/* ★覚書は 数えない★＝コードとして 効いている 字だけ 見る */
const noC = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const app = noC(fs.readFileSync(path.join(ROOT, 'seikyu', 'js', 'seikyu-app.js'), 'utf8'));
const out = noC(fs.readFileSync(path.join(ROOT, 'seikyu', 'js', 'seikyu-out.js'), 'utf8'));
const html = fs.readFileSync(path.join(ROOT, 'seikyu', 'index.html'), 'utf8');

console.log('\n[insatsu-url] 紙に URL を 刷り込まない' + (SELF ? '（自分ためし）' : ''));

if (SELF) {
  const kowasu = [
    ['紙を 出す 道', app, '  function pdfDase(html, name, how, yobi, okId, errId) {'],
    ['印刷が その道を 通る', app, "    doPdf(name, 'open', null, '印刷');"],
    ['領収書が その道を 通る', app, "    pdfDase(built.html, name, 'open', '領収書', 'pay-ok', 'pay-err');"],
  ];
  kowasu.forEach(([na, src, x]) => ok(src.split(x).length === 2, '★壊す所が 1つ 見つからない★ ' + na + ' … ' + x));
  console.log('     壊す所 ' + kowasu.length + '箇所（本当に コードに 在る事を 見た）');
}

T('★④ 空振りしていない（紙を 出す 道が 本当に 在る）', () => {
  ok(app.indexOf('function pdfDase(') > 0, '★紙を 出す 道が 無い★');
  const yobu = app.split('pdfDase(').length - 1;
  ok(yobu >= 3, '★呼んでいる所が ' + (yobu - 1) + '＝この検査は 何も 見ていない★');
  console.log('     紙を 出す 道 … pdfDase 1本／呼んでいる所 ' + (yobu - 1) + '');
});

T('★① アプリが ブラウザの 印刷を 呼ばない', () => {
  /* ★w.print() / window.print() を 1つも 持たない★
     （持っていると その紙に URL・日付・ページ番号が 刷り込まれる） */
  [['seikyu-app.js', app], ['seikyu-out.js', out]].forEach(function (z) {
    const m = z[1].match(/\b(?:w|win|global|window)\s*\.\s*print\s*\(/g) || [];
    ok(m.length === 0, '★' + z[0] + ' が まだ ブラウザの 印刷を 呼んでいる★ ' + m.length + '件');
  });
  ok(html.indexOf('window.print') < 0, '★画面の 中に 印刷の 呼び出しが 在る★');
});

T('★② 領収書も 同じ道（片方だけ 直さない）', () => {
  const i = app.indexOf('function doReceipt(');
  ok(i > 0, '★領収書を 出す 所が 無い★');
  const naka = app.slice(i, app.indexOf('\n  }', i));
  ok(naka.indexOf('pdfDase(') > 0, '★領収書だけ 別の道を 通っている★');
  ok(naka.indexOf('OUT.print(') < 0, '★領収書が まだ ブラウザの 印刷★');
});

T('★③ 逃げ道に「印刷なら 出せます」と 言わない', () => {
  /* ★PDFが 作れなかった時に ブラウザの 印刷へ 誘わない★
     ＝そこが まさに URL を 刷り込む 道。 */
  ok(app.indexOf('「印刷 / PDF保存」なら 今すぐ出せます') < 0,
    '★作れなかった時に ブラウザの 印刷へ 誘っている★');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
