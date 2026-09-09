/* itsudemo-naoseru.mjs — ★いつでも 直せる／前の 項目と 控除を 覚えている★
 * =============================================================================
 * 司さん 2026-09-09
 *   「あと ★一覧から 取り消して 入力画面はいると 何も触れない★」
 *   「★発行とゆう概念が めんどくさい★」
 *   「代行請求書のように ★いつでも編集できるように★するのと
 *     ★請求日を いつでも 触れるように★するのと」
 *   「項目や控除は ★前のを 記憶して 消すか 足すか 選べたらええ★
 *     記憶してたら 金額変えたりするだけだから 楽
 *     （項目名や 控除名も もちろん ★その場で 変えれたらええ★）」
 *
 * ★代行請求（Exally-test/daikou-seikyu.html）を 読んで 分かった事★
 *   ・請求書に ★状態の 列が 無い★（status は 入金の 状態だけ）
 *   ・請求書は 保存された物ですら 無く ★毎回 明細から 作り直す★
 *   ・過去月でも PDFを 出した後でも ★何のブロックも 無く 直せる★
 *   ・番号だけ ★1社PDFを 出した時に 確定★し、DBの unique で 二度使わない
 *
 * 見る物:
 *   ① 下書き・発行済み・取り消し済み ★どれも 直せる★
 *   ② 発行済み・取り消し済みで ★欄が 塞がっていない★（請求日を 名指しで 見る）
 *   ③ 「発行する」は ★下書きの時だけ★（番号を 付ける 1回きり）
 *   ④ 保存しても ★状態が 下書きに 落ちない★
 *   ⑤ 消す決まりは 変えていない（発行済みは 消せない＝番号を 欠番に しない）
 *   ⑥ ★前回の 明細と 控除を 覚えて 入れる★（金額を 変えるだけで 済む）
 *   ⑦ ★打ち始めていたら 上書きしない★（打った字を 消さない）
 *   ⑧ 入れた事を ★言う★（黙って いじらない）
 *
 * 使い方: node seikyu/tests/itsudemo-naoseru.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません。この検証は飛ばせません（SKIPを緑と呼ばない）。npm install してください。'); process.exit(1); }

const SELF = process.argv.includes('--self-test');
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
for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
  const src = m[1].split('?')[0];
  if (/^https?:/.test(src) || ['supa-config.js', 'auth.js', 'env-badge.js'].indexOf(src.split('/').pop()) >= 0) continue;
  const p = path.resolve(path.dirname(file), src);
  if (!fs.existsSync(p)) continue;
  const el = doc.createElement('script');
  el.textContent = fs.readFileSync(p, 'utf8');
  doc.body.appendChild(el);
}
await new Promise((r) => setTimeout(r, 500));
doc.getElementById('app').hidden = false;

const A = win.SeikyuApp, S = A._state, DOC = win.SeikyuDoc;
const $ = (id) => doc.getElementById(id);
const txt = (id) => (($(id) || {}).textContent || '').replace(/\s+/g, ' ').trim();
const line = (na, kin) => ({ name: na, qty: '1', unit: '式', price: String(kin),
  amount: String(kin), rate: 10, memo: '' });

/* ★前回 出した1通★＝明細2行・控除1行を 持っている */
const MAE = {
  id: 'v0', no: '202608-001', status: 'issued', doc_type: 'invoice', partner_id: 'p1',
  issue_ymd: '2026-08-31', tax_mode: 'exclusive', rounding: 'floor',
  lines: [line('エアコン取付工事', 42000), line('ダクト補修', 18000)],
  data: { term: { kind: 'endOfNextMonth', n: 0 }, subject: '8月分',
    deductions: [{ name: '弁当代', amount: '7310' }] },
  totals: { grandTotal: 66000 },
};
function reset() {
  S.org = { yago: '合同会社Rakunally', addr: '愛媛県今治市1-2-3', invoiceNo: 'T1234567890123' };
  S.partners = [{ id: 'p1', sort: 1, data: { name: '八木工業', honor: '御中' } }];
  S.invoices = [JSON.parse(JSON.stringify(MAE))];
  S.list = S.invoices; S.receipts = []; S.fil = 'all'; S.docType = 'invoice';
  S.guessDone = false; S.guess = null;
  S.store = {
    partners: { list: () => Promise.resolve(S.partners) },
    invoices: { list: () => Promise.resolve(S.invoices), usedNos: () => Promise.resolve([]) },
    org: { save: (p) => Promise.resolve({ ok: true, data: Object.assign({}, S.org, p) }) },
  };
  A._bindForTest();
}
reset();

console.log('\n[itsudemo-naoseru] いつでも 直せる／前の 項目と 控除を 覚えている' + (SELF ? '（自分ためし）' : ''));

if (SELF) {
  const app = fs.readFileSync(path.join(ROOT, 'seikyu', 'js', 'seikyu-app.js'), 'utf8');
  const lib = fs.readFileSync(path.join(ROOT, 'seikyu', 'lib', 'seikyu-doc.js'), 'utf8');
  const store = fs.readFileSync(path.join(ROOT, 'seikyu', 'js', 'seikyu-store.js'), 'utf8');
  const kowasu = [
    ['いつでも 直せるのを やめる', lib, 'function canEdit() { return true; }'],
    ['発行するを いつも 出す', app, "var mada = DOC.statusOf(v) === 'draft';"],
    ['保存で 状態を 落とす', store, "status: (['draft', 'issued', 'void'].indexOf(inv.status) >= 0) ? inv.status : 'draft',"],
    ['前の 明細を 入れない', app, 'v.lines = g.lines.map(function (l) { return Object.assign(blankLine(), l); });'],
    ['前の 控除を 入れない', app, 'v.data.deductions = g.deductions.map(function (x) {'],
  ];
  kowasu.forEach(([na, src, a]) => ok(src.split(a).length === 2,
    '★壊す所が 1つ 見つからない★ ' + na + ' … ' + a));
  console.log('     壊す所 ' + kowasu.length + '箇所（本当に コードに 在る事を 見た）');
}

T('★① 下書き・発行済み・取り消し済み どれも 直せる（lib）', () => {
  ok(DOC.canEdit({ status: 'draft' }), '下書きが 直せない');
  ok(DOC.canEdit({ status: 'issued' }), '★発行済みが 直せない★');
  ok(DOC.canEdit({ status: 'void' }), '★取り消し済みが 直せない★（司さんの 名指し）');
});

T('★⑤ 消す決まりは 変えていない（番号を 欠番に しない）', () => {
  ok(DOC.canDelete({ status: 'draft' }), '下書きが 消せない');
  ok(!DOC.canDelete({ status: 'issued' }), '★発行済みが 消せる＝番号が 欠番に なる★');
  ok(DOC.canVoid({ status: 'issued' }), '発行済みが 取り消せない');
});

['issued', 'void'].forEach((st) => {
  T('★② ' + (st === 'issued' ? '発行済み' : '取り消し済み') + 'で 欄が 塞がっていない（請求日も）', () => {
    reset();
    S.cur = JSON.parse(JSON.stringify(Object.assign({}, MAE, { status: st })));
    A._fillEdit();
    ['e-partner', 'e-issue', 'e-no', 'e-subject', 'e-memo'].forEach((id) => {
      const el = $(id); ok(el, '欄が 無い: ' + id);
      ok(!el.disabled, '★' + id + ' が 塞がっている★');
    });
    ok([...doc.querySelectorAll('#lines-body input')].every((i) => !i.disabled),
      '★明細が 塞がっている★');
    ok(!$('edit-locked'), '★「直せません」の 札が まだ 在る★');
  });

  T('★③ ' + (st === 'issued' ? '発行済み' : '取り消し済み') + 'に「発行する」は 出さない', () => {
    reset();
    S.cur = JSON.parse(JSON.stringify(Object.assign({}, MAE, { status: st })));
    A._fillEdit();
    eq($('b-issue').style.display, 'none', '★番号が 付いた後に「発行する」が 出ている★');
    ok($('b-save').style.display !== 'none', '★直せるのに「保存」が 出ていない★');
  });
});

T('★④ 保存しても 状態が 下書きに 落ちない（倉庫へ 渡す 中身）', () => {
  const src = fs.readFileSync(path.join(ROOT, 'seikyu', 'js', 'seikyu-store.js'), 'utf8');
  ok(src.indexOf("status: 'draft',") < 0, '★いつも draft に 落としている★');
  ok(src.indexOf("indexOf(inv.status) >= 0) ? inv.status : 'draft'") > 0,
    '★今の 状態を 保っていない★');
});

T('★⑥ 前回の 明細と 控除を 覚えて 入れる（金額を 変えるだけで 済む）', () => {
  reset();
  A._go('scr-edit');
  A._newInvoiceForTest ? A._newInvoiceForTest() : null;
  S.cur = { doc_type: 'invoice', status: 'draft', partner_id: '', lines: [], data: {}, totals: {} };
  S.guessDone = false;
  $('e-partner').value = 'p1';
  $('e-partner').dispatchEvent(new win.Event('change', { bubbles: true }));
  const na = (S.cur.lines || []).map((l) => l.name);
  eq(na.join(' / '), 'エアコン取付工事 / ダクト補修', '★前回の 項目が 入っていない★');
  const ded = (S.cur.data.deductions || []).map((d) => d.name);
  eq(ded.join(' / '), '弁当代', '★前回の 控除が 入っていない★');
  /* ★金額も そのまま★＝「金額 変えたりするだけ」で 済む */
  eq(String(S.cur.lines[0].price), '42000', '★金額が 入っていない＝打ち直しに なる★');
  console.log('     入った … 明細 ' + na.length + '行（' + na.join('・') + '）／控除 ' + ded.length + '行');
});

T('★⑧ 入れた事を 言う（黙って いじらない）', () => {
  const t = txt('edit-ok');
  ok(/前回/.test(t), '★前回から 入れたと 言っていない★: ' + t);
  ok(/明細 2行/.test(t), '★明細を 何行 入れたか 言っていない★: ' + t);
  ok(/控除 1行/.test(t), '★控除を 何行 入れたか 言っていない★: ' + t);
  ok(/金額を 確かめて/.test(t), '★金額を 確かめるよう 言っていない★（前の額が 残る）: ' + t);
  console.log('     ' + t);
});

T('★⑦ 打ち始めていたら 上書きしない（打った字を 消さない）', () => {
  reset();
  S.cur = { doc_type: 'invoice', status: 'draft', partner_id: '',
    lines: [{ name: '自分で打った品名', qty: '1', unit: '式', price: '999', amount: '999', rate: 10, memo: '' }],
    data: {}, totals: {} };
  S.guessDone = false;
  $('e-partner').value = 'p1';
  $('e-partner').dispatchEvent(new win.Event('change', { bubbles: true }));
  eq(S.cur.lines.length, 1, '★打った行が 増えた＝上書きした★');
  eq(S.cur.lines[0].name, '自分で打った品名', '★打った字が 消えた★');
});

T('★⑨ 名前も 金額も その場で 変えられる・行を 足す/消す（前から 出来ていた物が 生きている）', () => {
  const h = fs.readFileSync(path.join(ROOT, 'seikyu', 'index.html'), 'utf8');
  ok(h.indexOf('id="b-ded-add"') > 0, '★控除を 足す ボタンが 無い★');
  ok(h.indexOf('id="b-addline"') > 0, '★明細の 行を 足す ボタンが 無い★');
  const app = fs.readFileSync(path.join(ROOT, 'seikyu', 'js', 'seikyu-app.js'), 'utf8');
  ok(app.indexOf('data-dn=') > 0, '★控除の 名前を 打つ 欄が 無い★');
  ok(app.indexOf('data-dd=') > 0, '★控除の 行を 消す ×が 無い★');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
