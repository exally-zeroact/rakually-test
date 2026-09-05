/* delivery.test.mjs — ★納品書（品物を納めた証）★
 * ============================================================================
 * ★司さん 2026-08-30「ほかの競合のアプリなどが 当たり前にしてる事は こちらも
 *   当たり前にしてな」★ の3つ目。
 *   Misoca も freee も「見積 → 納品 → 請求 → 領収」を 1押しで出せる。
 *   うちは 見積・請求・領収は 在ったのに ★納品書だけ 無かった★。
 *
 * ★棚を増やさない★
 *   納品書は doc_type ではない＝★同じ1通を 納品書の顔で出す紙★（領収書と同じ考え方）。
 *   （倉庫の doc_type は check (invoice, quote) で縛ってある＝棚を触るのは 司さんの一言）
 *
 * ★納品書に 出してはいけない物★
 *   ・お振込先   … 納品書は ★支払いの依頼ではない★
 *   ・お支払期限 … 同じ理由
 *   ⇒ 出すと「これで払え」の紙になり、後から出す請求書と ★二重請求に見える★
 *
 * 使い方: node seikyu/tests/delivery.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(import.meta.url);
const PAPER = require_(path.join(ROOT, 'seikyu/lib/seikyu-paper.js'));
const TPL = require_(path.join(ROOT, 'seikyu/lib/seikyu-templates.js'));
const X = require_(path.join(ROOT, 'seikyu/lib/seikyu-tax.js'));
const SELF = process.argv.includes('--self-test');

let pass = 0, fail = 0;
const T = (n, fn) => {
  try { fn(); pass++; console.log('  ✓ ' + n); }
  catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); }
};
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };

const LINES = [
  { name: '運転代行 8月分', qty: '1', unit: '式', price: '30000', rate: 10 },
  { name: '待機料', qty: '2', unit: '時間', price: '2000', rate: 10 },
];
const TAX = X.compute({ lines: LINES, taxMode: 'exclusive', rounding: 'floor' });
function paper(kind) {
  const b = PAPER.build({
    inv: { no: '202608-001', issue_ymd: '2026-08-05', due_ymd: '2026-09-30',
      kind: 'invoice', lines: LINES, totals: { grandTotal: TAX.grandTotal }, data: { memo: 'いつもありがとうございます' } },
    tax: TAX,
    partner: { name: '八木工業株式会社', honor: '御中' },
    org: { yago: '合同会社Rakunally', addr: '愛媛県今治市', invoiceNo: 'T3500003003293',
      bank: '伊予銀行 今治支店 普通 1234567 ド)ゼロアクト' },
    template: TPL.getOrDefault('std1'),
    docKind: kind,
  });
  return (typeof b === 'string') ? b : (b.html || '');
}
const DELI = paper('delivery'), INV = paper();
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

console.log('\n[delivery] 納品書（品物を納めた証）');

T('★① 見出しが「納品書」になっている', () => {
  ok(/納　品　書/.test(DELI), '★見出しが 納品書ではない★');
  ok(!/請　求　書/.test(DELI), '★請求書の見出しが 残っている★');
});

T('★② 金額の札が「ご請求」ではない（払えの紙ではない）', () => {
  const t = strip(DELI);
  ok(/納品金額/.test(t), '★納品金額と 書いていない★');
  ok(!/ご請求金額/.test(t), '★ご請求金額 と 書いている＝二重請求に見える★');
  console.log('     ' + (t.match(/納品金額[^ ]*\s*[^ ]*/) || [''])[0]);
});

T('★③ お振込先を 出していない（支払いの依頼ではない）', () => {
  ok(!/お振込先/.test(DELI), '★納品書に お振込先が 出ている★');
  ok(/お振込先/.test(INV), '★請求書からも 振込先が 消えた（やり過ぎ）★');
});

T('★④ お支払期限を 出していない', () => {
  ok(!/お支払期限/.test(DELI), '★納品書に お支払期限が 出ている★');
  ok(/お支払期限/.test(INV), '★請求書からも 期限が 消えた（やり過ぎ）★');
});

T('★⑤ 日付の札は「納品日」', () => {
  ok(/納品日/.test(strip(DELI)), '★納品日と 書いていない★');
  ok(!/請求日/.test(strip(DELI)), '★請求日と 書いている★');
});

T('★⑥ 中身（相手・明細・合計・自社）は 請求書と同じ物が 出ている', () => {
  const t = strip(DELI);
  ok(/八木工業株式会社/.test(t), 'あて名');
  ok(/運転代行 8月分/.test(t), '明細');
  ok(/待機料/.test(t), '明細2行目');
  ok(/37,400|37400/.test(t), '★合計が 出ていない★');
  ok(/合同会社Rakunally/.test(t), '自社');
  ok(/T3500003003293/.test(t), '★登録番号が 落ちている★');
});

T('★⑦ 備考は そのまま出る（納品書でも 言いたい事は 書ける）', () => {
  ok(/いつもありがとうございます/.test(strip(DELI)), '備考が 落ちている');
});

T('★⑧ 棚を増やしていない（doc_type に納品書を足していない）', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/schema-seikyu.sql'), 'utf8');
  const m = /doc_type in \(([^)]*)\)/.exec(sql);
  ok(m, 'doc_type の縛りが 読めない');
  ok(!/delivery/.test(m[1]), '★棚の縛りを 触っている（司さんの一言が要る所）★');
  const store = fs.readFileSync(path.join(ROOT, 'seikyu/js/seikyu-store.js'), 'utf8');
  ok(!/delivery/.test(store), '★倉庫に 納品書を 書いている★');
  console.log('     倉庫の doc_type … ' + m[1].trim() + '（触っていない）');
});

/* ★⑩ 名前も 納品書に する★（2026-09-05 実物を 押して 見つけた）
   ＝納品書の ボタンから 落ちる PDFの 名前が ★「…_請求書_33000.pdf」★だった。
     紙は 納品書なのに ★名前だけ 請求書★＝お客さんは 中身と 違う名前で 保存する。
   ★中身が 合っていても 名前が 違えば 別の紙★（[[feedback_output_filename_suggest_all_apps]]）。 */
T('★⑩ 納品書の ファイル名は「納品書」（紙と 名前が 食い違わない）', () => {
  const NAME = require_(path.join(ROOT, 'seikyu/lib/seikyu-name.js'));
  ok(NAME.KIND_LABEL.delivery === '納品書', '納品書の 呼び名が 無い（' + NAME.KIND_LABEL.delivery + '）');
  const n = NAME.suggest({ docType: 'delivery', issueYmd: '2026-09-05',
    partnerName: '株式会社テスト', grandTotal: 33000, ext: 'pdf' });
  ok(/納品書/.test(n), '★納品書の 名前に なっていない★: ' + n);
  ok(!/請求書/.test(n), '★名前が 請求書のまま★: ' + n);
  /* ★画面の 配線も 見る★＝lib だけ 直して 呼ぶ側が 古いと 直っていない */
  const app = fs.readFileSync(path.join(ROOT, 'seikyu/js/seikyu-app.js'), 'utf8');
  ok(/b-delivery[\s\S]{0,220}askName\('pdf',[\s\S]{0,80}'delivery'\)/.test(app),
    '★納品書のボタンが 種類を 渡していない（名前は 請求書のまま）★');
  console.log('     名前 … ' + n);
});

T('★⑨ 見積・領収の顔は 変わっていない（納品書を足して 壊していない）', () => {
  ok(/見　積　書/.test(paper('quote')), '見積の見出し');
  ok(/請　求　書/.test(INV), '請求の見出し');
});

if (SELF) {
  console.log('\n★自己確認★ 納品書に 振込先を出す姿にすると 赤になるか');
  const src = fs.readFileSync(path.join(ROOT, 'seikyu/lib/seikyu-paper.js'), 'utf8');
  ok(/isDelivery \? '' : textOf\(g\.bank\)/.test(src),
    '★振込先を 止めている所が 見つからない（書き方が変わった？）★');
  console.log('  ok  振込先を止める1行が 在る＝ここを外せば ③が赤になる');
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
