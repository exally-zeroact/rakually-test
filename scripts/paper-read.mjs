/* paper-read.mjs — ★出た紙(PDF)を「2通り」で読む★（1通りだと道具が嘘をつく）
 *
 * ★なぜ2通りか（2026-08-18 実際に踏んだ・測る道具が嘘をついた6回目）★
 *   請求書の紙を本当に印刷して出した PDF を `pdftotext -layout` で読んだら
 *   ★日本語が1文字も返ってこなかった★。そのまま信じれば「紙が白紙」と報告する所だった。
 *   別の読み方（pypdf）では ★字が ちゃんと入っていた★し、
 *   Chrome で PDF を開いた絵にも全部 出ていた。
 *   ＝★1つの道具の「0件」を「無い」と読まない★。だから ここでは必ず2通りで読む。
 *
 * 読み方①  pypdf（python）… 字を取り出す。★取り出せた字数を必ず出す★
 * 読み方②  中身の数え上げ … PDFの中の「文字を置く命令(Tj/TJ)」の数を数える。
 *            字が1つも置かれていなければ ★本当に白紙★。①が0でも②が多ければ「①の道具が嘘」。
 *
 * 使い方: node scripts/paper-read.mjs <紙.pdf> [出力.txt]
 *   ・出力.txt を渡すと ★UTF-8で★ 書き出す（Windowsのコンソールは cp932 で化けるので通さない）
 *   ・①と②が食い違ったら ★赤（exit 1）★＝「どちらかの道具が嘘をついている」と分かる形にする
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const pdf = process.argv[2];
const out = process.argv[3];
if (!pdf) { console.error('使い方: node scripts/paper-read.mjs <紙.pdf> [出力.txt]'); process.exit(2); }
if (!fs.existsSync(pdf)) { console.error('その紙が無い: ' + pdf); process.exit(2); }

/* ── 読み方② 中身の「文字を置く命令」を数える（外の道具に頼らない） ── */
function drawOps(file) {
  const buf = fs.readFileSync(file);
  const s = buf.toString('latin1');
  let i = 0, ops = 0, streams = 0, opened = 0;
  while ((i = s.indexOf('stream', i)) >= 0) {
    /* ★"endstream" を「流れの始まり」と読み間違えない★
       （最初これで 363個を0個と数えて「白紙」と言いかけた＝道具が嘘をつく形そのもの） */
    if (s.slice(i - 3, i) === 'end') { i += 6; continue; }
    let st = i + 6;
    if (s[st] === '\r') st++;
    if (s[st] === '\n') st++;
    const en = s.indexOf('endstream', st);
    if (en < 0) break;
    streams++;
    let t;
    try { t = zlib.inflateSync(buf.subarray(st, en)).toString('latin1'); opened++; }
    catch { t = buf.subarray(st, en).toString('latin1'); }
    ops += (t.match(/\bTj\b|\bTJ\b/g) || []).length;
    i = en + 9;
  }
  return { ops, streams, opened };
}

/* ── 読み方① pypdf で字を取り出す ── */
function pypdfText(file) {
  const tmp = path.join(os.tmpdir(), 'paper-read-' + path.basename(file) + '.txt');
  const py = path.join(os.tmpdir(), 'paper-read.py');
  fs.writeFileSync(py, [
    'import sys, pypdf',
    'r = pypdf.PdfReader(sys.argv[1])',
    'o = []',
    'for i, p in enumerate(r.pages):',
    "    o.append(f'===== page {i+1} / {len(r.pages)} =====')",
    "    o.append(p.extract_text() or '(0字)')",
    "open(sys.argv[2], 'w', encoding='utf-8').write('\\n'.join(o))",
    'print(len(r.pages))',
  ].join('\n'));
  const pages = Number(execFileSync('python', [py, file, tmp], { encoding: 'utf8' }).trim());
  return { pages, text: fs.readFileSync(tmp, 'utf8') };
}

const b = drawOps(pdf);
let a;
try { a = pypdfText(pdf); }
catch (e) { console.error('★読み方①(pypdf)が動かない★ ' + (e && e.message) + '\n  → pip install pypdf'); process.exit(2); }

const chars = a.text.replace(/=====[^\n]*\n?/g, '').replace(/\s/g, '').length;
console.log('\n[paper-read] ' + path.basename(pdf));
console.log('  読み方① pypdf     … ' + a.pages + 'ページ / 字 ' + chars + '文字');
console.log('  読み方② 置く命令   … ' + b.ops + '個（流れ ' + b.streams + '本・うち解けた ' + b.opened + '本）');
if (out) { fs.writeFileSync(out, a.text); console.log('  字を書き出した → ' + out + '（UTF-8）'); }

if (b.ops === 0 && chars === 0) {
  console.log('\n★2通りとも0＝本当に白紙★（紙を作る所を疑う）');
  process.exit(1);
}
if (chars === 0 || b.ops === 0) {
  console.log('\n★食い違い＝どちらかの道具が嘘をついている★（①' + chars + '文字 / ②' + b.ops + '個）'
    + '\n  → 絵にして目で見るまで「白紙」と言わない');
  process.exit(1);
}
console.log('\n★2通りとも「字が在る」で一致★（この後は 出た字を1行ずつ足す）');
