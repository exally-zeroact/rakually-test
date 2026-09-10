/* _hakaru-mid-rows.mjs — ★途中の紙に 本当に 何行 載るか★を 測る
 * 司さん 2026-09-10「なんで 1ページ目が 少ないやつがあるんど おかしかろが」
 *   ＝前の紙から 順に 入れる 形に した所、★MID_ROWS=30 が はみ出した★（+29px）。
 *     30 は 2026-08-16 の 数で、その後 紙の 作り（余白・行数・締めの線）が 変わっている。
 * ★見張りでは ない★＝数を 決める為の 道具。
 * ★本物の ファイルは 1バイトも 触らない★
 *   ＝出来た 紙の 行を ブラウザの 中で 1本ずつ 減らして 高さを 測る。
 * 使い方: node scripts/_hakaru-mid-rows.mjs
 */
import { borrow, launch as pwLaunch } from './_borrow-playwright.mjs';
const ROOT = 'C:/Users/zeroa/rakually-test';
const ch = await borrow('hakaru-mid-rows', 'chromium');
if (!ch) { console.log('🟡 ★未測定★ playwright を 借りられない'); process.exit(2); }
const req = (f) => import('file://' + ROOT + '/seikyu/lib/' + f).then((m) => m.default || m);
const PAPER = await req('seikyu-paper.js'), TPL = await req('seikyu-templates.js');
const TAX = await req('seikyu-tax.js'), COLS = await req('seikyu-cols.js');
const A4 = 1122.5;

const L = (i) => ({ name: 'エアコン取付工事 ' + (i + 1), qty: '1', unit: '式',
  price: '19000', amount: '19000', rate: 10, memo: '東予市 川本邸' });
const DED = [{ name: '弁当代', amount: '7310' }, { name: '健康診断代', amount: '10164' }];
const BANK = 'サンプル銀行 サンプル支店 普通 1234567 カ）サンプル\n'
  + 'テスト銀行 テスト支店 当座 7654321 カ）サンプル';

function html(id, n) {
  const ln = []; for (let i = 0; i < n; i++) ln.push(L(i));
  const t = TAX.compute({ lines: ln, taxMode: 'exclusive', rounding: 'floor' });
  const tp = TPL.getOrDefault(id);
  const ded = TPL.usesDeduction(id);
  const dl = ded ? DED : [];
  const d = dl.reduce((s, x) => s + Number(x.amount), 0);
  return PAPER.build({
    inv: { no: '202609-001', issue_ymd: '2026-09-10', kind: 'invoice', lines: ln,
      totals: { grandTotal: t.grandTotal }, data: { deductions: dl } },
    tax: t, partner: { name: '黒田空調', honor: '御中' },
    org: { yago: '合同会社Rakunally', addr: '愛媛県今治市1-2-3', tel: '0898-00-0000',
      invoiceNo: 'T1234567890123', bank: BANK },
    template: tp, templateId: id, theme: tp.theme,
    cols: COLS.normalizeSpec(tp.cols), deduct: d, deductLines: dl,
  }).html;
}

const b = await pwLaunch('hakaru-mid-rows', ch, undefined, 'chromium');
const pg = await b.newPage({ viewport: { width: 794, height: 1123 } });
console.log('A4 = ' + Math.round(A4) + 'px ／ ★途中の紙に 何行 載るか★');
console.log('（出来た 紙の 行を 1本ずつ 減らして 高さを 測る＝本物の ファイルは 触らない）');
let saitei = 999;
for (const x of TPL.list()) {
  await pg.setContent(html(x.id, 100), { waitUntil: 'load' });
  await pg.waitForTimeout(200);
  const m = await pg.evaluate((a4) => {
    const out = [];
    /* ★1枚目★＝頭（宛名・年月・n/m ページ）が いちばん 多い＝いちばん 入らない紙 */
    [0, 1].forEach((idx) => {
      const s = document.querySelectorAll('.sheet')[idx];
      if (!s) return;
      const tb = s.querySelector('.items tbody');
      if (!tb) return;
      let rows = [...tb.querySelectorAll('tr')];
      let n = rows.length;
      while (n > 0 && s.scrollHeight - a4 > 1) { tb.removeChild(rows[--n]); }
      out.push({ mai: idx + 1, hairu: n, takasa: Math.round(s.scrollHeight) });
    });
    return out;
  }, Math.round(A4));
  const ko = Math.min(...m.map((z) => z.hairu));
  console.log('  ' + x.label + ' … ★' + ko + '行★  '
    + m.map((z) => z.mai + '枚目 ' + z.hairu + '行（' + z.takasa + 'px）').join(' ／ '));
  if (ko < saitei) saitei = ko;
}
await b.close();
console.log('');
console.log('★どの様式・どの紙でも 収まる 数 … ' + saitei + '行★');
