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
 *   ② ★git が 見ている名簿の物だけ 運ぶ★（node_modules を 持ち込まない）
 *      ★但し 中身は ★今の 手元の 字★を 読む＝★未commit の 作りかけも 運ばれる★★
 *      （2026-09-28 実測＝19本 運ぶ うち ★10本が 未commit の 作業中★だった）
 *      ⇒ ★下の ⑤の 門で 止める★
 *   ③ ★運ぶ前と後で 数える★（運んだ本数・消えた本数・変わらない本数）
 *   ④ ★消す事は しない★（運び先にしか無い物は そのまま 残す＝黙って 消さない）
 *   ⑤ ★未commit の 作りかけが 運ぶ物に 在ったら ★運ばない★★（--dry は 名前を 出すだけ）
 *   ⑥ ★運び先に ★押す前の 網の 門★ が 在るかを 数えて 出す★（★止めません＝数えるだけ★）
 *      2026-09-28 実測 … ★本番(rakually) は `core.hooksPath` が 打たれて おらず
 *        `hooks/` も 無い＝★1段も 走らずに 押せる★★（一番 高い 所に 門が 無かった）
 *      ★訳★＝`core.hooksPath` は ★手元ごとの 設定＝git では 運べない★。
 *        ⇒ ★運ぶ 時に 1回だけ 数えて 出す★のが ★唯一 気づける 所★。
 *      ＝★控えの 無い 字を 本番に 置くと どこへ 戻すかが 決められない★
 *      どうしても 運ぶ時は ★`--sagyou-chu-demo-ii` を 手で 付ける★（訳を 口に 出させる）
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

/* ★逆斜線の 逃がしは 便りで 落ちる（記憶の 決まり）＝1文字を 番号で 作る★ */
const SEN = String.fromCharCode(10);

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);

/* ★未commit の 作りかけ★を 名前で 返す（★運ぶ名簿に 載っている物だけ★）
 *   ・`git status --porcelain` の 3字目から 先が 名前（"XY name"）
 *   ・名前替え（R）は " -> " の 後ろが 今の 名前
 *   ・★git が 知らない物(??)は 名簿に 載らないので 自然に 外れる★ */
export function sagyouChu(root, list) {
  const out = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })
    .split(SEN).filter((x) => x.length > 3)
    .map((x) => x.slice(3).trim())
    .map((x) => (x.indexOf(' -> ') >= 0 ? x.slice(x.indexOf(' -> ') + 4) : x))
    .map((x) => x.replace(/^"|"$/g, ''));
  return list.filter((f) => out.indexOf(f) >= 0);
}

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
  /* ★⑤の 門の 自己確認★＝★数えるだけ／repo を 触らない★ */
  const uso = ['a.js', 'b.js', 'c.js'];
  say('★作りかけが 名簿に 無ければ 0本★', sagyouChu(ROOT, uso).length === 0);
  const ima = sagyouChu(ROOT, list);
  say('★作りかけの 数は 名簿の 本数を 超えない★', ima.length <= list.length);
  say('★返した 名前は ぜんぶ 名簿の 中★', ima.every((f) => list.indexOf(f) >= 0));
  console.log('     ★今の 手元の 作りかけ ' + ima.length + '本★'
    + (ima.length ? '＝' + ima.slice(0, 12).join(' , ') : '（★0本＝ぜんぶ commit 済み★）'));
  say('★門の 字（hooks/pre-push）を 運ぶ 名簿に 入れて いる★', list.indexOf('hooks/pre-push') >= 0);
  console.log('     運ぶ一覧 ' + list.length + '本（★運ばない物 ' + NEVER_SHIP.length + '本＝'
    + NEVER_SHIP.join(' , ') + '★）');
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★10通り ぜんぶ 思った通り★');
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

/* ★⑤ 未commit の 作りかけを 運ぶ手前で 止める★
 *   ★DRY は 止めない（数える為の 道具だから）★＝名前を 出すだけ */
const NAMA = sagyouChu(ROOT, list);
const OSHIKIRU = process.argv.includes('--sagyou-chu-demo-ii');
if (NAMA.length) {
  console.log(SEN + '  ★★未commit の 作りかけが 運ぶ物に ' + NAMA.length + '本 在ります★★（控えが 無い＝戻す先が 決められない）');
  NAMA.forEach((f) => console.log('     ！ ' + f));
}
if (NAMA.length && !DRY && !OSHIKIRU) {
  console.error(SEN + '★★運びません★★ … 先に commit するか、訳を 言って `--sagyou-chu-demo-ii` を 付ける');
  process.exit(3);
}
if (NAMA.length && !DRY && OSHIKIRU) {
  console.log('  ★★`--sagyou-chu-demo-ii` が 付いている＝作りかけ ' + NAMA.length + '本も 運びます★★');
}

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
/* ★⑥運び先の 門を 数える（★止めません／読むだけ★）★
 *   `core.hooksPath` は ★手元ごとの 設定★＝運べない ので ★運んだ 後に 数えて 出す★ */
let monJi = "（打たれて いません）";
try {
  monJi = execFileSync('git', ['config', '--get', 'core.hooksPath'], { cwd: TO, encoding: 'utf8' }).trim() || '（空）';
} catch { /* 無い */ }
const monP = path.join(TO, (monJi.indexOf('（') === 0 ? 'hooks' : monJi), 'pre-push');
const monAru = fs.existsSync(monP);
console.log('  ★運び先の 押す前の 門★ … core.hooksPath ＝ ' + monJi
  + ' ／ pre-push の 字 ＝ ' + (monAru ? '★在る★' : '★★無い★★'));
if (monJi.indexOf('（') === 0 || !monAru) {
  console.log('     ★★⇒ 運び先では 押す前の 網が ★1段も 走りません★★★（止めません＝数えただけ）');
  console.log('     ★付ける★ … 運び先で 1回だけ … git config core.hooksPath hooks');
}

console.log('  ★次にやる事★ 運び先で … node scripts/stamp-build.mjs → CI総なめ → webkit.yml も 総なめ');
