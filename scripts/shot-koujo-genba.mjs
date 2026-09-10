/* shot-koujo-genba.mjs — ★控除あり＋消費税の列＋備考の列★の 紙を 組んで 測って 絵に する
 * 司さん 2026-09-10「控除ありの 消費税も 備考も ありの 作成してみて」
 * ★見張りでは ない★＝見せる為の 道具。A4に 収まるかも 一緒に 測る。
 * 使い方: node scripts/shot-koujo-genba.mjs
 */
import fs from 'node:fs'; import path from 'node:path';
import { createHash } from 'node:crypto';
import { borrow, launch as pwLaunch } from './_borrow-playwright.mjs';
const ROOT = 'C:/Users/zeroa/rakually-test';
const OUT = 'C:/Users/zeroa/AppData/Local/Temp/claude/C--WINDOWS-System32-WindowsPowerShell-v1-0/95680cdf-f1bb-480f-a53c-6f0f118a9fb3/scratchpad';
const ch = await borrow('shot-koujo-genba', 'chromium');
if (!ch) { console.log('🟡 ★未測定★ playwright を 借りられない'); process.exit(2); }
const req = (f) => import('file://' + ROOT + '/seikyu/lib/' + f).then((m) => m.default || m);
const PAPER = await req('seikyu-paper.js'), TPL = await req('seikyu-templates.js');
const TAX = await req('seikyu-tax.js'), COLS = await req('seikyu-cols.js');
const A4 = 1122.5;

/* ★控除を 出す 様式（koujo）に、消費税と 備考の 列を 足す★
   ＝様式を 新しく 作った 訳では なく、★設定 ▸ 明細の列 で 出来る 事★を そのまま 組んだ物。 */
const COLS_ARI = {
  items: ['項目', '数量', '単位', '金額', '消費税', '備考'],
  widths: { '項目': 176, '数量': 34, '単位': 28, '金額': 68, '消費税': 66, '備考': 228 },
  aligns: {},
};
const L = (na, kin, genba) => ({ name: na, qty: '1', unit: '式', price: String(kin),
  amount: String(kin), rate: 10, memo: genba });
const LINES = [
  L('エアコン取付工事', 42000, '東予市 川本邸'),
  L('ダクト補修', 18000, '菊水ホテル'),
  L('冷媒配管 交換', 35000, '鳥越ハンカチ'),
  L('室外機 移設', 12000, '東予市 川本邸'),
  L('定期点検', 8000, '菊水ホテル'),
];
const DED = [{ name: '弁当代', amount: '7310' }, { name: '健康診断代', amount: '10164' }];

function html(nLines) {
  const ln = LINES.slice(0, nLines);
  const t = TAX.compute({ lines: ln, taxMode: 'exclusive', rounding: 'floor' });
  const tp = TPL.getOrDefault('koujo');
  const ded = DED.reduce((s, d) => s + Number(d.amount), 0);
  return PAPER.build({
    inv: { no: '202609-001', issue_ymd: '2026-09-10', kind: 'invoice', lines: ln,
      totals: { grandTotal: t.grandTotal }, data: { deductions: DED } },
    tax: t, partner: { name: '黒田空調', honor: '御中' },
    org: { yago: '合同会社Rakunally', addr: '愛媛県今治市1-2-3', tel: '0898-00-0000',
      invoiceNo: 'T1234567890123', bank: '伊予銀行 今治支店 普通 1234567 ド）ラクナリー' },
    template: tp, templateId: 'koujo', theme: tp.theme,
    cols: COLS.normalizeSpec(COLS_ARI),
    deduct: ded, deductLines: DED,
  }).html;
}

const b = await pwLaunch('shot-koujo-genba', ch, undefined, 'chromium');
const pg = await b.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
await pg.setContent(html(LINES.length), { waitUntil: 'load' });
await pg.waitForTimeout(500);
const m = await pg.evaluate(() => {
  const s = document.querySelector('.sheet');
  const hd = [...s.querySelectorAll('.items th')].map((e) => e.textContent.trim()).filter(Boolean);
  const t = [...s.querySelectorAll('td,th')].map((e) => e.textContent.trim());
  /* ★字が 折り返した／はみ出した セルを 数える★（幅を 詰めた時に いちばん 危ない所） */
  const oritatami = [...s.querySelectorAll('.items td, .items th')]
    .filter((e) => e.scrollWidth > e.clientWidth + 1)
    .map((e) => (e.textContent || '').trim()).filter(Boolean);
  const takasa = [...s.querySelectorAll('.items tbody tr')]
    .map((r) => Math.round(r.getBoundingClientRect().height));
  return { naka: Math.round(s.scrollHeight), hd: hd,
    oritatami: oritatami, gyoTakasa: [...new Set(takasa)].sort((a, b) => a - b),
    genba: t.filter((x) => /川本邸|菊水|鳥越/.test(x)).length,
    zei: t.filter((x) => x === '4,200' || x === '1,800' || x === '3,500').length,
    ded: t.filter((x) => /弁当代|健康診断代/.test(x)).length };
});
const f = path.join(OUT, 'koujo-genba.png');
await (await pg.$('.sheet')).screenshot({ path: f });
await b.close();
const over = m.naka - Math.round(A4);
console.log('明細 ' + LINES.length + '行／控除 ' + DED.length + '行');
console.log('  列 … ' + m.hd.join(' / '));
console.log('  現場名が 出た欄 ' + m.genba + '個 ／ 行ごとの 消費税 ' + m.zei + '個 ／ 控除の 名前 ' + m.ded + '個');
console.log('  ★字が はみ出した欄 ' + m.oritatami.length + '個★'
  + (m.oritatami.length ? '（' + m.oritatami.join(' / ') + '）' : '')
  + ' ／ 行の高さ ' + m.gyoTakasa.join('・') + 'px（★1種類なら 折り返していない★）');
console.log('  紙の中身 ' + m.naka + 'px（A4 ' + Math.round(A4) + 'px）'
  + (over > 1 ? '  ★はみ出し ' + over + 'px★' : '  ★収まっている★'));
console.log('  ' + fs.statSync(f).size + 'バイト sha '
  + createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 12));
console.log('  ' + f);
