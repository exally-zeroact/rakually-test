/* shot-nimaime.mjs — ★2枚目・3枚目に 入った 紙を 全様式で 撮る★
 * =============================================================================
 * 司さん 2026-09-10「★全バージョンの 2枚目や 3枚目に 突入した物を 見せて★」
 * ★見張りでは ない★＝見せる為の 道具。ただし ★1枚ずつ A4に 収まるかは 測る★。
 *   ・何本 入れれば 2枚・3枚に なるかは ★決め打ちしない★＝増やして 測る。
 *   ・出した絵は ★バイト数と sha256 を 一緒に 出す★。
 * 使い方: node scripts/shot-nimaime.mjs
 */
import fs from 'node:fs'; import path from 'node:path';
import { createHash } from 'node:crypto';
import { borrow, launch as pwLaunch } from './_borrow-playwright.mjs';
const ROOT = 'C:/Users/zeroa/rakually-test';
const OUT = 'C:/Users/zeroa/AppData/Local/Temp/claude/C--WINDOWS-System32-WindowsPowerShell-v1-0/95680cdf-f1bb-480f-a53c-6f0f118a9fb3/scratchpad';
const ch = await borrow('shot-nimaime', 'chromium');
if (!ch) { console.log('🟡 ★未測定★ playwright を 借りられない'); process.exit(2); }
const req = (f) => import('file://' + ROOT + '/seikyu/lib/' + f).then((m) => m.default || m);
const PAPER = await req('seikyu-paper.js'), TPL = await req('seikyu-templates.js');
const TAX = await req('seikyu-tax.js'), COLS = await req('seikyu-cols.js');
const A4 = 1122.5;

const NA = ['エアコン取付工事', 'ダクト補修', '冷媒配管 交換', '室外機 据付', '電源工事',
  '既存機 撤去', '化粧カバー 取付', '真空引き', '試運転 調整', 'ドレン配管'];
const GENBA = ['東予市 川本邸', '菊水ホテル', '鳥越ハンカチ', '今治タオル 本社', '大西電設 倉庫'];
const lines = (n) => {
  const a = [];
  for (let i = 0; i < n; i++) {
    const kin = 12000 + (i % 7) * 3500;
    a.push({ name: NA[i % NA.length] + ' ' + (i + 1), qty: '1', unit: '式',
      price: String(kin), amount: String(kin), rate: 10, memo: GENBA[i % GENBA.length] });
  }
  return a;
};
const DED = [{ name: '弁当代', amount: '7310' }, { name: '健康診断代', amount: '10164' }];
const BANK = 'サンプル銀行 サンプル支店 普通 1234567 カ）サンプル\n'
  + 'テスト銀行 テスト支店 当座 7654321 カ）サンプル';

function tsukuru(id, n) {
  const ln = lines(n);
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
  });
}
/* ★何本で 何枚に なるかは 測って 決める★（決め打ちしない） */
function honsuuFor(id, mai) {
  for (let n = 1; n <= 200; n++) { if (tsukuru(id, n).pages >= mai) return n; }
  return null;
}

const b = await pwLaunch('shot-nimaime', ch, undefined, 'chromium');
const list = TPL.list();
console.log('A4 = ' + Math.round(A4) + 'px ／ 控除は 出す様式だけ ／ 口座 2つ');
let dame = 0;
for (const x of list) {
  for (const mai of [2, 3]) {
    const n = honsuuFor(x.id, mai);
    if (n === null) { console.log('  ' + x.label + ' … ★' + mai + '枚に ならない★'); dame++; continue; }
    const r = tsukuru(x.id, n);
    const pg = await b.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
    await pg.setContent(r.html, { waitUntil: 'load' });
    await pg.waitForTimeout(300);
    const m = await pg.evaluate(() => {
      const s = [...document.querySelectorAll('.sheet')];
      return s.map((el) => {
        const t = el.textContent || '';
        return { naka: Math.round(el.scrollHeight),
          tsuzuku: t.indexOf('次ページへ続く') >= 0,
          gokei: t.indexOf('合計') >= 0,
          bank: !!el.querySelector('.note-bank'),
          gyo: el.querySelectorAll('.items tbody tr').length };
      });
    });
    console.log('  ' + x.label + ' … 明細 ' + n + '本 → ★' + m.length + '枚★');
    m.forEach((p, i) => {
      const over = p.naka - Math.round(A4);
      if (over > 1) dame++;
      console.log('      ' + (i + 1) + '枚目 ' + p.naka + 'px'
        + (over > 1 ? '  ★はみ出し ' + over + 'px★' : '  収まる')
        + ' ／ 行 ' + p.gyo
        + ' ／ ' + (p.tsuzuku ? '「次ページへ続く」出る' : '続きの札 なし')
        + ' ／ お振込先 ' + (p.bank ? '出る' : '出ない'));
    });
    const f = path.join(OUT, 'mai-' + x.id + '-' + mai + '.png');
    await pg.screenshot({ path: f, fullPage: true });
    await pg.close();
    console.log('      ' + fs.statSync(f).size + 'バイト sha '
      + createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 12));
    console.log('      ' + f);
  }
}
await b.close();
console.log('');
console.log(dame === 0 ? '★どの 紙も 1枚ずつ A4に 収まる★' : '★' + dame + '件 おかしい★');
