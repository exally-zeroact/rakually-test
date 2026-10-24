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
    ],
    receipts: [
      { id: 'rh', invoice_id: 'h', amount: 89790, ymd: '2026-10-31' },
      { id: 'rs1', invoice_id: 's1', amount: 49895, ymd: '2026-10-31' },
      { id: 'rs2', invoice_id: 's2', amount: 55000, ymd: '2026-10-31' },
      { id: 'rs3', invoice_id: 's3', amount: 39916, ymd: '2026-10-31' },
      { id: 're10', invoice_id: 'e10', amount: 66000, ymd: '2026-10-31' },    // 10月の 紙の ご請求金額を 全部
      { id: 'rf10', invoice_id: 'f10', amount: 40000, ymd: '2026-10-31' },    // 66,000 の うち 40,000 だけ
      { id: 'rg10', invoice_id: 'g10', amount: 199580, ymd: '2026-10-31' },   // 209,790 − 源泉 10,210
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
  /* ★2か所を わざと 戻す★＝①源泉の 注記を 消費税の 判定に 縛る／③前回の 額に 刷った 繰越を 足さない */
  const marks = [['gensen: zengaku ? gen : 0,', 'gensen: whole ? gen : 0,'],
    ['receipts: S.receipts, prevTotalOf: kamiGakuOf });', 'receipts: S.receipts, prevTotalOf: gakuOf });']];
  let bad = keep;
  for (const [a, b] of marks) {
    if (bad.split(a).length !== 2) { console.log('  ★壊す所が 見つからない＝この自己診断は 古い★ ' + a); process.exit(2); }
    bad = bad.replace(a, b);
  }
  await run('源泉の 注記を 縛る・前回の 繰越を 足さない（わざと 壊した）', bad);
  console.log('\n  わざと壊した時に 赤になった数 … ' + fail + '件（2件以上のはず）');
  process.exit(fail >= 2 ? 0 : 1);
}
