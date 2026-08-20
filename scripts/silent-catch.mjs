/* silent-catch.mjs — ★黙って消える所を数える★（合計・金額を作る所だけ取り出す）
 * =============================================================================
 * なぜ要るか（指示役 2026-08-21／前科）:
 *   ★#ERROR より「合計が黙って小さくなる」方が怖い★。
 *   527,000 が 186,000 になった型＝★読めなかった物を 0 にして そのまま足した★。
 *   だから「何もしない catch」を ★お金を作る所★に絞って数え、
 *   ★①0を返す ②空を返す ③そのまま進む★ に分ける。★①を先に潰す★。
 *
 * 使い方:
 *   node scripts/silent-catch.mjs            … 数えて出す
 *   node scripts/silent-catch.mjs --list     … 1件ずつ出す
 *   node scripts/silent-catch.mjs --check    … ★お金の所で「0を返す」が0件か★（1件でも赤）
 *   node scripts/silent-catch.mjs --self-test … わざと1件 戻したら赤になるか
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

/* 見るファイル（客のお金を作る所） */
const FILES = [
  'kyuyo/js/app.js', 'kyuyo/js/store.js',
  'kyuyo/lib/payroll-monthly.js', 'kyuyo/lib/payroll-core.js',
  'seikyu/js/seikyu-app.js', 'seikyu/lib/seikyu-tax.js', 'seikyu/lib/seikyu-doc.js',
].filter((f) => fs.existsSync(path.join(ROOT, f)));

/* お金・合計を作る所の目印（この字が 近くに在れば「お金の所」） */
const MONEY = /合計|金額|支給|控除|税|賃金|給与|net\b|total|Total|amount|yen|kingaku|shikyu|kojo|grandTotal|subtotal/;

/* catch の中身を取り出す（釣り合った } まで） */
function catches(src) {
  const out = [];
  const rx = /catch\s*\(([^)]*)\)\s*\{/g;
  let m;
  while ((m = rx.exec(src))) {
    let i = m.index + m[0].length, depth = 1;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      i++;
    }
    out.push({ at: m.index, body: src.slice(m.index + m[0].length, i - 1), end: i });
  }
  return out;
}

/* その catch を囲んでいる関数の名前（いちばん近い function 宣言） */
function ownerOf(src, at) {
  const head = src.slice(0, at);
  const m = [...head.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].pop();
  return m ? m[1] : '(名前なし)';
}

const rows = [];
for (const f of FILES) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const c of catches(src)) {
    const body = c.body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').trim();
    /* 近く（前後）にお金の言葉が在るか＝この catch は お金を作る所か */
    const around = src.slice(Math.max(0, c.at - 700), c.end + 200);
    const isMoney = MONEY.test(around);
    let kind;
    if (/return\s*(0|Number\(0\)|\{\s*\}\s*)?;?\s*$/.test(body) && /return\s*0\b/.test(body)) kind = '①0を返す';
    else if (/return\s*(\[\s*\]|\{\s*\}|''|""|null|undefined)\s*;?/.test(body)) kind = '②空を返す';
    else if (!body) kind = '③そのまま進む';
    else if (/console\.|throw|msg\(|box\(|setText\(|alert\(/.test(body)) kind = '④知らせている';
    else kind = '③そのまま進む';
    rows.push({ file: f, line: src.slice(0, c.at).split('\n').length, owner: ownerOf(src, c.at), money: isMoney, kind, body: body.slice(0, 60) });
  }
}

const money = rows.filter((r) => r.money);
const byKind = {};
money.forEach((r) => { byKind[r.kind] = (byKind[r.kind] || 0) + 1; });
const zero = money.filter((r) => r.kind === '①0を返す');

if (process.argv.includes('--list')) {
  console.log('\n[お金を作る所の catch] ' + money.length + '件');
  money.forEach((r) => console.log('  ' + r.kind + '  ' + r.file + ':' + r.line + '  ' + r.owner + '  「' + r.body + '」'));
} else {
  console.log('\n[黙って消える所を数える]');
  console.log('  見たファイル ' + FILES.length + '本 ／ catch ぜんぶ ' + rows.length + '件');
  console.log('  ★お金・合計を作る所の catch ' + money.length + '件★');
  ['①0を返す', '②空を返す', '③そのまま進む', '④知らせている'].forEach((k) => {
    console.log('    ' + k + ' … ' + (byKind[k] || 0) + '件');
  });
  if (zero.length) {
    console.log('\n  ★①0を返す（一番 危ない）★');
    zero.forEach((r) => console.log('    ' + r.file + ':' + r.line + '  ' + r.owner));
  }
}

if (process.argv.includes('--self-test')) {
  /* わざと「0を返す catch」を1件 足したら 見つけられるか（ファイルは触らない） */
  const fake = 'function goukeiWo(){ var total=0; try{ total=x(); }catch(e){ return 0; } return total; }';
  const c = catches(fake)[0];
  const body = c.body.trim();
  const isZero = /return\s*0\b/.test(body);
  const isMoney = MONEY.test(fake);
  console.log('\n★自己確認★ わざと「合計の所で0を返す catch」を作ると … '
    + (isZero && isMoney ? '★見つけられる★' : '★見つけられない（見張りが効いていない）★'));
  if (!(isZero && isMoney)) process.exit(1);
  process.exit(0);
}

if (process.argv.includes('--check')) {
  if (zero.length) {
    console.error('\n★お金を作る所で「黙って0を返す」catch が ' + zero.length + '件★');
    console.error('  0にして進むと ★合計が黙って小さくなる★（527,000 が 186,000 になった型）。');
    console.error('  「分かりません」と出すか、止めてください。');
    process.exit(1);
  }
  console.log('\n  お金を作る所で「黙って0を返す」catch は 0件。緑。');
}
