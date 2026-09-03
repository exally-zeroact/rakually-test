/* aka-kiroku.mjs — ★「たまに赤」の 記録係★（赤の中身は 次の回で 上書きされる）
 * ============================================================================
 * ★なぜ（2026-09-03 実測）★
 *   本番へ 押す前に webkit.yml を 総なめしたら ★ask-look-webkit が 1本だけ 赤★。
 *   単発で 走らせると ★緑（3 passed）★／2回 回し直しても ★赤0★＝★再現しない★。
 *   ⇒ うちの決まり ★「たまに赤」は まず 記録係を 置く★（2026-08-29／指示役 2026-09-03 の裁定0）
 *     ＝★推理を 先に 語らない★・★次に 出た時に 中身が 残る形★にしてから 進む。
 *
 * ★借り物★ 形は ★Timeally の `scripts/screen-check.mjs`（正本）★ から 借りた
 *   （★借りてよいのは 道具・測り方・試験★＝見た目は 借りない）。
 *   借りた考え … ①走った回数と 赤の回数を 数える ②赤の時の ★出た物 まるごと★を
 *   ★時刻つきの別名★で 残す（上書きしない）③★空の控えを 作らない★（理由を 書く）
 *   ④★止め方は 変えない★＝赤は そのまま 赤で 止まる（握りつぶさない）。
 *
 * ★使い方★
 *   node tools/aka-kiroku.mjs -- <走らせる物…>
 *     例) node tools/aka-kiroku.mjs -- node seikyu/tests/ask-look-webkit.mjs
 *   ・緑なら … 何も残さず そのまま 0 で 終わる（数えだけ 足す）
 *   ・赤なら … ★出た物を 控えに 残し★、★同じ終わり値で 終わる★
 *   node tools/aka-kiroku.mjs --show    … 何回 走って 何回 赤かを 出す
 *
 * ★控えの場所★ … repo の外（TEMP/rakunally-aka/）＝★配信にも git にも 入れない★
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(os.tmpdir(), 'rakunally-aka');
const KIROKU = path.join(OUT, 'aka.log');
fs.mkdirSync(OUT, { recursive: true });

const kazoeru = () => {
  try {
    const t = fs.readFileSync(KIROKU, 'utf8').split('\n');
    const run = t.filter((l) => l.indexOf('\t走った\t') > 0);
    const aka = t.filter((l) => l.indexOf('\t★赤★\t') > 0);
    return { run: run.length, aka: aka.length, akaLines: aka.slice(-5) };
  } catch { return { run: 0, aka: 0, akaLines: [] }; }
};

if (process.argv.includes('--show')) {
  const k = kazoeru();
  console.log('\n[aka-kiroku] 走った ' + k.run + '回 ／ ★赤 ' + k.aka + '回★'
    + (k.run ? '（' + Math.round((k.aka / k.run) * 100) + '%）' : ''));
  console.log('  控えの場所 … ' + OUT);
  k.akaLines.forEach((l) => console.log('   ' + l));
  process.exit(0);
}

const i = process.argv.indexOf('--');
const cmd = (i >= 0) ? process.argv.slice(i + 1) : [];
if (!cmd.length) {
  console.error('使い方: node tools/aka-kiroku.mjs -- <走らせる物…>  ／  --show で 数を出す');
  process.exit(2);
}

const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
const NAME = cmd.join(' ').replace(/[^\w.\- ]/g, '_').slice(0, 60);
fs.appendFileSync(KIROKU, new Date().toISOString() + '\t走った\t' + RUN_ID + '\t' + NAME + '\n', 'utf8');

const r = spawnSync(cmd[0], cmd.slice(1), { cwd: ROOT, encoding: 'utf8', maxBuffer: 40 * 1024 * 1024 });
const out = String(r.stdout || '') + String(r.stderr || '');
process.stdout.write(out);

const code = (r.status === null) ? 1 : r.status;
if (code !== 0) {
  /* ★空の控えを 作らない★＝1文字も 返さない赤（時間切れ）は 理由を 書いて 残す */
  const f = path.join(OUT, 'aka-' + RUN_ID + '.txt');
  const kara = !out.trim();
  fs.writeFileSync(f, kara ? '(出力なし) 終わり値=' + code + ' / ' + cmd.join(' ') : out, 'utf8');
  fs.appendFileSync(KIROKU, [new Date().toISOString(), '★赤★', RUN_ID, NAME,
    '終わり値=' + code, '長さ=' + out.length, '控え=' + f].join('\t') + '\n', 'utf8');
  const k = kazoeru();
  console.log('\n  ★赤の中身を 残しました★ ' + f);
  console.log('  ★数え★ 走った ' + k.run + '回 ／ 赤 ' + k.aka + '回（' + KIROKU + '）');
}
/* ★止め方は 変えない★＝赤は そのまま 赤で 終わる */
process.exit(code);
