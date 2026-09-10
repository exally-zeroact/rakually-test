/* _hakaru-memo-a4.mjs — ★備考の列を 持たない 様式で、行の 備考が A4を はみ出さないか★
 * ★見張りでは ない★＝手で 測る 道具。
 * 使い方: node scripts/_hakaru-memo-a4.mjs
 */
import fs from 'node:fs'; import path from 'node:path';
import { borrow, launch as pwLaunch } from './_borrow-playwright.mjs';
const ROOT = 'C:/Users/zeroa/rakually-test';
const ch = await borrow('hakaru-memo-a4', 'chromium');
if (!ch) { console.log('🟡 ★未測定★ playwright を 借りられない'); process.exit(2); }
const req = (f) => import('file://' + ROOT + '/seikyu/lib/' + f).then((m) => m.default || m);
const PAPER = await req('seikyu-paper.js'), TPL = await req('seikyu-templates.js');
const TAX = await req('seikyu-tax.js'), COLS = await req('seikyu-cols.js');
const A4 = 1122.5;
const b = await pwLaunch('hakaru-memo-a4', ch, undefined, 'chromium');
const pg = await b.newPage({ viewport: { width: 794, height: 1123 } });

async function measure(id, memoAri, rows) {
  const n = PAPER.PAPER_ROWS;
  const ln = Array.from({ length: rows }, (_, i) => ({
    name: '工事代金' + (i + 1), qty: '1', unit: '式', price: '10000', amount: '10000', rate: 10,
    memo: memoAri ? '東予市 川本邸（' + (i + 1) + '回目）' : '',
  }));
  const t = TAX.compute({ lines: ln, taxMode: 'exclusive', rounding: 'floor' });
  const tp = TPL.getOrDefault(id);
  const html = PAPER.build({
    inv: { no: 'X-1', issue_ymd: '2026-09-09', kind: 'invoice', lines: ln,
      totals: { grandTotal: t.grandTotal }, data: {} },
    tax: t, partner: { name: '八木工業', honor: '御中' },
    org: { yago: '合同会社Rakunally', bank: '（見本）銀行 ◯◯支店 普通 1234567' },
    template: tp, templateId: id, theme: tp.theme,
    cols: COLS.normalizeSpec(tp.cols), deduct: 0, deductLines: [],
    paperRows: n,
  }).html;
  await pg.setContent(html, { waitUntil: 'load' });
  await pg.waitForTimeout(250);
  return await pg.evaluate(() => {
    const s = document.querySelector('.sheet');
    return { naka: Math.round(s.scrollHeight), mai: document.querySelectorAll('.sheet').length };
  });
}
const N = PAPER.PAPER_ROWS;
console.log('枠の行数（既定）… ' + N + '行 ／ A4 = ' + A4 + 'px');
for (const id of ['std1', 'elegant', 'genba']) {
  const hasMemo = (TPL.getOrDefault(id).cols.items || []).indexOf('備考') >= 0;
  const a = await measure(id, false, N);
  const c = await measure(id, true, N);
  const over = c.naka - Math.round(A4);
  console.log('  ' + id.padEnd(8) + '（備考の列 ' + (hasMemo ? '在り' : '無し') + '）'
    + ' 備考なし ' + a.naka + 'px ／ 備考あり ' + c.naka + 'px'
    + (over > 1 ? '  ★はみ出し ' + over + 'px★' : '  収まっている'));
}
await b.close();
