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

/* ★★★運び先の 名簿＝★名前で 白黒を 付ける★★★★（2026-09-28・指示役1 の ①）
   ★何が 起きたか★ … 「本番に 入れて いない 物」を 数える 為に
     `--to C:/Users/zeroa/payslip-app` を 走らせた（★給与の 本番は `rakually`★）。
     出た 数 … ★新しく置く 480本／運び先の 門 無い★。★`--dry` だったので 1バイトも 書いて いません★。
   ★私が 最初に 書いた 直し（★捨てました★）★
     「★新しく置く 本数が 多すぎたら 印を 出す★」
     ⇒ ★★『多すぎ』の 境目は ★私が 決め打った 数★＝また 測って いない 数★★（指示役1 が 止めた）
   ⇒ ★★＝この 件は 数で 決める 必要が ありません＝★`origin` の 名前で 決まります★★★
   ★★`--dry` でも 止めます★★
     ★訳★ … ★相手 違いを 数えた 数は ★嘘★★＝★『数えるだけ』でも 意味が ありません★
     （★他の 門は「数えるだけなら 通す」ですが ★訳が 違う★＝★ここは 相手が 違う★）
   ★枝も 見ます★ … ★名簿だけでは 枝違いを 捕まえられません★
     （`rakually`＝`main` ／ `payslip-app`＝`p1-ops-payroll-monthly`）
   ★増やす 時は ここに 1行★＝★`NEVER_SHIP` の 兄弟★（★人の 頭に 置かない★） */
const OKU_SAKI_OK = [
  { origin: 'exally-zeroact/rakually', eda: 'main', nani: '★給与(Rakunally) の 本番★' },
];
/* ★★判じは ここ 1か所★★＝★自己確認から 叩けます（偽の repo を 作らずに 済む）★
   ★返り★ … `{ ok, naze }`（`ok:false` なら `naze` を そのまま 出して 止める） */
export function okuSakiWoMiru(okuNa, okuEda, meibo = OKU_SAKI_OK) {
  const na = String(okuNa == null ? '' : okuNa).trim();
  if (!na || na === '★取れない★') {
    return { ok: false, naze: '★運び先の origin が 取れません＝止めます（★取れない を 通すと 何処へでも 運べます★）★' };
  }
  const atta = (Array.isArray(meibo) ? meibo : []).find((x) => x && x.origin === na);
  if (!atta) {
    return { ok: false, naze: '★運び先が 名簿に 在りません★ … 今 ' + na
      + ' ／ 名簿 ' + (Array.isArray(meibo) && meibo.length ? meibo.map((x) => x.origin).join(' / ') : '（空）') };
  }
  const eda = String(okuEda == null ? '' : okuEda).trim();
  if (atta.eda && eda && eda !== atta.eda) {
    return { ok: false, naze: '★運び先の 枝が 違います★ … 今 ' + eda + ' ／ 名簿は ' + atta.eda };
  }
  if (atta.eda && !eda) {
    return { ok: false, naze: '★運び先の 枝が 取れません＝止めます（★枝違いを 見逃します★）★' };
  }
  return { ok: true, atta: atta };
}

if (process.argv.includes('--self-test')) {
  console.log('\n[ship-all] ★自己確認★（★わざと 壊して 赤になるか★）');
  let ng = 0;
  let zen = 0;
  const say = (nm, ok) => { zen++; if (!ok) ng++; console.log('  ' + (ok ? '✓' : '✗') + ' ' + nm + (ok ? '' : '  ★思っていたのと 違う★')); };
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
  /* ★★運び先の 名簿の 門＝★わざと 間違えて 赤に なるか★★★（2026-09-28）
     ★偽の repo を 作りません★＝★判じが 純粋な 関数だから★（`okuSakiWoMiru`） */
  const M = [{ origin: 'exally-zeroact/rakually', eda: 'main', nani: 'テスト用' }];
  say('★正しい 先は 通る★', okuSakiWoMiru('exally-zeroact/rakually', 'main', M).ok === true);
  say('★★別の repo は 止まる（これが 今朝 私が 踏んだ 穴）★★',
    okuSakiWoMiru('exally-zeroact/payslip-app', 'p1-ops-payroll-monthly', M).ok === false);
  say('★枝が 違えば 止まる（名簿だけでは 捕まえられない）★',
    okuSakiWoMiru('exally-zeroact/rakually', 'p1-ops-payroll-monthly', M).ok === false);
  say('★origin が 取れなければ 止まる★', okuSakiWoMiru('', 'main', M).ok === false);
  say('★★『★取れない★』の 字でも 止まる（出しの 字を そのまま 通さない）★★',
    okuSakiWoMiru('★取れない★', 'main', M).ok === false);
  say('★枝が 取れなければ 止まる★', okuSakiWoMiru('exally-zeroact/rakually', '', M).ok === false);
  say('★名簿が 空なら 何も 通さない★', okuSakiWoMiru('exally-zeroact/rakually', 'main', []).ok === false);
  say('★止めた 時は 訳を 返す（黙って 止めない）★',
    typeof okuSakiWoMiru('x/y', 'main', M).naze === 'string'
    && okuSakiWoMiru('x/y', 'main', M).naze.indexOf('x/y') >= 0);
  say('★前後の 余白は 落として 見る★', okuSakiWoMiru('  exally-zeroact/rakually  ', ' main ', M).ok === true);
  say('★★今の 名簿に 本番が 在る（名簿が 空に なって いない）★★',
    OKU_SAKI_OK.some((x) => x.origin === 'exally-zeroact/rakually'));
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい（全 ' + zen + '通り）★'); process.exit(1); }
  console.log('  ★' + zen + '通り ぜんぶ 思った通り★');
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

const GIT_ENV = Object.assign({}, process.env, {
  /* ★`git` を 運び先で 訊く 時は ★`GIT_DIR` を 外す★★
     ★訳★ … この 道具は ★押す前の 網（`hooks/pre-push`）の 中からも 呼ばれます★。
       ★git は hook に `GIT_DIR` を 渡します★（worktree から 押した 時は とくに）
       ⇒ ★`cwd: TO` を 付けても ★`GIT_DIR` が 勝つ★＝★運び元の repo を 訊いて しまう★
       ⇒ ★★＝『運び先の 門が 在る』と 嘘を 出します★★
     （★同じ 穴で 主の repo の `core.bare` を 2回 壊しました★
       … `feedback_worktree_kara_osu_to_GIT_DIR_ga_watasareru`） */
  GIT_DIR: undefined, GIT_WORK_TREE: undefined, GIT_INDEX_FILE: undefined, GIT_PREFIX: undefined,
});
const gitToi = (...a) => {
  try { return execFileSync('git', a, { cwd: TO, encoding: 'utf8', env: GIT_ENV }).trim(); }
  catch { return ''; }
};
const okuOrigin = gitToi('remote', 'get-url', 'origin');
const okuEda = gitToi('rev-parse', '--abbrev-ref', 'HEAD');
/* ★`https://github.com/x/y.git` も `git@github.com:x/y` も 同じ 形に する★ */
const okuNa = (okuOrigin.replace(/^.*github\.com[:/]/, '').replace(/\.git$/, '') || '★取れない★');
console.log('[ship-all] ★運び先の 素性★ … ' + TO
  + String.fromCharCode(10) + '           origin ＝ ' + (okuOrigin || '★取れない★') + '（' + okuNa + '）'
  + ' ／ 枝 ＝ ' + (okuEda || '★取れない★')
  + ' ／ HEAD ＝ ' + (gitToi('rev-parse', '--short', 'HEAD') || '★取れない★'));
{
  const mi = okuSakiWoMiru(okuNa, okuEda);
  if (!mi.ok) {
    console.error('★★' + mi.naze + '＝' + (DRY ? '★--dry でも 止めます★' : '運びません') + '★★');
    console.error('   ★訳★ … ★相手 違いを 数えた 数は 嘘★＝★数えるだけでも 意味が ありません★');
    console.error('   ★正しいのに 止まったら★ … `OKU_SAKI_OK` に 1行 足す（★人の 頭に 置かない★）');
    process.exit(2);
  }
  console.log('           ★名簿に 在ります★ … ' + mi.atta.nani + '（枝 ' + mi.atta.eda + '）');
}

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
/* ★★運び先の 素性を ★数の 前に★ 出す★★（2026-09-28・指示役1 の ③＋私の 実測）
   ★何が 起きたか★ … 「本番に 入れて いない 物」を 数える 為に
     `--to C:/Users/zeroa/payslip-app` を 走らせた（★給与の 本番は `rakually`★）。
     出た 数 … ★新しく置く 480本／門 無い★。★`--dry` だったので 1バイトも 書いて いません★。
   ★なぜ 気づくのが 遅れたか★ … ★出しに 『運び先が どの repo か』が 1行も 無かった★
     ＝★フォルダ名だけで 決めて いた★（記憶の 決まり … repo名・フォルダ名は 環境の 証しに ならない）
   ⇒ ★★＝『人が 覚えて いないと 効かない』を ★出しの 数に 移す★★ */
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
let monJi = gitToi('config', '--get', 'core.hooksPath') || "（打たれて いません）";
const monP = path.join(TO, (monJi.indexOf('（') === 0 ? 'hooks' : monJi), 'pre-push');
const monAru = fs.existsSync(monP);
console.log('  ★運び先の 押す前の 門★ … core.hooksPath ＝ ' + monJi
  + ' ／ pre-push の 字 ＝ ' + (monAru ? '★在る★' : '★★無い★★'));
if (monJi.indexOf('（') === 0 || !monAru) {
  console.log('     ★★⇒ 運び先では 押す前の 網が ★1段も 走りません★★★（止めません＝数えただけ）');
  console.log('     ★付ける★ … 運び先で 1回だけ … git config core.hooksPath hooks');
}

console.log('  ★次にやる事★ 運び先で … node scripts/stamp-build.mjs → CI総なめ → webkit.yml も 総なめ');
