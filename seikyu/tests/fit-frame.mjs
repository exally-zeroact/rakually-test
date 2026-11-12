/* fit-frame.mjs — ★見本の 絵（iframe）は 畳んだ 中で 描いても 開くと 縮む★（2026-11-13）
 * =============================================================================
 * 実測（375幅・Playwright）：設定▸テンプレートの「変える」の 中（6枚）は 畳まれた 間＝幅0 で 読まれ、
 *   縮める script（fitInFrame）が 読み込みの 1回で 抜けた まま＝開いても 紙の 左上の 字だけが 大きく 写っていた
 *   （.sheet の transform が 空。本番 a019e8f・テスト線 0e19bdde とも 同じ 作り）。
 * 直し＝fitInFrame の script を fit() に して、読み込みの 時に 1回＋window の resize で 測り直す
 *   （Chromium・WebKit とも 開くと iframe の 中で resize が 出て scale が 付くのを 実測）。
 *
 * 試験（jsdom は 大きさを 測れない ので、seikyu-app.js の fitInFrame を 取り出して 偽の 窓で 数える）
 *   (1) 幅0 で 読む → 縮めない（0倍に しない）
 *   (2) 幅が 付いて resize → 紙が 全部 入る 縮尺（幅と 高さの 小さい方）
 *   (3) 大きさが 変わる たびに 測り直す（2回目の resize で 新しい 縮尺）
 *   (4) 幅が 最初から 在る 時は 読み込みの 1回で 縮む（前と 同じ）
 *   (5) script は </body> の 前に 入る
 *
 * 使い方: node seikyu/tests/fit-frame.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = fs.readFileSync(path.join(ROOT, 'seikyu/js/seikyu-app.js'), 'utf8');
const SELF = process.argv.includes('--self-test');

function fitOf(src) {
  const i = src.indexOf('function fitInFrame(html)');
  if (i < 0) throw new Error('★fitInFrame が 見つからない★');
  const j = src.indexOf('\n  }\n', i);
  return new Function(src.slice(i, j + 4) + '\nreturn fitInFrame;')();
}

let pass = 0, fail = 0, akaNa = [];
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; akaNa.push(n.split(' ')[0]); console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };

function mado(fitInFrame, w0, h0) {
  const out = fitInFrame('<html><body><div class="sheet">紙</div></body></html>');
  const m = out.match(/<script>([\s\S]*?)<\/script><\/body>/);
  ok(m, '★縮める script が </body> の 前に 無い★');
  const ki = {};
  const sheet = { scrollWidth: 794, scrollHeight: 1123, style: {} };
  const win = { innerWidth: w0, innerHeight: h0, addEventListener: (n, f) => { (ki[n] = ki[n] || []).push(f); } };
  const doc = { querySelector: () => sheet, body: { style: {} }, documentElement: { style: {} } };
  new Function('window', 'document', m[1])(win, doc);
  return { sheet, win, resize: (w, h) => { win.innerWidth = w; win.innerHeight = h; (ki.resize || []).forEach((f) => f()); } };
}
const kakeru = (t) => { const m = /^scale\(([\d.]+)\)$/.exec(String(t)); return m ? Number(m[1]) : null; };

function main(src) {
  let fitInFrame;
  try { fitInFrame = fitOf(src); } catch (e) { fail++; akaNa.push('(0)'); console.log('  ✗ (0) ' + e.message); return; }
  console.log('\n[fit-frame] 見本の 絵は 畳んだ 中で 描いても 開くと 縮む');
  T('(1) 幅0 で 読む → 縮めない', () => {
    const x = mado(fitInFrame, 0, 0);
    ok(x.sheet.style.transform === undefined, '★幅0 で scale を 付けた★ … ' + x.sheet.style.transform);
  });
  T('(2) 開いて resize → 紙が 全部 入る 縮尺', () => {
    const x = mado(fitInFrame, 0, 0);
    x.resize(120, 170);
    const k = kakeru(x.sheet.style.transform);
    ok(k !== null, '★開いた（resize）後も 縮まない★ … ' + x.sheet.style.transform);
    ok(Math.abs(k - Math.min(120 / 794, 170 / 1123)) < 1e-9, '縮尺 … ' + k);
  });
  T('(3) 大きさが 変わる たびに 測り直す', () => {
    const x = mado(fitInFrame, 0, 0);
    x.resize(120, 170); x.resize(240, 340);
    ok(Math.abs(kakeru(x.sheet.style.transform) - Math.min(240 / 794, 340 / 1123)) < 1e-9, '★2回目で 測り直さない★ … ' + x.sheet.style.transform);
  });
  T('(4) 幅が 最初から 在る 時は 読み込みで 縮む', () => {
    const x = mado(fitInFrame, 160, 226);
    ok(Math.abs(kakeru(x.sheet.style.transform) - Math.min(160 / 794, 226 / 1123)) < 1e-9, '★読み込みで 縮まない★ … ' + x.sheet.style.transform);
  });
  T('(5) script は </body> の 前', () => { mado(fitInFrame, 0, 0); });
}

/* ★自分ためし★＝1か所ずつ 壊して 狙いの 試験が 赤に なるか（壊す所は 1か所 だけ） */
const KOWASHI = [
  { na: '開いても 測り直さない（resize を 聞かない）', ate: '(2)', from: `+ 'fit(); window.addEventListener("resize",fit);'`, to: `+ 'fit();'` },
  { na: '幅0 の 門を 外す（0倍に する）', ate: '(1)', from: '||!window.innerWidth||!window.innerHeight) return;', to: ') return;' },
  { na: '読み込みの 1回を 外す', ate: '(4)', from: `+ 'fit(); window.addEventListener("resize",fit);'`, to: `+ 'window.addEventListener("resize",fit);'` },
];

if (SELF) {
  let aka = 0;
  for (const k of KOWASHI) {
    if (APP.split(k.from).length !== 2) { console.log('  ✗ 壊す所が 1か所で ない（' + (APP.split(k.from).length - 1) + '）: ' + k.na); continue; }
    pass = 0; fail = 0; akaNa = [];
    const log = console.log; console.log = () => {};
    try { main(APP.replace(k.from, k.to)); } finally { console.log = log; }
    if (akaNa.indexOf(k.ate) >= 0) { aka++; console.log('  ✓ 壊すと 赤: ' + k.na + '（狙い ' + k.ate + '・赤 ' + akaNa.join(' ') + '）'); }
    else console.log('  ✗ 狙いの ' + k.ate + ' が 緑＝見張れていない: ' + k.na + '（赤 ' + (akaNa.join(' ') || '0') + '）');
  }
  console.log('KEKKA ' + (aka === KOWASHI.length ? 'passed' : 'failed') + ' 自分ためし ' + aka + '/' + KOWASHI.length);
  process.exit(aka === KOWASHI.length ? 0 : 1);
} else {
  main(APP);
  console.log('KEKKA ' + (fail ? 'failed' : 'passed') + ' ' + pass + '✓ ' + fail + '✗');
  process.exit(fail ? 1 : 0);
}
