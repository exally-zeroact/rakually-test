/* statutory-watch-ochiru.test.mjs — ★法定データの 週1の 見張りが 落ちたら 赤に なるか★
 * ==============================================================================
 * ★なぜ 要るか（2026-11-01・taiketsu 10-31 別件）★
 *   .github/workflows/statutory-watch.yml の 段1（id: check）は `set +e … exit 0` で、
 *   statutory-reminder.mjs が 何で 落ちても（lib が 読めない＝code 1 等）段は 緑・
 *   後ろの 2段（code==10 で Issue／code==0 で 閉じる）は 両方 飛んで ★job は 緑★だった。
 *   ＝最賃・社保・雇用・所得税の 年度更新の 催促が ★黙って 止まる★（分からない 時に 通す 側）。
 *
 * ★測り方★ … yml から 段1の run の 字を 抜き、★本物と 同じ bash の 起こし方★
 *   （★shell: を 書かない 時の GitHub の 既定＝bash -e {0}・pipefail は 付かない★。
 *     -eo pipefail は shell: bash と 明示した 時だけ＝そちらで 測ると `node … | cat` で 偽の 緑・taiketsu 11-01 2回目）で 本当に 走らせる。
 *   node だけ 偽物（bash の 関数）に 替えて code を 選ぶ。
 *   ㋐ code 0  → 段は 緑・出し code=0（後ろの「閉じる」段が 走る）
 *   ㋑ code 10 → 段は 緑・出し code=10（後ろの「Issue」段が 走る）
 *   ㋒ code 1／2／127／134 → ★段が 赤★
 *   ㋓ 段1・job に continue-on-error が 無い（在ると 赤が 緑に 化ける）／後ろの 2段の if が 10 と 0 を 見る
 *
 * 使い方: node tests/statutory-watch-ochiru.test.mjs            … 今の yml を 数える
 *         node tests/statutory-watch-ochiru.test.mjs --self-test … ★わざと 壊して 赤に なるか★（11通り）
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const YML = path.join(ROOT, '.github/workflows/statutory-watch.yml');

// ★Windows の 手元では Git の bash を 使う★（System32 の bash.exe は WSL＝別物）
function bashPath() {
  if (process.platform !== 'win32') return 'bash';
  for (const p of ['C:/Program Files/Git/bin/bash.exe', 'C:/Program Files (x86)/Git/bin/bash.exe']) if (fs.existsSync(p)) return p;
  return null;
}

// ★段を 字で 読む★（段＝"      - "・段の 鍵＝8字下げ・run の 中身＝10字下げ）
function dan(src) {
  const L = src.split(/\r?\n/);
  const out = [];
  let d = null, inRun = false;
  let jobCoe = false;
  for (const line of L) {
    if (/^    continue-on-error:/.test(line)) jobCoe = true;
    const ms = line.match(/^      - (.*)$/);
    if (ms) { d = { head: ms[1], id: '', if: '', coe: /^continue-on-error:/.test(ms[1]), run: null }; out.push(d); inRun = false; continue; }
    if (!d) continue;
    if (/^        \S/.test(line)) {
      inRun = false;
      const k = line.slice(8);
      let m;
      if ((m = k.match(/^id:\s*(\S+)/))) d.id = m[1];
      else if ((m = k.match(/^if:\s*(.*)$/))) d.if = m[1].trim();
      else if (/^continue-on-error:/.test(k)) d.coe = true;
      else if (/^run:\s*\|\s*$/.test(k)) { d.run = []; inRun = true; }
      continue;
    }
    if (inRun) {
      if (line === '' || /^          /.test(line)) d.run.push(line.slice(10));
      else inRun = false;
    }
  }
  return { steps: out, jobCoe };
}

function hashiraseru(run, code, bash) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stw-'));
  const outF = path.join(dir, 'out');
  fs.writeFileSync(outF, '');
  const fake = 'node() { echo "STATUS=偽物 code=' + code + '"; return ' + code + '; }\n';
  const sh = path.join(dir, 'step.sh');
  fs.writeFileSync(sh, fake + run.join('\n') + '\n');
  const r = spawnSync(bash, ['-e', sh], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: outF }, timeout: 20000,
  });
  const out = fs.readFileSync(outF, 'utf8');
  fs.rmSync(dir, { recursive: true, force: true });
  const m = out.match(/^code=(\d+)$/m);
  // ★本文（body<<EOF … EOF）も 出ているか★＝消えると Issue の 本文が 空（taiketsu 11-01 任意3）
  const body = /^body<<EOF\n[\s\S]*STATUS=偽物 code=\d+[\s\S]*\nEOF$/m.test(out);
  // ★シグナルで 殺された（status＝null）は 測れない＝赤★（同 任意1）
  return { status: r.status, code: m ? m[1] : null, body, err: r.error ? String(r.error) : (r.status == null ? 'signal ' + r.signal : '') };
}

function kazoeru(src, bash) {
  const aka = [];
  const { steps, jobCoe } = dan(src);
  const check = steps.find((s) => s.id === 'check');
  if (!check) return ['㋓ id: check の 段が 読めない'];
  if (!check.run || !check.run.some((l) => /statutory-reminder\.mjs/.test(l))) aka.push('㋓ 段1の run に statutory-reminder.mjs が 無い（読み方が 壊れた）');
  if (check.coe) aka.push('㋓ 段1に continue-on-error（赤が 緑に 化ける）');
  if (jobCoe) aka.push('㋓ job に continue-on-error（赤が 緑に 化ける）');
  // ★段1より 後ろ・10 は gh issue create の 段・0 は gh issue close の 段★（taiketsu 11-01 任意2）
  const iC = steps.indexOf(check);
  const ato = (v, cmd) => steps.some((d, i) => i > iC && d.if.replace(/\s+#.*$/, '') === "steps.check.outputs.code == '" + v + "'" && (d.run || []).some((l) => l.includes(cmd)));
  if (!ato('10', 'gh issue create')) aka.push("㋓ 段1の 後ろに if: steps.check.outputs.code == '10' で gh issue create する 段が 無い");
  if (!ato('0', 'gh issue close')) aka.push("㋓ 段1の 後ろに if: steps.check.outputs.code == '0' で gh issue close する 段が 無い");
  if (!check.run) return aka;
  for (const c of [0, 10]) {
    const r = hashiraseru(check.run, c, bash);
    const s = c === 0 ? '㋐' : '㋑';
    if (r.err) aka.push(s + ' 走らせられない: ' + r.err);
    else if (r.status !== 0) aka.push(s + ' code ' + c + ' で 段が 赤（' + r.status + '）');
    else if (r.code !== String(c)) aka.push(s + ' code ' + c + ' の 出しが ' + r.code);
    else if (!r.body) aka.push(s + ' code ' + c + ' で 本文（body）の 出しが 無い');
  }
  for (const c of [1, 2, 127, 134]) {
    const r = hashiraseru(check.run, c, bash);
    if (r.err) aka.push('㋒ 走らせられない: ' + r.err);
    else if (r.status !== 1) aka.push('㋒ code ' + c + ' で 段が exit 1 で 落ちない（' + r.status + '）＝緑なら 後ろが 飛んで job 緑');
  }
  return aka;
}

console.log('\n[statutory-watch-ochiru] 法定データの 週1の 見張りが 落ちたら 赤に なるか');
const bash = bashPath();
if (!bash) { console.log('  ✗ bash が 見つからない（測れない＝緑に しない）'); process.exit(1); }
const src = fs.readFileSync(YML, 'utf8');
const aka = kazoeru(src, bash);
for (const a of aka) console.log('  ✗ ' + a);
let zenAka = aka.length;
if (!zenAka) console.log('  ✓ code 0／10 は 緑・code 1／2／127／134 は 赤・continue-on-error 0・後ろの if 2つ');

if (process.argv.includes('--self-test')) {
  const kowasu = [
    ['㋒', '赤の 3行を 抜く（直す前の 形）', (s) => s.replace(/^ *if \[ "\$CODE" != 0 \][^\n]*\n[^\n]*\n *exit 1\n *fi\n/m, '')],
    ['㋒', 'exit 1 を exit 0 に', (s) => s.replace(/^( *)exit 1$/m, '$1exit 0')],
    ['㋒', 'node の 後ろに || true', (s) => s.replace('statutory-reminder.mjs)', 'statutory-reminder.mjs || true)')],
    ['㋒', 'node の 後ろに | cat（pipefail が 無いと code が 消える）', (s) => s.replace('statutory-reminder.mjs)', 'statutory-reminder.mjs | cat)')],
    ['㋐', '0 も 赤に する', (s) => s.replace('[ "$CODE" != 0 ] && ', '')],
    ['㋑', '10 も 赤に する', (s) => s.replace(' && [ "$CODE" != 10 ]', '')],
    ['㋓', '段1に continue-on-error', (s) => s.replace(/^(        id: check\n)/m, '$1        continue-on-error: true\n')],
    ['㋓', 'job に continue-on-error', (s) => s.replace(/^(    timeout-minutes: \d+\n)/m, '$1    continue-on-error: true\n')],
    ['㋓', "Issue 段の if を 外す", (s) => s.replace(/^        if: steps\.check\.outputs\.code == '10'\n/m, '')],
    ['㋓', "Issue 段と 閉じる 段の if を 入れ替える", (s) => s.replace("code == '10'", 'code == @@').replace("code == '0'", "code == '10'").replace('code == @@', "code == '0'")],
    ['㋐', "本文（body）の 出しを 消す", (s) => s.replace(/^ *\{\n *echo 'body<<EOF'\n *echo "\$OUT"\n *echo EOF\n *\} >> "\$GITHUB_OUTPUT"\n/m, '')],
  ];
  let ok = 0;
  for (const [shirushi, na, fn] of kowasu) {
    const k = fn(src);
    if (k === src) { console.log('  ✗ 壊す所が 見つからない（' + na + '）'); zenAka++; continue; }
    const rr = kazoeru(k, bash);
    if (rr.some((a) => a.startsWith(shirushi))) { ok++; console.log('  ✓ 壊すと 赤（' + shirushi + ' ' + na + '）'); }
    else { console.log('  ✗ 壊しても 赤に ならない（' + shirushi + ' ' + na + '）'); zenAka++; }
  }
  console.log('  わざと 壊した ' + kowasu.length + '通り 中 赤 ' + ok);
}

console.log(zenAka ? '  ✗ 赤 ' + zenAka : '  ✓ 赤 0');
process.exit(zenAka ? 1 : 0);
