/* kyaku-hoshi.test.mjs — ★お客さんの 画面に出る字に ★ を使わない（0本・上限なし）★（純・走らせて測る）
 * ============================================================================
 * ★なぜ在るか（HARD・司さん/指示役 2026-09-06）★
 *   ★ は ★私たちの便りの印★（司さん・指示役・私／注記／書類／記憶）＝客には「壊れた字」に見える。
 *   同じ日に Exally 139本・Rakunally 23件 出た ⇒ ★会社ぜんぶの決まり＝客向けの字は 0本★。
 *   強調は 太字と色でやる。上限は付けない（①下げれば通る ②減らす途中の数が天井になる、で死ぬ）。
 * ★数える所（口でなく「配信される字」）★
 *   ・配信される .js/.mjs … ★文字列リテラル★の中の ★（正本 stringLiterals＝注記除去・正規表現飛ばし）。
 *     ただし console.*(log/warn/error/…) の引数は ★私たちの便り＝除く★。
 *   ・配信される .html … <style>/<script> と <!-- --> を外した ★タグの外の字★ ＋ ★客面の属性★
 *     （title/placeholder/alt/value/aria-label ＝値表示・読み上げ・入力案内／' と " 両対応）。
 *   ・★エスケープ/実体参照で書いた ★ も 数える★（JS ★・\u{2605}／HTML &#9733;・&#x2605;＝客には ★に 見える）。
 *   ・★借り物（repo外から持ってきた物）は ①*.min.js ②vendor/ 配下 だけ 除く（名前の黒名簿にしない）★。
 *     うちが書いた lib（給与・請求・todokede・xlsx-edit 等）は 除かない＝客向けの字が そこに在る。除いた一覧を 毎回出す。
 * ★自分の歯の試し（self-test・15本）★ … 口直書き／変数経由／innerHTML／タグ外／title/placeholder/value/alt/aria-label／
 *   ' 属性／★・\u{2605}／&#9733;・&#x2605; は 数え、console／<style> は 数えない事を 合成の字で 確かめる。
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
/* ★借り物の見分けは「名前の黒名簿」でなく「構造で外部と判る物」だけ★（kensan 2026-10-05）。
   前は /lib\/(xlsx|…)/ で lib/ の名前を拾っていたが、★自前の lib/xlsx-edit.js（SheetJSを包むうちの手書き）を
   誤除外★していた（門のこのコメント自身「うちが書いた lib は除かない」に反する白名簿穴）。
   うちの lib/*.js は全部 自前＝除かない。真の第三者は ①圧縮配布物(*.min.js) ②vendor/ 配下＝この2つだけで足りる
   （repo内 実測：lib/ の非minは全て自前・第三者の非min は 0本）。 */
const KARIMONO = [
  { rx: /\.min\.js$/, naze: '圧縮済みの配布物（min）' },
  { rx: /(^|\/)vendor\//, naze: 'vendor＝第三者の配布物' },
];
const karimonoNaze = (rel) => { for (const k of KARIMONO) if (k.rx.test(rel)) return k.naze; return null; };
const CONSOLE_RX = /console\.(log|warn|error|debug|info|trace|assert)\s*\([^)]*$/;

/* ★エスケープ/実体参照で書いた ★（U+2605）も 客には ★に 見える＝数える前に 本物の ★に 直す★（taiketsu 指摘ア）。
   ・JS（decodeJs）… ★・\u{2605} を ★ に。★ただし \\u2605（逃がした 逆斜線＝客は 文字列 "★" が 見える・★でない）は 直さない★（指摘D）
     ＝先に 逃がし逆斜線 \\ を 退避してから 直す。
   ・HTML（decodeHtml）… &#9733;・&#x2605;（0詰め・大小 問わず）を ★ に。★; は 任意（ブラウザは ;無しも ★描画＝指摘B）★、
     但し 桁境界（後ろに 数/16進が 続かない）で &#97331 等の 過剰復号を 防ぐ。
   生の ★ は どちらも そのまま。 */
function decodeJs(s) {
  const PH = '\u0001';
  return String(s)
    .replace(/\\\\/g, PH)               /* ★逃がし逆斜線を 退避（\\u2605 を 守る）★ */
    .replace(/\\u\{0*2605\}/g, '★')
    .replace(/\\u0*2605/g, '★')
    .split(PH).join('\\\\');
}
function decodeHtml(s) {
  return String(s)
    .replace(/&#x0*2605(?![0-9a-f]);?/gi, '★')
    .replace(/&#0*9733(?![0-9]);?/g, '★');
}
const kazoeJs = (s) => (decodeJs(s).match(/★/g) || []).length;
const kazoeHtml = (s) => (decodeHtml(s).match(/★/g) || []).length;

/* ★.js/.mjs：文字列リテラルの中の ★（console.* の引数は除く）★ */
function jsHoshi(src, rel) {
  const su = oboegakiWoKesu(src);
  const hits = [];
  for (const { lit, index, line } of stringLiterals(src)) {
    const h = kazoeJs(lit);
    if (h === 0) continue;
    if (CONSOLE_RX.test(su.slice(Math.max(0, index - 60), index))) continue;   /* console の便り＝除く */
    hits.push({ rel, ln: String(line), hoshi: h, lit: lit.replace(/\s+/g, ' ').slice(0, 70) });
  }
  return hits;
}
/* ★.html：タグの外の字 ＋ 客面の属性（title/placeholder/alt/value/aria-label）（<style>/<script>/<!-- --> は外す）★
   （taiketsu 指摘ウ＝前は title/placeholder だけ。value=ボタン表示・alt/aria-label=読み上げ も 客面）。'と" 両対応。
   ★属性は タグ内で「名前="値"」を 順に 食って 読む★（指摘A＝ATTR_RE で 属性の 値を 丸ごと 食い、名前が 客面の時だけ 数える
   ＝data-* 等の 値の 中に 埋まった 属性風文字列（value='…'）を 偽赤に しない。地の文に 見える ★ は タグ外テキストが 拾う）。
   ★残る穴（注記・fail-closed・repo実測0）★＝属性値に 生の < > を 入れた 崩れHTMLは タグ境界を 読み違えて 偽赤になり得る
   （整形式では &lt; &gt; で書くので 当たらない／偽赤＝押せないだけ＝安全側）。 */
const KYAKU_ATTR_NAMES = new Set(['title', 'placeholder', 'alt', 'value', 'aria-label']);
const ATTR_RE = /([a-zA-Z_:][-\w:.]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
function htmlHoshi(src, rel) {
  const noC = src
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
  const hits = [];
  noC.replace(/<[^>]*>/g, '\n').split('\n').forEach((line) => {
    const h = kazoeHtml(line);
    if (h > 0) hits.push({ rel, ln: '(text)', hoshi: h, lit: line.trim().slice(0, 70) });
  });
  for (const tag of (noC.match(/<[^>]+>/g) || [])) {       /* ★タグ内で 属性を 順に 食う★ */
    ATTR_RE.lastIndex = 0;
    let m;
    while ((m = ATTR_RE.exec(tag)) !== null) {
      if (!KYAKU_ATTR_NAMES.has(m[1].toLowerCase())) continue;   /* 客面の属性名だけ */
      const val = m[3] != null ? m[3] : m[4];
      const h = kazoeHtml(val);
      if (h > 0) hits.push({ rel, ln: '(' + m[1].toLowerCase() + ')', hoshi: h, lit: val.slice(0, 70) });
    }
  }
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
  /* ★(ウ) 客面の属性＝value（ボタン表示）・alt/aria-label（読み上げ）も 数える★ */
  T('① value= の ★ を 数える', htmlCnt('<button value="★送る★">') === 2, '数=' + htmlCnt('<button value="★送る★">'));
  T('① alt= の ★ を 数える', htmlCnt('<img alt="★図★">') === 2, '数=' + htmlCnt('<img alt="★図★">'));
  T('① aria-label= の ★ を 数える', htmlCnt('<a aria-label="★閉じる★">x</a>') === 2, '数=' + htmlCnt('<a aria-label="★閉じる★">x</a>'));
  T('① 属性は \' でも 数える', htmlCnt("<input title='★必須★'>") === 2, '数=' + htmlCnt("<input title='★必須★'>"));
  /* ★(ア) エスケープ/実体参照で 書いた ★ も 数える（客には ★に 見える）★ */
  T('① JS の \\u2605 を ★として 数える', cnt("toast('\\u2605注意\\u2605');") === 2, '数=' + cnt("toast('\\u2605注意\\u2605');"));
  T('① JS の \\u{2605} を ★として 数える', cnt("toast('\\u{2605}');") === 1, '数=' + cnt("toast('\\u{2605}');"));
  T('① HTML の &#9733; を ★として 数える', htmlCnt('<p>&#9733;注意</p>') === 1, '数=' + htmlCnt('<p>&#9733;注意</p>'));
  T('① HTML の &#x2605; を ★として 数える', htmlCnt('<p>&#x2605;</p>') === 1, '数=' + htmlCnt('<p>&#x2605;</p>'));
  /* ★(B) ; 無しの数値実体も ブラウザは ★描画＝数える／但し 桁境界で 過剰復号しない★ */
  T('① ; 無し &#9733 も 数える', htmlCnt('<p>&#9733 注意</p>') === 1, '数=' + htmlCnt('<p>&#9733 注意</p>'));
  T('① ; 無し &#x2605 も 数える', htmlCnt('<p>&#x2605 x</p>') === 1, '数=' + htmlCnt('<p>&#x2605 x</p>'));
  T('① &#97331 は ★でない（桁境界＝過剰復号しない）', htmlCnt('<p>&#97331</p>') === 0, '数=' + htmlCnt('<p>&#97331</p>'));
  T('① &#x26050 は ★でない（桁境界）', htmlCnt('<p>&#x26050</p>') === 0, '数=' + htmlCnt('<p>&#x26050</p>'));
  /* ★(D) 逃がした逆斜線 \\u2605 は 客に 文字列 "★" が 見える＝★でない＝数えない★ */
  T('① JS の \\\\u2605（逃がし逆斜線）は ★でない', cnt("x='\\\\u2605';") === 0, '数=' + cnt("x='\\\\u2605';"));
  T('① でも \\u2605（本物の逃がし）は ★として 数える', cnt("x='\\u2605';") === 1, '数=' + cnt("x='\\u2605';"));
  /* ★(A) data-* に 埋めた 属性風文字列は 偽赤に しない（タグ内の 本物の属性だけ・客に見えない）★ */
  T('① data-* の 中の value=\'★\' は 偽赤に しない', htmlCnt('<div data-tpl="&lt;input value=&#39;★&#39;&gt;"></div>') === 0, '数=' + htmlCnt('<div data-tpl="&lt;input value=&#39;★&#39;&gt;"></div>'));
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
