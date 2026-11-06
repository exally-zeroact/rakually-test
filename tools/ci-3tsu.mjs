/* ci-3tsu.mjs — ★GitHub の run の 緑を 4つ組に 割る★（走らせず・ログを 読むだけ）
 * ============================================================================
 * ★なぜ★ … 「CI success・256段」は ★中で 抜けた段（未測定）を 割っていない 盛り★。
 *   同じ _bunrui を GitHub の ログに 当てて、測った/一部抜け/丸ごと抜け/読めない/exit0failed に 割る。
 * ★使い方★ … node tools/ci-3tsu.mjs [--run=<id>|--run <id>|<id>] [-R <owner/repo>]   （run 無しは main の 最新 CI・読めない 引数は exit 2）
 * ★注★ … ブラウザ/倉庫の 段は CI では 抜ける（鍵が 無い）＝★この 本数には 入らない★
 *   （網の 側の 本数は bunrui を oshu-mae に 配線した 後の 押しで 出る）。
 */
import { spawnSync } from 'node:child_process';
import { bunrui, OKE_JUN } from './_bunrui.mjs';

const gh = (args) => {
  const r = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) { console.error('gh ' + args.join(' ') + ' が 失敗:\n' + (r.stderr || '')); process.exit(2); }
  return r.stdout || '';
};

/* ★引数の 読み方★（11-06 kensan の 宿題＝`--run 123` や `123` を 渡すと 黙って 捨て、main の 最新を 数えていた
 *   ＝頼んだ run と 違う run の 数を 返す）。読めない 引数は 止める（exit 2）。 */
function hikisuu(argv) {
  let runId = null; let repo = null; const bad = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    let m;
    if ((m = /^--run=(\d+)$/.exec(a))) runId = m[1];
    else if (a === '--run' && /^\d+$/.test(argv[i + 1] || '')) runId = argv[++i];
    else if (/^\d+$/.test(a)) runId = a;
    else if ((m = /^(?:--repo=|-R=)([\w.-]+\/[\w.-]+)$/.exec(a))) repo = m[1];
    else if ((a === '--repo' || a === '-R') && /^[\w.-]+\/[\w.-]+$/.test(argv[i + 1] || '')) repo = argv[++i];
    else if (a === '--self-test') { /* 下で 見る */ }
    else bad.push(a);
  }
  return { runId, repo, bad };
}

if (process.argv.includes('--self-test')) {
  const tame = [
    [['--run=42'], '42', null, 0], [['--run', '42'], '42', null, 0], [['42'], '42', null, 0],
    [[], null, null, 0], [['--run'], null, null, 1], [['--run=abc'], null, null, 1], [['--rn=42'], null, null, 1],
    [['-R', 'a/b', '--run=7'], '7', 'a/b', 0], [['--repo=a/b', '7'], '7', 'a/b', 0], [['-R'], null, null, 1],
  ];
  let aka = 0;
  for (const [args, run, repo, nBad] of tame) {
    const r = hikisuu(args);
    const ok = r.runId === run && r.repo === repo && r.bad.length === nBad;
    if (!ok) aka++;
    console.log((ok ? '  ✓ ' : '  ✗ ') + JSON.stringify(args) + ' → run=' + r.runId + ' repo=' + r.repo + ' 読めない=' + r.bad.length);
  }
  console.log((tame.length - aka) + ' passed, ' + aka + ' failed');
  process.exit(aka ? 1 : 0);
}

const H = hikisuu(process.argv.slice(2));
if (H.bad.length) { console.error('[ci-3tsu] 読めない 引数: ' + H.bad.join(' ') + '（使い方 [--run=<id>|--run <id>|<id>] [-R <owner/repo>]）'); process.exit(2); }
const R = H.repo ? ['-R', H.repo] : [];
let runId = H.runId;
if (!runId) {
  const j = JSON.parse(gh(['run', 'list', ...R, '--branch', 'main', '--limit', '10', '--json', 'databaseId,name,headSha,conclusion']));
  const ci = j.find((x) => x.name === 'CI');
  if (!ci) { console.error('main の CI run が 見つかりません'); process.exit(2); }
  runId = String(ci.databaseId);
}

/* 段の 結論（success/failure/skipped）… job+step で 引く */
const jobs = JSON.parse(gh(['run', 'view', runId, ...R, '--json', 'jobs,headSha,displayTitle']));
const ketsuron = new Map();   /* key: job\tstep → conclusion */
jobs.jobs.forEach((jb) => jb.steps.forEach((st) => ketsuron.set(jb.name + '\t' + st.name, st.conclusion)));

/* ログを 段ごとに 束ねる（行頭＝job<TAB>step<TAB>時刻 本文） */
const log = gh(['run', 'view', runId, ...R, '--log']);
const NL = String.fromCharCode(10);
const dan = new Map();   /* key: job\tstep → 本文(連結) */
log.split(NL).forEach((line) => {
  const t1 = line.indexOf('\t'); if (t1 < 0) return;
  const t2 = line.indexOf('\t', t1 + 1); if (t2 < 0) return;
  const key = line.slice(0, t2);
  const rest = line.slice(t2 + 1).replace(/^\S+\s/, '');   /* 時刻を 落とす */
  dan.set(key, (dan.get(key) || '') + rest + NL);
});

const tally = {}; OKE_JUN.forEach((k) => (tally[k] = []));
let hiShiken = 0;   /* 非試験（passed/未測定/KEKKA を 1つも 持たない段＝setup 等） */
const yomikata = { 約束: 0, 目印: 0 };

for (const [key, out] of dan.entries()) {
  /* ★✓/✗ の 印も 信号に 含める（2026-10-03・⑧b）★＝✗だけの 段（わざと壊す 自己確認 等）を
     「非試験」として 黙って 除くと ★本物の「赤を緑」も 見逃す★。行頭の ✓␠/✗␠ だけ（凡例 ✓＝… は 外す）。 */
  const hasSignal = /\d+\s*passed|未測定|はかれない|測りません|^\s*KEKKA\s|^\s*[✓✗]\s+\S/m.test(out);
  if (!hasSignal) { hiShiken++; continue; }   /* 試験でない段は 4つ組に 入れない */
  const con = ketsuron.get(key);
  const status = con === 'success' ? 0 : (con === 'skipped' ? 'skip' : 1);
  if (status === 'skip') continue;
  const r = bunrui(status, out);
  tally[r.oke].push({ step: key.split('\t')[1], r });
  if (r.how === '約束') yomikata.約束++; else if (r.how === '目印') yomikata.目印++;
}

const n = (k) => tally[k].length;
console.log('\n[ci-3tsu] run=' + runId + '（' + (jobs.displayTitle || '') + '／' + (jobs.headSha || '').slice(0, 7) + '）');
console.log('  試験の段 ' + (OKE_JUN.reduce((a, k) => a + n(k), 0)) + ' ＝ 測った ' + n('測った')
  + '／一部抜け ' + n('一部抜け') + '／丸ごと抜け ' + n('丸ごと抜け') + '／読めない ' + n('読めない')
  + '／exit0failed ' + n('exit0failed') + '／赤 ' + n('赤'));
console.log('  読み方 … 約束の行 ' + yomikata.約束 + '本／字の目印 ' + yomikata.目印 + '本（約束を 増やし 目印を 減らす）');
console.log('  非試験の段（setup 等・4つ組の外） ' + hiShiken + '段');
console.log('  ★ブラウザ/倉庫の段は CI では 抜ける＝この 本数には 入らない★');

const dasu = (k, mark) => { if (n(k)) { console.log('  --- ' + k + ' ' + n(k) + '本 ---'); tally[k].forEach((x) => console.log('   ' + mark + ' ' + x.step + '  [' + x.r.how + ' p' + x.r.passed + ' f' + x.r.failed + ' 未' + x.r.mimiso + ']')); } };
dasu('exit0failed', '◆');   /* ★赤を 緑と 言う 試験＝まず 本数★ */
dasu('丸ごと抜け', '○');
dasu('読めない', '?');
dasu('一部抜け', '△');
dasu('赤', '✗');
