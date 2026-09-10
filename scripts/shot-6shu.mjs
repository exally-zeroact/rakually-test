/* shot-6shu.mjs — ★6種を 同じ中身で 描いて、振込先まで 入った 紙を 撮る★
 * 司さん 2026-09-10「全バージョンで ちゃんと 振込先まで 見せて」
 * ★見張りでは ない★＝見せる為の 道具。A4に 収まるかも 測る。
 * 使い方: node scripts/shot-6shu.mjs
 */
import fs from 'node:fs'; import path from 'node:path';
import { createHash } from 'node:crypto';
import { borrow, launch as pwLaunch } from './_borrow-playwright.mjs';
const ROOT = 'C:/Users/zeroa/rakually-test';
const OUT = 'C:/Users/zeroa/AppData/Local/Temp/claude/C--WINDOWS-System32-WindowsPowerShell-v1-0/95680cdf-f1bb-480f-a53c-6f0f118a9fb3/scratchpad';
const ch = await borrow('shot-6shu', 'chromium');
if (!ch) { console.log('🟡 ★未測定★ playwright を 借りられない'); process.exit(2); }
const req = (f) => import('file://' + ROOT + '/seikyu/lib/' + f).then((m) => m.default || m);
const PAPER = await req('seikyu-paper.js'), TPL = await req('seikyu-templates.js');
const TAX = await req('seikyu-tax.js'), COLS = await req('seikyu-cols.js');
const A4 = 1122.5;

const L = (na, kin, genba) => ({ name: na, qty: '1', unit: '式', price: String(kin),
  amount: String(kin), rate: 10, memo: genba });
const LINES = [
  L('エアコン取付工事', 42000, '東予市 川本邸'),
  L('ダクト補修', 18000, '菊水ホテル'),
  L('冷媒配管 交換', 35000, '鳥越ハンカチ'),
];
const DED = [{ name: '弁当代', amount: '7310' }, { name: '健康診断代', amount: '10164' }];
/* ★2口座★＝世の中で「1口座が ふつう・複数も ありうる」なので 両方 見えるように */
const BANK = '伊予銀行 今治支店 普通 1234567 ド）ラクナリー\n'
  + '愛媛銀行 今治支店 当座 7654321 ド）ラクナリー';

function html(id) {
  const t = TAX.compute({ lines: LINES, taxMode: 'exclusive', rounding: 'floor' });
  const tp = TPL.getOrDefault(id);
  const ded = TPL.usesDeduction(id);
  const dl = ded ? DED : [];
  const d = dl.reduce((s, x) => s + Number(x.amount), 0);
  return PAPER.build({
    inv: { no: '202609-001', issue_ymd: '2026-09-10', kind: 'invoice', lines: LINES,
      totals: { grandTotal: t.grandTotal }, data: { deductions: dl } },
    tax: t, partner: { name: '黒田空調', honor: '御中' },
    org: { yago: '合同会社Rakunally', addr: '愛媛県今治市1-2-3', tel: '0898-00-0000',
      invoiceNo: 'T1234567890123', bank: BANK },
    template: tp, templateId: id, theme: tp.theme,
    cols: COLS.normalizeSpec(tp.cols), deduct: d, deductLines: dl,
  }).html;
}

const b = await pwLaunch('shot-6shu', ch, undefined, 'chromium');
const list = TPL.list();
console.log('A4 = ' + Math.round(A4) + 'px ／ 明細3行・口座2つ・控除は 出す様式だけ');
for (let i = 0; i < list.length; i++) {
  const x = list[i];
  const pg = await b.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
  await pg.setContent(html(x.id), { waitUntil: 'load' });
  await pg.waitForTimeout(400);
  const m = await pg.evaluate(() => {
    const s = document.querySelector('.sheet');
    const bank = s.querySelector('.note-bank');
    const r = bank && bank.getBoundingClientRect();
    const t = (s.textContent || '');
    return { naka: Math.round(s.scrollHeight),
      bank: !!bank, haba: r ? Math.round(r.width) : 0, takasa: r ? Math.round(r.height) : 0,
      kouza: (t.match(/1234567/g) || []).length + (t.match(/7654321/g) || []).length,
      gokei: t.indexOf('合計') >= 0, uchi: t.indexOf('（内訳）') >= 0 };
  });
  const f = path.join(OUT, '6shu-' + (i + 1) + '.png');
  await (await pg.$('.sheet')).screenshot({ path: f });
  await pg.close();
  const over = m.naka - Math.round(A4);
  console.log('  ' + (i + 1) + ' ' + x.label);
  console.log('      中身 ' + m.naka + 'px' + (over > 1 ? '  ★はみ出し ' + over + 'px★' : '  ★収まる★')
    + ' ／ お振込先 ' + (m.bank ? '★出る★ ' + m.haba + '×' + m.takasa + 'px' : '★出ない★')
    + ' ／ 口座番号 ' + m.kouza + '個 ／ 合計 ' + (m.gokei ? '出る' : '★消えた★')
    + ' ／ 内訳 ' + (m.uchi ? '出る' : '★消えた★'));
  console.log('      ' + fs.statSync(f).size + 'バイト sha '
    + createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 12));
  console.log('      ' + f);
}
await b.close();
