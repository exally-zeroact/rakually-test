/* shot-saitei-an.mjs — ★最低賃金の 客に出る1行を どう 見せるか 3案を 絵に する★
 * =============================================================================
 * ★なぜ 要るか（2026-09-13 実測）★
 *   今 客に 出ている 字（kyuyo/js/app.js の pref の answer）は
 *     「★東京都の最低賃金は 1,226円★（2026年10月1日から）。」
 *   1,226 は ★今 効いている 旧額★／2026年10月1日 は ★新額 1,280 が 始まる日★。
 *   ＝★額と 日付が 別々の物★＝「1,226円が 10月1日から」と 読める。
 *   徳島県は もっと わるい …「1,046円（2026年11月1日から）」＝実際は 11月1日から 1,103円。
 *   しかも ★「発効日は予定」が この字に 1つも 付いていない★。
 *
 * ★この道具は 本体を 1文字も 変えていない★（shot-hamidashi-an.mjs と 同じ作法）
 *   ＝アプリの CSS（kyuyo/css/app.css）と 実物の lib（saitei-chingin.js）を 読み、
 *     ★聞く形の カードの 形そのまま★に 案の 字を 入れて 撮るだけ。
 *   ★倉庫（テスト口座）には 1バイトも 書かない★（ログインしない）。
 *
 * 使い方: node scripts/shot-saitei-an.mjs [出し先フォルダ]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { borrow, launch as pwLaunch } from './_borrow-playwright.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || path.join(ROOT, '.shot-saitei-an');
fs.mkdirSync(OUT, { recursive: true });
const require_ = createRequire(import.meta.url);
const SAI = require_(path.join(ROOT, 'kyuyo', 'lib', 'saitei-chingin.js'));
const CSS = fs.readFileSync(path.join(ROOT, 'kyuyo', 'css', 'app.css'), 'utf8');

/* ★今日を 手で 書かない★＝走らせた 日で 決まる（去年の字が 残る 事故の 形） */
const TODAY = (() => { const d = new Date(); const p = (n) => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })();

const yen = (n) => (Number(n) || 0).toLocaleString('ja-JP');
/* iso(YYYY-MM-DD) → 2026年10月1日（app.js の askJpDate と 同じ 出し方） */
const jp = (iso) => { const s = String(iso || ''); if (s.length !== 10) return '';
  return (+s.slice(0, 4)) + '年' + (+s.slice(5, 7)) + '月' + (+s.slice(8, 10)) + '日'; };
/* 発効日の 前日（「今は いつまで」を 言う為） */
const zenjitsu = (iso) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10); };

const KEN = [['tokyo', '東京都'], ['tokushima', '徳島県']];
const MITEI = !!SAI.HATSUKO_MITEI;

/* ── 客に 出る 1行（4通り）─────────────────────────────────
   「今のまま」は ★本体の 字を そのまま 写した物★（app.js 691行） */
function bun(kind, code, name) {
  const p = SAI.todofuken[code];
  const ima = SAI.chinginOn(code, TODAY);      // 今 効いている額
  const shin = p.chingin;                      // 新額
  const hat = p.hatsuko;                       // 発効日
  const yotei = MITEI ? '（予定）' : '';
  const shime = '時給がこれを下回ると赤で止めます。';
  if (kind === 'ima') {
    return '★' + name + 'の最低賃金は ' + yen(ima) + '円★（' + jp(hat) + 'から）。' + shime;
  }
  if (kind === 'an1') {   /* 今 と これから を 並べる */
    return '★' + name + 'の最低賃金は 今 ' + yen(ima) + '円★。'
      + jp(hat) + 'から ' + yen(shin) + '円' + yotei + '。' + shime;
  }
  if (kind === 'an2') {   /* これから を 主に（経営者1の案） */
    return '★' + name + 'は ' + jp(hat) + 'から ' + yen(shin) + '円★'
      + (MITEI ? '（発効日は予定）' : '') + '。それまでは ' + yen(ima) + '円。' + shime;
  }
  /* an3 … 2行に 分ける */
  return '★' + name + 'の最低賃金★<br>'
    + '今（' + jp(zenjitsu(hat)) + 'まで）　… ' + yen(ima) + '円<br>'
    + jp(hat) + 'から　… ' + yen(shin) + '円' + yotei + '<br>' + shime;
}

function card(kind, code, name) {
  return '<div class="card ask-card"><div class="ask-wrap">'
    + '<div class="ask-prog">2問目 / 全8問</div>'
    + '<div class="ask-q">どこの県ですか？<span class="ask-sub">最低賃金は「事業場の所在地」で決まります</span></div>'
    + '<div class="ask-input"><select class="ask-in"><option>' + name + '</option></select></div>'
    + '<div class="ask-ans guessed"><span class="ask-badge">当てました</span>' + bun(kind, code, name) + '</div>'
    + '<div class="ask-acts"><button class="ask-ok">これで進む</button></div>'
    + '<div class="ask-foot">答えた 1問 / 全8問　こちらで決めた 6つ</div>'
    + '</div></div>';
}

function page(kind) {
  return '<!doctype html><meta charset="utf-8"><style>' + CSS
    + 'body{margin:0;padding:10px;}#ha{font:700 12px/1.6 "Noto Sans JP",sans-serif;color:#555;padding:2px 2px 8px}</style>'
    + '<body><div id="ha"></div>'
    + KEN.map(([c, n]) => card(kind, c, n)).join('')
    + '<script>document.getElementById("ha").textContent='
    + '"実測 幅 "+document.documentElement.clientWidth+"px（この絵の中で 測った数）";<\/script>';
}

const ch = await borrow('shot-saitei-an', 'chromium');
if (!ch) { console.log('🟡 ★未測定★ playwright を 借りられない'); process.exit(2); }
const b = await pwLaunch('shot-saitei-an', ch, undefined, 'chromium');
const RAN = [['ima', '0-今のまま'], ['an1', '1-今とこれからを並べる'], ['an2', '2-これからを主に'], ['an3', '3-2行に分ける']];
const dekita = [];
for (const [kind, na] of RAN) {
  const pg = await b.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  await pg.setContent(page(kind), { waitUntil: 'load' });
  await pg.waitForTimeout(300);
  const f = path.join(OUT, 'saitei-' + kind + '.png');
  await pg.screenshot({ path: f, fullPage: true });
  await pg.close();
  const buf = fs.readFileSync(f);
  dekita.push({ na, f, byte: buf.length, sha: createHash('sha256').update(buf).digest('hex').slice(0, 12) });
}
await b.close();

console.log('今日 = ' + TODAY + ' ／ 発効日は ' + (MITEI ? '★予定（未確定）★' : '確定'));
for (const [c, n] of KEN) {
  const p = SAI.todofuken[c];
  console.log('  ' + n + ' … 今 ' + yen(SAI.chinginOn(c, TODAY)) + '円 → ' + jp(p.hatsuko) + 'から ' + yen(p.chingin) + '円');
}
console.log('');
for (const d of dekita) console.log('  ' + d.na + '  ' + d.f + '  ' + d.byte + 'バイト  sha256:' + d.sha);
