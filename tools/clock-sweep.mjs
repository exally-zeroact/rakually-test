/* clock-sweep.mjs — ★ci.yml を そのまま 別の日で 走らせる★
 * ============================================================================
 * ★数だけ見ない★（Timeally が 853→844→853 と 揺れた・経営者 2026-09-02）
 *   ＝★走った本数・赤・★未測定と出た物★を ぜんぶ 名前で 出す★。
 *   ★未測定は 0件ではない★（道具が無くて 中を見ていないだけ＝緑と同じ顔をする）。
 *
 * 使い方
 *   FAKE_NOW=2026-10-01 NODE_OPTIONS="--import file:///<repo>/tools/fake-clock.mjs" \
 *     node tools/clock-sweep.mjs
 *   FROM/TO … ci.yml の何番目から何番目か（1回が長すぎる時に 区切る）
 *   SKIP    … 走らせない命令（例 SKIP="self-test"）★外したら 報告に必ず書く★
 *   SAVE    … 走らせた物と結果を 書き出す（次に 突き合わせる為）
 *   BASE    … 前の SAVE と 突き合わせ、★減った物・増えた物を 名前で出す★
 *             （Timeally が 853→844→853 と 揺れた。★数だけ見ると 気づけない★）
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const yml = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
const all = [...yml.matchAll(/^\s*run:\s*(.+)$/gm)].map((m) => m[1].trim())
  .filter((c) => !/^npm install/.test(c));
const from = Number(process.env.FROM || 1);
const to = Number(process.env.TO || all.length);
const skip = process.env.SKIP ? new RegExp(process.env.SKIP) : null;

const red = [], mihakari = [], skipped = [];
const result = {};
let n = 0;
for (let i = from; i <= Math.min(to, all.length); i++) {
  const c = all[i - 1];
  if (skip && skip.test(c)) { skipped.push('#' + i + ' ' + c); continue; }
  n++;
  let out = '';
  try { out = String(execSync(c, { stdio: 'pipe', encoding: 'utf8', timeout: 300000 }) || ''); }
  catch (e) { red.push('#' + i + ' ' + c); out = ((e.stdout || '') + (e.stderr || '')); }
  if (/未測定/.test(out)) mihakari.push('#' + i + ' ' + c);
  result[c] = red[red.length - 1] === '#' + i + ' ' + c ? '赤'
    : (/未測定/.test(out) ? '未測定' : '緑');
}
console.log('\n[clock-sweep] 時計 ' + (process.env.FAKE_NOW || process.env.DK_FAKE_NOW || '★本物★')
  + '  （ci.yml #' + from + '〜#' + Math.min(to, all.length) + '／全 ' + all.length + '本）');
console.log('  走らせた ' + n + '本 ／ ★赤 ' + red.length + '本★ ／ ★未測定と出た ' + mihakari.length + '本★'
  + (skipped.length ? ' ／ ★外した ' + skipped.length + '本★' : ''));
red.forEach((x) => console.log('  ★赤★ ' + x));
mihakari.forEach((x) => console.log('  🟡未測定と出た（0件ではない） ' + x));
skipped.forEach((x) => console.log('  — 外した ' + x));

/* ★数だけで 済ませない★ … 前の回と 名前で 突き合わせる */
let diffRed = 0;
if (process.env.BASE) {
  let base = null;
  try { base = JSON.parse(fs.readFileSync(process.env.BASE, 'utf8')); }
  catch (e) { console.log('  🟡 ★前の回が 読めません★ … ' + process.env.BASE + '（突き合わせは 未測定）'); }
  if (base) {
    const gone = Object.keys(base).filter((k) => !(k in result));
    const add = Object.keys(result).filter((k) => !(k in base));
    const worse = Object.keys(result).filter((k) => base[k] === '緑' && result[k] !== '緑');
    console.log('  前の回と くらべて … 減った ' + gone.length + '本 ／ 増えた ' + add.length
      + '本 ／ 緑から外れた ' + worse.length + '本');
    gone.forEach((k) => console.log('  ★前は走ったのに 今は走っていない★ ' + k));
    add.forEach((k) => console.log('  ＋増えた ' + k));
    worse.forEach((k) => console.log('  ★緑から外れた★ ' + k + ' … ' + result[k]));
    diffRed = gone.length + worse.length;
  }
}
if (process.env.SAVE) {
  fs.writeFileSync(process.env.SAVE, JSON.stringify(result, null, 1), 'utf8');
  console.log('  控えを書いた … ' + process.env.SAVE + '（' + Object.keys(result).length + '本）');
}
process.exit((red.length || diffRed) ? 1 : 0);
