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

/* ★1枚ずつ 原寸で★（司さん 2026-09-09「1個ずつちゃんと見せて」）
   ★見本の 中身そのもの★を 取り出して A4の 大きさで 撮る。
   iframe を そのまま 撮ると ★後ろの ページごと 写る★（1回 やらかした）。
   srcdoc は 見本が 実際に 表示している HTML そのもの＝作り直していない。
   中の 縮尺の script は 窓の 大きさで 決まるので、窓を A4に すると 1倍に なる。 */
const shots = await pg.evaluate(() =>
  [...document.querySelectorAll('.tpl-shot iframe')].map((f) => f.getAttribute('srcdoc')));
const pg2 = await b.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
const fs2 = [];
for (let i = 0; i < shots.length; i++) {
  const na = (n.na[i] || ('youshiki' + i));
  await pg2.setContent(shots[i], { waitUntil: 'load' });
  await pg2.waitForTimeout(500);
  const sh = await pg2.$('.sheet');
  const f2 = path.join(OUT, 'youshiki-' + (i + 1) + '.png');
  if (sh) await sh.screenshot({ path: f2 }); else await pg2.screenshot({ path: f2 });
  const ha = await pg2.evaluate(() => {
    const s = document.querySelector('.sheet'); if (!s) return null;
    const r = s.getBoundingClientRect();
    const hd = [...s.querySelectorAll('thead th, .items th')].map((e) => e.textContent.trim()).filter(Boolean);
    return { w: Math.round(r.width), h: Math.round(r.height), naka: Math.round(s.scrollHeight), hd: hd };
  });
  const st2 = fs.statSync(f2);
  fs2.push({ na: na, f: f2, byte: st2.size, ha: ha,
    sha: createHash('sha256').update(fs.readFileSync(f2)).digest('hex').slice(0, 12) });
}
await b.close(); srv.close();
console.log('見本 ' + n.mai + '枚 ／ 箱 ' + n.haba + '×' + n.takasa + 'px');
for (const x of fs2) {
  console.log('  ' + x.na);
  console.log('      紙 ' + (x.ha ? x.ha.w + '×' + x.ha.h + 'px（中身 ' + x.ha.naka + 'px）' : '?')
    + ' ／ ' + x.byte + 'バイト sha ' + x.sha);
  console.log('      列 … ' + (x.ha && x.ha.hd.length ? x.ha.hd.join(' / ') : '（読めない）'));
  console.log('      ' + x.f);
}
const shas = fs2.map((x) => x.sha);
console.log(new Set(shas).size === shas.length ? ('★' + shas.length + '枚とも 別の絵★') : '★同じ絵が 混ざっている★');
