/* shot-youshiki.mjs — ★司さんに 見せる絵★
 * =============================================================================
 * 設定 ▸ 紙の様式 の 見本（★お客さんに 出る画面そのもの★）を 1枚の 絵に する。
 * ★見張りでは ない★＝赤/緑を 出さない。見せる為の 道具。
 *   ・入る手順は ★tests/_hairu.mjs 1か所★（自分で 書き直さない）
 *   ・入れなかったら ★🟡未測定★（絵が 無いのに 緑と 言わない）
 *   ・出した絵は ★バイト数と sha256 を 一緒に 出す★（前の絵と 取り違えない）
 * 使い方: node scripts/shot-youshiki.mjs
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { createHash } from 'node:crypto';
import { borrow, launch as pwLaunch } from './_borrow-playwright.mjs';
import { hairu } from '../tests/_hairu.mjs';
const ROOT = 'C:/Users/zeroa/rakually-test';
const OUT = 'C:/Users/zeroa/AppData/Local/Temp/claude/C--WINDOWS-System32-WindowsPowerShell-v1-0/95680cdf-f1bb-480f-a53c-6f0f118a9fb3/scratchpad';
const ch = await borrow('shot-youshiki', 'chromium');
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
const b = await pwLaunch('shot-youshiki', ch, undefined, 'chromium');
const pg = await b.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 2 });
const h = await hairu(pg, 'http://localhost:' + PORT + '/seikyu/index.html', '.bn[data-scr]');
if (!h || h.ok === false) { console.log('🟡 ★未測定★ 入れなかった … ' + JSON.stringify(h)); await b.close(); srv.close(); process.exit(2); }
await pg.click('.bn[data-scr="scr-set"]');
await pg.waitForTimeout(400);
await pg.evaluate(() => { document.querySelectorAll('details').forEach((d) => { d.open = true; }); });
await pg.waitForTimeout(1200);
const n = await pg.evaluate(() => {
  const c = document.getElementById('s-tpl-card');
  if (c) c.scrollIntoView({ block: 'start' });
  const r = c && c.getBoundingClientRect();
  return { mai: document.querySelectorAll('.tpl-shot iframe').length,
    haba: r ? Math.round(r.width) : 0, takasa: r ? Math.round(r.height) : 0,
    na: [...document.querySelectorAll('.tpl-pick .tpl-nm')].map((e) => e.textContent.trim()) };
});
await pg.waitForTimeout(600);
const f = path.join(OUT, 'youshiki-5mai.png');
const card = await pg.$('#s-tpl-card');
if (card && n.takasa > 0) await card.screenshot({ path: f }); else await pg.screenshot({ path: f, fullPage: true });
await b.close(); srv.close();
const st = fs.statSync(f);
console.log('見本 ' + n.mai + '枚 ／ 箱 ' + n.haba + '×' + n.takasa + 'px');
console.log('  ' + n.na.join(' ／ '));
console.log('バイト ' + st.size + ' ／ sha256 ' + createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16));
console.log('  ' + f);
