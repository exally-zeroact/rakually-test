/* ios-unsupported.test.mjs — ★iPhoneで動かない書き方を、配信物に持ち込ませない★
 *
 * なぜ必要か（2026-08-04・司さんの実機で判明）:
 *   ① 落としたExcelが ★iPhoneで開けなかった★。端末の問題ではなく、
 *      Blob の種類が application/octet-stream（＝種類の分からないデータ）だったため。
 *      iPhone は種類を見てアプリと紐づけるので、Excelが入っていても開けない。
 *   ② 対象月が選べなかった。<input type="month"> は ★iOS Safari が持っていない★ から。
 *   ★どちらも「PCでしか見ていなかった」1つの原因から出ている。★
 *   人の注意力ではなく、ここで機械が止める。
 *
 * 見るもの（配信される .html / .js）:
 *   A. type="month" / "week" / "datetime-local" … iOS Safari が持っていない入力
 *   B. 'application/octet-stream'               … 種類の分からないデータとして落とす書き方
 *   C. XLSX.writeFile(                          … 種類を付けられない書き出し（Bと同じ結果になる）
 *   D. new Blob(                                … ファイルの渡し口は js/file-out.js の1本だけ
 *   ★例外は理由と戻す条件つきで EXCEPTIONS に書く（黙って増やさない）
 *
 * 使い方: node tests/ios-unsupported.test.mjs
 *         node tests/ios-unsupported.test.mjs --self-test   ← わざと使って赤になるか
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };

/* 配信されないディレクトリ（テスト・道具・設計書）は見ない */
const SKIP_DIRS = new Set(['node_modules', '.git', 'tests', 'tools', 'scripts', 'docs', 'supabase', '.github', 'tmp']);

/* ★例外（理由と戻す条件が必須） */
const EXCEPTIONS = {
  'js/file-out.js': {
    rules: ['blob', 'octet'],
    reason: '★ファイルの渡し口そのもの。ここだけが Blob を作ってよい（種類を拡張子から必ず決める）。'
      + 'octet-stream の文字列は「既定にしない」と書いたコメントに出てくるだけで、値としては使っていない。',
    restoreWhen: '渡し口を別の作りに替える時（その時はこの例外も消す）。',
  },
  'lib/xlsx.full.min.js': {
    rules: ['blob', 'writeFile', 'octet'],
    reason: 'SheetJS本体（外部ライブラリ・同梱）。中で writeFile / Blob を持っているのは当然で、'
      + 'うちが呼ばなければ通らない。★呼ばないことは下の C/D の検査が守る。',
    restoreWhen: 'ライブラリを差し替える時。',
  },
  /* ★lib/xlsx-io.js の例外は 2026-08-17 に消した★
     ＝グリッド(book.html)の書き出し部品なので Rakunally には持って来ていない。
       ★持っていない物の例外を残すと、例外表が腐ったまま緑になる★（この検査自身が実在を見ている）。
     戻す条件＝Rakunally に表(ブック)を置く日に、部品と一緒にこの例外も戻す。 */
};

/* コメントを落とす（実際に動くコードだけ見る）。
   落とさないと、この作りを説明したコメント（「type="month" は使わない」等）まで拾って
   ★空振りの赤★になる。赤が空振りすると、人は赤を見なくなる。 */
export function stripComments(src) {
  return String(src)
    .replace(/<!--[\s\S]*?-->/g, ' ')          // HTMLのコメント
    .replace(/\/\*[\s\S]*?\*\//g, ' ')          // /* … */
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');       // // …（http:// は残す）
}

/* ★純関数: ファイル(path→中身)から違反を返す。self-test で作り物を通せる。 */
export function findViolations(files) {
  const out = { iosInput: [], octet: [], writeFile: [], blob: [] };
  const allowed = (rel, rule) => {
    const e = EXCEPTIONS[rel];
    return !!(e && e.rules.indexOf(rule) >= 0);
  };
  for (const [rel, raw] of Object.entries(files)) {
    const src = stripComments(raw);
    const m = src.match(/type\s*=\s*"(month|week|datetime-local)"/g);
    if (m && !allowed(rel, 'iosInput')) m.forEach(x => out.iosInput.push({ file: rel, what: x }));
    if (/application\/octet-stream/.test(src) && !allowed(rel, 'octet')) out.octet.push({ file: rel });
    if (/XLSX\s*\.\s*writeFile\s*\(/.test(src) && !allowed(rel, 'writeFile')) out.writeFile.push({ file: rel });
    if (/new\s+Blob\s*\(/.test(src) && !allowed(rel, 'blob')) out.blob.push({ file: rel });
  }
  return out;
}
const total = (v) => v.iosInput.length + v.octet.length + v.writeFile.length + v.blob.length;

/* ══ self-test ═══════════════════════════════════════════════════════ */
if (process.argv.includes('--self-test')) {
  console.log('\n[ios-unsupported --self-test] わざと使って赤になるか');
  const Q = '"';
  T('★type="month" を使ったら赤', () => {
    const v = findViolations({ 'kyuyo/index.html': '<input type=' + Q + 'month' + Q + '>' });
    if (v.iosInput.length !== 1) throw new Error('赤になっていない');
  });
  T('★type="datetime-local" も赤', () => {
    const v = findViolations({ 'a.html': '<input type=' + Q + 'datetime-local' + Q + '>' });
    if (v.iosInput.length !== 1) throw new Error('赤になっていない');
  });
  T('type="hidden" は赤にしない（誤検知を出さない）', () => {
    const v = findViolations({ 'a.html': '<input type=' + Q + 'hidden' + Q + ' data-ym>' });
    if (total(v)) throw new Error('誤検知: ' + JSON.stringify(v));
  });
  T('★octet-stream で落としたら赤', () => {
    const v = findViolations({ 'kyuyo/js/x.js': "new Blob([b],{type:'application/octet-stream'})" });
    if (!v.octet.length) throw new Error('赤になっていない');
  });
  T('★XLSX.writeFile を呼んだら赤', () => {
    const v = findViolations({ 'kyuyo/lib/x.js': 'XLSX.writeFile(wb, name);' });
    if (!v.writeFile.length) throw new Error('赤になっていない');
  });
  T('★渡し口の外で Blob を作ったら赤', () => {
    const v = findViolations({ 'kyuyo/js/x.js': 'var b = new Blob([x]);' });
    if (!v.blob.length) throw new Error('赤になっていない');
  });
  T('渡し口(js/file-out.js)自身は赤にしない（例外・理由つき）', () => {
    const v = findViolations({ 'js/file-out.js': 'new Blob([data], { type: mime })' });
    if (total(v)) throw new Error('例外が効いていない: ' + JSON.stringify(v));
  });
  T('例外表の各項目に理由と戻す条件がある', () => {
    for (const [k, e] of Object.entries(EXCEPTIONS)) {
      if (!e.reason || e.reason.length < 20) throw new Error(k + ': 理由が不十分');
      if (!e.restoreWhen) throw new Error(k + ': 戻す条件が無い');
      if (!fs.existsSync(path.join(ROOT, k))) throw new Error(k + ': 例外表にあるがファイルが無い');
    }
  });
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

/* ══ 本番（実物を見る） ═══════════════════════════════════════════════ */
function walk(rel, out = []) {
  for (const name of fs.readdirSync(path.join(ROOT, rel || '.'))) {
    if (SKIP_DIRS.has(name)) continue;
    const r = rel ? rel + '/' + name : name;
    if (fs.statSync(path.join(ROOT, r)).isDirectory()) walk(r, out);
    else if (/\.(html|js)$/i.test(name)) out.push(r);
  }
  return out;
}
const shipped = walk('');
const files = {};
for (const r of shipped) files[r] = fs.readFileSync(path.join(ROOT, r), 'utf8');
const v = findViolations(files);

console.log('\n[ios-unsupported] iPhoneで動かない書き方が配信物に無いか');

T('★A. iOS Safari が持っていない入力(type=month/week/datetime-local)を使っていない', () => {
  if (v.iosInput.length) throw new Error('使っています:\n' + v.iosInput.map(x => '   - ' + x.file + '  ' + x.what).join('\n')
    + '\n   → iOSでは ただの文字入力になって選べません。js/ym-picker.js（年・月のselect）を使ってください。');
});

T('★B. application/octet-stream で落としていない（iPhoneがアプリと紐づけられない）', () => {
  if (v.octet.length) throw new Error('使っています: ' + v.octet.map(x => x.file).join(', ')
    + '\n   → 拡張子から種類を決める js/file-out.js を通してください。');
});

T('★C. XLSX.writeFile を呼んでいない（種類を付けられない書き出し）', () => {
  if (v.writeFile.length) throw new Error('呼んでいます: ' + v.writeFile.map(x => x.file).join(', ')
    + '\n   → XLSX.write(wb,{type:"array"}) で中身だけ作り、js/file-out.js に渡してください。');
});

T('★D. ファイルの渡し口が1本だけ（他の場所で Blob を作っていない）', () => {
  if (v.blob.length) throw new Error('渡し口の外で Blob を作っています: ' + v.blob.map(x => x.file).join(', ')
    + '\n   → 分岐(共有シート/ダウンロード)が2箇所に増えると、片方だけiPhoneで壊れます。');
});

T('検査が空振りしていない（配信物を実際に読めている）', () => {
  if (shipped.length < 10) throw new Error('走査できた配信物が少なすぎます: ' + shipped.length);
  if (!files['js/file-out.js']) throw new Error('渡し口(js/file-out.js)が見つかりません');
});

console.log('\n── 実測 ──');
console.log('  配信物: ' + shipped.length + '本（.html/.js）/ 違反 ' + total(v) + '件 / 例外(理由つき) ' + Object.keys(EXCEPTIONS).length + '件');


console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
