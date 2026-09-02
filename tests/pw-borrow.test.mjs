/* pw-borrow.test.mjs — ★playwright の 借り方は 1か所★（借り先リストを 自前で 持たない）
 * ============================================================================
 * ★なぜ（2026-09-02 に 実際に 起きた事）★
 *   借り先リストを ★7本が 別々に★ 持っていた（4か所／3か所／2か所）。
 *   ⇒ ★同じ機械で webkit-size だけ 測れて 他は 未測定（緑）★＝「測っていないのに 緑」。
 *   さらに ★`launch()` を try で 包んでいない★物が 4本 … ★生の例外（スタックトレース）で 落ちる★。
 *   （指示役 2026-09-02 が 実測して 覆した。私は ①借りられない の挙動を見て
 *     ②本体が無い の話として 書いていた＝★2つの失敗を 混ぜた★）
 *
 * ★指示役の裁定（2026-09-02）＝この見張りが 守る物★
 *   ① 道具が無い＝「未測定」で 揃える／★生の例外で 落ちるのは 禁止★
 *   ② 終わり値は 場所で 分ける（週1の webkit.yml＝赤／手元・毎回のCI＝未測定・緑）
 *   ③ ★借り先リストは 4本とも 同じ★＝scripts/_borrow-playwright.mjs に 1か所
 *
 * ★ここで見る事★
 *   ① 共通部品の 外に ★借り先リスト（node_modules/playwright/index.js）が 0本★
 *   ② 共通部品の 外に ★直の launch(（webkit.launch / chromium.launch）が 0本★
 *   ③ 借りている物は 全部 ★共通部品を 読み込んでいる★
 *   ④ 共通部品の 借り先は ★4か所★／週1の目印 MEASURE_REQUIRED を webkit.yml が 立てている
 *   ⑤ ★0件で 緑にしない★（見た本数を 数えて 出す）
 *   ★注記（コメント）は 外してから 数える★（「使うな」と書いてある行が 一番 引っかかる）
 *
 * 使い方: node tests/pw-borrow.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = process.argv.includes('--self-test');

let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + ' — ' + m); } };

const HELPER = 'scripts/_borrow-playwright.mjs';

/* ★台帳＝共通部品を 使わなくてよい物（理由つき・戻す条件つき）★
   ★名前で 黙って 外さない★＝ここに 理由が 無い物は 赤。
   ・tools/fake-clock.mjs … ★他アプリへ 写して 使う道具★（ダイコメが 2026-09-02 に 写した）。
     共通部品を 読むと 写した先で 解けない＝★効いているふり★になる。
     また この道具は ★人の node に 読み込まれる★ので、共通部品の様に
     ★相手のプロセスを 終わらせて（exit）は いけない★。
     ⇒ 外す代わりに ★launch を try で 包んである事★を ここで 数える。
     戻す条件＝この道具が この repo 専用に なった時。 */
const LEDGER = { 'tools/fake-clock.mjs': 'よそへ 写して使う道具＝自分だけで 完結させる（launch は try で包む）' };

/* ★台帳に載せた物は「包んである」まで 見る★（外した＝見ない ではない） */
export function wrapped(src) {
  const s = stripComments(src);
  const hits = [...s.matchAll(/\.\s*launch\s*\(/g)];
  return hits.every((m) => /try\s*\{[^}]*$/.test(s.slice(Math.max(0, m.index - 400), m.index)));
}

/* ★注記を 外してから 数える★（// と /* *\/ を 消す。字の中の物までは 見ない＝十分） */
export function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
export function findings(src) {
  const s = stripComments(src);
  return {
    lender: (s.match(/node_modules\/playwright\/index\.js/g) || []).length,
    rawLaunch: (s.match(/\b(?:webkit|chromium|firefox|PW\.webkit|type)\s*\.\s*launch\s*\(/g) || []).length,
    usesHelper: /_borrow-playwright\.mjs/.test(s),
    borrows: /\bborrow\s*\(/.test(s) || /playwright/i.test(s),
  };
}

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    if (f === 'node_modules' || f === '.git' || f === 'dist') continue;
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(mjs|js)$/.test(f)) out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

if (SELF) {
  console.log('\n[pw-borrow] ★自己確認★（★わざと 壊して 赤になるか★）');
  let ng = 0;
  /* ★見本の字は 継いで 作る★＝そのまま 書くと ★この見張り自身が 引っかかる★
     （名前で 自分を 外す＝名簿方式は 別の穴になるので しない） */
  const L = 'node_modules/play' + 'wright/index.js';
  const LA = '.lau' + 'nch(';
  const cases = [
    ['借り先を 自前で 書いた', "const L=['C:/x/" + L + "'];", (f) => f.lender === 1],
    ['直に launch を 呼んだ', 'const b = await webkit' + LA + ');', (f) => f.rawLaunch === 1],
    ['注記の中の 借り先は 拾わない', '/* 昔は ' + L + ' を 自前で 持っていた */', (f) => f.lender === 0],
    ['注記の中の launch は 拾わない', '// ここで webkit' + LA + ') を 直に 呼ぶな', (f) => f.rawLaunch === 0],
    ['共通部品を 読んでいる', "import { borrow } from '../scripts/_borrow-play" + "wright.mjs';",
      (f) => f.usesHelper === true],
    ['★台帳に 載っている物は try で 包んである事まで 見る', 'try { await webkit' + LA + '); } catch (e) { }',
      () => wrapped('try { await webkit' + LA + '); } catch (e) { }')],
  ];
  cases.forEach(([nm, src, ok]) => {
    const got = ok(findings(src));
    if (!got) ng++;
    console.log('  ' + (got ? '✓' : '✗') + ' ' + nm + (got ? '' : '  ★思っていたのと 違う★'));
  });
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★6通り ぜんぶ 思った通り★');
}

const files = walk(ROOT).filter((p) => rel(p) !== HELPER);
let seen = 0, ledgerSeen = 0, badLender = [], badLaunch = [], noHelper = [];
files.forEach((p) => {
  const f = findings(fs.readFileSync(p, 'utf8'));
  const r = rel(p);
  const src = fs.readFileSync(p, 'utf8');
  if (LEDGER[r]) {
    /* ★台帳の物は 包んであるかだけ 見る★（黙って 見逃さない） */
    if (!wrapped(src)) badLaunch.push(r + '（★台帳に在るが try で 包んでいない★）');
    ledgerSeen++;
    return;
  }
  if (f.lender) { badLender.push(r + '（' + f.lender + 'か所）'); }
  if (f.rawLaunch) { badLaunch.push(r + '（' + f.rawLaunch + '回）'); }
  if (f.lender || f.rawLaunch) seen++;
  if ((f.lender || f.rawLaunch) && !f.usesHelper) noHelper.push(r);
});

/* ★共通部品そのもの★ */
const helperSrc = fs.readFileSync(path.join(ROOT, HELPER), 'utf8');
const lenders = (stripComments(helperSrc).match(/node_modules\/playwright\/index\.js/g) || []).length;
const ymlPath = path.join(ROOT, '.github/workflows/webkit.yml');
const yml = fs.existsSync(ymlPath) ? fs.readFileSync(ymlPath, 'utf8') : '';

/* ★playwright を 使う物を 数える★（0件で 緑にしない為） */
const users = files.filter((p) => /_borrow-playwright\.mjs/.test(stripComments(fs.readFileSync(p, 'utf8'))));
console.log('\n[pw-borrow] playwright の 借り方は 1か所か');
console.log('     共通部品を 読んでいる物 ' + users.length + '本 ／ 見た .mjs/.js ' + files.length + '本'
  + ' ／ ★台帳（理由つきで 外した物）' + ledgerSeen + '本★');
Object.keys(LEDGER).forEach((k) => console.log('       — 台帳 ' + k + ' … ' + LEDGER[k]));
badLender.forEach((x) => console.log('       ★自前の 借り先★ ' + x));
badLaunch.forEach((x) => console.log('       ★直の launch★ ' + x));

T('★① 借り先リストを 自前で 持っている物が 無い', badLender.length === 0, badLender.join(' / '));
T('★② 直に launch( を 呼んでいる物が 無い（未測定を 生の例外にしない）', badLaunch.length === 0,
  badLaunch.join(' / '));
T('★③ 借りている物は 共通部品を 読んでいる', noHelper.length === 0, noHelper.join(' / '));
T('★④ 共通部品の 借り先は 4か所（機械によって 1本だけ 測れる を 無くす）', lenders === 4,
  '今 ' + lenders + 'か所');
/* ★目印は job に 1回だけ★（指示役の承認 2026-09-02）
   ＝step ごとに 書くと ★写し忘れが 1回で 事故になる★
     （08-28「テスト用の帯を HTMLに直書きして 本番で 手で消す」で 決めた形と 同じ）。 */
const marks = (yml.match(/MEASURE_REQUIRED/g) || []).length;
const atJob = yml.indexOf('MEASURE_REQUIRED') >= 0
  && yml.indexOf('MEASURE_REQUIRED') < yml.indexOf(String.fromCharCode(10) + '    steps:');
T('★⑤ 週1の回だけ 赤にする目印が webkit.yml の job に ★1回だけ★ 在る（stepごとに 書かない）',
  marks === 1 && atJob, '目印 ' + marks + '回／job の中か ' + atJob);
T('★⑥ 空振りしていない（0件で 緑にしない）', users.length >= 7 && files.length > 50,
  '共通部品を読む物 ' + users.length + '本 ／ 見た本数 ' + files.length + '本');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
