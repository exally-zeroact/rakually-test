/* report.test.mjs — ★集計（月ごと・取引先ごとに いくら請求／入金／残り）★
 * ============================================================================
 * ★司さん 2026-08-30「ほかの競合のアプリなどが 当たり前にしてる事は こちらも
 *   当たり前にしてな」★ … 請求書ソフトは どこも 集計を持っていて、うちだけ 無かった。
 *
 * ★測り方は 代行請求(daikou-seikyu.html renderReport)から借りた★
 *   ＝月を選ぶ → 請求／入金／残り の3つ ＋ 取引先ごとの表（大きい順）
 *
 * ★ここで守らせる事★
 *   ① 下書き・取り消し・見積 を 売上に混ぜない（まだ請求していない物を 数えない）
 *   ② ★入金が読めていない時は null★（0円と書かない＝うちで一番 高くついた型）
 *   ③ 数え方は seikyu-doc.paymentStateOf 1本（2つ目の正を作らない）
 *   ④ 実UIでも 同じ数が 出る（部品だけ緑で 画面が違う、を許さない）
 *
 * 使い方: node seikyu/tests/report.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(import.meta.url);
const REP = require_(path.join(ROOT, 'seikyu/lib/seikyu-report.js'));
const DOC = require_(path.join(ROOT, 'seikyu/lib/seikyu-doc.js'));
const SELF = process.argv.includes('--self-test');

let pass = 0, fail = 0;
const T = (n, fn) => {
  try { fn(); pass++; console.log('  ✓ ' + n); }
  catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); }
};
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' … 期待 ' + JSON.stringify(b) + ' / 実際 ' + JSON.stringify(a)); };

const INV = [
  { id: 'a', doc_type: 'invoice', status: 'issued', issue_ymd: '2026-08-05', partner_id: 'p1', totals: { grandTotal: 33000 } },
  { id: 'b', doc_type: 'invoice', status: 'issued', issue_ymd: '2026-08-20', partner_id: 'p2', totals: { grandTotal: 11000 } },
  { id: 'c', doc_type: 'invoice', status: 'draft', issue_ymd: '2026-08-21', partner_id: 'p1', totals: { grandTotal: 99999 } },
  { id: 'd', doc_type: 'invoice', status: 'void', issue_ymd: '2026-08-22', partner_id: 'p1', totals: { grandTotal: 88888 } },
  { id: 'e', doc_type: 'quote', status: 'issued', issue_ymd: '2026-08-23', partner_id: 'p1', totals: { grandTotal: 77777 } },
  { id: 'f', doc_type: 'invoice', status: 'issued', issue_ymd: '2026-07-31', partner_id: 'p1', totals: { grandTotal: 5000 } },
  { id: 'g', doc_type: 'invoice', status: 'issued', issue_ymd: '', partner_id: 'p1', totals: { grandTotal: 1000 } },
];
const RC = [
  { invoice_id: 'a', amount: 33000, ymd: '2026-09-01' },
  { invoice_id: 'b', amount: 5000, ymd: '2026-09-02' },
  { invoice_id: 'b', amount: 1000, ymd: '2026-09-03', deleted_at: '2026-09-04' },
];
const PT = [{ id: 'p1', data: { name: '八木工業' } }, { id: 'p2', data: { name: '黒田空調' } }];
const S = (o) => REP.summarize(Object.assign({ invoices: INV, receipts: RC, partners: PT, doc: DOC }, o));

console.log('\n[report] 集計（月ごと・取引先ごと）');

T('★① 月の一覧は 請求日から作る（新しい順・日付なしは入れない）', () => {
  eq(REP.monthsOf(INV).join(' '), '2026-08 2026-07', '月の並び');
});

T('★② 出した請求書だけ数える（下書き・取り消し・見積を 売上に混ぜない）', () => {
  const s = S({ month: '2026-08' });
  eq(s.seen, 2, '数えた通数');
  eq(s.totals.total, 44000, '請求の合計');
  eq(s.totals.count, 2, '通数');
});

T('★③ 入金は 消した行を数えない（数が黙って狂わない）', () => {
  const s = S({ month: '2026-08' });
  eq(s.totals.paid, 38000, '入金');
  eq(s.totals.remain, 6000, '残り');
  eq(s.totals.unpaidCount, 1, 'まだ残っている通数');
});

T('★④ 取引先ごと・大きい順（誰に いくら残っているかが 分かる）', () => {
  const s = S({ month: '2026-08' });
  eq(s.rows.map((r) => r.name).join(' '), '八木工業 黒田空調', '並び');
  eq(s.rows[0].state, 'paid', '八木の状態');
  eq(s.rows[1].state, 'partial', '黒田の状態');
  eq(s.rows[1].remain, 6000, '黒田の残り');
});

T('★⑤ 入金が読めていない時は null（0円と書かない）', () => {
  const s = S({ month: '2026-08', receipts: null });
  eq(s.totals.total, 44000, '請求は数えられる');
  eq(s.totals.paid, null, '入金');
  eq(s.totals.remain, null, '残り');
  eq(s.totals.unpaidCount, null, '未入金の通数');
  eq(s.rows[0].paid, null, '取引先ごとの入金');
});

T('★⑥ 月を選ばなければ ぜんぶ（日付なしの1通も 数に入る）', () => {
  const s = S({ month: '' });
  eq(s.seen, 4, '通数（8月2通＋7月1通＋日付なし1通）');
  eq(s.totals.total, 50000, '合計');
});

T('★⑦ 見積だけを見る事も出来る（種類で分かれている）', () => {
  const s = S({ month: '2026-08', kind: 'quote' });
  eq(s.seen, 1, '見積の通数');
  eq(s.totals.total, 77777, '見積の合計');
});

T('★⑧ 数え方は seikyu-doc 1本（ここで数え直していない）', () => {
  const src = fs.readFileSync(path.join(ROOT, 'seikyu/lib/seikyu-report.js'), 'utf8');
  ok(/paymentStateOf/.test(src), '★入金の数え方を 自分で書いている★');
  ok(!/deleted_at/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')),
    '★消した入金の扱いを ここでも書いている＝2つ目の正★');
});

T('★⑨ 相手が消えていても 名前を出す（写しから拾う・空にしない）', () => {
  const s = REP.summarize({
    doc: DOC, month: '', partners: [], receipts: RC,
    invoices: [{
      id: 'z', doc_type: 'invoice', status: 'issued', issue_ymd: '2026-08-01',
      partner_id: 'gone', totals: { grandTotal: 100 }, snapshot: { partner: { name: '消えた会社' } },
    }],
  });
  eq(s.rows[0].name, '消えた会社', '写しから拾えていない');
});

/* ★実UIでも 同じ数が出る★（部品だけ緑で 画面が違う、を許さない） */
let JSDOM; try { ({ JSDOM } = await import('jsdom')); } catch { JSDOM = null; }
if (JSDOM) {
  const file = path.join(ROOT, 'seikyu/index.html');
  const html = fs.readFileSync(file, 'utf8');
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''),
    { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/seikyu/index.html' });
  const win = dom.window, doc = win.document;
  win.fetch = () => Promise.reject(new Error('no net'));
  win.scrollTo = () => {};
  for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
    const src = m[1].split('?')[0];
    if (/^https?:/.test(src) || ['supa-config.js', 'auth.js', 'env-badge.js'].indexOf(src.split('/').pop()) >= 0) continue;
    const p = path.resolve(path.dirname(file), src);
    if (!fs.existsSync(p)) continue;
    const el = doc.createElement('script');
    el.textContent = fs.readFileSync(p, 'utf8');
    doc.body.appendChild(el);
  }
  await new Promise((r) => setTimeout(r, 300));
  doc.getElementById('app').hidden = false;
  const A = win.SeikyuApp, St = A._state;
  St.invoices = INV; St.receipts = RC; St.partners = PT; St.kind = 'invoice'; St.fil = 'all';
  A._go('scr-list'); A._renderListForTest();
  const txt = (id) => ((doc.getElementById(id) || {}).textContent || '').replace(/\s+/g, ' ').trim();

  T('★⑩ 画面の1行に 請求・入金・残りが 出ている（実UI）', () => {
    const t = txt('rep-sum');
    ok(/請求/.test(t) && /入金/.test(t) && /残り/.test(t), '★出ていない★：' + t);
    ok(/44,000/.test(t), '★8月の請求 44,000 が 出ていない★：' + t);
    console.log('     ' + t);
  });
  T('★⑪ 取引先ごとの表が 画面に出ている（実UI）', () => {
    const t = txt('rep-body');
    ok(/八木工業/.test(t) && /黒田空調/.test(t), '★相手が 出ていない★：' + t.slice(0, 80));
    console.log('     ' + t.slice(0, 76));
  });
  T('★⑫ 入金が読めていない時は 画面も「未確認」（0円と書かない）', () => {
    St.receipts = null; A._renderListForTest();
    const t = txt('rep-sum');
    ok(/未確認/.test(t), '★0円と書いている★：' + t);
    St.receipts = RC;
  });
  T('★⑬ 見積を見ている時は 集計を出さない（見積は 請求ではない）', () => {
    St.kind = 'quote'; A._renderListForTest();
    ok(doc.getElementById('rep-sum').style.display === 'none', '★見積でも 売上の集計が 出ている★');
    St.kind = 'invoice'; A._renderListForTest();
  });
} else {
  console.log('  ※ jsdom が無いので 実UIの4本は 走っていません（★0件ではありません★）');
}

if (SELF) {
  console.log('\n★自己確認★ 下書きを 売上に混ぜたら 赤になるか');
  const bad = REP.summarize({
    doc: DOC, month: '2026-08', receipts: RC, partners: PT,
    invoices: INV.map((v) => (v.status === 'draft' ? Object.assign({}, v, { status: 'issued' }) : v)),
  });
  if (bad.totals.total === 44000) { console.log('  NG ★混ぜても 数が変わらない＝見張りが効いていない★'); process.exit(1); }
  console.log('  ok  混ぜると ' + bad.totals.total + ' 円になる＝ちゃんと 変わる');
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
