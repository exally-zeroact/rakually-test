/* kyaku-hoshi.test.mjs — ★お客さんの 画面に出る字に ★ を使わない（0本・上限なし）★（純・走らせて測る）
 * ============================================================================
 * ★なぜ在るか（HARD・司さん/指示役 2026-09-06）★
 *   ★ は ★私たちの便りの印★（司さん・指示役・私／注記／書類／記憶）＝客には「壊れた字」に見える。
 *   同じ日に Exally 139本・Rakunally 23件 出た ⇒ ★会社ぜんぶの決まり＝客向けの字は 0本★。
 *   強調は 太字と色でやる。上限は付けない（①下げれば通る ②減らす途中の数が天井になる、で死ぬ）。
 * ★数える所（口でなく「配信される字」）★
 *   ・配信される .js/.mjs … ★文字列リテラル★の中の ★（正本 stringLiterals＝注記除去・正規表現飛ばし）。
 *     ただし console.*(log/warn/error/…) の引数は ★私たちの便り＝除く★。
 *   ・配信される .html … <style>/<script> と <!-- --> を外した ★タグの外の字★ ＋ title=/placeholder= 属性。
 *   ・★借り物（repo外から持ってきた物＝vendor・*.min.js・第三者lib）は 名前で除き、除いた一覧を 本数と一緒に出す★。
 *     （うちが書いた lib（給与・請求・todokede 等）は 除かない＝客向けの字が そこに在る）。
 * ★自分の歯の試し（self-test）★ … 口直書き／変数経由／innerHTML は 数え、console は 数えない事を 合成の字で 確かめる。
 * 使い方: node tests/kyaku-hoshi.test.mjs
 */
import { oboegakiWoKesu, stringLiterals } from '../tools/_oboegaki.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

const SKIP = new Set(['node_modules', '.git', 'tools', 'scripts', 'tests', '.github', '.vercel', 'dist', 'docs']);
/* ★借り物＝repo外から持ってきた物だけ★（うちが書いた lib は 除かない） */
const KARIMONO = [
  { rx: /\.min\.js$/, naze: '圧縮済みの配布物（min）' },
  { rx: /(^|\/)vendor\//, naze: 'vendor＝第三者の配布物' },
  { rx: /(^|\/)lib\/(xlsx|hyperformula|jspdf|qrcode|fontkit|chart)/i, naze: '第三者ライブラリ' },
];
const karimonoNaze = (rel) => { for (const k of KARIMONO) if (k.rx.test(rel)) return k.naze; return null; };
const CONSOLE_RX = /console\.(log|warn|error|debug|info|trace|assert)\s*\([^)]*$/;

/* ★.js/.mjs：文字列リテラルの中の ★（console.* の引数は除く）★ */
function jsHoshi(src, rel) {
  const su = oboegakiWoKesu(src);
  const hits = [];
  for (const { lit, index, line } of stringLiterals(src)) {
    if (lit.indexOf('★') < 0) continue;
    if (CONSOLE_RX.test(su.slice(Math.max(0, index - 60), index))) continue;   /* console の便り＝除く */
    hits.push({ rel, ln: String(line), hoshi: (lit.match(/★/g) || []).length, lit: lit.replace(/\s+/g, ' ').slice(0, 70) });
  }
  return hits;
}
/* ★.html：タグの外の字 ＋ title/placeholder（<style>/<script>/<!-- --> は外す）★ */
function htmlHoshi(src, rel) {
  const noC = src
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
  const hits = [];
  noC.replace(/<[^>]*>/g, '\n').split('\n').forEach((line) => {
    if (line.indexOf('★') >= 0) hits.push({ rel, ln: '(text)', hoshi: (line.match(/★/g) || []).length, lit: line.trim().slice(0, 70) });
  });
  for (const m of noC.matchAll(/(title|placeholder)\s*=\s*"([^"]*★[^"]*)"/g))
    hits.push({ rel, ln: '(' + m[1] + ')', hoshi: (m[2].match(/★/g) || []).length, lit: m[2].slice(0, 70) });
  return hits;
}

function walk(d, out) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|mjs|html)$/.test(e.name)) out.push(p);
  }
}

let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };

console.log('[kyaku-hoshi] お客さんの字に ★ を使わない（0本）');

/* ───── ① self-test（門の歯）＝合成の字で 数える/数えないを 確かめる ───── */
{
  const kuchi = "toast('★保存しました★');";
  const hensu = "var m='★消えました★'; toast(m);";
  const inner = "el.innerHTML='<b>★注意★</b>';";
  const cons = "console.warn('★debug★ x=' + x);";
  const cnt = (s) => jsHoshi(s, 'self').reduce((a, h) => a + h.hoshi, 0);
  T('① 口直書きの ★ を 数える', cnt(kuchi) === 2, '数=' + cnt(kuchi));
  T('① 変数に入れた ★ も 数える（リテラルで捕まえる）', cnt(hensu) === 2, '数=' + cnt(hensu));
  T('① innerHTML の ★ を 数える', cnt(inner) === 2, '数=' + cnt(inner));
  T('① console の ★ は 数えない（私たちの便り）', cnt(cons) === 0, '数=' + cnt(cons));
  /* HTML 側の歯 */
  const htmlCnt = (s) => htmlHoshi(s, 'self').reduce((a, h) => a + h.hoshi, 0);
  T('① HTMLタグ外の ★ を 数える', htmlCnt('<p>★注意★</p>') === 2, '数=' + htmlCnt('<p>★注意★</p>'));
  T('① <style> の中の ★ は 数えない（CSS注記は便り）', htmlCnt('<style>/* ★ */ .a{}</style><p>ok</p>') === 0, '数=' + htmlCnt('<style>/* ★ */ .a{}</style><p>ok</p>'));
  T('① title/placeholder の ★ を 数える', htmlCnt('<input title="★必須★">') === 2, '数=' + htmlCnt('<input title="★必須★">'));
}

/* ───── ② 本番の 配信物を 走査（借り物は 名前で除外し 一覧を出す） ───── */
const files = []; walk(ROOT, files);
let total = 0; const allHits = []; const excluded = [];
for (const f of files) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  const naze = karimonoNaze(rel);
  if (naze) { excluded.push({ rel, naze }); continue; }
  let src; try { src = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
  const hits = /\.html$/.test(f) ? htmlHoshi(src, rel) : jsHoshi(src, rel);
  hits.forEach((h) => { total += h.hoshi; allHits.push(h); });
}

console.log('\n── 借り物として 除いた物（名前・訳・この門では 数えない）──');
excluded.sort((a, b) => a.rel.localeCompare(b.rel)).forEach((e) => console.log('   除外: ' + e.rel + '  ← ' + e.naze));
if (!excluded.length) console.log('   （無し）');

if (allHits.length) {
  console.log('\n── 客向けの字の中の ★（ファイル:行）──');
  allHits.forEach((h) => console.log('   ' + h.rel + ':' + h.ln + '  ★×' + h.hoshi + '  ' + h.lit));
}
T('② 本番の 配信物に 客向けの ★ が 0本', total === 0, '合計 ' + total + ' 本（上の一覧）');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('KEKKA {"passed":' + pass + ',"failed":' + fail + ',"mimiso":0}');
process.exit(fail ? 1 : 0);
