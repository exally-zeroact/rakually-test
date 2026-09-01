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

export function checkHtml(html) {
  const bad = [], seen = [];
  let m;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(html))) {
    const tag = m[0];
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
  return { bad, seen };
}

/* ★配る物だけ 見る★（node_modules や 作業用の複製は 見ない） */
function htmlFiles(dir, out) {
  out = out || [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name.startsWith('.wt-')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) htmlFiles(p, out);
    else if (/\.html$/i.test(e.name)) out.push(p);
  }
  return out;
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
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★8通り ぜんぶ 思った通り★');
}

const files = htmlFiles(ROOT);
let seenUrls = 0, badAll = [];
files.forEach((f) => {
  const r = checkHtml(fs.readFileSync(f, 'utf8'));
  seenUrls += r.seen.length;
  r.bad.forEach((b) => badAll.push({ file: path.relative(ROOT, f).split(path.sep).join('/'), url: b.url, why: b.why }));
});

console.log('     見たHTML ' + files.length + '本 ／ 外から読む所 ' + seenUrls + '件');
badAll.forEach((b) => console.log('       ★' + b.why + '★ ' + b.file + ' … ' + b.url));

T('★① 外から読む道具は 版を x.y.z まで 書いてある', badAll.length === 0,
  badAll.length + '件（上に出した所）');
T('★② 空振りしていない（見た数を 数えている）', files.length > 0 && seenUrls > 0,
  'HTML ' + files.length + '本 ／ 外から読む所 ' + seenUrls + '件★0件で緑にしない★');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
