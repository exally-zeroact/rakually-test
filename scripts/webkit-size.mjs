/* webkit-size.mjs — ★iOSと同じエンジン(WebKit)で 375/390/430 を見る★
 * =============================================================================
 * ★Chromium だけでは iOS は分かりません★（指示役 2026-08-27）。
 * scripts/input-size.mjs は Chrome で測る物。ここは ★WebKit で もう一度 測る★。
 *
 * ★回せない時は 赤にせず「未測定」と出す★（指示役の裁定 2026-08-28）
 *   playwright は ★この repo の持ち物ではない★（別のrepoから借りる）。
 *   ⇒ ★借り先が無い＝測れない★時は ★はっきり「未測定」と言って 緑で終わる★。
 *   ★0件と 未測定を 混ぜない★（「測れなかった」を「問題なし」と読ませない）。
 *   ★入っていない見張りは 0回 回る★ので、★CIには入れる★（未測定でも 毎回 声は出す）。
 *
 * 数える物 … ①16px未満の打つ欄 ②20×20未満の押す的 ③横はみ出し(px)
 *            ★④画面の端から「描かれた字」までの左右の距離★（指示役 2026-08-28 が見つけた穴）
 *
 * ★なぜ ④を足したか★
 *   司さんが実機で「★余白が無くて見にくい★」と言った所を、★この見張りは 緑のまま 素通り★した。
 *   犯人は `css/rakunally-ui.css` の `.more { padding: 0 }` が `.card` の padding:14px を消していた事。
 *   ＝★字が 画面の端から 17px の所に居た（他の札は 31px）★。
 *   ★①②③は どれも「字がどこから始まるか」を見ていなかった★ので 何も起きなかった。
 *
 * ★測り方（箱ではなく 描かれた字を測る）★
 *   ・字は ★Range で実測★する。★箱(getBoundingClientRect)では駄目★＝
 *     箱に padding を足しても ★箱の位置は動かない★（中身だけ動く）。実際 これで1回 だまされた。
 *   ・打つ欄は 箱で良い（横いっぱいに伸びるので 右の余白も測れる）。
 *   ・判定は ★札ひとつずつ「枠から 中身まで 何px か」★（10px未満なら 赤・設計は14px）。
 *     ★画面の端からの距離で 判定してはいけない★＝中央寄せの画面（管理のログイン札）では
 *     いちばん多い値が ぶれて ★嘘の赤★が出た（2026-08-28 実際に出して 直した）。
 *   ・画面の端から ★札の外枠まで★ の距離は ★画面ごとに1つ★ 出す（そろっているかを見る為）。
 *   ・★札が在るのに 中身を1つも測れなかった★時は 名前を出す（★0件と言わない★）。
 * 使い方: node scripts/webkit-size.mjs [--self-test]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const WIDTHS = [375, 390, 430];
const MIN = 16, TAP = 20;
/* ★画面の端から 札の外枠まで の決まり★（実測して そろえた・2026-08-28）
   ★ここに書いていない画面は 16px でなければ 赤★＝「同じ器なのに アプリごとに違う」を止める。
   ★外すには 理由が要る★（ファイル名だけで黙って外さない）。 */
const PAGE_INSET = 16;
const PAGE_INSET_EXCEPT = {
  'kyuyo/admin.html': '★中央寄せの札（max-width 360px のログイン）★＝幅で位置が変わる'
    + '（実測 375→8px / 390→15px / 430→35px）。★横いっぱいの画面と 比べられない★。',
};
/* ★JSが中身を入れる札★＝静止したHTMLでは 中が空。★名前と理由を書いた物だけ 見逃す★
   （ファイルごと外さない＝その札に 新しい違反が入っても 見逃さない為）。 */
const EMPTY_OK = {
  'div.card.ask-card': '★聞く形の札★＝会社/従業員の7問を JS が作って入れる（kyuyo/js/app.js）。'
    + '★中身の余白は 開いた後に scripts/input-size.mjs が Chrome で測っている★。',
};
/* ★閉じている物を 全部 開けてから測る★
   ★.hidden を入れていなかった★ので、kyuyo/meisai.html の ★札8個が 3幅とも 測れていなかった★
   （2026-08-28 ④を足して 初めて 分かった＝それまで「0件」と言っていた）。 */
const OPEN_ALL = '<style>.screen{display:block!important}details>*{display:block!important}'
  + '[hidden]{display:block!important}[style*="display:none"]{display:block!important}'
  + '.hide{display:block!important}.hidden{display:block!important}.acc-body{display:block!important}</style>';

/* ★playwright は 別の repo に入っている物を借りる★（rakually-test には入れない＝重い依存を足さない） */
/* ★借り先★（この repo には入れない＝重い依存を足さない） */
const LENDERS = [
  /* ★この repo の物★（2026-08-28 案A＝devDependency に入れた） */
  path.join(ROOT, 'node_modules/playwright/index.js'),
  /* 手元に無い時だけ 借りる（司さんのPCで すぐ回せるように） */
  'C:/Users/zeroa/Exally-test/node_modules/playwright/index.js',
  'C:/Users/zeroa/Daikou-app/node_modules/playwright/index.js',
  'C:/Users/zeroa/Daikou-app-test/node_modules/playwright/index.js',
];
function unmeasured(why) {
  console.log('[webkit] ★未測定★ … ' + why);
  console.log('  ★これは「問題なし」ではありません★。Chrome で測る scripts/input-size.mjs は 毎回 走っています。');
  console.log('  ★測るには★ npm install && npx playwright install webkit');
  console.log('  ★決めた1行★ この見張りは ★週1（月曜朝）と 見た目に関わる所を触った時★ に');
  console.log('              .github/workflows/webkit.yml で ★本当に測ります★（毎回のCIには置きません）。');
  process.exit(0);
}
let webkit = null;
for (const pw of LENDERS) {
  if (!fs.existsSync(pw)) continue;
  try {
    const m = await import(pathToFileURL(pw).href);
    webkit = m.webkit || (m.default && m.default.webkit) || null;
    if (webkit) break;
  } catch (e) { /* 次の借り先を見る */ }
}
if (!webkit) unmeasured('playwright(webkit) を 借りられる場所が 見つかりません');

function screens(root) {
  const out = fs.readdirSync(root).filter((f) => /\.html$/i.test(f));
  for (const app of ['kyuyo', 'seikyu']) {
    const d = path.join(root, app);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) if (/\.html$/i.test(f)) out.push(app + '/' + f);
  }
  return out.sort();
}
function pageOf(rel) {
  const file = path.join(ROOT, rel);
  let html = fs.readFileSync(file, 'utf8');
  html = html.replace(/<script[\s\S]*?<\/script>/g, '');
  html = html.replace(/<link\b[^>]*rel="stylesheet"[^>]*>/gi, (tag) => {
    const m = /href="([^"]+)"/.exec(tag);
    if (!m) return tag;
    const href = m[1].split('?')[0];
    if (/^https?:/.test(href)) return '';
    return tag.replace(m[1], pathToFileURL(path.resolve(path.dirname(file), href)).href);
  });
  return html.replace('</head>', OPEN_ALL + '</head>');
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wk-'));
const b = await webkit.launch();
const rows = [];
for (const rel of screens(ROOT)) {
  const f = path.join(TMP, rel.replace(/[^\w]+/g, '_') + '.html');
  fs.writeFileSync(f, pageOf(rel), 'utf8');
  for (const w of WIDTHS) {
    const ctx = await b.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(pathToFileURL(f).href, { waitUntil: 'load' });
    const r = await page.evaluate(({ MIN, TAP }) => {
      const nm = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '')
        + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().replace(/\s+/g, '.') : '');
      const all = [...document.querySelectorAll('input,select,textarea')].filter((e) => e.type !== 'hidden');
      const small = all.filter((e) => (parseFloat(getComputedStyle(e).fontSize) || 0) < MIN)
        .map((e) => nm(e) + ' ' + getComputedStyle(e).fontSize);
      const taps = all.filter((e) => e.type === 'checkbox' || e.type === 'radio');
      const tapSmall = taps.map((e) => ({ n: nm(e), b: e.getBoundingClientRect() }))
        .filter((x) => x.b.width > 0 && x.b.height > 0 && (x.b.width < TAP || x.b.height < TAP))
        .map((x) => x.n + ' ' + Math.round(x.b.width) + '×' + Math.round(x.b.height));
      const zero = taps.filter((e) => { const r2 = e.getBoundingClientRect(); return r2.width * r2.height === 0; }).map(nm);
      /* ★④ 画面の端から 描かれた字／打つ欄まで の距離★ */
      const d = document.documentElement;
      const vw = d.clientWidth;
      /* ★札ひとつずつ「枠から 中身まで」を測る★
         ★画面の端からの距離では 判定しない★＝中央寄せの画面（管理のログイン札）で
         いちばん多い値が ぶれて ★嘘の赤★が出た（2026-08-28 実際に出した）。
         ★司さんが怒ったのは「字が 枠にくっついている」★なので、そこを そのまま測る。 */
      const INNER = 10;                         // 枠から中身まで これ未満は 赤（設計は14px）
      const boxes = [...document.querySelectorAll('.card, .more, .tile')];
      const outer = [], outerR = [], items = [], narrow = [], emptyCards = [];
      boxes.forEach((card) => {
        const cb = card.getBoundingClientRect();
        if (cb.width < 40 || cb.height < 4) return;
        const cs = getComputedStyle(card);
        const bw = parseFloat(cs.borderLeftWidth) || 0, bwr = parseFloat(cs.borderRightWidth) || 0;
        const inL = cb.left + bw, inR = cb.right - bwr;      // 枠の内側
        let n = 0;
        /* rightToo=false … ★字は 右が余るのが普通★なので 右は見ない（見ると全部 赤になる＝1回 出した） */
        const look = (L, R, name, rightToo) => {
          n++; items.push(name);
          const iL = Math.round(L - inL), iR = Math.round(inR - R);
          if (iL < INNER || (rightToo && iR < INNER)) {
            narrow.push(name + ' 枠から 左' + iL + (rightToo ? '/右' + iR : '') + 'px');
          }
        };
        const wk = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
        let t, seen = 0;
        while ((t = wk.nextNode()) && seen < 8) {
          if (!t.nodeValue.trim()) continue;
          const rg = document.createRange(); rg.selectNodeContents(t);
          const bb = rg.getBoundingClientRect();
          if (bb.width < 8 || bb.height < 4) continue;
          /* ★字は 右が余るのが普通★なので 左だけ見る */
          look(bb.left, inR, nm(card) + ' 「' + t.nodeValue.trim().slice(0, 14) + '」', false);
          seen++;
        }
        card.querySelectorAll('input,select,textarea').forEach((e) => {
          if (e.type === 'hidden' || e.type === 'checkbox' || e.type === 'radio') return;
          const bb = e.getBoundingClientRect();
          if (bb.width < 40 || bb.height < 4) return;
          look(bb.left, bb.right, nm(e), true); // 打つ欄は 横いっぱい＝右も見る
        });
        if (!n) emptyCards.push(nm(card));
        /* ★いちばん端に寄った札の 左と右★を覚える。
           ★1枚ずつ「対称か」で選ぶのは 駄目★＝入口は札が2列に並ぶので
           右の列は 左が 201px、左の列は 右が 201px＝★どちらも対称にならない★（1回 そうなった）。
           ⇒ ★左の最小と 右の最小★を見れば、2列でも 1列でも 同じ答えになる。 */
        outer.push(Math.round(cb.left));
        outerR.push(Math.round(vw - cb.right));
      });
      /* 画面の端から 札の外枠まで＝★左の最小と 右の最小が 同じなら それ★。
         違う時は ★片側だけ 詰まっている★ので 数字を両方 出す（黙って片方を採らない）。 */
      const mn = (a) => (a.length ? Math.min(...a) : null);
      const sL = mn(outer), sR = mn(outerR);
      const std = (sL !== null && sL === sR) ? sL : null;
      const stdWhy = (sL === null) ? '札が無い' : (std === null ? '左' + sL + 'px / 右' + sR + 'px で 違う' : '');
      return {
        vw, over: d.scrollWidth - d.clientWidth,
        all: all.length, small, taps: taps.length, tapSmall, zero,
        cards: boxes.length, marks: items.length, std, stdWhy, narrow, empty: emptyCards,
      };
    }, { MIN, TAP });
    rows.push({ rel, w, r });
    await ctx.close();
  }
}
await b.close();
fs.rmSync(TMP, { recursive: true, force: true });

console.log('[webkit] iOSと同じエンジン ／ 幅 ' + WIDTHS.join('/') + 'px\n');
let ng = 0;
rows.forEach(({ rel, w, r }) => {
  const bad = r.small.length + r.tapSmall.length + r.zero.length + (r.over > 0 ? 1 : 0);
  ng += bad;
  console.log('  ' + (rel + ' @' + w).padEnd(28)
    + ' 欄 ' + String(r.all).padStart(3) + '本／16px未満 ' + r.small.length
    + '　押す的 ' + String(r.taps).padStart(2) + '個／20×20未満 ' + r.tapSmall.length
    + '　横はみ出し ' + r.over + 'px'
    + (r.vw !== w ? '　★頼んだ幅で測れていない（' + r.vw + '）★' : ''));
  r.small.forEach((s) => console.log('      ★16px未満★ ' + s));
  r.tapSmall.forEach((s) => console.log('      ★押す的が小さい★ ' + s));
  r.zero.forEach((s) => console.log('      ★測れていない(0×0)★ ' + s));
  /* ★④ 余白★ */
  console.log('      余白 … 札 ' + r.cards + '個／測った字と欄 ' + r.marks + '個'
    + '／画面の端から 札の外枠まで ★' + (r.std === null ? '（' + r.stdWhy + '）' : r.std + 'px') + '★'
    + (r.narrow.length ? '　★枠にくっついている ' + r.narrow.length + '件★' : ''));
  r.narrow.forEach((x) => console.log('      ★余白が足りない★ ' + x));
  ng += r.narrow.length;
  /* ★札が在るのに 中身を1つも測れていない＝0件と言わない★ */
  if (r.empty.length) {
    const bad = r.empty.filter((n) => !EMPTY_OK[n]);
    const okd = r.empty.filter((n) => EMPTY_OK[n]);
    if (okd.length) {
      console.log('      中身が空の札 ' + okd.length + '個（★理由つきで見逃す★）: '
        + [...new Set(okd)].map((n) => n + ' … ' + EMPTY_OK[n]).join(' ／ '));
    }
    if (bad.length) {
      console.log('      ★中身を1つも測れなかった札 ' + bad.length + '個★（0件ではありません）: '
        + bad.slice(0, 4).join(' , ') + (bad.length > 4 ? ' …' : ''));
      ng += bad.length;
    }
  }
});

/* ★画面どうしで そろっているか★＝台帳の値(16px)と 突き合わせる。
   ★いちばん多い値どうしを比べる形は やめた★＝台帳に無い画面が増えた時に
   ★どれが正しいのか 誰にも分からない赤★になるから（2026-08-28 実際に そうなった）。 */
console.log('\n★画面の端から 札の外枠まで（決まり ' + PAGE_INSET + 'px）★');
const seen = new Set();
rows.forEach(({ rel, w, r }) => {
  if (r.std === null) {
    if (r.cards > 0) { console.log('  ' + (rel + '@' + w).padEnd(28) + ' ★' + r.stdWhy + '★（札 ' + r.cards + '個）'); ng++; }
    return;
  }
  const why = PAGE_INSET_EXCEPT[rel];
  const ok = why ? true : r.std === PAGE_INSET;
  if (!ok) { console.log('  ' + (rel + '@' + w).padEnd(28) + ' ★' + r.std + 'px（決まりは ' + PAGE_INSET + 'px）★'); ng++; }
  else if (!seen.has(rel)) {
    seen.add(rel);
    console.log('  ' + rel.padEnd(24) + ' ' + r.std + 'px' + (why ? '　★別の作り★ ' + why : ''));
  }
});
if (!seen.size && !ng) { console.log('  ★1画面も 測れていません（0件ではありません）★'); ng++; }

/* ★最後に かならず 合計を1行 出す★
   （2026-08-28 ④を足す時に この行を 消してしまい、★何件だったか 誰にも分からない緑★を1回 出した。
     ★出さない見張りは 見ていないのと同じ★なので、ここは 消さない。） */
console.log('\n★合計 ' + (ng ? '★' + ng + '件★ 直す物が在ります'
  : '0件（16px未満0本／押す的0個／横はみ出し0px／★余白0件★）') + '★');

/* ★測れた上で 見つかった物は 赤★（未測定は 上で緑にして 抜けている） */
if (ng) process.exit(1);
