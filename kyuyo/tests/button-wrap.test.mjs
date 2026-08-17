/* button-wrap.test.mjs — ★スマホ幅でボタンの文字が折り返していないか★
 *
 * なぜ必要か（2026-08-04・司さんの実機 iPhone）:
 *   印刷タブの3つのボタンが
 *     [印刷 / PDF保  ] [ Excel ] [Web明細で公]
 *     [    存        ]           [    開      ]
 *   と ★左右だけ2行に折り返して、ボタンが縦に伸びていた★。
 *   ★PCの幅では出ない。★ 見るのはスマホの幅（375px / 390px）。
 *
 * どうやって見るか（jsdomにレイアウトが無いので、幅を「文字数」で見積もる）:
 *   ボタン1つの横幅 =（画面幅 − 余白 − ボタン間の隙間）を、flexの伸び方で配る。
 *   文字が入る幅 = ボタン幅 − 左右padding。
 *   必要な幅 = 文字数 × 1文字の幅（日本語=font-size / 半角英数=font-size×0.55 で見積もる）。
 *   ★見積もりなので、実ブラウザ(Playwright)でも必ず確かめる（このテストは「気づく」ための網）。
 *
 * 使い方: node tests/button-wrap.test.mjs
 *         node tests/button-wrap.test.mjs --self-test
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css/app.css'), 'utf8');

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };

/* 1文字の幅（px）。日本語は font-size とほぼ同じ、半角英数はその約0.55倍。 */
export function textWidth(s, fontPx) {
  let w = 0;
  for (const ch of String(s)) w += /[\x20-\x7E]/.test(ch) ? fontPx * 0.55 : fontPx;
  return w;
}

/* ★純関数: ボタンの並びが、その画面幅で1行に収まるか。self-testで作り物を通せる。 */
export function findWrapping(buttons, opt) {
  const o = Object.assign({ screen: 375, sidePadding: 32, gap: 10, padX: 16, font: 14 }, opt || {});
  const inner = o.screen - o.sidePadding - o.gap * (buttons.length - 1);
  // flex: 既定は「中身の幅」で配られる。中身が入りきらない時は縮む＝ここでは
  //   「全部の必要幅の合計 > 使える幅」なら、比率どおりに縮んだ幅で判定する。
  const need = buttons.map(b => textWidth(b.label, b.font || o.font) + (b.padX != null ? b.padX : o.padX) * 2);
  const sum = need.reduce((a, x) => a + x, 0);
  const scale = sum > inner ? inner / sum : 1;
  return buttons.map((b, i) => {
    const width = need[i] * scale;
    const textNeed = textWidth(b.label, b.font || o.font);
    const textRoom = width - (b.padX != null ? b.padX : o.padX) * 2;
    return { label: b.label, width: Math.round(width), textNeed: Math.round(textNeed), textRoom: Math.round(textRoom), wraps: textRoom < textNeed - 0.5 };
  }).filter(x => x.wraps);
}

/* 実物の値を CSS/HTML から読む（人が書き写さない） */
function cssNum(sel, prop, fallback) {
  const re = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{[^}]*' + prop + ':\\s*([0-9.]+)px', 'i');
  const m = re.exec(CSS);
  return m ? Number(m[1]) : fallback;
}
function rowButtons(rowHtml) {
  return [...rowHtml.matchAll(/<button[^>]*class="(btn-[a-z]+)"[^>]*>([^<]*)<\/button>/g)]
    .map(m => ({ cls: m[1], label: m[2].trim() }));
}

const printRow = (/<div class="btn-row">([\s\S]*?)<\/div>/.exec(HTML) || [])[1] || '';

/* ★実際に効く値は「.btn-row button」の指定（クラス指定より後に書いてあるので勝つ）。
   無ければクラス側(.btn-primary/.btn-ghost)の値を使う。★人が書き写さない。 */
function padXOf(selRe, fallback) {
  const m = new RegExp(selRe + '\\{[^}]*padding:\\s*[0-9.]+px\\s+([0-9.]+)px').exec(CSS);
  return m ? Number(m[1]) : fallback;
}
const ROW_FONT = cssNum('.btn-row button', 'font-size', null);
const ROW_PADX = padXOf('\\.btn-row button', null);
const BTNS = rowButtons(printRow).map(b => ({
  label: b.label,
  font: ROW_FONT != null ? ROW_FONT : cssNum('.' + b.cls, 'font-size', 14),
  padX: ROW_PADX != null ? ROW_PADX : padXOf('\\.' + b.cls, 16),
}));
const GAP = cssNum('.btn-row', 'gap', 10);

/* ══ self-test ═══════════════════════════════════════════════════════ */
if (process.argv.includes('--self-test')) {
  console.log('\n[button-wrap --self-test] わざと長くして赤になるか');
  T('★長い文字＋大きい余白なら折り返す（赤になる）', () => {
    const w = findWrapping([{ label: '印刷 / PDF保存' }, { label: 'Excel' }, { label: 'Web明細で公開' }], { screen: 375, padX: 16, font: 14 });
    if (!w.length) throw new Error('赤になっていない（この作りでは折り返しを検出できない）');
  });
  T('★文字を詰めて余白を狭くすれば収まる（緑になる）', () => {
    const w = findWrapping([{ label: '印刷 / PDF保存' }, { label: 'Excel' }, { label: 'Web明細' }], { screen: 375, padX: 6, font: 12 });
    if (w.length) throw new Error('緑にならない: ' + JSON.stringify(w));
  });
  T('画面が広ければ折り返さない（誤検知を出さない）', () => {
    const w = findWrapping([{ label: '印刷 / PDF保存' }, { label: 'Excel' }, { label: 'Web明細で公開' }], { screen: 1000 });
    if (w.length) throw new Error('誤検知: ' + JSON.stringify(w));
  });
  T('読み取りが空振りしていない（実物のボタンを拾えている）', () => {
    if (BTNS.length !== 3) throw new Error('印刷タブのボタンを拾えていない: ' + JSON.stringify(BTNS));
  });
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

/* ══ 本番（実物を見る） ═══════════════════════════════════════════════ */
console.log('\n[button-wrap] スマホ幅でボタンの文字が1行に収まるか');

T('読み取りが空振りしていない（印刷タブの3つを実際に拾えている）', () => {
  if (BTNS.length !== 3) throw new Error('拾えたボタン: ' + JSON.stringify(BTNS));
});

for (const screen of [375, 390]) {
  T(`★${screen}px（iPhone）でボタンの文字が折り返さない`, () => {
    const w = findWrapping(BTNS, { screen, gap: GAP });
    if (w.length) {
      throw new Error('折り返します:\n'
        + w.map(x => `   - 「${x.label}」 使える幅 ${x.textRoom}px / 必要 ${x.textNeed}px`).join('\n')
        + '\n   → 文字を詰める／余白を詰める／文言を短くする のどれかで1行に収めてください。');
    }
  });
}

T('ボタンの高さが1行ぶん（縦に伸びていない）', () => {
  // 高さは padding(上下)×2 + 行の高さ。折り返しが無ければ1行ぶんで収まる＝上の検査と対で見る。
  const padY = ((/\.btn-row button\{[^}]*padding:\s*([0-9.]+)px/.exec(CSS) || /\.btn-primary\{[^}]*padding:\s*([0-9.]+)px/.exec(CSS)) || [])[1];
  if (!padY) throw new Error('ボタンの余白を読めない');
  if (Number(padY) > 10) throw new Error('上下の余白が ' + padY + 'px と広い（スマホでボタンが高くなる）。10px以下にしてください。');
});

console.log('\n── 実測 ──');
for (const screen of [375, 390]) {
  const r = findWrapping(BTNS, { screen, gap: GAP });
  console.log('  ' + screen + 'px: 折り返し ' + r.length + '件' + (r.length ? ' → ' + r.map(x => x.label).join(' / ') : ''));
}
console.log('  ボタン: ' + BTNS.map(b => `「${b.label}」font=${b.font}px pad=${b.padX}px`).join(' / '));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
