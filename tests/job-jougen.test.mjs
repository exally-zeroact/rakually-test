/* job-jougen.test.mjs — ★CI の job と 段に 上限（timeout-minutes）が 在るか 見張る★
 * ==============================================================================
 * ★なぜ 要るか（2026-10-30 実測）★
 *   ・.github/workflows/ の job 14本の うち ★12本に 上限が 無かった★＝GitHub の 既定 360分。
 *     固まると ★6時間 待たされ★、その間 手元の 押しの門（前の CI が 走る間は 押さない）も 止まる。
 *   ・★job の 上限で 切れると 結論は 赤(failure)ではなく cancelled（灰色）★（taiketsu 実測・Daikou で 20本中20本）。
 *     ★段の 上限で 切れると failure（赤）★。
 *     ⇒ 固まり得る 段（apt・playwright の 取り込み／外の 役所へ fetch する 段）には ★段の 上限★ を 付け、
 *       job の 上限は ★段の 上限の 合計より 長い 最後の 砦★に する（先に 段が 切れて 赤に なる）。
 *
 * ★決まり（どれか 1つでも 外れたら 赤）★
 *   ㋐ ★どの job にも 上限★（整数・1〜120分）
 *   ㋑ ★apt-get か playwright install を 走らせる 段には 段の 上限★
 *   ㋒ ★外へ 取りに 行く 見張りの workflow（DAN_ZENBU）は run の 段 全部に 段の 上限★
 *   ㋓ ★job の 上限 ≧ 段の 上限の 合計 ＋ 5分（支度の分）★＝段が 全部 固まっても job より 先に 段が 切れる
 *   ㋔ ★読み落とし止め★＝字で 数えた job の 数と 読めた 数が 合う／jobs の 字下げが 2（taiketsu 10-30 2回目 任意1）
 *   ㋕ ★上限が 重なって いない★（yaml の 読み手は 黙って 後ろを 取る・同 任意5）
 *   ㋖ ★段の 上限も 整数・1〜120分★（0 や 字は GitHub が 受け付けない・同 任意4）
 *   ★見えない 物★ … ci.yml の 試験の 段（約300本）は 段の 上限を 付けて いない＝そこで 固まると job で 切れて cancelled。
 *     その時は 注記「The job has exceeded the maximum execution time」を 見て ★固まり＝赤と 同じ★に 扱う（webkit.yml の 頭）。
 *     DAN_ZENBU と ㋑ の 字は 名簿と 字で 決めて いる＝新しい 外へ 取る workflow や `apt install` は 人が 足す。
 *
 * 使い方: node tests/job-jougen.test.mjs            … 今の yml を 数える
 *         node tests/job-jougen.test.mjs --self-test … ★わざと 壊して 赤に なるか★（10通り）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WF_DIR = path.join(ROOT, '.github/workflows');
const JOB_MAX = 120;
const SHITAKU = 5;
// ★外の 役所・入口・倉庫へ 取りに 行く 見張り★＝run の 段 全部に 段の 上限（㋒）
const DAN_ZENBU = ['hosts.yml', 'source-urls.yml', 'statutory-watch.yml', 'statutory-weekly.yml', 'warehouse.yml'];
const TORIKOMI = /apt-get|playwright install/;
const KAGI = /^( +)([A-Za-z0-9_-]+):\s*(#.*)?$/;
const JOUGEN = /^timeout-minutes:\s*([^\s#]+)\s*(#.*)?$/;

function seisuu(v) { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= JOB_MAX; }

// ★yml を 字で 読む★（job＝2字下げ・job の 上限＝4字下げ・段＝"      - "・段の 上限＝8字下げ）
//   ★1字目の 注記（# …）では jobs を 抜けない★・★job の 行の 後ろの 注記も job と 読む★
function yomu(src) {
  const L = src.split(/\r?\n/);
  const jobs = [];
  let inJobs = false, job = null, dan = null;
  for (const line of L) {
    if (/^jobs:/.test(line)) { inJobs = true; continue; }
    if (!inJobs) continue;
    if (/^[^\s#]/.test(line)) { inJobs = false; job = null; dan = null; continue; }
    const mj = line.match(KAGI);
    if (mj && mj[1].length === 2) { job = { name: mj[2], limit: null, dup: 0, steps: [] }; jobs.push(job); dan = null; continue; }
    if (!job) continue;
    if (line.startsWith('    ') && !line.startsWith('     ')) {
      const ml = line.slice(4).match(JOUGEN);
      if (ml) { if (job.limit != null) job.dup++; job.limit = ml[1]; continue; }
    }
    const ms = line.match(/^      - (.*)$/);
    if (ms) { dan = { head: ms[1], limit: null, dup: 0, run: /^run:/.test(ms[1]) ? ms[1] : '' }; job.steps.push(dan); continue; }
    if (!dan) continue;
    if (line.startsWith('        ') && !line.startsWith('         ')) {
      const md = line.slice(8).match(JOUGEN);
      if (md) { if (dan.limit != null) dan.dup++; dan.limit = md[1]; continue; }
      if (/^run:/.test(line.slice(8))) { dan.run = line; continue; }
    }
    if (dan.run && /^          /.test(line)) dan.run += '\n' + line;
  }
  return jobs;
}

// ★yomu と 別の 道で job を 数える★＝jobs: の 下の「コロンで 終わる 鍵」の 一番 浅い 字下げの 本数
function jiDeKazoeru(src) {
  const L = src.split(/\r?\n/);
  const i0 = L.findIndex((l) => /^jobs:/.test(l));
  if (i0 < 0) return { indent: 2, n: 0 };
  const keys = [];
  for (let i = i0 + 1; i < L.length; i++) {
    if (/^[^\s#]/.test(L[i])) break;
    const m = L[i].match(KAGI);
    if (m) keys.push(m[1].length);
  }
  if (!keys.length) return { indent: 2, n: 0 };
  const indent = Math.min(...keys);
  return { indent, n: keys.filter((k) => k === indent).length };
}

function kazoeru(files) {
  const aka = [];
  let nJob = 0, nDan = 0;
  for (const [f, src] of Object.entries(files)) {
    const jobs = yomu(src);
    const ji = jiDeKazoeru(src);
    if (ji.indent !== 2) aka.push('㋔ jobs の 字下げが 2 でない（読めない 形）: ' + f + ' = ' + ji.indent);
    else if (ji.n !== jobs.length) aka.push('㋔ job の 数が 合わない（読み落とし）: ' + f + ' 字で ' + ji.n + '・読めた ' + jobs.length);
    if (/^jobs:/m.test(src) && jobs.length === 0) aka.push('㋔ job を 1本も 読めない: ' + f);
    for (const job of jobs) {
      nJob++;
      const where = f + ' ' + job.name;
      if (job.dup) aka.push('㋕ job の 上限が 重なって いる: ' + where);
      if (job.limit == null) { aka.push('㋐ 上限が 無い: ' + where); continue; }
      if (!seisuu(job.limit)) { aka.push('㋐ 上限が 整数の 1〜' + JOB_MAX + ' でない: ' + where + ' = ' + job.limit); continue; }
      const jl = Number(job.limit);
      let sum = 0;
      for (const d of job.steps) {
        const dn = where + ' / ' + d.head.slice(0, 40);
        if (d.dup) aka.push('㋕ 段の 上限が 重なって いる: ' + dn);
        if (d.limit != null) {
          nDan++;
          if (!seisuu(d.limit)) aka.push('㋖ 段の 上限が 整数の 1〜' + JOB_MAX + ' でない: ' + dn + ' = ' + d.limit);
          sum += Number(d.limit) || 0;
        }
        if (!d.run) continue;
        if (TORIKOMI.test(d.run) && d.limit == null) aka.push('㋑ 取り込みの 段に 段の 上限が 無い: ' + dn);
        if (DAN_ZENBU.includes(f) && d.limit == null) aka.push('㋒ 外へ 取りに 行く 段に 段の 上限が 無い: ' + dn);
      }
      if (sum + SHITAKU > jl) aka.push('㋓ job の 上限 ' + jl + ' < 段の 上限の 合計 ' + sum + ' ＋ ' + SHITAKU + ': ' + where);
    }
  }
  return { aka, nJob, nDan };
}

const files = {};
for (const f of fs.readdirSync(WF_DIR).filter((x) => /\.ya?ml$/.test(x)).sort()) {
  files[f] = fs.readFileSync(path.join(WF_DIR, f), 'utf8');
}
for (const f of DAN_ZENBU) if (!files[f]) { console.log('✗ DAN_ZENBU に 在るのに yml が 無い: ' + f); process.exit(1); }

console.log('\n[job-jougen] CI の job と 段に 上限が 在るか');
const r = kazoeru(files);
console.log('  workflow ' + Object.keys(files).length + '本・job ' + r.nJob + '本・段の 上限 ' + r.nDan + '個');
for (const a of r.aka) console.log('  ✗ ' + a);
let zenAka = r.aka.length;
if (r.nJob === 0) { console.log('  ✗ job を 1本も 拾えない（読み方が 壊れた）'); zenAka++; }

if (process.argv.includes('--self-test')) {
  // ★わざと 壊して 赤に なるか★＝壊した 時に 決まりの 印が 出なければ 物差しが 空振り
  const jobsNoShita = (s, fn) => s.replace(/^jobs:\n([\s\S]*)$/m, (m, b) => 'jobs:\n' + fn(b));
  const kowasu = [
    ['㋐', 'ci.yml', (s) => s.replace(/^    timeout-minutes: \d+\n/m, '')],
    ['㋐', 'ci.yml', (s) => s.replace(/^    timeout-minutes: \d+$/m, '    timeout-minutes: 360')],
    ['㋑', 'webkit.yml', (s) => s.replace(/(- name: Install WebKit\n)        timeout-minutes: \d+\n/, '$1')],
    ['㋒', 'source-urls.yml', (s) => s.replace(/^        timeout-minutes: \d+\n/m, '')],
    ['㋓', 'warehouse.yml', (s) => s.replace(/^    timeout-minutes: \d+$/m, '    timeout-minutes: 10')],
    // ★読み落とし★（taiketsu 10-30 2回目 任意1）＝job の 行に 注記を 付けて 上限を 抜く（P1）
    ['㋐', 'ci.yml', (s) => s.replace(/^  kuchi:\n(    runs-on: [^\n]+\n)    timeout-minutes: \d+\n/m, '  kuchi:   # 注記\n$1')],
    // ★jobs の 中の 1字目に 注記 ＋ 後ろの job の 上限を 抜く（P2）
    ['㋐', 'ci.yml', (s) => s.replace(/^  kinshi:\n(    runs-on: [^\n]+\n)    timeout-minutes: \d+\n/m, '# 1字目の 注記\n  kinshi:\n$1')],
    // ★4字下げで 書いた workflow（P14）
    ['㋔', 'hosts.yml', (s) => jobsNoShita(s, (b) => b.split('\n').map((l) => (l ? '  ' + l : l)).join('\n'))],
    ['㋕', 'hosts.yml', (s) => s.replace(/^(    timeout-minutes: \d+\n)/m, '$1$1')],
    ['㋖', 'hosts.yml', (s) => s.replace(/^        timeout-minutes: \d+$/m, '        timeout-minutes: 0')],
  ];
  let ok = 0;
  for (const [shirushi, f, fn] of kowasu) {
    const moto = files[f];
    const kowashita = fn(moto);
    if (kowashita === moto) { console.log('  ✗ 壊す所が 見つからない（' + shirushi + ' ' + f + '）'); zenAka++; continue; }
    const rr = kazoeru({ ...files, [f]: kowashita });
    if (rr.aka.some((a) => a.startsWith(shirushi))) { ok++; console.log('  ✓ 壊すと 赤（' + shirushi + ' ' + f + '）'); }
    else { console.log('  ✗ 壊しても 赤に ならない（' + shirushi + ' ' + f + '）'); zenAka++; }
  }
  console.log('  わざと 壊した ' + kowasu.length + '通り 中 赤 ' + ok);
}

console.log(zenAka ? '  ✗ 赤 ' + zenAka : '  ✓ 赤 0');
process.exit(zenAka ? 1 : 0);
