/* hanko-touka.mjs — ★倉庫に 残った 白い地の 判子を 自動で 透かす★
 * =============================================================================
 * 司さん 2026-09-09「判子が ★自動で 透過されない★から 背景が 邪魔になる」
 *
 * ★実測して 分かった事（scripts/_hakaru-hanko.mjs）★
 *   白い地の 判子を ★今 入れれば 透ける★（白 83%→0%／透け 0%→74%）。
 *   ＝白抜きの 道具（hanko.js）は 効いている。効いていなかったのは
 *   ★道具を 入れた 2026-08-30 より 前に 保存した 判子★＝倉庫に 白い四角のまま 残っていた。
 *   今までは ★入れ直さないと 直らなかった★＝司さんが 見ていたのは これ。
 *
 * 見る物:
 *   ① ★白い地かを 数える 物差し★が 効く（白い判子＝はい／透けた判子＝いいえ）
 *   ② 白い地の 判子を 通すと ★本当に 透ける★（白が 減り 透けが 増える）
 *   ③ ★透けている 判子は 触らない★（余計な いじりを しない）
 *   ④ 空振りしない（作り物が 本当に 白い地／道具が 本当に 在る）
 *
 * ★実ブラウザで 測る★＝canvas の 画素を 数えるので jsdom では 測れない。
 * 使い方: node seikyu/tests/hanko-touka.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { borrow, launch as pwLaunch } from '../../scripts/_borrow-playwright.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = process.argv.includes('--self-test');
let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };

const ch = await borrow('hanko-touka', 'chromium');
if (!ch) { console.log('🟡 ★未測定★ playwright を 借りられない（0件＝合格 とは 書かない）'); process.exit(2); }

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
const b = await pwLaunch('hanko-touka', ch, undefined, 'chromium');
const pg = await b.newPage({ viewport: { width: 500, height: 500 } });
await pg.goto('http://localhost:' + PORT + '/seikyu/index.html', { waitUntil: 'domcontentloaded' });
await pg.waitForTimeout(1200);

const r = await pg.evaluate(async () => {
  /* ★白い地に 赤い角印★＝写真で 撮った判子と 同じ形（地が 白い） */
  const kaku = (shiroiJi) => {
    const N = 200;
    const c = document.createElement('canvas'); c.width = N; c.height = N;
    const x = c.getContext('2d');
    if (shiroiJi) { x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, N, N); }
    x.strokeStyle = '#C8102E'; x.lineWidth = 10;
    x.strokeRect(25, 25, N - 50, N - 50);
    x.fillStyle = '#C8102E';
    x.font = 'bold 46px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('印', N / 2, N / 2);
    return c.toDataURL('image/png');
  };
  const kazoeru = (url) => new Promise((res) => {
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
      res({ suke: Math.round(suke / zen * 100), shiro: Math.round(shiro / zen * 100) });
    };
    im.onerror = () => res(null);
    im.src = url;
  });
  const SEAL = window.SeikyuSeal;
  const out = { dougu: !!window.HankoTool, lib: !!SEAL, monosashi: !!(SEAL && SEAL.shiroiKa) };
  if (!out.monosashi) return out;
  const shiroi = kaku(true);
  out.shiroi_mae = await kazoeru(shiroi);
  out.mite_shiroi = await SEAL.shiroiKa(shiroi);
  const p = await SEAL.prepare(shiroi);
  out.kawatta = !!(p && p.dataUrl && p.dataUrl !== shiroi);
  out.shiroi_ato = p && p.dataUrl ? await kazoeru(p.dataUrl) : null;
  out.did = (p && p.did) || [];
  /* ★もう 透けている 判子★＝触らないで ほしい物 */
  const suketa = p && p.dataUrl ? p.dataUrl : shiroi;
  out.mite_suketa = await SEAL.shiroiKa(suketa);
  return out;
});
await b.close(); srv.close();

console.log('\n[hanko-touka] 倉庫に 残った 白い地の 判子を 自動で 透かす' + (SELF ? '（自分ためし）' : ''));

T('★④ 空振りしていない（道具も 物差しも 本当に 在る）', () => {
  ok(r.dougu, '★白抜きの 道具（HankoTool）が 読み込まれていない★');
  ok(r.lib, '★うちの lib（SeikyuSeal）が 無い★');
  ok(r.monosashi, '★白い地かを 数える 物差し（shiroiKa）が 無い★');
  ok(r.shiroi_mae && r.shiroi_mae.shiro >= 50,
    '★作り物が 白い地に なっていない＝この検査は 何も 見ていない★ ' + JSON.stringify(r.shiroi_mae));
  console.log('     作った 判子 … 白 ' + r.shiroi_mae.shiro + '% ／ 透け ' + r.shiroi_mae.suke + '%');
});

T('★① 白い地かを 数える 物差しが 効く（白い判子＝はい）', () => {
  ok(r.mite_shiroi && r.mite_shiroi.shiroi === true,
    '★白い地なのに「白くない」と 言っている★ ' + JSON.stringify(r.mite_shiroi));
  console.log('     見た … 白 ' + r.mite_shiroi.shiro + '% ／ 透け ' + r.mite_shiroi.suke + '% → 白い地');
});

T('★② 白い地の 判子を 通すと 本当に 透ける', () => {
  ok(r.kawatta, '★通したのに 1バイトも 変わっていない★');
  ok(r.shiroi_ato, '通した後が 読めない');
  ok(r.shiroi_ato.suke > 30, '★透けていない★ 透け ' + r.shiroi_ato.suke + '%');
  ok(r.shiroi_ato.shiro < 10, '★白い所が 残っている★ 白 ' + r.shiroi_ato.shiro + '%');
  ok(r.did.length > 0, '★やった事を 言っていない（黙って いじっている）★');
  console.log('     ' + r.shiroi_mae.shiro + '% → ' + r.shiroi_ato.shiro + '%（白）／ '
    + r.shiroi_mae.suke + '% → ' + r.shiroi_ato.suke + '%（透け）');
  console.log('     言った事 … ' + r.did.join('／'));
});

T('★③ もう 透けている 判子は「白い地」と 言わない（余計に いじらない）', () => {
  ok(r.mite_suketa && r.mite_suketa.shiroi === false,
    '★透けているのに「白い地」と 言っている★＝開くたびに いじり続ける '
    + JSON.stringify(r.mite_suketa));
  console.log('     透けた判子 … 白 ' + r.mite_suketa.shiro + '% ／ 透け ' + r.mite_suketa.suke + '% → 触らない');
});

T('★⑤ 設定を 開いた時に 呼んでいる（作っただけで 使っていない を 止める）', () => {
  const app = fs.readFileSync(path.join(ROOT, 'seikyu', 'js', 'seikyu-app.js'), 'utf8');
  ok(app.indexOf('function sealAutoTouka()') > 0, '★自動で 透かす 所が 無い★');
  const yobu = app.split('sealAutoTouka();').length - 1;
  ok(yobu >= 1, '★作っただけで どこからも 呼んでいない★');
  ok(app.indexOf('sealAutoDone') > 0, '★1度だけの 印が 無い＝開くたびに 何度も 言う★');
  /* ★倉庫を 勝手に 書き換えない★＝保存は 司さんが 押す */
  const i = app.indexOf('function sealAutoTouka()');
  const naka = app.slice(i, app.indexOf('\n  function fillSeal()', i));
  ok(naka.indexOf('store.org.save') < 0, '★倉庫を 勝手に 書き換えている★（決めるのは 司さん）');
  console.log('     呼んでいる所 ' + yobu + 'か所 ／ 倉庫は 触っていない');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
