/* cdn-pin.test.mjs — ★外から読む道具は 版を x.y.z まで 書く★
 * ============================================================================
 * ★司さん 2026-09-02「これから先も絶対起きないように やらせろ」★（経営者ぜんぶ経由）
 *
 * ★何が危ないか★
 *   `<script src=".../@supabase/supabase-js@2">` の様に ★版を最後まで 書かない★ と、
 *   ★うちが1文字も直していないのに ある日 中身が入れ替わる★。
 *   ★CIは緑のまま★＝CIは CDNの中身を 見ない。だから ここで ★書き方★を 見張る。
 *
 * ★実測（2026-09-02・自分で 落として 数えた）★
 *   @2 が返す版 … 2.112.4 ／ @2 と @2.112.4 は ★中身が同じ★
 *   212,718バイト ／ sha256 9a8142ffedb319a3ac0d4a8a123c9c2f7ffdb0e1e86cd9553889911b647175f6
 *   ⇒ 版を書いても ★今日の動きは 1つも 変わらない★
 *
 * ★ここで見る事★
 *   ① 配る HTML の <script src> / <link href> が 外の cdn を指すなら ★x.y.z まで書いてある★
 *      赤にする … @2 ／ @latest ／ 版なし ／ @2.1（x.y.z に なっていない）
 *   ② ★preconnect や CSP の書き方は 拾わない★（拾うと 直せない赤＝赤を見なくさせる）
 *   ③ ★0件で緑にしない★（見たファイル数・見た行数を 数えて 出す）
 *
 * ★なぜ hook ではなく ここに置くか★
 *   hook は ★その機械の、その日以降に始まったセッション★にしか効かない。
 *   ★repo に置けば CIでも 他の機械でも 止まる★（経営者 2026-09-02 の指摘）。
 *
 * ★2026-10-20 締めた（外の script は 1本も 読まない）★
 *   supabase-js・jspdf・html2canvas を cdn.jsdelivr.net から lib/ へ 移した。
 *   ★訳★＝外が 遅い日に 画面が 開かなかった（手元 63本は 最長 87ms／DCL を 止めていたのは
 *     jspdf 16〜19秒・supabase-js 終わらず＝goto 30秒切れを 3回 実測）。
 *   ⇒ ★④ 配る HTML の <script src> は 同じ源（相対）だけ★＝白名簿。外の 名簿（jsdelivr 等）で 探す 黒名簿に しない
 *     （名簿に 無い 外が 来ても 赤に する）。
 *   ⇒ ★⑤ 配る JS が 外の script を 後から 足す（src= に http／import('http…')）のも 赤★。
 *   ★②「0件で緑にしない」は 見る物を 替えた★＝外の 所が 0件に なったので、見た <script src> と JS の 本数を 数える。
 *   字体の CSS（fonts.googleapis.com）は ★まだ 外★＝①の 版の 見張りは 残す（別件で 手元へ）。
 *
 * 使い方: node tests/cdn-pin.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = process.argv.includes('--self-test');

let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + ' — ' + m); } };

/* ★外の道具を 読む書き方★＝src / href に URL が入っている物だけ。
   preconnect・dns-prefetch・CSP（Content-Security-Policy）は ★版を書けない物★なので 拾わない。 */
const CDN = /(?:cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|esm\.sh|cdn\.skypack\.dev)/;
const TAG = /<(script|link)\b[^>]*>/gi;

/* ★同じ源か★＝http: / https: / // で 始まる物は 外。data: 等も 外 扱い（script で 使う 訳が 無い）。 */
const SOTO = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

export function checkHtml(html) {
  const bad = [], seen = [], soto = [];
  let scripts = 0;
  let m;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(html))) {
    const tag = m[0];
    /* ★④ script は 同じ源だけ★（白名簿） */
    if (/^<script\b/i.test(tag)) {
      const s = (tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i) || [])[1];
      if (s) { scripts++; if (SOTO.test(s.trim())) soto.push(s); }
    }
    /* ★つなぎ先を 先に言うだけの物は 版を持てない★＝拾わない */
    if (/rel\s*=\s*"(?:preconnect|dns-prefetch|preload)"/i.test(tag)) continue;
    const u = (tag.match(/(?:src|href)\s*=\s*"([^"]+)"/i) || [])[1];
    if (!u || !CDN.test(u)) continue;
    seen.push(u);
    /* ★版の書き方は 2通り★
         @x.y.z（jsdelivr / unpkg / esm.sh …）
         /x.y.z/（cdnjs は 道の途中に 版を書く）
       ★どちらかで x.y.z が 書いてあれば 緑★
       （片方しか見ないと ★正しく書いた cdnjs まで 赤★になり、赤を見なくさせる） */
    const at = u.match(/@(\d+(?:\.\d+)*)(?=[/"?]|$)/);
    const slash = u.match(/\/(\d+\.\d+\.\d+)\//);
    const full = (v) => !!(v && /^\d+\.\d+\.\d+$/.test(v));
    const okPin = full(at && at[1]) || full(slash && slash[1]);
    if (!okPin) {
      const half = (at && at[1]) || (u.match(/\/(\d+(?:\.\d+)?)\//) || [])[1] || '';
      bad.push({ url: u, why: /latest/i.test(u) ? '@latest は いつ変わるか 分からない'
        : (half ? '版が x.y.z に なっていない（' + half + '）' : '版が 書いていない') });
    }
  }
  return { bad, seen, soto, scripts };
}

/* ★⑤ 配る JS が 外の script を 後から 足す 書き方★ */
const JS_SOTO = [
  /\.src\s*=\s*['"`](?:https?:)?\/\//i,
  /\bimport\s*\(\s*['"`](?:https?:)?\/\//i,
  /importScripts\s*\(\s*['"`](?:https?:)?\/\//i,
];
export function checkJs(src) {
  return JS_SOTO.filter((re) => re.test(String(src))).map((re) => String(src).match(re)[0]);
}

/* ★配る物だけ 見る★（node_modules や 作業用の複製は 見ない） */
function htmlFiles(dir, out, ext) {
  out = out || [];
  ext = ext || /\.html$/i;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name.startsWith('.wt-')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) htmlFiles(p, out, ext);
    else if (ext.test(e.name)) out.push(p);
  }
  return out;
}
/* ★配る JS★＝客に 届かない 置き場（.vercelignore と 同じ 名前）は 見ない。借り物（*.min.js）は 見ない
   （中の 字は うちの 書き方 では ない／呼ぶ口は うちの JS に 在る）。 */
const JS_SKIP = /(?:^|\/)(?:tests|scripts|tools|docs|supabase|\.github|\.githooks|hooks)\//;
function jsFiles() {
  return htmlFiles(ROOT, [], /\.js$/i)
    .map((f) => path.relative(ROOT, f).split(path.sep).join('/'))
    .filter((r) => !JS_SKIP.test(r) && !/\.min\.js$/i.test(r));
}

console.log('\n[cdn-pin] 外から読む道具の 版が x.y.z まで 書いてあるか');

if (SELF) {
  console.log('\n★自己確認★ わざと 悪い書き方を 通してみる（作る前に 赤になる事を 見る）');
  const cases = [
    ['@2 だけ', '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>', false],
    ['@latest', '<script src="https://cdn.jsdelivr.net/npm/foo@latest/x.js"></script>', false],
    ['版なし', '<script src="https://cdn.jsdelivr.net/npm/foo/x.js"></script>', false],
    ['@2.1（x.y.z でない）', '<script src="https://cdnjs.cloudflare.com/ajax/libs/foo/2.1/f.js"></script>', false],
    ['@2.111.0', '<script src="https://cdn.jsdelivr.net/npm/foo@2.111.0/x.js"></script>', true],
    /* ★cdnjs は 道の途中に 版を書く★＝正しく書いた物まで 赤にしない */
    ['cdnjs の 2.1.0（道に版）', '<script src="https://cdnjs.cloudflare.com/ajax/libs/foo/2.1.0/f.js"></script>', true],
    ['preconnect（版を持てない）', '<link rel="preconnect" href="https://cdn.jsdelivr.net">', true],
    ['CSPの書き方', '<meta http-equiv="Content-Security-Policy" content="script-src https://cdn.jsdelivr.net">', true],
    ['自分の repo の中の物', '<script src="js/app.js"></script>', true],
  ];
  let ng = 0;
  cases.forEach(([nm, html, wantOk]) => {
    const r = checkHtml(html);
    const got = r.bad.length === 0;
    const good = (got === wantOk);
    if (!good) ng++;
    console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + ' … ' + (got ? '緑' : '赤（' + r.bad[0].why + '）')
      + (good ? '' : '  ★思っていたのと 違う★'));
  });
  /* ★④⑤ 外の script を 読まない★（版を 正しく 書いても 外なら 赤） */
  const soto = [
    ['④ 外の script（版は 正しい）', '<script src="https://cdn.jsdelivr.net/npm/foo@2.111.0/x.js"></script>', false],
    ['④ 名簿に 無い 外（黒名簿なら 漏れる）', '<script src="https://example.org/x.js"></script>', false],
    ['④ // で 始まる 外', '<script src="//cdn.example.org/x.js"></script>', false],
    ['④ 手元の lib', '<script src="../lib/supabase-js-2.112.4.min.js"></script>', true],
    ['④ 字体の CSS は 見ない（別件）', '<link href="https://fonts.googleapis.com/css2?family=DM+Mono" rel="stylesheet">', true],
  ];
  soto.forEach(([nm, html, wantOk]) => {
    const r = checkHtml(html);
    const got = r.soto.length === 0;
    const good = (got === wantOk);
    if (!good) ng++;
    console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + ' … ' + (got ? '緑' : '赤（外 ' + r.soto[0] + '）')
      + (good ? '' : '  ★思っていたのと 違う★'));
  });
  const js = [
    ['⑤ s.src = "https://…"', "var s=document.createElement('script');s.src='https://cdn.example.org/x.js';", false],
    ['⑤ import("https://…")', "await import('https://esm.sh/foo@1.0.0');", false],
    ['⑤ 手元を 足す', "s.src = '../vendor/pdf-lib.min.js';", true],
    ['⑤ 外の 字を 持つだけ', "a.title = 'https://example.org';", true],
  ];
  js.forEach(([nm, src, wantOk]) => {
    const got = checkJs(src).length === 0;
    const good = (got === wantOk);
    if (!good) ng++;
    console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + ' … ' + (got ? '緑' : '赤') + (good ? '' : '  ★思っていたのと 違う★'));
  });
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★' + (cases.length + soto.length + js.length) + '通り ぜんぶ 思った通り★');
}

const files = htmlFiles(ROOT);
let seenUrls = 0, scripts = 0, badAll = [], sotoAll = [];
files.forEach((f) => {
  const r = checkHtml(fs.readFileSync(f, 'utf8'));
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  seenUrls += r.seen.length;
  scripts += r.scripts;
  r.bad.forEach((b) => badAll.push({ file: rel, url: b.url, why: b.why }));
  r.soto.forEach((u) => sotoAll.push({ file: rel, url: u }));
});
const jsList = jsFiles();
const jsBad = [];
jsList.forEach((rel) => checkJs(fs.readFileSync(path.join(ROOT, rel), 'utf8')).forEach((h) => jsBad.push({ file: rel, hit: h })));

console.log('     見たHTML ' + files.length + '本 ／ <script src> ' + scripts + '本 ／ 外から読む所（版を見る） ' + seenUrls
  + '件 ／ 見たJS ' + jsList.length + '本');
badAll.forEach((b) => console.log('       ★' + b.why + '★ ' + b.file + ' … ' + b.url));
sotoAll.forEach((b) => console.log('       ★外の script★ ' + b.file + ' … ' + b.url));
jsBad.forEach((b) => console.log('       ★JS が 外の script を 足す★ ' + b.file + ' … ' + b.hit));

T('★① 外から読む道具は 版を x.y.z まで 書いてある', badAll.length === 0,
  badAll.length + '件（上に出した所）');
T('★② 空振りしていない（見た数を 数えている）', files.length > 0 && scripts > 0 && jsList.length > 0,
  'HTML ' + files.length + '本 ／ <script src> ' + scripts + '本 ／ JS ' + jsList.length + '本★0件で緑にしない★');
T('★④ 配る HTML の <script src> は 同じ源だけ（外の script 0本）', sotoAll.length === 0,
  sotoAll.length + '件（上に出した所）');
T('★⑤ 配る JS が 外の script を 後から 足さない', jsBad.length === 0, jsBad.length + '件（上に出した所）');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
