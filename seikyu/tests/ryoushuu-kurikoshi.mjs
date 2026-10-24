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
const REPF = path.join(ROOT, 'seikyu/lib/seikyu-report.js');
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

export async function boot(t, appSrc, repSrc) {
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
    el.textContent = (base === 'seikyu-app.js' && appSrc) ? appSrc : (base === 'seikyu-report.js' && repSrc) ? repSrc : fs.readFileSync(p, 'utf8');
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

async function run(label, appSrc, repSrc) {
  console.log('\n[' + label + '] ★源泉の ある 領収書と 繰越の 連鎖★');
  const partners = ['H', 'S', 'N', 'E', 'F', 'G', 'J', 'K', 'L', 'M', 'Q', 'R', 'U', 'V', 'W', 'X', 'Y', 'A', 'B', 'C', 'D', 'I', 'O', 'G1', 'G2', 'G4', 'G10', 'S3', 'G15', 'Z0', 'Z', 'ZR', 'ZH', 'ZC'].map((k, i) => ({ id: 'p' + k, sort: i, data: { name: '見本' + k + '商事', keisho: '御中' } }));
  const t = {
    partners,
    invoices: [
      /* ① 免税の 相手（消費税 0）・報酬 100,000・源泉 10,210 → 払う額 89,790 */
      iv('h', 'pH', '2026-10-05', { sub: 100000, tax: 0, rate: 0, gensen: 10210 }),
      /* ② 印紙の 境（税抜 50,000・税 5,000・源泉 5,105 → 払う額 49,895）／源泉なし／5万未満 */
      iv('s1', 'pS', '2026-10-06', { sub: 50000, tax: 5000, gensen: 5105 }),
      iv('s2', 'pS', '2026-10-07', { sub: 50000, tax: 5000 }),
      iv('s3', 'pS', '2026-10-08', { sub: 40000, tax: 4000, gensen: 4084 }),
      /* ③ 繰越の 連鎖（9月 未入金 → 10月の 紙に 繰越 → 10月の 紙に 払う → 11月） */
      iv('e9', 'pE', '2026-09-10', { sub: 30000, tax: 3000 }),
      iv('e10', 'pE', '2026-10-10', { sub: 30000, tax: 3000,
        carry: { state: 'ok', prevNo: '202609-e9', prevTotal: 33000, paid: 0, carry: 33000, thisTotal: 33000, grandTotal: 66000 } }),
      iv('f9', 'pF', '2026-09-10', { sub: 30000, tax: 3000 }),           // 一部だけ 払った
      iv('f10', 'pF', '2026-10-10', { sub: 30000, tax: 3000,
        carry: { state: 'ok', prevNo: '202609-f9', prevTotal: 33000, paid: 0, carry: 33000, thisTotal: 33000, grandTotal: 66000 } }),
      iv('g9', 'pG', '2026-09-10', { sub: 100000, tax: 10000, gensen: 10210 }),   // 源泉の ある 相手（払う額 99,790）
      iv('g10', 'pG', '2026-10-10', { sub: 100000, tax: 10000, gensen: 10210,
        carry: { state: 'ok', prevNo: '202609-g9', prevTotal: 99790, paid: 0, carry: 99790, thisTotal: 110000, grandTotal: 209790 } }),
      /* ⑤ 帳簿 1つ（2026-10-24 指示役の 決め）の 場面 */
      iv('j9', 'pJ', '2026-09-10', { sub: 30000, tax: 3000 }),           // 止1：9月の 紙に 9月分・10月の 紙に 10月分を 記録
      iv('j10', 'pJ', '2026-10-10', { sub: 30000, tax: 3000, carry: { state: 'ok', prevNo: '202609-j9', prevTotal: 0, paid: 0, carry: 33000, thisTotal: 33000, grandTotal: 66000 } }),
      iv('k9', 'pK', '2026-09-10', { sub: 30000, tax: 3000 }),           // 止2：66,000 入金 → −66,000 返金
      iv('k10', 'pK', '2026-10-10', { sub: 30000, tax: 3000, carry: { state: 'ok', prevNo: '202609-k9', prevTotal: 0, paid: 0, carry: 33000, thisTotal: 33000, grandTotal: 66000 } }),
      iv('l9', 'pL', '2026-09-10', { sub: 30000, tax: 3000 }),           // 止3：9月に 43,000（10,000 多い）
      iv('l10', 'pL', '2026-10-10', { sub: 30000, tax: 3000, carry: { state: 'over', prevNo: '202609-l9', prevTotal: 0, paid: 0, carry: -10000, thisTotal: 33000, grandTotal: 23000 } }),
      iv('m8', 'pM', '2026-08-10', { sub: 30000, tax: 3000 }),           // 3か月の 連鎖
      iv('m9', 'pM', '2026-09-10', { sub: 30000, tax: 3000, carry: { state: 'ok', prevNo: '202608-m8', prevTotal: 0, paid: 0, carry: 33000, thisTotal: 33000, grandTotal: 66000 } }),
      iv('m10', 'pM', '2026-10-10', { sub: 30000, tax: 3000, carry: { state: 'ok', prevNo: '202609-m9', prevTotal: 0, paid: 0, carry: 66000, thisTotal: 33000, grandTotal: 99000 } }),
      iv('q9', 'pQ', '2026-09-10', { sub: 30000, tax: 3000 }),           // 一部を 先に 払う
      iv('q10', 'pQ', '2026-10-10', { sub: 30000, tax: 3000, carry: { state: 'ok', prevNo: '202609-q9', prevTotal: 0, paid: 0, carry: 23000, thisTotal: 33000, grandTotal: 56000 } }),
      iv('r9', 'pR', '2026-09-10', { sub: 30000, tax: 3000 }),           // 消した 入金
      /* ⑥ taiketsu 10-24 3回目の 止め */
      iv('u9', 'pU', '2026-09-10', { sub: 30000, tax: 3000 }),           // 止2：後から 9/30 付けの 請求漏れの 紙
      iv('u10', 'pU', '2026-10-10', { sub: 30000, tax: 3000, carry: { state: 'ok', prevNo: '202609-u9', prevTotal: 33000, paid: 0, carry: 33000, thisTotal: 33000, grandTotal: 66000 } }),
      iv('v9', 'pV', '2026-09-10', { sub: 30000, tax: 3000 }),           // 止3：マイナスの 請求書（赤伝）−11,000
      iv('vm', 'pV', '2026-09-20', { sub: -10000, tax: -1000 }),
      /* ⑦ taiketsu 10-24 4回目の 止め */
      iv('w9', 'pW', '2026-09-10', { sub: 30000, tax: 3000 }),           // 止A：9月を 払い終わった 後の 10月の 赤伝
      iv('w10', 'pW', '2026-10-10', { sub: 30000, tax: 3000 }),
      iv('wm', 'pW', '2026-10-20', { sub: -10000, tax: -1000 }),
      iv('x9', 'pX', '2026-09-10', { sub: 30000, tax: 3000 }),           // 止B：払い終わった 後に 赤伝＝返す 額が ある
      iv('xm', 'pX', '2026-09-20', { sub: -10000, tax: -1000 }),
      iv('y9', 'pY', '2026-09-10', { sub: 30000, tax: 3000 }),           // 止C：繰越を 切で 3通 発行（繰越の 写し 無し）
      iv('y10', 'pY', '2026-10-10', { sub: 30000, tax: 3000 }),
      iv('y11', 'pY', '2026-11-10', { sub: 30000, tax: 3000 }),
      /* ⑨ taiketsu 10-24 5回目の 止め */
      iv('a9', 'pA', '2026-09-10', { sub: 30000, tax: 3000 }),           // 止1：同じ 日の 赤伝が 先の 番号（202610-a1m ＜ 202610-a2）
      iv('a1m', 'pA', '2026-10-31', { sub: -10000, tax: -1000 }),
      iv('a2', 'pA', '2026-10-31', { sub: 20000, tax: 2000 }),
      iv('bm', 'pB', '2026-09-20', { sub: -10000, tax: -1000 }),        // 止2：引ける 紙の 無い 赤伝
      iv('c9', 'pC', '2026-09-10', { sub: 30000, tax: 3000 }),           // 別件：未入金の 請求書が ある 相手の 見積書
      /* ⑩ taiketsu 10-24 6回目（赤伝の 決まりを 1つに まとめ直した） */
      iv('d9', 'pD', '2026-09-10', { sub: 30000, tax: 3000 }),           // 止A：月の 途中の 赤伝（10/15）・後の 10/31 の 紙
      iv('dm', 'pD', '2026-10-15', { sub: -10000, tax: -1000 }),
      iv('d10', 'pD', '2026-10-31', { sub: 30000, tax: 3000 }),
      iv('im', 'pI', '2026-09-20', { sub: -10000, tax: -1000 }),        // 止C：赤伝に 返金した 後の 10月の 紙
      iv('i10', 'pI', '2026-10-31', { sub: 30000, tax: 3000 }),
      iv('om', 'pO', '2026-08-20', { sub: -10000, tax: -1000 }),        // どの 紙より 古い 赤伝 → 後の 紙から 引く
      iv('o9', 'pO', '2026-09-10', { sub: 30000, tax: 3000 }),
      /* ⑪ taiketsu 10-24 7回目＝月を またぐ 赤伝で 集計の 月の 行と 一覧が 割れない */
      iv('g1m', 'pG1', '2026-09-20', { sub: -10000, tax: -1000 }),      // G1：9月の 赤伝・10月の 紙に 赤伝を 引いて 22,000
      iv('g1a', 'pG1', '2026-10-10', { sub: 30000, tax: 3000 }),
      iv('g2a', 'pG2', '2026-09-10', { sub: 30000, tax: 3000 }),         // G2：9月 払い終わり・10月は 赤伝だけ・その 赤伝に 返金
      iv('g2m', 'pG2', '2026-10-15', { sub: -10000, tax: -1000 }),
      iv('g4m', 'pG4', '2026-09-20', { sub: -10000, tax: -1000 }),      // G4：9月 赤伝・10月 全部 払う・11月 未入金
      iv('g4a', 'pG4', '2026-10-10', { sub: 30000, tax: 3000 }),
      iv('g4b', 'pG4', '2026-11-10', { sub: 30000, tax: 3000 }),
      iv('g10a', 'pG10', '2026-09-10', { sub: 30000, tax: 3000 }),       // G10：9月 払い終わり・10/15 赤伝だけ・11月に 22,000
      iv('g10m', 'pG10', '2026-10-15', { sub: -10000, tax: -1000 }),
      iv('g10b', 'pG10', '2026-11-10', { sub: 30000, tax: 3000 }),
      iv('s3a', 'pS3', '2026-09-10', { sub: 30000, tax: 3000 }),         // S3：9月に 22,000・10/05 の 赤伝
      iv('s3m', 'pS3', '2026-10-05', { sub: -10000, tax: -1000 }),
      iv('g15a', 'pG15', '2026-10-10', { sub: 30000, tax: 3000 }),       // G15：同じ 月の 赤伝・入金 0
      iv('g15m', 'pG15', '2026-10-20', { sub: -10000, tax: -1000 }),
      iv('z0', 'pZ0', '2026-10-12', { sub: 0, tax: 0 }),                 // ⑫ 0円の 紙（入金 なし）
      /* ⑧ 取り消した 紙に 残った 入金（司さん 10-24「選べるようにしろ」・既定は 充てる） */
      iv('z8', 'pZ', '2026-08-10', { sub: 30000, tax: 3000 }),
      iv('z9', 'pZ', '2026-09-10', { sub: 30000, tax: 3000, extra: { status: 'void' } }),
      iv('zr8', 'pZR', '2026-08-10', { sub: 30000, tax: 3000 }),        // 取り消した 9月の 入金を 8月の 紙で 返金した
      iv('zr9', 'pZR', '2026-09-10', { sub: 30000, tax: 3000, extra: { status: 'void' } }),
      iv('zh8', 'pZH', '2026-08-10', { sub: 30000, tax: 3000 }),        // 取り消す 前の 9月の 紙で 8月の 多い 分まで まとめて 返した（正味 マイナス）
      iv('zh9', 'pZH', '2026-09-10', { sub: 30000, tax: 3000, extra: { status: 'void' } }),
      iv('zc8', 'pZC', '2026-08-10', { sub: 30000, tax: 3000 }),        // 取り消した 紙の 上で 全部 返した（正味 0）＋8月の 多い 分の 返金
      iv('zc9', 'pZC', '2026-09-10', { sub: 30000, tax: 3000, extra: { status: 'void' } }),
    ],
    receipts: [
      { id: 'rh', invoice_id: 'h', amount: 89790, ymd: '2026-10-31' },
      { id: 'rs1', invoice_id: 's1', amount: 49895, ymd: '2026-10-31' },
      { id: 'rs2', invoice_id: 's2', amount: 55000, ymd: '2026-10-31' },
      { id: 'rs3', invoice_id: 's3', amount: 39916, ymd: '2026-10-31' },
      { id: 're10', invoice_id: 'e10', amount: 66000, ymd: '2026-10-31' },    // 10月の 紙の ご請求金額を 全部
      { id: 'rf10', invoice_id: 'f10', amount: 40000, ymd: '2026-10-31' },    // 66,000 の うち 40,000 だけ
      { id: 'rg10', invoice_id: 'g10', amount: 199580, ymd: '2026-10-31' },   // 209,790 − 源泉 10,210
      { id: 'rj9', invoice_id: 'j9', amount: 33000, ymd: '2026-10-20' },
      { id: 'rj10', invoice_id: 'j10', amount: 33000, ymd: '2026-10-31' },
      { id: 'rk1', invoice_id: 'k10', amount: 66000, ymd: '2026-10-20' },
      { id: 'rk2', invoice_id: 'k10', amount: -66000, ymd: '2026-10-25' },
      { id: 'rl9', invoice_id: 'l9', amount: 43000, ymd: '2026-09-20' },
      { id: 'rl10', invoice_id: 'l10', amount: 23000, ymd: '2026-10-31' },
      { id: 'rm10', invoice_id: 'm10', amount: 99000, ymd: '2026-10-31' },
      { id: 'rq9', invoice_id: 'q9', amount: 10000, ymd: '2026-09-20' },
      { id: 'rq10', invoice_id: 'q10', amount: 56000, ymd: '2026-10-31' },
      { id: 'rr9', invoice_id: 'r9', amount: 33000, ymd: '2026-09-20', deleted_at: '2026-09-21' },
      { id: 'ru10', invoice_id: 'u10', amount: 66000, ymd: '2026-10-20' },
      { id: 'rv9', invoice_id: 'v9', amount: 22000, ymd: '2026-09-25' },
      { id: 'rw9', invoice_id: 'w9', amount: 33000, ymd: '2026-09-25' },
      { id: 'rw10', invoice_id: 'w10', amount: 22000, ymd: '2026-10-25' },
      { id: 'rx9', invoice_id: 'x9', amount: 33000, ymd: '2026-09-15' },
      { id: 'ra9', invoice_id: 'a9', amount: 33000, ymd: '2026-09-25' },
      { id: 'ra2', invoice_id: 'a2', amount: 11000, ymd: '2026-11-20' },
      { id: 'rd9', invoice_id: 'd9', amount: 33000, ymd: '2026-09-25' },
      { id: 'rd10', invoice_id: 'd10', amount: 22000, ymd: '2026-11-20' },
      { id: 'rim', invoice_id: 'im', amount: -11000, ymd: '2026-09-28' },
      { id: 'ro9', invoice_id: 'o9', amount: 22000, ymd: '2026-09-25' },
      { id: 'rg1', invoice_id: 'g1a', amount: 22000, ymd: '2026-10-31' },
      { id: 'rg2', invoice_id: 'g2a', amount: 33000, ymd: '2026-09-25' },
      { id: 'rg2m', invoice_id: 'g2m', amount: -11000, ymd: '2026-10-20' },
      { id: 'rg4', invoice_id: 'g4a', amount: 33000, ymd: '2026-10-25' },
      { id: 'rg10a', invoice_id: 'g10a', amount: 33000, ymd: '2026-09-25' },
      { id: 'rg10b', invoice_id: 'g10b', amount: 22000, ymd: '2026-11-20' },
      { id: 'rs3', invoice_id: 's3a', amount: 22000, ymd: '2026-09-25' },
      { id: 'rz8', invoice_id: 'z8', amount: 33000, ymd: '2026-08-25' },
      { id: 'rz9', invoice_id: 'z9', amount: 33000, ymd: '2026-09-25' },
      { id: 'rzr8', invoice_id: 'zr8', amount: 33000, ymd: '2026-08-25' },
      { id: 'rzr9', invoice_id: 'zr9', amount: 33000, ymd: '2026-09-25' },
      { id: 'rzrb', invoice_id: 'zr8', amount: -33000, ymd: '2026-09-30' },
      { id: 'rzh8', invoice_id: 'zh8', amount: 44000, ymd: '2026-08-25' },
      { id: 'rzh9', invoice_id: 'zh9', amount: 33000, ymd: '2026-09-25' },
      { id: 'rzh9b', invoice_id: 'zh9', amount: -44000, ymd: '2026-09-30' },
      { id: 'rzc8', invoice_id: 'zc8', amount: 44000, ymd: '2026-08-25' },
      { id: 'rzc8b', invoice_id: 'zc8', amount: -11000, ymd: '2026-08-30' },
      { id: 'rzc9', invoice_id: 'zc9', amount: 33000, ymd: '2026-09-25' },
      { id: 'rzc9b', invoice_id: 'zc9', amount: -33000, ymd: '2026-09-28' },
    ],
  };
  const { ryoushuu, tsugiAtama, A, doc, S } = await boot(t, appSrc, repSrc);

  await T('① 免税の 相手（消費税 0）でも 払う額を 全部 受け取れば「源泉徴収税額 X円 差引」が 出る', async () => {
    const h = await ryoushuu('h', 'rh');
    eq(num((/<td class="grand-v">([^<]*)<\/td>/.exec(h) || [])[1]), 89790, '★領収の 額が 受け取った 額で ない★');
    ok(/源泉徴収税額 10,210円 差引/.test(plain(h)), '★免税の 相手で 源泉の 注記が 出ない★');
    ok(!/<th>消費税額等<\/th>/.test(h), '★消費税 0 なのに 消費税額を 区分して 書いた★');
  });

  /* ② 印紙（司さんの 決め＝安全側）＝源泉の 前の 額（刷る 税抜金額）でも 後の 額でも どちらかが 5万円 以上なら 注意。
     どの 額で 5万円 以上に なったかを 字で 言う。刷る 額と 判定に 渡す 額は 同じ 材料から。 */
  await T('② 税抜 50,000・税 5,000・源泉 5,105（49,895 受取）＝紙の 税抜金額 50,000 と 同じ 額で「源泉を差し引く前の額では…」の 注意', async () => {
    const h = plain(await ryoushuu('s1', 'rs1'));
    ok(/税抜金額 ¥?50,000/.test(h), '★刷った 税抜金額が 50,000 で ない★ ' + (h.match(/税抜金額.{0,20}/) || [''])[0]);
    ok(/源泉を差し引く前の額（50,000円）では5万円以上です/.test(h), '★源泉の 前の 額で 5万円 以上なのに 印紙の 注意が 出ない★');
    ok(/税務署か税理士に確かめてください/.test(h), '★確かめる 先を 言っていない★');
  });
  await T('② 源泉なしの 税抜 50,000 は 今までどおりの 注意／5万円 未満（源泉の 前でも 40,000）は 出さない', async () => {
    const h2 = plain(await ryoushuu('s2', 'rs2'));
    ok(/万円以上の受取書には収入印紙が要る場合があります/.test(h2), '★源泉なしの 50,000 で 今までの 注意が 出ない★');
    ok(!/源泉を差し引く前/.test(h2), '★源泉が 無いのに 源泉の 字を 出した★');
    const h3 = plain(await ryoushuu('s3', 'rs3'));
    ok(!/収入印紙|印紙が要るか/.test(h3), '★5万円 未満なのに 印紙の 注意を 出した★');
  });

  /* ③ 繰越の 連鎖（taiketsu 10-24 穴3）＝前回の 額は 前回の 紙の ご請求金額（刷った 繰越 込み）で 数える。
     入金の 状態は 繰越を 含んだ 紙への 入金を 前の 月の 未入金に 充てた 後で 言う。 */
  const joutai = (id) => {
    A._go('scr-list'); A._renderListForTest();
    const b = doc.querySelector('#list-body [data-look="' + id + '"]');
    const c = b && b.closest('.iv-card');
    const t2 = ((c && c.textContent) || '').replace(/\s+/g, ' ');
    return ['過入金', '一部入金', '入金済', '未入金'].find((w) => t2.indexOf(w) >= 0) || '（無い）';
  };
  await T('③ 9月 未入金 → 10月の 紙（66,000）を 全部 払う → 11月の 紙に 繰越は 無い（−22,000 に ならない）・9月も 10月も 入金済', async () => {
    eq(tsugiAtama('pE', '2026-11-05', 10000), 11000, '★11月の 紙の ご請求金額★');
    eq(joutai('e9'), '入金済', '★9月が 未入金の まま★');
    eq(joutai('e10'), '入金済', '★10月が 過入金★');
  });
  await T('③ 一部だけ 払った（66,000 の うち 40,000）→ 11月の 紙は 繰越 26,000＋今回・9月 入金済・10月 一部入金', async () => {
    eq(tsugiAtama('pF', '2026-11-05', 10000), 37000, '★11月の 紙の ご請求金額★');
    eq(joutai('f9'), '入金済', '★前の 月に 先に 充てていない★');
    eq(joutai('f10'), '一部入金', '★10月の 状態★');
  });
  /* ④ 繰越を 含む 紙の 領収書（2026-10-24 指示役の 決め）＝「全額」は その 紙の ご請求金額（刷った 繰越 込み）と 比べる。
     消費税額は 今回の 1通分だけ（前の 月の 分は 前の 月の 紙に 書いてある）＝前回からの 繰越を 1行 分けて 書く。 */
  await T('④ 繰越を 含む 紙（66,000）を 全部 払った 領収書は 全額＝繰越を 分けて 今回分の 税抜・消費税を 書く', async () => {
    const h = await ryoushuu('e10', 're10');
    eq(num((/<td class="grand-v">([^<]*)<\/td>/.exec(h) || [])[1]), 66000, '領収の 額');
    ok(/<th>消費税額等<\/th>/.test(h), '★繰越を 含む 紙を 全部 払ったのに 全額に ならない★');
    const p = plain(h);
    ok(/前回からの繰越 ¥?33,000/.test(p), '★前回からの 繰越を 分けて 書いていない★ ' + (p.match(/前回.{0,30}/) || [''])[0]);
    ok(/今回分 税抜金額 ¥?30,000/.test(p) && /消費税額等 ¥?3,000/.test(p), '★今回分の 税抜・消費税が 違う★ ' + (p.match(/今回分.{0,60}/) || [''])[0]);
  });
  await T('④ 一部だけ（66,000 の うち 40,000）払った 領収書は 全額に ならない（消費税を 区分して 書かない）', async () => {
    const h = await ryoushuu('f10', 'rf10');
    eq(num((/<td class="grand-v">([^<]*)<\/td>/.exec(h) || [])[1]), 40000, '領収の 額');
    ok(!/<th>消費税額等<\/th>/.test(h) && !/前回からの繰越/.test(plain(h)), '★一部なのに 全額の 書き方を した★');
  });
  await T('④ 源泉の ある 相手（差引 199,580 を 全部）＝全額・源泉の 注記・繰越 99,790 と 今回分 税抜 100,000', async () => {
    const p = plain(await ryoushuu('g10', 'rg10'));
    ok(/源泉徴収税額 10,210円 差引/.test(p), '★源泉の 注記が 無い★');
    ok(/前回からの繰越 ¥?99,790/.test(p) && /今回分 税抜金額 ¥?100,000/.test(p), '★繰越と 今回分が 違う★ ' + (p.match(/前回.{0,80}/) || [''])[0]);
  });

  /* ⑤ ★取引先ごとの 帳簿 1つ★（2026-10-24 指示役の 決め）＝紙の 繰越・一覧・入金の 箱・集計が 同じ 数 */
  const hako = async (id) => {
    A._go('scr-list'); A._renderListForTest();
    doc.querySelector('#list-body [data-open="' + id + '"]').click(); await new Promise((r) => setTimeout(r, 80));
    return { sum: plain(doc.getElementById('pay-sum').innerHTML), list: plain(doc.getElementById('pay-list').innerHTML) };
  };
  const shuukei = async (pid, ym) => {
    doc.querySelector('.bn[data-scr="scr-bill"]').click(); await new Promise((r) => setTimeout(r, 60));
    doc.querySelector('#scr-bill [data-bseg="report"]').click();
    const sel = doc.getElementById('bk-rep-month'); sel.value = ym; sel.dispatchEvent(new doc.defaultView.Event('change'));
    await new Promise((r) => setTimeout(r, 30));
    const tr = doc.querySelector('#bk-rep-body tbody tr[data-pid="' + pid + '"]');
    const td = tr ? [...tr.querySelectorAll('td')].map((x) => x.textContent.replace(/\s+/g, '')) : [];
    /* 列は 見出しの 名で 引く（赤伝の 差し引きの 列は ある 時だけ 出る） */
    const th = [...doc.querySelectorAll('#bk-rep-body thead th')].map((x) => x.textContent.trim());
    const at = (na) => { const i = th.indexOf(na); return i < 0 ? null : num(td[i]); };
    doc.querySelector('#scr-bill [data-bseg="invoice"]').click();
    return { seikyu: at('請求'), sashi: at('赤伝で差し引き'), nyukin: at('入金'), nokori: at('残り') };
  };
  await T('⑤ 止1 9月分を 9月の 紙・10月分を 10月の 紙に 記録 → 11月の 紙は 11,000（二重に 請求しない）・両方 入金済・箱も 同じ', async () => {
    eq(tsugiAtama('pJ', '2026-11-05', 10000), 11000, '★11月の 紙（前は 44,000＝二重請求）★');
    eq(joutai('j9'), '入金済', 'j9'); eq(joutai('j10'), '入金済', 'j10');
    const b = await hako('j10');
    ok(/請求額（この1通） ¥?33,000/.test(b.sum) && /この1通に充てた入金 ¥?33,000/.test(b.sum) && /残り ¥?0/.test(b.sum), '★入金の 箱★ ' + b.sum);
    const k = await shuukei('pJ', '2026-09');
    eq(k.nyukin, 33000, '★集計の 9月の 入金★'); eq(k.nokori, 0, '★集計の 9月の 残り★');
  });
  await T('⑤ 止2 10月の 紙に 66,000 入金 → −66,000 返金 → 11月の 紙は 77,000・9月 10月 とも 未入金・集計の 9月 入金 0', async () => {
    eq(tsugiAtama('pK', '2026-11-05', 10000), 77000, '★11月の 紙★');
    eq(joutai('k9'), '未入金', '★9月 が 入金済の まま★'); eq(joutai('k10'), '未入金', '★10月★');
    const k = await shuukei('pK', '2026-09');
    eq(k.nyukin, 0, '★返金したのに 集計に 9月の 入金が 残る★'); eq(k.nokori, 33000, '9月の 残り');
  });
  await T('⑤ 止3 9月に 43,000（10,000 多い）→ 10月の 紙 23,000 を 払う → 11月 11,000・10月は「入金済」（一部入金・残り 10,000 と 言わない）', async () => {
    eq(tsugiAtama('pL', '2026-11-05', 10000), 11000, '★11月の 紙★');
    eq(joutai('l9'), '入金済', 'l9'); eq(joutai('l10'), '入金済', '★10月が 一部入金★');
    const b = await hako('l10');
    ok(/残り ¥?0/.test(b.sum), '★10月の 箱の 残り★ ' + b.sum);
  });
  await T('⑤ 3か月の 連鎖（8→9→10 の 紙 99,000 を 全部 10月の 紙に）→ 11月 11,000・3通とも 入金済・箱の 行に「8月の紙へ充てました」', async () => {
    eq(tsugiAtama('pM', '2026-11-05', 10000), 11000, '★11月の 紙★');
    ['m8', 'm9', 'm10'].forEach((id) => eq(joutai(id), '入金済', id));
    const b = await hako('m10');
    ok(/この1通に充てた入金 ¥?33,000/.test(b.sum), '★10月の 箱の 充てた 入金★ ' + b.sum);
    ok(/この入金のうち ¥?33,000 円を 2026年8月の紙/.test(b.list) && /2026年9月の紙/.test(b.list), '★倉庫の 行に 別の 紙へ 充てた 分を 添えていない★ ' + b.list.slice(0, 160));
    const k = await shuukei('pM', '2026-08');
    eq(k.nyukin, 33000, '★集計の 8月の 入金★');
  });
  await T('⑤ 一部を 先に 払う（9月 10,000 → 10月の 紙 56,000 を 全部）→ 11月 11,000・両方 入金済', async () => {
    eq(tsugiAtama('pQ', '2026-11-05', 10000), 11000, '★11月の 紙★');
    eq(joutai('q9'), '入金済', 'q9'); eq(joutai('q10'), '入金済', 'q10');
  });
  await T('⑤ 消した 入金は 数えない（9月の 紙の 33,000 を 消した → 10月の 紙に 繰越 33,000・9月 未入金）', async () => {
    eq(tsugiAtama('pR', '2026-10-05', 10000), 44000, '★10月の 紙★');
    eq(joutai('r9'), '未入金', '★消した 入金を 数えた★');
  });

  /* ⑥ taiketsu 10-24 3回目の 止め＝紙・一覧・集計が 同じ 数 */
  await T('⑥ 止2 9月・10月を 払い終わった 後に 9/30 付けの 請求漏れの 紙（今回 11,000）→ 11,000（払った 33,000 を もう一度 請求しない）・一覧は 両方 入金済', async () => {
    eq(tsugiAtama('pU', '2026-09-30', 10000), 11000, '★請求漏れの 紙（前は 44,000＝二重請求）★');
    eq(joutai('u9'), '入金済', 'u9'); eq(joutai('u10'), '入金済', 'u10');
  });
  await T('⑥ 止3 9月 33,000・マイナスの 請求書 −11,000・9月の 紙に 22,000 入金 → 10月の 紙 11,000・一覧は 2通とも 入金済（残り 11,000 と 督促しない）・集計 9月 残り 0', async () => {
    eq(tsugiAtama('pV', '2026-10-05', 10000), 11000, '★10月の 紙★');
    eq(joutai('v9'), '入金済', '★9月が 一部入金（赤伝を 差し引いていない）★'); eq(joutai('vm'), '入金済', '★マイナスの 請求書が 未入金★');
    const b = await hako('v9');
    ok(/この1通に充てた入金 ¥?22,000/.test(b.sum) && /マイナスの請求書で差し引いた額 ¥?11,000/.test(b.sum) && /残り ¥?0/.test(b.sum), '★9月の 箱★ ' + b.sum);
    const k = await shuukei('pV', '2026-09');
    eq(k.seikyu, 22000, '集計の 9月の 請求'); eq(k.nyukin, 22000, '★集計の 入金に 赤伝を 混ぜた★'); eq(k.nokori, 0, '集計の 9月の 残り');
  });

  /* ⑦ taiketsu 10-24 4回目の 止め */
  await T('⑦ 止A 9月を 払い終わった 後に 10月の 赤伝 −11,000・10月の 紙に 22,000 → 一覧 3通とも 入金済・集計 9月も 10月も 残り 0（赤伝で 9月の 入金を 押し出さない）', async () => {
    ['w9', 'w10', 'wm'].forEach((id) => eq(joutai(id), '入金済', id));
    const k9 = await shuukei('pW', '2026-09');
    eq(k9.nyukin, 33000, '★集計の 9月の 入金（押し出された）★'); eq(k9.nokori, 0, '★集計の 9月の 残り★');
    const k10 = await shuukei('pW', '2026-10');
    eq(k10.seikyu, 22000, '集計の 10月の 請求'); eq(k10.nyukin, 22000, '★集計の 10月の 入金★'); eq(k10.nokori, 0, '★集計の 10月の 残り★');
    eq(tsugiAtama('pW', '2026-11-05', 10000), 11000, '★11月の 紙★');
  });
  await T('⑦ 止B 9月 33,000 を 払い終わった 後に 赤伝 −11,000 → 一覧は「過入金 11,000 円 多い」（未入金と 言わない）・次の 紙は 繰越 −11,000', async () => {
    eq(joutai('x9'), '入金済', 'x9');
    eq(joutai('xm'), '過入金', '★返す 額が あるのに 過入金と 言わない★');
    A._go('scr-list'); A._renderListForTest();
    const c = doc.querySelector('#list-body [data-look="xm"]').closest('.iv-card');
    ok(/11,000 円 多い/.test(c.textContent.replace(/\s+/g, ' ')), '★多い 額★ ' + c.textContent.replace(/\s+/g, ' ').slice(0, 120));
    eq(tsugiAtama('pX', '2026-10-05', 10000), 0, '★10月の 紙（11,000 − 11,000）★');
  });
  await T('⑦ 止C 繰越を 写さずに 発行した 9月の 紙を 開き直しても 33,000 の まま（後の 10月・11月を 繰越に 入れない）', async () => {
    S.cur = JSON.parse(JSON.stringify(t.invoices.find((v) => v.id === 'y9')));
    const h = A._paperHtml(); S.cur = null;
    eq(num((/<td class="grand-v">([^<]*)<\/td>/.exec(h) || [])[1]), 33000, '★出した 紙の 額が 変わった★');
    ok(!/202611-y11/.test(h), '★後の 紙を「前回」と 刷った★');
  });

  /* ⑨ taiketsu 10-24 5回目の 止め */
  await T('⑨ 止1 同じ 日（10/31）の 赤伝が 正の 紙より 先の 番号でも 10月の 紙から 引く → 集計 9月も 10月も 残り 0・一覧 3通とも 入金済', async () => {
    ['a9', 'a1m', 'a2'].forEach((id) => eq(joutai(id), '入金済', id));
    const k9 = await shuukei('pA', '2026-09');
    eq(k9.nyukin, 33000, '★集計の 9月の 入金（押し出された）★'); eq(k9.nokori, 0, '★集計の 9月の 残り★');
    const k10 = await shuukei('pA', '2026-10');
    eq(k10.nyukin, 11000, '★集計の 10月の 入金★'); eq(k10.nokori, 0, '★集計の 10月の 残り★');
  });
  await T('⑨ 止2 引ける 紙の 無い 赤伝 −11,000 だけ → 一覧は「過入金 11,000 円 多い」（こちらが 返す 額・未入金と 言わない）', async () => {
    eq(joutai('bm'), '過入金', '★引ける 紙の 無い 赤伝★');
  });
  await T('⑨ 別件 見積書には 請求書の 繰越を 乗せない（未入金の 9月の 請求書 33,000 が あっても 見積は 今回分 11,000 だけ）', async () => {
    S.cur = { id: 'q-c', no: '', status: 'draft', doc_type: 'quote', partner_id: 'pC', issue_ymd: '2026-10-10',
      tax_mode: 'exclusive', rounding: 'floor', lines: [line('報酬', 10000)], data: {} };
    const h = A._paperHtml(); S.cur = null;
    eq(num((/<td class="grand-v">([^<]*)<\/td>/.exec(h) || [])[1]), 11000, '★見積の 額に 請求書の 繰越が 乗った★');
    ok(!/前回請求額|繰越額/.test(plain(h)), '★見積に 繰越の 欄★');
  });

  /* ⑩ taiketsu 10-24 6回目＝赤伝は 集計と 同じ 順（同じ 月 → 前の 月 → 返金 → 後の 月）で 当てる */
  const shuukeiGyou = async (pid, ym) => {
    doc.querySelector('.bn[data-scr="scr-bill"]').click(); await new Promise((r) => setTimeout(r, 60));
    doc.querySelector('#scr-bill [data-bseg="report"]').click();
    const sel = doc.getElementById('bk-rep-month'); sel.value = ym; sel.dispatchEvent(new doc.defaultView.Event('change'));
    await new Promise((r) => setTimeout(r, 30));
    const tr = doc.querySelector('#bk-rep-body tbody tr[data-pid="' + pid + '"]');
    const t2 = tr ? tr.textContent.replace(/\s+/g, ' ') : '';
    doc.querySelector('#scr-bill [data-bseg="invoice"]').click();
    return t2;
  };
  await T('⑩ 止A 9月を 払い終わり・10/15 の 赤伝 −11,000・10/31 の 紙に 22,000 → 赤伝は 同じ 10月の 紙から 引く＝集計 9月も 10月も 残り 0', async () => {
    ['d9', 'dm', 'd10'].forEach((id) => eq(joutai(id), '入金済', id));
    const k9 = await shuukei('pD', '2026-09');
    eq(k9.nyukin, 33000, '★集計の 9月の 入金（押し出された）★'); eq(k9.nokori, 0, '★集計の 9月の 残り★');
    const k10 = await shuukei('pD', '2026-10');
    eq(k10.nyukin, 22000, '★集計の 10月の 入金★'); eq(k10.nokori, 0, '★集計の 10月の 残り★');
  });
  await T('⑩ 止B 引ける 紙の 無い 赤伝だけの 月は 集計でも「過入金」（一覧と 同じ・未入金と 言わない）', async () => {
    const g = await shuukeiGyou('pB', '2026-09');
    ok(/過入金/.test(g) && !/未入金/.test(g), '★集計の 赤伝だけの 月★ ' + g);
  });
  await T('⑩ 止C 赤伝 −11,000 に 返金 −11,000 を 記録 → 後の 10月の 紙は「未入金 33,000」（一部入金と 言わない）・集計 9月 残り 0・10月 33,000', async () => {
    eq(joutai('im'), '入金済', '★返金した 赤伝★'); eq(joutai('i10'), '未入金', '★10月の 紙★');
    const k9 = await shuukei('pI', '2026-09'); eq(k9.nokori, 0, '★集計の 9月の 残り★');
    const k10 = await shuukei('pI', '2026-10'); eq(k10.nyukin, 0, '★集計の 10月の 入金★'); eq(k10.nokori, 33000, '★集計の 10月の 残り★');
    eq(tsugiAtama('pI', '2026-11-05', 10000), 44000, '★11月の 紙★');
  });
  await T('⑩ どの 紙より 古い 赤伝（8/20）は 返金が 無ければ 後の 9月の 紙から 引く → 9月 33,000 に 22,000 で 入金済', async () => {
    eq(joutai('o9'), '入金済', '★9月が 一部入金★'); eq(joutai('om'), '入金済', '★赤伝★');
  });

  /* ⑪ taiketsu 10-24 7回目＝集計の「請求」は 帳簿で 赤伝を 差し引いた 後の 額＝月の 行の 残りが 一覧と 同じ */
  /* 集計の 表の 下の 説明（警告）を 取る */
  const shuukeiGyouHint = async (ym) => {
    doc.querySelector('.bn[data-scr="scr-bill"]').click(); await new Promise((r) => setTimeout(r, 60));
    doc.querySelector('#scr-bill [data-bseg="report"]').click();
    const sel = doc.getElementById('bk-rep-month'); sel.value = ym; sel.dispatchEvent(new doc.defaultView.Event('change'));
    await new Promise((r) => setTimeout(r, 30));
    const t2 = doc.getElementById('bk-rep-body').textContent.replace(/\s+/g, ' ');
    doc.querySelector('#scr-bill [data-bseg="invoice"]').click();
    return t2;
  };
  const tsukiNokori = async (pid, yms) => { const o = {}; for (const ym of yms) { const k = await shuukei(pid, ym); o[ym] = k.nokori === null ? 0 : k.nokori; } return o; };
  const zero = (o, m) => Object.keys(o).forEach((ym) => eq(o[ym], 0, m + ' ' + ym + ' の 集計の 残り'));
  await T('⑪ G1 9月の 赤伝 −11,000・10月 33,000 に 22,000 → 一覧 両方 入金済・集計 9月も 10月も 残り 0・10月の「請求」は 紙と 同じ 33,000（差し引き 11,000 は 別の 列）', async () => {
    eq(joutai('g1m'), '入金済', 'g1m'); eq(joutai('g1a'), '入金済', 'g1a');
    zero(await tsukiNokori('pG1', ['2026-09', '2026-10']), 'G1');
    const k = await shuukei('pG1', '2026-10');
    eq(k.seikyu, 33000, '★集計の 請求が 紙の ご請求金額と 違う★'); eq(k.sashi, -11000, '★赤伝で 差し引きの 列★'); eq(k.nyukin, 22000, '入金');
  });
  await T('⑪ G2 9月 払い終わり・10月は 赤伝だけ・その 赤伝に 返金 → 一覧 両方 入金済・集計 9月も 10月も 残り 0（払い終わった 9月を 督促しない）', async () => {
    eq(joutai('g2a'), '入金済', 'g2a'); eq(joutai('g2m'), '入金済', 'g2m');
    zero(await tsukiNokori('pG2', ['2026-09', '2026-10']), 'G2');
  });
  await T('⑪ G4 9月 赤伝・10月 全部 払う・11月 未入金 → 赤伝は 11月から 引く＝一覧 11月「未入金」・集計 11月 残り 22,000・9月 10月 0', async () => {
    eq(joutai('g4a'), '入金済', 'g4a'); eq(joutai('g4b'), '未入金', '★11月（入金 0 なのに 一部入金と 言う）★');
    const o = await tsukiNokori('pG4', ['2026-09', '2026-10', '2026-11']);
    eq(o['2026-09'], 0, '9月'); eq(o['2026-10'], 0, '10月'); eq(o['2026-11'], 22000, '★11月の 集計の 残り★');
  });
  await T('⑪ G10 9月 払い終わり・10/15 赤伝だけ・11月に 22,000 → 一覧 3通とも 入金済・集計 9〜11月 残り 0', async () => {
    ['g10a', 'g10m', 'g10b'].forEach((id) => eq(joutai(id), '入金済', id));
    zero(await tsukiNokori('pG10', ['2026-09', '2026-10', '2026-11']), 'G10');
  });
  await T('⑪ S3 9月 33,000 に 22,000・10/05 の 赤伝 → 一覧 両方 入金済・集計 9月も 10月も 残り 0', async () => {
    eq(joutai('s3a'), '入金済', 's3a'); eq(joutai('s3m'), '入金済', 's3m');
    zero(await tsukiNokori('pS3', ['2026-09', '2026-10']), 'S3');
  });
  await T('⑪ 止B と 古い 赤伝の 集計＝⑦止B は 9月 過入金 11,000・⑩ 8/20 の 赤伝は 8月 9月 とも 残り 0', async () => {
    const x = await tsukiNokori('pX', ['2026-09']); eq(x['2026-09'], -11000, '★⑦止B 9月の 集計の 残り★');
    zero(await tsukiNokori('pO', ['2026-08', '2026-09']), '⑩古い赤伝');
  });
  await T('⑪ G15 同じ 月の 赤伝・入金 0 → 一覧も 集計も「未入金」22,000（一部入金と 言わない）', async () => {
    eq(joutai('g15a'), '未入金', '★一覧★');
    const g = await shuukeiGyou('pG15', '2026-10');
    ok(/未入金/.test(g) && !/一部入金/.test(g), '★集計★ ' + g);
    eq((await tsukiNokori('pG15', ['2026-10']))['2026-10'], 22000, '集計の 残り');
  });

  /* ⑫ taiketsu 10-24 8回目＝上の 枠・説明の 式・集計の 言葉・Excel の 差し引きの 列 */
  await T('⑫ 上の 枠は 差し引きが ある 月だけ 4つ＝請求 ＋ 赤伝で差し引き − 入金 ＝ 残額（10月）／説明の 式も 同じ 向き', async () => {
    doc.querySelector('.bn[data-scr="scr-bill"]').click(); await new Promise((r) => setTimeout(r, 60));
    doc.querySelector('#scr-bill [data-bseg="report"]').click();
    const sel = doc.getElementById('bk-rep-month'); sel.value = '2026-10'; sel.dispatchEvent(new doc.defaultView.Event('change'));
    await new Promise((r) => setTimeout(r, 30));
    const waku = {}; [...doc.querySelectorAll('#bk-rep-sum .bk-sum-c')].forEach((c) => { waku[c.querySelector('.bk-sum-l').textContent.trim()] = num(c.querySelector('.bk-sum-v').textContent.replace(/\s+/g, '')); });
    const hint = doc.getElementById('bk-rep-body').textContent.replace(/\s+/g, ' ');
    doc.querySelector('#scr-bill [data-bseg="invoice"]').click();
    ok('赤伝で差し引き' in waku, '★差し引きの 枠が 無い★ ' + JSON.stringify(waku));
    eq(waku['請求'] + waku['赤伝で差し引き'] - waku['入金'], waku['残額'], '★枠が 足し算で 合わない★ ' + JSON.stringify(waku));
    ok(/残り＝請求 ＋ 赤伝で差し引き − 入金/.test(hint), '★説明の 式★');
  });
  await T('⑫ 集計の 言葉＝残り 0 の 月は 入金済（G2・G10）／0円で 入金も 差し引きも 無い 紙は 一覧も 集計も 未入金', async () => {
    for (const [pid, ym] of [['pG2', '2026-09'], ['pG2', '2026-10'], ['pG10', '2026-10'], ['pG10', '2026-11']]) {
      const g = await shuukeiGyou(pid, ym); ok(/入金済/.test(g), '★' + pid + ' ' + ym + ' の 言葉★ ' + g);
    }
    eq(joutai('z0'), '未入金', '★0円の 紙の 一覧★');
    const g0 = await shuukeiGyou('pZ0', '2026-10'); ok(/未入金/.test(g0) && !/入金済/.test(g0), '★0円の 紙の 集計★ ' + g0);
  });
  await T('⑫ 集計の Excel＝差し引きが ある 月だけ「赤伝で差し引き」の 列（G1 の 10月は −11,000・残額 0）／赤伝の 月（8月）は 回した 分が ＋11,000', async () => {
    const x = A._repExcelForTest('2026-10');
    ok(x && x.sheet, '★Excel の 表が 作れない★ ' + (x && x.why));
    const head = x.sheet.aoa[0], row = x.sheet.aoa.find((r) => r[1] === '見本G1商事');
    const ci = head.indexOf('赤伝で差し引き');
    ok(ci > 0 && row, '★差し引きの 列か G1 の 行が 無い★ ' + JSON.stringify(head));
    eq(row[ci], -11000, '★Excel の 差し引き★'); eq(row[head.indexOf('残額')], 0, '★Excel の 残額★');
    eq(row[head.indexOf('請求額')], 33000, '★Excel の 請求額が 紙と 違う★');
    /* 赤伝の 月（8/20 の 赤伝を 9月から 引いた）は ほかの 月へ 回した 分が プラス */
    const x8 = A._repExcelForTest('2026-08'), h8 = x8.sheet.aoa[0], r8 = x8.sheet.aoa.find((r) => r[1] === '見本O商事');
    eq(r8 && r8[h8.indexOf('赤伝で差し引き')], 11000, '★赤伝の 月の 差し引き（プラス）★'); eq(r8[h8.indexOf('残額')], 0, '★赤伝の 月の 残額★');
  });

  /* ⑧ 取り消した 紙に 残った 入金＝設定で 選ぶ（既定＝充てる） */
  await T('⑧ 既定（充てる）＝9月を 取り消しても 入金 33,000 は 相手の 貸し → 10月の 紙は −22,000・8月は 過入金', async () => {
    eq(S.org.invoiceVoidPay, undefined, '★既定の 試験なのに 設定が 入っている★');
    eq(tsugiAtama('pZ', '2026-10-05', 10000), -22000, '★10月の 紙★');
    eq(joutai('z8'), '過入金', 'z8');
  });
  await T('⑧ 設定「充てない」＝取り消した 紙の 入金は 無かった 事に → 10月の 紙は 11,000・8月は 入金済・集計の 8月 残り 0', async () => {
    S.org.invoiceVoidPay = 'ignore';
    try {
      eq(tsugiAtama('pZ', '2026-10-05', 10000), 11000, '★10月の 紙★');
      eq(joutai('z8'), '入金済', 'z8');
    } finally { delete S.org.invoiceVoidPay; }
  });

  await T('⑧ 取り消した 9月の 入金を 8月の 紙で 返金した 相手＝既定は 10月の 紙 11,000・8月 入金済／「充てない」は 推測せず 止めて 警告（司さん 10-25）', async () => {
    eq(tsugiAtama('pZR', '2026-10-05', 10000), 11000, '★既定の 10月の 紙★'); eq(joutai('zr8'), '入金済', '★既定の 8月★');
    S.org.invoiceVoidPay = 'ignore';
    try {
      const g = tsugiAtama('pZR', '2026-10-05', 10000);
      ok(g === null, '★充てない＋返金 で 数を 出した（推測した）★ ' + g);
      A._go('scr-list'); A._renderListForTest();
      const c = doc.querySelector('#list-body [data-look="zr8"]').closest('.iv-card');
      ok(/入金は未確認/.test(c.textContent), '★一覧が 未確認と 言わない★ ' + c.textContent.replace(/\s+/g, ' ').slice(0, 80));
      const h = await shuukeiGyouHint('2026-08');
      ok(/取り消した請求書に入金や返金の記録が残っていて/.test(h) && /見本ZR商事/.test(h), '★集計に 警告と 取引先の 名が 出ない★ ' + h.slice(0, 120));
      eq(joutai('z8'), '入金済', '★警告の 無い 取引先（pZ）は 普通に 数える★');
      /* ★止めた 訳を 入金の 箱と Excel の 断りで 言う★ */
      const b = await hako('zr8'); ok(/取り消した請求書に入金や返金の記録が残っていて/.test(b.sum), '★入金の 箱に 訳が 出ない★ ' + b.sum.slice(0, 80));
      const xw = A._repExcelForTest('2026-08'); ok(xw && /取り消した請求書に入金や返金の記録が残っていて/.test(xw.why || ''), '★Excel の 断りが 訳を 言わない★ ' + (xw && xw.why));
      /* ★発行も 止まる★（繰越を 数えられないまま 紙を 固めない） */
      let kaita = 0; const keepSt = S.store.invoices; S.store.invoices = Object.assign({}, keepSt, { save: () => { kaita++; return Promise.resolve({}); }, issue: () => { kaita++; return Promise.resolve({}); } });
      /* お客さんと 同じ 道＝新しい 1通を 開いて 相手を 選び、発行を 押す */
      A._new(); const ep = doc.getElementById('e-partner'); ep.value = 'pZR';
      ok(ep.value === 'pZR', '★相手の 選びに pZR が 無い★（空振り）');
      ep.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true })); await new Promise((r) => setTimeout(r, 40));
      try { await A._issue(); } catch (e) { /* 止まれば よい */ }
      const err = (doc.getElementById('edit-err') || {}).textContent || '';
      S.cur = null; S.store.invoices = keepSt;
      ok(/取り消した請求書に入金や返金の記録が残っていて/.test(err), '★発行の 止めの 字が 出ない★ ' + err.slice(0, 80));
      eq(kaita, 0, '★止めずに 倉庫へ 書いた★');
    } finally { delete S.org.invoiceVoidPay; }
  });

  await T('⑧ 取り消す 前の 紙で 8月の 多い 分まで 返した（取り消した 紙の 正味 −11,000）＝既定は 11,000・「充てない」は 止めて 警告（少なく 請求しない）', async () => {
    eq(tsugiAtama('pZH', '2026-10-05', 10000), 11000, '★既定の 10月の 紙★'); eq(joutai('zh8'), '入金済', '★既定の 8月★');
    S.org.invoiceVoidPay = 'ignore';
    try {
      const g = tsugiAtama('pZH', '2026-10-05', 10000);
      ok(g === null, '★正味 マイナスで 数を 出した（0＝11,000 少なく 請求）★ ' + g);
    } finally { delete S.org.invoiceVoidPay; }
  });
  await T('⑧ 取り消した 紙の 上で 全部 返した（正味 0）＋8月の 多い 分の 返金＝「充てない」でも 止めずに 11,000・8月 入金済（止めが 広すぎない）', async () => {
    S.org.invoiceVoidPay = 'ignore';
    try {
      eq(tsugiAtama('pZC', '2026-10-05', 10000), 11000, '★正味 0 なのに 止めた／数が 違う★');
      eq(joutai('zc8'), '入金済', 'zc8');
    } finally { delete S.org.invoiceVoidPay; }
  });

  await T('③ 源泉の ある 相手（10月の 紙の 差引 199,580 を 全部 払う）→ 11月の 紙に 繰越は 無い・9月も 10月も 入金済', async () => {
    eq(tsugiAtama('pG', '2026-11-05', 10000, true), 11000, '★11月の 紙の ご請求金額（源泉の 前の 頭の 額）★');
    eq(joutai('g9'), '入金済', '★9月★');
    eq(joutai('g10'), '入金済', '★10月★');
  });
}

if (!SELF) {
  await run('本物の seikyu-app.js');
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
} else {
  const keep = fs.readFileSync(APP, 'utf8');
  /* ★1か所ずつ わざと 戻して 回す★（taiketsu 4回目＝まとめて 壊すと、1つが 空振りに なっても 他の 赤で 緑に 見える）
     どの 壊しも ★1件 以上 赤★に ならなければ 自己診断は 赤 */
  const marks = [
    { na: '①源泉の 注記を 消費税の 判定に 縛る', pairs: [['gensen: zengaku ? gen : 0,', 'gensen: whole ? gen : 0,']] },
    { na: '③⑤入金を 記録した 紙 だけに 充てる（前の 作り）', pairs: [['            c = cells[i]; var room = c.gaku - c.credit - c.paid; if (room <= 0) continue;', '            c = cells[i]; if (c.v.id !== r.invoice_id) continue; var room = c.gaku - c.credit - c.paid; if (room <= 0) continue;']] },
    { na: '⑥止2 繰越を この 紙の 日付で 切る（前の 作り＝後の 紙の 入金も 外す）', pairs: [
      ["        && String(x.partner_id || '') === pid;\n    }).sort(choubo_jun);", "        && String(x.partner_id || '') === pid && !(v.issue_ymd && x.issue_ymd && x.issue_ymd > v.issue_ymd);\n    }).sort(choubo_jun);"],
      ["      if (!on || on.id === v.id) return;\n      var amt", "      if (!on || on.id === v.id) return;\n      if (on.status === 'issued' && !ids[on.id]) return;\n      var amt"]] },
    { na: '⑥止3 マイナスの 請求書を 貸しに しない', pairs: [['      var reds = cells.filter(function (n) { return n.gaku < 0; });', '      var reds = [];']] },
    { na: '⑦⑨⑩止A 赤伝を 月で なく 一番 古い 紙から 当てる', pairs: [["        for (j = cells.length - 1; j >= 0; j--) { if (tsuki(cells[j]) === ym) ate(n, cells[j]); }\n        for (j = cells.length - 1; j >= 0; j--) { if (tsuki(cells[j]) < ym) ate(n, cells[j]); }", '        for (j = 0; j < cells.length; j++) ate(n, cells[j]);']] },
    { na: '⑩止C 返金を 赤伝に 当てない', pairs: [['            c = reds[i]; var owe = c.left + c.paid; if (owe <= 0) continue;', '            c = reds[i]; continue;']] },
    { na: '⑪ 集計に 赤伝の 差し引きを 渡さない', pairs: [['    var creditOf = function (v) { var c = L.ok ? L.byInv[v.id] : null; return c ? c.credit : 0; };', '    var creditOf = function () { return 0; };']] },
    { na: '⑪ 入金 0 で 赤伝だけの 紙を 一部入金と 言う', pairs: [["st.remain === 0 ? 'paid' : (st.paid === 0 ? 'unpaid' : 'partial');", "st.remain === 0 ? 'paid' : 'partial';"]] },
    { na: '⑩ 残った 赤伝を 後の 月の 紙へ 回さない', pairs: [['        for (var j = 0; j < cells.length; j++) { if (tsuki(cells[j]) > ym) ate(n, cells[j]); }\n', '']] },
    { na: '⑨止2 引ける 紙の 無い 赤伝を 過入金に しない', pairs: [["    if (st.remain < 0) st.state = 'over';\n", '']] },
    { na: '⑨別件 見積にも 繰越を 乗せる', pairs: [["    if ((v.doc_type || 'invoice') !== 'invoice') return null;\n", '']] },
    { na: '⑦止B 状態を 入金＋貸しの 和で 決める', pairs: [["      st.state = st.remain < 0 ? 'over' : st.remain === 0 ? 'paid' : (st.paid === 0 ? 'unpaid' : 'partial');\n    }\n    /* ★引ける", "      st.state = (st.paid + c.credit) === 0 ? 'unpaid' : st.remain > 0 ? 'partial' : st.remain === 0 ? 'paid' : 'over';\n    }\n    /* ★引ける"], ["    if (st.remain < 0) st.state = 'over';\n", '']] },
    { na: '⑧ 充てない＋返金 でも 発行を 止めない', pairs: [["    if (cw && cw.voidWarn) { box('edit-err', cw.why); return Promise.resolve(); }", '']] },
    { na: '⑧ 充てない＋返金 で 止めずに 数える', pairs: [['      p.voidWarn = Object.keys(vn)', '      p.voidWarn = false && Object.keys(vn)']] },
    { na: '⑧ 取り消した 紙の 正味 マイナスを 見ない', pairs: [['      p.voidWarn = Object.keys(vn).some(function (id) { return vn[id] < 0; })\n        ||', '      p.voidWarn = false\n        ||']] },
    { na: '⑧ 正味 0 の 取り消した 紙でも 止める（広すぎ）', pairs: [['(Object.keys(vn).some(function (id) { return vn[id] > 0; })', '(Object.keys(vn).some(function (id) { return true; })']] },
    { na: '⑧ 入金の 箱に 止めた 訳を 出さない', pairs: [["        + (st.voidWarn ? '<p class=\"hint err\">' + esc(VOIDWARN) + '</p>' : '');", "        + '';"]] },
    { na: '⑧ 帳簿の 控えの 鍵から 設定を 抜く', pairs: [['    var key = [rs, list, rs ? rs.length : -1, list.length, voidPay];', '    var key = [rs, list, rs ? rs.length : -1, list.length, null];']] },
    { na: '⑧ 設定「充てない」を 効かせない', pairs: [["      if (v.status === 'void' && voidPay === 'ignore') {", "      if (false) {"]] },
    { na: '⑦止C 発行済みでも 繰越を 数え直す', pairs: [["    if (v.status && v.status !== 'draft') return null;\n", '']] },
  ];
  const keepR = fs.readFileSync(REPF, 'utf8');
  marks.push(
    { na: '⑫ 集計の 残り 0 の 月を 済みに しない（前の 式）', file: 'rep', pairs: [["        r.state = r.remain < 0 ? 'over' : r.remain > 0 ? (r.paid === 0 ? 'unpaid' : 'partial')\n          : (r.paid === 0 && r.credit === 0 ? 'unpaid' : 'paid');", "        r.state = r.remain < 0 ? 'over' : r.paid === 0 ? 'unpaid' : r.remain > 0 ? 'partial' : 'paid';"]] },
    { na: '⑫ 0円の 紙を 集計で 済みと 言う', file: 'rep', pairs: [["          : (r.paid === 0 && r.credit === 0 ? 'unpaid' : 'paid');", "          : 'paid';"]] },
    { na: '⑫ 上の 枠に 差し引きを 出さない', pairs: [["      + (sashiT ? cell('', '赤伝で差し引き', unk ? '未確認' : yenW(-t.credit) + '円') : '')\n", '']] },
    { na: '⑫ Excel の 差し引きの 符号を 逆に する', pairs: [["concat(sashi ? [-r.credit] : [],", "concat(sashi ? [r.credit] : [],"]] });
  /* ★段を 3つに 分ける（--bu=1／2／3）★＝壊す 所が 24 に 増え、1回で 265秒＝押す前の 網の 1段の 上限 180秒を 越えた
     （2つ割りでも 134秒＝余りが 少ない）。中身は 1つも 変えず、壊す 所を 順に 割って 走らせる（--bu 無し＝全部）。打ち間違いは 止める。 */
  const buA = process.argv.filter((x) => x.indexOf('--bu') === 0);
  if (buA.length > 1 || (buA.length === 1 && ['--bu=1', '--bu=2', '--bu=3'].indexOf(buA[0]) < 0)) {
    console.log('  ★--bu の 字が 違います（' + buA.join(' ') + '）＝何も 走らせずに 止めます★'); process.exit(2);
  }
  const BU = buA.length ? Number(buA[0].slice(5)) : 0;
  const zenbu = marks.length;
  if (BU) marks.splice(0, marks.length, ...marks.filter((m, i) => i % 3 === BU - 1));
  console.log('  段 ' + (BU || '全部') + '＝壊す 所 ' + marks.length + '／' + zenbu);
  if (!marks.length) { console.log('  ★この 段に 壊す 所が 0＝空振り★'); process.exit(1); }
  let kara = 0;
  for (const m of marks) {
    let bad = m.file === 'rep' ? keepR : keep;
    for (const [a, b] of m.pairs) {
      if (bad.split(a).length !== 2) { console.log('  ★壊す所が 見つからない＝この自己診断は 古い★ ' + m.na); process.exit(2); }
      bad = bad.replace(a, b);
    }
    const mae = fail;
    await run(m.na + '（わざと 壊した）', m.file === 'rep' ? null : bad, m.file === 'rep' ? bad : null);
    const aka = fail - mae;
    console.log('  → ' + m.na + ' … 赤 ' + aka + '件' + (aka ? '' : '　★空振り★'));
    if (!aka) kara++;
  }
  console.log('\n  わざと壊した ' + marks.length + 'か所の うち 赤に ならなかった 所 … ' + kara + '（0 の はず）');
  /* ★約束の 行★（tools/_bunrui.mjs が 最初に 読む）＝わざと 壊した 回の ✗ は 狙った 赤。数は「壊して 赤に なった 所／空振り」 */
  console.log('KEKKA {"passed":' + (marks.length - kara) + ',"failed":' + kara + ',"mimiso":0}');
  process.exit(kara ? 1 : 0);
}
