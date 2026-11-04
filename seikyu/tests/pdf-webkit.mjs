/* pdf-webkit.mjs — ★自作PDFが iPhoneの中身（WebKit）でも 本当に出るか★
 * =============================================================================
 * ★なぜ 別に要るのか★
 *   pdf-align.mjs は chromium で 中の字まで 測っている。だが ★お客はiPhone★で、
 *   iPhoneの中身は ★WebKit★。★測っていない engine で「出る」と言わない★
 *   （うちの決まり：見た目/PDFは iOSの実挙動で 見る）。
 *   ここで見るのは ①落ちずに出る ②本当にPDF（先頭 %PDF-） ③字が入っている
 *   ④化けが0 ⑤待たされ過ぎない（電話の上で 何十秒も 固まらない）だけ。
 *   ★紙の中の位置★は chromium 側（pdf-align.mjs）が 測っている。
 *
 * 使い方: node seikyu/tests/pdf-webkit.mjs
 */

import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_=createRequire(import.meta.url);
/* ★playwright が 借りられない機械では「未測定」で 終わる★（0件＝合格 とは 書かない）
   ＝運ぶ道具は「運び先で 走るか」を 実際に走らせて 見る。ここで 落ちると
     ★この見張りごと 本番に 運ばれない★（2026-08-31 実測：3本 落ちていた）。 */
import { borrow, launch as pwLaunch } from '../../scripts/_borrow-playwright.mjs';
/* ★借り先と 未測定の言い方は 1か所に★ … scripts/_borrow-playwright.mjs */
const webkit = await borrow('pdf-webkit', 'webkit');
const PAPER=require_(path.join(ROOT,'seikyu/lib/seikyu-paper.js'));
const TPL=require_(path.join(ROOT,'seikyu/lib/seikyu-templates.js'));
const X=require_(path.join(ROOT,'seikyu/lib/seikyu-tax.js'));
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.ttf':'font/ttf','.png':'image/png'};
const srv=http.createServer((rq,rs)=>{const u=decodeURIComponent(rq.url.split('?')[0]);const p=path.join(ROOT,u);
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){rs.writeHead(404);rs.end();return;}
 rs.writeHead(200,{'content-type':MIME[path.extname(p)]||'application/octet-stream'});rs.end(fs.readFileSync(p));});
await new Promise(r=>srv.listen(0,r)); const port=srv.address().port;
const ls=[{name:'運転代行 10月分',qty:'1',unit:'式',price:'30000',rate:10}];
const tx=X.compute({lines:ls,taxMode:'exclusive',rounding:'floor'});
const mk=(extra)=>{const bt=PAPER.build(Object.assign({
  inv:{no:'202608-001',issue_ymd:'2026-10-05',due_ymd:'2026-11-30',kind:'invoice',lines:ls,totals:{grandTotal:tx.grandTotal},data:{}},
  tax:tx,partner:{name:'例野工業株式会社',honor:'御中'},
  org:{yago:'合同会社Rakunally',addr:'東京都架空区見本台',invoiceNo:'T9000000000009',bank:'伊予銀行 見本支店 普通 1234567'},
  template:TPL.getOrDefault('std1')},extra||{}));
  return (typeof bt==='string')?bt:(bt.html||'');};
const cases=[['請求書',mk()],['領収書',mk({docKind:'receipt',receipt:{no:'202608-001-1',ymd:'2026-11-20',amount:33000,method:'振込',note:'運転代行 10月分',taxTotal:3000,taxSeparate:true}})]];
const b=await pwLaunch('pdf-webkit', webkit);
const pg=await (await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:3})).newPage();
const bad=[]; pg.on('pageerror',e=>bad.push(String(e&&e.message)));
await pg.goto('http://localhost:'+port+'/seikyu/index.html',{waitUntil:'domcontentloaded'});
await pg.waitForTimeout(600);
let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + ' — ' + m); } };
console.log('\n[pdf-webkit] 自作PDFが iPhoneの中身（WebKit 390px）でも 出るか');
for(const [name,h] of cases){
  const t0=Date.now();
  const r=await pg.evaluate(async(hh)=>{ try{
    const by=await window.SeikyuPdf.build(hh,{base:'../'});
    const head=Array.from(by.slice(0,5)).map(c=>String.fromCharCode(c)).join('');
    return {ok:true,size:by.length,head,placed:window.SeikyuPdf.lastPlaced().length,missing:window.SeikyuPdf.lastMissing()};
  }catch(e){return {ok:false,msg:String(e&&e.message)};}},h);
  const sec = (Date.now() - t0) / 1000;
  if (r.ok) console.log('     ' + name + ' … ' + (r.size / 1048576).toFixed(2) + 'MB ／ 先頭「' + r.head
    + '」／ 字' + r.placed + '個 ／ 化け' + r.missing.length + '（' + sec.toFixed(1) + '秒）');
  T('★' + name + ' が WebKitで 出る', r.ok, r.msg);
  if (!r.ok) continue;
  T('★' + name + ' が 本当にPDF（先頭 %PDF-）', r.head === '%PDF-', '先頭が「' + r.head + '」');
  T('★' + name + ' に 字が 入っている', r.placed > 10, '字が ' + r.placed + '個');
  T('★' + name + ' の字が 化けていない', !r.missing.length, '化けた字 ' + r.missing.join(''));
  T('★' + name + ' が 20秒以内に 出る（電話の上で 固まらない）', sec < 20, sec.toFixed(1) + '秒');
}
/* ★字が 被らない★（司さん 2026-11-04「印刷したら 自社の 住所が 被ってる」「振込先の 数字と 名前も 被っとる」）
   ①振込先＝口座番号（DM Mono・大きい字）と 名義が 同じ行で 重ならない（PDF の 字体の 方が 幅が 広い）
   ②iPhone は 1行を ★いくつかの 塊★で 返す事が ある＝その時も 住所は ★1回だけ★ 置かれる
     （手元の WebKit は 塊に 分けないので、getClientRects を 2つに 割って iPhone の 返し方を 作る） */
{
  const ADDR = '東京都架空区見本台1-2-3 見本ビル303号';
  const hk = mk({ org: { yago: '合同会社Rakunally', addr: ADDR, tel: '090-0000-0000', invoiceNo: 'T9000000000009',
    bank: '伊予銀行 見本支店 普通 1234567 ド)ゴウドウガイシャ ミホン' } });
  const r = await pg.evaluate(async (hh) => {
    const P = window.SeikyuPdf;
    await P.build(hh, { base: '../' });
    const plain = P.lastPlaced();
    const plainMis = P.lastMismatch ? P.lastMismatch() : -1;
    const runSplit = async (far) => {
    /* ★紙は iframe の中で 測る★＝差し替えは その窓の Range に 入れる（外の窓に 入れても 効かない） */
    const ce = document.createElement;
    let hit = 0;
    document.createElement = function (tag) {
      const el = ce.apply(document, arguments);
      if (String(tag).toLowerCase() === 'iframe') {
        el.addEventListener('load', () => {
          const W = el.contentWindow, orig = W.Range.prototype.getClientRects;
          W.Range.prototype.getClientRects = function () {
            const rs = Array.from(orig.call(this)); const out = [];
            rs.forEach((q) => {
              if (q.width < 20) { out.push(q); return; }
              hit++;
              const h = q.width / 2;
              out.push(new W.DOMRect(q.left, q.top, h, q.height));
              /* near＝字体違いで 上端が 1px ずれる 形／far＝2つ目の 塊が 下へ ずれて 返る 形（行と 字の 数が 合わない） */
              if (far) out.push(new W.DOMRect(q.left + h, q.top + q.height * 0.6, q.width - h, q.height));
              else out.push(new W.DOMRect(q.left + h, q.top + 1, q.width - h, q.height - 1));
            });
            return out;
          };
        });
      }
      return el;
    };
    try { await P.build(hh, { base: '../' }); } finally { document.createElement = ce; }
    if (!hit) throw new Error('塊に 割る 差し替えが 1回も 効いていない（試験が 測れていない）');
    return { placed: P.lastPlaced(), mis: P.lastMismatch ? P.lastMismatch() : -1 };
    };
    const near = await runSplit(false), farR = await runSplit(true);
    return { plain, plainMis, split: near.placed, far: farR.placed, farMis: farR.mis };
  }, hk);
  const num = r.plain.find((t) => t.s === '1234567');
  const nm = r.plain.find((t) => /^ド\)/.test(t.s));
  T('★振込先の 口座番号と 名義が 被らない', num && nm && num.right <= nm.x + 0.5,
    num && nm ? ('番号の 右端 ' + num.right.toFixed(1) + ' ＞ 名義の 左端 ' + nm.x.toFixed(1)) : '番号か 名義が 見つからない');
  const cnt = (list) => list.filter((t) => t.s.indexOf('見本台') >= 0).length;
  T('★住所が 1回だけ 置かれる（塊が 1つの 時）', cnt(r.plain) === 1, cnt(r.plain) + '回');
  T('★住所が 1回だけ 置かれる（iPhone の様に 1行が 2つの 塊で 返る時）', cnt(r.split) === 1,
    cnt(r.split) + '回＝' + r.split.filter((t) => t.s.indexOf('見本台') >= 0).map((t) => t.s).join(' ／ '));
  const ad = r.split.find((t) => t.s.indexOf('見本台') >= 0);
  T('★塊で 返っても 住所の 字は 全部（欠けない）', ad && ad.s === ADDR, ad ? ad.s : '無い');
  /* ★縮めるのは 被る 字だけ★（taiketsu 11-04 止1＝紙の 半分 29/56 を 縮めていた・額も） */
  T('★置いた 字に 元の 大きさ（size0）が 在る（無いと 縮みを 測れない）', r.plain.length > 0 && r.plain.every((t) => Number.isFinite(t.size0)),
    r.plain.filter((t) => !Number.isFinite(t.size0)).length + '個 無い');
  const small = (list) => list.filter((t) => t.size < t.size0 * 0.999);
  const sm = small(r.plain);
  T('★縮んだ 字は 振込先の 口座番号だけ（額・TEL・見出しは 元の 大きさ）', sm.length <= 1 && sm.every((t) => t.s === '1234567'),
    sm.length + '個＝' + sm.map((t) => t.s + '×' + (t.size / t.size0).toFixed(2)).join(' ／ '));
  T('★どの 字も 元の 0.85 倍より 小さく しない', r.plain.concat(r.split, r.far).every((t) => t.size >= t.size0 * 0.85 - 1e-6),
    r.plain.concat(r.split, r.far).filter((t) => t.size < t.size0 * 0.85 - 1e-6).map((t) => t.s).join(' ／ '));
  T('★ふつうの 紙は 行と 字の 数が 全部 合う（合わない 0回）', r.plainMis === 0, r.plainMis + '回');
  /* ★行と 字の 数が 合わない 形★（taiketsu 11-04 止2＝紙じゅうの 字が 半分に なった） */
  T('★合わない 形を 作れている（試験が 測れている）', r.farMis > 0, r.farMis + '回');
  T('★合わない 時も 住所は 1回だけ・字は 全部', cnt(r.far) === 1 && (r.far.find((t) => t.s.indexOf('見本台') >= 0) || {}).s === ADDR,
    r.far.filter((t) => t.s.indexOf('見本台') >= 0).map((t) => t.s).join(' ／ '));
  const smf = small(r.far).filter((t) => t.s !== '1234567');
  T('★合わない 時も 額などの 字を 縮めない', smf.length === 0, smf.length + '個＝' + smf.slice(0, 5).map((t) => t.s + '×' + (t.size / t.size0).toFixed(2)).join(' ／ '));
}
await b.close(); srv.close();
T('★WebKitで JSが 落ちていない', !bad.length, bad.join(' / '));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
