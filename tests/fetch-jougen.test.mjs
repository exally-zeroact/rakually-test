/* fetch-jougen.test.mjs — ★CI で 走る JS の fetch に 時間の 上限（signal）が 在るか 見張る★
 * ==============================================================================
 * ★なぜ 要るか（2026-10-31 実測）★
 *   ・Node の fetch の 既定の 切れは ★約300秒★（undici の headersTimeout／bodyTimeout・Node 24.15 で 304秒 実測 taiketsu）。
 *     外へ 取る 見張り（hosts／source-urls／statutory-*／warehouse）の 段の 上限も 5分＝★300秒より 先に 段が 切れる★
 *     ⇒ ★1本 黙ると その段の 残りの 相手を 1本も 測らずに 落ちる★（何が 黙ったかも 出ない）。
 *   ・★25秒で 切ると 「取れない」道へ 落ちる★。その道が exit 0（オフラインは 赤に しない）の 見張りは
 *     ★赤→緑に 変わる★ので、週1の source-urls.yml では --strict（取れない＝exit 4）を 付けた（taiketsu 10-31 止1）。
 *   ・ci.yml の 試験の 段は 段の 上限が 無い＝外へ 取る 試験（倉庫・役所）が 固まると
 *     ★job の 上限で 切れて cancelled（灰色）★＝赤と 読み分けられない（job-jougen.test.mjs の 頭）。
 *   ・10-31 に workflow から 走る 264本を 構文木で 読み、★fetch 24か所（15本）の うち 22か所に 上限が 無かった★
 *     （在ったのは check-warehouse-pointers.mjs の 2か所 25秒 だけ）。
 *     手元で 2回 測った 1本の 最長＝5.2秒・2.6秒（check-source-urls）／GitHub の 段＝中央出典 15本で 9秒・rls-tanin 11秒
 *     ⇒ 25秒（1本あたり 約5倍の ゆとり）に 揃えた。
 *
 * ★決まり（どれか 1つでも 外れたら 赤）★
 *   ㋐ ★workflow の `node <道>` で 走る JS の fetch(…) は 2つ目に 字の 包み {…} を 渡し、その中に signal★
 *      （fetch(u) だけ・包みが 変数・signal が 無い＝赤。globalThis.fetch も 同じ）
 *   ㋑ ★読めない JS は 飛ばさず 赤★（acorn で script→module の 順に 読む・tests/kyaku-hoshi と 同じ）
 *   ㋒ ★空振り止め★＝workflow から 走る JS を 1本も 拾えない／fetch を 1か所も 数えない＝赤
 *   ★数えない 物★ … 注記・文字列・テンプレの 中の「fetch(」の 字（構文木では 呼び出しに ならない）。
 *   ★見えない 物★ … workflow に 書かれず 他の JS から 呼ばれる 物（import 先・tests/run.js が 中で 走らせる 物）と、
 *     page.evaluate の 字で 渡す 画面の 中の fetch。手で 回す scripts/apply-*・nagasu-*（倉庫へ 書く）は
 *     ★切れても 倉庫の 側で 書けて いる 事が ある★ので わざと 入れて いない。
 *
 * 使い方: node tests/fetch-jougen.test.mjs            … 今の JS を 数える
 *         node tests/fetch-jougen.test.mjs --self-test … ★わざと 上限を 抜いて 赤に なるか★
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';   /* ★devDependency 8.16.0 固定（tests/kyaku-hoshi と 同じ）★ */

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WF_DIR = path.join(ROOT, '.github/workflows');

function yomu(src) {
  const opt = { ecmaVersion: 'latest', locations: true, allowHashBang: true, allowAwaitOutsideFunction: true };
  try { return acorn.parse(src, { ...opt, sourceType: 'script' }); }
  catch (_) {
    try { return acorn.parse(src, { ...opt, sourceType: 'module' }); }
    catch (e) { return { yomenai: e.message }; }
  }
}

// fetch の 呼び出しか（fetch(…) と globalThis.fetch(…)）
function fetchKa(c) {
  if (c.type === 'Identifier') return c.name === 'fetch';
  return c.type === 'MemberExpression' && !c.computed && c.property.name === 'fetch'
    && c.object.type === 'Identifier' && c.object.name === 'globalThis';
}

function aruku(n, out) {
  if (!n || typeof n.type !== 'string') return;
  if (n.type === 'CallExpression' && fetchKa(n.callee)) out.push(n);
  for (const k of Object.keys(n)) {
    const v = n[k];
    if (Array.isArray(v)) for (const x of v) aruku(x, out);
    else if (v && typeof v.type === 'string') aruku(v, out);
  }
}

/* ★純関数: 1本の JS を 数える★（self-test で 作り物を 通せる） */
export function kazoeru(src) {
  const ast = yomu(src);
  if (ast.yomenai) return { yomenai: ast.yomenai, n: 0, aka: [] };
  const calls = [];
  aruku(ast, calls);
  const aka = [];
  for (const c of calls) {
    const o = c.arguments[1];
    const gyou = c.loc.start.line;
    if (!o) aka.push(gyou + '行: 包みが 無い（fetch(u) だけ）');
    else if (o.type !== 'ObjectExpression') aka.push(gyou + '行: 包みが 字の {…} で ない（中が 読めない）');
    else if (!o.properties.some((p) => p.type === 'Property' && !p.computed && (p.key.name || p.key.value) === 'signal'))
      aka.push(gyou + '行: signal が 無い');
  }
  return { n: calls.length, aka };
}

// workflow の `node <道>` で 走る JS（在る物だけ）
function hashiruJs() {
  const wf = fs.readdirSync(WF_DIR).filter((f) => /\.ya?ml$/.test(f))
    .map((f) => fs.readFileSync(path.join(WF_DIR, f), 'utf8')).join('\n');
  const michi = [...new Set([...wf.matchAll(/\bnode\s+([\w./-]+\.(?:mjs|cjs|js))\b/g)].map((m) => m[1]))];
  return michi.filter((m) => fs.existsSync(path.join(ROOT, m))).sort();
}

console.log('\n[fetch-jougen] CI で 走る JS の fetch に 時間の 上限が 在るか');
let zenAka = 0;
const files = hashiruJs();
let nFetch = 0, nFile = 0;
const kekka = {};
for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const r = kazoeru(src);
  kekka[f] = src;
  if (r.yomenai) { console.log('  ✗ 読めない（' + f + '）: ' + r.yomenai); zenAka++; continue; }
  if (r.n) { nFile++; nFetch += r.n; }
  for (const a of r.aka) { console.log('  ✗ ' + f + ' ' + a); zenAka++; }
}
console.log('  走る JS ' + files.length + '本・fetch を 持つ ' + nFile + '本・fetch ' + nFetch + 'か所');
if (files.length === 0) { console.log('  ✗ workflow から 走る JS を 1本も 拾えない（読み方が 壊れた）'); zenAka++; }
if (nFetch === 0) { console.log('  ✗ fetch を 1か所も 数えない（読み方が 壊れた）'); zenAka++; }

if (process.argv.includes('--self-test')) {
  console.log('\n[fetch-jougen --self-test] わざと 上限を 抜いて 赤に なるか');
  let ok = 0, n = 0;
  const T = (na, src, akaNi) => {
    n++;
    const r = kazoeru(src);
    const aka = !!r.yomenai || r.aka.length > 0;
    if (aka === akaNi) { ok++; console.log('  ✓ ' + na + '（' + (akaNi ? '赤' : '緑') + '）'); }
    else { console.log('  ✗ ' + na + '（' + (akaNi ? '赤の 筈が 緑' : '緑の 筈が 赤') + '）'); zenAka++; }
  };
  T('包み無し', "await fetch('https://x');", true);
  T('signal の 無い 包み', "await fetch(u, { redirect: 'follow' });", true);
  T('包みが 変数', 'const o = { signal: AbortSignal.timeout(1) }; await fetch(u, o);', true);
  T('globalThis.fetch も 見る', "await globalThis.fetch(u, { method: 'GET' });", true);
  T('入れ子の 中の fetch も 見る', 'async function a() { return (await fetch(u, { signal: s })).json().then(() => fetch(v)); }', true);
  T('読めない JS は 赤', 'const = ;', true);
  T('signal の 在る 包み', 'await fetch(u, { headers: h, signal: AbortSignal.timeout(25000) });', false);
  T('注記・文字列の 中の 字は 数えない', "// fetch(u)\n/* fetch(v) */\nconst s = \"await fetch('/x')\"; const t = `fetch(${u})`; const re = /\\bfetch\\s*\\(/;", false);
  // ★本物の ファイルから signal を 抜くと 赤に なるか★（1か所でも 抜けを 拾えるか・在る分 全部）
  for (const f of files) {
    const src = kekka[f];
    if (!kazoeru(src).n || !/signal:\s*AbortSignal\.timeout\(/.test(src)) continue;   // ★fetch を 呼ぶ 物だけ（この見張りの 字は 外す）
    n++;
    const kowashita = src.replace(/,?\s*signal:\s*AbortSignal\.timeout\([^)]*\)/, '');
    const r = kazoeru(kowashita);
    if (kowashita !== src && r.aka.length > 0) { ok++; console.log('  ✓ 抜くと 赤（' + f + '）'); }
    else { console.log('  ✗ 抜いても 赤に ならない（' + f + '）'); zenAka++; }
  }
  console.log('  わざと 壊した ' + n + '通り 中 合う ' + ok);
  if (n < 9) { console.log('  ✗ 壊した 数が 少なすぎる（本物から 抜く分を 拾えていない）'); zenAka++; }
}
console.log(zenAka ? '  ✗ 赤 ' + zenAka : '  ✓ 赤 0');
process.exit(zenAka ? 1 : 0);
