/* dep-count.mjs — ★「呼ばれる側」を1本ずつ数える道具★
 * ==============================================================================
 * なぜ要るか（前科）:
 *   ★呼ぶ側だけ写して 本番を白画面にした★（sha一致・CI緑・2052本緑でも捕まらなかった）。
 *   画面は「読み込む物の一覧」を持っているだけで、★その物が在るかは誰も数えていなかった★。
 *
 * 何を数えるか（★src= だけで判定しない★）:
 *   ・HTML の <script src> / <link href> / <img src> / <a href="*.html">
 *   ・JS の require() / import / import()
 *   ・★window.○○ で繋がっている物★（require が無くても「呼ばれる側」は居る）
 *   ・★ディスクに在るのに 入口から辿れない物★（＝死にファイル候補。台帳に載せる物）
 *
 * 使い方:
 *   node scripts/dep-count.mjs seikyu/index.html            … 人が読む形
 *   node scripts/dep-count.mjs seikyu/index.html --json     … 機械が読む形
 *   import { count } from './scripts/dep-count.mjs'         … テストから呼ぶ
 *
 * ★運ぶ時は 写す前と写した後に この同じ道具で数える★（受け皿側も同じ物を使う）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** 入口の HTML から辿れる物を全部 数える。
 *  @param {string} entryRel 例 'seikyu/index.html'
 *  @param {string} [root]   既定＝このリポジトリの根
 *  @returns {{inside:string[],outside:string[],net:string[],notReached:string[],
 *             missing:string[],globals:string[],dirs:string[]}} */
export function count(entryRel, root) {
  const ROOT = root || path.join(HERE, '..');
  const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
  const readIf = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };

  const seen = new Map();          // 相対パス → { from:Set }
  const missing = [];
  const net = new Set();
  const entry = path.join(ROOT, entryRel);
  const base = entryRel.split('/')[0] + '/';       // 例 'seikyu/'

  function add(abs, from) {
    const k = rel(abs);
    if (!seen.has(k)) seen.set(k, { from: new Set() });
    seen.get(k).from.add(from);
    return k;
  }

  /* 1) HTML が読む物 */
  const htmlSrc = readIf(entry);
  if (htmlSrc === null) throw new Error('入口の HTML が無い: ' + entryRel);
  const jsQueue = [];
  const PATS = [
    [/<script[^>]+src="([^"]+)"/g, 'script'],
    [/<link[^>]+href="([^"]+)"/g, 'link'],
    [/<img[^>]+src="([^"]+)"/g, 'img'],
    [/<a[^>]+href="([^"]+\.html[^"]*)"/g, 'a'],
  ];
  for (const [re, kind] of PATS) {
    for (const m of htmlSrc.matchAll(re)) {
      let u = m[1];
      if (/^https?:|^\/\//.test(u)) { net.add(u.split('?')[0]); continue; }
      if (/^(mailto:|tel:|#)/.test(u)) continue;
      u = u.split('?')[0].split('#')[0];
      const abs = path.resolve(path.dirname(entry), u);
      if (!fs.existsSync(abs)) { missing.push(rel(abs) + ' ← ' + entryRel + '（' + kind + '）'); continue; }
      add(abs, entryRel);
      if (/\.js$/.test(abs)) jsQueue.push(abs);
    }
  }

  /* 2) JS が require / import する物（★深さで追う★） */
  const globals = new Set();
  const scanned = new Set();
  while (jsQueue.length) {
    const js = jsQueue.shift();
    if (scanned.has(js)) continue;
    scanned.add(js);
    const src = readIf(js);
    if (src === null) continue;
    for (const re of [/require\(\s*['"]([^'"]+)['"]\s*\)/g, /from\s+['"]([^'"]+)['"]/g, /import\(\s*['"]([^'"]+)['"]\s*\)/g]) {
      for (const m of src.matchAll(re)) {
        const u = m[1];
        if (!/^[./]/.test(u)) { net.add('(npm) ' + u); continue; }
        const abs = path.resolve(path.dirname(js), u);
        if (!fs.existsSync(abs)) { missing.push(rel(abs) + ' ← ' + rel(js) + '（require）'); continue; }
        add(abs, rel(js));
        if (/\.js$/.test(abs)) jsQueue.push(abs);
      }
    }
    /* ★window.○○ で繋がる物★＝require が無くても「呼ばれる側」が要る */
    for (const m of src.matchAll(/\b(?:root|window|self|global)\.([A-Z][A-Za-z0-9_]+)\b/g)) globals.add(m[1]);
  }

  /* 3) ★ディスクに在るのに 入口から辿れない物★（取りこぼし＝白画面／死にファイル） */
  const dirs = [];
  const onDisk = [];
  for (const d of ['js', 'lib', 'css']) {
    const dir = path.join(ROOT, base, d);
    if (!fs.existsSync(dir)) continue;
    dirs.push(base + d);
    for (const f of fs.readdirSync(dir)) {
      if (/\.(js|css)$/.test(f)) onDisk.push(base + d + '/' + f);
    }
  }

  const all = [...seen.keys()].sort();
  return {
    inside: all.filter((k) => k.startsWith(base)),
    outside: all.filter((k) => !k.startsWith(base)),
    net: [...net].sort(),
    notReached: onDisk.filter((f) => !seen.has(f)).sort(),
    missing,
    globals: [...globals].sort(),
    dirs,
    from: Object.fromEntries([...seen].map(([k, v]) => [k, [...v.from]])),
  };
}

/* ── 人が読む形で出す ─────────────────────────────────────────────── */
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const entry = process.argv[2] || 'seikyu/index.html';
  const r = count(entry);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    const p = (t, a) => { console.log('\n■ ' + t + '（' + a.length + '本）'); a.forEach((x) => console.log('   ' + x)); };
    console.log('════════ 「呼ばれる側」 ════════\n★入口★ ' + entry);
    p('中', r.inside);
    p('★外を呼んでいる★ ← 一緒に運ばないと白画面', r.outside.map((k) => k + '   ← ' + r.from[k].join(' , ')));
    p('ネットの向こう ← 受け皿でも同じ物が要る', r.net);
    p('★ディスクに在るのに 入口から辿れない★', r.notReached);
    p('★見つからない参照★', r.missing);
    p('window.○○ で繋がっている物', r.globals);
  }
  process.exit(r.missing.length ? 1 : 0);
}
