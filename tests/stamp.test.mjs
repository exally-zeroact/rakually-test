/* stamp.test.mjs — キャッシュバスター(?v=内容ハッシュ)の道具そのもののテスト
 *
 * なぜ必要か: この仕組みが壊れると「デプロイしたのに端末が旧コードのまま」に戻る。
 *   実際に 2026-07-29 staging で踏んだ（CSSを直したのにブラウザが旧版を読んでいた）。
 *   さらに ハッシュがOSでブレると CI の --check が永久に赤になり、誰も信じなくなる。
 * だから「決定論であること」を先に固定する。
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildHash, stampHtml } from '../scripts/stamp-build.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const T = [];
function test(name, fn) { T.push({ name, fn }); }

// 使い捨ての小さなリポジトリを作る
function mkRepo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stamp-'));
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  return dir;
}

/* ═══ ハッシュが決定論か（ここが崩れると CI が永久に赤） ═══ */

test('★CRLF(Windows)とLF(CI Linux)で同じハッシュになる', () => {
  const a = mkRepo({ 'js/a.js': 'var x = 1;\nvar y = 2;\n', 'css/s.css': '.a{color:red}\n' });
  const b = mkRepo({ 'js/a.js': 'var x = 1;\r\nvar y = 2;\r\n', 'css/s.css': '.a{color:red}\r\n' });
  assert.strictEqual(buildHash(a), buildHash(b), '行末でハッシュがブレている＝Windows/CIで--checkが永久に赤になる');
});

test('★古いMac風のCR単独でも同じハッシュになる', () => {
  const a = mkRepo({ 'js/a.js': 'var x = 1;\nvar y = 2;\n' });
  const b = mkRepo({ 'js/a.js': 'var x = 1;\rvar y = 2;\r' });
  assert.strictEqual(buildHash(a), buildHash(b));
});

test('同じ内容なら何度計算しても同じ（実行ごとに変わらない）', () => {
  const d = mkRepo({ 'js/a.js': 'a', 'js/b.js': 'b', 'lib/c.js': 'c', 'css/s.css': 's' });
  const h = buildHash(d);
  for (let i = 0; i < 5; i++) assert.strictEqual(buildHash(d), h);
});

test('★中身が1文字でも変われば必ずハッシュが変わる（変えたのに配られない、が起きない）', () => {
  const a = mkRepo({ 'js/a.js': 'var x = 1;' });
  const b = mkRepo({ 'js/a.js': 'var x = 2;' });
  assert.notStrictEqual(buildHash(a), buildHash(b));
});

test('ファイル名が変わればハッシュが変わる（名前も内容のうち）', () => {
  const a = mkRepo({ 'js/a.js': 'same' });
  const b = mkRepo({ 'js/b.js': 'same' });
  assert.notStrictEqual(buildHash(a), buildHash(b));
});

test('★内容の「境目」がずれてもハッシュが変わる（連結の取り違えを防ぐ）', () => {
  const a = mkRepo({ 'js/a.js': 'ab', 'js/b.js': 'c' });
  const b = mkRepo({ 'js/a.js': 'a', 'js/b.js': 'bc' });
  assert.notStrictEqual(buildHash(a), buildHash(b), '区切り無しで連結している＝別物が同じハッシュになる');
});

test('JS/CSSだけを見る（画像やHTMLが変わってもハッシュは動かない）', () => {
  const a = mkRepo({ 'js/a.js': 'x', 'img/i.png': '1', 'hub.html': '<p>a' });
  const b = mkRepo({ 'js/a.js': 'x', 'img/i.png': '2', 'hub.html': '<p>b' });
  assert.strictEqual(buildHash(a), buildHash(b));
});

// ★グリッド(book.html)が読む exally-formula.js / hyperformula.full.min.js はリポジトリ直下に居る。
//   ここが対象から漏れると「グリッドを直したのに端末が旧コードのまま」になる(2026-07-29 に対象へ追加)。
test('★リポジトリ直下の .js もハッシュの対象（book.html の資産が漏れない）', () => {
  const a = mkRepo({ 'js/a.js': 'x', 'exally-formula.js': 'v1' });
  const b = mkRepo({ 'js/a.js': 'x', 'exally-formula.js': 'v2' });
  assert.notStrictEqual(buildHash(a), buildHash(b), '直下の.jsを変えてもハッシュが動かない=版が上がらない');
});

test('★直下の .js にも ?v= が付く（book.html の書き換え）', () => {
  const html = '<script src="hyperformula.full.min.js"></script>\n<script src="exally-formula.js"></script>';
  const out = stampHtml(html, 'abc12345');
  assert.ok(out.includes('src="hyperformula.full.min.js?v=abc12345"'), out);
  assert.ok(out.includes('src="exally-formula.js?v=abc12345"'), out);
});

test('★直下パターンを足しても外部CDNには付かない（: を含むURLを除外）', () => {
  const html = '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>\n'
    + '<script src="//example.com/x.js"></script>\n'
    + '<link href="https://fonts.googleapis.com/css2?family=DM+Mono" rel="stylesheet">';
  assert.strictEqual(stampHtml(html, 'abc12345'), html);
});

/* ★2026-08-17 Rakunally: 見る画面を book.html（Exally のブック）から
   ★請求書 seikyu/index.html★ に替えた。「在るか無いかで飛ばす」書き方は
   ★消えた日から永久に空振り★になるので使わない（読めなければ赤）。 */
test('★seikyu/index.html の全ローカルアセットに ?v= が付いている', () => {
  const html = fs.readFileSync(path.join(ROOT, 'seikyu/index.html'), 'utf8');
  const refs = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]).filter(u => !/^(https?:)?\/\//.test(u));
  assert.ok(refs.length >= 10, 'seikyu/index.html のローカルscriptが少なすぎる(検査が空振り): ' + refs.length);
  const noV = refs.filter(r => !/\?v=[0-9a-f]{8}$/.test(r));
  assert.deepStrictEqual(noV, [], '?v= が無い参照: ' + noV.join(', '));
});

test('ディレクトリが無くても落ちない', () => {
  const d = mkRepo({ 'js/a.js': 'x' });   // lib/ css/ が無い
  assert.strictEqual(typeof buildHash(d), 'string');
  assert.strictEqual(buildHash(d).length, 8);
});

/* ═══ 貼り方（HTMLの書き換え） ═══ */

test('ローカルの js/lib/css に ?v= が付く', () => {
  const html = '<link rel="stylesheet" href="css/hub.css">\n'
    + '<script src="js/hub.js"></script>\n'
    + '<script src="lib/periods.js"></script>';
  const out = stampHtml(html, 'abc12345');
  assert.ok(out.includes('href="css/hub.css?v=abc12345"'), out);
  assert.ok(out.includes('src="js/hub.js?v=abc12345"'), out);
  assert.ok(out.includes('src="lib/periods.js?v=abc12345"'), out);
});

test('★外部CDNには付けない（バージョン固定URLを壊さない）', () => {
  const html = '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>\n'
    + '<link href="https://fonts.googleapis.com/css2?family=DM+Mono" rel="stylesheet">';
  assert.strictEqual(stampHtml(html, 'abc12345'), html);
});

test('★画像やmanifestには付けない（対象は js/lib/css だけ）', () => {
  const html = '<link rel="manifest" href="manifest.json">\n<link rel="icon" href="img/icon-192.png">';
  assert.strictEqual(stampHtml(html, 'abc12345'), html);
});

test('★古い ?v= は新しい値に貼り替わる（二重に付かない）', () => {
  const html = '<script src="js/hub.js?v=OLD"></script>';
  const out = stampHtml(html, 'new99999');
  assert.strictEqual(out, '<script src="js/hub.js?v=new99999"></script>');
  assert.strictEqual((out.match(/\?v=/g) || []).length, 1, '?v= が二重に付いている');
});

test('何度貼っても同じ結果（冪等）', () => {
  const html = '<script src="js/hub.js"></script>';
  const once = stampHtml(html, 'abc12345');
  assert.strictEqual(stampHtml(once, 'abc12345'), once);
});

/* ═══ 実リポジトリに対して（貼り忘れ検知が本当に効くか） ═══ */

test('★このリポジトリの全ローカルアセットが貼られている（=CIの--checkと同じ判定）', () => {
  const V = buildHash(ROOT);
  const htmls = fs.readdirSync(ROOT).filter(f => /\.html$/i.test(f)).sort();
  const stale = [];
  for (const f of htmls) {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (stampHtml(html, V) !== html) stale.push(f);
  }
  assert.deepStrictEqual(stale, [], '貼られていないHTML: ' + stale.join(', ') + '\n       → node scripts/stamp-build.mjs を実行して commit');
});

test('★index.html(入口) の全ローカルアセットに ?v= が付いている（1個も漏れていない）', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="((?:js|lib|css)\/[^"]+)"/g)].map(m => m[1]);
  assert.ok(refs.length >= 8, 'アセット参照が少なすぎる(検査が空振り): ' + refs.length);
  const noV = refs.filter(r => !/\?v=[0-9a-f]{8}$/.test(r));
  assert.deepStrictEqual(noV, [], '?v= が無い参照: ' + noV.join(', '));
});

/* ═══ HTMLに直接書いたスクリプトが壊れていないか ═══
 * ★2026-07-29 に本番で踏んだ: node -e 経由で自己更新チェックを埋め込んだ時にバックスラッシュが
 *   1段落ち、/\?v=/ が /?v=/ になって "Invalid regular expression: Nothing to repeat" が
 *   本番のコンソールに出た。インラインスクリプトは jsdom の UIテストの読み込み対象外なので、ここで見る。
 */
test('★index.html(入口) のインラインスクリプトが構文として通る(壊れた正規表現も捕まえる)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  inline.forEach((code, i) => {
    try { new Function(code); }                       // 構文エラー・不正な正規表現をここで捕まえる
    catch (e) { throw new Error('インラインscript[' + i + '] が壊れている: ' + e.message + '\n       ' + code.slice(0, 160)); }
  });
});

/* ═══ 撤去したものが表に出ていないか ═══
 * 2026-07-30: chat.html に「売っていない月額プラン」と撤去済みの看板が載っていたので中身を撤去した。
 * 同じものが戻ってこないよう見張る。
 */
// 2026-07-31: home.html / template.html のバッジも撤去したので、除外は無くなった＝全HTMLを検査する。
// 2026-08-01: 給与を kyuyo/ に統合し、旧5枚(kyuuryoumeisai/seikyusyo/mitsumoriyo/template/home)を削除。
//   直下だけ見ていると検査対象が3枚に減ってしまうので、kyuyo/ の配信HTMLも検査に含める（対象は増えている）。
test('★売っていない課金や撤去した看板が、どのHTMLにも残っていない（除外なし）', () => {
  const NG = [/¥1,280/, /1日43円/, /Excel専門AI/, /Excel上級者/, /14日間無料/];
  const files = fs.readdirSync(ROOT).filter(x => /\.html$/i.test(x));
  // 2026-08-17 Rakunally: 直下は index.html の1枚だけになったので、★アプリの中も両方 見る★
  //   （kyuyo/ だけ見ていると請求書が検査の外に落ちる＝2026-08-10 に seikyu/ を足した時と同じ穴）。
  for (const a of ['kyuyo', 'seikyu']) {
    const sub = path.join(ROOT, a);
    if (fs.existsSync(sub)) for (const f of fs.readdirSync(sub)) if (/\.html$/i.test(f)) files.push(a + '/' + f);
  }
  assert.ok(files.length >= 5, 'HTMLが少なすぎる(検査が空振り): ' + files.length);
  const bad = [];
  for (const f of files) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    NG.forEach(re => { if (re.test(s)) bad.push(f + ' に ' + re.source); });
  }
  assert.deepStrictEqual(bad, [], '売っていない課金/撤去した看板が残っている: ' + bad.join(' / '));
});

/* ═══ 実行 ═══ */
let ng = 0;
for (const t of T) {
  try { t.fn(); console.log('  ok   ' + t.name); }
  catch (e) { ng++; console.log('  NG   ' + t.name + '\n       ' + (e && e.message)); }
}
console.log('\nstamp: ' + (T.length - ng) + '/' + T.length + ' passed');
process.exit(ng ? 1 : 0);
