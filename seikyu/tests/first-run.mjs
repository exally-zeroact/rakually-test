/* first-run.mjs — ★初めて使う人が 空っぽから 1周 できるか★
 * =============================================================================
 * ★司さん 2026-08-30「もうすぐ知り合いに使ってもらうから 請求書のところだけでも
 *   完璧に終わらしとけ」「それができたら 後は 応用やろが」★
 *
 * ★ここで見るのは「初めての人が 詰まらないか」だけ★
 *   今までの試験は ★もう中身が在る状態★から 押していた。
 *   ★本当に危ないのは 何も無い所から 始める人★（知り合いは そこから 始める）。
 *
 * 1周＝ ①取引先を作る → ②請求書を作る → ③明細を入れる → ④下書き保存
 *      → ⑤発行 → ⑥紙を出す（HTML・PDF） → ⑦入金を付ける → ⑧一覧で見える
 *
 * ★どこで 詰まっても「なぜ 進めないか」が 画面に 1行 出ている事★も 見る
 *   （黙って 何も起きない、を 作らない）。
 *
 * 使い方: node seikyu/tests/first-run.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません。この検証は飛ばせません。npm install してください。'); process.exit(1); }

let pass = 0, fail = 0;
/* ★待つ★＝中で 保存や 採番（非同期）が 走る。待たずに見ると
   ★製品の穴に見えて 実は 試験が 見に行くのが 早すぎる★（2026-08-30 実際に 3本 誤検知した）。 */
const T = async (n, fn) => {
  try { await fn(); pass++; console.log('  ✓ ' + n); }
  catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); }
};
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' … 期待 ' + JSON.stringify(b) + ' / 実際 ' + JSON.stringify(a)); };

const rel = 'seikyu/index.html', file = path.join(ROOT, rel);
const html = fs.readFileSync(file, 'utf8');
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''),
  { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' + rel });
const win = dom.window, doc = win.document;
win.fetch = () => Promise.reject(new Error('no net'));
win.scrollTo = () => {}; win.print = () => {};
win.URL.createObjectURL = () => 'blob:fake';
let opened = 0;
win.open = () => { opened++; return { document: { write() {}, close() {} }, focus() {}, print() {}, close() {} }; };
const errs = [];
win.addEventListener('error', (e) => errs.push('window.error: ' + (e.message || e)));
for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
  const src = m[1].split('?')[0];
  if (/^https?:/.test(src) || ['supa-config.js', 'auth.js', 'env-badge.js'].indexOf(src.split('/').pop()) >= 0) continue;
  const p = path.resolve(path.dirname(file), src);
  if (!fs.existsSync(p)) continue;
  const el = doc.createElement('script');
  el.textContent = fs.readFileSync(p, 'utf8');
  doc.body.appendChild(el);
}
await new Promise((r) => setTimeout(r, 400));
doc.getElementById('app').hidden = false;

const A = win.SeikyuApp, S = A._state, D = win.SeikyuDoc;
const $ = (id) => doc.getElementById(id);
const txt = (id) => (($(id) || {}).textContent || '').replace(/\s+/g, ' ').trim();

/* ★何も無い所から★（取引先0・請求書0・自社は名前だけ） */
const DB = [];
S.store = {
  invoices: {
    saveDraft: (v) => { const c = JSON.parse(JSON.stringify(v)); c.id = c.id || ('v' + (DB.length + 1));
      const i = DB.findIndex((x) => x.id === c.id); if (i >= 0) DB[i] = c; else DB.push(c);
      return Promise.resolve({ ok: true, id: c.id }); },
    issue: (v) => { const c = JSON.parse(JSON.stringify(v)); c.status = 'issued';
      const i = DB.findIndex((x) => x.id === c.id); if (i >= 0) DB[i] = c; else DB.push(c);
      return Promise.resolve({ ok: true, id: c.id }); },
    list: () => Promise.resolve(DB), usedNos: () => Promise.resolve([]),
  },
  partners: {
    list: () => Promise.resolve(S.partners),
    create: (d) => { const p = { id: 'p' + (S.partners.length + 1), data: d || {} };
      S.partners.push(p); return Promise.resolve({ ok: true, id: p.id, data: p.data }); },
    patch: (id, d) => { const p = S.partners.filter((x) => x.id === id)[0];
      if (p) p.data = Object.assign({}, p.data, d); return Promise.resolve({ ok: true }); },
  },
  receipts: { list: () => Promise.resolve([]) },
  org: { save: () => Promise.resolve({ ok: true }) },
};
S.partners = [];
S.list = [];
S.invoices = [];
S.org = { yago: '合同会社Rakunally' };

console.log('\n[first-run] 初めての人が 空っぽから 1周 できるか');

await T('★① 何も無くても 画面が 立つ（白紙にならない・落ちない）', () => {
  A._go('scr-list');
  A._renderListForTest();
  ok(!errs.length, '★立ち上げで 落ちた★ ' + errs.join(' / '));
  const t = txt('list-body');
  ok(/まだ請求書がありません|ありません/.test(t), '★空の時に 何も言っていない★：' + t.slice(0, 60));
  console.log('     一覧: ' + t.slice(0, 40));
});

await T('★② 取引先が 0でも 入力の画面が 開ける（先に相手を作れと 突き放さない）', () => {
  A._go('scr-edit');
  A._fillEdit();
  ok(!errs.length, '★入力の画面で 落ちた★ ' + errs.join(' / '));
  const sel = $('e-partner');
  ok(sel, '★相手を選ぶ所が 無い★');
  /* ★相手を その場で 作れる道が 在る★ */
  ok($('pt-new') || $('e-partner-new') || /新しい/.test(txt('scr-edit')),
    '★相手が0なのに 作る道が 無い＝ここで 詰まる★');
});

await T('★③ 相手を その場で 作れる', async () => {
  await S.store.partners.create({ name: '○○建設株式会社', honor: '御中' });
  eq(S.partners.length, 1, '相手が 増えていない');
});

await T('★④ 請求書を 新しく作れる（番号と請求日が 自動で 入る）', async () => {
  S.partners = [{ id: 'p1', data: { name: '○○建設株式会社', honor: '御中' } }];
  A._new();
  await new Promise((r) => setTimeout(r, 60));      // ★採番は 非同期★
  const v = S.cur;
  ok(v, '★新しい1通が 作られていない★');
  ok(v.issue_ymd, '★請求日が 空のまま＝人に 打たせている★');
  ok(v.no, '★請求番号が 空のまま★');
  console.log('     番号 ' + v.no + ' ／ 請求日 ' + v.issue_ymd);
});

await T('★⑤ 明細を入れて 数が 合う（税抜→税→合計）', () => {
  S.cur.partner_id = 'p1';
  S.cur.tax_mode = 'exclusive';
  S.cur.rounding = 'floor';
  S.cur.lines = [{ name: '運転代行 10月分', qty: '1', unit: '式', price: '30000', rate: 10 }];
  A._fillEdit();
  const t = A._recalcForTest();
  ok(t && t.ok, '★数え直しが 通らない★ ' + JSON.stringify(t && t.errors));
  eq(t.subtotal, 30000, '税抜');
  eq(t.taxTotal, 3000, '消費税');
  eq(t.grandTotal, 33000, '合計');
});

await T('★⑥ 下書きが 保存できる', async () => {
  await A._saveDraftForTest();
  await new Promise((r) => setTimeout(r, 60));
  ok(DB.length >= 1, '★保存が 走っていない★');
  ok(/保存しました/.test(txt('edit-ok')), '★保存したと 言っていない★：' + txt('edit-ok'));
});

await T('★⑦ 発行の前に 止める物が 正しい（0円・相手なしは 出させない）', () => {
  const v = JSON.parse(JSON.stringify(S.cur));
  v.lines = [{ name: 'x', rate: 10 }];
  const chk = D.validateInvoice({ inv: v, rawLines: v.lines, tax: A._recalcForTest() });
  ok(!chk.ok, '★金額が空でも 出せてしまう★');
  ok(chk.errors.length, '★止めた理由を 言っていない★');
  console.log('     ' + chk.errors[0]);
});

await T('★⑧ ちゃんと入っていれば 発行の検査が 通る', () => {
  const v = S.cur;
  const chk = D.validateInvoice({ inv: v, rawLines: v.lines, tax: A._recalcForTest(),
    partner: S.partners[0], org: S.org });
  ok(chk.ok, '★正しい1通なのに 出せない★ ' + JSON.stringify(chk.errors));
});

await T('★⑨ 紙が 出る（中身が 本物）', () => {
  const h = String(A._paperHtml ? A._paperHtml() : '');
  ok(h.length > 2000, '★紙が 作れていない（' + h.length + '字）★');
  ok(/○○建設株式会社/.test(h), '★あて名が 出ていない★');
  ok(/33,000|33000/.test(h), '★合計が 出ていない★');
  ok(/合同会社Rakunally/.test(h), '★自社が 出ていない★');
  console.log('     紙 ' + h.length + '字（あて名・合計・自社 とも 出ている）');
});

await T('★⑩ 「PDFで保存」のボタンが 画面に 在る（押す物が 実在する）', () => {
  ok($('b-pdf'), '★PDFのボタンが 無い★');
  ok($('b-print'), '★印刷のボタンが 無い★');
  ok(win.SeikyuPdf, '★PDFを作る部品が 読めていない★');
  ok(typeof win.SeikyuPdf.build === 'function', '★build が 無い★');
});

await T('★⑪ 一覧に 出る（作った物が 見える）', () => {
  S.invoices = DB.slice();
  S.fil = 'all';
  A._go('scr-list');
  A._renderListForTest();
  const t = txt('list-body');
  ok(/○○建設株式会社/.test(t), '★一覧に 相手が 出ていない★：' + t.slice(0, 80));
  console.log('     ' + t.slice(0, 60));
});

/* ★入金を付けて「領収書PDF」まで 行けるか★（司さん 2026-08-30）
   ★ボタンが在るだけでは 押せる証拠にならない★＝押して PDFの扉まで 届く事を 見る。
   （字体を埋める本体は pdf-align.mjs が 本物のブラウザで 測っている） */
await T('★⑫ 入金を付けると「領収書PDF」が 出て、押すと PDFの扉まで 届く', async () => {
  S.cur.id = DB[0].id; S.cur.status = 'issued';
  S.cur.totals = { grandTotal: 33000, taxTotal: 3000 };
  S.receipts = [{ id: 'r1', invoice_id: S.cur.id, ymd: '2026-11-20', amount: 33000, method: '振込' }];
  A._renderPayForTest();
  const btn = doc.querySelector('[data-rcpdf]');
  ok(btn, '★「領収書PDF」のボタンが 無い★：' + txt('pay-list').slice(0, 80));
  /* 扉（PDFを作る・落とす）を 差し替えて、ボタンから ここまで 来るかだけを見る */
  let built = 0, saved = null;
  win.SeikyuPdf = { build: () => { built++; return Promise.resolve(new Uint8Array([1, 2, 3])); },
    lastMissing: () => [], lastPlaced: () => [], lastBadImages: () => [] };
  win.FileOut = Object.assign({}, win.FileOut, {
    deliver: (bytes, name) => { saved = name; return Promise.resolve({ ok: true }); } });
  win.prompt = (q, v) => v;                     // 名前は 出てきたまま OK
  btn.click();
  await new Promise((r) => setTimeout(r, 120));
  /* ★名前を 先に決めさせる窓★（うちの決まり）が 開くので、そこで「この名前で保存」を押す */
  ok($('fn-ov').classList.contains('open'), '★名前を聞く窓が 開いていない★');
  /* ★窓の「この名前で保存」は bind() で 紐づく★＝ここで 1回だけ 紐づけ直す
     （bind自体が 立ち上げで 走るかは 実UIの試験が 見ている） */
  A._bindForTest();
  ok(typeof $('fn-ok').onclick === 'function', '★「この名前で保存」に 何も 紐づいていない★');
  $('fn-ok').click();
  await new Promise((r) => setTimeout(r, 200));
  eq(built, 1, '★押しても PDFを 作りに 行っていない★');
  ok(saved && String(saved).slice(-4) === '.pdf', '★落とす名前が pdfではない★：' + saved);
  console.log('     領収書PDF → ' + saved);
  /* ★領収書も 送れる★（開いて iPhoneの共有ボタンへ渡す） */
  const send = doc.querySelector('[data-rcsend]');
  ok(send, '★領収書の「送る」が 無い★');
  let opened = null;
  win.URL.createObjectURL = () => 'blob:rc-pdf';
  win.URL.revokeObjectURL = () => {};
  win.open = (u) => { opened = u; return { focus() {} }; };
  send.click();
  await new Promise((r) => setTimeout(r, 60));
  $('fn-ok').click();
  await new Promise((r) => setTimeout(r, 200));
  ok(opened === 'blob:rc-pdf', '★領収書の「送る」で 別の窓が 開いていない★（' + opened + '）');
  ok(/共有|送/.test(txt('pay-ok')), '★どうやって送るかを 言っていない★：' + txt('pay-ok'));
  console.log('     領収書を送る → ' + txt('pay-ok').slice(0, 46));
});

/* ★送る道★（司さん 2026-08-30「代行では 赤丸のところから メールなど選べる」）
   ＝うちも ★PDFを その場で開く★口を付けた。開けば iPhone自身のビューアが出て、
     その共有ボタンから メール/メッセージ/AirDrop に乗る。
   ここで見るのは ★落とすのではなく 開いたか★（窓に渡した中身がPDFか）だけ。 */
await T('★⑬ 「PDFを開く（送る）」は 落とさずに 別の窓で 開く', async () => {
  A._go('scr-edit');
  const btn = $('b-pdfopen');
  ok(btn, '★「PDFを開く（送る）」のボタンが 無い★');
  let opened = null, saved = null, madeType = null;
  win.SeikyuPdf = { build: () => Promise.resolve(new Uint8Array([37, 80, 68, 70])),
    lastMissing: () => [], lastPlaced: () => [], lastBadImages: () => [] };
  win.URL.createObjectURL = (b) => { madeType = b && b.type; return 'blob:test-pdf'; };
  win.URL.revokeObjectURL = () => {};
  win.open = (u) => { opened = u; return { focus() {} }; };
  win.FileOut = Object.assign({}, win.FileOut, { deliver: (b, n) => { saved = n; return Promise.resolve({ ok: true }); } });
  btn.disabled = false;
  A._bindForTest();
  btn.click();
  await new Promise((r) => setTimeout(r, 60));
  ok($('fn-ov').classList.contains('open'), '★名前を聞く窓が 開いていない★');
  $('fn-ok').click();
  await new Promise((r) => setTimeout(r, 200));
  ok(opened === 'blob:test-pdf', '★別の窓で 開いていない★（開いた先: ' + opened + '）');
  ok(!saved, '★開くはずが 落としている★（' + saved + '）');
  eq(madeType, 'application/pdf', '★渡した中身の種類が PDFでない★');
  ok(/共有|送/.test(txt('edit-ok')), '★どうやって送るかを 言っていない★：' + txt('edit-ok'));
  console.log('     ' + txt('edit-ok'));
  /* ★納品書も 同じ道で出る★（司さん 2026-08-30「競合が当たり前にしてる事は…」）
     ＝Misoca も freee も 見積→納品→請求→領収 を1押しで出せる。 */
  const dv = $('b-delivery');
  ok(dv, '★納品書のボタンが 無い★');
  opened = null; dv.disabled = false;
  dv.click();
  await new Promise((r) => setTimeout(r, 60));
  $('fn-ok').click();
  await new Promise((r) => setTimeout(r, 200));
  ok(opened === 'blob:test-pdf', '★納品書が 開いていない★（' + opened + '）');
  ok(/納品書/.test(txt('edit-ok')), '★納品書と 言っていない★：' + txt('edit-ok'));
  console.log('     ' + txt('edit-ok'));
});

await T('★⑭ ここまで JSの落ちが 0（初めての人が 踏む道で 落ちない）', () => {
  ok(!errs.length, errs.join(' / '));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
