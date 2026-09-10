/* shot-memobox.mjs — ★備考欄が「下」に あるバージョン★を 絵に する
 * 司さん 2026-09-10「備考欄が 下に あるバージョン 見せろや」
 * ★見張りでは ない★＝見せる為の 道具。A4に 収まるかも 一緒に 測る。
 * 使い方: node scripts/shot-memobox.mjs
 */
import fs from 'node:fs'; import path from 'node:path';
import { createHash } from 'node:crypto';
import { borrow, launch as pwLaunch } from './_borrow-playwright.mjs';
const ROOT = 'C:/Users/zeroa/rakually-test';
const OUT = 'C:/Users/zeroa/AppData/Local/Temp/claude/C--WINDOWS-System32-WindowsPowerShell-v1-0/95680cdf-f1bb-480f-a53c-6f0f118a9fb3/scratchpad';
const ch = await borrow('shot-memobox', 'chromium');
if (!ch) { console.log('🟡 ★未測定★ playwright を 借りられない'); process.exit(2); }
const req = (f) => import('file://' + ROOT + '/seikyu/lib/' + f).then((m) => m.default || m);
const PAPER = await req('seikyu-paper.js'), TPL = await req('seikyu-templates.js');
const TAX = await req('seikyu-tax.js'), COLS = await req('seikyu-cols.js');
const A4 = 1122.5;

function html(id, box, kaita) {
  const ln = [
    { name: 'エアコン取付工事', qty: '1', unit: '式', price: '42000', amount: '42000', rate: 10, memo: '' },
    { name: 'ダクト補修', qty: '1', unit: '式', price: '18000', amount: '18000', rate: 10, memo: '' },
  ];
  const t = TAX.compute({ lines: ln, taxMode: 'exclusive', rounding: 'floor' });
  const tp = TPL.getOrDefault(id);
  return PAPER.build({
    inv: { no: '202609-001', issue_ymd: '2026-09-10', kind: 'invoice', lines: ln,
      totals: { grandTotal: t.grandTotal },
      data: kaita ? { memo: '工期 2026/8/1〜8/25\n現場 東予市 川本邸' } : {} },
    tax: t, partner: { name: '黒田空調', honor: '御中' },
    org: { yago: '合同会社Rakunally', addr: '愛媛県今治市1-2-3', tel: '0898-00-0000',
      invoiceNo: 'T1234567890123', bank: '伊予銀行 今治支店 普通 1234567 ド）ラクナリー' },
    template: tp, templateId: id, theme: tp.theme, memoBox: box,
    cols: COLS.normalizeSpec(tp.cols), deduct: 0, deductLines: [],
  }).html;
}

const b = await pwLaunch('shot-memobox', ch, undefined, 'chromium');
const out = [];
async function toru(na, h, f) {
  const pg = await b.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
  await pg.setContent(h, { waitUntil: 'load' });
  await pg.waitForTimeout(400);
  const m = await pg.evaluate(() => {
    const s = document.querySelector('.sheet');
    const box = s.querySelector('.note-memo');
    const r = box && box.getBoundingClientRect();
    return { naka: Math.round(s.scrollHeight), waku: !!box,
      takasa: r ? Math.round(r.height) : 0, haba: r ? Math.round(r.width) : 0 };
  });
  const p = path.join(OUT, f);
  await (await pg.$('.sheet')).screenshot({ path: p });
  await pg.close();
  out.push({ na, p, m, byte: fs.statSync(p).size,
    sha: createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 12) });
}

await toru('今のまま（下に 備考欄なし）', html('std1', false, false), 'memobox-0-nashi.png');
await toru('下に 備考欄あり（空のまま）', html('std1', true, false), 'memobox-1-kara.png');
await toru('下に 備考欄あり（書いた時）', html('std1', true, true), 'memobox-2-kaita.png');
await b.close();

console.log('A4 = ' + Math.round(A4) + 'px');
out.forEach((x) => {
  const over = x.m.naka - Math.round(A4);
  console.log('  ' + x.na);
  console.log('      中身 ' + x.m.naka + 'px' + (over > 1 ? '  ★はみ出し ' + over + 'px★' : '  ★収まる★')
    + ' ／ 備考の枠 ' + (x.m.waku ? '★出る★ ' + x.m.haba + '×' + x.m.takasa + 'px' : '出ない'));
  console.log('      ' + x.byte + 'バイト sha ' + x.sha);
  console.log('      ' + x.p);
});
