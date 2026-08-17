/* no-dark-green.test.mjs — ★使わないと決めた濃い緑 #1A4A2E が どこにも残っていないこと★
 *
 * なぜ必要か（2026-08-02 司さん判断 → 2026-08-09 に穴が見つかった）:
 *   「この色好きやなし、見にくいし重い」で ★#1A4A2E は二度と使わない／使うのは #2E7D54★ と決め、
 *   372箇所を実スクショで見比べて全アプリを直した。
 *   ★ところがコードは直ったのに、CLAUDE.md の「色の表」が
 *     『コードブロックテキスト #1A4A2E』と教え続けていた★（4repoに残存）。
 *   ＝「法定の率を説明文に直書きするな（計算が正でも文だけ取り残される）」と同じ型。
 *   次に誰かが表を見て、また使う。だから ★指示書まで含めて機械で見張る★。
 *
 * 判定:
 *   #1A4A2E / rgb(26,74,46) / rgba(26,74,46,…) が
 *   ★コード・docs・CLAUDE.md のどこかに1つでも在れば赤★
 *
 * 使い方: node tests/no-dark-green.test.mjs
 *         node tests/no-dark-green.test.mjs --self-test   ★わざと足して赤になるか★
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* 3通りの書き方を全部見る（1つしか見ないと必ず素通りする） */
export const DARK = /#1A4A2E\b|rgba?\(\s*26\s*,\s*74\s*,\s*46\s*[,)]/i;
export const GOOD = '#2E7D54';

/* ★見ないファイル（理由つき）★
   ここは「記録」なので、当時の色がそのまま残っていてよい。
   ただし ★この検査そのもの★ は探す文字列を持つので外す。 */
export const SKIP = {
  'tests/no-dark-green.test.mjs': 'この検査自身（探す文字列を持っている）',
  /* ★禁止する側は、禁止する色の名前を書かないと守れない★
     （2026-08-17 Rakually を立てた時に足した。3本とも「#1A4A2E が在ったら赤」にする側＝この検査と同じ役目）。
     戻す条件＝その見張りが色を見なくなった時（見なくなったら、この行も消す）。 */
  'seikyu/tests/seikyu-cols.test.mjs': '請求書の列の見張り。#1A4A2E を禁止する側 ok(!/#1A4A2E/…)',
  'seikyu/tests/seikyu-paper.test.mjs': '請求書の紙の見張り。#1A4A2E を禁止する側',
  'seikyu/tests/seikyu-ui.mjs': '請求書の実UIの見張り。#1A4A2E を禁止する側',
};
const SKIP_DIR = new Set(['node_modules', '.git', '.vercel', 'playwright-report', 'test-results']);
const EXT = new Set(['.js', '.mjs', '.css', '.html', '.json', '.md', '.yml', '.yaml', '.ps1', '.sh']);

export function findDark(files, skip = SKIP) {
  const hits = [];
  for (const [rel, text] of Object.entries(files)) {
    if (skip[rel]) continue;
    /* ★パッチの削除行（先頭が -）は「もう消した記録」なので数えない★
       ただし理由を残すため、何行 飛ばしたかは返す */
    const lines = String(text).split('\n');
    lines.forEach((ln, i) => {
      if (/^-[^-]/.test(ln)) return;            // パッチの削除行＝記録
      if (DARK.test(ln)) hits.push({ file: rel, line: i + 1, text: ln.trim().slice(0, 90) });
    });
  }
  return hits;
}

function collect() {
  const files = {};
  const walk = (rel) => {
    for (const f of fs.readdirSync(path.join(ROOT, rel || '.'))) {
      if (SKIP_DIR.has(f)) continue;
      const r = rel ? path.posix.join(rel, f) : f;
      const p = path.join(ROOT, r);
      if (fs.statSync(p).isDirectory()) { walk(r); continue; }
      if (!EXT.has(path.extname(f))) continue;
      files[r] = fs.readFileSync(p, 'utf8');
    }
  };
  walk('');
  return files;
}

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };

if (process.argv.includes('--self-test')) {
  console.log('\n[no-dark-green] ★わざと足して赤になるか★');
  T('#1A4A2E を1つ足したら赤（大文字）', () => {
    if (findDark({ 'a.css': 'color:#1A4A2E;' }).length !== 1) throw new Error('捕まえられない');
  });
  T('小文字でも赤', () => {
    if (findDark({ 'a.css': 'color:#1a4a2e;' }).length !== 1) throw new Error('捕まえられない');
  });
  T('rgb(26,74,46) でも赤', () => {
    if (findDark({ 'a.css': 'color: rgb( 26 , 74 , 46 );' }).length !== 1) throw new Error('捕まえられない');
  });
  T('rgba(26,74,46,.5) でも赤', () => {
    if (findDark({ 'a.css': 'color: rgba(26,74,46,.5);' }).length !== 1) throw new Error('捕まえられない');
  });
  T('★指示書(CLAUDE.md)の表でも赤（今回の穴そのもの）', () => {
    if (findDark({ 'CLAUDE.md': '|コードブロックテキスト|#1A4A2E |' }).length !== 1) throw new Error('捕まえられない');
  });
  T('★パッチの削除行は数えない（もう消した記録）', () => {
    if (findDark({ 'x.patch': '-  color:#1A4A2E;' }).length !== 0) throw new Error('記録を数えてしまった');
  });
  T('使ってよい色は赤にしない', () => {
    if (findDark({ 'a.css': 'color:' + GOOD + ';' }).length !== 0) throw new Error('誤検知');
  });
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

console.log('\n[no-dark-green] 使わないと決めた濃い緑 #1A4A2E が残っていないか');
const files = collect();
const hits = findDark(files);

T('★#1A4A2E がコード・docs・CLAUDE.md のどこにも無い', () => {
  if (hits.length) {
    throw new Error('使うのは ' + GOOD + ' です（2026-08-02 司さん判断）:\n'
      + hits.map((h) => `   - ${h.file}:${h.line}  ${h.text}`).join('\n'));
  }
});
T('見ないファイルには理由が書いてある', () => {
  for (const [f, why] of Object.entries(SKIP)) {
    if (!why || why.length < 8) throw new Error(f + ': 理由が短すぎる');
  }
});
T('検査が空振りしていない（実際にファイルを読んでいる）', () => {
  if (Object.keys(files).length < 50) throw new Error('読めたファイルが少なすぎます: ' + Object.keys(files).length);
  if (!files['CLAUDE.md']) throw new Error('CLAUDE.md を読めていない＝今回の穴を見張れていない');
});

console.log('\n── 実測 ──');
console.log(`  見たファイル: ${Object.keys(files).length}本 / 見ない物 ${Object.keys(SKIP).length}本（理由つき）`);
console.log(`  濃い緑 #1A4A2E: ${hits.length}件`);
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
