/* seikyuu-shuukei.mjs — ★請求 / 集計 の画面（代行請求書と 同じ作り）★
 * =============================================================================
 * 司さん 2026-10-23「請求／集計のページを作って、代行請求書と全く同じ作りでやって」
 *   見せた絵＝上に「請求書｜集計」の切り替え／その下に「2026年10月」と「全社」の2つの選び／
 *   その下に「PDFで保存 / 送る」「印刷」「Excelに書き出し」の3つ／その下に 請求書の紙の実物。
 * 手本＝Exally-test/daikou-seikyu.html の #scr-billing（3381-3458）・showBillingSeg・renderReport。
 *
 * ★本物の seikyu-app.js を jsdom で 動かして 実際に 押す★（source を 読むだけに しない）
 * ★形は 本物の Chrome で 測る★（手本＝seikyu/tests/tpl-ask-ui.mjs の measureShape）
 *
 * 見る物:
 *   ① 下のタブに「請求/集計」が 在り、押すと その画面が 開く（タブが 光る）
 *   ② 切り替えは 2つ（請求書／集計）・押すと 中身が 替わる
 *   ③ 月の 既定は ★発行した請求書の在る 最新の月★（下書きだけの月は 選び肢に 出さない）
 *   ④ 取引先の 先頭は「全社」・マスタの 順・マスタに 無い相手も 残す
 *   ⑤ 全社＝その月の 発行した請求書が ★全部★ 紙で 出る（下書き・取り消し・見積は 出ない）
 *   ⑥ 1社を 選ぶと その相手の紙だけに 替わる／月を 替えると 替わる
 *   ⑦ 無い時は ★何が無いかを 字で 出して★ 3つのボタンを 押せなくする（黙って 何も起きない を 作らない）
 *   ⑧ PDF＝今の PDF の作り（SeikyuPdf.build）を 紙ごとに 通して 1つに まとめる・名前は 請求書_YYYY-MM_全社.pdf
 *   ⑨ 印刷＝同じ PDF を 開く（ブラウザの印刷は 使わない）
 *   ⑩ Excel＝1通なら 今の出し方（SeikyuOut.excel）／まとめは 1冊に 紙ごとの シート
 *   ⑪ 集計＝表の数が REP.summarize と 1円も 違わない（請求・入金・残り・合計・件数）
 *   ⑫ 入金が 読めていない時は「未確認」（0円と 書かない）／一覧で見積を 見ていても 集計は 請求書だけ
 *   ⑬ 390px で 横に はみ出さない（本物の Chrome）
 *
 * 使い方: node seikyu/tests/seikyuu-shuukei.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdom が 入っていません。飛ばせません（SKIPを緑と呼ばない）。npm install してください。'); process.exit(1); }

const SELF = process.argv.includes('--self-test');
const SHOT = (() => { const i = process.argv.indexOf('--shot'); return i > 0 ? process.argv[i + 1] : ''; })();
let pass = 0, fail = 0;
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' … 期待 ' + JSON.stringify(b) + ' / 実際 ' + JSON.stringify(a)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = async (n, f) => { try { await f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };

const FILE = path.join(ROOT, 'seikyu/index.html');
const APP = path.join(ROOT, 'seikyu/js/seikyu-app.js');

/* ═══ 形は 本物のブラウザで 測る（jsdom には 段組みが 無い） ═══ */
function findChrome() {
  const c = [
    path.join(process.env['ProgramFiles'] || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['LOCALAPPDATA'] || '', 'Google/Chrome/Application/chrome.exe'),
    '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium',
  ];
  for (const p of c) if (p && fs.existsSync(p)) return p;
  return null;
}
/* jsdom の 画面を 写して Chrome で 開く支度（script を外し・CSS は本物を file:// で 読む）。
   ★紙の枠の 縮め方は アプリの fitPreviewOf と 同じ式★（jsdom では 幅が 0 なので ここで 掛け直す） */
async function pageForChrome(doc, tag) {
  const os = await import('node:os');
  const OUT = path.join(os.tmpdir(), 'rakunally-seikyuu-shape-' + tag);
  fs.mkdirSync(OUT, { recursive: true });
  const d = doc.cloneNode(true);
  d.querySelectorAll('script').forEach((x) => x.remove());
  d.querySelectorAll('[hidden]').forEach((x) => x.removeAttribute('hidden'));
  d.querySelectorAll('link[rel="stylesheet"]').forEach((l) => {
    const href = (l.getAttribute('href') || '').split('?')[0];
    if (/^https?:/.test(href)) { l.remove(); return; }
    l.setAttribute('href', pathToFileURL(path.resolve(path.dirname(FILE), href)).href);
  });
  /* ★字の 幅を 本物に 揃える★（2026-10-24 実測＝網の 字体 DM Mono が 無いと 代わりの 字が 細く、
     320px で 切れる 2,689,132円 が 切れずに 見えて 見張りが 黙った）。DM Mono は 1字＝0.6em の 等幅＝
     同じ 幅の 等幅（Courier New／Liberation Mono／DejaVu Sans Mono）に 置き換えて 測る。 */
  const st = d.createElement('style');
  st.textContent = "#scr-bill .bk-sum-v, #scr-bill .bk-n { font-family: 'Courier New', 'Liberation Mono', 'DejaVu Sans Mono', monospace !important; }";
  d.head.appendChild(st);
  const FIT = 'function fitAll(){[].forEach.call(document.querySelectorAll("#bk-papers .pv-wrap"),function(w){'
    + 'var f=w.querySelector("iframe");if(!f)return;var dd=f.contentDocument;if(!dd||!dd.documentElement)return;'
    + 'var pw=Math.max(320,dd.documentElement.scrollWidth),ph=Math.max(320,dd.documentElement.scrollHeight);'
    + 'f.style.width=pw+"px";f.style.height=ph+"px";var k=Math.min(1,(w.clientWidth||pw)/pw);'
    + 'f.style.transform="scale("+k+")";w.style.height=Math.ceil(ph*k)+"px";});}';
  return { OUT, d, FIT };
}
async function measureShape(doc, W = 390) {
  const CHROME = findChrome();
  if (!CHROME) throw new Error('★ブラウザが 見つかりません＝形を 測れません（0と言わない）★');
  const { execFileSync } = await import('node:child_process');
  const { OUT, d, FIT } = await pageForChrome(doc, 'm' + W);
  const PROBE = FIT + 'fitAll();'
    + 'var vw=window.innerWidth,over=[];'
    + '[].forEach.call(document.querySelectorAll("#scr-bill *"),function(e){var r=e.getBoundingClientRect();'
    + 'if(r.width>0&&(r.right>vw+0.5||r.left<-0.5))over.push((e.id||e.className||e.tagName)+" "+Math.round(r.left)+"-"+Math.round(r.right));});'
    + 'var sc=document.getElementById("scr-bill").getBoundingClientRect();'
    + 'var papers=[].map.call(document.querySelectorAll("#bk-papers .pv-wrap"),function(w){var r=w.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)];});'
    + 'var acts=[].map.call(document.querySelectorAll(".bk-acts button"),function(b){var r=b.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height),Math.round(r.top),b.scrollWidth-b.clientWidth,b.scrollHeight-b.clientHeight,Math.round(r.right)];});'
    + 'var clip=[];[].forEach.call(document.querySelectorAll("#scr-bill .bk-sum-v, #scr-bill .bk-tbl td, #scr-bill .bk-acts button"),function(e){var r=e.getBoundingClientRect();if(!(r.width>0))return;var o1=e.style.overflow,o2=e.style.textOverflow;e.style.overflow="visible";e.style.textOverflow="clip";var rg=document.createRange();rg.selectNodeContents(e);var rr=rg.getBoundingClientRect();var cs=getComputedStyle(e);var inR=r.right-parseFloat(cs.paddingRight)-parseFloat(cs.borderRightWidth);var inL=r.left+parseFloat(cs.paddingLeft)+parseFloat(cs.borderLeftWidth);e.style.overflow=o1;e.style.textOverflow=o2;if(rr.right>inR+0.5||rr.left<inL-0.5||e.scrollWidth>e.clientWidth+0.5||r.right>vw+0.5)clip.push((e.className||e.tagName)+" "+e.textContent.trim().slice(0,14)+" 字"+Math.round(rr.width)+"/枠"+Math.round(inR-inL));});'
    + 'var sums=[].map.call(document.querySelectorAll("#scr-bill .bk-sum-v"),function(e){var rg=document.createRange();rg.selectNodeContents(e);return e.textContent.trim()+" [字"+Math.round(rg.getBoundingClientRect().width)+"/枠"+e.clientWidth+" "+getComputedStyle(e).whiteSpace+" "+getComputedStyle(e).fontFamily.slice(0,20)+"]";});'
    + 'return {vw:vw,sw:document.documentElement.scrollWidth,over:over.slice(0,8),scrW:Math.round(sc.width),papers:papers,acts:acts,clip:clip,sums:sums};';
  const tail = '<script>window.addEventListener("load",function(){setTimeout(function(){var r;try{r=JSON.stringify((function(){'
    + PROBE + '})());}catch(e){r=JSON.stringify({error:String(e)});}parent.postMessage(r,"*");},300);});</scr' + 'ipt>';
  const html = '<!doctype html>\n' + d.documentElement.outerHTML;
  const cut = html.lastIndexOf('</body>');
  fs.writeFileSync(path.join(OUT, 'p.html'), html.slice(0, cut) + tail + html.slice(cut), 'utf8');
  const host = path.join(OUT, 'h.html');
  fs.writeFileSync(host, '<!doctype html><html><head><meta charset="utf-8">'
    + '<style>html,body{margin:0}iframe{border:0;display:block}</style></head><body>'
    + '<iframe width="' + W + '" height="844" src="p.html"></iframe>'
    + '<script>window.addEventListener("message",function(e){document.title=e.data;});</scr' + 'ipt></body></html>', 'utf8');
  const out = execFileSync(CHROME, ['--headless', '--disable-gpu', '--hide-scrollbars',
    '--window-size=1200,1000', '--virtual-time-budget=6000', '--dump-dom', pathToFileURL(host).href],
  { encoding: 'latin1', maxBuffer: 40 * 1024 * 1024, timeout: 90000 });
  const m = /<title>([^<]*)<\/title>/.exec(out);
  if (!m || !m[1]) throw new Error('★枠の中から 答えが 返りません＝測れていません★');
  const j = JSON.parse(Buffer.from(m[1], 'latin1').toString('utf8').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  if (j.error) throw new Error('測れません: ' + j.error);
  return j;
}
/* ★絵を 撮る★（--shot <置き場の頭>）＝390px 幅で 画面を そのまま 撮る（自分の目で 見る為） */
/* ★Chrome の --screenshot は 窓を 390px まで 細く できない★（約500px で 止まり 右が 切れた絵に なった）
   ⇒ 撮るのは playwright の chromium（幅 390 の 窓を 本当に 作れる）。借り方は scripts/_borrow-playwright.mjs 1か所。 */
async function shoot(doc, file, W = 390) {
  const { borrow, launch } = await import('../../scripts/_borrow-playwright.mjs');
  const ch = await borrow('seikyuu-shuukei', 'chromium');
  const { OUT, d, FIT } = await pageForChrome(doc, 's');
  const tail = '<script>window.addEventListener("load",function(){' + FIT + 'fitAll();});</scr' + 'ipt>';
  const html = '<!doctype html>\n' + d.documentElement.outerHTML;
  const cut = html.lastIndexOf('</body>');
  const page = path.join(OUT, path.basename(file) + '.html');
  fs.writeFileSync(page, html.slice(0, cut) + tail + html.slice(cut), 'utf8');
  const b = await launch('seikyuu-shuukei', ch, undefined, 'chromium');
  try {
    const pg = await b.newPage({ viewport: { width: W, height: 1400 } });
    await pg.goto(pathToFileURL(page).href, { waitUntil: 'load' });
    await pg.waitForTimeout(400);
    const sw = await pg.evaluate(() => document.documentElement.scrollWidth);
    ok(sw <= W, '★撮った 画面が 横に はみ出している★ ' + sw);
    await pg.screenshot({ path: file });
  } finally { await b.close(); }
  ok(fs.existsSync(file), '絵が 出来ていない: ' + file);
}

/* ═══ 種（偽の 中身）＝倉庫には 1バイトも 触らない ═══ */
const line = (name, kin) => ({ name, qty: '1', unit: '式', price: String(kin), amount: String(kin), rate: 10, memo: '' });
function tane() {
  const partners = [
    { id: 'p0', data: { name: '例野工業株式会社', keisho: '御中' } },
    { id: 'p1', data: { name: '型見空例商事', keisho: '御中' } },
    { id: 'p2', data: { name: '見本台運送', keisho: '御中' } },
  ];
  const iv = (id, no, st, pid, ymd, kin, extra) => Object.assign({
    id, no, status: st, doc_type: 'invoice', partner_id: pid, issue_ymd: ymd, due_ymd: '',
    tax_mode: 'exclusive', rounding: 'floor', lines: [line('工事代金', kin)], data: {},
    totals: { grandTotal: Math.floor(kin * 1.1) },
  }, extra || {});
  const invoices = [
    iv('a', '202610-001', 'issued', 'p0', '2026-10-05', 10000),
    iv('b', '202610-002', 'issued', 'p1', '2026-10-10', 20000),
    iv('a2', '202610-003', 'issued', 'p0', '2026-10-25', 30000),
    iv('dr', '202610-004', 'draft', 'p0', '2026-10-26', 99999),          // ★下書き＝出さない
    iv('vd', '202610-005', 'void', 'p2', '2026-10-27', 88888),           // ★取り消し＝出さない
    iv('q', 'Q-202610-001', 'issued', 'p1', '2026-10-28', 77777, { doc_type: 'quote' }), // ★見積＝出さない
    /* ★マスタから 消えた相手★＝請求書だけ 残っている（名前は 写しから） */
    iv('g', '202610-006', 'issued', 'gone', '2026-10-15', 5000,
      { snapshot: { partner: { name: '消えた株式会社' } } }),
    iv('c', '202609-001', 'issued', 'p2', '2026-09-30', 40000),
    /* ★7〜9桁の 月★（taiketsu 10-24 止3＝320px で 2,689,132円 が「2,689,1…」に 切れた） */
    iv('big1', '202608-001', 'issued', 'p0', '2026-08-10', 2444666),     // 2,689,132
    iv('big2', '202608-002', 'issued', 'p1', '2026-08-20', 112233445),   // 123,456,789
    iv('d11', '202611-001', 'draft', 'p1', '2026-11-02', 12345),         // ★下書きだけの月＝選び肢に 出さない
  ];
  const receipts = [
    { invoice_id: 'a', amount: 11000, ymd: '2026-10-31' },
    { invoice_id: 'b', amount: 2000, ymd: '2026-10-31' },
  ];
  return { partners, invoices, receipts };
}

async function boot(appSrc) {
  const html = fs.readFileSync(FILE, 'utf8');
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''),
    { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/seikyu/index.html' });
  const win = dom.window, doc = win.document;
  const errs = [];
  win.addEventListener('error', (e) => errs.push(String(e.message || e.error)));
  win.fetch = () => Promise.reject(new Error('no net'));
  win.scrollTo = () => {}; win.print = () => { errs.push('★ブラウザの印刷が 呼ばれた★'); };
  win.alert = () => {}; win.confirm = () => true;
  win.URL.createObjectURL = () => 'blob:fake';
  win.open = () => ({ document: { write() {}, close() {} }, focus() {}, print() {}, close() {} });
  for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
    const src = m[1].split('?')[0], base = src.split('/').pop();
    if (/^https?:/.test(src) || ['supa-config.js', 'auth.js', 'env-badge.js', 'rakunally-login.js'].indexOf(base) >= 0) continue;
    const p = path.resolve(path.dirname(FILE), src);
    if (!fs.existsSync(p)) continue;
    const el = doc.createElement('script');
    el.textContent = (base === 'seikyu-app.js' && appSrc) ? appSrc : fs.readFileSync(p, 'utf8');
    doc.body.appendChild(el);
  }
  await sleep(500);
  doc.getElementById('app').hidden = false;
  const A = win.SeikyuApp, S = A._state;
  ok(A, 'seikyu-app.js が 動いていない');
  const t = tane();
  S.partners = t.partners; S.invoices = t.invoices; S.receipts = t.receipts;
  S.fil = 'all'; S.docType = 'invoice'; S.kind = 'invoice';
  S.org = { yago: '合同会社Rakunally', addr: '東京都架空区見本台1-2-3', tel: '090-0000-0000',
    invoiceNo: 'T1234567890123', bank: '（見本）銀行 ◯◯支店 普通 1234567' };
  /* ★偽の 倉庫は 本物と 同じく 種類（doc_type）で 分けて 返す★（taiketsu 10-24 止1＝前は 種類を 見ずに 全部 返していた
     ので「見積に 切り替えたら 請求書が 消える」を 踏めなかった）。★写しを 返す★（画面の 書き込みが 倉庫に 漏れない） */
  const DB = t.invoices;
  const store = {
    partners: { list: () => Promise.resolve(S.partners) },
    receipts: { list: () => Promise.resolve(t.receipts) },
    invoices: {
      list: (k) => (store.ochiru ? Promise.reject(new Error('fake-failure'))
        : Promise.resolve(JSON.parse(JSON.stringify(DB.filter((v) => (v.doc_type || 'invoice') === (k || 'invoice')))))),
      usedNos: () => Promise.resolve([]),
      markSent: (id) => { rec.sent.push(id); return Promise.resolve({ ok: true }); },
    },
  };
  S.store = store;
  /* ★出す道は 本物の 部品を 呼ぶか だけ 見る★（PDFの字体は 網から 取るので jsdom では 作れない）
     ＝SeikyuPdf.build（紙→PDF）・PDFLib（まとめる）・SeikyuOut.pdfOpen／excel・FileOut.deliver を 控える */
  const rec = { pdfHtml: [], opened: [], excel: [], deliver: [], merged: 0, sent: [] };
  win.SeikyuPdf.build = (h) => { rec.pdfHtml.push(String(h)); return Promise.resolve(new Uint8Array([rec.pdfHtml.length])); };
  win.PDFLib = { PDFDocument: {
    create: () => Promise.resolve({ pages: [],
      copyPages(src, idx) { return Promise.resolve(idx.map((i) => src.pages[i])); },
      addPage(p) { this.pages.push(p); },
      save() { rec.merged = this.pages.length; return Promise.resolve(new Uint8Array(this.pages)); } }),
    load: (b) => Promise.resolve({ pages: [b[0]], getPageIndices() { return [0]; } }),
  } };
  win.SeikyuOut.pdfOpen = (bytes, name) => { rec.opened.push({ name, n: bytes.length }); return Promise.resolve({}); };
  win.SeikyuOut.pdf = (bytes, name) => { rec.opened.push({ name, n: bytes.length, save: 1 }); return Promise.resolve({}); };
  win.SeikyuOut.excel = (sheet, name) => { rec.excel.push({ name, sheet }); return Promise.resolve(); };
  win.FileOut.deliver = (bytes, name) => { rec.deliver.push({ name, bytes }); return Promise.resolve({}); };
  A._bindForTest();
  await A._loadList();                    /* ★お客さんと 同じく 倉庫から 読む★（請求書の 棚） */
  A._go('scr-edit');
  return { win, doc, A, S, rec, errs, DB, store };
}

async function run(label, appSrc) {
  console.log('\n[' + label + '] ★請求 / 集計（代行請求書と 同じ作り）★');
  const { win, doc, A, S, rec, errs, DB, store } = await boot(appSrc);
  const $ = (id) => doc.getElementById(id);
  const txt = (id) => (($(id) || {}).textContent || '').replace(/\s+/g, ' ').trim();
  const kaeru = async (id, v) => {
    const el = $(id); ok(el, '選び所が 無い: ' + id);
    el.value = v; ok(el.value === v, '★選び肢に 無い★ ' + id + '=' + v);
    el.dispatchEvent(new win.Event('change', { bubbles: true }));
    await sleep(30);
  };
  const papers = () => [...doc.querySelectorAll('#bk-papers [data-id]')].map((x) => x.getAttribute('data-id'));
  const btnIds = ['b-bk-pdf', 'b-bk-print', 'b-bk-xlsx'];
  const REP = win.SeikyuReport;

  await T('① 下のタブに「請求/集計」が 在り、押すと その画面が 開く（タブが 光る）', async () => {
    const tab = doc.querySelector('.bn[data-scr="scr-bill"]');
    ok(tab, '★下のタブに 請求/集計が 無い★');
    eq((tab.querySelector('.bn-l') || {}).textContent, '請求/集計', 'タブの 字');
    tab.click(); await sleep(60);
    ok($('scr-bill') && $('scr-bill').classList.contains('active'), '★押しても 画面が 開かない★');
    const on = [...doc.querySelectorAll('.bn.on')].map((b) => b.getAttribute('data-scr'));
    eq(on.join(','), 'scr-bill', '★光っている タブ★');
    ['scr-list', 'scr-edit', 'scr-set'].forEach((s) => ok(!$(s).classList.contains('active'), s + ' が 出たまま'));
  });

  await T('② 切り替えは 2つ（請求書／集計）・押すと 中身が 替わる', async () => {
    const segs = [...doc.querySelectorAll('#scr-bill .bk-seg [data-bseg]')];
    eq(segs.map((b) => b.textContent.trim()).join('|'), '請求書|集計', '切り替えの 字');
    const panel = (k) => doc.querySelector('#scr-bill .bk-panel[data-bseg="' + k + '"]');
    ok(panel('invoice') && panel('report'), '中身の 箱が 2つ 無い');
    ok(panel('invoice').classList.contains('on') && !panel('report').classList.contains('on'), '★開いた時は 請求書の側で ない★');
    segs[1].click(); await sleep(30);
    ok(panel('report').classList.contains('on') && !panel('invoice').classList.contains('on'), '★集計を 押しても 替わらない★');
    ok(segs[1].classList.contains('on') && !segs[0].classList.contains('on'), '★押した方が 光らない★');
    segs[0].click(); await sleep(30);
    ok(panel('invoice').classList.contains('on'), '★請求書に 戻らない★');
  });

  await T('③ 月の 既定は 発行した請求書の在る 最新の月（下書きだけの月は 出さない）', async () => {
    const el = $('bk-month'); ok(el, '★月の 選び所が 無い★');
    eq(el.value, '2026-10', '★既定の 月★');
    const v = [...el.options].map((o) => o.value).filter(Boolean);
    eq(v.join(','), '2026-10,2026-09,2026-08', '★月の 選び肢（在る月だけ・新しい順・下書きだけの11月は 出さない）★');
    eq(el.options[el.selectedIndex].textContent, '2026年10月', '月の 字');
  });

  await T('④ 取引先の 先頭は「全社」・マスタの順・マスタに 無い相手も 残す', async () => {
    const el = $('bk-partner'); ok(el, '★取引先の 選び所が 無い★');
    const o = [...el.options];
    eq(o[0].value, '', '先頭の 値'); eq(o[0].textContent, '全社', '★先頭が 全社で ない★');
    eq(o.slice(1).map((x) => x.textContent).join('|'), '例野工業株式会社|型見空例商事|見本台運送|消えた株式会社',
      '★マスタの順＋消えた相手★');
    eq(el.value, '', '★既定が 全社で ない★');
  });

  await T('⑤ 全社＝その月の 発行した請求書が 全部 紙で 出る（下書き・取り消し・見積は 出ない）', async () => {
    eq(papers().join(','), 'a,a2,b,g', '★出た紙（マスタ順・日付順）★');
    const frames = [...doc.querySelectorAll('#bk-papers iframe')];
    eq(frames.length, 4, '★紙の 枠の 数★');
    frames.forEach((f, i) => ok((f.getAttribute('srcdoc') || '').length > 1000, '★' + (i + 1) + '枚目の 紙が 空★'));
    ok(frames[0].getAttribute('srcdoc').indexOf('202610-001') >= 0, '★1枚目に その請求書の 番号が 無い★');
    ok(!/202610-004|202610-005|Q-202610/.test(frames.map((f) => f.getAttribute('srcdoc')).join('')),
      '★下書き・取り消し・見積の 紙が 混ざっている★');
    btnIds.forEach((id) => ok($(id) && !$(id).disabled, '★' + id + ' が 押せない★'));
    ok($('bk-none').style.display === 'none', '★在るのに「無い」の 字が 出ている★');
    console.log('     ' + txt('bk-count'));
  });

  await T('⑥ 1社を 選ぶと その相手の紙だけ／月を 替えると 替わる', async () => {
    await kaeru('bk-partner', 'p1');
    eq(papers().join(','), 'b', '★型見空例商事の 10月★');
    await kaeru('bk-partner', 'gone');
    eq(papers().join(','), 'g', '★マスタに 無い相手の 紙★');
    await kaeru('bk-partner', '');
    await kaeru('bk-month', '2026-09');
    eq(papers().join(','), 'c', '★9月 全社★');
    await kaeru('bk-month', '2026-10');
    eq(papers().length, 4, '★10月に 戻らない★');
  });

  await T('⑦ 無い時は 何が無いかを 字で 出して 3つとも 押せなくする', async () => {
    await kaeru('bk-partner', 'p2');            // 10月の p2 は 取り消しだけ
    eq(papers().length, 0, '★取り消しの紙が 出ている★');
    const t = txt('bk-none');
    ok($('bk-none').style.display !== 'none' && /2026年10月/.test(t) && /見本台運送/.test(t) && /ありません/.test(t),
      '★何が 無いかを 言っていない★: ' + t);
    btnIds.forEach((id) => ok($(id).disabled, '★無いのに ' + id + ' が 押せる★'));
    console.log('     ' + t);
    await kaeru('bk-partner', '');
    btnIds.forEach((id) => ok(!$(id).disabled, '★戻しても ' + id + ' が 押せない★'));
    /* ★1通も 発行していない人★（下書きだけ） */
    const keep = S.invoices;
    S.invoices = keep.filter((v) => v.status === 'draft');
    A._go('scr-bill'); await sleep(30);
    eq(papers().length, 0, '★下書きが 出ている★');
    const t2 = txt('bk-none');
    ok(/まだ/.test(t2) && /発行/.test(t2), '★まだ 1通も 無い事を 言っていない★: ' + t2);
    btnIds.forEach((id) => ok($(id).disabled, '★1通も 無いのに ' + id + ' が 押せる★'));
    console.log('     ' + t2);
    S.invoices = keep;
    A._go('scr-bill'); await sleep(30);
    eq(papers().length, 4, '★戻らない★');
  });

  await T('⑧ PDF＝今の PDF の作りを 紙ごとに 通して 1つに まとめる（請求書_2026-10_全社.pdf）', async () => {
    rec.pdfHtml.length = 0; rec.opened.length = 0;
    $('b-bk-pdf').click(); await sleep(30);
    ok($('fn-ov').classList.contains('open'), '★名前を 先に 見せていない★（司さんの 決まり）');
    eq($('fn-input').value, '請求書_2026-10_全社', '★名前★');
    $('fn-ok').click(); await sleep(120);
    eq(rec.pdfHtml.length, 4, '★紙ごとに PDF の作りを 通していない★');
    ['202610-001', '202610-003', '202610-002', '202610-006'].forEach((no, i) =>
      ok(rec.pdfHtml[i].indexOf(no) >= 0, '★' + (i + 1) + '枚目の PDF に ' + no + ' が 無い★'));
    eq(rec.merged, 4, '★1つの PDF に まとめていない★');
    eq(rec.opened.map((x) => x.name).join(','), '請求書_2026-10_全社.pdf', '★開いた PDF★');
    ok(/PDF/.test(txt('bk-ok')), '★できた事を 言っていない★: ' + txt('bk-ok'));
    /* ★全社の まとめ PDF は「渡した」印を 付けない★（取引先ごとに 送れない 物・taiketsu 10-24 止2） */
    eq(rec.sent.length, 0, '★全社の まとめ PDF で「渡した」印を 付けた★ ' + rec.sent.join(','));
    ok(/印は 付けません/.test(txt('bk-ok')), '★印を 付けない 訳を 言っていない★: ' + txt('bk-ok'));
    /* 1社・1通＝今の 名前の付け方（seikyu-name）をそのまま */
    await kaeru('bk-partner', 'p1');
    rec.pdfHtml.length = 0; rec.opened.length = 0;
    $('b-bk-pdf').click(); await sleep(30);
    const nm = $('fn-input').value;
    ok(/請求書/.test(nm) && /型見空例商事/.test(nm), '★1通の 名前が 中身から 作られていない★: ' + nm);
    $('fn-ok').click(); await sleep(120);
    eq(rec.pdfHtml.length, 1, '1通の PDF');
    eq(rec.opened.length, 1, '1通を 開いた');
    await sleep(60);
    eq(rec.sent.join(','), 'b', '★1社の PDF が 出来たのに「渡した」印が 付かない★');
    await kaeru('bk-partner', '');
  });

  await T('⑨ 印刷＝同じ PDF を 開く（ブラウザの印刷は 使わない・名前は 聞かない）', async () => {
    rec.pdfHtml.length = 0; rec.opened.length = 0;
    $('b-bk-print').click(); await sleep(120);
    ok(!$('fn-ov').classList.contains('open'), '★印刷で 名前を 聞いている★（司さん「印刷押すだけ」）');
    eq(rec.pdfHtml.length, 4, '★紙ごとに 通していない★');
    eq(rec.opened.map((x) => x.name).join(','), '請求書_2026-10_全社.pdf', '★開いた PDF★');
    ok(/印刷/.test(txt('bk-ok')), '★印刷の 案内が 無い★: ' + txt('bk-ok'));
    ok(!errs.some((e) => /ブラウザの印刷/.test(e)), '★window.print を 呼んだ★');
  });

  await T('⑨-b「渡した」印は PDF・印刷が 本当に 出来た 後だけ（作れなかったら 付けない・taiketsu 10-24 止2）', async () => {
    await A._loadList(); A._go('scr-bill'); await sleep(60);
    const moto = win.SeikyuPdf.build;
    win.SeikyuPdf.build = () => Promise.reject(new Error('作れない'));
    rec.sent.length = 0; rec.opened.length = 0;
    $('b-bk-print').click(); await sleep(150);
    eq(rec.opened.length, 0, '開いていない 筈');
    eq(rec.sent.length, 0, '★PDF が 作れなかったのに「渡した」印を 付けた★ ' + rec.sent.join(','));
    ok(/作れません/.test(txt('bk-err')), '★作れなかった 事を 言っていない★: ' + txt('bk-err'));
    win.SeikyuPdf.build = moto;
    rec.sent.length = 0;
    $('b-bk-print').click(); await sleep(200);
    eq(rec.sent.length, 4, '★印刷が 出来たのに 印が 付かない★ ' + rec.sent.join(','));
    await A._loadList(); A._go('scr-bill'); await sleep(60);
  });

  await T('⑩ Excel＝1通なら 今の出し方（SeikyuOut.excel）／まとめは 1冊に 紙ごとの シート', async () => {
    await kaeru('bk-partner', 'p1');
    rec.excel.length = 0; rec.deliver.length = 0;
    $('b-bk-xlsx').click(); await sleep(30);
    ok($('fn-ov').classList.contains('open'), '★名前を 先に 見せていない★');
    $('fn-ok').click(); await sleep(60);
    eq(rec.excel.length, 1, '★1通の Excel が 今の 出し方を 通っていない★');
    ok(/xlsx$/.test(rec.excel[0].name), '名前の 拡張子');
    ok(JSON.stringify(rec.excel[0].sheet.aoa).indexOf('202610-002') >= 0, '★Excel に その請求書が 入っていない★');
    await kaeru('bk-partner', '');
    rec.excel.length = 0; rec.deliver.length = 0;
    $('b-bk-xlsx').click(); await sleep(30);
    eq($('fn-input').value, '請求書_2026-10_全社', '★まとめの 名前★');
    $('fn-ok').click(); await sleep(60);
    eq(rec.deliver.length, 1, '★まとめが 1冊に なっていない★');
    eq(rec.deliver[0].name, '請求書_2026-10_全社.xlsx', '名前');
    const wb = win.XLSX.read(rec.deliver[0].bytes, { type: 'array' });
    eq(wb.SheetNames.length, 4, '★シートが 紙の数だけ 無い★ ' + wb.SheetNames.join('/'));
    const all = wb.SheetNames.map((n) => win.XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n');
    ['202610-001', '202610-002', '202610-003', '202610-006'].forEach((no) => ok(all.indexOf(no) >= 0, '★' + no + ' が 入っていない★'));
    console.log('     シート … ' + wb.SheetNames.join(' / '));
  });

  /* ★集計★ … 数は REP.summarize と 1円も 違わない */
  const yen = (n) => Number(n).toLocaleString('en-US');
  /* ★比べる 数は 画面と 同じ 集計（帳簿で 充てた 入金・2026-10-24 帳簿 1つ）★
     前は 入金を 記録した 紙の 月に だけ 数える 生の receipts で 比べていた＝帳簿は 古い 請求書から 充てる
     （例野工業の 10月に 記録した 11,000 は、未入金の 8月 2,689,132 に 充たる）ので 割れる。 */
  const checkReport = (month, receipts) => {
    const s = A._reportForTest(month);
    eq(s.totals.paid === null, receipts === null, '★入金が 読めているか★');
    const trs = [...doc.querySelectorAll('#bk-rep-body tbody tr')];
    eq(trs.length, s.rows.length, '★表の 行の数★');
    s.rows.forEach((r, i) => {
      const tds = [...trs[i].querySelectorAll('td')].map((td) => td.textContent.replace(/\s+/g, ''));
      ok(tds[0].indexOf(r.name) >= 0, '★' + (i + 1) + '行目の 相手★ ' + tds[0] + ' / ' + r.name);
      eq(tds[1], yen(r.total), '★' + r.name + ' の 請求★');
      eq(tds[2], r.paid === null ? '未確認' : yen(r.paid), '★' + r.name + ' の 入金★');
      eq(tds[3], r.remain === null ? '未確認' : yen(r.remain), '★' + r.name + ' の 残り★');
    });
    const ft = [...doc.querySelectorAll('#bk-rep-body tfoot td')].map((td) => td.textContent.replace(/\s+/g, ''));
    eq(ft[0], '合計（' + s.rows.length + '社・' + s.totals.count + '件）', '★合計の 行の 字★');
    eq(ft[1], yen(s.totals.total), '★合計の 請求★');
    eq(ft[2], s.totals.paid === null ? '未確認' : yen(s.totals.paid), '★合計の 入金★');
    eq(ft[3], s.totals.remain === null ? '未確認' : yen(s.totals.remain), '★合計の 残り★');
    const cells = [...doc.querySelectorAll('#bk-rep-sum .bk-sum-c')].map((c) => c.textContent.replace(/\s+/g, ''));
    eq(cells.length, 3, '★上の 枠が 3つで ない★');
    eq(cells[0], '請求' + yen(s.totals.total) + '円', '請求の 枠');
    eq(cells[1], '入金' + (s.totals.paid === null ? '未確認' : yen(s.totals.paid) + '円'), '入金の 枠');
    eq(cells[2], '残額' + (s.totals.remain === null ? '未確認' : yen(s.totals.remain) + '円'), '残額の 枠');
    return s;
  };

  await T('⑪ 集計＝表の数が 画面の 集計（帳簿で 充てた 入金）と 1円も 違わない（請求・入金・残り・合計・件数）', async () => {
    doc.querySelector('#scr-bill [data-bseg="report"]').click(); await sleep(30);
    const el = $('bk-rep-month'); ok(el, '★集計の 月の 選び所が 無い★');
    eq(el.value, '2026-10', '★集計の 既定の 月★');
    const s = checkReport('2026-10', S.receipts);
    eq(s.totals.count, 4, '数えた 通数（種の 確かめ）');
    console.log('     ' + [...doc.querySelectorAll('#bk-rep-sum .bk-sum-c')].map((c) => c.textContent.replace(/\s+/g, ' ').trim()).join(' ／ ')
      + ' ／ ' + [...doc.querySelectorAll('#bk-rep-body tfoot td')][0].textContent);
    /* ★帳簿の 固い 数★（比べる 正が 画面と 同じ 関数なので、帳簿が 壊れても 上の 比べは 緑の まま＝ここで 額を 押さえる）
       例野工業の 10月の 紙に 記録した 11,000 は、未入金の 8月（2,689,132）へ 古い 方から 充たる */
    const reino = (x) => x.rows.find((r) => r.name === '例野工業株式会社');
    eq(reino(s).paid, 0, '★例野工業の 10月の 入金（帳簿で 8月へ）★');
    await kaeru('bk-rep-month', '2026-08');
    eq(reino(checkReport('2026-08', S.receipts)).paid, 11000, '★例野工業の 8月の 入金（帳簿で 10月から 充たる）★');
    await kaeru('bk-rep-month', '2026-09');
    checkReport('2026-09', S.receipts);
    await kaeru('bk-rep-month', '');
    checkReport('', S.receipts);
    await kaeru('bk-rep-month', '2026-10');
  });

  await T('⑫ 入金が 読めていない時は「未確認」／一覧で見積を 見ていても 集計は 請求書だけ', async () => {
    const keep = S.receipts;
    S.receipts = null; A._go('scr-bill'); doc.querySelector('#scr-bill [data-bseg="report"]').click(); await sleep(30);
    checkReport('2026-10', null);
    ok(!/入金0円/.test(txt('bk-rep-sum').replace(/\s+/g, '')), '★読めていないのに 0円と 書いた★');
    S.receipts = keep;
    A._go('scr-bill');
    doc.querySelector('#scr-bill [data-bseg="invoice"]').click(); await sleep(30);
  });

  /* ★本物の 切り替えを 踏む★（taiketsu 10-24 止1＝前は S.kind を 立てるだけで 一覧の 棚が 見積に 入れ替わる 所を 通っていなかった） */
  const invList = () => DB.filter((v) => (v.doc_type || 'invoice') === 'invoice');
  await T('⑫-b 一覧で「見積書」を 押してから 開いても 請求書の 紙も 集計も 出る／画面に 居る間の 読み直しで 描き直す', async () => {
    doc.querySelector('.bn[data-scr="scr-list"]').click(); await sleep(30);
    doc.querySelector('#kind-seg [data-kind="quote"]').click(); await sleep(120);
    eq(S.docType, 'quote', '見積に 切り替わっていない');
    doc.querySelector('.bn[data-scr="scr-bill"]').click(); await sleep(120);
    eq(papers().join(','), 'a,a2,b,g', '★見積を 見ている 間は 請求書の 紙が 出ない★ ' + txt('bk-none'));
    btnIds.forEach((id) => ok(!$(id).disabled, '★' + id + ' が 押せない★'));
    doc.querySelector('#scr-bill [data-bseg="report"]').click(); await sleep(30);
    const s = REP.summarize({ invoices: invList(), receipts: S.receipts, partners: S.partners, month: '2026-10', kind: 'invoice', doc: win.SeikyuDoc });
    ok(txt('bk-rep-sum').replace(/\s+/g, '').indexOf(yen(s.totals.total) + '円') >= 0, '★見積を 見ている 間は 集計が 出ない★ ' + txt('bk-rep-body').slice(0, 60));
    doc.querySelector('#scr-bill [data-bseg="invoice"]').click(); await sleep(30);
    /* 画面に 居る 間に 倉庫が 増えて 読み直した → 描き直す */
    DB.push({ id: 'new1', no: '202610-007', status: 'issued', doc_type: 'invoice', partner_id: 'p2', issue_ymd: '2026-10-29',
      tax_mode: 'exclusive', rounding: 'floor', lines: [line('工事代金', 1000)], data: {}, totals: { grandTotal: 1100 } });
    await A._loadList(); await sleep(120);
    eq(papers().join(','), 'a,a2,b,new1,g', '★読み直したのに 描き直さない★');
    DB.pop();
    doc.querySelector('.bn[data-scr="scr-list"]').click(); await sleep(30);
    doc.querySelector('#kind-seg [data-kind="invoice"]').click(); await sleep(120);
    A._go('scr-bill'); await sleep(60);
    eq(papers().join(','), 'a,a2,b,g', '戻らない');
  });

  await T('⑫-c 請求書を 読めない時は「読めていません」と 言って 3つとも 止める（「まだ 発行していない」と 嘘を 言わない）', async () => {
    store.ochiru = true;
    await A._loadList(); await sleep(30);
    eq(S.listReadOk, false, '読めない 姿に なっていない');
    A._go('scr-bill'); await sleep(80);
    const t = txt('bk-none');
    ok(/読めていません/.test(t) && !/まだ/.test(t), '★読めないのに 違う事を 言った★: ' + t);
    btnIds.forEach((id) => ok($(id).disabled, '★読めないのに ' + id + ' が 押せる★'));
    eq(papers().length, 0, '★読めないのに 古い 紙が 残っている★');
    doc.querySelector('#scr-bill [data-bseg="report"]').click(); await sleep(30);
    ok(/読めていません/.test(txt('bk-rep-body')) && !/まだ/.test(txt('bk-rep-body')), '★集計も 嘘を 言った★: ' + txt('bk-rep-body'));
    ok($('bk-rep-acts').style.display === 'none', '★読めないのに 集計の Excel が 押せる★');
    store.ochiru = false;
    await A._loadList(); await sleep(120);
    ok(/2026年10月/.test($('bk-rep-month').options[$('bk-rep-month').selectedIndex].textContent), '★読めたのに 描き直さない★');
    doc.querySelector('#scr-bill [data-bseg="invoice"]').click(); await sleep(60);
    eq(papers().length, 4, '★読めたのに 紙が 戻らない★');
  });

  for (const W of [390, 320]) await T('⑬ ' + W + 'px で 横に はみ出さない・3つの ボタンが 横1列で 字が 切れない（本物の Chrome・全社の紙を 出した 姿）', async () => {
    const j = await measureShape(doc, W);
    eq(j.vw, W, '測った 幅');
    eq(j.acts.length, 3, 'ボタンの 数');
    ok(j.acts.every((a) => Math.abs(a[2] - j.acts[0][2]) <= 1), '★3つが 横1列に 並んでいない★ 上端 ' + j.acts.map((a) => a[2]).join('/'));
    j.acts.forEach((a, i) => ok(a[3] <= 0 && a[4] <= 0, '★' + (i + 1) + '個目の ボタンの 字が 切れている★ 横' + a[3] + ' 縦' + a[4]));
    j.acts.forEach((a, i) => ok(a[5] <= W, '★' + (i + 1) + '個目の ボタンが はみ出した★ 右端 ' + a[5]));
    /* ★幅は 画面の 幅から 本文の 余白（左右 16px×2）を 引いた 物★＝決め打ちの 300 では 320px の 時（288）に 嘘の 赤に なった */
    ok(j.scrW >= W - 32 - 1, '★画面が 出ていない★ 幅 ' + j.scrW);
    eq(j.papers.length, 4, '★紙が 4枚 出ていない★');
    j.papers.forEach((p, i) => ok(p[0] > W - 80 && p[1] > 300, '★' + (i + 1) + '枚目の 紙の 大きさ★ ' + p.join('×')));
    j.acts.forEach((a, i) => ok(a[1] >= 44 && a[1] < 80, '★' + (i + 1) + '個目の ボタンの 高さ★ ' + a.slice(0, 2).join('×')));
    ok(j.sw <= W, '★横に はみ出した★ 幅 ' + j.sw);   /* ★決め打ちの 390 では 320px の はみ出しを 見逃す★ */
    ok(!j.over.length, '★はみ出した 物★ ' + j.over.join(' / '));
    console.log('     幅 ' + j.sw + 'px ／ 紙 ' + j.papers.map((p) => p.join('×')).join(' ') + ' ／ ボタン ' + j.acts.map((a) => a.slice(0, 2).join('×')).join(' '));
  });

  await T('⑮ 3つの ボタンは 1つの 列（PDF だけ 塗り・印刷／Excel は 枠）／説明の 字は 月・会社の 選びの 上', async () => {
    const row = doc.querySelector('#scr-bill .bk-acts');
    const bs = [...row.children];
    eq(bs.map((b) => b.id).join(','), 'b-bk-pdf,b-bk-print,b-bk-xlsx', '★1つの 列に 3つ★');
    eq(bs.map((b) => b.className).join(','), 'btn-primary,btn-ghost,btn-ghost', '★塗り／枠★');
    const card = row.parentElement, kids = [...card.children];
    const hint = card.querySelector('.hint'), pick = card.querySelector('.bill-pick');
    ok(kids.indexOf(hint) >= 0 && kids.indexOf(hint) < kids.indexOf(pick) && kids.indexOf(pick) < kids.indexOf(row), '★説明→選び→ボタン の 順で ない★');
  });

  await T('⑯ 集計の「この月の集計だけExcelに」＝表と 同じ 数を 今の Excel の 出し口で（入金が 読めない時は 作らない）', async () => {
    doc.querySelector('#scr-bill [data-bseg="report"]').click(); await sleep(30);
    await kaeru('bk-rep-month', '2026-10');
    ok($('bk-rep-acts').style.display !== 'none', '★ボタンが 出ていない★');
    eq($('b-bk-rep-xlsx').textContent.trim(), 'この月の集計だけExcelに', 'ボタンの 字');
    rec.excel.length = 0;
    $('b-bk-rep-xlsx').click(); await sleep(30);
    ok($('fn-ov').classList.contains('open'), '★名前を 先に 見せていない★');
    eq($('fn-input').value, '月次集計_2026-10', '名前');
    $('fn-ok').click(); await sleep(60);
    eq(rec.excel.length, 1, '★今の Excel の 出し口を 通っていない★');
    const aoa = rec.excel[0].sheet.aoa;
    const s = A._reportForTest('2026-10');
    eq(aoa.length, s.rows.length + 2, '行の 数（見出し＋取引先＋合計）');
    s.rows.forEach((r, i) => eq(JSON.stringify(aoa[i + 1].slice(1, 6)), JSON.stringify([r.name, r.count, r.total, r.paid, r.remain]), '★' + r.name + ' の 数★'));
    eq(JSON.stringify(aoa[aoa.length - 1].slice(2, 6)), JSON.stringify([s.totals.count, s.totals.total, s.totals.paid, s.totals.remain]), '★合計の 行★');
    ok(aoa.slice(1).every((x) => typeof x[3] === 'number'), '★金額が 字に なっている（足し算できない）★');
    console.log('     ' + rec.excel[0].name + ' ／ ' + aoa.length + '行');
    const keep = S.receipts; S.receipts = null; A._go('scr-bill'); doc.querySelector('#scr-bill [data-bseg="report"]').click(); await sleep(30);
    rec.excel.length = 0;
    $('b-bk-rep-xlsx').click(); await sleep(30);
    ok(!$('fn-ov').classList.contains('open') && !rec.excel.length, '★入金が 読めないのに 作った★');
    ok(/入金が 読めていない/.test(txt('bk-rep-err')), '★作らない 訳を 言っていない★: ' + txt('bk-rep-err'));
    S.receipts = keep; A._go('scr-bill');
    ok(!txt('bk-rep-err') || $('bk-rep-err').style.display === 'none', '★読めるように なったのに 古い「読めていない」が 残っている★: ' + txt('bk-rep-err'));
    doc.querySelector('#scr-bill [data-bseg="invoice"]').click(); await sleep(30);
  });

  for (const W of [390, 320]) await T('⑬-b ' + W + 'px の 集計で 7〜9桁の 金額でも 字が 切れない・はみ出さない（本物の Chrome・taiketsu 10-24 止3）', async () => {
    doc.querySelector('#scr-bill [data-bseg="report"]').click(); await sleep(30);
    await kaeru('bk-rep-month', '2026-08');
    const j = await measureShape(doc, W);
    ok(j.sums.length === 3 && j.sums[0].indexOf('126,145,921') >= 0, '★大きい 月が 出ていない★ ' + j.sums.join(' / '));
    ok(!j.clip.length, '★字が 切れている★ ' + j.clip.join(' / '));
    ok(j.sw <= W && !j.over.length, '★はみ出した★ ' + j.sw + ' ' + j.over.join(' / '));
    console.log('     ' + W + 'px 枠 … ' + j.sums.join(' ／ '));
    await kaeru('bk-rep-month', '2026-10');
    doc.querySelector('#scr-bill [data-bseg="invoice"]').click(); await sleep(30);
  });

  await T('⑭ 押して 回っても JS が 1つも 落ちない', async () => {
    eq(errs.filter((e) => !/ブラウザの印刷/.test(e)).length, 0, 'JSが 落ちた: ' + errs.join(' | '));
  });

  if (SHOT) {
    /* ★絵★ 請求書（全社）・請求書（1社）・集計 */
    doc.querySelector('#scr-bill [data-bseg="invoice"]').click(); await sleep(30);
    await kaeru('bk-partner', '');
    await shoot(doc, SHOT + '-zensha.png');
    await shoot(doc, SHOT + '-zensha-320.png', 320);
    await kaeru('bk-partner', 'p1');
    await shoot(doc, SHOT + '-1sha.png');
    await kaeru('bk-partner', '');
    doc.querySelector('#scr-bill [data-bseg="report"]').click(); await sleep(30);
    await shoot(doc, SHOT + '-shuukei.png');
    await shoot(doc, SHOT + '-shuukei-320.png', 320);
    console.log('     絵 … ' + SHOT + '-{zensha,zensha-320,1sha,shuukei,shuukei-320}.png');
  }
}

if (!SELF) {
  await run('本物の seikyu-app.js');
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
} else {
  /* ★わざと壊す★ … 下書きも 紙に 出す姿へ 戻すと 赤になるか（いちばん 高くつく 型） */
  console.log('\n★自己診断★ … 下書きも 出す姿へ 戻して 赤が 出るかを 見る');
  const keep = fs.readFileSync(APP, 'utf8');
  const mark = "return v && (v.doc_type || 'invoice') === 'invoice' && v.status === 'issued';";
  if (keep.split(mark).length !== 2) { console.log('  ★壊す場所が 1つ 見つからない＝この自己診断は 古い★'); process.exit(2); }
  await run('下書きも 出す seikyu-app.js（わざと壊した）',
    keep.replace(mark, "return v && (v.doc_type || 'invoice') === 'invoice' && v.status !== 'void';"));
  const nige = fail >= 1 ? 0 : 1;
  console.log('\n  わざと壊した時に 赤になった数 … ' + fail + '件（1件以上のはず）');
  console.log(nige ? '  ✗ ★空振りです★ 壊しても赤にならない' : '  ✓ ★壊したら赤になった＝この試験は本当に見張っています★');
  /* ★約束の 行★（tools/_bunrui.mjs が 最初に 読む）＝わざと 壊した 回の ✗ は 狙った 赤。数は「壊して 赤に なった 回／空振り」 */
  console.log('KEKKA {"passed":' + (nige ? 0 : 1) + ',"failed":' + nige + ',"mimiso":0}');
  process.exit(nige ? 1 : 0);
}
