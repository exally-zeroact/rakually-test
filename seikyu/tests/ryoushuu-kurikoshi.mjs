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
  const partners = ['H', 'S', 'N', 'E', 'F', 'G', 'J', 'K', 'L', 'M', 'Q', 'R'].map((k, i) => ({ id: 'p' + k, sort: i, data: { name: '見本' + k + '商事', keisho: '御中' } }));
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
    ],
  };
  const { ryoushuu, tsugiAtama, A, doc } = await boot(t, appSrc);

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
    doc.querySelector('#scr-bill [data-bseg="invoice"]').click();
    return { seikyu: num(td[1]), nyukin: num(td[2]), nokori: num(td[3]) };
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
  /* ★2か所を わざと 戻す★＝①源泉の 注記を 消費税の 判定に 縛る／⑤入金を 記録した 紙 だけに 充てる */
  const marks = [['gensen: zengaku ? gen : 0,', 'gensen: whole ? gen : 0,'],
    /* ③⑤ 帳簿の 充て方を 古い 順で なく 記録した 紙 だけに する（＝前の 作りの 型） */
    ['            c = cells[i]; var room = c.gaku - c.paid; if (room <= 0) continue;', '            c = cells[i]; if (c.v.id !== r.invoice_id) continue; var room = c.gaku - c.paid; if (room <= 0) continue;']];
  let bad = keep;
  for (const [a, b] of marks) {
    if (bad.split(a).length !== 2) { console.log('  ★壊す所が 見つからない＝この自己診断は 古い★ ' + a); process.exit(2); }
    bad = bad.replace(a, b);
  }
  await run('源泉の 注記を 縛る・入金を 記録した 紙だけに 充てる（わざと 壊した）', bad);
  console.log('\n  わざと壊した時に 赤になった数 … ' + fail + '件（2件以上のはず）');
  process.exit(fail >= 2 ? 0 : 1);
}
