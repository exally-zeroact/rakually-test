/* hanko-same.test.mjs — ★借りた道具 hanko.js が 元と 1文字も違わないか★
 * ============================================================================
 * ★司さん 2026-08-30「ハンコの情報あるんやけんやれや」★
 *   ＝白抜きの道具（hanko.js）は 代行請求／Exally に 前から在った。
 *     うちだけ 持っていなかったので ★借りた★。
 *
 * ★うちの決まり★
 *   ・借りてよいのは ★道具・測り方・試験★（見た目・形は 借りない）
 *   ・★別repoからコピペして 置きっぱなしにしない★＝正本を1つ決めて
 *     ★CIで 中身の同じさを 機械で照らす★（最賃38県が誤値になった型の ドリフト事故を防ぐ）
 *
 * ★正本★ … exally-zeroact/daikou-seikyu（代行請求の本番）の hanko.js
 *   手元では C:/Users/zeroa/Exally-test/hanko.js
 *   （★フォルダ名を 環境の証拠にしない★＝Exally-test の中身は 代行請求の本番）
 *
 * ★改行は そろえて 比べる★（Windows の CRLF と CI の LF で 中身が同じでも SHA が変わる）
 *
 * ★元が 手元に無い時は「未測定」★＝★0件（＝合っていた）と 書かない★
 *   （CIのマシンには 別repoが 無い＝そこでは 比べられない。それを 緑と 言わない）
 *
 * 使い方: node tests/hanko-same.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = process.argv.includes('--self-test');

let pass = 0, fail = 0, unknown = 0;
const T = (n, fn) => {
  try { fn(); pass++; console.log('  ✓ ' + n); }
  catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); }
};
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };

const MINE = path.join(ROOT, 'js/hanko.js');
/* 正本と、その写し（どちらも 手元に在る時だけ 比べる） */
const SRC = [
  { name: '代行請求 本番（正本）', file: 'C:/Users/zeroa/Exally-test/hanko.js' },
  { name: '代行請求 テスト', file: 'C:/Users/zeroa/daikou-seikyu-test/hanko.js' },
];
const lfSha = (p) => crypto.createHash('sha256')
  .update(fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')).digest('hex');

console.log('\n[hanko-same] 借りた道具が 元と 1文字も違わないか');

ok(fs.existsSync(MINE), '★js/hanko.js が 無い★');
const mine = lfSha(MINE);
console.log('  うちの js/hanko.js … ' + mine.slice(0, 16) + '（改行をそろえて数えた）');

T('★① 借りた道具を 書き換えていない（中身は 元のまま）', () => {
  const found = SRC.filter((s) => fs.existsSync(s.file));
  if (!found.length) {
    unknown++;
    console.log('     ★未測定★ … 元が この機械に 無いので 比べられません'
      + '（★0件＝合っていた ではありません★）');
    return;
  }
  found.forEach((s) => {
    const sha = lfSha(s.file);
    console.log('     ' + s.name + ' … ' + sha.slice(0, 16) + (sha === mine ? '  同じ' : '  ★違う★'));
    ok(sha === mine, '★' + s.name + ' と 中身が 違う（借りた道具を いじった／元が変わった）★');
  });
});

T('★② 道具の顔（公開している名前）が 変わっていない', () => {
  const src = fs.readFileSync(MINE, 'utf8');
  ['hasAlpha', 'whiteToTransparent', 'process', 'HankoTool'].forEach((k) => {
    ok(src.indexOf(k) >= 0, '★' + k + ' が 無い★');
  });
});

T('★③ 使う側は 道具を いじらず 呼ぶだけ（うちの都合を 道具に入れない）', () => {
  const use = fs.readFileSync(path.join(ROOT, 'seikyu/lib/seikyu-seal.js'), 'utf8');
  ok(/HankoTool/.test(use), '★呼んでいない＝借りた意味が 無い★');
  ok(/dataURL/.test(use), '★返ってくる名前（dataURL）に 合わせていない★');
  const src = fs.readFileSync(MINE, 'utf8');
  ok(!/Rakunally|seikyu|請求書/.test(src), '★道具に うちの都合を 書き足している★');
});

T('★④ 画面から 読まれている（在るのに 使われていない、を作らない）', () => {
  const html = fs.readFileSync(path.join(ROOT, 'seikyu/index.html'), 'utf8');
  ok(/js\/hanko\.js/.test(html), '★請求書の画面が 読んでいない★');
});

if (SELF) {
  console.log('\n★自己確認★ 1文字 変えたら 赤になるか');
  const found = SRC.filter((s) => fs.existsSync(s.file));
  if (!found.length) { console.log('  ※ 元が 無いので ここは 試せません（未測定）'); }
  else {
    const keep = fs.readFileSync(MINE);
    try {
      fs.writeFileSync(MINE, keep.toString('utf8') + '\n// わざと足した1行\n');
      const bad = lfSha(MINE) !== lfSha(found[0].file);
      if (!bad) { console.log('  NG ★変えても 同じと言う＝見張りが 効いていない★'); process.exit(1); }
      console.log('  ok  1行 足すと ちゃんと 違うと言う');
    } finally { fs.writeFileSync(MINE, keep); }
  }
}
console.log('\n' + pass + ' passed, ' + fail + ' failed'
  + (unknown ? ' ／ ★未測定 ' + unknown + '件★' : ''));
process.exit(fail ? 1 : 0);
