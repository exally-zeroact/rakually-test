/* _hakaru-obi.mjs — ★帯（地の色・線の太さ）を 実ブラウザで 測る★
 * ★見張りでは ない★＝赤/緑を 出さない。手で 測る為の 道具。
 * 2026-09-09 司さん「②だけ 背景いれて 合わせてない」「中計の上の線だけ 濃い」を
 * ★思い込みで 直さず 測ってから 直す★ 為に 作った。
 * 使い方: node scripts/_hakaru-obi.mjs
 */
import fs from 'node:fs';
import { borrow, launch as pwLaunch } from './_borrow-playwright.mjs';
const ROOT = 'C:/Users/zeroa/rakually-test';
const ch = await borrow('hakaru-obi', 'chromium');
const req = (f) => import('file://' + ROOT + '/seikyu/lib/' + f).then((m) => m.default || m);
const PAPER = await req('seikyu-paper.js'), TPL = await req('seikyu-templates.js');
const TAX = await req('seikyu-tax.js'), COLS = await req('seikyu-cols.js');
const b = await pwLaunch('hakaru-obi', ch, undefined, 'chromium');
const pg = await b.newPage({ viewport: { width: 794, height: 1123 } });
for (const id of ['std1', 'elegant', 'koujo', 'genba']) {
  const ln = [{ name: '品名', qty: '1', unit: '式', price: '30000', amount: '30000', rate: 10 }];
  const t = TAX.compute({ lines: ln, taxMode: 'exclusive', rounding: 'floor' });
  const tp = TPL.getOrDefault(id);
  const ded = TPL.usesDeduction(id);
  const dl = ded ? [{ name: '弁当代', amount: '7310' }] : [];
  const html = PAPER.build({ inv: { no: 'X', issue_ymd: '2026-09-09', kind: 'invoice', lines: ln,
      totals: { grandTotal: t.grandTotal }, data: {} }, tax: t, partner: { name: 'A', honor: '御中' },
    org: { yago: 'Z', bank: 'B 支店 1' }, template: tp, templateId: id, theme: tp.theme,
    cols: COLS.normalizeSpec(tp.cols), deduct: ded ? 7310 : 0, deductLines: dl }).html;
  await pg.setContent(html, { waitUntil: 'load' });
  await pg.waitForTimeout(300);
  const r = await pg.evaluate(() => {
    const out = [];
    document.querySelectorAll('tr').forEach((tr) => {
      const ji = (tr.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 20);
      if (!ji) return;
      const cells = [...tr.children];
      cells.forEach((c, i) => {
        const s = getComputedStyle(c);
        if (i > 0) return;
        out.push({ ji: ji, cls: tr.className || '(なし)',
          bg: s.backgroundColor,
          ue: s.borderTopWidth + ' ' + s.borderTopColor,
          shita: s.borderBottomWidth + ' ' + s.borderBottomColor });
      });
    });
    return out;
  });
  console.log('=== ' + id);
  r.forEach((x) => console.log('  ' + x.cls.padEnd(12) + '「' + x.ji + '」 地 ' + x.bg + ' ／ 上 ' + x.ue + ' ／ 下 ' + x.shita));
}
await b.close();
