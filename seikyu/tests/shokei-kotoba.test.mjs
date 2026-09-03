/* shokei-kotoba.test.mjs — ★紙の足元は「小計／消費税／合計」★（C＝言葉の直し）
 * ============================================================================
 * ★なぜ（記録＝seikyu-paper.js 1123行目・実物を 機械で 読んだ数）★
 *   ★実物45枚（16社）で「明細の合計」は 0回★＝世の中の 請求書は
 *   ★小計 → 消費税 → 合計★ の 3行で 足元を 作っている。
 *   うちだけ「明細の合計」という ★世の中に 無い 言葉★を 使っていた。
 *   ⇒★言葉を 実物に 合わせる（数は 1円も 変えない）★
 *
 * ★ここで 固定する事★
 *   ① 紙に「明細の合計」は ★0回★（1枚物・複数ページ・税込・8%混在・控除あり の どれでも）
 *   ② 足元は ★小計★ が 1回（複数ページの 途中の 紙は 今までどおり「このページの小計」）
 *   ③ ★数は 1円も 変わらない★（小計＝明細を 足した額／合計＝小計＋消費税）
 *   ④ ★内訳（区分ごとの 表）は 消さない★（8%混在で 出る）
 *
 * 使い方: node seikyu/tests/shokei-kotoba.test.mjs [--self-test]
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(import.meta.url);
const TAX = require_(path.join(ROOT, 'seikyu/lib/seikyu-tax.js'));
require_(path.join(ROOT, 'seikyu/lib/seikyu-cols.js'));
const TPL = require_(path.join(ROOT, 'seikyu/lib/seikyu-templates.js'));
const PAPER = require_(path.join(ROOT, 'seikyu/lib/seikyu-paper.js'));
const SELF = process.argv.includes('--self-test');

let pass = 0, fail = 0;
const T = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const count = (s, w) => (s.split(w).length - 1);
const strip = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

function paper(n, opt) {
  opt = opt || {};
  const lines = opt.lines || Array.from({ length: n }, (_, i) => ({
    name: '作業' + (i + 1), qty: '1', unit: '式', price: '15000', rate: 10,
  }));
  const tax = TAX.compute({ lines, taxMode: opt.taxMode || 'exclusive', rounding: 'floor' });
  const built = PAPER.build({
    inv: { no: 'A-1', issue_ymd: '2026-09-02', kind: 'invoice', lines, totals: { grandTotal: tax.grandTotal }, data: {} },
    tax,
    partner: { name: 'テスト工業 株式会社', honor: '御中' },
    org: { yago: '合同会社ZEROact', invoiceNo: 'T3500003003293', bank: '伊予銀行　今治支店　普通　4160657　ド）ゼロアクト' },
    template: TPL.getOrDefault(opt.ded ? 'ded1' : 'std1'),
    deduct: opt.ded ? 11340 : 0,
    deductLines: opt.ded ? [{ name: '弁当代 矢原', amount: 11340 }] : [],
  });
  return { html: (typeof built === 'string') ? built : built.html, tax };
}
const MIX = [
  { name: '作業1', qty: '1', unit: '式', price: '15000', rate: 10 },
  { name: '弁当', qty: '2', unit: '個', price: '800', rate: 8 },
  { name: '作業2', qty: '1', unit: '式', price: '12000', rate: 10 },
  { name: 'お茶', qty: '3', unit: '本', price: '150', rate: 8 },
];
const KUMI = [
  ['1枚物（6行）', () => paper(6)],
  ['1枚物（14行）', () => paper(14)],
  ['複数ページ（40行）', () => paper(40)],
  ['税込で打つ紙', () => paper(5, { taxMode: 'inclusive' })],
  ['8%混在', () => paper(0, { lines: MIX })],
  ['控除あり', () => paper(6, { ded: true })],
];

console.log('\n[shokei-kotoba] 紙の足元は「小計／消費税／合計」（実物45枚で「明細の合計」は 0回）');

T('★① どの 紙にも「明細の合計」は 出ない', () => {
  const warui = [];
  for (const [nm, f] of KUMI) {
    const n = count(strip(f().html), '明細の合計');
    if (n) warui.push(nm + ' ' + n + '回');
  }
  ok(!warui.length, '★まだ 出ている★ … ' + warui.join(' / '));
  console.log('     ' + KUMI.length + '組 ぜんぶ 0回');
});

T('★② 足元に「小計」が 1回 出る（途中の 紙は「このページの小計」のまま）', () => {
  for (const [nm, f] of KUMI) {
    const t = strip(f().html);
    const zen = count(t, '小計');
    const page = count(t, 'このページの小計');
    ok(zen - page >= 1, '★' + nm + ' に 足元の「小計」が 無い★（小計 ' + zen + '回・このページの小計 ' + page + '回）');
  }
  const t40 = strip(paper(40).html);
  console.log('     複数ページ … 小計 ' + count(t40, '小計') + '回（うち このページの小計 ' + count(t40, 'このページの小計') + '回）');
});

T('★③ 数は 1円も 変わらない（小計＝明細の足し算／合計＝小計＋消費税）', () => {
  const { html, tax } = paper(6);
  const t = strip(html);
  const yen = (n) => '¥' + Number(n).toLocaleString('en-US');
  ok(t.indexOf(yen(tax.subtotal)) >= 0, '★小計の 額が 紙に 無い★ … ' + yen(tax.subtotal));
  ok(t.indexOf(yen(tax.grandTotal)) >= 0, '★合計の 額が 紙に 無い★ … ' + yen(tax.grandTotal));
  ok(tax.subtotal + tax.taxTotal === tax.grandTotal, '★足し算が 合わない★');
  console.log('     小計 ' + yen(tax.subtotal) + ' ＋ 消費税 ' + yen(tax.taxTotal) + ' ＝ ' + yen(tax.grandTotal));
});

T('★④ 内訳（区分ごと）は 消していない（8%混在で 出る）', () => {
  const t = strip(paper(0, { lines: MIX }).html);
  ok(/8%/.test(t) && /10%/.test(t), '★区分の 内訳が 消えた★');
});

if (SELF) {
  console.log('\n[shokei-kotoba] ★自己確認★（★わざと 壊すと 赤に なるか★）');
  let ng = 0;
  const say = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  say('言葉を 数える 物差しが 効いている', count('小計 小計', '小計') === 2);
  say('紙が 実際に 描けている（空を 数えていない）', strip(paper(6).html).length > 200);
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★2通り ぜんぶ 思った通り★');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
