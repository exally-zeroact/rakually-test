/* gaku-soroe.mjs — ★集計・一覧・入金の状態は 紙の「ご請求金額」と 同じ 額で 数える★
 * =============================================================================
 * 司さんの 決め（2026-10-24「揃えろ」）
 *   集計の「請求」「残り」と 入金の 状態（未入金・一部入金・入金済・過入金）は、
 *   紙の「ご請求金額」（DOC.payableOf＝控除・源泉の 後）と 同じ 額で 数える。
 *   ★繰越は 二重に 数えない★＝集計の「請求」は その1通の 分（繰越を 足す 前）。紙と 違う 訳は 字で 言う。
 *
 * ★本物の seikyu-app.js を jsdom で 動かし、本物の 紙（PAPER.build）の 字を 読んで 突き合わせる★
 *   （中の 値どうしで 閉じない＝紙に 描かれた 数と 比べる）
 *
 * 4通（同じ月・別の 相手）
 *   A 何も 無い ／ B 控除 2,000 ／ C 源泉 10,210 ／ D 前回からの 繰越 30,000
 * 見る物
 *   ① 紙の 額（頭の「ご請求金額」・下の「差引お支払額」）から 出る「その1通で 払う額」が、
 *      一覧の 金額・一覧の 頭の 合計・集計の 請求・残り・集計の Excel・請求/集計の 合計 と 同じ
 *   ② 入金が ちょうど 払う額の 時に「入金済」（源泉の 紙でも「一部入金」と 言わない）
 *   ③ 繰越の 紙は 繰越を 足さない（前の 月と 二重に 数えない）＋その 訳を 字で 言う
 *   ④ 控除・源泉・繰越の 無い 1通は 今までと 1円も 変わらない（倉庫の grandTotal の まま）
 *
 * 使い方: node seikyu/tests/gaku-soroe.mjs [--self-test]
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

const line = (name, kin) => ({ name, qty: '1', unit: '式', price: String(kin), amount: String(kin), rate: 10, memo: '' });
function tane() {
  const partners = ['A', 'B', 'C', 'D'].map((k, i) => ({ id: 'p' + k, sort: i, data: { name: '見本' + k + '商事', keisho: '御中' } }));
  const iv = (id, pid, kin, extra) => Object.assign({
    id, no: '202610-00' + id, status: 'issued', doc_type: 'invoice', partner_id: pid, issue_ymd: '2026-10-1' + id.charCodeAt(0) % 10,
    tax_mode: 'exclusive', rounding: 'floor', lines: [line('工事代金', kin)], data: {},
    totals: { subtotal: kin, taxTotal: kin / 10, gross: kin * 11 / 10, deduct: 0, deductLines: [], grandTotal: kin * 11 / 10 },   // ★整数で（kin*1.1 は 110000.00000000001）
  }, extra || {});
  const invoices = [
    iv('a', 'pA', 10000),                                                       // 何も 無い 11,000
    iv('b', 'pB', 20000, { totals: { subtotal: 20000, taxTotal: 2000, gross: 22000, deduct: 2000,
      deductLines: [{ name: '振込手数料', amount: 2000 }], grandTotal: 20000 } }), // 控除＝20,000
    iv('c', 'pC', 100000, { data: { gensen: true },                             // 源泉＝110,000−10,210
      snapshot: { gensen: { base: 100000, amount: 10210, net: 99790 } } }),
    iv('d', 'pD', 30000, { snapshot: { carry: { state: 'ok', prevNo: '202609-004', prevTotal: 50000, paid: 20000,
      carry: 30000, thisTotal: 33000, grandTotal: 63000 } } }),               // 繰越＝紙は 63,000・この1通は 33,000
  ];
  /* ★ちょうど 払う 額を 入れる★（源泉の 紙は 源泉を 引いた 額が 振り込まれる） */
  const receipts = [
    { id: 'rb', invoice_id: 'b', amount: 20000, ymd: '2026-10-31' },
    { id: 'rc', invoice_id: 'c', amount: 99790, ymd: '2026-10-31' },
    { id: 'rd', invoice_id: 'd', amount: 33000, ymd: '2026-10-31' },
  ];
  return { partners, invoices, receipts };
}

async function run(label, appSrc) {
  console.log('\n[' + label + '] ★紙の ご請求金額と 一覧・集計・入金の 状態を 揃える★');
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
  const A = win.SeikyuApp, S = A._state, t = tane();
  S.partners = t.partners; S.fil = 'all'; S.docType = 'invoice';
  S.org = { yago: '合同会社Rakunally', addr: '東京都架空区見本台1-2-3', invoiceNo: 'T1234567890123', bank: '（見本）銀行 普通 1234567' };
  S.store = {
    partners: { list: () => Promise.resolve(t.partners) },
    receipts: { list: () => Promise.resolve(t.receipts) },
    invoices: { list: (k) => Promise.resolve(JSON.parse(JSON.stringify(t.invoices.filter((v) => (v.doc_type || 'invoice') === (k || 'invoice'))))),
      usedNos: () => Promise.resolve([]) },
  };
  A._bindForTest();
  await A._loadList();
  const $ = (id) => doc.getElementById(id);
  const txt = (el) => ((el && el.textContent) || '').replace(/\s+/g, ' ').trim();

  /* ★紙を 読む★＝「確認」と 同じ 紙（PAPER.build）の 字から 頭の 額・源泉・差引を 拾う */
  const kami = {};
  for (const v of S.invoices) {
    S.cur = JSON.parse(JSON.stringify(v));
    const h = A._paperHtml();
    ok(h.length > 1000, v.id + ' の 紙が 作れない');
    const head = num((/<td class="grand-v">([^<]*)<\/td>/.exec(h) || [])[1]);
    const net = num((/<tr class="sums-net"><th>[^<]*<\/th><td>([^<]*)<\/td>/.exec(h) || [])[1]);
    const gen = num((/<tr class="sums-minus"><th>源泉[^<]*<\/th><td>([^<]*)<\/td>/.exec(h) || [])[1]);
    kami[v.id] = { head, net, gen };
  }
  S.cur = null;
  /* ★その1通で 払う 額（紙から）★＝頭の ご請求金額 − 前回からの 繰越 − 源泉 */
  const harau = (v) => kami[v.id].head - Number((v.snapshot && v.snapshot.carry && v.snapshot.carry.carry) || 0)
    - Math.abs(kami[v.id].gen || 0);
  const KITAI = { a: 11000, b: 20000, c: 99790, d: 33000 };

  await T('⓪ 紙の 額を 読めている（種の 確かめ）', async () => {
    eq(kami.a.head, 11000, 'A の 頭'); eq(kami.b.head, 20000, 'B の 頭（控除の 後）');
    eq(kami.c.head, 110000, 'C の 頭'); eq(Math.abs(kami.c.gen), 10210, 'C の 源泉'); eq(kami.c.net, 99790, 'C の 差引');
    eq(kami.d.head, 63000, 'D の 頭（繰越 込み）');
    S.invoices.forEach((v) => eq(harau(v), KITAI[v.id], v.id + ' の 払う額'));
    console.log('     紙 … ' + S.invoices.map((v) => v.id + ' 頭' + kami[v.id].head + (kami[v.id].gen ? ' 源泉' + kami[v.id].gen : '') + ' → ' + harau(v)).join(' ／ '));
  });

  await T('① 一覧の 金額・入金の 状態が 紙と 同じ（ちょうど 払った 1通は「入金済」）', async () => {
    A._go('scr-list'); A._renderListForTest();
    for (const v of S.invoices) {
      const card = doc.querySelector('#list-body [data-look="' + v.id + '"]').closest('.iv-card');
      eq(num(txt(card.querySelector('.iv-amt'))), harau(v), '★' + v.id + ' 一覧の 金額が 紙と 違う★');
      const want = v.id === 'a' ? '未入金' : '入金済';
      ok(txt(card).indexOf(want) >= 0, '★' + v.id + ' の 入金の 状態が「' + want + '」で ない★ ' + txt(card).slice(0, 80));
    }
    const sum = txt($('list-sum'));
    ok(sum.indexOf((11000 + 20000 + 99790 + 33000).toLocaleString('en-US')) >= 0, '★一覧の 頭の 合計が 紙と 違う★ ' + sum);
    console.log('     ' + sum);
  });

  await T('② 集計の 請求・入金・残り・状態・合計が 紙と 同じ（繰越は 足さない）', async () => {
    doc.querySelector('.bn[data-scr="scr-bill"]').click(); await sleep(60);
    doc.querySelector('#scr-bill [data-bseg="report"]').click(); await sleep(30);
    const trs = [...doc.querySelectorAll('#bk-rep-body tbody tr')];
    eq(trs.length, 4, '行の 数');
    for (const tr of trs) {
      const v = S.invoices.find((x) => x.partner_id === tr.getAttribute('data-pid'));
      const td = [...tr.querySelectorAll('td')].map(txt);
      eq(num(td[1]), harau(v), '★' + v.id + ' 集計の 請求が 紙と 違う★');
      eq(num(td[3]), v.id === 'a' ? harau(v) : 0, '★' + v.id + ' 集計の 残りが 違う★');
      ok(td[0].indexOf(v.id === 'a' ? '未入金' : '入金済') >= 0, '★' + v.id + ' 集計の 状態★ ' + td[0]);
    }
    const ft = [...doc.querySelectorAll('#bk-rep-body tfoot td')].map(txt);
    eq(num(ft[1]), 163790, '★合計の 請求★'); eq(num(ft[3]), 11000, '★合計の 残り★');
    ok(/繰越/.test(txt($('bk-rep-note'))) && /前の月で 数えています/.test(txt($('bk-rep-note'))), '★繰越の 訳を 言っていない★ ' + txt($('bk-rep-note')));
    ok(/源泉/.test(txt($('bk-rep-note'))), '★源泉の 訳を 言っていない★');
    console.log('     ' + txt($('bk-rep-sum')) + ' ／ ' + txt($('bk-rep-note')).slice(0, 60));
  });

  await T('③ 集計の Excel・請求/集計の 合計も 同じ 額', async () => {
    let got = null;
    win.SeikyuOut.excel = (sheet) => { got = sheet; return Promise.resolve(); };
    $('b-bk-rep-xlsx').click(); await sleep(20); $('fn-ok').click(); await sleep(40);
    ok(got, 'Excel が 出ていない');
    const last = got.aoa[got.aoa.length - 1];
    eq(last[3], 163790, '★Excel の 請求額の 合計★'); eq(last[5], 11000, '★Excel の 残額の 合計★');
    doc.querySelector('#scr-bill [data-bseg="invoice"]').click(); await sleep(60);
    ok(txt($('bk-count')).indexOf('163,790') >= 0, '★請求/集計の 合計が 違う★ ' + txt($('bk-count')));
  });

  await T('④ 控除・源泉・繰越の 無い 1通は 今までと 1円も 変わらない（倉庫の grandTotal の まま）', async () => {
    const a = S.invoices.find((v) => v.id === 'a');
    eq(harau(a), a.totals.grandTotal, 'A');
  });
  /* ★次の 1通の 繰越★（司さん 10-24「法律的に最適解で」）＝前回の 残りは 相手が 実際に 払う 額（源泉の 後）で 数える。
     源泉所得税は 払う側が 差し引いて 国へ 納める（所得税法 204条・212条）＝差し引いた 分は 払い残りでは ない。 */
  await T('⑤ 源泉の 相手が 払う額どおり 払った 次の 1通に「繰越」が 載らない／源泉の 無い 相手は 今まで どおり', async () => {
    S.org = Object.assign({}, S.org, { invoiceCarry: true });
    const tsugi = (pid, gensen) => ({ id: 'n' + pid, no: '', status: 'draft', doc_type: 'invoice', partner_id: pid, issue_ymd: '2026-11-05',
      tax_mode: 'exclusive', rounding: 'floor', lines: [line('工事代金', 10000)], data: gensen ? { gensen: true } : {} });
    const atama = (v) => { S.cur = JSON.parse(JSON.stringify(v)); const h = A._paperHtml(); S.cur = null;
      return { head: num((/<td class="grand-v">([^<]*)<\/td>/.exec(h) || [])[1]), h }; };
    const c = atama(tsugi('pC', true));
    eq(c.head, 11000, '★源泉の 相手（払う額 99,790 を 全部 払った）の 次の 紙に 繰越 10,210 が 載った★');
    const a = atama(tsugi('pA', false));
    eq(a.head, 22000, '★源泉の 無い 相手（未入金 11,000）の 繰越が 今までと 違う★');
    const b = atama(tsugi('pB', false));
    eq(b.head, 11000, '★控除の 相手（払う額 20,000 を 全部 払った）の 次の 紙に 繰越が 載った★');
    console.log('     次の 紙の 頭 … 源泉の 相手 ' + c.head + ' ／ 未入金の 相手 ' + a.head + ' ／ 控除の 相手 ' + b.head);
  });

  /* ★領収書★（司さん 10-24「法律的に最適解で」）＝「全額受領」は 相手が 実際に 払う 額で 判じる。
     領収の 額は 実際に 受け取った 額・源泉の ある 1通は「源泉徴収税額 X円 差引」を 添える。 */
  await T('⑥ 源泉の 1通で 払う額を 全部 受け取ると「全額受領」（税の 内訳が 出る）・領収の 額は 受け取った 額・源泉の 注記', async () => {
    let got = '';
    win.SeikyuPdf.build = (h) => { got = String(h); return Promise.resolve(new Uint8Array([1])); };
    win.SeikyuOut.pdfOpen = () => Promise.resolve({});
    A._go('scr-list'); A._renderListForTest();
    doc.querySelector('#list-body [data-open="c"]').click(); await sleep(80);
    const b = doc.querySelector('[data-rcsend="rc"]');
    ok(b, '領収書の ボタンが 無い');
    b.click(); await sleep(30); $('fn-ok').click(); await sleep(80);
    ok(got.length > 500, '★領収書の 紙が 作られていない★ ' + txt($('pay-err')));
    eq(num((/<td class="grand-v">([^<]*)<\/td>/.exec(got) || [])[1]), 99790, '★領収の 額が 受け取った 額で ない★');
    ok(/<th>消費税額等<\/th>/.test(got), '★払う額を 全部 受け取ったのに「全額」に ならない（税の 内訳が 出ない）★');
    ok(/源泉徴収税額 10,210円 差引/.test(got.replace(/<[^>]+>/g, '')), '★源泉の 注記が 無い★');
    const zei = num((/<th>税抜金額<\/th><td>([^<]*)<\/td>/.exec(got) || [])[1]);
    eq(zei, 100000, '★税抜金額が 違う★');
    console.log('     領収書 … 領収 99,790・税抜 ' + zei + '・源泉徴収税額 10,210円 差引');
  });
}

if (!SELF) {
  await run('本物の seikyu-app.js');
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
} else {
  /* ★わざと 戻す★＝入金の 状態を 倉庫の grandTotal（源泉の 前）と 比べる 姿 */
  const keep = fs.readFileSync(APP, 'utf8');
  const mark = '{ id: inv.id, grand_total: gakuOf(inv) || 0 }';
  if (keep.split(mark).length !== 2) { console.log('  ★壊す所が 見つからない＝この自己診断は 古い★'); process.exit(2); }
  await run('入金の 状態を 源泉の 前と 比べる（わざと 壊した）', keep.replace(mark, '{ id: inv.id, grand_total: (inv.totals && inv.totals.grandTotal) || 0 }'));
  const nige = fail >= 1 ? 0 : 1;
  console.log('\n  わざと壊した時に 赤になった数 … ' + fail + '件（1件以上のはず）');
  process.exit(nige ? 1 : 0);
}
