/* icon-stamp.mjs — ★アイコンの参照に ?v=<そのファイルの中身のSHA> を貼る★
 *
 * なぜ要るか:
 *   ★アイコンを差し替えても、端末は古い絵を持ち続ける★（ホーム画面に入れた人は特に長い）。
 *   JS/CSS は scripts/stamp-build.mjs が ?v= を貼っているが、
 *   ★あれは画像に貼らない★（「対象は js/lib/css だけ」と tests/stamp.test.mjs が固定している）。
 *   ＝画像には ★画像ごとの中身のSHA★ を貼る。全体ハッシュではなく1本ずつなので、
 *     JSを直しただけでアイコンの版が動く（＝無駄な取り直し）ことも無い。
 *
 * 見る場所: 配信する5画面のHTML ＋ manifest 3本（★どれか1つでも貼り忘れたら --check が赤★）
 *
 * 使い方: node scripts/icon-stamp.mjs         … 貼る
 *         node scripts/icon-stamp.mjs --check … 貼り忘れ／古い ?v= を検知（CIとテストが使う）
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** アイコンの参照を持つファイル（★1つでも足し忘れると、そこだけ古い絵が残る★） */
export const FILES = [
  'index.html', 'kyuyo/index.html', 'kyuyo/admin.html', 'kyuyo/meisai.html', 'seikyu/index.html',
  'manifest.json', 'kyuyo/manifest.json', 'kyuyo/admin-manifest.json',
];

/* 引用符の中の 相対パスの .png（data: や https: には当たらない＝ / も : も含まない形だけ拾う） */
const REF = /(["'])((?:\.\.\/)?(?:img\/)[A-Za-z0-9._-]+\.png)(\?v=[0-9a-f]{8})?\1/g;

export const sha8 = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);

/** 1つのファイルの中身を貼り直した文字列と、見つけた参照を返す */
export function stampOne(rel, src) {
  const dir = path.dirname(path.join(ROOT, rel));
  const found = [];
  const out = src.replace(REF, (m, q, p, old) => {
    const abs = path.resolve(dir, p);
    if (!fs.existsSync(abs)) { found.push({ ref: p, missing: true }); return m; }
    const v = sha8(fs.readFileSync(abs));
    found.push({ ref: p, v, old: old ? old.slice(3) : null, abs });
    return q + p + '?v=' + v + q;
  });
  return { out, found };
}

const check = process.argv.includes('--check');
let ng = 0, refs = 0;
console.log(check ? '\n[icon-stamp --check] アイコンの ?v= が中身のSHAと合っているか'
  : '\n[icon-stamp] アイコンの ?v= を貼る');
for (const rel of FILES) {
  const p = path.join(ROOT, rel);
  const src = fs.readFileSync(p, 'utf8');
  const { out, found } = stampOne(rel, src);
  refs += found.length;
  for (const f of found) {
    if (f.missing) { ng++; console.log('  ✗ ' + rel + ' … ★参照先が無い★ ' + f.ref); }
  }
  if (out !== src) {
    ng++;
    if (check) {
      const stale = found.filter((f) => !f.missing && f.old !== f.v);
      console.log('  ✗ ' + rel + ' … ' + stale.map((f) => f.ref + ' が ' + (f.old || '(?v=無し)') + ' → ' + f.v).join(' / '));
    } else {
      fs.writeFileSync(p, out);
      console.log('  貼り直した ' + rel + '（参照 ' + found.length + '本）');
    }
  } else {
    console.log('  ✓ ' + rel + '（参照 ' + found.length + '本・そのまま）');
  }
}
console.log('\n── 実測 ──\n  見たファイル ' + FILES.length + '本 ／ アイコンの参照 ' + refs + '本');
if (!refs) { console.log('  ★参照が0本＝この道具は空振り★'); process.exit(1); }
if (check && ng) { console.log('  ★' + ng + '件 直っていない → node scripts/icon-stamp.mjs★'); process.exit(1); }
if (!check) console.log('  ★次: node scripts/stamp-build.mjs（JS/CSSの ?v=）→ テストを回す★');
