/* shot-ichiran.mjs — ★一覧を 実ブラウザで 押して 絵に する★
 * =============================================================================
 * 司さん 2026-09-09「確認押したら 違うページにいって／請求書先が 多くなったら
 *   ごちゃごちゃするやろ／請求ごとや 何年何月分とか 全体とか 選べれるように」
 * ★見張りでは ない★＝赤/緑を 出さない。見せる為の 道具。
 *   ・入る手順は ★tests/_hairu.mjs 1か所★（自分で 書き直さない）
 *   ・入れなかったら ★🟡未測定★（絵が 無いのに 緑と 言わない）
 *   ・出した絵は ★バイト数と sha256 を 一緒に 出す★
 * 使い方: node scripts/shot-ichiran.mjs
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { createHash } from 'node:crypto';
import { borrow, launch as pwLaunch } from './_borrow-playwright.mjs';
import { hairu } from '../tests/_hairu.mjs';
const ROOT = 'C:/Users/zeroa/rakually-test';
const OUT = 'C:/Users/zeroa/AppData/Local/Temp/claude/C--WINDOWS-System32-WindowsPowerShell-v1-0/95680cdf-f1bb-480f-a53c-6f0f118a9fb3/scratchpad';
const ch = await borrow('shot-ichiran', 'chromium');
if (!ch) { console.log('🟡 ★未測定★ playwright を 借りられない'); process.exit(2); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
const srv = http.createServer((rq, rs) => {
  let p = path.join(ROOT, decodeURIComponent(rq.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { rs.writeHead(404); rs.end('x'); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  rs.end(fs.readFileSync(p));
});
await new Promise((r) => srv.listen(0, r));
const PORT = srv.address().port;
const b = await pwLaunch('shot-ichiran', ch, undefined, 'chromium');
/* ★iPhone と 同じ 幅★（司さんが 見ているのは スマホ） */
const pg = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const h = await hairu(pg, 'http://localhost:' + PORT + '/seikyu/index.html', '.bn[data-scr]');
if (!h || h.ok === false) { console.log('🟡 ★未測定★ 入れなかった … ' + JSON.stringify(h)); await b.close(); srv.close(); process.exit(2); }

/* ★取引先が 多い時★を 画面に 積む（倉庫は 触らない＝画面の 中だけ） */
const tsunda = await pg.evaluate(() => {
  const A = window.SeikyuApp, S = A._state;
  const NA = ['八木工業', '黒田空調', '藤原建設', '菊水ホテル', '鳥越ハンカチ',
    '今治タオル', '大西電設', '波方運送'];
  const YM = ['2026-09', '2026-08', '2026-07'];
  S.partners = NA.map((n, i) => ({ id: 'p' + i, data: { name: n } }));
  S.invoices = [];
  YM.forEach((ym) => NA.forEach((n, i) => {
    S.invoices.push({ id: 'v' + ym + '-' + i, no: ym.replace('-', '') + '-' + String(i + 1).padStart(3, '0'),
      status: 'issued', doc_type: 'invoice', partner_id: 'p' + i, issue_ymd: ym + '-05',
      tax_mode: 'exclusive', rounding: 'floor',
      lines: [{ name: '工事代金', qty: '1', unit: '式', price: String(50000 * (i + 1)),
        amount: String(50000 * (i + 1)), rate: 10, memo: '' }],
      data: {}, totals: { grandTotal: 55000 * (i + 1) } });
  }));
  S.receipts = []; S.fil = 'all'; S.docType = 'invoice';
  A._go('scr-list'); A._renderListForTest();
  return { tsu: S.invoices.length, sha: NA.length };
});
await pg.waitForTimeout(500);
const shots = [];
const toru = async (na, f) => {
  await pg.waitForTimeout(400);
  const p = path.join(OUT, f);
  await pg.screenshot({ path: p, fullPage: false });
  shots.push({ na, p, byte: fs.statSync(p).size,
    sha: createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 12) });
};
await toru('一覧（全体）', 'ichiran-1-zentai.png');

/* ★何年何月分で しぼる★ */
await pg.selectOption('#l-month', '2026-08');
await toru('一覧（2026年8月分）', 'ichiran-2-tsuki.png');
await pg.selectOption('#l-month', '');

/* ★取引先で しぼる★ */
const pid = await pg.evaluate(() => document.getElementById('l-partner').options[1].value);
await pg.selectOption('#l-partner', pid);
await toru('一覧（取引先ごと）', 'ichiran-3-aite.png');
await pg.selectOption('#l-partner', '');

/* ★確認を 押す＝別の 画面へ★ */
await pg.click('#list-body [data-look]');
await pg.waitForTimeout(900);
const ima = await pg.evaluate(() => ({
  list: document.getElementById('scr-list').classList.contains('active'),
  look: document.getElementById('scr-look').classList.contains('active'),
  h: (document.getElementById('lv-h') || {}).textContent,
  tab: [...document.querySelectorAll('.bn.on')].map((x) => x.getAttribute('data-scr')),
}));
await toru('確認を押した後（別の画面）', 'ichiran-4-kakunin.png');
await b.close(); srv.close();

console.log('画面に 積んだ … ' + tsunda.tsu + '通（取引先 ' + tsunda.sha + '社）');
console.log('確認を 押した後 … 一覧 ' + (ima.list ? '出たまま' : '★消えた★')
  + ' ／ 紙の画面 ' + (ima.look ? '★出た★' : '出ない')
  + ' ／ 光っているタブ ' + JSON.stringify(ima.tab));
console.log('   ' + ima.h);
shots.forEach((x) => {
  console.log('  ' + x.na + ' … ' + x.byte + 'バイト sha ' + x.sha);
  console.log('      ' + x.p);
});
