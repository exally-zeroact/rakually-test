/* make-icons.mjs — ★渡された1枚のロゴから、アイコンを機械で作る★（描き直さない）
 *
 * なぜ この形か（司さん 2026-08-18「ホーム画面のアイコンを差し替える」）:
 *   ・★描き直すな・作り直すな★＝渡された1枚（docs/logo/rakunally-logo.png）から
 *     ★切り出して・縮めて・置くだけ★。色も形も1ドットも作らない。
 *   ・その1枚は 1024x1024。★実測★（-fuzz 8% -trim で機械が測った）:
 *       マーク（角丸の枠＋RA＋チェック） = 408x291 の箱 @ (312,239)
 *       下の文字「Rakunally」            = 497x127 の箱 @ (260,579)
 *     ★アイコンにはマークだけ使う★（192pxに文字を入れると読めない＝入れない方が正しい）。
 *   ・色は元のまま。使われている緑は ★#2E7D54（全アプリの緑）★ と #4FA77D（チェック）。
 *
 * ★Androidは丸く切る（maskable）★
 *   決まりの安全な範囲＝中央 80%（直径 0.8*512 = 409.6 ＝ 半径 204.8）の円の中。
 *   マークの縦横比 408/291 = 1.402 なので、その円に内接する最大は 333x238（＝最遠 204.8 ぴったり）。
 *   ★決まりぴったりでは足りない（2026-08-18 指示役の実測）★
 *     最初は 330x235（最遠 202.6）で作った＝★余白が 3px（1.5%）しか無い★。
 *     Android の端末は launcher ごとに切り方が違い、★丸より少し内側で切る物が在る★ので、
 *     1.5%は「机の上では緑・実機で欠ける」に一番なりやすい幅だった。
 *   → ★1割 内側に締めて 296x211（最遠 181.8）★＝合格線 190 に対して 8px の余裕。
 *   ※ icon-192 / icon-512（purpose="any"）が この円をはみ出すのは ★正しい★
 *     （any は丸く切られない。ここを締めると ただ絵が小さくなるだけ）。
 *
 * ★iOSは manifest を見ない★ … HTMLの <link rel="apple-touch-icon"> が要る。
 * ★iOSは透明を黒く塗る／自分で角を丸める★ … だから ★背景は白で塗りつぶす（透明にしない）★。
 *
 * 使い方: node scripts/make-icons.mjs          … 作り直す（ImageMagick が要る）
 *         node scripts/make-icons.mjs --check  … 今の物と同じ物が作れるか（sha で突き合わせ）
 * ※ CI では走らせない（ImageMagick はランナーに無い）。
 *   代わりに ★tests/own-name.test.mjs★ が「寸法・不透明・?v=が中身のSHAと一致」を毎回見る。
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'docs/logo/rakunally-logo.png');
/** マークの箱（実測・上の説明の通り） */
export const MARK = { w: 408, h: 291, x: 312, y: 239 };

/** 作る物。w = マークを何ドット幅に縮めるか（高さは比で決まる） */
export const ICONS = [
  { file: 'img/icon-512.png', size: 512, w: 399, why: 'PWA 512（中身の 78%）' },
  { file: 'img/icon-192.png', size: 192, w: 150, why: 'PWA 192（中身の 78%）' },
  { file: 'img/icon-512-maskable.png', size: 512, w: 296, why: '★Androidが丸く切っても欠けない（円の内側にさらに1割の余白）' },
  { file: 'img/apple-touch-icon-180.png', size: 180, w: 140, why: '★iOSはmanifestを見ない＝HTMLのlinkで渡す' },
  { file: 'img/favicon-32.png', size: 32, w: 29, why: 'タブの絵（32）' },
  { file: 'img/favicon-16.png', size: 16, w: 15, why: 'タブの絵（16）' },
];

/** 給与のWeb明細（従業員が入れる方）の「給」＝HTMLの中のSVGをそのままPNGに焼く。
 *  ★iOSは apple-touch-icon に SVG を使えない★（今まで焼いていなかったので実機で絵が出ない）。
 *  ★描き直していない★＝kyuyo/meisai.html に元から在るSVGの文字列を、そのまま渡している。 */
export const MEISAI_SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'>"
  + "<rect width='180' height='180' rx='40' fill='#3D9E72'/>"
  + "<text x='90' y='122' font-size='96' font-family='sans-serif' fill='white' text-anchor='middle'>給</text></svg>";

export const sha8 = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);

function magick(args) {
  return execFileSync('magick', args, { maxBuffer: 1024 * 1024 * 64 });
}

function build(outAbs, spec) {
  magick([
    SRC,
    '-crop', `${MARK.w}x${MARK.h}+${MARK.x}+${MARK.y}`, '+repage',
    '-filter', 'Lanczos', '-resize', `${spec.w}x`,
    '-background', 'white', '-gravity', 'center', '-extent', `${spec.size}x${spec.size}`,
    '-strip', '-define', 'png:color-type=2',        // 透明を持たない＝iOSが黒く塗らない
    outAbs,
  ]);
}

const check = process.argv.includes('--check');
if (!fs.existsSync(SRC)) { console.error('元の1枚が無い: ' + SRC); process.exit(1); }

let ng = 0;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'icons-'));
for (const spec of ICONS) {
  const out = path.join(check ? tmp : ROOT, path.basename(spec.file));
  build(out, spec);
  const made = fs.readFileSync(out);
  if (check) {
    const now = fs.readFileSync(path.join(ROOT, spec.file));
    const same = Buffer.compare(made, now) === 0;
    if (!same) ng++;
    console.log((same ? '  ✓ ' : '  ✗ ') + spec.file + '  ' + spec.size + 'px / マーク幅 ' + spec.w
      + ' / ' + made.length + 'B / sha ' + sha8(made) + (same ? '' : '  ★今 置いてある物と違う（sha ' + sha8(now) + '）'));
  } else {
    fs.mkdirSync(path.dirname(path.join(ROOT, spec.file)), { recursive: true });
    fs.renameSync(out, path.join(ROOT, spec.file));
    console.log('  ' + spec.file + '  ' + spec.size + 'px / マーク幅 ' + spec.w + ' / '
      + made.length + 'B / sha ' + sha8(made) + '   … ' + spec.why);
  }
}

/* Web明細の「給」（SVG → PNG 180） */
{
  const svgPath = path.join(tmp, 'meisai.svg');
  fs.writeFileSync(svgPath, MEISAI_SVG);
  const out = path.join(check ? tmp : ROOT, 'meisai-180.png');
  magick([svgPath, '-background', 'none', '-resize', '180x180', '-flatten',
    '-strip', '-define', 'png:color-type=2', out]);
  const made = fs.readFileSync(out);
  const dest = path.join(ROOT, 'kyuyo/img/meisai-180.png');
  if (check) {
    const same = fs.existsSync(dest) && Buffer.compare(made, fs.readFileSync(dest)) === 0;
    if (!same) ng++;
    console.log((same ? '  ✓ ' : '  ✗ ') + 'kyuyo/img/meisai-180.png  180px / ' + made.length + 'B / sha ' + sha8(made));
  } else {
    fs.renameSync(out, dest);
    console.log('  kyuyo/img/meisai-180.png  180px / ' + made.length + 'B / sha ' + sha8(made)
      + '   … ★iOSはSVGのapple-touch-iconを読まない（今まで絵が出ていなかった）');
  }
}

/* 管理（「管」）の maskable ＝ 元の絵を縮めて中央に置くだけ（描き直さない） */
{
  /* ★元の絵は「管」が中央から下に31pxズレている★（実測: 中身 273x277 @ (118,133)＝上133/下102）。
     そのまま縮めるとズレたまま丸く切られるので、★中身を切り出してから中央に置く★（動かすだけ・描き直さない）。
     大きさは ★258★（実測 中身 ≒258x262＝最遠 183.9）＝合格線 190 に対して6pxの余裕。
     ★最初は 280（最遠 197＝余白8px）で作ったが、上の理由で1割 締めた（2026-08-18）。 */
  const src = path.join(ROOT, 'kyuyo/img/admin-512.png');
  const out = path.join(check ? tmp : ROOT, 'admin-512-maskable.png');
  magick([src, '-fuzz', '6%', '-trim', '+repage', '-filter', 'Lanczos', '-resize', '258x258',
    '-background', '#F0FAF4', '-gravity', 'center', '-extent', '512x512',
    '-strip', '-define', 'png:color-type=2', out]);
  const made = fs.readFileSync(out);
  const dest = path.join(ROOT, 'kyuyo/img/admin-512-maskable.png');
  if (check) {
    const same = fs.existsSync(dest) && Buffer.compare(made, fs.readFileSync(dest)) === 0;
    if (!same) ng++;
    console.log((same ? '  ✓ ' : '  ✗ ') + 'kyuyo/img/admin-512-maskable.png  512px / ' + made.length + 'B / sha ' + sha8(made));
  } else {
    fs.renameSync(out, dest);
    console.log('  kyuyo/img/admin-512-maskable.png  512px / ' + made.length + 'B / sha ' + sha8(made)
      + '   … ★丸く切られても「管」が欠けない（丸より内側で切る端末に備えて 258px・中身を切り出して中央に置いた）');
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
if (check) {
  console.log(ng ? '\n★' + ng + '本が「今 置いてある物」と違う★（node scripts/make-icons.mjs で作り直す）'
    : '\n★全部 同じ物が作れた（元の1枚から機械で作られている）★');
  process.exit(ng ? 1 : 0);
}
console.log('\n★作った。次に node scripts/icon-stamp.mjs で ?v=<中身のSHA> を貼る★');
