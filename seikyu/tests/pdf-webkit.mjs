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
let PW = null;
for (const cand of [path.join(ROOT, 'node_modules/playwright/index.js'),
  'C:/Users/zeroa/Exally-test/node_modules/playwright/index.js']) {
  if (!fs.existsSync(cand)) continue;
  try {
    const m = require_(cand);
    if (m && m.webkit) { PW = m; break; }
  } catch (e) { /* 次の借り先 */ }
}
if (!PW) {
  console.log('[pdf-webkit] ★未測定★ … playwright が 借りられません');
  console.log('  ★これは「問題なし」では ありません★。★測るには★ npm install && npx playwright install webkit');
  process.exit(0);
}
const { webkit } = PW;
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
  tax:tx,partner:{name:'八木工業株式会社',honor:'御中'},
  org:{yago:'合同会社Rakunally',addr:'愛媛県今治市',invoiceNo:'T3500003003293',bank:'伊予銀行 今治支店 普通 1234567'},
  template:TPL.getOrDefault('std1')},extra||{}));
  return (typeof bt==='string')?bt:(bt.html||'');};
const cases=[['請求書',mk()],['領収書',mk({docKind:'receipt',receipt:{no:'202608-001-1',ymd:'2026-11-20',amount:33000,method:'振込',note:'運転代行 10月分',taxTotal:3000,taxSeparate:true}})]];
const b=await webkit.launch();
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
await b.close(); srv.close();
T('★WebKitで JSが 落ちていない', !bad.length, bad.join(' / '));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
