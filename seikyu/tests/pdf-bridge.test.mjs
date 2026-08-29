/* pdf-bridge.test.mjs — ★借りたPDFの道具に 渡す形★（並べ替えるだけ・計算しない）
 * =============================================================================
 * ★司さん 2026-08-30「成功してるアプリを真似て 同じ形式でやれや／毎アプリ同じことを繰り返してるやろ」★
 *
 * ここで見る物
 *   ① ★数を 1つも 作らない★（合計は seikyu-tax の物を そのまま 答える）
 *   ② 列は うちの列を そのまま（★#は 渡さない★＝道具が 自分で 行番号を振る）
 *   ③ 会社が足した列（摘要 など）も 落とさない
 *   ④ ★金額が空の行は 0円と 書かない★（空のまま 渡す）
 *   ⑤ 日付は ★紙の書き方（2026/11/30）に そろえてから★ 渡す
 *   ⑥ ★代行の固定の文言を そのまま出さない★（うちの言葉に 差し替える口を 使う）
 *   ⑦ 消費税の見出しは ★計算に使った率から★ 組み立てる（紙が 嘘をつかない）
 *
 * ★この道具で 出来ない事（測って 書いておく）★
 *   ・請求日 … 道具は ★月の翌月1日★を 自分で 作る（うちの請求日は 渡せない）
 *   ・外税(税抜で入れる相手) … 見出し「御請求金額（税込）」が ★明細の合計＝税抜★になる
 *   ⇒ どちらも ★道具の中を 直さないと 直らない★＝代行（元）の持ち主の判断。
 *
 * 使い方: node seikyu/tests/pdf-bridge.test.mjs [--self-test]
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);
const B = require_(path.join(HERE, '..', 'lib', 'seikyu-pdf-bridge.js'));
const TAX = require_(path.join(HERE, '..', 'lib', 'seikyu-tax.js'));

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' … 期待 ' + JSON.stringify(b) + ' / 実際 ' + JSON.stringify(a)); };

const LINES = [
  { name: '運転代行 10月分', amount: '33000', rate: 10, memo: '夜間' },
  { name: '待機料', amount: '5500', rate: 10 },
  { name: '高速代', rate: 10 },                       // ★金額が 空★
];
const tax = TAX.compute({ lines: LINES, taxMode: 'inclusive', rounding: 'floor' });
const base = () => B.toDaikou({
  inv: { no: 'A-0002', issue_ymd: '2026-10-05', due_ymd: '2026-11-30', data: { lead: '10月分のご請求です。' } },
  lines: LINES, tax,
  partner: { name: '八木工業株式会社', honor: '御中' },
  org: { yago: '合同会社Rakunally', addr: '愛媛県今治市', invoiceNo: 'T3500003003293',
    bank: '伊予銀行 今治支店 普通 1234567' },
  cols: { items: ['#', '品名・内容', '金額', '摘要'], widths: {} },
});

console.log('\n[pdf-bridge] 借りたPDFの道具に 渡す形');

T('★① 数を 1つも 作らない（合計は seikyu-tax の物を そのまま）', () => {
  const e = B.engineFor(tax);
  const t = e.invoiceTotals();
  eq(t.shoukei, tax.subtotal, '小計');
  eq(t.zei, tax.taxTotal, '消費税');
  eq(t.goukei, tax.grandTotal, '合計');
  /* ★足し直していない★＝渡した物と 1円も 違わない */
  const src = fs.readFileSync(path.join(HERE, '..', 'lib', 'seikyu-pdf-bridge.js'), 'utf8');
  ok(src.indexOf('TAX_RATE') < 0, '★この紙が 税率を 持っている＝2つ目の正を 作っている★');
  console.log('     小計 ' + t.shoukei + ' ／ 税 ' + t.zei + ' ／ 合計 ' + t.goukei);
});

T('★② 列は うちの列そのまま（#は 渡さない＝行番号が 二重に出ない）', () => {
  const a = base();
  const items = a.master[a.co].items;
  ok(items.indexOf('#') < 0, '★#を 渡している（道具も 行番号を 振る＝二重）★');
  eq(items.join(','), '品名・内容,金額,摘要', '列の並び');
  eq(a.rows.length, 3, '行数');
  console.log('     ' + items.join(' / '));
});

T('★③ 会社が足した列も 落とさない', () => {
  const a = base();
  eq(a.rows[0]['摘要'], '夜間', '★摘要が 落ちた★');
  eq(a.rows[0]['品名・内容'], '運転代行 10月分', '品名');
});

T('★④ 金額が空の行は 0円と 書かない（空のまま）', () => {
  const a = base();
  eq(a.rows[2]['金額'], '', '★入れていない金額を 0円に している★');
  eq(a.rows[0]['金額'], 33000, '入っている金額');
});

T('★⑤ 日付は 紙の書き方に そろえてから 渡す', () => {
  const a = base();
  eq(a.master[a.co].paymentDue, '2026/11/30', '★ISOのまま 渡している★');
  eq(a.iss.paymentDue, '2026/11/30', '自社側も 同じ書き方');
  eq(B.slash('2026-01-05'), '2026/1/5', '0埋めしない');
  eq(B.slash(''), '', '空は 空のまま');
});

T('★⑥ 代行の固定の文言を そのまま出さない', () => {
  const a = base();
  eq(a.master[a.co].lead, '10月分のご請求です。', '★うちの言葉が 入っていない★');
  ok(!/運転業務委託料/.test(a.master[a.co].tableTitle), '★代行の見出しが そのまま★');
  eq(a.master[a.co].tableTitle, '明細', '表の見出し');
  /* 何も無い時は 決まり文句（★「{月}月のご利用分です。」を 出さない★） */
  const b2 = B.toDaikou({ inv: { no: 'x', issue_ymd: '2026-10-05', data: {} }, lines: LINES, tax,
    partner: { name: 'A' }, org: {}, cols: { items: ['品名・内容', '金額'] } });
  ok(!/ご利用分/.test(b2.master['A'].lead), '★代行の言い回しが 出る★：' + b2.master['A'].lead);
});

T('★⑦ 消費税の見出しは 計算に使った率から', () => {
  eq(B._zeiLabel(tax), '消費税（10%）', '1つの率');
  const mixed = TAX.compute({ lines: [{ name: 'a', amount: 1100, rate: 10 }, { name: 'b', amount: 1080, rate: 8 }],
    taxMode: 'inclusive', rounding: 'floor' });
  eq(B._zeiLabel(mixed), '消費税（10%・8%）', '★率が 混ざった時に 1つだけ 言っている★');
  console.log('     1つの率 → ' + B._zeiLabel(tax) + ' ／ 混ざり → ' + B._zeiLabel(mixed));
});

T('★⑧ この道具で 出来ない事を 書き残してある（黙って 嘘の紙を 出さない）', () => {
  const src = fs.readFileSync(path.join(HERE, 'pdf-bridge.test.mjs'), 'utf8');
  ok(/請求日 … 道具は/.test(src), '★請求日の限界を 書いていない★');
  ok(/外税/.test(src), '★外税の限界を 書いていない★');
});

/* ═══ ★自己確認：わざと壊して 赤になるか★ ═══ */
if (process.argv.includes('--self-test')) {
  console.log('\n[--self-test] ★わざと壊すと 赤になるか★');
  let sp = 0, sf = 0;
  const S = (n, fn) => { try { fn(); sp++; console.log('  ✓ ' + n); } catch (e) { sf++; console.log('  ✗ ' + n + ' — ' + e.message); } };
  S('★自① 合計を 自分で 足す作り物は 別の答えを出す（だから 足さない）', () => {
    /* ★外税（税抜で入れる相手）で 測る★＝明細を そのまま足すと ★税が 落ちる★。
       内税だと たまたま 同じ数になるので、★同じになる見本で 確かめない★。 */
    const ex = [{ name: 'a', amount: 30000, rate: 10 }, { name: 'b', amount: 5000, rate: 10 },
      { name: 'c', amount: 1200, rate: 10 }];
    const t2 = TAX.compute({ lines: ex, taxMode: 'exclusive', rounding: 'floor' });
    const naive = ex.reduce((s2, l) => s2 + Number(l.amount || 0), 0);
    eq(naive, 36200, '作り物の足し算（税抜のまま）');
    ok(naive !== t2.grandTotal, '★自分で足しても 同じ＝この検査は 何も見ていない★');
    eq(B.engineFor(t2).invoiceTotals().goukei, t2.grandTotal, '★口が 別の答えを 返している★');
    console.log('     自分で足すと ' + naive + ' ／ 本物は ' + t2.grandTotal + '（税 ' + t2.taxTotal + ' が 落ちる）');
  });
  S('★自② #を 渡すと 行番号が 二重になる（渡していない事を 確かめる）', () => {
    const a = base();
    ok(a.master[a.co].items.every((k) => k !== '#'), '★#が 混ざっている★');
  });
  S('★自③ 期限を ISOのまま 渡すと 紙の中で 書き方が 割れる', () => {
    ok(B.slash('2026-11-30') !== '2026-11-30', '★変換していない★');
  });
  console.log('\n[self-test] ' + sp + ' passed, ' + sf + ' failed');
  if (sf) process.exit(1);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
