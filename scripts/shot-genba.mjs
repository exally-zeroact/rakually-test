/* shot-genba.mjs — ★「項目・金額＋備考（現場名を書く）」を 司さんの 実物の 中身で 出す★
 * 実物＝黒田空調 2026/7分（司さんが 見せてくれた PDF）。
 * ★見張りでは ない★＝見せる為の 道具。 */
import fs from 'node:fs'; import path from 'node:path';
import { createHash } from 'node:crypto';
import { borrow, launch as pwLaunch } from './_borrow-playwright.mjs';
const ROOT = 'C:/Users/zeroa/rakually-test';
const OUT = 'C:/Users/zeroa/AppData/Local/Temp/claude/C--WINDOWS-System32-WindowsPowerShell-v1-0/95680cdf-f1bb-480f-a53c-6f0f118a9fb3/scratchpad';
const ch = await borrow('shot-genba', 'chromium');
if (!ch) { console.log('🟡 ★未測定★ playwright を 借りられない'); process.exit(2); }
const req = (f) => import('file://' + ROOT + '/seikyu/lib/' + f).then((m) => m.default || m);
const PAPER = await req('seikyu-paper.js'), TPL = await req('seikyu-templates.js');
const TAX = await req('seikyu-tax.js'), COLS = await req('seikyu-cols.js');
const L = (na, kin, genba) => ({ name: na, qty: '1', unit: '式', price: String(kin),
  amount: String(kin), rate: 10, memo: genba });
const lines = [
  L('エアコン取付工事', 42000, '東予市 川本邸'),
  L('ダクト補修', 18000, '菊水ホテル'),
  L('冷媒配管 交換', 35000, '鳥越ハンカチ'),
  L('室外機 移設', 12000, '東予市 川本邸'),
  L('定期点検', 8000, '菊水ホテル'),
  L('部材（銅管・断熱材）', 15000, '鳥越ハンカチ'),
];
const t = TAX.compute({ lines: lines, taxMode: 'exclusive', rounding: 'floor' });
const tp = TPL.getOrDefault('genba');
const html = PAPER.build({
  inv: { no: '2026-07-001', issue_ymd: '2026-07-31', kind: 'invoice', lines: lines,
    totals: { grandTotal: t.grandTotal }, data: {}, template_id: 'genba' },
  tax: t, partner: { name: '黒田空調', honor: '御中' },
  org: { yago: '株式会社ゼロアクト', addr: '愛媛県今治市1-2-3', tel: '0898-00-0000',
    invoiceNo: 'T1234567890123', bank: '伊予銀行 今治支店 普通 1234567 カ）ゼロアクト' },
  template: tp, templateId: 'genba', theme: tp.theme,
  cols: COLS.normalizeSpec(tp.cols), deduct: 0, deductLines: [],
}).html;
const b = await pwLaunch('shot-genba', ch, undefined, 'chromium');
const pg = await b.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
await pg.setContent(html, { waitUntil: 'load' });
await pg.waitForTimeout(500);
const ha = await pg.evaluate(() => {
  const s = document.querySelector('.sheet');
  const r = s.getBoundingClientRect();
  const memo = [...s.querySelectorAll('td')].map((e) => e.textContent.trim());
  return { w: Math.round(r.width), naka: Math.round(s.scrollHeight),
    genba: memo.filter((x) => /川本邸|菊水|鳥越/.test(x)).length };
});
const f = path.join(OUT, 'youshiki-5-jitsubutsu.png');
const sh = await pg.$('.sheet'); await sh.screenshot({ path: f });
await b.close();
console.log('紙 ' + ha.w + 'px ／ 中身 ' + ha.naka + 'px（A4は 1123px）');
console.log('現場名が 出た欄 … ' + ha.genba + '個 ／ 合計 ¥' + t.grandTotal.toLocaleString());
console.log(fs.statSync(f).size + 'バイト sha ' + createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 12));
console.log('  ' + f);
