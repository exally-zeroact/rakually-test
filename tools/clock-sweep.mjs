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

/* ★どの workflow を 走らせるか★（既定 ci.yml）
 *   ★ci.yml だけ見ると 画面の試験(webkit.yml)が 丸ごと 抜ける＝★0件ではなく 未測定★★
 *   例 YML=.github/workflows/webkit.yml SKIP="playwright install|npm install" */
const YML = process.env.YML || '.github/workflows/ci.yml';
const yml = fs.readFileSync(YML, 'utf8');
/* ★拾った 段★＝ci.yml の run: を 全部（★人が 数えた 本数では ない★）
   ★2026-09-05 の 決まり（指示役 e9fdf1c）★
     「押す前の『全部 緑』は ★CI と 同じ 物を 走らせて から★ 言う」
     「出す形＝★拾った 段 ◯／走らせた ◯／赤 ◯／飛ばした ◯（理由つき）★」
     「★1段も 走らなければ 赤★」（★0段 走って 緑★を 塞ぐ）
   ★Exally が 1日で 2回 踏んだ★＝「全部」の 中身が 人と 機械で ちがった */
const hirotta = [...yml.matchAll(/^\s*run:\s*(.+)$/gm)].map((m) => m[1].trim());
const all = hirotta.filter((c) => !/^npm install/.test(c));
const nozoita = hirotta.length - all.length;   /* 支度（npm install）＝走らせない */
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
  /* ★字で拾っている事を 隠さない★＝拾った行を そのまま 見せる。
     実測 2026-09-02 … 11本のうち 5本は ★『未測定 0件』と書いてある行★＝中身は 0だった */
  if (/未測定/.test(out)) {
    const hit = out.split('\n').filter((l) => /未測定/.test(l)).slice(0, 2)
      .map((l) => l.trim()).join(' ／ ');
    mihakari.push('#' + i + ' ' + c + '\n        拾った行 … ' + hit);
  }
  result[c] = red[red.length - 1] === '#' + i + ' ' + c ? '赤'
    : (/未測定/.test(out) ? '未測定' : '緑');
}
console.log('\n[clock-sweep] ' + YML + ' ／ 時計 ' + (process.env.FAKE_NOW || process.env.DK_FAKE_NOW || '★本物★')
  + '  （' + YML.split('/').pop() + ' #' + from + '〜#' + Math.min(to, all.length) + '／全 ' + all.length + '本）');
/* ★1段も 走らなければ 赤★（★0段 走って 緑★を 塞ぐ＝2026-09-05 の 決まり） */
if (n === 0) { console.log('  ★赤★ 1段も 走っていません（拾った 段 ' + hirotta.length + '）'); process.exit(1); }
console.log('  ★拾った 段 ' + hirotta.length + '★ ／ 走らせた ' + n + '本 ／ ★赤 ' + red.length + '本★ ／ ★未測定と出た ' + mihakari.length + '本★'
  + ' ／ 飛ばした ' + (nozoita + skipped.length) + '本'
  + '（支度 ' + nozoita + '＝npm install' + (skipped.length ? '／SKIP ' + skipped.length : '') + '）');
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
