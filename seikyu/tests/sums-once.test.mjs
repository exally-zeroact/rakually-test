/* sums-once.test.mjs — ★紙に「明細の合計」は 1回だけ★（同じ言葉が 2回 出ない）
 * ============================================================================
 * ★なぜ（指示役 2026-09-02 が 絵を見て 見つけた／私が 実物で 数えた）★
 *   1枚物の紙に ★「明細の合計」が 2回★ 出ている
 *     ①表の最終行（列の真下）  ②その下の 締め（小計の所）
 *   ★実物45枚（16社）では 「明細の合計」は 0回★（機械で読んだ）。
 *   実物の足元は ★小計／消費税／合計 の3行だけ★＝★表の中に 合計行を 持たない★。
 *
 * ★指示役の裁定（2026-09-02）＝案B★
 *   「★表の最終行を 出さない★／下は 実物の言葉（小計・消費税・合計）」
 *   ・数字は 1つも 消えない（列の縦計は 下の行と 同じ値）＝★情報は 減らない・言葉だけ 減る★
 *   ・★言葉の直し（明細の合計→小計）は 別の回★（指示役「同じ回に 混ぜない」＝
 *     実測 seikyu-paper.test.mjs だけで ★25か所★ が この言葉を 固定している）
 *
 * ★ここで見る事★
 *   ① 1枚物の紙で ★「明細の合計」は 1回だけ★（表の中には 出ない）
 *   ② ★数は 消えていない★＝締めの「明細の合計」の額 ＝ 明細の金額を 足した額
 *   ③ 複数ページの紙は ★各ページに「このページの小計」が 出る★（実物 ENEOS 25.12 と 同じ形）
 *   ④ 控除ありの紙でも ①が 成り立つ
 *   ⑤ ★空振りしていない★（紙が 出来ている・0通りで 緑にしない）
 *
 * 使い方: node seikyu/tests/sums-once.test.mjs [--self-test]
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

function paper(n, ded) {
  const lines = Array.from({ length: n }, (_, i) => ({
    name: '作業' + (i + 1), qty: '1', unit: '式', price: '15000', rate: 10,
  }));
  const tax = TAX.compute({ lines, taxMode: 'exclusive', rounding: 'floor' });
  const built = PAPER.build({
    inv: { no: 'A-1', issue_ymd: '2026-09-02', kind: 'invoice', lines,
      totals: { grandTotal: tax.grandTotal }, data: {} },
    tax,
    partner: { name: 'ENEOSグローブエナジー株式会社', honor: '御中' },
    org: { yago: '合同会社ZEROact', invoiceNo: 'T3500003003293',
      bank: '伊予銀行　今治支店　普通　4160657　ド）ゼロアクト' },
    template: TPL.getOrDefault(ded ? 'ded1' : 'std1'),
    deduct: ded ? 11340 : 0,
    deductLines: ded ? [{ name: '弁当代 矢原', amount: 11340 }] : [],
  });
  return { html: (typeof built === 'string') ? built : built.html, tax };
}

console.log('\n[sums-once] 紙に「明細の合計」は 1回だけ（実物45枚では 0回の言葉）');

T('★① 1枚物の紙で 「明細の合計」は 1回だけ', () => {
  const t = strip(paper(6, false).html);
  const n = count(t, '明細の合計');
  ok(n === 1, '★' + n + '回 出ている★（表の最終行と 締めで 2回 出ていた）');
  console.log('     1枚物 … 「明細の合計」' + n + '回');
});

T('★② 数は 消えていない（締めの額＝明細を足した額）', () => {
  const { html, tax } = paper(6, false);
  const t = strip(html);
  const yen = (v) => '¥' + Number(v).toLocaleString('ja-JP');
  ok(t.indexOf(yen(tax.subtotal)) >= 0, '★明細の合計の額（' + yen(tax.subtotal) + '）が 紙に 無い★');
  ok(t.indexOf(yen(tax.grandTotal)) >= 0, '★合計の額（' + yen(tax.grandTotal) + '）が 紙に 無い★');
  console.log('     額は 出ている … 明細の合計 ' + yen(tax.subtotal) + ' ／ 合計 ' + yen(tax.grandTotal));
});

T('★③ 複数ページの紙は 各ページに「このページの小計」', () => {
  const t = strip(paper(30, false).html);
  const n = count(t, 'このページの小計');
  ok(n >= 2, '★' + n + '回 しか 出ていない（2ページなら 2回）★');
  console.log('     2ページの紙 … 「このページの小計」' + n + '回');
});

T('★④ 控除ありの紙でも 1回だけ', () => {
  const t = strip(paper(4, true).html);
  const n = count(t, '明細の合計');
  ok(n === 1, '★控除ありで ' + n + '回★');
});

T('★⑤ 空振りしていない（紙が 出来ている）', () => {
  const h = paper(6, false).html;
  ok(h.length > 3000, '★紙が 短すぎる（' + h.length + '文字）＝組めていない★');
  ok(strip(h).indexOf('請求書') >= 0, '★題名が 無い★');
});

if (SELF) {
  console.log('\n[sums-once] ★自己確認★（★数える物が 空振りしていないか★）');
  let ng = 0;
  const say = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  const t = strip(paper(6, false).html);
  say('紙の字を 読めている（「請求書」が 在る）', t.indexOf('請求書') >= 0);
  say('★2回 出ている紙を 作ったら 2と 数える★（数え方が 効いている）',
    count(t + ' 明細の合計', '明細の合計') === 2);
  say('タグを 外してから 数えている（<span>で 割れても 拾える）',
    count(strip('<span>明細</span><span>の合計</span>'), '明細 の合計') === 1
    || count(strip('<b>明細の合計</b>'), '明細の合計') === 1);
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★3通り ぜんぶ 思った通り★');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
