/* frow2-soroi.test.mjs — ★2つ並びの 入力欄が 左右で ずれていないか★
 * =============================================================================
 * ★なぜ 要るか（2026-09-14 司さんが 絵で 指した）★
 *   家族（被扶養者）の カードで
 *     左「氏名（漢字）」 ／ 右「氏名（カナ）★半角カナ・姓名の間に空白★」
 *   右の 見出しが 390px で ★2行に 折り返し★、★右の 入力欄だけ 下へ ずれていた★。
 *   ＝見出しの 字の 長さに 高さが 引きずられる 形（.frow2 は grid・.frow は flex 縦）。
 *
 * ★直し方★（css/app.css）
 *   ・見出しの 高さを 揃えるのでは なく ★入力欄を 下に 揃える★（.frow2>.frow{justify-content:flex-end}）
 *   ・見出しは 上に 固定（.frow2>.frow>.flabel{margin-bottom:auto}）
 *   ⇒ ★見出しが 何行に なっても ずれない★＝字の 長さに 頼らない。
 *
 * ★印(class)が 付いたかでは 見ない★＝★実際に place を 測る★（getBoundingClientRect）。
 *   ＝[[feedback_mihari_wa_shirushi_de_naku_e_ga_kawatta_ka]]
 *
 * 使い方: node kyuyo/tests/frow2-soroi.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = process.argv.includes('--self-test');
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'app.css'), 'utf8');

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };

/* ★短い見出し と 長い見出し（折り返す）を 並べた 実物の形★ */
const HTML = (css) => '<!doctype html><meta charset="utf-8"><style>' + css + '</style><body>'
  + '<div style="width:370px">'
  + '<div class="frow2" id="a">'
  + '<div class="frow"><div class="flabel">氏名（漢字）</div><input class="finput" id="l"></div>'
  + '<div class="frow"><div class="flabel">氏名（カナ）<span class="hint2">半角カナ・姓名の間に空白</span></div>'
  + '<input class="finput" id="r"></div>'
  + '</div></div>';

const borrow = await import('../../scripts/_borrow-playwright.mjs');
const ch = await borrow.borrow('frow2-soroi', 'chromium');
if (!ch) { console.log('🟡 ★未測定★ playwright を 借りられない（0件＝合格 とは 書かない）'); process.exit(2); }
const br = await borrow.launch('frow2-soroi', ch, undefined, 'chromium');

async function zure(css) {
  const pg = await br.newPage({ viewport: { width: 390, height: 700 }, deviceScaleFactor: 1 });
  await pg.setContent(HTML(css), { waitUntil: 'load' });
  await pg.waitForTimeout(120);
  const m = await pg.evaluate(() => {
    const l = document.getElementById('l').getBoundingClientRect();
    const r = document.getElementById('r').getBoundingClientRect();
    return { ue: Math.round(Math.abs(l.top - r.top)), shita: Math.round(Math.abs(l.bottom - r.bottom)) };
  });
  await pg.close();
  return m;
}

console.log('\n[frow2-soroi] 2つ並びの 入力欄が 左右で 揃っているか（スマホ幅390）');
const ima = await zure(CSS);
t('★入力欄の 上が 左右で 揃っている★（ずれ 0px）', () => ok(ima.ue === 0, 'ずれ ' + ima.ue + 'px'));
t('★入力欄の 下も 揃っている★', () => ok(ima.shita === 0, 'ずれ ' + ima.shita + 'px'));

/* ★わざと 戻したら 赤に なるか★＝この2行を 消して 測る */
const modoshi = CSS
  .replace('.frow2>.frow{justify-content:flex-end;}', '')
  .replace('.frow2>.frow>.flabel{margin-bottom:auto;}', '');
const mae = await zure(modoshi);
t('★直しを 戻すと ずれる（見張りが 効いている）★', () => ok(mae.ue > 0, '戻しても ずれ 0px＝★壊したのに 赤に ならない★'));
console.log('     戻した時の ずれ … 上 ' + mae.ue + 'px / 下 ' + mae.shita + 'px（今は 上 ' + ima.ue + 'px / 下 ' + ima.shita + 'px）');

await br.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
