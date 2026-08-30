/* pdf-align.mjs — ★自作PDFが 紙の揃え方を そのまま 写しているか★
 * =============================================================================
 * ★司さん 2026-08-30★「なんでここが揃ってないんど／右揃えか左揃えかやろが」
 *   自社（発行者）の4行が ★紙では きっちり右揃え（右端 全部 756px）★なのに、
 *   PDFでは ★左端で 置いていた★ので 右端が ばらけていた。
 *   （画面の字体と PDFの字体は 幅が 違う＝左端で置くと 右が 合わない）
 *
 * ここで見る物（★本物のブラウザで 本物の紙から PDFを作って 数で★）
 *   ① 右揃えの字は ★右端が 紙と同じ★（1pt以内）
 *   ② 左揃えの字は ★左端が 紙と同じ★
 *   ③ 右揃えの塊（自社の4行）は ★右端が 互いに 揃っている★
 *   ④ 字が 1つも 化けていない（異体字 髙﨑邉 ㈱№℡㊞ も）
 *
 * ★ブラウザが要る★ので、無い機械では ★未測定★（緑と言わない）。
 * 使い方: node seikyu/tests/pdf-align.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(import.meta.url);

let chromium = null;
for (const p of [path.join(ROOT, 'node_modules/playwright/index.js'),
  'C:/Users/zeroa/Exally-test/node_modules/playwright/index.js']) {
  if (!fs.existsSync(p)) continue;
  try {
    const m = await import(pathToFileURL(p).href);
    chromium = m.chromium || (m.default && m.default.chromium);
    if (chromium) break;
  } catch (e) { /* 次の借り先 */ }
}
if (!chromium) {
  console.log('[pdf-align] ★未測定★ … playwright が 借りられません');
  console.log('  ★これは「問題なし」では ありません★。★測るには★ npm install && npx playwright install chromium');
  process.exit(0);
}

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };

const PAPER = require_(path.join(ROOT, 'seikyu/lib/seikyu-paper.js'));
const TPL = require_(path.join(ROOT, 'seikyu/lib/seikyu-templates.js'));
const X = require_(path.join(ROOT, 'seikyu/lib/seikyu-tax.js'));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf' };
const srv = http.createServer((rq, rs) => {
  const u = decodeURIComponent(rq.url.split('?')[0]);
  const p = path.join(ROOT, u);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { rs.writeHead(404); rs.end(); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  rs.end(fs.readFileSync(p));
});
await new Promise((r) => srv.listen(0, r));
const port = srv.address().port;

const lines = [
  { name: '髙﨑邉 運転代行 ㈱№℡㊞ 10月分', qty: '1', unit: '式', price: '30000', rate: 10 },
  { name: '待機料', qty: '2', unit: '時間', price: '2500', rate: 10 },
];
const tax = X.compute({ lines, taxMode: 'exclusive', rounding: 'floor' });
const built = PAPER.build({
  inv: { no: 'A-0001', issue_ymd: '2026-10-05', due_ymd: '2026-11-30', kind: 'invoice',
    lines, totals: { grandTotal: tax.grandTotal }, data: {} },
  tax,
  partner: { name: '八木工業株式会社', honor: '御中' },
  org: { yago: '合同会社Rakunally', addr: '愛媛県今治市○○町1-2-3', tel: '0898-00-0000',
    invoiceNo: 'T3500003003293', bank: '伊予銀行 今治支店 普通 1234567' },
  template: TPL.getOrDefault('std1'),
  deduct: 11340, deductLines: [{ name: '弁当代 矢原', amount: 11340 }],
});
const html = (typeof built === 'string') ? built : (built.html || '');

console.log('\n[pdf-align] 自作PDFが 紙の揃え方を そのまま 写しているか');

const b = await chromium.launch();
const pg = await (await b.newContext({ viewport: { width: 900, height: 1300 } })).newPage();
await pg.goto('http://localhost:' + port + '/seikyu/index.html', { waitUntil: 'domcontentloaded' });
await pg.addScriptTag({ url: '/seikyu/lib/seikyu-pdf.js' });
const r = await pg.evaluate(async (h) => {
  const bytes = await window.SeikyuPdf.build(h, { base: '../' });
  return { bytes: bytes.length, placed: window.SeikyuPdf.lastPlaced(), missing: window.SeikyuPdf.lastMissing() };
}, html);
await b.close();
srv.close();

T('★測れている（PDFが出来て 字も 置かれている）', () => {
  ok(r.bytes > 100000, '★PDFが 小さすぎる（' + r.bytes + 'B）★');
  ok(r.placed.length > 40, '★置いた字が ' + r.placed.length + '個＝測れていません★');
  console.log('     ' + (r.bytes / 1024 / 1024).toFixed(2) + 'MB ／ 置いた字 ' + r.placed.length + '個');
});

T('★① 右揃えの字は 右端が 紙と同じ（1pt以内）', () => {
  const rs = r.placed.filter((p) => p.align === 'right');
  ok(rs.length > 5, '★右揃えの字が ' + rs.length + '個＝見ていません★');
  const bad = rs.filter((p) => Math.abs(p.right - p.wantRight) > 1);
  ok(!bad.length, '★' + bad.length + '個 ずれている★ 例: '
    + bad.slice(0, 3).map((p) => '「' + p.s + '」' + p.right.toFixed(1) + '≠' + p.wantRight.toFixed(1)).join(' / '));
  console.log('     右揃え ' + rs.length + '個 … ずれ 0個');
});

T('★② 左揃えの字は 左端が 紙と同じ', () => {
  const ls = r.placed.filter((p) => p.align === 'left');
  ok(ls.length > 5, '★左揃えの字が ' + ls.length + '個★');
  const bad = ls.filter((p) => Math.abs(p.x - p.wantLeft) > 0.5);
  ok(!bad.length, '★' + bad.length + '個 ずれている★');
  console.log('     左揃え ' + ls.length + '個 … ずれ 0個');
});

T('★③ 自社の行（会社名・住所・TEL・登録番号）の右端が 互いに 揃っている', () => {
  const want = ['合同会社Rakunally', '愛媛県今治市', 'TEL 0898', '登録番号 T35'];
  const got = want.map((w) => r.placed.filter((p) => p.s.indexOf(w) >= 0)[0]);
  got.forEach((p, i) => ok(p, '★「' + want[i] + '」が 紙に 出ていない★'));
  const rights = got.map((p) => p.right);
  const spread = Math.max.apply(null, rights) - Math.min.apply(null, rights);
  ok(spread <= 1, '★右端が ' + spread.toFixed(1) + 'pt ばらけている★ ' + rights.map((x) => x.toFixed(1)).join(' / '));
  console.log('     4行の右端 … ' + rights.map((x) => x.toFixed(1)).join(' / ') + '（ばらつき ' + spread.toFixed(2) + 'pt）');
});

T('★④ 字が 1つも 化けていない', () => {
  ok(!r.missing.length, '★化けた字: ' + r.missing.join('') + '★');
  const joined = r.placed.map((p) => p.s).join('');
  ['髙', '﨑', '邉', '㈱', '№', '℡', '㊞'].forEach((c) => {
    ok(joined.indexOf(c) >= 0, '★' + c + ' が 紙から 消えている★');
  });
  console.log('     異体字 髙﨑邉 ㈱№℡㊞ … 7つとも 出ている');
});

/* ═══ ★様式ぜんぶ・複数ページでも 出るか★ ═══════════════════════
   ★1様式・1枚でしか 確かめずに ボタンを出す★のが 一番 危ない
   （出してから「うちの様式では 出ません」が 分かる）。 */
const CASES = [
  { name: 'std1 / 3行', tpl: 'std1', n: 3 },
  { name: 'std1 / 3行＋控除', tpl: 'std1', n: 3, deduct: 11340 },
  { name: 'std1 / 40行（2枚）', tpl: 'std1', n: 40, pages: 2 },
  { name: 'elegant / 6行', tpl: 'elegant', n: 6 },
  { name: 'koujo / 6行', tpl: 'koujo', n: 6 },
  { name: '見積書', tpl: 'std1', n: 3, kind: 'quote' },
];

const srv2 = http.createServer((rq, rs) => {
  const u = decodeURIComponent(rq.url.split('?')[0]);
  const p = path.join(ROOT, u);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { rs.writeHead(404); rs.end(); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  rs.end(fs.readFileSync(p));
});
await new Promise((r) => srv2.listen(0, r));
const port2 = srv2.address().port;
const b2 = await chromium.launch();
const pg2 = await (await b2.newContext({ viewport: { width: 900, height: 1300 } })).newPage();
await pg2.goto('http://localhost:' + port2 + '/seikyu/index.html', { waitUntil: 'domcontentloaded' });
await pg2.addScriptTag({ url: '/seikyu/lib/seikyu-pdf.js' });
const results = [];
for (const c of CASES) {
  const ls = Array.from({ length: c.n }, (_, i) => ({ name: '品目' + (i + 1), qty: '1', unit: '式', price: '1000', rate: 10 }));
  const tx = X.compute({ lines: ls, taxMode: 'exclusive', rounding: 'floor' });
  const bt = PAPER.build({
    inv: { no: 'A-1', issue_ymd: '2026-10-05', due_ymd: '2026-11-30', kind: c.kind || 'invoice',
      lines: ls, totals: { grandTotal: tx.grandTotal }, data: {} },
    tax: tx, partner: { name: '八木工業株式会社', honor: '御中' },
    org: { yago: '合同会社Rakunally', addr: '愛媛県今治市', invoiceNo: 'T3500003003293', bank: '伊予銀行 今治支店 普通 1234567' },
    template: TPL.getOrDefault(c.tpl),
    deduct: c.deduct || 0, deductLines: c.deduct ? [{ name: '弁当代', amount: c.deduct }] : [],
  });
  const h = (typeof bt === 'string') ? bt : (bt.html || '');
  const sheets = (h.match(/class="sheet"/g) || []).length;
  const out = await pg2.evaluate(async (hh) => {
    try {
      const bytes = await window.SeikyuPdf.build(hh, { base: '../' });
      return { ok: true, size: bytes.length, placed: window.SeikyuPdf.lastPlaced().length,
        missing: window.SeikyuPdf.lastMissing().length };
    } catch (e) { return { ok: false, msg: String(e && e.message) }; }
  }, h);
  results.push(Object.assign({ name: c.name, sheets: sheets, wantPages: c.pages || 1 }, out));
}
await b2.close();
srv2.close();

T('★⑤ 様式ぜんぶ・控除あり・複数ページ・見積書でも PDFが 出る', () => {
  const bad = results.filter((x) => !x.ok);
  ok(!bad.length, '★作れない物★ ' + bad.map((x) => x.name + '（' + x.msg + '）').join(' / '));
  results.forEach((x) => {
    ok(x.size > 100000, '★' + x.name + ' が 小さすぎる（' + x.size + 'B）★');
    ok(x.placed > 20, '★' + x.name + ' の字が ' + x.placed + '個★');
    ok(!x.missing, '★' + x.name + ' で 字が 化けた★');
    ok(x.sheets === x.wantPages, '★' + x.name + ' の紙が ' + x.sheets + '枚（' + x.wantPages + '枚のはず）★');
  });
  results.forEach((x) => console.log('     ' + x.name.padEnd(20) + ' 紙' + x.sheets + '枚 ／ 字'
    + String(x.placed).padStart(3) + '個 ／ 化け' + x.missing));
});

/* ═══ ★角印の場所★（司さん 2026-08-30「なんで角印の場所がそこなんど 請求書アプリ見てこい」）═══
   ★角印標準＝社名の1行目の右端に 重ねて押す★
   （見本＝代行請求 invoice-pdf.js:760「判子（社名＝1行目の右端に"重ねて"押す＝角印標準）」）
   ★直す前★は 登録番号の下に ぶら下げていた＝ハンコが 宙に浮いていた。 */
const srv3 = http.createServer((rq, rs) => {
  const u = decodeURIComponent(rq.url.split('?')[0]);
  const p = path.join(ROOT, u);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { rs.writeHead(404); rs.end(); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  rs.end(fs.readFileSync(p));
});
await new Promise((r) => srv3.listen(0, r));
const port3 = srv3.address().port;
const sealUrl = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'img/favicon-32.png')).toString('base64');
const ls3 = [{ name: '運転代行 10月分', qty: '1', unit: '式', price: '30000', rate: 10 }];
const tx3 = X.compute({ lines: ls3, taxMode: 'exclusive', rounding: 'floor' });
const bt3 = PAPER.build({
  inv: { no: 'A-1', issue_ymd: '2026-10-05', due_ymd: '2026-11-30', kind: 'invoice',
    lines: ls3, totals: { grandTotal: tx3.grandTotal }, data: {} },
  tax: tx3, partner: { name: '八木工業株式会社', honor: '御中' },
  org: { yago: '合同会社Rakunally', addr: '愛媛県今治市', invoiceNo: 'T3500003003293',
    bank: '伊予銀行 今治支店 普通 1234567', sealDataUrl: sealUrl, sealSizeMm: 18 },
  template: TPL.getOrDefault('std1'),
});
const h3 = (typeof bt3 === 'string') ? bt3 : (bt3.html || '');
const b3 = await chromium.launch();
const pgm = await (await b3.newContext({ viewport: { width: 794, height: 1123 } })).newPage();
await pgm.setContent(h3, { waitUntil: 'load' });
const seal = await pgm.evaluate(() => {
  const im = document.querySelector('img.seal'), nm = document.querySelector('.from-name');
  if (!im || !nm) return null;
  const a = im.getBoundingClientRect(), b = nm.getBoundingClientRect();
  return { s: { l: a.left, r: a.right, t: a.top, b: a.bottom },
    n: { l: b.left, r: b.right, t: b.top, b: b.bottom } };
});
const pg3 = await (await b3.newContext({ viewport: { width: 900, height: 1300 } })).newPage();
await pg3.goto('http://localhost:' + port3 + '/seikyu/index.html', { waitUntil: 'domcontentloaded' });
await pg3.addScriptTag({ url: '/seikyu/lib/seikyu-pdf.js' });
const withSeal = await pg3.evaluate(async (h) => {
  const bytes = await window.SeikyuPdf.build(h, { base: '../' });
  return { size: bytes.length, bad: window.SeikyuPdf.lastBadImages() };
}, h3);
await b3.close();
srv3.close();

T('★⑥ 角印は 社名の1行目に 重ねて押す（ぶら下げない）', () => {
  ok(seal, '★紙に 角印が 出ていない★');
  const over = Math.min(seal.s.r, seal.n.r) - Math.max(seal.s.l, seal.n.l);
  const overY = Math.min(seal.s.b, seal.n.b) - Math.max(seal.s.t, seal.n.t);
  ok(over > 10, '★社名の行と 横に 重なっていない（' + over.toFixed(0) + 'px）★');
  ok(overY > 10, '★社名の行と 縦に 重なっていない（' + overY.toFixed(0) + 'px）＝ぶら下がっている★');
  ok(Math.abs(seal.s.r - seal.n.r) <= 1, '★角印の右端が 社名の右端と 揃っていない★');
  console.log('     社名 ' + seal.n.l.toFixed(0) + '〜' + seal.n.r.toFixed(0)
    + ' ／ 角印 ' + seal.s.l.toFixed(0) + '〜' + seal.s.r.toFixed(0)
    + ' ／ 重なり 横' + over.toFixed(0) + 'px 縦' + overY.toFixed(0) + 'px');
});

T('★⑦ 角印が PDFにも 入る（絵を 落とさない）', () => {
  ok(!withSeal.bad.length, '★出せなかった絵★ ' + withSeal.bad.join(' / '));
  ok(withSeal.size > 100000, '★PDFが 小さすぎる★');
  console.log('     角印つき ' + (withSeal.size / 1024 / 1024).toFixed(2) + 'MB ／ 出せなかった絵 0件');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
