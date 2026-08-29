/* draft-noamount.mjs — ★項目だけ入れて 金額は あとから★（司さん 2026-08-30）
 * =============================================================================
 * 司さんの問い「請求書を入力してて 項目だけ入れて 金額入れずに 保存もしとける？
 *              （入力途中からか 一覧から 金額を後から入力）」
 *
 * ここで見る物（★本物の画面で 実際に 保存して 開き直す★）
 *   ① 金額を1つも入れずに ★下書きが 保存できる★
 *   ② 保存した物に ★品名が 1行も 落ちずに 残る★（黙って小さくならない）
 *   ③ 一覧から 開き直して ★金額を あとから 入れられる★（合計が 出る）
 *   ④ 一覧で ★「0円」と 見せない★＝「金額まだ ◯行」と出る
 *      （★入れ忘れ★と ★本当の0円★を 見分けられる）
 *   ⑤ ★金額が空のまま 発行しようとしたら 止まる★（0円の紙を 客へ出さない）
 *
 * 使い方: node seikyu/tests/draft-noamount.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません。この検証は飛ばせません。npm install してください。'); process.exit(1); }

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
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
win.open = () => ({ document: { write() {}, close() {} }, focus() {}, print() {}, close() {} });
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
const DB = [];
S.store = {
  invoices: {
    saveDraft: (v) => {
      const c = JSON.parse(JSON.stringify(v)); c.id = 'v1'; c.status = 'draft';
      const i = DB.findIndex((x) => x.id === 'v1'); if (i >= 0) DB[i] = c; else DB.push(c);
      return Promise.resolve({ ok: true, id: 'v1' });
    },
    list: () => Promise.resolve(DB), usedNos: () => Promise.resolve([]),
  },
  partners: { list: () => Promise.resolve(S.partners), patch: () => Promise.resolve({ ok: true }) },
  receipts: { list: () => Promise.resolve([]) },
};
S.partners = [{ id: 'p1', data: { name: '○○建設株式会社', honor: '御中' } }];
S.org = { yago: '合同会社Rakunally' };
S.list = [];
/* ★項目だけ 入れて 金額は 空★ */
const NAMES = ['運転代行 10月分', '待機料', '高速代'];
S.cur = { id: null, partner_id: 'p1', no: 'A-0001', issue_ymd: '2026-10-05', due_ymd: '',
  tax_mode: 'exclusive', rounding: 'floor', status: 'draft', totals: {},
  lines: NAMES.map((n) => ({ name: n, rate: 10 })), data: {} };
A._go('scr-edit'); A._fillEdit();

console.log('\n[draft-noamount] 項目だけ入れて 金額は あとから');

await A._saveDraftForTest();
await new Promise((r) => setTimeout(r, 120));

T('★① 金額を1つも入れずに 下書きが 保存できる', () => {
  eq(((doc.getElementById('edit-err') || {}).textContent || ''), '', '★赤が 出ている★');
  ok(/下書きを保存しました/.test((doc.getElementById('edit-ok') || {}).textContent || ''), '★保存したと 言っていない★');
  eq(DB.length, 1, '倉庫に 入っていない');
});

T('★② 品名が 1行も 落ちない（黙って小さくならない）', () => {
  const got = (DB[0].lines || []).map((l) => l.name);
  eq(got.join(' / '), NAMES.join(' / '), '★品名が 変わった／消えた★');
  ok((DB[0].lines || []).every((l) => l.amount === undefined), '★入れていない金額が 0で 入っている★');
  console.log('     ' + got.length + '行 … ' + got.join(' / '));
});

T('★③ 一覧から 開き直して 金額を あとから 入れられる', () => {
  S.list = DB.slice();
  S.cur = JSON.parse(JSON.stringify(DB[0]));
  A._go('scr-edit'); A._fillEdit();
  eq((S.cur.lines || []).map((l) => l.name).join(','), NAMES.join(','), '開き直したら 品名が 変わった');
  S.cur.lines[0].amount = 30000; S.cur.lines[1].amount = 5000; S.cur.lines[2].amount = 1200;
  const t = A._recalcForTest();
  ok(t && t.ok, '★あとから入れたら 止まった★');
  eq(t.grandTotal, 39820, '合計');
  console.log('     30,000＋5,000＋1,200 → 合計 ' + t.grandTotal + '（税込）');
});

T('★④ 一覧で「0円」と 見せない（金額まだ ◯行 と出る）', () => {
  S.invoices = DB.slice();
  S.cur = JSON.parse(JSON.stringify(DB[0]));
  S.fil = 'all';
  A._go('scr-list');
  A._renderListForTest();
  const t = (doc.getElementById('list-body') || {}).textContent || '';
  ok(/金額まだ 3行/.test(t), '★「金額まだ」と 出ていない★：' + t.replace(/\s+/g, ' ').slice(0, 120));
  ok(!/0 円/.test(t), '★0円と 出ている（入れ忘れと 本当の0円が 見分けられない）★');
  console.log('     一覧: ' + t.replace(/\s+/g, ' ').trim().slice(0, 70));
});

T('★⑤ 金額が空のまま 発行しようとしたら 止まる', () => {
  const v = JSON.parse(JSON.stringify(DB[0]));
  S.cur = v;
  const chk = D.validateInvoice({ inv: v, rawLines: v.lines, tax: A._recalcForTest() });
  ok(!chk.ok, '★0円の紙が 出せてしまう★');
  ok(chk.errors.some((e) => /金額が空/.test(e)), '★金額が空だと 言っていない★ ' + JSON.stringify(chk.errors));
  ok(chk.errors.some((e) => /0円の請求書は出せません/.test(e)), '★0円を 止めていない★');
  console.log('     ' + chk.errors[0]);
});

T('★⑥ ここまで JSの落ちが0', () => { ok(!errs.length, errs.join(' / ')); });

/* ═══ ★自己確認：わざと壊して 赤になるか★ ═══ */
if (process.argv.includes('--self-test')) {
  console.log('\n[--self-test] ★わざと壊すと 赤になるか★');
  T('★自① 金額を全部入れたら 「金額まだ」は 出ない（空振りしていない）', () => {
    const v = JSON.parse(JSON.stringify(DB[0]));
    v.lines = v.lines.map((l, i) => Object.assign({}, l, { amount: 1000 * (i + 1) }));
    v.totals = { grandTotal: 6600 };
    S.invoices = [v]; S.fil = 'all';
    A._go('scr-list'); A._renderListForTest();
    const t = (doc.getElementById('list-body') || {}).textContent || '';
    ok(!/金額まだ/.test(t), '★入れたのに まだ「金額まだ」と 出ている★');
    console.log('     ' + t.replace(/\s+/g, ' ').trim().slice(0, 60));
  });
  T('★自② 発行済みには 「金額まだ」を 出さない（下書きだけの印）', () => {
    const v = JSON.parse(JSON.stringify(DB[0]));
    v.status = 'issued'; v.totals = { grandTotal: 0 };
    S.invoices = [v]; S.fil = 'all';
    A._go('scr-list'); A._renderListForTest();
    const t = (doc.getElementById('list-body') || {}).textContent || '';
    ok(!/金額まだ/.test(t), '★発行済みにも 出ている★');
  });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
