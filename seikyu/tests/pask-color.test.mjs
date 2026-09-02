/* pask-color.test.mjs — ★聞く形のボタンの色は 画面のボタンと同じ★（統一感）
 * =============================================================================
 * ★なぜ★（司さん 2026-08-29「なぜボタンに色をつけない？統一感は？」）
 *   実測すると ★3つ ずれていた★（WebKit 390px・値で数えた）:
 *     ・選ぶボタンの字 … #333333 ＝★色なし★（画面の「ほか」は #2E7D54）
 *     ・押す物の緑     … #2E7D54（画面の「本命」は ★#3D9E72★）＝★緑が2種類 混ざっていた★
 *     ・枠            … #D4EAE0 1px（画面は #C8ECD8 1.5px）
 *   ⇒ ★色は 聞く形で決めない★。画面のボタン（.btn-primary / .btn-ghost）に任せる。
 *
 * ★測り方★
 *   ・★色は文字列で探さない★＝本物のブラウザで ★描いた色の値★を読む
 *   ・★聞く形のボタン と 画面のボタン を 突き合わせる★（どちらかを直したら 気づく）
 *   ・★押す的の大きさ（20×20以上）★も ついでに数える（色を変えて 小さくしていないか）
 *   ・回せない時は ★赤にせず「未測定」★（0件と 未測定を 混ぜない）
 *
 * 使い方: node seikyu/tests/pask-color.test.mjs [--self-test]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const NAME = 'pask-color';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');

import { borrow, launch as pwLaunch } from '../../scripts/_borrow-playwright.mjs';
/* ★借り先と 未測定の言い方は 1か所に★ … scripts/_borrow-playwright.mjs */
const webkit = await borrow('pask-color', 'webkit');

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' … 期待 ' + JSON.stringify(b) + ' / 実際 ' + JSON.stringify(a)); };

/** 請求書の画面を そのまま読み込み、聞く形の見本を 1つ 置いて 色を測る */
const rel = 'seikyu/index.html', file = path.join(ROOT, rel);
function pageHtml(extraCss) {
  let html = fs.readFileSync(file, 'utf8').replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<link\b[^>]*rel="stylesheet"[^>]*>/gi, (t) => {
      const m = /href="([^"]+)"/.exec(t); if (!m) return t;
      const h = m[1].split('?')[0];
      if (/^https?:/.test(h)) return '';
      return t.replace(m[1], pathToFileURL(path.resolve(path.dirname(file), h)).href);
    });
  /* ★実物と同じ class の並び★（画面が出している物と 1文字でも違えば この検査は意味が無い） */
  const probe = '<div class="pask" id="probe">'
    + '<div class="pask-guess"><button class="pask-why btn-ghost">なぜ？</button></div>'
    + '<div class="pask-opts">'
    + '<button class="pask-o btn-ghost">消す</button>'
    + '<button class="pask-o on btn-primary">選んだ</button>'
    + '</div>'
    + '<div class="pask-chips"><button class="pask-c btn-ghost">札</button></div>'
    + '<div class="pask-row"><button class="pask-ok btn-primary">これで</button>'
    + '<button class="pask-skip btn-ghost">飛ばす</button></div>'
    + '</div>'
    + '<div id="std"><button class="btn-primary">本命</button><button class="btn-ghost">ほか</button></div>';
  html = html.replace('</body>', probe + '</body>');
  if (extraCss) html = html.replace('</head>', '<style>' + extraCss + '</style></head>');
  return html;
}

async function measure(extraCss) {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pask-'));
  const f = path.join(TMP, 'p.html');
  fs.writeFileSync(f, pageHtml(extraCss), 'utf8');
  /* ★ここで止まってはいけない★（2026-08-29 CIで赤を出した）
     ★言い方と 終わり値は scripts/_borrow-playwright.mjs が 1か所で 持つ★ */
  const b = await pwLaunch(NAME, webkit);
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = await ctx.newPage();
  await pg.goto(pathToFileURL(f).href, { waitUntil: 'load' });
  const out = await pg.evaluate(() => {
    const g = (sel) => {
      const e = document.querySelector(sel);
      if (!e) return null;
      const c = getComputedStyle(e), r = e.getBoundingClientRect();
      return { bg: c.backgroundColor, ink: c.color, bd: c.borderTopColor, bw: c.borderTopWidth,
        w: Math.round(r.width), h: Math.round(r.height) };
    };
    return {
      pick: g('#probe .pask-o:not(.on)'), on: g('#probe .pask-o.on'),
      okb: g('#probe .pask-ok'), skip: g('#probe .pask-skip'),
      chip: g('#probe .pask-c'), why: g('#probe .pask-why'),
      primary: g('#std .btn-primary'), ghost: g('#std .btn-ghost'),
    };
  });
  await b.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  return out;
}

const same = (a, b) => a.bg === b.bg && a.ink === b.ink && a.bd === b.bd && a.bw === b.bw;
const show = (x) => '背景' + x.bg + ' 字' + x.ink + ' 枠' + x.bd + ' ' + x.bw;

console.log('\n[pask-color] 聞く形のボタンの色は 画面のボタンと同じか（値で数える）');
const M = await measure();

T('★測れている（見本のボタンが 1つも欠けていない）', () => {
  Object.keys(M).forEach((k) => ok(M[k], '★' + k + ' が 見つからない＝測れていません（0件ではありません）★'));
  console.log('     標準 本命 … ' + show(M.primary) + '\n     標準 ほか … ' + show(M.ghost));
});

T('★① 選ぶ・飛ばす・札・なぜ？ は 画面の「ほか」と 同じ色', () => {
  [['選ぶ', M.pick], ['飛ばす', M.skip], ['札', M.chip], ['なぜ？', M.why]].forEach(([n, x]) => {
    ok(same(x, M.ghost), '★' + n + ' が 画面の「ほか」と違う★\n       ' + n + '： ' + show(x) + '\n       ほか： ' + show(M.ghost));
  });
  console.log('     選ぶ／飛ばす／札／なぜ？ … ' + show(M.pick));
});

T('★② 「これで」と「選んだ」は 画面の「本命」と 同じ色', () => {
  ok(same(M.okb, M.primary), '★これで が 本命と違う★\n       これで： ' + show(M.okb) + '\n       本命　： ' + show(M.primary));
  ok(same(M.on, M.primary), '★選んだ が 本命と違う（btn-ghost に負けていないか）★\n       選んだ： ' + show(M.on) + '\n       本命　： ' + show(M.primary));
  console.log('     これで／選んだ … ' + show(M.okb));
});

T('★③ 緑が2種類 混ざっていない（押す物の緑は 1つだけ）', () => {
  const greens = [M.okb.bg, M.on.bg, M.primary.bg];
  eq([...new Set(greens)].length, 1, '★押す物の緑が ' + [...new Set(greens)].join(' / ') + '★');
  const inks = [M.pick.ink, M.skip.ink, M.chip.ink, M.why.ink, M.ghost.ink];
  eq([...new Set(inks)].length, 1, '★「ほか」の字の色が ' + [...new Set(inks)].join(' / ') + '★');
  console.log('     押す物の緑 ' + greens[0] + ' 1種類 ／ ほかの字 ' + inks[0] + ' 1種類');
});

T('★④ 色を直して 押す的を小さくしていない（20×20以上）', () => {
  [['選ぶ', M.pick], ['選んだ', M.on], ['これで', M.okb], ['飛ばす', M.skip], ['札', M.chip], ['なぜ？', M.why]]
    .forEach(([n, x]) => {
      ok(x.w >= 20 && x.h >= 20, '★' + n + ' が ' + x.w + '×' + x.h + '（20×20未満）★');
    });
  console.log('     いちばん小さい物 … 札 ' + M.chip.w + '×' + M.chip.h + ' ／ なぜ？ ' + M.why.w + '×' + M.why.h);
});

T('★⑤ 聞く形のCSSに 色を1行も書いていない（色の持ち主は 皮ひとつ）', () => {
  const css = fs.readFileSync(path.join(ROOT, 'seikyu/css/app.css'), 'utf8');
  const block = css.slice(css.indexOf('.pask-why'), css.indexOf('.pask-fin'));
  ok(block.length > 100, '★聞く形のCSSを 読めていません★');
  const hits = block.match(/#[0-9A-Fa-f]{3,8}\b|rgba?\(/g) || [];
  ok(!hits.length, '★聞く形のCSSに 色が書いてある★ ' + hits.join(' , ') + '（皮の .btn-primary / .btn-ghost に任せる）');
  console.log('     .pask-* のCSSに 色 ' + hits.length + '件');
});

/* ═══ ★自己確認：わざと壊して 赤になるか★ ═══ */
if (process.argv.includes('--self-test')) {
  console.log('\n[--self-test] ★わざと色を変えて 赤になるか★');
  const B = await measure('.pask-o{color:#333333 !important;border-color:#D4EAE0 !important}'
    + '.pask-ok{background:#2E7D54 !important}');
  T('★自① 選ぶボタンの字を #333333 に戻すと 気づける', () => {
    ok(!same(B.pick, B.ghost), '★色を変えたのに 同じだと言っている＝この検査は空振り★');
    console.log('     わざと戻した … ' + show(B.pick) + '（ほか： ' + show(B.ghost) + '）');
  });
  T('★自② 押す物の緑を もう1種類 混ぜると 気づける', () => {
    const greens = [...new Set([B.okb.bg, B.on.bg, B.primary.bg])];
    ok(greens.length > 1, '★緑を2種類にしたのに 1種類だと言っている＝空振り★');
    console.log('     わざと混ぜた … ' + greens.join(' / '));
  });
  T('★自③ 直した後は また 揃っている（戻し忘れを作らない）', () => {
    ok(same(M.pick, M.ghost) && same(M.okb, M.primary), '★実物が 揃っていない★');
  });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
