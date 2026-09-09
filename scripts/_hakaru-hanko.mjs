/* _hakaru-hanko.mjs — ★白い地の 判子を 入れたら 本当に 透けるか★を 実ブラウザで 測る
 * ★見張りでは ない★＝手で 測る 道具（2026-09-09 司さん
 *   「判子が 自動で 透過されないから 背景が 邪魔になる」）。
 * 使い方: node scripts/_hakaru-hanko.mjs
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { borrow, launch as pwLaunch } from './_borrow-playwright.mjs';
const ROOT = 'C:/Users/zeroa/rakually-test';
const ch = await borrow('hakaru-hanko', 'chromium');
if (!ch) { console.log('🟡 ★未測定★ playwright を 借りられない'); process.exit(2); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((rq, rs) => {
  let p = path.join(ROOT, decodeURIComponent(rq.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { rs.writeHead(404); rs.end('x'); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  rs.end(fs.readFileSync(p));
});
await new Promise((r) => srv.listen(0, r));
const PORT = srv.address().port;
const b = await pwLaunch('hakaru-hanko', ch, undefined, 'chromium');
const pg = await b.newPage({ viewport: { width: 500, height: 500 } });
await pg.goto('http://localhost:' + PORT + '/seikyu/index.html', { waitUntil: 'domcontentloaded' });
await pg.waitForTimeout(1200);

const r = await pg.evaluate(async () => {
  /* ★白い地に 赤い角印★を その場で 描く（写真で 撮った判子と 同じ形＝地が 白い） */
  const N = 200;
  const c = document.createElement('canvas'); c.width = N; c.height = N;
  const x = c.getContext('2d');
  x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, N, N);
  x.strokeStyle = '#C8102E'; x.lineWidth = 10;
  x.strokeRect(25, 25, N - 50, N - 50);
  x.fillStyle = '#C8102E';
  x.font = 'bold 46px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('印', N / 2, N / 2);
  const moto = c.toDataURL('image/png');

  const sukeru = (url) => new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      const cc = document.createElement('canvas');
      cc.width = im.naturalWidth; cc.height = im.naturalHeight;
      const xx = cc.getContext('2d'); xx.drawImage(im, 0, 0);
      const d = xx.getImageData(0, 0, cc.width, cc.height).data;
      let suke = 0, shiro = 0, zen = 0;
      for (let i = 0; i < d.length; i += 4) {
        zen++;
        if (d[i + 3] < 32) suke++;
        else if (Math.min(d[i], d[i + 1], d[i + 2]) >= 235) shiro++;
      }
      res({ haba: cc.width, takasa: cc.height, zen,
        sukeru: Math.round(suke / zen * 100), shiroi: Math.round(shiro / zen * 100) });
    };
    im.onerror = () => res(null);
    im.src = url;
  });

  const out = { dougu: !!window.HankoTool, lib: !!window.SeikyuSeal };
  out.mae = await sukeru(moto);
  if (window.SeikyuSeal) {
    const p = await window.SeikyuSeal.prepare(moto);
    out.did = (p && p.did) || [];
    out.kawatta = !!(p && p.dataUrl && p.dataUrl !== moto);
    out.ato = p && p.dataUrl ? await sukeru(p.dataUrl) : null;
  }
  return out;
});
await b.close(); srv.close();
console.log('道具(HankoTool) … ' + (r.dougu ? '★在る★' : '無い'));
console.log('うちの lib(SeikyuSeal) … ' + (r.lib ? '★在る★' : '無い'));
console.log('入れる前 … ' + JSON.stringify(r.mae));
console.log('通した後 … 変わった ' + (r.kawatta ? '★はい★' : 'いいえ') + ' ／ ' + JSON.stringify(r.ato));
console.log('言った事 … ' + JSON.stringify(r.did));
