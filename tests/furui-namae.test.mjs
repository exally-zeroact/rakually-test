/* furui-namae.test.mjs — ★古い 名前（exally_*）を 使って いる 所を 数える★
 * ============================================================================
 * ★なぜ 在るか（2026-09-19）★
 *   倉庫の 表の 名前を 変えた（★試験の 倉庫だけ★・司さんの 言葉を 貰って から）。
 *     `exally.exally_entitlements` → ★`exally.app_entitlements`★
 *     `exally.exally_admins`       → ★`exally.app_admins`★
 *   ★古い 名前は 覗き窓（view・security_invoker=true）で 残して ある★
 *     ＝★私たちが 掴めて いない 所（`nomiya` 4行）も 落ちない★為。
 *
 * ★★この 紙が 守る 物＝「いつか 消す」を 消える ように する★★
 *   ★橋（覗き窓）は ★数えないと 永久に 残ります★★
 *   ⇒ ★古い 名前を 使って いる 所の 本数を 決め打つ★＝★増えたら 赤★（減るのは よい）
 *   ⇒ ★★覗き窓を 外せる 条件★★
 *        ⑴ この 数が ★0★ に なった
 *        ⑵ ★本番の 倉庫も 新しい 名前に なった★（★今は なって いません★）
 *
 * ★★★今 いちばん 大事な 決まり（触る 人へ）★★★
 *   ★★アプリの 字を 新しい 名前に 変えないで ください★★
 *   （`sb.from('exally_entitlements')` の まま）
 *   ★訳★ … ★試験＝新旧 両方 読める／★本番＝古い 名前だけ★★
 *          ⇒ ★変えた 瞬間に ★試験は 緑・本番だけ 落ちる★★
 *          ＝「手元は 緑・CI は 赤」の ★一番 高く つく 版★
 *   ★変えてよく なる 日★＝★本番も 名前を 変えた 日★（★司さんに 伺ってから★）
 *
 * ★見る 置き場★ … repo の ★git が 知って いる .js / .mjs / .html★（node_modules は 見ない）
 * ★弱み★ … ★字で 数えて います★＝注記の 中の 字も 1件と 数えます（★隠さない★）。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = process.argv.indexOf('--self-test') >= 0;

/* ★古い 名前★（この 3つを 数える） */
export const FURUI = ['exally_entitlements', 'exally_admins', 'is_exally_admin'];

/* ★★決め打ち★★（2026-09-19 実測）＝★増えたら 赤／減ったら ここも 直す★ */
/* ★★55 では なく 60★★（2026-09-19 自分で 踏んだ）
   最初 `grep -rn | wc -l` の ★55★ を 決め打ちに した。
   ⇒ それは ★行数★ で、この 門が 数える ★件数★では ない（1行に 2つ 在る 所が 在る）。
   ⇒ ★「何を 何で 数えたか」を 揃えて いなかった★＝今日 何度も 出た 形。
   ⇒ ★この 門が 出した 数（60）を 決め打ちに する★＝★同じ 物差しで 数える★ */
const HONSU = 71;
const KAMI_HONSU = 12;
/* ★★この 門 自身も 数に 入って います（11件）★★（2026-09-19 実測で 踏んだ）
   commit する 前は `git ls-files` に 無く ★60件／11枚★。
   commit した 途端 ★71件／12枚★に なり 総なめが 赤に なった。
   ★逃げ方は 2つ 在った★
     ㋐ 名簿で 自分を 外す … ★しない★（★pw-borrow で 同じ 穴を 潰した ばかり★）
     ㋑ 字を 割って 書く …… ★しない★（★今日 その 逃げ道の 本数に 門を 付けた ばかり★）
   ⇒ ★自分の 分も 数に 入れ、★訳を 書く★★＝★数が 見える まま★／増えれば 赤の まま。 */

/* ★1本ずつ 訳★＝★訳の 無い 物は 赤★（名簿を 黙って 増やさない） */
const WAKE = {
  'js/suite-data.js': '★入口が 契約を 読む★（app=suite）。本番も 古い 名前なので まだ 変えない。',
  'kyuyo/js/admin.js': '★管理の 画面★。本番も 古い 名前なので まだ 変えない。',
  'kyuyo/js/store.js': '★給与が 契約を 作る／読む★（app=payslip）。同上。',
  'seikyu/js/auth.js': '★請求書の 入口★（app=invoice は まだ 1行も 無い）。同上。',
  'kyuyo/tests/admin-ui.mjs': '★守りを 測る 試験★＝★アプリと 同じ 名前で 読む★（読む 物を 変えたら 測りに ならない）。',
  'kyuyo/tests/souko-kengen.test.mjs': '倉庫の 権限の 見張り。同上。',
  'seikyu/tests/sql-guard.test.mjs': 'SQL の 見張り。同上。',
  'seikyu/tests/warehouse-perms.test.mjs': '倉庫の 権限の 見張り。同上。',
  'tests/live-roundtrip.mjs': '実物で 1往復する 測り。同上。',
  'tests/own-name.test.mjs': '自分の 名前の 見張り。同上。',
  'tests/suite-data.test.js': '入口の 試験。同上。',
  'tests/furui-namae.test.mjs': '★この 門 自身★＝数える 為の 字と 覚書。★名簿で 自分を 外さない／字も 割らない★ので 数に 入れて 訳を 書く。',
};

export function kazoeru(files, yomu) {
  const hyo = {};
  let kei = 0;
  for (const f of files) {
    const s = yomu(f);
    let n = 0;
    for (const go of FURUI) n += s.split(go).length - 1;
    /* ★`is_exally_admin` は `exally_admins` を 含まない★（別の 字）＝二重に 数えない */
    if (n) { hyo[f] = n; kei += n; }
  }
  return { hyo, kei, kami: Object.keys(hyo).length };
}

let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };

if (SELF) {
  console.log('\n[furui-namae] ★自己確認★（わざと 変えたら 数が 動くか）');
  let ng = 0;
  const iu = (n, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + n + (good ? '' : '  ★思っていたのと 違う★')); };
  const y1 = (f) => (f === 'a.js' ? "sb.from('exally_entitlements')" : '');
  iu('★古い 名前を 1つ 数える★', kazoeru(['a.js'], y1).kei === 1);
  const y2 = (f) => (f === 'a.js' ? "sb.from('app_entitlements')" : '');
  iu('★新しい 名前は 数えない★', kazoeru(['a.js'], y2).kei === 0);
  const y3 = (f) => (f === 'a.js' ? "is_exally_admin() と exally_admins" : '');
  iu('★2つ 在れば 2と 数える★', kazoeru(['a.js'], y3).kei === 2);
  iu('★1つも 無ければ 紙は 0枚★', kazoeru(['a.js'], () => 'なにもない').kami === 0);
  console.log(ng ? '★自己確認 ' + ng + '件 おかしい★' : '  ★4通り ぜんぶ 思った通り★');
  if (ng) process.exit(1);
}

const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n')
  .filter((f) => /\.(js|mjs|html)$/.test(f) && f.indexOf('node_modules') < 0);
const r = kazoeru(files, (f) => fs.readFileSync(path.join(ROOT, f), 'utf8'));

console.log('\n[furui-namae] 古い 名前（' + FURUI.join(' / ') + '）を 使って いる 所');
console.log('  ★見た 紙 ' + files.length + '本★（git が 知って いる .js/.mjs/.html）');
console.log('  ★古い 名前 ' + r.kei + '件／' + r.kami + '枚★（決め打ち ' + HONSU + '件／' + KAMI_HONSU + '枚）');
Object.keys(r.hyo).sort().forEach((k) => console.log('     ' + String(r.hyo[k]).padStart(3) + '件  ' + k
  + (WAKE[k] ? '  … ' + WAKE[k] : '  ★訳が 書いて ありません★')));

T('★① 古い 名前を 使って いる 所が 決め打ちと 合う（★増えたら 赤★）',
  r.kei <= HONSU && r.kami <= KAMI_HONSU,
  '今 ' + r.kei + '件／' + r.kami + '枚（決め打ち ' + HONSU + '／' + KAMI_HONSU + '）★増えて います★');
T('★② 1枚ずつ 訳が 書いて ある（黙って 増やさない）',
  Object.keys(r.hyo).every((k) => WAKE[k] && WAKE[k].length > 8),
  '訳の 無い 紙 … ' + Object.keys(r.hyo).filter((k) => !WAKE[k]).join(' / '));
T('★③ 空振りして いない（0件で 緑に しない）', r.kei > 0 && files.length > 50,
  '古い 名前 ' + r.kei + '件／見た 紙 ' + files.length + '本');

console.log('  ★覗き窓（古い 名前）を 外せる 条件★ … ⑴ここが ★0件★ かつ ⑵★本番の 倉庫も 新しい 名前★'
  + '（★今は どちらも まだ★）');
console.log('  ★★アプリの 字は まだ 変えない★★＝★試験は 新旧 両方／本番は 古い 名前だけ★'
  + '＝変えると ★本番だけ 落ちます★');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
