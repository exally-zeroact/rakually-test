/* no-duplicate-libs.test.mjs — ★同じ物を2箇所に置かせない（特に法定データ）★
 *
 * なぜ必要か:
 *   2026-08-01 の調べで、リポジトリ直下に `shakaihoken-hyo.js` と `saitei-chingin.js` が
 *   残っているのを見つけた。中身は `kyuyo/lib/` 版と**76行違って**いた（直下の方が古い）。
 *   今はどのHTMLからも読まれていないので実害は出ていないが、
 *   **人でもAIでも grep して古い方を掴んだ瞬間に、社会保険料が静かに1円ずれる。**
 *   過去に「最賃38県が誤値」というコピペ・ドリフト事故を実際に起こしている。同じ形。
 *
 *   ★消すだけでは足りない。消しても、また誰かが持ち込めば同じ事が起きる。
 *     だから「二度と生えない」ようにここで機械が止める。
 *
 * 判定:
 *   同じファイル名の .js が、配信されるディレクトリに2箇所以上あったら赤。
 *   （node_modules / tests / tools / scripts は対象外＝配信されないため）
 *   どうしても2箇所必要な物は EXCEPTIONS に理由つきで載せる。
 *
 * 使い方: node tests/no-duplicate-libs.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ★2箇所にあってよい物（理由必須）。ここに無い重複は赤。 */
const EXCEPTIONS = {
  'auth.js': '名前が同じだけの【別物】。js/auth.js はハブのログイン＋利用権ゲート、'
    + 'kyuyo/js/auth.js は給与のログイン(window.Store.auth 経由)、'
    + 'seikyu/js/auth.js は請求書のログイン(SeikyuApp.attach 経由・利用権の関所はまだ無い)。互いの写しではない。'
    + '★共通の部分（ログイン画面そのもの）は js/exally-login.js に1本で置いてある＝写しではない。'
    + 'ログイン画面そのものは共通部品 js/exally-login.js で1本化してあり、両方それを読んでいる。',
};

/* ★法定データ（金額に直結する物）は【必ず1箇所】。ここに載っている名前が2箇所にあったら、
   例外は認めない＝無条件で赤。過去に「最賃38県が誤値」のコピペ・ドリフト事故を起こしているため。 */
const STATUTORY = [
  'shakaihoken-hyo.js',   // 健康保険・厚生年金の料率表
  'saitei-chingin.js',    // 最低賃金
  'koyo-hoken.js',        // 雇用保険
  'shotokuzei-densan.js', // 所得税(月額表)
  'shotokuzei-hei.js', 'shotokuzei-nichi.js',
  'shoyo-zei.js',         // 賞与の所得税
  'warimashi.js',         // 割増率
  'nenmatsu.js',          // 年末調整
  'juminzei.js',          // 住民税
  'shouhizei-ritsu.js',   // 消費税（★2026-08-02: 直下の写しを消して kyuyo/lib/ に1本化した）
  'statutory-rows.js',    // 中央statutoryへ入れる行の生成
];

/* 配信されるディレクトリだけを見る（テストや道具は配信されないので対象外） */
const SKIP_DIRS = new Set(['node_modules', '.git', 'tests', 'tools', 'scripts', 'docs', 'supabase', '.github', 'tmp']);

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + e.message); } };

function walk(rel, out = []) {
  const dir = path.join(ROOT, rel || '.');
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const r = rel ? rel + '/' + name : name;
    if (fs.statSync(path.join(ROOT, r)).isDirectory()) walk(r, out);
    else if (/\.js$/i.test(name)) out.push(r);
  }
  return out;
}

const files = walk('');
const byName = {};
files.forEach(r => {
  const base = path.basename(r);
  (byName[base] = byName[base] || []).push(r);
});

const dups = Object.keys(byName).filter(b => byName[b].length > 1 && !EXCEPTIONS[b]).sort();

console.log('\n[no-duplicate-libs] 同じ物が2箇所に無いか（法定データのコピペ・ドリフト防止）');

T('★同じ名前の .js が配信物の中に2箇所以上ない', () => {
  if (dups.length) {
    const detail = dups.map(b => {
      const paths = byName[b];
      let same = true;
      try {
        const first = fs.readFileSync(path.join(ROOT, paths[0]), 'utf8').replace(/\r\n/g, '\n');
        same = paths.every(p => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n') === first);
      } catch (e) { same = false; }
      return '   - ' + b + '  → ' + paths.join(' / ') + (same ? '（中身は同じ）' : '  ★中身が違う＝どちらかが古い');
    }).join('\n');
    throw new Error('同じ名前のファイルが複数あります:\n' + detail
      + '\n   → 1本に寄せる。どうしても2箇所必要なら EXCEPTIONS に理由を書く。'
      + '\n     ★法定データ(社保・最賃・所得税)は特に危ない。古い方を掴むと金額が静かにずれる。');
  }
});

T('★★法定データ(金額に直結)は必ず1箇所しかない — 例外を認めない★★', () => {
  const bad = STATUTORY.filter(b => byName[b] && byName[b].length > 1);
  if (bad.length) {
    throw new Error('法定データが2箇所以上にあります:\n'
      + bad.map(b => '   - ' + b + ' → ' + byName[b].join(' / ')).join('\n')
      + '\n   → ★必ず1本に寄せる。古い方を掴むと社会保険料や最低賃金が【静かに】ずれる。'
      + '\n     過去に「最賃38県が誤値」の事故を起こしている。ここに例外は無い。');
  }
});
T('法定データの一覧が空振りしていない（実際にその名前のファイルがある）', () => {
  const found = STATUTORY.filter(b => byName[b]);
  if (found.length < 5) throw new Error('法定データの一覧が実物と合っていません（見つかった: ' + found.join(', ') + '）');
});

T('例外表の各項目に理由が書いてあり、実在する', () => {
  for (const [b, why] of Object.entries(EXCEPTIONS)) {
    if (!why || why.length < 15) throw new Error(b + ': 理由が不十分');
    if (!byName[b]) throw new Error(b + ': 例外表にあるがファイルが無い（消したなら例外表からも消す）');
  }
});

T('検査が空振りしていない（配信物の .js を実際に数えている）', () => {
  if (files.length < 20) throw new Error('走査できた .js が少なすぎます: ' + files.length);
});

console.log('\n── 実測 ──');
console.log('  配信物の .js: ' + files.length + '本 / 名前の種類 ' + Object.keys(byName).length);
console.log('  重複: ' + dups.length + '件' + (dups.length ? '\n' + dups.map(b => '   - ' + b + ': ' + byName[b].join(' / ')).join('\n') : ''));
console.log('  例外(理由つき): ' + Object.keys(EXCEPTIONS).length + '件');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
