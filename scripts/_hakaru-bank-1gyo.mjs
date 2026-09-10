/* _hakaru-bank-1gyo.mjs — ★世の中に ありうる 長い 振込先が 1行で 収まるか★を 測る
 * 司さん 2026-09-10「もし 世の中にある 考えられる 長い振込先が 1行で 済むなら
 *   枠を 伸ばして ①（割らない）が ええけど」
 * ★見張りでは ない★＝決める前に 測る 道具。
 * 使い方: node scripts/_hakaru-bank-1gyo.mjs
 */
import fs from 'node:fs'; import path from 'node:path';
import { borrow, launch as pwLaunch } from './_borrow-playwright.mjs';
const ROOT = 'C:/Users/zeroa/rakually-test';
const ch = await borrow('hakaru-bank-1gyo', 'chromium');
if (!ch) { console.log('🟡 ★未測定★ playwright を 借りられない'); process.exit(2); }
const req = (f) => import('file://' + ROOT + '/seikyu/lib/' + f).then((m) => m.default || m);
const PAPER = await req('seikyu-paper.js'), TPL = await req('seikyu-templates.js');
const TAX = await req('seikyu-tax.js'), COLS = await req('seikyu-cols.js');

/* ★長い方から 並べた 実在の 形★
   ・銀行名 … 日本で いちばん 長い 部類（信用金庫・労働金庫・信用組合）
   ・支店名 … 長い物
   ・名義  … 法人格の カナ略号（カ／ド／ユ／ゴ）＋長い 社名 */
const REI = [
  ['いちばん長い部類（信用組合＋長い社名）',
    '青森県信用組合 十和田支店 普通 1234567 カ）トウホクソウゴウケンセツコウギョウ'],
  ['労働金庫＋長い社名',
    '北海道労働金庫 札幌中央支店 普通 1234567 イ）ホッカイドウケンチクセッケイ'],
  ['信用金庫＋長い支店',
    '京都中央信用金庫 桂川支店 当座 1234567 ド）ラクナリーコーポレーション'],
  ['都市銀行＋長い社名',
    '三菱UFJ銀行 東京営業部 普通 1234567 カ）ゼロアクトインダストリーズ'],
  ['ゆうちょ（8桁）',
    'ゆうちょ銀行 〇一八店 普通 12345678 カ）ニホンソウゴウケンセツ'],
  ['地方銀行＋ふつうの社名',
    '伊予銀行 今治支店 普通 1234567 ド）ラクナリー'],
];

function html(bank) {
  const ln = [{ name: 'エアコン取付工事', qty: '1', unit: '式', price: '42000', amount: '42000', rate: 10, memo: '' }];
  const t = TAX.compute({ lines: ln, taxMode: 'exclusive', rounding: 'floor' });
  const tp = TPL.getOrDefault('std1');
  return PAPER.build({
    inv: { no: 'X', issue_ymd: '2026-09-10', kind: 'invoice', lines: ln,
      totals: { grandTotal: t.grandTotal }, data: {} },
    tax: t, partner: { name: '黒田空調', honor: '御中' },
    org: { yago: '合同会社Rakunally', invoiceNo: 'T1234567890123', bank: bank },
    template: tp, templateId: 'std1', theme: tp.theme,
    cols: COLS.normalizeSpec(tp.cols), deduct: 0, deductLines: [],
  }).html;
}

const b = await pwLaunch('hakaru-bank-1gyo', ch, undefined, 'chromium');
const pg = await b.newPage({ viewport: { width: 794, height: 1123 } });
console.log('★足元の 左の 列に 1行で 収まるか★（紙の 中身の 幅＝約718px）');
let dame = 0;
for (const [na, bank] of REI) {
  await pg.setContent(html(bank), { waitUntil: 'load' });
  await pg.waitForTimeout(200);
  const m = await pg.evaluate(() => {
    const s = document.querySelector('.sheet');
    const bb = s.querySelector('.note-bb');
    const l = s.querySelector('.foot-l');
    const r = s.querySelector('.foot-r');
    if (!bb) return null;
    /* ★1行に 伸ばした時の 幅★＝折り返さない状態の 中身の 幅を 測る */
    /* ★字を 小さくしたら 1行に 収まるか★も 測る（司さん 2026-09-10） */
    const haba = (ptBody, ptNo) => {
      const cp = bb.cloneNode(true);
      cp.querySelectorAll('br').forEach((x) => x.replaceWith(document.createTextNode(' ')));
      cp.style.position = 'absolute'; cp.style.left = '-9999px';
      cp.style.whiteSpace = 'nowrap'; cp.style.width = 'auto'; cp.style.minWidth = '0';
      cp.style.maxWidth = 'none';
      if (ptBody) cp.style.fontSize = ptBody + 'pt';
      if (ptNo) cp.querySelectorAll('.bank-no').forEach((e) => { e.style.fontSize = ptNo + 'pt'; });
      document.body.appendChild(cp);
      const w = Math.ceil(cp.getBoundingClientRect().width);
      cp.remove();
      return w;
    };
    const iru = haba(null, null);
    /* ★口座番号は 目立たせたまま★（司さん 2026-09-10「収まるなら 口座番号は 目立つように」）
       ＝本文だけ 小さくして、番号は 今の 13pt のまま／少しだけ 下げた 場合を 測る。 */
    const chiisai = { p9: haba(9, 13), p85: haba(8.5, 13), p8: haba(8, 13),
      p8n12: haba(8, 12), p75: haba(7.5, 13) };
    const naka = s.getBoundingClientRect().width - 2 * 37.8;   /* padding 10mm ずつ */
    return { iru: iru, chiisai: chiisai,
      hidari: l ? Math.round(l.getBoundingClientRect().width) : 0,
      migi: r ? Math.round(r.getBoundingClientRect().width) : 0,
      naka: Math.round(naka),
      /* ★実際の 紙で 何行に なったか★＝箱の 高さで 見る（1行なら 低いまま） */
      takasa: Math.round(bb.getBoundingClientRect().height),
      jitsu: Math.round(bb.getBoundingClientRect().width),
      gyo: (bb.innerHTML.match(/<br>/g) || []).length + 1 };
  });
  if (!m) { console.log('  ' + na + ' … 読めない'); continue; }
  const hidariOk = m.iru <= m.hidari;
  const nakaOk = m.iru <= m.naka;
  if (!hidariOk) dame++;
  console.log('  ' + na);
  console.log('      1行に すると ' + m.iru + 'px'
    + '（本文9pt+番号13pt ' + m.chiisai.p9 + ' ／ 8.5+13 ' + m.chiisai.p85
    + ' ／ ★8+13 ' + m.chiisai.p8 + '★ ／ 8+12 ' + m.chiisai.p8n12
    + ' ／ 7.5+13 ' + m.chiisai.p75 + '）'
    + ' ／ 左の列 ' + m.hidari + 'px … ' + (hidariOk ? '★収まる★' : '★はみ出す（+' + (m.iru - m.hidari) + 'px）★')
    + ' ／ ★実際の 箱 ' + m.jitsu + '×' + m.takasa + 'px★'
    + '（' + (m.takasa <= 30 ? '1行' : '★折り返している★') + '）');
}
await b.close();
console.log('');
console.log(dame === 0
  ? '★どれも 左の列に 1行で 収まる★＝割らずに 出せる'
  : '★' + dame + '件が 左の列に 収まらない★＝左の列を 広げるか 割るかが 要る');
