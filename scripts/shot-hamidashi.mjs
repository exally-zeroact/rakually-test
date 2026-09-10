/* shot-hamidashi.mjs — ★備考を 打った紙が A4から はみ出す所を 絵に する★
 * ★見張りでは ない★＝見せる為の 道具（司さん 2026-09-10「いったん見せろや」）。
 * 使い方: node scripts/shot-hamidashi.mjs
 */
import fs from 'node:fs'; import path from 'node:path';
import { createHash } from 'node:crypto';
import { borrow, launch as pwLaunch } from './_borrow-playwright.mjs';
const ROOT = 'C:/Users/zeroa/rakually-test';
const OUT = 'C:/Users/zeroa/AppData/Local/Temp/claude/C--WINDOWS-System32-WindowsPowerShell-v1-0/95680cdf-f1bb-480f-a53c-6f0f118a9fb3/scratchpad';
const ch = await borrow('shot-hamidashi', 'chromium');
if (!ch) { console.log('🟡 ★未測定★ playwright を 借りられない'); process.exit(2); }
const req = (f) => import('file://' + ROOT + '/seikyu/lib/' + f).then((m) => m.default || m);
const PAPER = await req('seikyu-paper.js'), TPL = await req('seikyu-templates.js');
const TAX = await req('seikyu-tax.js'), COLS = await req('seikyu-cols.js');
const A4 = 1122.5;
const GENBA = ['東予市 川本邸', '菊水ホテル', '鳥越ハンカチ'];

function html(id, n) {
  const ln = Array.from({ length: n }, (_, i) => ({
    name: '工事代金 ' + (i + 1), qty: '1', unit: '式', price: '10000', amount: '10000', rate: 10,
    memo: GENBA[i % GENBA.length],
  }));
  const t = TAX.compute({ lines: ln, taxMode: 'exclusive', rounding: 'floor' });
  const tp = TPL.getOrDefault(id);
  return PAPER.build({
    inv: { no: '202609-001', issue_ymd: '2026-09-10', kind: 'invoice', lines: ln,
      totals: { grandTotal: t.grandTotal }, data: {} },
    tax: t, partner: { name: '八木工業', honor: '御中' },
    org: { yago: '合同会社Rakunally', addr: '愛媛県今治市1-2-3', tel: '0898-00-0000',
      invoiceNo: 'T1234567890123', bank: '伊予銀行 今治支店 普通 1234567' },
    template: tp, templateId: id, theme: tp.theme,
    cols: COLS.normalizeSpec(tp.cols), deduct: 0, deductLines: [],
    paperRows: PAPER.PAPER_ROWS,
  }).html;
}

const b = await pwLaunch('shot-hamidashi', ch, undefined, 'chromium');
const out = [];
async function toru(id, n, mode, f, na) {
  const pg = await b.newPage({ viewport: { width: 794, height: 1200 }, deviceScaleFactor: 2 });
  await pg.setContent(html(id, n), { waitUntil: 'load' });
  await pg.waitForTimeout(400);
  const m = await pg.evaluate((mo) => {
    const s = document.querySelector('.sheet');
    const naka = Math.round(s.scrollHeight);
    if (mo === 'zenbu') {
      /* ★中身を 全部 出す★＝どこまで 伸びているかを 見せる（お客さんの 姿では ない） */
      s.style.height = 'auto'; s.style.overflow = 'visible';
      document.body.style.height = 'auto';
    }
    return { naka, w: Math.round(s.getBoundingClientRect().width) };
  }, mode);
  await pg.waitForTimeout(200);
  const p = path.join(OUT, f);
  const sh = await pg.$('.sheet');
  await sh.screenshot({ path: p });
  await pg.close();
  out.push({ na, p, naka: m.naka, byte: fs.statSync(p).size,
    sha: createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 12) });
}

/* ★お客さんに 出る姿★＝A4で 切れている（.sheet は overflow:hidden） */
await toru('std1', PAPER.PAPER_ROWS, 'kiru', 'hamidashi-1-kyaku.png',
  'お客さんに 出る姿（A4で 切れる）');
/* ★中身が どこまで 伸びているか★ */
await toru('std1', PAPER.PAPER_ROWS, 'zenbu', 'hamidashi-2-zenbu.png',
  '中身を 全部 出した姿（どこまで 伸びているか）');
/* ★備考の 列を 持つ 様式は 収まる★ */
await toru('genba', PAPER.PAPER_ROWS, 'kiru', 'hamidashi-3-genba.png',
  '備考の 列を 持つ 様式（収まっている）');
await b.close();

console.log('A4 = ' + Math.round(A4) + 'px ／ 枠 ' + PAPER.PAPER_ROWS + '行・全行に 現場名を 打った');
out.forEach((x) => {
  const over = x.naka - Math.round(A4);
  console.log('  ' + x.na);
  console.log('      中身 ' + x.naka + 'px' + (over > 1 ? '  ★はみ出し ' + over + 'px★' : '  収まっている')
    + ' ／ ' + x.byte + 'バイト sha ' + x.sha);
  console.log('      ' + x.p);
});
