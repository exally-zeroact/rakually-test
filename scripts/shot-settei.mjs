/* shot-settei.mjs — ★設定の「請求書の決まり」を 実ブラウザで 撮る★
 * 司さん 2026-09-10「請求書番号のオンオフ」
 *   ＝欄は 前から 在ったが ★畳んだ 引き出しの 中★で 見つからなかった。
 *     ⇒ 上へ 出した。★開かずに 見えるか★を 絵で 確かめる。
 * ★見張りでは ない★＝見せる為の 道具。入れなかったら 🟡未測定。
 * 使い方: node scripts/shot-settei.mjs
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { createHash } from 'node:crypto';
import { borrow, launch as pwLaunch } from './_borrow-playwright.mjs';
import { hairu } from '../tests/_hairu.mjs';
const ROOT = 'C:/Users/zeroa/rakually-test';
const OUT = 'C:/Users/zeroa/AppData/Local/Temp/claude/C--WINDOWS-System32-WindowsPowerShell-v1-0/95680cdf-f1bb-480f-a53c-6f0f118a9fb3/scratchpad';
const ch = await borrow('shot-settei', 'chromium');
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
const b = await pwLaunch('shot-settei', ch, undefined, 'chromium');
const pg = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const h = await hairu(pg, 'http://localhost:' + PORT + '/seikyu/index.html', '.bn[data-scr]');
if (!h || h.ok === false) { console.log('🟡 ★未測定★ 入れなかった … ' + JSON.stringify(h)); await b.close(); srv.close(); process.exit(2); }

await pg.click('.bn[data-scr="scr-set"]');
await pg.waitForTimeout(700);

/* ★開かずに 見えるか★＝畳んだ 引き出しを 1つも 開けずに 測る */
const m = await pg.evaluate(() => {
  const el = document.getElementById('s-no');
  if (!el) return { nai: true };
  const r = el.getBoundingClientRect();
  let oya = el.parentElement, tatami = 0;
  while (oya) { if (oya.tagName === 'DETAILS' && !oya.open) tatami++; oya = oya.parentElement; }
  const card = el.closest('.card');
  const midashi = card ? (card.querySelector('.card-h') || {}).textContent : '';
  return { tatami: tatami, mieru: r.width > 0 && r.height > 0,
    midashi: (midashi || '').trim(),
    hiraita: [...document.querySelectorAll('#scr-set details')].filter((d) => d.open).length };
});
console.log('★請求番号を紙に出す★');
console.log('  畳んだ 引き出しの 中 … ' + m.tatami + '個'
  + (m.tatami === 0 ? '（★開かずに 見える★）' : '（★隠れている★）'));
console.log('  居る カード … 「' + m.midashi + '」 ／ 大きさ ' + (m.mieru ? '出ている' : '★0★')
  + ' ／ 開いている 引き出し ' + m.hiraita + '個');

const el = await pg.$('#s-no');
await el.scrollIntoViewIfNeeded();
await pg.waitForTimeout(300);
const f1 = path.join(OUT, 'settei-no-1.png');
await pg.screenshot({ path: f1 });
const card = await pg.evaluateHandle(() => document.getElementById('s-no').closest('.card'));
const f2 = path.join(OUT, 'settei-no-2-card.png');
await card.asElement().screenshot({ path: f2 });
/* ★お振込先＝1口座ずつ 分けて 打つ★（司さん 2026-09-10「分けて いれさせろ」）
   ★2口座 目も 出した 絵★＝＋を 押した 形も 見せる */
await pg.evaluate(() => { document.getElementById('b-bank-add').click(); });
await pg.waitForTimeout(400);
const bank = await pg.evaluateHandle(() => document.getElementById('s-bank-list').parentElement);
const f3 = path.join(OUT, 'settei-bank.png');
await bank.asElement().screenshot({ path: f3 });
console.log('★お振込先★ 口座の 数 … ' + await pg.evaluate(() =>
  document.querySelectorAll('#s-bank-list [data-bank-row]').length)
  + ' ／ 1口座の 欄 … ' + await pg.evaluate(() =>
  document.querySelectorAll('#s-bank-list [data-bank-row]')[0].querySelectorAll('[data-bank-p]').length) + '個');
/* ★判子の 所★（司さん 2026-09-10「なら 説明書きしとけ」） */
const hanko = await pg.evaluateHandle(() => {
  const el = [...document.querySelectorAll('#scr-set .card')]
    .filter((c) => (c.querySelector('.card-h') || {}).textContent === '角印（会社の印）')[0];
  return el;
});
const f4 = path.join(OUT, 'settei-hanko.png');
await hanko.asElement().scrollIntoViewIfNeeded();
await pg.waitForTimeout(300);
await hanko.asElement().screenshot({ path: f4 });
for (const f of [f1, f2, f3, f4]) {
  console.log('  ' + fs.statSync(f).size + 'バイト sha '
    + createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 12) + '  ' + f);
}
await b.close(); srv.close();
