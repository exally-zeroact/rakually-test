/* ym-picker.test.mjs — ★対象月の選び方（スマホで重ならない・iOSで開く）★
 *
 * なぜ必要か（2026-08-04・司さんの実機 iPhone）:
 *   ① もともと <input type="month"> を使っていて ★iOS Safari が持っていない★＝月が選べなかった
 *   ② そこで「年」「月」の2つの選択肢に変えたら、375px幅で
 *      ★「8月 ∨」が隣の「全員 ∨」の枠に食い込んで重なった★（幅が足りない）
 *   ⇒ ★1つにまとめる（「2026年8月」の1つの select）。★
 *
 * ここで固定すること:
 *   ① 月の選択は★1つ★（2つに戻したら赤）
 *   ② iOSに無い部品を使わない（type=month/week/datetime-local）
 *   ③ 値は今までどおり YYYY-MM（保存先も受け渡しも変えない）
 *   ④ ★375px幅で「月で選ぶ」と「従業員で選ぶ」が重ならない★（最小幅の合計が列に収まる）
 *
 * 使い方: node tests/ym-picker.test.mjs
 *         node tests/ym-picker.test.mjs --self-test
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS = fs.readFileSync(path.join(ROOT, 'js/ym-picker.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css/app.css'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };

/* ★純関数: 2列に並ぶ入れ物が、その画面幅で重ならないか。self-testで作り物を通せる。 */
export function overlaps(cols, opt) {
  const o = Object.assign({ screen: 375, sidePadding: 32, gap: 10 }, opt || {});
  const each = (o.screen - o.sidePadding - o.gap) / 2;     // .frow2 は2列
  return cols.filter(c => c.minWidth > each + 0.5)
    .map(c => ({ name: c.name, minWidth: c.minWidth, room: Math.round(each) }));
}

/* CSSの1ブロックを丸ごと読む（人が書き写さない・見つからなければ空振りとして赤にする） */
function cssBlock(sel) {
  const m = new RegExp('(^|[},;\\s])' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}').exec(CSS);
  return m ? m[2] : null;
}
const GAP = 10;
const YM_COUNT = (JS.match(/createElement\('select'\)/g) || []).length;

if (process.argv.includes('--self-test')) {
  console.log('\n[ym-picker --self-test] わざと戻して赤になるか');
  T('★選択肢が2つぶんの幅なら重なる（＝赤）', () => {
    const r = overlaps([{ name: '月で選ぶ', minWidth: 88 + 74 + GAP }, { name: '従業員で選ぶ', minWidth: 120 }]);
    if (!r.length) throw new Error('赤になっていない');
  });
  T('★1つにまとめれば収まる（＝緑）', () => {
    const r = overlaps([{ name: '月で選ぶ', minWidth: 120 }, { name: '従業員で選ぶ', minWidth: 120 }]);
    if (r.length) throw new Error('緑にならない: ' + JSON.stringify(r));
  });
  T('画面が広ければ重ならない（誤検知を出さない）', () => {
    const r = overlaps([{ name: 'a', minWidth: 200 }, { name: 'b', minWidth: 200 }], { screen: 1000 });
    if (r.length) throw new Error('誤検知');
  });
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

console.log('\n[ym-picker] 対象月の選び方');

T('★① 月の選択は1つ（年と月を分けていない）', () => {
  eq(YM_COUNT, 1, 'js/ym-picker.js が作る select の数');
  if (/ym-y|ym-m\b/.test(JS)) throw new Error('★年と月を分けた作りが残っています（ym-y / ym-m）');
});

T('② iOSに無い部品を使っていない（type=month/week/datetime-local）', () => {
  const used = HTML.match(/type\s*=\s*"(month|week|datetime-local)"/g);
  if (used) throw new Error('使っています: ' + used.join(', '));
  if (!/data-ym/.test(HTML)) throw new Error('月の入れ物(data-ym)が無い＝この検査が空振り');
});

T('③ 値は YYYY-MM のまま（保存先も受け渡しも変えていない）', () => {
  if (!/\^\(\\d\{4\}\)-\(\\d\{2\}\)\$/.test(JS)) throw new Error('YYYY-MM を読む形が見当たらない');
  if (!/\+ '-' \+/.test(JS)) throw new Error('YYYY-MM を組み立てる形が見当たらない');
});

/* ★④ 「列からはみ出せない作り」になっているか。
 *   ピクセルの重なりそのものは文字の幅を見積もっても当たらない（実際の描画で決まる）ので、
 *   ★ここでは【はみ出しようが無い作り】を固定する★:
 *     ・月の入れ物は select 1つ（①）
 *     ・その select は width:100%（列の幅ちょうど）かつ min-width:0（列より広くならない）
 *   どちらかを外すと、列からあふれて隣に食い込める＝ここが赤になる。
 *   ★ピクセルの実測は実ブラウザで行う（2026-08-04 / 375px:「月」31→176px・「従業員」184→329px・すき間8px・重なり0件）。 */
T('★④ 月の入れ物が列からはみ出せない作り（width:100% と min-width:0）', () => {
  const blk = cssBlock('.ym-pick select');
  if (!blk) throw new Error('css/app.css に「.ym-pick select」の指定が見当たらない＝この検査が空振り');
  eq(YM_COUNT, 1, '月の入れ物の数（2つあると1つぶんの幅では収まらない）');
  if (!/width:\s*100%/.test(blk)) throw new Error('width:100% が無い（中身の長さで広がって隣に食い込む）: ' + blk);
  if (!/min-width:\s*0/.test(blk)) throw new Error('min-width:0 が無い（列より狭くなれず、あふれる）: ' + blk);
});

console.log('\n── 実測 ──');
console.log('  月の選択: select ' + YM_COUNT + '個 / 指定 ' + (cssBlock('.ym-pick select') || '').trim());
console.log('  375px の1列ぶん: ' + Math.round((375 - 32 - GAP) / 2) + 'px（実ブラウザ実測: 月 145px / 従業員 145px / すき間 8px）');
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
