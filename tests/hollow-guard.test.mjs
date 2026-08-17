/* hollow-guard.test.mjs — ★空振りしているテストを探す★
 *
 * なぜ必要か（2026-08-04・指示役）:
 *   ym-picker の検査④は CSS の min-width を読んでいたが、実物は min-width:0 なので
 *   ★何を入れても緑になる★ 状態だった。守っているつもりで、何も守っていない。
 *   ★空振りしているテストは、無いより悪い★（人が安心して確認をやめる）。
 *
 * 何を「空振り」と呼ぶか（3つ）:
 *   (a) 実物を拾えていない … 読み取りが 0件/null なのに、逃げ道(|| 0, || [] 等)で緑になる
 *   (b) 除外で逃げている  … EXCLUDE/SKIP/除外 の一覧に入れて赤を消している
 *   (c) わざと壊していない … --self-test が無い＝「赤になること」を一度も見ていない
 *
 * どう見るか:
 *   ・静的 … 逃げ道・除外リスト・self-test の有無をコードから読む
 *   ・動的 … ★実際に走らせて「何件検査したか」を数える★
 *            0件ならその時点で空振り確定（緑だが何も見ていない）
 *   ★この検査自身も空振りしうるので、--self-test で「作り物の空振りを赤にできるか」を先に示す。
 *
 * 使い方: node tests/hollow-guard.test.mjs            （表を出す。空振り確定があれば exit 1）
 *         node tests/hollow-guard.test.mjs --self-test
 *         node tests/hollow-guard.test.mjs --full     （動的も回す。遅い）
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ★純関数: 1本のソースを見て、空振りの疑いを返す。self-test で作り物を通せる。 */
export function inspect(src) {
  const flags = [];
  // (a) 実物を拾えていない可能性 … 読み取り結果に逃げ道を付けている
  //     例: const n = m ? Number(m[1]) : 0;  /  (X.match(re) || []).length
  const escapes = [
    ...src.matchAll(/\bm\s*\?\s*Number\(m\[\d\]\)\s*:\s*(\d+)/g),
    ...src.matchAll(/\|\|\s*(\[\]|\{\}|0|''|"")\s*\)?\s*\)?\.(length|map|forEach|filter)/g),
  ];
  if (escapes.length) flags.push({ kind: 'a', why: '読み取りに逃げ道がある（拾えなくても既定値で緑になりうる）: ' + escapes.length + '箇所' });
  // (b) 除外リスト
  const ex = [...src.matchAll(/\b(EXCLUDE|EXCLUDED|SKIP|SKIPPED|IGNORE|ALLOW(?:LIST)?|WHITELIST|除外)\b/g)];
  if (ex.length) flags.push({ kind: 'b', why: '除外の仕組みがある（逃げていないか中身を読む）: ' + [...new Set(ex.map(m => m[1]))].join(',') });
  // ★(d) SKIPを緑と呼んでいる … 道具が入っていない時に exit(0) で抜けると
  //   「テストは通りました」と表示されるのに ★中身を1つも見ていない★。
  //   CI の道具が入らなくなった日に、全部が静かに緑になる（既知のHARDルール）。
  if (/SKIP[^\n]*process\.exit\(0\)|process\.exit\(0\)[^\n]*SKIP/.test(src)) {
    flags.push({ kind: 'd', why: '★SKIPして exit(0)＝緑扱いしている（道具が無い日に全部が黙って通る）' });
  }
  // (c) わざと壊す確認が無い
  if (!/--self-test/.test(src)) flags.push({ kind: 'c', why: '--self-test が無い（赤になることを一度も見ていない）' });
  return flags;
}

/* ★純関数: 走らせた出力から「何件検査したか」を数える。0件＝空振り確定。 */
export function countChecks(out) {
  const p = /(\d+)\s*passed,\s*(\d+)\s*failed/.exec(out);
  if (p) return { checks: Number(p[1]) + Number(p[2]), from: 'passed/failed' };
  // ★報告の書き方はテストごとに違う。「21/21 passed」の形も数える。
  //   ここを取りこぼすと ★この道具自身が「空振りだ」と嘘をつく★（実際 6本を誤って挙げた）。
  const q = /(\d+)\s*\/\s*(\d+)\s*passed/.exec(out);
  if (q) return { checks: Number(q[2]), from: 'N/N passed' };
  const ticks = (out.match(/[✓✗]/g) || []).length;
  if (ticks) return { checks: ticks, from: '✓の数' };
  const oks = (out.match(/^\s*ok\s/gm) || []).length;
  return { checks: oks, from: 'okの数' };
}

/* ★ソースから「検査を何件登録しているか」を数える。
 *   .test.js は単体では動かず、kyuyo/tests/run.js が用意する T() の上で動く（＝直接叩くと落ちる）。
 *   ★そこを「空振り」と数えてしまうと、この道具自身が嘘の表を出す。★
 *   走らせられない物は、登録している検査の数で見る。0件なら本当に空振り。 */
export function countRegistered(src) {
  return (src.match(/^\s*(?:T|test|it)\s*\(/gm) || []).length;
}

/* ══ self-test ═══════════════════════════════════════════════════════ */
if (process.argv.includes('--self-test')) {
  let pass = 0, fail = 0;
  const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + e.message); } };
  console.log('\n[hollow-guard --self-test] 空振り探しそのものが空振りしていないか');
  T('★逃げ道つきの読み取りを見つける（ym-pickerで実際にあった形）', () => {
    const f = inspect('const m = re.exec(CSS);\nreturn m ? Number(m[1]) : 0;\n// --self-test\n');
    if (!f.some(x => x.kind === 'a')) throw new Error('見つけられていない');
  });
  T('★除外リストを見つける', () => {
    const f = inspect('const EXCLUDE = ["a.js"];\n// --self-test\n');
    if (!f.some(x => x.kind === 'b')) throw new Error('見つけられていない');
  });
  T('★self-testが無いのを見つける', () => {
    if (!inspect('const a=1;').some(x => x.kind === 'c')) throw new Error('見つけられていない');
  });
  T('きれいなソースは何も出さない（誤検知を出さない）', () => {
    const f = inspect('const m = re.exec(CSS);\nif (!m) throw new Error("拾えていない");\n// --self-test\n');
    if (f.length) throw new Error('誤検知: ' + JSON.stringify(f));
  });
  T('★検査0件を空振りと数える', () => { if (countChecks('\n0 passed, 0 failed\n').checks !== 0) throw new Error('数えられていない'); });
  T('★単体で動かない物(ハーネス経由)を空振りと数えない', () => {
    const harness = "T('a', function () {});\nT('b', function () {});\n";
    if (countRegistered(harness) !== 2) throw new Error('登録数を数えられていない');
  });
  T('★SKIPして exit(0) を見つける（道具が無い日に黙って緑になる形）', () => {
    const src = "catch { console.log('SKIP: jsdom未導入'); process.exit(0); }\n// --self-test\n";
    if (!inspect(src).some(x => x.kind === 'd')) throw new Error('見つけられていない');
  });
  T('★飛ばさず赤にしている形は何も出さない（誤検知を出さない）', () => {
    const src = "catch { console.log('★jsdomが入っていません'); process.exit(1); }\n// --self-test\n";
    if (inspect(src).some(x => x.kind === 'd')) throw new Error('誤検知');
  });
  T('★本当に検査を1つも書いていなければ0', () => { if (countRegistered('const a=1;') !== 0) throw new Error('0にならない'); });
  T('検査があれば数が出る', () => { if (countChecks('\n7 passed, 1 failed\n').checks !== 8) throw new Error('数えられていない'); });
  // ★報告の書き方はテストごとに違う。取りこぼすと ★この道具自身が「空振りだ」と嘘をつく★
  //   （実際、最初の版は「21/21 passed」を読めず、健全な6本を空振り扱いした）
  T('★書き方が違っても数える（21/21 passed の形）', () => { if (countChecks('\nstamp: 21/21 passed\n').checks !== 21) throw new Error('取りこぼしている'); });
  T('★okの数でも数える', () => { if (countChecks('  ok   あ\n  ok   い\n').checks !== 2) throw new Error('取りこぼしている'); });
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

/* ══ 本番 ═══════════════════════════════════════════════════════════ */

/* ★対象から外す物。「検査ではない道具」だけ。理由を必ず書く（除外で逃げないため）。
 *   ここに検査を足したら、それは逃げ＝この一覧を読めばすぐ分かるようにしておく。 */
const NOT_A_CHECK = {
  'run.js': 'ハーネス本体（検査を並べて回す側）',
  'hollow-guard.test.mjs': 'この道具自身。表を出す形なので検査の数え方が当てはまらない',
  'fake-supa.js': '偽Supabase＝テストが使う部品。単体では何も検査しない',
  'dbtest-seed.mjs': 'DB-test の下ごしらえ／後片付けの道具。CIでは走らない',
  'live-seed.mjs': '実機確認の下ごしらえ／後片付けの道具。鍵が要る・CIでは走らない',
  'live-roundtrip.mjs': '本物のSupabaseへ本物のログインで往復する道具。鍵が要る・CIでは走らない',
  'live-seikyu.mjs': '請求書の棚へ本物のログインで往復し、凍結と番号の重複が実際に弾かれるか測る道具。鍵が要る・CIでは走らない',
};

// ★seikyu/tests を足した（2026-08-10）。足すまで請求書のテストは
//   この道具からも ci-coverage からも見えていなかった＝「何も見ていないのに緑」の口。
const FILES = [];
for (const dir of ['tests', 'kyuyo/tests', 'seikyu/tests']) {
  for (const f of fs.readdirSync(path.join(ROOT, dir))) {


    // ★.test.* だけを見ていたのが自分の死角だった。integration.mjs / ui-smoke.mjs 等も
    //   CIで走る「検証」なので同じ目で見る（実際そこに SKIP→exit(0) が6本隠れていた）。
    if (NOT_A_CHECK[f]) continue;                       // ★検査ではない道具（下に理由つきで列挙）
    if (/\.(mjs|js)$/.test(f)) FILES.push(path.join(dir, f).replace(/\\/g, '/'));
  }
}
FILES.sort();

const FULL = process.argv.includes('--full');
const rows = [];
for (const rel of FILES) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const flags = inspect(src);
  let checks = null, how = null;
  if (FULL) {
    let out = '', crashed = false;
    try {
      out = execFileSync(process.execPath, [rel], { cwd: ROOT, encoding: 'utf8', timeout: 180000, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { out = (e.stdout || '') + (e.stderr || ''); crashed = true; }
    const c = countChecks(out);
    if (c.checks > 0) { checks = c.checks; how = '実行'; }
    else if (crashed || /Cannot find module|is not defined/.test(out)) {
      // ★単体では動かない（ハーネス run.js の上で動く）。落ちたことを空振りと数えない。
      checks = countRegistered(src); how = 'ハーネス経由(登録数)';
    } else { checks = 0; how = '実行'; }
  }
  rows.push({ rel, flags, checks, how });
}

const skipGreen = rows.filter(r => r.flags.some(f => f.kind === 'd'));   // ★SKIPを緑扱い＝空振り確定
const hollow = rows.filter(r => r.checks === 0 || r.flags.some(f => f.kind === 'd'));  // ★空振り確定
const suspect = rows.filter(r => r.flags.some(f => f.kind === 'a' || f.kind === 'b'));
const noSelf = rows.filter(r => r.flags.some(f => f.kind === 'c'));

console.log('\n[hollow-guard] 空振りしているテストを探す（' + FILES.length + '本）\n');
console.log('■ ★空振り確定（走らせて検査0件）');
console.log(hollow.length ? hollow.map(r => '  ✗ ' + r.rel + '  [' + r.how + ']').join('\n') : '  （なし）' + (FULL ? '' : '  ※ --full を付けないと動的には見ていない'));
console.log('\n■ 要確認（逃げ道／除外の仕組みがある = 人が中身を読む）');
console.log(suspect.length ? suspect.map(r => '  ・' + r.rel.padEnd(42) + r.flags.filter(f => f.kind !== 'c').map(f => f.why).join(' / ')).join('\n') : '  （なし）');
console.log('\n■ --self-test が無い（' + noSelf.length + '/' + FILES.length + '本）');
console.log(noSelf.map(r => '  ・' + r.rel).join('\n'));
console.log('\n── 実測 ──');
console.log('  SKIPを緑扱い ' + skipGreen.length);
console.log('  空振り確定 ' + hollow.length + ' / 要確認 ' + suspect.length + ' / self-test無し ' + noSelf.length + ' / 全 ' + FILES.length);

process.exit(hollow.length ? 1 : 0);
