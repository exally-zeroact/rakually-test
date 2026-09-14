/* kaisha-jusho-todoku.mjs — ★会社の 住所が ログインの 後に 画面まで 届くか★（実ブラウザ）
 * =============================================================================
 * ★なぜ（2026-09-14）★
 *   給与の 会社情報の 住所は ★入口の「会社の設定」が 持ち主／給与に 在るのは 写し★。
 *   写しは window.PayslipSyncOrg() が ログインの 後に 取りに行く（auth.js）。
 *   ★その 呼び方が「倉庫の 読み直し」と 同時だった★＝
 *     ★後から 着いた 読み直しが、同期の 入れた 住所を 消していた★。
 *
 * ★実測で 見つけた 害（2026-09-14）★
 *   ・生きた画面で 16秒 見張って 1/3/6/10/16秒 とも ★「（入っていません・任意）」★
 *   ・手で PayslipSyncOrg() を 呼ぶと {ok:true,found:true,changed:true} で ★住所が 出た★
 *     ＝★仕掛けは 動く／自動が 効いていない★
 *   ・倉庫（読んだだけ）… ★本番 5口とも 写しが 空★・うち ★4口は 会社の設定に 住所が 在る★
 *   ・★電子申請の 届出は 事業所所在地が 必須★＝写しが 空だと ★1枚も 出せない★
 *
 * ★この 見張りが 測る事★
 *   ①ログインしてから ★何も 押さずに★ 会社情報を 開く
 *   ②★住所が 画面に 出るか★（出るまで 待つ・何秒で 出たかも 出す）
 *   ③★倉庫の 持ち主（会社の設定）に 住所が 在るか★も 読む
 *     ＝持ち主が 空なら ★測れない（未測定）★＝★赤に しない★（材料が 無いだけ）
 *   ★「手で 呼べば 出る」は 緑に しない★＝★客は 手で 呼べない★。
 *
 * 使い方: node kyuyo/tests/kaisha-jusho-todoku.mjs
 *   ★終わり値★ 0＝出た ／ 1＝出ない（赤） ／ 2＝測れない（未測定）
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/* ★本番の repo には 試験の 鍵が 無い★＝字を 言ってから 抜ける（黙って 緑に しない）。 */
{
  const { kagiAru } = await import('../../tests/_hairu.mjs');
  if (!(await kagiAru(ROOT))) {
    console.log('  — ★この repo（本番）には 試験の 鍵が 無いので ここでは 測れません★'
      + '（★テスト線で 測っています★／戻す条件＝本番CIに 鍵を 置いた日）');
    process.exit(0);
  }
}

let borrow, pwLaunch, hairu, osu;
try {
  ({ borrow, launch: pwLaunch } = await import('../../scripts/_borrow-playwright.mjs'));
  ({ hairu, osu } = await import('../../tests/_hairu.mjs'));
} catch (e) { console.log('🟡 ★未測定★ 道具が 読めない … ' + (e && e.message)); process.exit(2); }
const wk = await borrow('kaisha-jusho', 'webkit');
if (!wk) { console.log('🟡 ★未測定★ playwright を 借りられない（0件＝合格 とは 書かない）'); process.exit(2); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const srv = http.createServer((rq, rs) => {
  const url = decodeURIComponent(rq.url.split('?')[0]);
  let p = path.join(ROOT, url);
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { rs.writeHead(404); rs.end('x'); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  rs.end(fs.readFileSync(p));
});
await new Promise((r) => srv.listen(0, r));
const PORT = srv.address().port;
const b = await pwLaunch('kaisha-jusho', wk);
const machi = (ms) => new Promise((r) => setTimeout(r, ms));
process.on('exit', () => { try { srv.close(); } catch (e) { /* もう 閉じている */ } });
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => { try { srv.close(); } catch (e) { /* 同上 */ } process.exit(130); });

console.log('\n[kaisha-jusho-todoku] 会社の 住所が ★ログインの 後に 画面まで 届くか★');

let owari = 0;
const ctx = await b.newContext({ viewport: { width: 1100, height: 1200 } });
const pg = await ctx.newPage();
try {
  const h = await hairu(pg, 'http://localhost:' + PORT + '/kyuyo/index.html', '.bn[data-scr="scr-settings"]');
  if (!h.haitta) { console.log('  🟡 ★未測定★ ' + h.kai + '回 試して 入れなかった'); owari = 2; throw new Error('skip'); }

  /* ★何も 押さずに★ 会社情報を 開く（お客さんは ここを 開くだけ） */
  await osu(pg, '.bn[data-scr="scr-settings"]'); await machi(400);
  await osu(pg, '#set-seg .seg-b[data-set="company"]'); await machi(400);

  /* ★持ち主（会社の設定）に 住所が 在るか★＝無ければ 測れない */
  const mochinushi = await pg.evaluate(() => {
    const SD = window.SuiteData, cl = window.Store && window.Store._client;
    if (!SD || !cl) return { ok: false, naze: '共有データ層が 無い' };
    let sd; try { sd = SD.create({ client: cl }); } catch (e) { return { ok: false, naze: String(e && e.message || e) }; }
    return Promise.resolve(sd.org.get()).then((o) => ({ ok: true, addr: (o && o.addr) || '' }))
      .catch((e) => ({ ok: false, naze: String(e && e.message || e) }));
  }).catch((e) => ({ ok: false, naze: String(e).slice(0, 80) }));

  if (!mochinushi.ok) { console.log('  🟡 ★未測定★ 持ち主（会社の設定）を 読めない … ' + mochinushi.naze); owari = 2; throw new Error('skip'); }
  if (!String(mochinushi.addr).trim()) {
    console.log('  🟡 ★未測定★ ★会社の設定に 住所が 入っていない★＝この口では 測れません'
      + '（★アプリの 穴では ない★＝材料が 無い）');
    owari = 2; throw new Error('skip');
  }
  console.log('  持ち主（会社の設定）の 住所 … ' + mochinushi.addr);

  /* ★画面に 出るまで 待つ★（何秒で 出たかも 出す） */
  const YOMU = () => pg.evaluate(() => {
    const e = document.querySelector('#c-addr-ro');
    return e ? e.textContent.trim() : null;
  }).catch(() => null);
  let deta = null, byo = 0;
  for (let i = 0; i < 40; i++) {          /* 20秒 */
    const t = await YOMU();
    if (t && t !== '—' && t.indexOf('入っていません') < 0) { deta = t; byo = i * 0.5; break; }
    await machi(500);
  }

  if (deta) {
    console.log('  ✓ ★住所が 画面に 出た（' + byo + '秒）★ … ' + deta);
    /* ★出た 字が 持ち主と 同じか★＝「何か 出た」で 緑に しない */
    if (deta === String(mochinushi.addr).trim()) console.log('  ✓ ★持ち主と 1文字ずつ 同じ★');
    else { console.log('  ✗ ★出た 字が 持ち主と 違う★ … 画面「' + deta + '」／持ち主「' + mochinushi.addr + '」'); owari = 1; }
  } else {
    console.log('  ✗ ★20秒 待っても 住所が 画面に 出ない★');
    /* ★手で 呼べば 出るか★＝出るなら「仕掛けは 生きているが 自動が 効いていない」 */
    const te = await pg.evaluate(() => (window.PayslipSyncOrg ? window.PayslipSyncOrg() : { ok: false, reason: '無い' })).catch((e) => ({ ok: false, reason: String(e).slice(0, 60) }));
    await machi(1200);
    const ato = await YOMU();
    console.log('       手で 呼んだら … ' + JSON.stringify(te) + ' ／ 画面「' + ato + '」');
    console.log('       ★手で 呼べば 出る＝仕掛けは 生きている／自動が 効いていない★'
      + '（★客は 手で 呼べません★＝これは 緑に しない）');
    owari = 1;
  }
} catch (e) {
  if (e && e.message !== 'skip') { console.log('  ✗ 途中で 止まった … ' + (e && e.message)); owari = 1; }
} finally {
  await b.close().catch(() => null);
  srv.close();
}
/* ★★毎回 出る この 1行に「未」の 付く 言葉を 書かない（2026-09-14 その日のうちに 直した）★★
   ★凡例★に その 言葉が 在ったので 総なめの 道具が 拾い、
   ★緑の 回でも 偽の 🟡 が 1本 鳴り続けて いた★。
   ★毎回 鳴る 知らせは そのうち 誰も 読まなくなる★＝本物を 隠す。
   ＝今日 何度も 踏んだ ★探す字を 自分の 出力に 書く★ 型。
   ⇒ 凡例は 言い換える。★本当に 測れなかった 回は 上の 行が その言葉で 鳴る★ので 見落とさない。 */
console.log('\n終わり値 ' + owari + '（0＝出た／1＝出ない＝赤／2＝材料が 無くて はかれない）');
process.exit(owari);
