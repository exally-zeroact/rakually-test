/* find.test.mjs — ★探す（取引先・請求日・金額で 絞る）★
 * ============================================================================
 * ★司さん 2026-08-30「ほかの競合のアプリなどが 当たり前にしてる事は こちらも
 *   当たり前にしてな」★ の6つ目。
 *   請求書ソフトは どこも 一覧を探せる。うちは 状態の切替だけで
 *   ★相手の名前でも 番号でも 探せなかった★＝紙が増えるほど 使えなくなる。
 *
 * ★法律の側からも 同じ形が 要る（国税庁 電子帳簿保存法・電子取引の保存）★
 *   ① 取引年月日・取引金額・取引先 で探せる
 *   ② 日付・金額は 範囲で探せる
 *   ③ 2つ以上を 組み合わせて探せる
 *
 * 使い方: node seikyu/tests/find.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(import.meta.url);
const F = require_(path.join(ROOT, 'seikyu/lib/seikyu-find.js'));
const SELF = process.argv.includes('--self-test');

let pass = 0, fail = 0;
const T = async (n, fn) => {
  try { await fn(); pass++; console.log('  ✓ ' + n); }
  catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); }
};
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' … 期待 ' + JSON.stringify(b) + ' / 実際 ' + JSON.stringify(a)); };

const LIST = [
  { id: '1', no: '202608-001', issue_ymd: '2026-08-05', partner_id: 'p1',
    totals: { grandTotal: 33000 }, data: { subject: '8月分' }, snapshot: { partner: { name: '八木工業' } } },
  { id: '2', no: '202608-002', issue_ymd: '2026-08-20', partner_id: 'p2',
    totals: { grandTotal: 11000 }, data: { subject: '空調工事' }, snapshot: { partner: { name: '黒田空調工業' } } },
  { id: '3', no: '202607-001', issue_ymd: '2026-07-31', partner_id: 'p1',
    totals: { grandTotal: 5000 }, data: {}, snapshot: { partner: { name: '八木工業' } } },
  { id: '4', no: '', issue_ymd: '', partner_id: 'p3',
    totals: {}, data: { memo: '下書き 金額まだ' }, snapshot: {} },
];
const CTX = { partnerName: (v) => (v.snapshot && v.snapshot.partner && v.snapshot.partner.name) || '' };
const ids = (q) => F.filter(LIST, q, CTX).map((v) => v.id).join(',');

console.log('\n[find] 探す（相手・請求日・金額）');

await T('★① 何も入れていなければ 全部（探していない時に 消さない）', () => {
  ok(F.isEmpty({}), '空と 見ていない');
  ok(F.isEmpty({ text: '  ', from: '', min: '' }), '空白だけを 空と見ていない');
  eq(ids({}), '1,2,3,4', '全部 返っていない');
});

await T('★② 取引先の名前で 探せる', () => {
  eq(ids({ text: '八木' }), '1,3', '相手で 絞れない');
  eq(ids({ text: '空調' }), '2', '部分一致で 絞れない');
});

await T('★③ 請求番号・件名・備考でも 探せる（人が覚えている物で 探せる）', () => {
  eq(ids({ text: '202608-002' }), '2', '番号で 探せない');
  eq(ids({ text: '8月分' }), '1', '件名で 探せない');
  eq(ids({ text: '金額まだ' }), '4', '備考で 探せない');
});

await T('★④ 取引年月日の範囲で 探せる（電帳法②）', () => {
  eq(ids({ from: '2026-08-01' }), '1,2', 'これ以降');
  eq(ids({ to: '2026-07-31' }), '3', 'これ以前');
  eq(ids({ from: '2026-08-01', to: '2026-08-10' }), '1', '範囲');
});

await T('★⑤ 月だけ入れても 落とさない（「2026-08」まで＝その月の末日まで）', () => {
  eq(ids({ to: '2026-08' }), '1,2,3', '月で切ると 8月が 落ちる');
});

await T('★⑥ 取引金額の範囲で 探せる（電帳法②）', () => {
  eq(ids({ min: '10000' }), '1,2', 'これ以上');
  eq(ids({ max: '11000' }), '2,3', 'これ以下');
  eq(ids({ min: '10000', max: '20000' }), '2', '範囲');
});

await T('★⑦ 2つ以上を 組み合わせて 探せる（電帳法③）', () => {
  eq(ids({ text: '八木', from: '2026-08-01' }), '1', '相手＋日付');
  eq(ids({ text: '八木', max: '10000' }), '3', '相手＋金額');
  eq(ids({ text: '八木 8月分' }), '1', '★言葉を2つ入れると ぜんぶ含む物だけ★');
});

await T('★⑧ 全角の数字・記号でも 探せる（スマホの入力で よく混ざる）', () => {
  eq(ids({ min: '１００００' }), '1,2', '全角の数字');
  eq(ids({ from: '2026/08/01' }), '1,2', 'スラッシュ');
  eq(ids({ min: '10,000' }), '1,2', 'カンマ');
  eq(ids({ min: '¥10000' }), '1,2', '円の印');
});

await T('★⑨ 金額が まだ無い紙は、金額で絞った時だけ 落ちる（勝手に0円と見ない）', () => {
  ok(ids({ text: '金額まだ' }).indexOf('4') >= 0, '文字では 出るはず');
  eq(ids({ min: '0' }).indexOf('4'), -1, '★金額の無い紙を 0円として 拾っている★');
});

await T('★⑩ 日付が まだ無い紙も 同じ（範囲を決めた時だけ 落ちる）', () => {
  eq(ids({ from: '2000-01-01' }).indexOf('4'), -1, '★日付の無い紙を 拾っている★');
});

/* ★実UIで 打つ★ */
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
  St.invoices = LIST.map((v) => Object.assign({ doc_type: 'invoice', status: 'issued' }, v));
  St.partners = [{ id: 'p1', data: { name: '八木工業' } }, { id: 'p2', data: { name: '黒田空調工業' } }];
  St.receipts = []; St.kind = 'invoice'; St.fil = 'all';
  A._bindForTest();
  A._go('scr-list'); A._renderListForTest();
  const rows = () => doc.querySelectorAll('#list-body [data-open]').length;
  const txt = (id) => ((doc.getElementById(id) || {}).textContent || '').replace(/\s+/g, ' ').trim();

  await T('★⑪ 探す前は ぜんぶ 出ている（実UI・★描かれた行を数える★）', () => {
    eq(rows(), 4, '出ている行');
  });

  await T('★⑫ 相手の名前を打つと 絞られ、何通から何通かを 言う（実UI）', () => {
    const el = doc.getElementById('q-text');
    el.value = '八木';
    el.dispatchEvent(new win.Event('input', { bubbles: true }));
    eq(rows(), 2, '★絞れていない★');
    ok(/4通のうち 2通/.test(txt('q-hint')), '★何通から何通かを 言っていない★：' + txt('q-hint'));
    console.log('     ' + txt('q-hint'));
  });

  await T('★⑬ 「探すのをやめる」で 元に戻る（実UI）', () => {
    doc.getElementById('b-q-clear').click();
    eq(rows(), 4, '★戻っていない★');
    eq(doc.getElementById('q-text').value, '', '打った字が 残っている');
    eq(txt('q-hint'), '', '案内が 残っている');
  });

  await T('★⑭ 日付と金額の範囲も 画面から効く（実UI）', () => {
    doc.getElementById('q-from').value = '2026-08-01';
    doc.getElementById('q-from').dispatchEvent(new win.Event('input', { bubbles: true }));
    eq(rows(), 2, '日付で 絞れない');
    doc.getElementById('q-min').value = '20000';
    doc.getElementById('q-min').dispatchEvent(new win.Event('input', { bubbles: true }));
    eq(rows(), 1, '日付＋金額で 絞れない');
    doc.getElementById('b-q-clear').click();
  });
} else {
  console.log('  ※ jsdom が無いので 実UIの4本は 走っていません（★0件ではありません★）');
}

if (SELF) {
  console.log('\n★自己確認★ 条件を無視する姿にすると 赤になるか');
  const all = F.filter(LIST, { text: '八木' }, CTX).length;
  if (all !== 2) { console.log('  NG ★今の姿で すでに ' + all + '件★'); process.exit(1); }
  console.log('  ok  今は 2件＝素通しにすれば 4件になり ②が赤になる');
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
