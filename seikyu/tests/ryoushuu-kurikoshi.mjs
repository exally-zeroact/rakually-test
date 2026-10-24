/* ryoushuu-kurikoshi.mjs — ★源泉の ある 領収書（全額・印紙）と 繰越の 連鎖★
 * =============================================================================
 * 司さんの 決め（2026-10-24 朝「法律的に最適解で」）の 続き（taiketsu 10-24 の 止め）
 *   ① 源泉の 注記「源泉徴収税額 X円 差引」は「払う額を 全部 受け取ったか」だけで 決める
 *      （消費税を 区分して 書くかの 判定とは 別＝消費税 0 の 免税の 相手でも 出す）
 *
 * ★本物の seikyu-app.js を jsdom で 動かし、本物の 領収書の 紙（PAPER.build）の 字を 読む★
 *   ＝入力の 画面の 入金の 行の「送る」を 押す（お客さんと 同じ 道）。PDF の 作りは 控えるだけ。
 *
 * 使い方: node seikyu/tests/ryoushuu-kurikoshi.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdom が 入っていません。飛ばせません（SKIPを緑と呼ばない）。'); process.exit(1); }
const SELF = process.argv.includes('--self-test');
const FILE = path.join(ROOT, 'seikyu/index.html');
const APP = path.join(ROOT, 'seikyu/js/seikyu-app.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' … 期待 ' + JSON.stringify(b) + ' / 実際 ' + JSON.stringify(a)); };
const T = async (n, f) => { try { await f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const num = (s) => { const m = /(-?)[¥￥]?\s*([\d,]+)/.exec(String(s || '')); return m ? Number((m[1] || '') + m[2].replace(/,/g, '')) : null; };
const plain = (h) => String(h || '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const line = (name, kin, rate) => ({ name, qty: '1', unit: '式', price: String(kin), amount: String(kin), rate: rate === undefined ? 10 : rate, memo: '' });
/** 発行済みの 1通（数は 整数で 渡す） */
function iv(id, pid, ymd, o) {
  return Object.assign({
    id, no: ymd.slice(0, 7).replace('-', '') + '-' + id, status: 'issued', doc_type: 'invoice', partner_id: pid, issue_ymd: ymd,
    tax_mode: 'exclusive', rounding: 'floor', lines: [line('報酬', o.sub, o.rate)], data: o.gensen ? { gensen: true } : {},
    totals: { subtotal: o.sub, taxTotal: o.tax, gross: o.sub + o.tax, deduct: 0, deductLines: [], grandTotal: o.sub + o.tax },
    snapshot: Object.assign({}, o.gensen ? { gensen: { base: o.sub, amount: o.gensen, net: o.sub + o.tax - o.gensen } } : {},
      o.carry ? { carry: o.carry } : {}),
  }, o.extra || {});
}

export async function boot(t, appSrc) {
  const html = fs.readFileSync(FILE, 'utf8');
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''),
    { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/seikyu/index.html' });
  const win = dom.window, doc = win.document;
  win.fetch = () => Promise.reject(new Error('no net')); win.scrollTo = () => {};
  win.alert = () => {}; win.confirm = () => true;
  for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
    const src = m[1].split('?')[0], base = src.split('/').pop();
    if (/^https?:/.test(src) || ['supa-config.js', 'auth.js', 'env-badge.js', 'rakunally-login.js'].indexOf(base) >= 0) continue;
    const p = path.resolve(path.dirname(FILE), src);
    if (!fs.existsSync(p)) continue;
    const el = doc.createElement('script');
    el.textContent = (base === 'seikyu-app.js' && appSrc) ? appSrc : fs.readFileSync(p, 'utf8');
    doc.body.appendChild(el);
  }
  await sleep(400);
  doc.getElementById('app').hidden = false;
  const A = win.SeikyuApp, S = A._state;
  S.partners = t.partners; S.fil = 'all'; S.docType = 'invoice';
  S.org = { yago: '合同会社Rakunally', addr: '東京都架空区見本台1-2-3', invoiceNo: 'T1234567890123', bank: '（見本）銀行 普通 1234567', invoiceCarry: true };
  S.store = {
    partners: { list: () => Promise.resolve(t.partners) },
    receipts: { list: () => Promise.resolve(t.receipts) },
    invoices: { list: (k) => Promise.resolve(JSON.parse(JSON.stringify(t.invoices.filter((v) => (v.doc_type || 'invoice') === (k || 'invoice'))))),
      usedNos: () => Promise.resolve([]) },
  };
  A._bindForTest();
  await A._loadList();
  let got = '';
  win.SeikyuPdf.build = (h) => { got = String(h); return Promise.resolve(new Uint8Array([1])); };
  win.SeikyuOut.pdfOpen = () => Promise.resolve({});
  /** ★入力の 画面の 入金の 行の「送る」を 押して 領収書の 紙を 得る★ */
  const ryoushuu = async (invId, rcId) => {
    got = '';
    A._go('scr-list'); A._renderListForTest();
    doc.querySelector('#list-body [data-open="' + invId + '"]').click(); await sleep(80);
    const b = doc.querySelector('[data-rcsend="' + rcId + '"]');
    ok(b, '領収書の ボタンが 無い ' + rcId);
    b.click(); await sleep(30); doc.getElementById('fn-ok').click(); await sleep(80);
    ok(got.length > 500, '★領収書の 紙が 作られていない★ ' + ((doc.getElementById('pay-err') || {}).textContent || ''));
    return got;
  };
  /** ★次の 1通（下書き）の 紙の 頭の 額★ */
  const tsugiAtama = (pid, ymd, sub, gensen) => {
    S.cur = { id: 'n-' + pid, no: '', status: 'draft', doc_type: 'invoice', partner_id: pid, issue_ymd: ymd,
      tax_mode: 'exclusive', rounding: 'floor', lines: [line('報酬', sub)], data: gensen ? { gensen: true } : {} };
    const h = A._paperHtml(); S.cur = null;
    return num((/<td class="grand-v">([^<]*)<\/td>/.exec(h) || [])[1]);
  };
  return { win, doc, A, S, ryoushuu, tsugiAtama };
}

async function run(label, appSrc) {
  console.log('\n[' + label + '] ★源泉の ある 領収書と 繰越の 連鎖★');
  const partners = ['H', 'S', 'N', 'E', 'F', 'G'].map((k, i) => ({ id: 'p' + k, sort: i, data: { name: '見本' + k + '商事', keisho: '御中' } }));
  const t = {
    partners,
    invoices: [
      /* ① 免税の 相手（消費税 0）・報酬 100,000・源泉 10,210 → 払う額 89,790 */
      iv('h', 'pH', '2026-10-05', { sub: 100000, tax: 0, rate: 0, gensen: 10210 }),
    ],
    receipts: [
      { id: 'rh', invoice_id: 'h', amount: 89790, ymd: '2026-10-31' },
    ],
  };
  const { ryoushuu } = await boot(t, appSrc);

  await T('① 免税の 相手（消費税 0）でも 払う額を 全部 受け取れば「源泉徴収税額 X円 差引」が 出る', async () => {
    const h = await ryoushuu('h', 'rh');
    eq(num((/<td class="grand-v">([^<]*)<\/td>/.exec(h) || [])[1]), 89790, '★領収の 額が 受け取った 額で ない★');
    ok(/源泉徴収税額 10,210円 差引/.test(plain(h)), '★免税の 相手で 源泉の 注記が 出ない★');
    ok(!/<th>消費税額等<\/th>/.test(h), '★消費税 0 なのに 消費税額を 区分して 書いた★');
  });
}

if (!SELF) {
  await run('本物の seikyu-app.js');
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
} else {
  const keep = fs.readFileSync(APP, 'utf8');
  const mark = 'gensen: zengaku ? gen : 0,';
  if (keep.split(mark).length !== 2) { console.log('  ★壊す所が 見つからない＝この自己診断は 古い★'); process.exit(2); }
  await run('源泉の 注記を 消費税の 判定に 縛る（わざと 壊した）', keep.replace(mark, 'gensen: whole ? gen : 0,'));
  console.log('\n  わざと壊した時に 赤になった数 … ' + fail + '件（1件以上のはず）');
  process.exit(fail >= 1 ? 0 : 1);
}
