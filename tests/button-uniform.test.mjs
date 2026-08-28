/* button-uniform.test.mjs — ★Rakunally 全画面で 押す物の見た目が 揃っているか★
 * =============================================================================
 * ★なぜ★（司さん 2026-08-29「これでRakunally内の統一感はでとんか？」）
 *   請求書の聞く形だけ直しても ★器の統一感にはならない★。5画面ぜんぶ 測った所:
 *     ★押す物の見た目 26通り★／★塗りつぶしの緑 3種類★
 *       #3D9E72（本命）／#52B788（選ばれているチップ）／#2E7D54（給与の聞く形・管理の知らせ）
 *     白ボタンの字も 3種類（#2E7D54 / #3D6B53 / #555555）／枠 2種類／角丸 6種類
 *   ＝★同じ「押す」なのに 画面ごとに 別の顔★だった。
 *
 * ★決めた形（この表が 正）★
 *   本命（進む）      … 塗り #3D9E72 ・字 白 ・枠なし
 *   ほか（白）        … 白地 ・字 #2E7D54 ・枠 #C8ECD8
 *   消す（赤）        … 白地 ・字 #C0392B ・枠 #F0D5D0
 *   選ばれている（丸） … 塗り #3D9E72 ・字 白
 *   足す（点線）      … 白地 ・字 #2E7D54 ・点線 #52B788
 *   下の帯           … 背景なし ・字は 決めた2色だけ
 *   ★#52B788 は「進み具合のバー」など ★押す物ではない飾り★ にだけ残す★
 *
 * ★測り方★
 *   ・★色は文字列で探さない★＝本物のブラウザ(WebKit)で ★描いた色の値★を読む
 *   ・★5画面ぜんぶ★（入口・給与・管理・明細・請求書）を 同じ幅で
 *   ・★台帳に無い見た目が1つでも出たら 赤★（増やす時は 理由を書いて 台帳に足す）
 *   ・回せない時は ★赤にせず「未測定」★（0件と 未測定を 混ぜない）
 *
 * ★押す物だけでは 足りない★（司さんの問いに 2回目で気づいた）
 *   ★箱（カード）8通り★／★字の大きさ 25通り★も バラバラだった。
 *   ⇒ 箱を ★3通り★（ふつう／畳んだ／空の知らせ）、字を ★8段★（10/11/12/13/14/15/16/20）に。
 *   ★16px は 打つ欄★（iOSが勝手に拡大しない為）＝これ未満にしない。
 *   ★絵の字（💰 ⚙ ▤ ← 等）は 段の外★＝飾りなので 大きさが違ってよい。
 *
 * 使い方: node tests/button-uniform.test.mjs [--list] [--self-test]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const NAME = 'button-uniform';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LENDERS = [
  path.join(ROOT, 'node_modules/playwright/index.js'),
  'C:/Users/zeroa/Exally-test/node_modules/playwright/index.js',
];
let webkit = null;
for (const pw of LENDERS) {
  if (!fs.existsSync(pw)) continue;
  try {
    const m = await import(pathToFileURL(pw).href);
    webkit = m.webkit || (m.default && m.default.webkit) || null;
    if (webkit) break;
  } catch (e) { /* 次 */ }
}
if (!webkit) {
  console.log('[button-uniform] ★未測定★ … playwright(webkit) が 借りられません');
  console.log('  ★これは「問題なし」ではありません★。★測るには★ npm install && npx playwright install webkit');
  process.exit(0);
}

const SCREENS = ['index.html', 'kyuyo/index.html', 'kyuyo/admin.html', 'kyuyo/meisai.html', 'seikyu/index.html'];
const OPEN = '<style>.screen{display:block!important}.scr{display:block!important}details>*{display:block!important}'
  + '[hidden]{display:block!important}[style*="display:none"]{display:block!important}'
  + '.hide{display:block!important}.hidden{display:block!important}</style>';

/* ★台帳＝出てよい見た目★（bg | ink | bd bw）。角丸は 別に見る。
   ★足す時は 理由を書く★（why が無い物は 置かない）。 */
const WHITE = 'rgb(255, 255, 255)';
const CLEAR = 'rgba(0, 0, 0, 0)';
const GREEN = 'rgb(61, 158, 114)';      // #3D9E72 本命
const INK = 'rgb(46, 125, 84)';         // #2E7D54 ほかの字
const EDGE = 'rgb(200, 236, 216)';      // #C8ECD8 ほかの枠
const RED = 'rgb(192, 57, 43)';         // #C0392B 消す
const REDEDGE = 'rgb(240, 213, 208)';   // #F0D5D0
const DASH = 'rgb(82, 183, 136)';       // #52B788 足す（点線）
const GRAY = 'rgb(110, 110, 110)';      // #6E6E6E 下の帯の 選ばれていない字

export const ALLOW = [
  { k: GREEN + ' | ' + WHITE + ' | ' + WHITE + ' 0px', why: '★本命（進む）★＝塗り #3D9E72・字 白・枠なし' },
  { k: GREEN + ' | ' + WHITE + ' | ' + GREEN + ' 1px', why: '★選ばれている（丸い切り替え）★＝塗り #3D9E72' },
  { k: WHITE + ' | ' + INK + ' | ' + EDGE + ' 1.5px', why: '★ほか（白）★＝字 #2E7D54・枠 #C8ECD8' },
  { k: WHITE + ' | ' + INK + ' | ' + EDGE + ' 1px', why: '★選ばれていない（丸い切り替え）★＝同じ色・枠だけ細い' },
  { k: WHITE + ' | ' + RED + ' | ' + REDEDGE + ' 1.5px', why: '★消す（赤）★＝取り返しがつかない物だけ' },
  { k: WHITE + ' | ' + INK + ' | ' + DASH + ' 1px', why: '★足す（点線）★＝行を足す・控除を足す' },
  { k: CLEAR + ' | ' + INK + ' | ' + INK + ' 0px', why: '★下の帯（選ばれている）★＝背景なし・字は #2E7D54' },
  { k: CLEAR + ' | ' + GRAY + ' | ' + GRAY + ' 0px', why: '★下の帯（ほか）★＝背景なし・字は #6E6E6E' },
  /* ★選ぶ帯（セグメント）の 選ばれていない物★
     下の帯と同じ考え＝★選ばれている物との差を 字の濃さで出す★（押せる事は 枠で分かる）。
     ★白い押す物（#2E7D54）と 分けている理由★＝
     セグメントは ★どれか1つが必ず選ばれている★物で、押す物の一覧ではないから。 */
  { k: WHITE + ' | ' + GRAY + ' | ' + EDGE + ' 1px', why: '★選ぶ帯（選ばれていない）★＝白地・字 #6E6E6E・枠 #C8ECD8' },
];
const ALLOW_K = new Set(ALLOW.map((x) => x.k));

function pageOf(rel, extraCss) {
  const file = path.join(ROOT, rel);
  let html = fs.readFileSync(file, 'utf8').replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<link\b[^>]*rel="stylesheet"[^>]*>/gi, (t) => {
      const m = /href="([^"]+)"/.exec(t); if (!m) return t;
      const h = m[1].split('?')[0];
      if (/^https?:/.test(h)) return '';
      return t.replace(m[1], pathToFileURL(path.resolve(path.dirname(file), h)).href);
    });
  return html.replace('</head>', OPEN + (extraCss ? '<style>' + extraCss + '</style>' : '') + '</head>');
}

async function measure(extraCss) {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'btnu-'));
  /* ★ここで止まってはいけない★（2026-08-29 CIで赤を出した）
     ★部品(playwright)が入っていても ブラウザ本体が無い★事が在る（CIの走る所が それ）。
     ★測れない＝未測定★であって ★問題なし でも 赤 でもない★。はっきり言って 抜ける。 */
  let b;
  try { b = await webkit.launch(); }
  catch (e) {
    console.log('[' + NAME + '] ★未測定★ … ブラウザ本体が 入っていません（'
      + String(e && e.message).slice(0, 70) + '）');
    console.log("  ★これは「問題なし」ではありません★。★測るには★ npx playwright install webkit");
    console.log("  ★この検査は .github/workflows/webkit.yml（週1＋見た目を触った時）で 本当に走ります★");
    process.exit(0);
  }
  const out = [];
  for (const rel of SCREENS) {
    const f = path.join(TMP, rel.replace(/[^\w]+/g, '_') + '.html');
    fs.writeFileSync(f, pageOf(rel, extraCss), 'utf8');
    const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const pg = await ctx.newPage();
    await pg.goto(pathToFileURL(f).href, { waitUntil: 'load' });
    const r = await pg.evaluate(() => {
      const list = [];
      document.querySelectorAll('button, a.btn-primary, a.btn-ghost').forEach((e) => {
        const c = getComputedStyle(e), b2 = e.getBoundingClientRect();
        if (b2.width < 8 || b2.height < 4) return;
        list.push({
          t: (e.textContent || '').trim().slice(0, 14),
          cls: (typeof e.className === 'string' ? e.className : '').trim().slice(0, 34),
          k: c.backgroundColor + ' | ' + c.color + ' | ' + c.borderTopColor + ' ' + c.borderTopWidth,
          r: c.borderTopLeftRadius,
        });
      });
      /* ★箱（カード）★ … 角丸・枠・内側 */
      const boxes = [];
      document.querySelectorAll('.card, .tile, .u, .lg-card').forEach((e) => {
        const c = getComputedStyle(e), b2 = e.getBoundingClientRect();
        if (b2.width < 80 || b2.height < 20) return;
        boxes.push({
          cls: (typeof e.className === 'string' ? e.className : '').trim().slice(0, 24),
          k: c.borderTopLeftRadius + ' | ' + c.borderTopWidth + ' ' + c.borderTopColor
            + ' | ' + c.paddingTop + '/' + c.paddingLeft,
        });
      });
      /* ★描かれた字の大きさ★（Rangeで実測＝箱ではなく 字） */
      const fonts = [];
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let t;
      while ((t = w.nextNode())) {
        const v = t.nodeValue.trim();
        if (!v) continue;
        const p = t.parentElement; if (!p) continue;
        const rg = document.createRange(); rg.selectNodeContents(t);
        const bb = rg.getBoundingClientRect();
        if (bb.width < 10 || bb.height < 4) continue;
        /* ★絵の字は 段の外★（飾りなので 大きさが違ってよい）
           絵文字（💰🧾）だけでなく ★記号の絵（⚙ ▤ ✎ ← →）★も 段の外。
           ★見分け方★＝かな・漢字・英数字を 1文字も含まない 短い字（2文字まで）。 */
        const WORD = /[0-9A-Za-z぀-ヿ一-鿿]/;
        if (!WORD.test(v) && [...v].length <= 2) continue;
        if (/^[\p{Extended_Pictographic}\s]+$/u.test(v)) continue;
        fonts.push({ px: getComputedStyle(p).fontSize, t: v.slice(0, 12) });
      }
      return { list, boxes, fonts };
    });
    out.push({ rel, btns: r.list, boxes: r.boxes, fonts: r.fonts });
    await ctx.close();
  }
  await b.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  return out;
}

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };

console.log('\n[button-uniform] Rakunally 全画面で 押す物の見た目が 揃っているか（値で数える）');
const M = await measure();
const total = M.reduce((a, x) => a + x.btns.length, 0);
const kinds = new Map();
M.forEach(({ rel, btns }) => btns.forEach((x) => {
  if (!kinds.has(x.k)) kinds.set(x.k, { n: 0, screens: new Set(), ex: [], rs: new Set() });
  const e = kinds.get(x.k); e.n++; e.screens.add(rel); e.rs.add(x.r);
  if (e.ex.length < 3) e.ex.push((x.t || x.cls) + '（' + rel + '）');
}));

if (process.argv.includes('--list')) {
  console.log('\n押す物 ' + total + '個 ／ 見た目 ' + kinds.size + '通り');
  [...kinds.entries()].sort((a, b) => b[1].n - a[1].n).forEach(([k, v]) => {
    console.log('  ' + String(v.n).padStart(3) + '個  ' + k + (ALLOW_K.has(k) ? '' : '   ★台帳に無い★') + '\n        例: ' + v.ex.join(' / '));
  });
  process.exit(0);
}

T('★測れている（押す物を 見つけられている）', () => {
  ok(total > 60, '押す物が ' + total + '個＝拾えていません（0件ではありません）');
  M.forEach((x) => ok(x.btns.length > 0, '★' + x.rel + ' に 押す物が0個＝測れていません★'));
  console.log('     5画面 ／ 押す物 ' + total + '個 ／ 見た目 ' + kinds.size + '通り');
});

T('★① 台帳に無い見た目が0（押す物の顔は 決めた物だけ）', () => {
  const bad = [...kinds.entries()].filter(([k]) => !ALLOW_K.has(k));
  if (bad.length) {
    throw new Error('★' + bad.length + '通り★ 台帳に無い顔\n     '
      + bad.map(([k, v]) => k + '  ×' + v.n + '  例: ' + v.ex.join(' / ')).join('\n     '));
  }
  console.log('     台帳 ' + ALLOW.length + '通り ／ 出た顔 ' + kinds.size + '通り → 台帳に無い物 ★0通り★');
});

T('★② 塗りつぶしの緑は 1種類だけ（押す物）', () => {
  const solid = new Set();
  M.forEach(({ btns }) => btns.forEach((x) => {
    const bg = x.k.split(' | ')[0];
    if (bg !== WHITE && bg !== CLEAR) solid.add(bg);
  }));
  ok(solid.size <= 1, '★塗りつぶしが ' + solid.size + '種類★ ' + [...solid].join(' / '));
  if (solid.size === 1) ok(solid.has(GREEN), '★本命の緑が ' + [...solid][0] + '（#3D9E72 でない）★');
  console.log('     塗りつぶし … ' + [...solid].join(' / ') + '（1種類）');
});

T('★③ 白い押す物の 字の色は 決めた3つだけ（ふつう＝緑／消す＝赤／選ぶ帯＝灰）', () => {
  const inks = new Set();
  M.forEach(({ btns }) => btns.forEach((x) => {
    const p = x.k.split(' | ');
    if (p[0] === WHITE) inks.add(p[1]);
  }));
  /* ★灰(#6E6E6E)は「選ぶ帯の 選ばれていない物」だけ★（下の帯と同じ考え）。
     ★増やす時は 台帳(ALLOW)にも 理由つきで足す事★＝ここだけ広げない。 */
  [...inks].forEach((c) => ok(c === INK || c === RED || c === GRAY, '★知らない字の色 ' + c + '★'));
  ok(inks.size <= 3, '★白ボタンの字が ' + inks.size + '種類★ ' + [...inks].join(' / '));
  console.log('     白ボタンの字 … ' + [...inks].join(' / '));
});

T('★④ 角丸は 決めた4つだけ（押す物12px／タイル16px／丸999px／帯0px）', () => {
  const rs = new Set();
  M.forEach(({ btns }) => btns.forEach((x) => rs.add(x.r)));
  /* ★16px は タイル★＝押す物であり 箱でもある（箱の角丸と同じにする方が そろって見える）。 */
  const OKR = new Set(['12px', '16px', '999px', '0px']);
  const bad = [...rs].filter((r) => !OKR.has(r));
  ok(!bad.length, '★決めていない角丸 ' + bad.join(' / ') + '★');
  console.log('     角丸 … ' + [...rs].join(' / '));
});

/* ═══ ★箱と 字の大きさ★（司さん 2026-08-29「統一感は？」＝押す物だけでは 足りない）═══
   ★測る前は 箱8通り・字25通り★だった。 */
export const BOX_ALLOW = [
  { k: '16px | 1px ' + EDGE + ' | 14px/14px', why: '★ふつうの箱★＝角丸16・枠 #C8ECD8 1px・内側14px（全画面 共通）' },
  { k: '16px | 1px ' + EDGE + ' | 0px/0px', why: '★畳んだ箱（.card.more）★＝内側は 中の物が14px 持つ（皮の決まり）' },
  { k: '16px | 1px ' + EDGE + ' | 26px/14px', why: '★空の知らせ（.empty）★＝中央に置くので 上下だけ広い' },
];
const BOX_K = new Set(BOX_ALLOW.map((x) => x.k));
/* ★字の段★（10 / 11 / 12 / 13 / 15 / 16 / 20）＝★半端な段を作らない★
   16px … ★打つ欄★（iOSが勝手に拡大しないための決まり）
   20px … 画面の名前・ロゴ */
export const FONT_STEPS = [
  '10px',   // 下の帯の字
  '11px',   // 補助（小さい説明）
  '12px',   // 説明・注意書き
  '13px',   // 小見出し・札
  '14px',   // ★押す物の字★（皮の .btn-primary / .btn-ghost が 14px＝1か所で決めている）
  '15px',   // 見出し
  '16px',   // ★打つ欄★（iOSが勝手に拡大しないための決まり＝これ未満にしない）
  '20px',   // 画面の名前・ロゴ
];

T('★⑤ 箱（カード）の顔は 決めた3つだけ', () => {
  const kinds = new Map();
  M.forEach(({ rel, boxes }) => (boxes || []).forEach((x) => {
    if (!kinds.has(x.k)) kinds.set(x.k, { n: 0, ex: [] });
    const e = kinds.get(x.k); e.n++;
    if (e.ex.length < 2) e.ex.push(x.cls + '（' + rel + '）');
  }));
  ok(kinds.size > 0, '★箱を 1つも 測れていません★');
  const bad = [...kinds.entries()].filter(([k]) => !BOX_K.has(k));
  if (bad.length) {
    throw new Error('★' + bad.length + '通り★ 台帳に無い箱\n     '
      + bad.map(([k, v]) => k + '  ×' + v.n + '  例: ' + v.ex.join(' / ')).join('\n     '));
  }
  console.log('     箱 ' + [...kinds.values()].reduce((a, x) => a + x.n, 0) + '個 ／ 顔 ' + kinds.size + '通り（台帳 ' + BOX_ALLOW.length + '通り）');
});

T('★⑥ 字の大きさは 決めた段だけ（半端な段を作らない）', () => {
  const kinds = new Map();
  M.forEach(({ rel, fonts }) => (fonts || []).forEach((x) => {
    if (!kinds.has(x.px)) kinds.set(x.px, { n: 0, ex: [] });
    const e = kinds.get(x.px); e.n++;
    if (e.ex.length < 2) e.ex.push('「' + x.t + '」（' + rel + '）');
  }));
  ok(kinds.size > 0, '★字を 1つも 測れていません★');
  const bad = [...kinds.entries()].filter(([k]) => FONT_STEPS.indexOf(k) < 0);
  if (bad.length) {
    throw new Error('★段に無い大きさ ' + bad.length + '種類★\n     '
      + bad.map(([k, v]) => k + '  ×' + v.n + '  例: ' + v.ex.join(' / ')).join('\n     '));
  }
  console.log('     字 ' + [...kinds.values()].reduce((a, x) => a + x.n, 0) + '個 ／ 段 '
    + [...kinds.keys()].sort((a, b) => parseFloat(a) - parseFloat(b)).join(' / '));
});

/* ═══ ★自己確認：わざと崩して 赤になるか★ ═══ */
if (process.argv.includes('--self-test')) {
  console.log('\n[--self-test] ★わざと崩して 赤になるか★');
  const B = await measure('.btn-primary{background:#2E7D54 !important}');
  const solid = new Set();
  B.forEach(({ btns }) => btns.forEach((x) => {
    const bg = x.k.split(' | ')[0];
    if (bg !== WHITE && bg !== CLEAR) solid.add(bg);
  }));
  T('★自① 本命の緑を もう1種類 混ぜると 気づける', () => {
    ok(solid.size > 1, '★2種類にしたのに 1種類だと言っている＝この検査は空振り★ ' + [...solid].join(' / '));
    console.log('     わざと混ぜた … ' + [...solid].join(' / '));
  });
  const C = await measure('.btn-ghost{color:#555555 !important}');
  const inks = new Set();
  C.forEach(({ btns }) => btns.forEach((x) => { const p = x.k.split(' | '); if (p[0] === WHITE) inks.add(p[1]); }));
  T('★自② 白ボタンの字を 灰色に戻すと 気づける', () => {
    ok(inks.has('rgb(85, 85, 85)'), '★灰色にしたのに 見つけられない＝空振り★ ' + [...inks].join(' / '));
  });
  T('★自③ 直した後は また 揃っている（戻し忘れを作らない）', () => {
    const bad = [...kinds.keys()].filter((k) => !ALLOW_K.has(k));
    ok(!bad.length, '★実物が 揃っていない★ ' + bad.join(' / '));
  });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
