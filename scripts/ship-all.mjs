/* ship-all.mjs — ★テスト線の全部（請求書＋給与＋ホーム）を 本番の入れ物へ運ぶ★
 * =============================================================================
 * ★なぜ この道具が 要るか（司さん 2026-09-03「渡せる状態にやって／URLは1本かして」）★
 *   ・給与（旧 Kyually）の repo は ★凍結★・本番URL(payslip-app-olive)は ★503で 死んでいる★（実測）
 *   ・生きている給与の画面は ★このテスト線の kyuyo/ だけ★
 *   ⇒ ★知り合いに 1つのURL・1つのログインで 請求書と給料明細の 両方★を 渡すには
 *     ★本番(rakually)に 給与も 入れる★しか 道が 無い。
 *
 *   既に在る `scripts/ship-seikyu.mjs` は ★請求書だけを 運ぶ道具★で、
 *   ★給与のタイルを 消す／給与を見る見張りを CIから 外す★ という 作りが 中に 入っている
 *   （CI_SKIP 15件は 全部「この repo には 給与が 無いから」が 理由）。
 *   ⇒ ★給与も 運ぶ時に あれを 使い回すと 逆立ちになる★ので、こちらを 別に 置く。
 *
 * ★この道具が 守る事★
 *   ① ★js/supa-config.js は 絶対に 運ばない★（★テスト線の値を 本番へ 持ち込まない★）
 *      ＝一番 高い事故（本番の画面が テスト倉庫を向く）を 構造で 止める。
 *      運び先の supa-config は ★1文字も 触らない★（前と後の sha を 出す）。
 *   ② ★git が 見ている物だけ 運ぶ★（node_modules や 作りかけを 持ち込まない）
 *   ③ ★運ぶ前と後で 数える★（運んだ本数・消えた本数・変わらない本数）
 *   ④ ★消す事は しない★（運び先にしか無い物は そのまま 残す＝黙って 消さない）
 *
 * 使い方:
 *   node scripts/ship-all.mjs --to <運び先> --dry   … 数えるだけ（1バイトも 書かない）
 *   node scripts/ship-all.mjs --to <運び先>         … 運ぶ
 *   node scripts/ship-all.mjs --self-test           … わざと壊して 赤になるか
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

/* ★運ばない物★（理由を ここに 書く＝黙って 外さない） */
export const NEVER_SHIP = [
  /* ★倉庫の向き先★＝本番は 本番の倉庫を 指したまま（記憶の値を 打たない・運ばない） */
  'js/supa-config.js',
];

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);

export function fileList(root) {
  const out = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split('\n').map((x) => x.trim()).filter(Boolean);
  return out.filter((f) => NEVER_SHIP.indexOf(f) < 0);
}

if (process.argv.includes('--self-test')) {
  console.log('\n[ship-all] ★自己確認★（★わざと 壊して 赤になるか★）');
  let ng = 0;
  const say = (nm, ok) => { if (!ok) ng++; console.log('  ' + (ok ? '✓' : '✗') + ' ' + nm + (ok ? '' : '  ★思っていたのと 違う★')); };
  const list = fileList(ROOT);
  say('★倉庫の向き先（js/supa-config.js）を 運ぶ一覧に 入れていない★', list.indexOf('js/supa-config.js') < 0);
  say('請求書の画面は 運ぶ', list.indexOf('seikyu/index.html') >= 0);
  say('★給与の画面も 運ぶ（これが 今回の 用）★', list.indexOf('kyuyo/index.html') >= 0);
  say('ホームも 運ぶ', list.indexOf('index.html') >= 0);
  say('git が 見ていない物は 運ばない（node_modules）', !list.some((f) => f.startsWith('node_modules/')));
  say('★0本では ない（空振りしていない）★', list.length > 100);
  console.log('     運ぶ一覧 ' + list.length + '本（★運ばない物 ' + NEVER_SHIP.length + '本＝'
    + NEVER_SHIP.join(' , ') + '★）');
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★6通り ぜんぶ 思った通り★');
  process.exit(0);
}

const toIdx = process.argv.indexOf('--to');
const TO = (toIdx >= 0) ? path.resolve(process.argv[toIdx + 1] || '') : '';
const DRY = process.argv.includes('--dry');
if (!TO || !fs.existsSync(TO)) {
  console.error('使い方: node scripts/ship-all.mjs --to <運び先> [--dry]');
  process.exit(2);
}
if (path.resolve(TO) === path.resolve(ROOT)) { console.error('★運び先が 自分です★'); process.exit(2); }

/* ★運び先の 倉庫の向き先を 先に 控える★（運んだ後に 同じか 見る） */
const cfg = path.join(TO, 'js/supa-config.js');
const cfgBefore = fs.existsSync(cfg) ? sha(cfg) : '（無い）';
const cfgUrlBefore = fs.existsSync(cfg)
  ? (fs.readFileSync(cfg, 'utf8').match(/https:\/\/[a-z0-9]+\.supabase\.co/) || ['（読めない）'])[0] : '（無い）';

const list = fileList(ROOT);
let added = 0, updated = 0, same = 0;
const addedNames = [];
for (const f of list) {
  const src = path.join(ROOT, f);
  const dst = path.join(TO, f);
  if (!fs.existsSync(src)) continue;
  const exists = fs.existsSync(dst);
  const eq = exists && sha(src) === sha(dst);
  if (eq) { same++; continue; }
  if (!exists) { added++; if (addedNames.length < 12) addedNames.push(f); } else { updated++; }
  if (!DRY) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

/* ★運び先にしか 無い物★（消さない＝名前だけ 出す） */
const toList = execFileSync('git', ['ls-files'], { cwd: TO, encoding: 'utf8' })
  .split('\n').map((x) => x.trim()).filter(Boolean);
const onlyThere = toList.filter((f) => list.indexOf(f) < 0 && NEVER_SHIP.indexOf(f) < 0);

const cfgAfter = fs.existsSync(cfg) ? sha(cfg) : '（無い）';
const cfgUrlAfter = fs.existsSync(cfg)
  ? (fs.readFileSync(cfg, 'utf8').match(/https:\/\/[a-z0-9]+\.supabase\.co/) || ['（読めない）'])[0] : '（無い）';

console.log('\n[ship-all] ' + (DRY ? '★数えるだけ（1バイトも 書いていません）★' : '運びました')
  + ' … ' + ROOT + ' → ' + TO);
console.log('  運ぶ一覧 ' + list.length + '本 ／ ★新しく置く ' + added + '本／上書き ' + updated
  + '本／同じ ' + same + '本★');
addedNames.forEach((f) => console.log('     ＋ ' + f));
if (added > addedNames.length) console.log('     … ほか ' + (added - addedNames.length) + '本');
console.log('  運び先にしか 無い物 ' + onlyThere.length + '本（★消しません★）'
  + (onlyThere.length ? '： ' + onlyThere.slice(0, 8).join(' , ') + (onlyThere.length > 8 ? ' …' : '') : ''));
console.log('  ★倉庫の向き先★ … 前 ' + cfgUrlBefore + '（' + cfgBefore + '）'
  + ' → 後 ' + cfgUrlAfter + '（' + cfgAfter + '）'
  + ((cfgBefore === cfgAfter) ? ' ★同じ＝触っていない★' : ' ★★変わった＝止めます★★'));
if (cfgBefore !== cfgAfter) process.exit(1);
console.log('  ★次にやる事★ 運び先で … node scripts/stamp-build.mjs → CI総なめ → webkit.yml も 総なめ');
