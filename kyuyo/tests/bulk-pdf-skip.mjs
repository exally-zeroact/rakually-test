/* bulk-pdf-skip.mjs — ★会社の一括PDFで 1人分の描画が失敗したら 黙って抜けさせない★（2026-10-08 ダイコメ横断(b)5）
 * =============================================================================
 * ★守る事★
 *   #b-print（会社が 全員分を 一括でPDFにする道）は、前は 1人分の html2canvas が失敗すると
 *   `.catch(function(){ i++; next(); })` で ★黙って その人のページを 飛ばし★、会社が ★1人欠けたPDF★ を
 *   気づかず 配れた（顧客側 meisai.js は 失敗を出すのに 会社一括側だけ 無警告＝非対称）。
 *   直し＝欠けた人数(ng)を 必ず uiAlert で 出す／全員失敗なら 空PDFを 開かない／
 *   addPage判定を i>0→wrote>0 に（前の人が失敗しても 空白の先頭ページを作らない）。★金額・保存・焼くページは変えない★。
 * ★この歯が 見る事（本物の #b-print ハンドラを jsdom で クリック）★
 *   html2canvas/jspdf/open をスタブ。①3人中1人失敗→載せた2枚・開く1回・⚠「1人分…」が出る
 *   ②全員失敗→載せ0・★開かない★・「すべて失敗」が出る ③先頭失敗→空白先頭ページ無し(addPage=成功-1)。
 * ★わざと戻すと赤（load-bearing）★… 旧コード(黙って飛ばす・無条件open)に戻すと ①は⚠が出ず赤・②は開いて赤。
 * 依存: jsdom。使い方: node kyuyo/tests/bulk-pdf-skip.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let JSDOM;
try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません（SKIPを緑と呼ばない）。npm install してください。'); process.exit(1); }

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1].replace(/\?.*$/, ''))
  .filter((s) => !/^https?:/.test(s) && !/supabase|supa-config|auth/.test(s));
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
const win = dom.window, doc = win.document;
win.fetch = () => Promise.reject(new Error('no net'));
win.print = () => {};
for (const src of srcs) { const el = doc.createElement('script'); el.textContent = fs.readFileSync(path.join(ROOT, src), 'utf8'); doc.body.appendChild(el); }

let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };
const sleep = (ms) => new Promise((r) => win.setTimeout(r, ms));

const A = win.__PAYSLIP_TEST;
if (!A) { console.log('✗ ★__PAYSLIP_TEST が 取れない（init失敗）★'); process.exit(1); }
const btn = doc.querySelector('#b-print');
const frame = doc.querySelector('#frame');
if (!btn || !frame) { console.log('✗ ★#b-print か #frame が 無い★'); process.exit(1); }

/* ── スタブ（html2canvas/jspdf/open/URL）──
   html2canvas … data-fail="1" のページだけ reject。他は 偽canvasを resolve。 */
const calls = { addImage: 0, addPage: 0, open: 0, save: 0, output: 0 };
win.html2canvas = (el) => (el && el.getAttribute && el.getAttribute('data-fail') === '1')
  ? Promise.reject(new Error('わざと失敗'))
  : Promise.resolve({ width: 794, height: 1123, toDataURL: () => 'data:image/jpeg;base64,xx' });
win.jspdf = { jsPDF: function () {
  this.addPage = function () { calls.addPage++; };
  this.addImage = function () { calls.addImage++; };
  this.output = function () { calls.output++; return 'BLOBDATA'; };
  this.save = function () { calls.save++; };
} };
win.URL.createObjectURL = () => 'blob:x';
win.URL.revokeObjectURL = () => {};
win.open = function () { calls.open++; return {}; };   /* truthy＝saveフォールバックに落ちない */

const idoc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
if (!idoc) { console.log('✗ ★#frame の 中の doc が 取れない★'); process.exit(1); }

function modalText() {
  return Array.from(doc.querySelectorAll('.ui-modal-b')).map((e) => (e.textContent || '')).join(' | ');
}
function clearModals() { Array.from(doc.querySelectorAll('.ui-modal-ov')).forEach((o) => o.remove()); }

/* N枚のページを #frame に置く（fail=失敗させる番号の集合）。全部 .sheet にする。 */
function setPages(n, failSet) {
  idoc.body.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const d = idoc.createElement('div');
    d.className = 'sheet';
    if (failSet && failSet.has(i)) d.setAttribute('data-fail', '1');
    idoc.body.appendChild(d);
  }
}

async function runPrint(n, failSet) {
  calls.addImage = 0; calls.addPage = 0; calls.open = 0; calls.save = 0; calls.output = 0;
  clearModals();
  setPages(n, failSet);
  btn.dispatchEvent(new win.Event('click', { bubbles: true }));
  /* 非同期の html2canvas 連鎖が 終わるまで 待つ（開く or モーダルが 出る or 打ち切り） */
  for (let k = 0; k < 60; k++) {
    await sleep(5);
    if (calls.open > 0 || /失敗|抜けています/.test(modalText())) break;
  }
  await sleep(10);
}

console.log('\n[bulk-pdf-skip] 会社の一括PDFで 1人分の失敗を 黙らせない');

/* ① 3人中 1人(真ん中)失敗＝残り2枚が出て ⚠警告 */
await runPrint(3, new Set([1]));
T('① 3人中1人失敗＝成功2枚を載せる', calls.addImage === 2, 'addImage=' + calls.addImage);
T('① 成功が在れば PDFを開く（1回）', calls.open === 1, 'open=' + calls.open);
T('① ★欠けた1人分の ⚠警告が 出る（黙らせない）★', /1人分の明細をPDFにできませんでした/.test(modalText()), 'modal=' + modalText().slice(0, 80));

/* ② 全員(3人)失敗＝空PDFを 開かない・「すべて失敗」を出す */
await runPrint(3, new Set([0, 1, 2]));
T('② 全員失敗＝1枚も載せない', calls.addImage === 0, 'addImage=' + calls.addImage);
T('② ★全員失敗なら 空PDFを 開かない★', calls.open === 0, 'open=' + calls.open);
T('② 「すべて失敗」を 出す', /すべて失敗/.test(modalText()), 'modal=' + modalText().slice(0, 80));

/* ③ 先頭の人が失敗＝残り2枚・空白の先頭ページを 作らない（addPage=成功-1=1） */
await runPrint(3, new Set([0]));
T('③ 先頭失敗でも 成功2枚を載せる', calls.addImage === 2, 'addImage=' + calls.addImage);
T('③ ★空白の先頭ページを 作らない（addPage=成功-1=1）★', calls.addPage === 1, 'addPage=' + calls.addPage);
T('③ 先頭失敗でも 欠け1人の ⚠警告が 出る', /1人分の明細をPDFにできませんでした/.test(modalText()), 'modal=' + modalText().slice(0, 80));

/* ④ 全員成功＝前と同じ（警告なし・開く1回・addPage=人数-1） */
await runPrint(3, new Set());
T('④ 全員成功＝3枚載せる', calls.addImage === 3, 'addImage=' + calls.addImage);
T('④ 全員成功＝開く1回・欠け警告なし', calls.open === 1 && !/失敗|抜けています/.test(modalText()), 'open=' + calls.open + ' modal=' + modalText().slice(0, 60));
T('④ 全員成功＝addPage=人数-1=2（空白ページ無し）', calls.addPage === 2, 'addPage=' + calls.addPage);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('KEKKA {"passed":' + pass + ',"failed":' + fail + ',"mimiso":0}');
process.exit(fail ? 1 : 0);
