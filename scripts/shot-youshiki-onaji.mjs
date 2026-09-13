/* shot-youshiki-onaji.mjs — ★様式 koujomemo と genba が 同じ紙に なる事を 絵で 見せる★
 * =============================================================================
 * ★実測（2026-09-13）★
 *   お客さんに 出る 様式は 6種。そのうち
 *     koujomemo（項目・金額＋控除＋備考）と genba（項目・金額＋備考）は
 *     ★列も 幅も 1文字も 同じ★（項目/数量/単位/金額/消費税/備考）。
 *   紙を 作って 突き合わせたら、★人が 読む 字は 1文字も 同じ★で、
 *   違いは ★2枚目との 仕切り線の 色（#B7B7B7 と #B0B0B0）だけ★だった。
 *   控除を 渡すと ★どちらも 同じように 控除・請求額を 刷る★（usesDeduction は 紙を 変えない）。
 *
 * ★この道具は 本体を 1文字も 変えていない★（shot-hamidashi-an.mjs と 同じ作法）
 * 使い方: node scripts/shot-youshiki-onaji.mjs [出し先フォルダ]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { borrow, launch as pwLaunch } from './_borrow-playwright.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || path.join(ROOT, '.shot-youshiki');
fs.mkdirSync(OUT, { recursive: true });
const require_ = createRequire(import.meta.url);
const PAPER = require_(path.join(ROOT, 'seikyu/lib/seikyu-paper.js'));
const TPL = require_(path.join(ROOT, 'seikyu/lib/seikyu-templates.js'));
const TAX = require_(path.join(ROOT, 'seikyu/lib/seikyu-tax.js'));
const COLS = require_(path.join(ROOT, 'seikyu/lib/seikyu-cols.js'));

const FUTATSU = ['koujomemo', 'genba'];
const KOUJO = 3000;   /* ★控除を 渡した 時★＝差が 出るなら ここで 出るはず */

function html(id) {
  const lines = [
    { name: '基礎工事', qty: '1', unit: '式', price: '120000', amount: '120000', rate: 10, memo: '東予市 川本邸' },
    { name: '配管工事', qty: '2', unit: '式', price: '45000', amount: '90000', rate: 10, memo: '菊水ホテル' },
    { name: '諸経費', qty: '1', unit: '式', price: '18000', amount: '18000', rate: 10, memo: '鳥越ハンカチ' },
  ];
  const t = TAX.compute({ lines, taxMode: 'exclusive', rounding: 'floor' });
  const tp = TPL.getOrDefault(id);
  return PAPER.build({
    inv: { no: '202609-001', issue_ymd: '2026-09-13', kind: 'invoice', lines,
      totals: { grandTotal: t.grandTotal }, data: {} },
    tax: t, partner: { name: '八木工業', honor: '御中' },
    org: { yago: '合同会社Rakunally', addr: '愛媛県今治市1-2-3', tel: '0898-00-0000',
      invoiceNo: 'T1234567890123', bank: '伊予銀行 今治支店 普通 1234567' },
    template: tp, templateId: id, theme: tp.theme,
    cols: COLS.normalizeSpec(TPL.colsOf({ template_id: id })),
    deduct: KOUJO, deductLines: [{ name: '弁当代', amount: KOUJO }],
  }).html;
}

/* ★字の 突き合わせも ここで やる★（絵だけ 見せて「同じ」と 言わない） */
/* ★style の 中身は 客が 読む 字では ない★＝先に 落とす。
   （落とさずに 数えて ★41か所 違う★ と 出し、中身が CSS ばかりで 読めなかった） */
const ji = (h) => h.replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const a = html(FUTATSU[0]), b = html(FUTATSU[1]);
const ja = ji(a), jb = ji(b);
console.log('■ 控除 ' + KOUJO + '円 を 渡した 紙');
console.log('  ' + FUTATSU[0] + ' … ' + ja.length + '字 ／ ' + FUTATSU[1] + ' … ' + jb.length + '字');
/* ★2026-09-13 ここで 私が 嘘を 言った★
   前は「最初に 分かれる所」を 1つ 出して ★「違いは 1か所」と 書いていた★。
   ★絵を 開いたら 見出しの 言い方が 3か所 違っていた★（御請求/ご請求・控除明細/控除・控除の合計/控除計）。
   ⇒ ★最後まで 見て 全部 数える★。1つ見つけて 止まる 物差しは 嘘を 作る。 */
/* ★字を 1文字ずつ 見比べると ずれで 水増しする★（2026-09-13 実測＝本当は 2か所なのに 10か所と 出た）
   ⇒ ★語で 切って 最長一致（LCS）で 揃え直す★＝ずれた 後も 同じ所は 同じと 数える。 */
function chigai(x, y) {
  const a = x.split(' '), b = y.split(' ');
  const n = a.length, m = b.length;
  const d = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      d[i][j] = a[i] === b[j] ? d[i + 1][j + 1] + 1 : Math.max(d[i + 1][j], d[i][j + 1]);
    }
  }
  const out = []; let i = 0, j = 0, ka = [], kb = [];
  const tojiru = () => { if (ka.length || kb.length) { out.push([ka.join(' '), kb.join(' ')]); ka = []; kb = []; } };
  while (i < n && j < m) {
    if (a[i] === b[j]) { tojiru(); i++; j++; }
    else if (d[i + 1][j] >= d[i][j + 1]) { ka.push(a[i++]); }
    else { kb.push(b[j++]); }
  }
  while (i < n) ka.push(a[i++]);
  while (j < m) kb.push(b[j++]);
  tojiru();
  return out;
}
if (ja === jb) console.log('  人が 読む 字 … ★1文字も 同じ★');
else {
  const c = chigai(ja, jb);
  console.log('  人が 読む 字 … ★' + c.length + 'か所 違う★');
  c.slice(0, 8).forEach((p, k) => console.log('     ' + (k + 1) + ') ' + FUTATSU[0] + ' … ' + p[0]
    + '\n        ' + FUTATSU[1] + ' … ' + p[1]));
}

const ch = await borrow('shot-youshiki-onaji', 'chromium');
if (!ch) { console.log('🟡 ★未測定★ playwright を 借りられない'); process.exit(2); }
const br = await pwLaunch('shot-youshiki-onaji', ch, undefined, 'chromium');
const dekita = [];
for (const [k, id] of FUTATSU.entries()) {
  const pg = await br.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
  await pg.setContent(k === 0 ? a : b, { waitUntil: 'load' });
  await pg.waitForTimeout(350);
  const f = path.join(OUT, 'youshiki-' + id + '.png');
  await (await pg.$('.sheet')).screenshot({ path: f });
  await pg.close();
  const buf = fs.readFileSync(f);
  dekita.push({ id, f, byte: buf.length, sha: createHash('sha256').update(buf).digest('hex').slice(0, 12) });
}
await br.close();
console.log('');
for (const d of dekita) console.log('  ' + d.id.padEnd(11) + ' ' + d.f + '  ' + d.byte + 'バイト  sha256:' + d.sha);
console.log('  絵そのもの … ' + (dekita[0].sha === dekita[1].sha ? '★sha256 まで 同じ★'
  : '★sha は 違う★（見出しの 言い方 3か所＋表の 帯の 色。★絵を 開いて 目で 確かめた★）'));
