/* refs-resolve.test.mjs — ★「読んでいるファイルが実在するか」を機械で見張る★
 *
 * なぜ必要か（実際に起きた事故・2026-08-02）:
 *   本番の掃除（abcc812）で、リポジトリ直下の
 *     shakaihoken-hyo.js / koyohoken-ritsu.js / shouhizei-ritsu.js
 *   を「どのHTMLからも読まれていない」と判断して消した。
 *   ★判断に使ったのは HTML の src="..." だけで、JS の require() を見ていなかった。★
 *   ところが api/claude.js（チャットのサーバ側）がこの3本を require していたため、
 *   関数が読み込みの時点で MODULE_NOT_FOUND になり、
 *   ★ /api/claude が毎回 500（FUNCTION_INVOCATION_FAILED）＝チャットが全部落ちた。★
 *   画面のテストでは絶対に見つからない（HTMLは正常に出る。落ちるのはAPIだけ）。
 *
 *   ★だから「参照」を数える時は src= だけでなく require / import も必ず含める。
 *     人の注意力ではなく、ここで機械が止める。
 *
 * 判定:
 *   ① 配信物・api・道具の .js/.mjs にある【相対】require/import が、実在ファイルに解決すること
 *      （コメントと文字列の中の "require('...')" は数えない＝空振りの赤を出さない）
 *   ② ★api/ の各ファイルが【実際に require できる】こと（＝Vercelでの読み込みと同じ事をやる）
 *   ③ api/ が使う外部パッケージが package.json の dependencies にあること
 *      （devDependencies では本番に入らない＝これも500になる）
 *
 * 使い方: node tests/refs-resolve.test.mjs
 *         node tests/refs-resolve.test.mjs --self-test   ← わざと壊して赤になるかの自己確認
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const require_ = createRequire(import.meta.url);

const SKIP_DIRS = new Set(['node_modules', '.git', 'tmp', '.vercel', 'dist']);

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };

/* ══ コメントを落とす（文字列は残す＝specifier を読むため） ═══════════════
 *  ・"..." '...' `...` の中は触らない（URL の // をコメントと誤認しないため）
 *  ・正規表現リテラル /.../ も飛ばす（中の引用符で文字列判定が壊れないため）
 *  ・後読み(?<=)は使わない（古いiOS Safariで正規表現ごと壊れるため。この決まりはリポジトリ共通）
 */
export function stripComments(src) {
  let out = '', i = 0, prev = '';
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (ch === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (ch === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2; out += ' '; continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch; out += ch; i++;
      while (i < n) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] || ''); i += 2; continue; }
        out += src[i];
        if (src[i] === q) { i++; break; }
        i++;
      }
      prev = q; continue;
    }
    // 直前の「意味のある文字」が値で終わっていない時だけ、/ を正規表現の始まりとみなす
    if (ch === '/' && (prev === '' || '(,=:[!&|?{};+-*%~^'.indexOf(prev) >= 0)) {
      i++; let cls = false, closed = false;
      while (i < n) {
        const c = src[i];
        if (c === '\\') { i += 2; continue; }
        if (c === '[') cls = true;
        else if (c === ']') cls = false;
        else if (c === '/' && !cls) { i++; closed = true; break; }
        else if (c === '\n') break;
        i++;
      }
      out += ' ';
      if (!closed) { /* 割り算だった可能性。以降は普通に読み進める */ }
      prev = '/'; continue;
    }
    out += ch;
    if (!/\s/.test(ch)) prev = ch;
    i++;
  }
  return out;
}

/* 1ファイルから require/import の指定子を取り出す（コメント除去後） */
export function specifiersOf(src) {
  const body = stripComments(src);
  const out = [];
  const RE = /(?:require\s*\(\s*|import\s*\(\s*|(?:^|[\s;}])(?:import|export)[\s\S]{0,200}?from\s+|(?:^|[\s;}])import\s+)(['"])([^'"\n]+)\1/g;
  let m;
  while ((m = RE.exec(body))) out.push(m[2]);
  return out;
}

/* ★純関数：ファイル一覧（path→中身）と「実在するパスの集合」から、解決できない参照を返す。
   実物でもテスト用の作り物でも同じ物を通す＝self-test でわざと壊せる。 */
export function findUnresolved(files, existing) {
  const has = (p) => existing.has(p.split('\\').join('/'));
  const bad = [];
  for (const [rel, src] of Object.entries(files)) {
    for (const spec of specifiersOf(src)) {
      if (spec[0] !== '.') continue;                 // 外部パッケージは別のテストで見る
      const base = path.posix.join(path.posix.dirname(rel), spec);
      const cands = [base, base + '.js', base + '.mjs', base + '.cjs', base + '.json', base + '/index.js'];
      if (!cands.some(has)) bad.push({ from: rel, spec });
    }
  }
  return bad;
}

/* ══ self-test（わざと壊して、この検査が本当に赤にできるか確かめる） ══════ */
if (process.argv.includes('--self-test')) {
  console.log('\n[refs-resolve --self-test] わざと壊して赤になるか');
  const S = (n, fn) => T(n, fn);
  const ex = (arr) => new Set(arr);

  /* ★作り物のソースは【組み立てて】作る。
     ここに require('./nai.js') とそのまま書くと、このファイル自身を走査した時に
     「実在しない参照」として拾われてしまう（＝自分で自分を赤にする）。
     文字列を分けて組み立てれば、走査には引っかからず、中身は同じ物になる。 */
  const Q = "'";
  const REQ = (s) => 'require(' + Q + s + Q + ')';
  const IMP = (s) => 'import fs from ' + Q + s + Q + ';';
  const EXF = (s) => 'export { x } from ' + Q + s + Q + ';';
  const DYN = (s) => 'await import(' + Q + s + Q + ');';

  S('実在すれば緑', () => {
    const bad = findUnresolved({ 'api/a.js': 'const x=' + REQ('../lib/b.js') + ';' }, ex(['lib/b.js']));
    if (bad.length) throw new Error('緑のはずが赤: ' + JSON.stringify(bad));
  });
  S('★消えていれば赤（今回の事故そのもの）', () => {
    const bad = findUnresolved({ 'api/claude.js': 'const x=' + REQ('../shakaihoken-hyo.js') + ';' }, ex(['kyuyo/lib/shakaihoken-hyo.js']));
    if (bad.length !== 1) throw new Error('赤になるはずが: ' + JSON.stringify(bad));
  });
  S('拡張子なしでも解決する', () => {
    const bad = findUnresolved({ 'a/b.js': REQ('./c') }, ex(['a/c.js']));
    if (bad.length) throw new Error('解決できていない');
  });
  S('import 文も数える', () => {
    const bad = findUnresolved({ 'a.mjs': IMP('./nai.js') }, ex([]));
    if (bad.length !== 1) throw new Error('import を見ていない');
  });
  S('export ... from も数える', () => {
    const bad = findUnresolved({ 'a.mjs': EXF('./nai.js') }, ex([]));
    if (bad.length !== 1) throw new Error('export from を見ていない');
  });
  S('動的 import() も数える', () => {
    const bad = findUnresolved({ 'a.mjs': DYN('./nai.js') }, ex([]));
    if (bad.length !== 1) throw new Error('import() を見ていない');
  });
  S('★コメントの中の require は数えない（空振りの赤を出さない）', () => {
    const src = '/* 【利用】Node ' + REQ('./ops/payroll.monthly.js') + ' */\nmodule.exports={};';
    const bad = findUnresolved({ 'kyuyo/ops/payroll.monthly.js': src }, ex([]));
    if (bad.length) throw new Error('コメントを数えてしまった: ' + JSON.stringify(bad));
  });
  S('行コメントの中の require も数えない', () => {
    const bad = findUnresolved({ 'a.js': '// ' + REQ('./nai.js') + '\n' }, ex([]));
    if (bad.length) throw new Error('行コメントを数えてしまった');
  });
  S('文字列の中の // をコメントと誤認しない', () => {
    const src = 'var u=' + Q + 'https://example.com/x' + Q + ';\n' + REQ('./nai.js') + ';';
    const bad = findUnresolved({ 'a.js': src }, ex([]));
    if (bad.length !== 1) throw new Error('URLの後ろを読み飛ばした: ' + JSON.stringify(bad));
  });
  S('正規表現リテラルの中の引用符で壊れない', () => {
    const src = 'var re=/[' + Q + '"]/g;\n' + REQ('./nai.js') + ';';
    const bad = findUnresolved({ 'a.js': src }, ex([]));
    if (bad.length !== 1) throw new Error('正規表現で読み飛ばした: ' + JSON.stringify(bad));
  });
  S('外部パッケージは相対参照として数えない', () => {
    const bad = findUnresolved({ 'a.js': REQ('@anthropic-ai/sdk') }, ex([]));
    if (bad.length) throw new Error('外部パッケージを数えてしまった');
  });
  S('★このファイル自身が走査に引っかからない（作り物が実物と混ざらない）', () => {
    const me = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
    const bad = findUnresolved({ 'tests/refs-resolve.test.mjs': me }, ex(all_ForSelfTest()));
    if (bad.length) throw new Error('自分自身を赤にしています:\n' + bad.map(b => '   - ' + b.spec).join('\n'));
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
/* self-test で「自分自身を走査しても赤にならない」を確かめる用（実物のファイル一覧） */
function all_ForSelfTest() {
  const out = [];
  (function w(rel) {
    for (const name of fs.readdirSync(path.join(ROOT, rel || '.'))) {
      if (SKIP_DIRS.has(name)) continue;
      const r = rel ? rel + '/' + name : name;
      if (fs.statSync(path.join(ROOT, r)).isDirectory()) w(r); else out.push(r);
    }
  })('');
  return out;
}

/* ══ 本番（実物を見る） ═══════════════════════════════════════════════════ */
function walk(rel, out = []) {
  for (const name of fs.readdirSync(path.join(ROOT, rel || '.'))) {
    if (SKIP_DIRS.has(name)) continue;
    const r = rel ? rel + '/' + name : name;
    if (fs.statSync(path.join(ROOT, r)).isDirectory()) walk(r, out);
    else out.push(r);
  }
  return out;
}

const all = walk('');
const existing = new Set(all);
const jsFiles = all.filter(r => /\.(js|mjs|cjs)$/i.test(r));
const files = {};
for (const r of jsFiles) files[r] = fs.readFileSync(path.join(ROOT, r), 'utf8');

const totalRefs = jsFiles.reduce((s, r) => s + specifiersOf(files[r]).filter(x => x[0] === '.').length, 0);
const unresolved = findUnresolved(files, existing);
const apiFiles = jsFiles.filter(r => r.startsWith('api/'));

console.log('\n[refs-resolve] 読んでいるファイルが実在するか（require/import を含める）');

T('★相対の require/import が全部実在する', () => {
  if (unresolved.length) {
    throw new Error('解決できない参照があります:\n'
      + unresolved.map(b => '   - ' + b.from + '  →  ' + b.spec).join('\n')
      + '\n   → 消したファイルを誰かがまだ読んでいます。'
      + '\n     ★HTMLの src= だけ見て「死にファイル」と判断しないこと。JSの require/import も参照です。');
  }
});

T('★api/ の各ファイルが実際に読み込める（Vercelと同じ事をやる）', () => {
  if (!apiFiles.length) throw new Error('api/ にファイルがありません（検査が空振り）');
  if (!process.env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = 'test-dummy-key';
  const ng = [];
  for (const r of apiFiles) {
    try { require_(path.join(ROOT, r)); }
    catch (e) { ng.push('   - ' + r + '  →  ' + (e.code ? e.code + ' ' : '') + String(e.message).split('\n')[0]); }
  }
  if (ng.length) {
    throw new Error('api/ の読み込みに失敗しました（＝本番なら毎回500）:\n' + ng.join('\n'));
  }
});

T('api/ が使う外部パッケージが dependencies にある（devDependenciesでは本番に入らない）', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const deps = new Set(Object.keys(pkg.dependencies || {}));
  const builtin = new Set(['fs', 'path', 'url', 'crypto', 'http', 'https', 'os', 'stream', 'util', 'buffer', 'zlib', 'events', 'child_process']);
  const ng = [];
  for (const r of apiFiles) {
    for (const spec of specifiersOf(files[r])) {
      if (spec[0] === '.' || spec.startsWith('node:')) continue;
      const name = spec[0] === '@' ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      if (builtin.has(name) || deps.has(name)) continue;
      ng.push('   - ' + r + ' が ' + name + ' を使っているが dependencies に無い');
    }
  }
  if (ng.length) throw new Error('本番に入らない依存を使っています:\n' + ng.join('\n'));
});

T('検査が空振りしていない（相対参照を実際に数えている）', () => {
  if (totalRefs < 50) throw new Error('数えられた相対参照が少なすぎます: ' + totalRefs + '件（走査が壊れている疑い）');
  if (jsFiles.length < 30) throw new Error('走査できた .js/.mjs が少なすぎます: ' + jsFiles.length);
});

console.log('\n── 実測 ──');
console.log('  .js/.mjs: ' + jsFiles.length + '本 / 相対参照 ' + totalRefs + '件 / 未解決 ' + unresolved.length + '件');
console.log('  api/: ' + apiFiles.length + '本（' + apiFiles.join(', ') + '）');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
