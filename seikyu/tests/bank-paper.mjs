/* bank-paper.mjs — ★口座を 何個 出しても 紙から 字が 消えない★（本物のブラウザで 描いて 測る）
 * ============================================================================
 * ★なぜ（2026-09-02・実物45枚を 機械で 読んだ）★
 *   実物（OneDrive/ZEROact税理士/2025/25.ZEROact PDF・16社45枚）は
 *   ★相手ごとに 振込先の数が 違う★ … 1行18枚／3行25枚／4行1枚／6行1枚
 *   ★ENEOSは 同じ相手なのに 月で 3→4→6行と 変えている★
 *   直す前に 測ったら … ★6口座で 口座番号「4166212」が 丸ごと 消えていた★
 *   `.sheet{overflow:hidden}` なので ★はみ出した字は 黙って 切れる★＝
 *   ★数字は 全部 緑のまま★（[[feedback_numbers_green_but_open_the_picture]]）。
 *
 * ★ここで見る事（★描いた物を 測る★・source を読まない）★
 *   ① 口座 1〜6個 × 明細 1/10/20行 × 控除なし/あり で ★紙から はみ出した箱 0個★
 *   ② ★口座番号が 全部 画面に 出ている★（数えた物＝描かれた物）
 *   ③ ★空振りしていない★（何通り 測ったかを 出す・0通りで緑にしない）
 *
 * 使い方: node seikyu/tests/bank-paper.mjs [--self-test]
 *   ・★ブラウザが 無い時は「未測定」で 緑（週1の webkit.yml では 赤）★
 *     ＝借り方も 終わり値も scripts/_borrow-playwright.mjs が 1か所で 持つ
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { borrow, launch as pwLaunch } from '../../scripts/_borrow-playwright.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(import.meta.url);
const TAX = require_(path.join(ROOT, 'seikyu/lib/seikyu-tax.js'));
require_(path.join(ROOT, 'seikyu/lib/seikyu-cols.js'));
const TPL = require_(path.join(ROOT, 'seikyu/lib/seikyu-templates.js'));
const PAPER = require_(path.join(ROOT, 'seikyu/lib/seikyu-paper.js'));
const SELF = process.argv.includes('--self-test');

let pass = 0, fail = 0;
const T = (n, f) => {
  try { f(); pass++; console.log('  ✓ ' + n); }
  catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); }
};
const ok = (c, m) => { if (!c) throw new Error(m); };

/* 実物と同じ形の口座（銀行名＋支店＋種別＋番号＋名義） */
const BANKS = ['伊予銀行', '愛媛銀行', '愛媛信用金庫', 'ゆうちょ銀行', '三菱UFJ銀行', '広島銀行'];
const accounts = (n) => BANKS.slice(0, n).map((b, i) =>
  b + '　今治支店　普通　' + (4160657 + i * 1111) + '　ド）ゼロアクト');

function paperHtml(bankN, rows, ded, tplId) {
  const lines = Array.from({ length: rows }, (_, i) => ({
    name: '作業' + (i + 1) + '　室外機オーバーホール', qty: '1', unit: '式', price: '15000', rate: 10,
  }));
  const tax = TAX.compute({ lines, taxMode: 'exclusive', rounding: 'floor' });
  const built = PAPER.build({
    inv: { no: 'A-0001', issue_ymd: '2026-09-02', kind: 'invoice', lines,
      totals: { grandTotal: tax.grandTotal }, data: {} },
    tax,
    partner: { name: 'ENEOSグローブエナジー株式会社', honor: '御中' },
    org: { yago: '合同会社ZEROact', addr: '今治市本町7-3-40', tel: '090-5716-1946',
      invoiceNo: 'T3500003003293', bank: accounts(bankN).join('\n') },
    template: TPL.getOrDefault(tplId),
    deduct: ded ? 11340 : 0,
    deductLines: ded ? [{ name: '弁当代 矢原', amount: 11340 }] : [],
  });
  return (typeof built === 'string') ? built : (built.html || '');
}

/* ★描いた物を測る★＝紙の箱から はみ出した物／丸ごと 見えなくなった字 */
const MEASURE = () => {
  const out = [];
  document.querySelectorAll('.sheet').forEach((sheet) => {
    const sr = sheet.getBoundingClientRect();
    sheet.querySelectorAll('*').forEach((el) => {
      const b = el.getBoundingClientRect();
      if (!b.height && !b.width) return;
      const over = b.bottom - sr.bottom;
      if (over > 0.5) {
        out.push({ over: Math.round(over * 10) / 10, kids: el.children.length, h: Math.round(b.height),
          text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30) });
      }
    });
  });
  const nums = [...document.querySelectorAll('.bank-no')].map((e) => e.textContent.trim());
  return { over: out, gone: out.filter((o) => !o.kids && o.over >= o.h), nums, sheets: document.querySelectorAll('.sheet').length };
};

const webkit = await borrow('bank-paper', 'webkit');
const b = await pwLaunch('bank-paper', webkit);
const pg = await (await b.newContext({ viewport: { width: 1000, height: 1500 } })).newPage();

console.log('\n[bank-paper] 口座を 何個 出しても 紙から 字が 消えないか（実物 1〜6口座）');

const cases = [];
for (const bankN of [1, 2, 3, 4, 5, 6]) {
  for (const rows of [1, 10, 20]) {
    for (const ded of [false, true]) cases.push({ bankN, rows, ded });
  }
}
const bad = [], lost = [];
for (const c of cases) {
  await pg.setContent(paperHtml(c.bankN, c.rows, c.ded, c.ded ? 'ded1' : 'std1'), { waitUntil: 'load' });
  const m = await pg.evaluate(MEASURE);
  const tag = '口座' + c.bankN + '／明細' + c.rows + '行／' + (c.ded ? '控除あり' : '控除なし');
  if (m.over.length) bad.push(tag + '（はみ出した箱 ' + m.over.length + '個・最大 ' + Math.max(...m.over.map((o) => o.over)) + 'px）');
  if (m.gone.length) lost.push(tag + '（消えた字 ' + m.gone.map((g) => '「' + g.text + '」').join('/') + '）');
  /* ★口座番号は 全部 出ているか★（1枚目の足元に 出る） */
  if (m.nums.length < c.bankN) lost.push(tag + '（口座番号が ' + m.nums.length + '個しか 出ていない）');
}
await b.close();

console.log('     測った通り数 ' + cases.length + '（口座1〜6 × 明細1/10/20行 × 控除なし/あり）');
T('★① 紙から はみ出した箱 0個', () => ok(!bad.length, bad.slice(0, 4).join(' / ')));
T('★② 丸ごと 消えた字 0個（overflow:hidden で 黙って 切れない）', () => ok(!lost.length, lost.slice(0, 4).join(' / ')));
T('★③ 空振りしていない（0通りで 緑にしない）', () => ok(cases.length === 36, '通り数 ' + cases.length));

if (SELF) {
  /* ★自己確認は 環境に 左右されない形で 見る★（2026-09-02 CIで 1回 赤を出して 学んだ）
     初めは「直す前の形にすると はみ出す」を 見ていたが、
     ★CIの機械には 日本語のフォントが 無く 字が 小さく 収まる★ので
     手元では はみ出し／CIでは はみ出さない＝★環境で 揺れる自己確認★だった。
     （しかも 直した後は 枠に 蓋が 掛かるので ★そもそも 壊せない★＝見ていない物を 見たと 書く形だった）
     ⇒ 見る物を 変えた＝★口座の数で 明細の枠が 本当に 減っているか★（値で 数える・font に 依らない）。
        直しを 外すと 3口座と6口座で 枠が 同じ本数になる＝★赤★。 */
  console.log('');
  console.log('[bank-paper] ★自己確認★（★口座の数で 枠が 減るか＝直した所を 通っているか★）');
  const b2 = await pwLaunch('bank-paper', webkit);
  const pg2 = await (await b2.newContext({ viewport: { width: 1000, height: 1500 } })).newPage();
  const rowsOf = async (bankN, ded) => {
    await pg2.setContent(paperHtml(bankN, 1, ded, ded ? 'ded1' : 'std1'), { waitUntil: 'load' });
    return await pg2.evaluate(() => document.querySelectorAll('.items tbody tr').length);
  };
  const r3 = await rowsOf(3, false), r6 = await rowsOf(6, false);
  const d3 = await rowsOf(3, true), d6 = await rowsOf(6, true);
  await b2.close();
  let ng = 0;
  const say = (nm, got, want) => {
    const good = got === want;
    if (!good) ng++;
    console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + ' … ' + got
      + (good ? '' : '（' + want + ' のはず）★思っていたのと 違う★'));
  };
  console.log('     描かれた枠 … 口座3=' + r3 + '行 ／ 口座6=' + r6 + '行 ／ 控除あり 口座3=' + d3 + '行 ／ 口座6=' + d6 + '行');
  say('口座3→6 で 枠が 3行 減る（減らないと 字が 切れる）', r3 - r6, 3);
  say('控除の紙は 保険1行ぶん 多く 減る', d3 - d6, 4);
  say('★0行では ない（空振りしていない）', r3 > 0 && d3 > 0, true);
  if (ng) { console.log(''); console.log('★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★3通り ぜんぶ 思った通り★');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
