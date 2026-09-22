/* webkit-paths.test.mjs — ★webkit.yml の `paths` を 人に 覚えさせない★
 * ==============================================================================
 * ★なぜ 要るか（実物・2026-09-22）★
 *   `webkit.yml` は `paths:` 13本の 括りに 当たった 押しでしか 走らない。
 *   その 13本は ★人が 手で 並べた 物★で、★測る 側が 読む 物★とは 繋がって いない。
 *   ・2026-09-14 … ★足した 見張り（kyuyo/js・kyuyo/tests）が 括りに 入って いなかった★
 *                  ＝1度 足した（webkit.yml の コメントに 跡が 残って いる）
 *   ・2026-09-22 … ★webkit.yml が 回す `tools/aka-kiroku.mjs` が 括りに 無い★
 *                  ★測る 画面 3枚が 読む `js/env-badge.js`（帯を 描く 物）が 括りに 無い★
 *                  ⇒ ★帯を 太らせて 375px で はみ出させても WebKit は 1本も 走らない★
 *   ⇒ ★人が また 数えれば 3度目が 来る★ので ★機械に 数えさせる★。
 *
 * ★何を 突き合わせるか（★両方向★）★
 *   ㋐ ★読まれて いるのに `paths` に 無い★ ⇒ ★赤★（＝穴。直した その回に 走らない）
 *   ㋑ ★`paths` に 在るのに 誰も 読まない★ ⇒ ★出す★（赤には しない）
 *      … 括りが ★太る 一方★に ならない為。消してよいかは 人が 決める。
 *   ⇒ ★★読まれる ＋ 読まれない ＝ `paths` の 全★★ と 出す（数が 合わなければ 赤）
 *
 * ★見える 範囲（★先に 書く／「これで 全部」とは 言わない★）★
 *   ★引ける★ … ⑴webkit.yml の `run:` に 字で 書いて ある 走らせ物
 *               ⑵その 走らせ物が import/require で 静かに 辿る 物
 *               ⑶その 中に 字で 書いて ある `*.html`
 *               ⑷その HTML が `<script src>`/`<link href>`/`<img src>`/`<a href>` で 読む 物
 *                 （★深さまで＝scripts/dep-count.mjs を そのまま 使う★）
 *   ★引けない★ … ・動いてから 決まる 読み込み（変数で 組む import()／createElement）
 *                 ・CDN の 向こう（jsdelivr）★＝押しで 変わらないので 括りに 要らない★
 *                 ・★sw.js の 先取り 名簿★（[[feedback_sw_sakidori_meibo_ni_tasu]] の 紙が 別に 在る）
 *                 ・画面が 動いてから fetch する 物（json など）
 *   ⇒ ★★この 門が 緑でも「括りは 完全」では ない★★。★引けた 本数を 必ず 出す★。
 *
 * 使い方:
 *   node tests/webkit-paths.test.mjs              … 突き合わせる
 *   node tests/webkit-paths.test.mjs --show       … 拾った 物を 全部 並べる（直す時）
 *   node tests/webkit-paths.test.mjs --self-test  … ★わざと 壊して 赤に なるか★
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hirouDan } from '../tools/_dan-hirou.mjs';
import { count } from '../scripts/dep-count.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const YML = '.github/workflows/webkit.yml';

/* ── ㋐ `paths:` を 拾う（push と PR の 両方に 同じ 物が 書いて ある）──────── */
export function hirouPaths(ymlJi) {
  const out = [];
  let naka = false;
  for (const g of String(ymlJi || '').split('\n')) {
    if (/^\s*paths:\s*$/.test(g)) { naka = true; continue; }
    if (!naka) continue;
    const m = g.match(/^\s*-\s*'([^']+)'\s*$/) || g.match(/^\s*-\s*"([^"]+)"\s*$/);
    if (m) { out.push(m[1]); continue; }
    if (/^\s*#/.test(g) || /^\s*$/.test(g)) continue;   // 訳の 字と 空行は 跨ぐ
    naka = false;
  }
  return [...new Set(out)];
}

/* ── ㋑ 括り 1本が 道 1本に 当たるか ──────────────────────────────── */
export function ataru(pat, michi) {
  const re = String(pat)
    .split('/')
    .map((k) => (k === '**' ? '\u0000' : k.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')))
    .join('/')
    .replace(/\u0000\//g, '(?:.*/)?')     // 'a/**/b' … 間の 段は 何段でも
    .replace(/\/?\u0000/g, '(?:/.*)?');   // 'a/**'   … 下 全部
  return new RegExp('^' + re + '$').test(String(michi));
}

/* ── ㋒ 走らせ物 → 部品 → HTML → HTML が 読む 物 ──────────────────── */
const ARU = (rel) => { try { return fs.statSync(path.join(ROOT, rel)).isFile(); } catch { return false; } };
const YOMU = (rel) => { try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { return null; } };
const SEI = (p) => path.relative(ROOT, path.resolve(ROOT, p)).split(path.sep).join('/');

export function atsumeru(ymlJi) {
  const dan = hirouDan(ymlJi);

  /* ⑴ `run:` の 字に 在る 走らせ物（この repo に 実在する 物だけ） */
  const ne = new Set();
  for (const c of dan) {
    for (const m of String(c).matchAll(/(?:^|[\s"'([])([A-Za-z0-9_][A-Za-z0-9_./-]*\.(?:mjs|js|sh))/g)) {
      const r = SEI(m[1]);
      if (!r.startsWith('..') && ARU(r)) ne.add(r);
    }
  }

  /* ⑵ 静かに 辿る 部品（import / require / import()） */
  const buhin = new Set();
  const mada = [...ne];
  while (mada.length) {
    const f = mada.shift();
    const ji = YOMU(f);
    if (ji === null) continue;
    for (const re of [/from\s+['"]([^'"]+)['"]/g, /require\(\s*['"]([^'"]+)['"]\s*\)/g, /import\(\s*['"]([^'"]+)['"]\s*\)/g]) {
      for (const m of ji.matchAll(re)) {
        if (!/^[./]/.test(m[1])) continue;                       // npm は 押しで 変わらない
        const r = SEI(path.join(path.dirname(f), m[1]));
        if (r.startsWith('..') || !ARU(r)) continue;
        if (!ne.has(r) && !buhin.has(r)) { buhin.add(r); mada.push(r); }
      }
    }
  }

  /* ⑶ その 中に 字で 書いて ある HTML ＝ 測る 入口 */
  const iriguchi = new Set();
  for (const f of [...ne, ...buhin]) {
    const ji = YOMU(f);
    if (ji === null) continue;
    for (const m of ji.matchAll(/['"`]([A-Za-z0-9_./-]+\.html)['"`]/g)) {
      let r = SEI(m[1]);
      if (!ARU(r)) r = SEI(path.join(path.dirname(f), m[1]));    // 見張りから 見た 相対も 試す
      if (!r.startsWith('..') && ARU(r)) iriguchi.add(r);
    }
  }

  /* ⑷ その HTML が 読む 物（深さまで＝dep-count を そのまま 使う） */
  const yomu = new Set();
  const dekinai = [];
  for (const h of iriguchi) {
    try {
      const r = count(h, ROOT);
      [...r.inside, ...r.outside].forEach((k) => yomu.add(k));
    } catch (e) { dekinai.push(h + ' … ' + String((e && e.message) || e).slice(0, 80)); }
  }

  const zen = [...new Set([...ne, ...buhin, ...iriguchi, ...yomu, YML])].sort();
  return { ne: [...ne].sort(), buhin: [...buhin].sort(), iriguchi: [...iriguchi].sort(),
    yomu: [...yomu].sort(), zen, dekinai };
}

/* ── ㋓ 突き合わせ ───────────────────────────────────────────────── */
export function awaseru(ymlJi) {
  const pats = hirouPaths(ymlJi);
  const a = atsumeru(ymlJi);
  const moreru = a.zen.filter((f) => !pats.some((p) => ataru(p, f)));
  const tsukau = pats.filter((p) => a.zen.some((f) => ataru(p, f)));
  const tsukawanai = pats.filter((p) => !a.zen.some((f) => ataru(p, f)));
  return { pats, ...a, moreru, tsukau, tsukawanai };
}

/* ── ㋔ 出す ─────────────────────────────────────────────────────── */
const T = (na, ok, mi, shizuka) => { if (!shizuka) console.log((ok ? '  ✓ ' : '  ✗ ') + na + (mi ? '  … ' + mi : '')); return ok ? 0 : 1; };

function hashiru(ymlJi, shizuka) {
  const r = awaseru(ymlJi);
  let aka = 0;
  if (!shizuka) {
    console.log('★引けた 物★ … 走らせ物 ' + r.ne.length + '本／静かな 部品 ' + r.buhin.length
      + '本／測る 入口(html) ' + r.iriguchi.length + '本／入口が 読む 物 ' + r.yomu.length
      + '本 ⇒ ★突き合わせる 全 ' + r.zen.length + '本★');
    console.log('★引けない と 先に 書いた 物★ … 動いてから 決まる 読み込み／CDN／sw.js の 先取り名簿／'
      + '画面が 動いてから 取る 物 ⇒ ★この 門が 緑でも「括りは 完全」では ありません★');
    console.log('★括り★ … 全 ' + r.pats.length + '本 ＝ 使う ' + r.tsukau.length
      + '本 ＋ 使わない ' + r.tsukawanai.length + '本'
      + (r.tsukau.length + r.tsukawanai.length === r.pats.length ? '（★合う★）' : '（★合わない★）'));
  }
  aka += T('★括りの 足し算が 合う★', r.tsukau.length + r.tsukawanai.length === r.pats.length, '', shizuka);
  aka += T('★読まれて いるのに 括りに 無い 物 0本★（在れば ★穴★＝直した 回に 走らない）',
    r.moreru.length === 0, r.moreru.length ? r.moreru.length + '本 … ' + r.moreru.slice(0, 12).join(' , ') : '', shizuka);
  aka += T('★入口を 1本も 引けない、では ない★', r.iriguchi.length > 0, '引けた 入口 ' + r.iriguchi.length + '本', shizuka);
  aka += T('★HTML を 読めなかった 入口 0本★', r.dekinai.length === 0, r.dekinai.join(' / '), shizuka);
  if (!shizuka && r.tsukawanai.length) {
    console.log('  ⚠ ★括りに 在るのに 誰も 読まない★ ' + r.tsukawanai.length + '本 … '
      + r.tsukawanai.join(' , ') + '（★赤には しません＝消してよいかは 人が 決める★）');
  }
  return { aka, r };
}

/* ── ㋕ 自分で 壊して 赤に なるか ────────────────────────────────── */
const WAZA = [
  { na: '★`kyuyo/js/**` を 括りから 抜く★（測る 画面の 本体が 漏れる）',
    tsukuru: (j) => j.replace(/^(\s*)- 'kyuyo\/js\/\*\*'$/gm, '$1# - kyuyo/js/**') },
  { na: '★`seikyu/**` を 括りから 抜く★（請求書の 見張り 本体が 漏れる）',
    tsukuru: (j) => j.replace(/^(\s*)- 'seikyu\/\*\*'$/gm, '$1# - seikyu/**') },
  { na: '★`kyuyo/tests/**` を 括りから 抜く★',
    tsukuru: (j) => j.replace(/^(\s*)- 'kyuyo\/tests\/\*\*'$/gm, '$1# - kyuyo/tests/**') },
  { na: '★誰も 読まない 括りを 1本 足す★（足し算は 合うが ⚠が 増える）',
    tsukuru: (j) => j.replace(/^(\s*)- '\.github\/workflows\/webkit\.yml'$/m, "$1- 'nai-basho/**'\n$1- '.github/workflows/webkit.yml'"),
    akaNashi: true },
  { na: '★括りを 全部 消す★（`paths:` が 空）',
    tsukuru: (j) => j.replace(/^\s*- '[^']+'$/gm, (g) => (/paths/.test(g) ? g : '')) },
];

function jibunDeKowasu(ymlJi) {
  console.log('\n★自分で 壊して 赤に なるか（' + WAZA.length + '通り）★');
  let dame = 0;
  for (const w of WAZA) {
    const kowashita = w.tsukuru(ymlJi);
    if (kowashita === ymlJi) { console.log('  ✗ ' + w.na + ' … ★1文字も 変わって いません＝空振り★'); dame++; continue; }
    const { aka } = hashiru(kowashita, true);
    const hoshii = w.akaNashi ? aka === 0 : aka > 0;
    console.log('  ' + (hoshii ? '✓' : '✗') + ' ' + w.na + ' … 赤 ' + aka + '本'
      + (w.akaNashi ? '（★赤に ならないのが 正しい★）' : ''));
    if (!hoshii) dame++;
  }
  return dame;
}

/* ── 走らせる（★人が 呼んだ 時だけ★＝他の 見張りから import 出来る）──── */
const JIBUN = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (JIBUN) {
const ji = YOMU(YML);
if (ji === null) { console.log('  ✗ ★' + YML + ' が 読めません★'); process.exit(1); }

console.log('★webkit.yml の 括りと「測りが 読む 物」を 突き合わせる★');
const { aka, r } = hashiru(ji, false);
let zenAka = aka;

if (process.argv.includes('--show')) {
  const p = (t, a) => { console.log('\n■ ' + t + '（' + a.length + '本）'); a.forEach((x) => console.log('   ' + x)); };
  p('走らせ物（run: の 字）', r.ne);
  p('静かな 部品（import/require）', r.buhin);
  p('測る 入口（html）', r.iriguchi);
  p('入口が 読む 物', r.yomu);
  p('★括りに 無い★', r.moreru);
}
if (process.argv.includes('--self-test')) zenAka += jibunDeKowasu(ji);

console.log(zenAka ? '\n★★赤 ' + zenAka + '本★★' : '\n★赤 0本★');
process.exit(zenAka ? 1 : 0);
}
