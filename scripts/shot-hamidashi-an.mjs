/* shot-hamidashi-an.mjs — ★A4はみ出しの 直し方 2案を 絵に する★
 * 司さん 2026-09-10「AもBも見せてから言えやぼけ」
 * ★本体（seikyu-paper.js）は 1文字も 変えていない★＝この道具の 中で 2案を 再現しただけ。
 *   案A … 備考の 在る行を「2行」と 数える → 枠の 行数が 減る（paperRows を 半分にして 再現）
 *   案B … 備考の 列を 持たない 様式では 行の 備考を 刷らない（memo を 空にして 再現）
 * 使い方: node scripts/shot-hamidashi-an.mjs
 */
import fs from 'node:fs'; import path from 'node:path';
import { createHash } from 'node:crypto';
import { borrow, launch as pwLaunch } from './_borrow-playwright.mjs';
const ROOT = 'C:/Users/zeroa/rakually-test';
const OUT = 'C:/Users/zeroa/AppData/Local/Temp/claude/C--WINDOWS-System32-WindowsPowerShell-v1-0/95680cdf-f1bb-480f-a53c-6f0f118a9fb3/scratchpad';
const ch = await borrow('shot-hamidashi-an', 'chromium');
if (!ch) { console.log('🟡 ★未測定★ playwright を 借りられない'); process.exit(2); }
const req = (f) => import('file://' + ROOT + '/seikyu/lib/' + f).then((m) => m.default || m);
const PAPER = await req('seikyu-paper.js'), TPL = await req('seikyu-templates.js');
const TAX = await req('seikyu-tax.js'), COLS = await req('seikyu-cols.js');
const A4 = 1122.5;
const GENBA = ['東予市 川本邸', '菊水ホテル', '鳥越ハンカチ'];
const N = 8;   /* ★明細 8行★＝ふつうに 在りうる 数 */

function html(memoAri, waku) {
  const ln = Array.from({ length: N }, (_, i) => ({
    name: '工事代金 ' + (i + 1), qty: '1', unit: '式', price: '10000', amount: '10000', rate: 10,
    memo: memoAri ? GENBA[i % GENBA.length] : '',
  }));
  const t = TAX.compute({ lines: ln, taxMode: 'exclusive', rounding: 'floor' });
  const tp = TPL.getOrDefault('std1');
  return PAPER.build({
    inv: { no: '202609-001', issue_ymd: '2026-09-10', kind: 'invoice', lines: ln,
      totals: { grandTotal: t.grandTotal }, data: {} },
    tax: t, partner: { name: '八木工業', honor: '御中' },
    org: { yago: '合同会社Rakunally', addr: '愛媛県今治市1-2-3', tel: '0898-00-0000',
      invoiceNo: 'T1234567890123', bank: '伊予銀行 今治支店 普通 1234567' },
    template: tp, templateId: 'std1', theme: tp.theme,
    cols: COLS.normalizeSpec(tp.cols), deduct: 0, deductLines: [],
    paperRows: waku,
  }).html;
}

const b = await pwLaunch('shot-hamidashi-an', ch, undefined, 'chromium');
const out = [];
async function toru(na, h, f) {
  const pg = await b.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
  await pg.setContent(h, { waitUntil: 'load' });
  await pg.waitForTimeout(400);
  const m = await pg.evaluate(() => {
    const s = document.querySelector('.sheet');
    const t = [...s.querySelectorAll('td,th')].map((e) => (e.textContent || '').trim());
    return { naka: Math.round(s.scrollHeight),
      genba: t.filter((x) => /川本邸|菊水|鳥越/.test(x)).length,
      kei: t.some((x) => x === '項目の合計'), gokei: t.some((x) => x === '合計'),
      bank: (s.textContent || '').indexOf('お振込先') >= 0 };
  });
  const p = path.join(OUT, f);
  await (await pg.$('.sheet')).screenshot({ path: p });
  await pg.close();
  out.push({ na, p, m, byte: fs.statSync(p).size,
    sha: createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 12) });
}

/* ★今（直す前）★＝枠18行のまま 全行に 現場名 → はみ出す */
await toru('今のまま（はみ出す）', html(true, PAPER.PAPER_ROWS), 'an-0-ima.png');
/* ★案A★＝備考の 在る行を 2行と 数える → 枠が 半分に なる */
await toru('案A 備考の行を2行と数える', html(true, Math.floor(PAPER.PAPER_ROWS / 2)), 'an-A.png');
/* ★案B★＝備考の 列を 持たない 様式では 刷らない */
await toru('案B この様式では備考を刷らない', html(false, PAPER.PAPER_ROWS), 'an-B.png');
await b.close();

console.log('明細 ' + N + '行・全行に 現場名／A4 = ' + Math.round(A4) + 'px');
out.forEach((x) => {
  const over = x.m.naka - Math.round(A4);
  console.log('  ' + x.na);
  console.log('      中身 ' + x.m.naka + 'px' + (over > 1 ? '  ★はみ出し ' + over + 'px★' : '  ★収まる★')
    + ' ／ 現場名 ' + x.m.genba + '個'
    + ' ／ 項目の合計 ' + (x.m.kei ? '出る' : '★消える★')
    + ' ／ 合計 ' + (x.m.gokei ? '出る' : '★消える★')
    + ' ／ 振込先 ' + (x.m.bank ? '出る' : '★消える★'));
  console.log('      ' + x.byte + 'バイト sha ' + x.sha);
  console.log('      ' + x.p);
});
