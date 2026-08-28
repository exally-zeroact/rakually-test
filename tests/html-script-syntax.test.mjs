/* html-script-syntax.test.mjs — ★HTMLの中のJSが 構文として通るか★
 *
 * ★なぜ要るのか（2026-08-12 ダイコメが実際に踏んだ）★
 *   daikou-seikyu.html の中の <script> に ★エスケープ落ちの構文エラー★ を作ってしまい、
 *   アプリが ★1行も動かない★状態になった（全ての関数が未定義）。
 *   それなのに ★lint も試験も緑のまま★だった:
 *     ・lint は HTML の中の <script> を見ない
 *     ・試験は HTML を ★文字として読む★だけで、実行しない
 *   気づいたのは 実ブラウザで動かした時（"Invalid or unexpected token"）。
 *   ＝★「lintと試験が緑」は、HTMLの中のJSが動く証拠にならない★
 *
 * ★この repo(rakually-test)での的（2026-08-17 実測）★
 *   HTML ＝ ★5枚★ / インラインの <script> を持つHTML ＝ ★4本★
 *     kyuyo/index.html 250B ／ kyuyo/meisai.html 250B ／ kyuyo/admin.html 144B ／
 *     seikyu/index.html 250B ／ index.html は0本（読み込む物だけ）
 *   ★2026-08-17 に的が変わった★: 一番大きい的だった book.html（199,606バイト）は
 *     Exally のブックなので Rakunally には持って来ていない。
 *     ＝「一番大きいブロックが10万バイト以上」という空振り検査は成り立たないので、
 *       ★HTML5枚・インライン4本・1本あたり100バイト以上★を数えて空振りを止める。
 *     （2026-07-29 に本番で踏んだ /?v=/ の落ちは ★250バイトの側★で起きている＝小さい方も的）
 *
 * ★見本（daikou-seikyu-test/tests/html-script-syntax.test.js 77行）との違い★
 *   見本は対象ファイルを ★ベタ書き★している＝★新しいHTMLがすり抜ける★。
 *   ここでは ★git が知っている *.html を全部 自分で拾う★。数え漏れを人の記憶に頼らない。
 *
 * ★何も見ていない緑を作らない★
 *   ・拾えたHTMLが0本なら赤 ／ 取り出せた <script> が0本なら赤
 *   ・いちばん大きいブロックが小さすぎたら赤（本体を拾えていない＝空振り）
 *
 * 使い方: node tests/html-script-syntax.test.mjs
 *         node tests/html-script-syntax.test.mjs --self-test
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ── 取り出す ────────────────────────────────────────────────────
   src= が付いている物は別ファイル＝ここでは見ない（中身がHTMLに無い）。
   開始行も返す＝赤くなった時に「何行目の <script>」まで言えるようにする。 */
export function inlineScripts(html) {
  const out = [];
  const RE = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = RE.exec(html))) {
    const attrs = m[1] || '';
    // JSON-LD やテンプレートは JavaScript ではないので構文で見ない
    const type = (/\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs) || [])[1] || '';
    const isJs = !type || /^(text\/javascript|application\/javascript|module)$/i.test(type);
    out.push({
      code: m[2], attrs: attrs.trim(), type: type,
      isJs: isJs, isModule: /^module$/i.test(type),
      line: html.slice(0, m.index).split('\n').length,
    });
  }
  return out;
}

/* ── 構文だけ見る（実行はしない） ──────────────────────────────
   ★new Function ではなく vm.Script★＝「関数の中身」ではなく ★素のスクリプト★として解く。
   new Function だと、外に出したままの return が通ってしまう（本物のブラウザでは構文エラー）。
   通れば null、駄目なら理由。 */
export function syntaxError(code, opts) {
  const isModule = !!(opts && opts.module);
  try {
    if (isModule) new vm.SourceTextModule(code);   // Node の実験機能。使えなければ下で拾う
    else new vm.Script(code);
    return null;
  } catch (e) {
    // SourceTextModule が使えない環境では、せめて素のスクリプトとして見る（見ないよりよい）
    if (isModule && /SourceTextModule|experimental|not a constructor/i.test(String(e && e.message))) {
      try { new vm.Script(code); return null; } catch (e2) { return e2.message; }
    }
    return e.message;
  }
}

/* git が知っている HTML を全部（人の記憶で並べない） */
function trackedHtml() {
  const out = execFileSync('git', ['ls-files', '*.html'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };

/* ── self-test：わざと壊して赤になるかを先に見せる ───────────────── */
if (process.argv.includes('--self-test')) {
  console.log('\n[html-script-syntax --self-test] わざと壊して赤になるか');
  let sp = 0, sf = 0;
  const S = (n, fn) => { try { fn(); sp++; console.log('  ✓ ' + n); } catch (e) { sf++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };

  S('★通る物を弾いていない（弾いていたら、この見張りは何も守れない）', () => {
    if (syntaxError('var a = 1; function f(){ return a; }')) throw new Error('正しいJSを弾いた');
    if (syntaxError('const x = `a${1}b`; class C { #p = 1; }')) throw new Error('今どきの書き方を弾いた');
  });

  S('★実際に踏んだ形（エスケープ落ちで引用符が閉じない）を弾く', () => {
    if (!syntaxError('var s = \'" onclick="f(\'\' + x;')) throw new Error('壊れた物を通している');
  });

  S('★カッコが閉じない・予約語の誤用を弾く', () => {
    if (!syntaxError('function f( {')) throw new Error('壊れた物を通している');
    if (!syntaxError('if (a) { var 1x = 2; }')) throw new Error('壊れた物を通している');
  });

  S('★外に出たままの return を弾く（new Function だと通ってしまう形）', () => {
    if (!syntaxError('return 1;')) throw new Error('素のスクリプトとして見ていない（new Function になっている）');
  });

  S('★<script> を取り出せている（0本を返す作りなら、この見張りは空振り）', () => {
    const ss = inlineScripts('<html><script>var a=1;</script><script src="x.js"></script><script>var b=2;</script></html>');
    if (ss.length !== 2) throw new Error('src= 付きを除いて2本のはずが ' + ss.length + '本');
    if (ss[0].code !== 'var a=1;') throw new Error('中身が取れていない');
  });

  S('★JSON-LD など JavaScript でない <script> は構文で見ない', () => {
    const ss = inlineScripts('<script type="application/ld+json">{"a":1}</script>');
    if (ss[0].isJs) throw new Error('JSでない物をJSとして見ている');
  });

  S('★本物のHTMLを1本 わざと壊すと赤になる（紙の上だけの検査にしない）', () => {
    const raw = fs.readFileSync(path.join(ROOT, 'seikyu/index.html'), 'utf8');
    const broken = raw.replace(/<script>/, '<script>var s = \'" onclick="f(\'\' + x;');
    if (broken === raw) throw new Error('壊せていない＝この自己確認が空振り');
    const bad = inlineScripts(broken).filter((s) => s.isJs && syntaxError(s.code, { module: s.isModule }));
    if (!bad.length) throw new Error('★壊した物を通した★');
  });

  console.log('\n[self-test] ' + sp + ' passed, ' + sf + ' failed');
  if (sf) process.exit(1);
}

/* ── 本体 ──────────────────────────────────────────────────────── */
console.log('\n[HTMLの中のJS 構文チェック]');

const FILES = trackedHtml();
const found = [];
for (const f of FILES) {
  const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const ss = inlineScripts(html).filter((s) => s.isJs);
  if (ss.length) found.push({ file: f, scripts: ss });
}

T('★git が知っているHTMLを拾えている（0本なら何も見ていない）', () => {
  ok(FILES.length > 0, 'git ls-files が0本を返した');
  /* ★配信する5枚が1枚も欠けていないか★（1枚 落ちたら そのHTMLは見張りの外に居る） */
  for (const need of ['index.html', 'kyuyo/index.html', 'kyuyo/admin.html', 'kyuyo/meisai.html', 'seikyu/index.html']) {
    ok(FILES.indexOf(need) >= 0, need + ' を拾えていない');
  }
  console.log('     拾ったHTML: ' + FILES.length + '本');
});

T('★インラインの <script> を取り出せている（0本なら空振り）', () => {
  ok(found.length > 0, 'インラインの script を持つHTMLが1本も見つからない');
  const total = found.reduce((a, x) => a + x.scripts.length, 0);
  ok(total > 0, '<script> が1本も取れていない');
  /* ★2026-08-17 に的が変わった★ 一番大きい的（book.html 199,606バイト）は Exally の物なので
     Rakunally には無い。代わりに ★本数と1本あたりの大きさ★ で空振りを止める。
     実測: kyuyo/index.html 250B ／ kyuyo/meisai.html 250B ／ seikyu/index.html 250B ／ kyuyo/admin.html 144B */
  ok(total >= 4, 'インラインの <script> が ' + total + '本＝取り出せていない（実測4本）');
  const smallest = Math.min(...found.flatMap((x) => x.scripts.map((s) => s.code.length)));
  ok(smallest >= 100, '★いちばん小さいブロックが ' + smallest + 'バイト＝中身を取れていない（空振り）★');
  console.log('     ' + found.map((x) => x.file + '(' + x.scripts.length + '本/'
    + x.scripts.reduce((a, s) => a + s.code.length, 0) + 'B)').join(' / '));
});

T('★どのHTMLの中のJSも 構文として通る★', () => {
  const bad = [];
  for (const { file, scripts } of found) {
    for (const s of scripts) {
      const err = syntaxError(s.code, { module: s.isModule });
      if (err) bad.push(file + ' の ' + s.line + '行目からの <script>: ' + err);
    }
  }
  ok(bad.length === 0, '★HTMLの中のJSが構文エラー★\n       ' + bad.join('\n       '));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
