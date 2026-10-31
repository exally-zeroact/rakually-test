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
 *   ㋗ ★週1の お金の 見張り（USHIRO）は 最初の run 段より 後ろの run 段 全部に if: ${{ !cancelled() }}★
 *      （2026-10-31 実測＝source-urls.yml は 10-05〜10-26 の 4回、段1の 404 で 後ろ 7段が skipped＝
 *        最賃・88,000円・労災・社保の 見張りが 4週 走らなかった。taiketsu 10-31 任A）
 *      ★always() は 使わない★＝job の 上限で 切れた（cancelled）時まで 走る。if の 字は ぴったり 一致で 見る・後ろの uses 段も・continue-on-error は 段にも job にも 不可・job の if も 不可（taiketsu 任意1〜3・2回目 任A任B）。
 *      hosts／warehouse は 外す＝先の 段が 判定の 自己確認で、それが 赤なら 後ろは 走らせない 作り。
 *   ★見えない 物★ … ci.yml の 試験の 段（約300本）は 段の 上限を 付けて いない＝そこで 固まると job で 切れて cancelled。
 *     その時は 注記「The job has exceeded the maximum execution time」を 見て ★固まり＝赤と 同じ★に 扱う（webkit.yml の 頭）。
 *     DAN_ZENBU と ㋑ の 字は 名簿と 字で 決めて いる＝新しい 外へ 取る workflow や `apt install` は 人が 足す。
 *
 * 使い方: node tests/job-jougen.test.mjs            … 今の yml を 数える
 *         node tests/job-jougen.test.mjs --self-test … ★わざと 壊して 赤に なるか★（20通り）
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
// ★1段 赤でも 後ろの お金の 見張りを 走らせる★（㋗）
const USHIRO = ['source-urls.yml', 'statutory-weekly.yml'];
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
      // ★job に 付けた continue-on-error／if★（㋗・taiketsu 10-31 2回目 任B）＝job まるごと 緑に 見える／飛ぶ
      if (/^(continue-on-error|if):/.test(line.slice(4))) { (job.jobKey = job.jobKey || []).push(line.slice(4).split(':')[0]); continue; }
    }
    const ms = line.match(/^      - (.*)$/);
    if (ms) { dan = { head: ms[1], limit: null, dup: 0, if: /^if:/.test(ms[1]) ? ms[1].slice(3).trim() : '', coe: /^continue-on-error:/.test(ms[1]), run: /^run:/.test(ms[1]) ? ms[1] : '' }; job.steps.push(dan); continue; }
    if (!dan) continue;
    if (line.startsWith('        ') && !line.startsWith('         ')) {
      const md = line.slice(8).match(JOUGEN);
      if (md) { if (dan.limit != null) dan.dup++; dan.limit = md[1]; continue; }
      if (/^run:/.test(line.slice(8))) { dan.run = line; continue; }
      const mi = line.slice(8).match(/^if:\s*(.*)$/);
      if (mi) { dan.if = mi[1]; continue; }
      if (/^continue-on-error:/.test(line.slice(8))) { dan.coe = true; continue; }
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
  let nJob = 0, nDan = 0, nUshiro = 0;
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
      if (USHIRO.includes(f) && job.jobKey) aka.push('㋗ 週1の お金の 見張りの job に ' + job.jobKey.join('／') + ' を 置かない（job まるごと 緑・飛ぶ）: ' + where);
      const jl = Number(job.limit);
      let sum = 0, nRun = 0;
      for (const d of job.steps) {
        const dn = where + ' / ' + d.head.slice(0, 40);
        if (d.dup) aka.push('㋕ 段の 上限が 重なって いる: ' + dn);
        if (d.limit != null) {
          nDan++;
          if (!seisuu(d.limit)) aka.push('㋖ 段の 上限が 整数の 1〜' + JOB_MAX + ' でない: ' + dn + ' = ' + d.limit);
          sum += Number(d.limit) || 0;
        }
        // ★㋗ 週1の お金の 見張り★（taiketsu 10-31 任意1〜3）
        //   ・if は ★字が ぴったり ${{ !cancelled() }}★（`!cancelled()` を 裸で 書くと YAML の tag に なって 読めない／
        //     `&& success()` を 足すと 直す前と 同じ＝「含むか」では 通って しまう）
        //   ・最初の run 段より 後ろは uses の 段も 同じ／continue-on-error は 段の 赤を 消す＝偽の 緑なので 置かない
        if (USHIRO.includes(f)) {
          if (d.coe) aka.push('㋗ continue-on-error は 赤を 消す（週1の お金の 見張りに 置かない）: ' + dn);
          if (d.run || nRun >= 1) {
            if (d.run) nRun++;
            if (nRun > 1 || !d.run) {
              const c = (d.if || '').replace(/\s+#.*$/, '').trim();
              if (!/^\$\{\{\s*!cancelled\(\)\s*\}\}$/.test(c)) aka.push('㋗ 前の 段が 赤だと 飛ぶ（if: が ぴったり ${{ !cancelled() }} でない）: ' + dn + (c ? ' = ' + c : ''));
              else nUshiro++;
            }
          }
        }
        if (!d.run) continue;
        if (TORIKOMI.test(d.run) && d.limit == null) aka.push('㋑ 取り込みの 段に 段の 上限が 無い: ' + dn);
        if (DAN_ZENBU.includes(f) && d.limit == null) aka.push('㋒ 外へ 取りに 行く 段に 段の 上限が 無い: ' + dn);
      }
      if (sum + SHITAKU > jl) aka.push('㋓ job の 上限 ' + jl + ' < 段の 上限の 合計 ' + sum + ' ＋ ' + SHITAKU + ': ' + where);
    }
  }
  for (const f of USHIRO) if (files[f] && !yomu(files[f]).some((j) => j.steps.filter((d) => d.run).length > 1)) aka.push('㋗ run の 段が 2つ 以上 読めない（読み方が 壊れた）: ' + f);
  return { aka, nJob, nDan, nUshiro };
}

const files = {};
for (const f of fs.readdirSync(WF_DIR).filter((x) => /\.ya?ml$/.test(x)).sort()) {
  files[f] = fs.readFileSync(path.join(WF_DIR, f), 'utf8');
}
for (const f of [...DAN_ZENBU, ...USHIRO]) if (!files[f]) { console.log('✗ DAN_ZENBU に 在るのに yml が 無い: ' + f); process.exit(1); }

console.log('\n[job-jougen] CI の job と 段に 上限が 在るか');
const r = kazoeru(files);
console.log('  workflow ' + Object.keys(files).length + '本・job ' + r.nJob + '本・段の 上限 ' + r.nDan + '個・週1の 後ろも 走る 段 ' + r.nUshiro + '個');
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
    // ★週1の 後ろの 段から !cancelled() を 抜く（先頭の 1つ／最後の 1つ）・always() に 替える★（㋗）
    ['㋗', 'source-urls.yml', (s) => s.replace(/^        if: \$\{\{ !cancelled\(\) \}\}[^\n]*\n/m, '')],
    ['㋗', 'statutory-weekly.yml', (s) => { const i = s.lastIndexOf('\n        if: ${{ !cancelled() }}'); return i < 0 ? s : s.slice(0, i) + s.slice(s.indexOf('\n', i + 1)); }],
    ['㋗', 'source-urls.yml', (s) => s.replace(/^        if: \$\{\{ !cancelled\(\) \}\}/m, '        if: ${{ always() }}')],
    // ★含むかでは 通る 形★（taiketsu 10-31 任意1〜3）＝裸の !cancelled()／&& success()／後ろに uses の 段／continue-on-error
    ['㋗', 'statutory-weekly.yml', (s) => s.replace(/^        if: \$\{\{ !cancelled\(\) \}\}/m, '        if: !cancelled()')],
    ['㋗', 'source-urls.yml', (s) => s.replace(/^        if: \$\{\{ !cancelled\(\) \}\}/m, '        if: ${{ !cancelled() && success() }}')],
    ['㋗', 'source-urls.yml', (s) => s.replace(/\s*$/, '\n      - uses: actions/upload-artifact@v4\n        timeout-minutes: 5\n        with:\n          name: x\n          path: x\n')],
    ['㋗', 'statutory-weekly.yml', (s) => s.replace(/^(        if: \$\{\{ !cancelled\(\) \}\}[^\n]*\n)/m, '$1        continue-on-error: true\n')],
    // ★段の 頭の 行の continue-on-error／job の continue-on-error・if★（taiketsu 10-31 2回目 任A・任B）
    ['㋗', 'source-urls.yml', (s) => s.replace(/^      - name: (★賃金要件[^\n]*)\n/m, '      - continue-on-error: true\n        name: $1\n')],
    ['㋗', 'statutory-weekly.yml', (s) => s.replace(/^(    timeout-minutes: \d+\n)/m, '$1    continue-on-error: true\n')],
    ['㋗', 'source-urls.yml', (s) => s.replace(/^(    timeout-minutes: \d+\n)/m, '$1    if: ${{ false }}\n')],
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
