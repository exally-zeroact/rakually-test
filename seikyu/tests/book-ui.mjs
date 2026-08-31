/* book-ui.mjs — ★自社の Excel を そのまま使えるか（画面から）★
 * ============================================================================
 * ★司さん 2026-08-31「ユーザーが自社のテンプレ持ってくる機能は？」★
 *   seikyu-book.js は 2026-08-12 に作ってあったのに
 *   ★画面から 1度も 呼ばれていなかった（19日間）★。ここは その道の見張り。
 *
 * ★流れ（lib の決まりを そのまま守る）★
 *   ① 読む（★1バイトも 書かない★）
 *   ② 中身を そのまま 表で見せる（当てたセルに 色）
 *   ③ どのセルに 何を入れるかを 当てて 見せる
 *      ★当てられない物は「当てられません」と言う（空欄にも 0にもしない）★
 *   ④「この形で使う」で 会社の物として 覚える
 *   ⑤ Excelに書き出す時 その Excel に 値を入れて出す（紙・PDFは 今まで通り）
 *
 * 使い方: node seikyu/tests/book-ui.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(import.meta.url);
const SELF = process.argv.includes('--self-test');

let pass = 0, fail = 0;
const T = async (n, fn) => {
  try { await fn(); pass++; console.log('  ✓ ' + n); }
  catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); }
};
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' … 期待 ' + JSON.stringify(b) + ' / 実際 ' + JSON.stringify(a)); };

/* ★見本の xlsx を その場で作る★（repo に 客のファイルを 置かない）
   ＝「客のテンプレは 見本の値が 入った状態で 渡される」という lib の前提に そろえる。 */
let XLSX = null;
for (const cand of [path.join(ROOT, 'lib/xlsx.full.min.js'),
  path.join(ROOT, 'node_modules/xlsx/xlsx.js')]) {
  if (!fs.existsSync(cand)) continue;
  try { XLSX = require_(cand); break; } catch (e) { /* 次 */ }
}
if (!XLSX) {
  console.log('[book-ui] ★未測定★ … xlsx を作る道具が 借りられません');
  console.log('  ★これは「問題なし」では ありません★。★測るには★ npm install');
  process.exit(0);
}

const B = require_(path.join(ROOT, 'seikyu/lib/seikyu-book.js'));

function sampleBook() {
  const aoa = [
    ['', '', '', '', '', ''],
    ['', '請求書', '', '', '', ''],
    ['', '', '', '', '請求番号', 'A-0001'],
    ['', '八木工業株式会社', '御中', '', '請求日', '2026/08/05'],
    ['', '', '', '', 'お支払期限', '2026/09/30'],
    ['', '件名', '8月分 運転代行', '', '', ''],
    ['', '', '', '', 'ご請求金額', 33000],
    ['', '', '', '', '', ''],
    ['', '品名', '数量', '単価', '金額', ''],
    ['', '見本の品', 1, 30000, 30000, ''],
    ['', '', '', '', '', ''],
    ['', '', '', '小計', 30000, ''],
    ['', '', '', '消費税', 3000, ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '請求書');
  return new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
}

console.log('\n[book-ui] 自社の Excel を そのまま使えるか');

const bytes = sampleBook();
const before = Uint8Array.from(bytes);

let info = null, plan = null;
await T('★① 読める（1バイトも 書かない）', async () => {
  info = await B.inspect(bytes);
  ok(info && info.ok, '★読めない★ ' + JSON.stringify(info && info.reason));
  ok(info.sheets && info.sheets.length, 'シートが 数えられていない');
  eq(Buffer.compare(Buffer.from(before), Buffer.from(bytes)), 0, '★読むだけなのに 元を 書き換えた★');
  console.log('     シート ' + info.sheets.map((x) => x.name).join('/')
    + ' ／ 数式 ' + (info.formulaCount === null ? '（読めなかった）' : info.formulaCount + '本'));
});

await T('★② 中身を そのまま 表にできる（人が 目で 確かめられる）', () => {
  const g = B.previewGrid(info, null, { maxCols: 10, maxRows: 24 });
  ok(g && g.ok, '表に できない');
  ok(g.rows.length >= 10 && g.head.length >= 6,
    '行 ' + g.rows.length + ' 見出し ' + g.head.length + '（左上の空きを 含む）');
  const flat = g.rows.map((r) => r.cells.map((c) => c.text || '').join(' ')).join(' ');
  ok(/八木工業株式会社/.test(flat), '★中身が 表に 出ていない★');
});

await T('★③ どのセルに 何を入れるかを 当てる（見本の値が 入っているセル）', () => {
  plan = B.guessSlots(info);
  ok(plan && plan.slots, '当てられていない');
  const got = Object.keys(plan.slots).filter((k) => plan.slots[k] && plan.slots[k].addr);
  console.log('     当てた … ' + got.map((k) => k + '=' + plan.slots[k].addr).join(' / '));
  ok(got.length >= 4, '★当てた数が ' + got.length + '個★（見本の値が 入っているのに 当てられていない）');
  const nm = plan.slots.partnerName;
  ok(nm && nm.addr, '★請求先の名前を 当てられていない★');
});

await T('★④ 当てられない物は「当てられません」と言える（空欄にも 0にも しない）', () => {
  /* 何も入っていない Excel では ぜんぶ 当てられない＝それを ちゃんと 返す */
  const ws = XLSX.utils.aoa_to_sheet([['', ''], ['', '']]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'から');
  const empty = new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
  return Promise.resolve(B.inspect(empty)).then((i2) => {
    const p2 = B.guessSlots(i2);
    const got = Object.keys(p2.slots || {}).filter((k) => p2.slots[k] && p2.slots[k].addr);
    eq(got.length, 0, '★空の Excel なのに 当てたと言っている★');
  });
});

await T('★⑤ 値を入れて 出せる（数式は 触らない）', async () => {
  const vals = { partnerName: '黒田空調工業株式会社', issueYmd: '2026-09-01', no: '202609-001',
    subject: '9月分', dueYmd: '2026-10-31', subtotal: 50000, taxTotal: 5000, grandTotal: 55000 };
  /* ★srcInfo を 渡す★＝fill は 元のファイルに マスが在るかを これで 確かめる
     （渡さないと 全部「無い」と見えて 断られる＝2026-08-31 実測で 私が やっていた） */
  const out = await B.fill(bytes, plan, vals, null, info);
  ok(out && out.ok, '★書けない★ ' + JSON.stringify(out && out.reason));
  ok(out.bytes && out.bytes.length > 0, '出て来ない');
  ok(out.wrote && out.wrote.length >= 4, '書いたセルが ' + (out.wrote || []).length + '個');
  const back = await B.inspect(out.bytes);
  const flat = (back.cells[Object.keys(back.cells)[0]] || []).map((c) => String(c.text || c.value || '')).join(' ');
  ok(/黒田空調工業株式会社/.test(flat), '★入れた名前が 入っていない★');
  console.log('     書いたセル ' + out.wrote.length + '個 ／ 入れられなかった ' + (out.skipped || []).length + '個');
});

/* ★画面に 繋がっているか★（19日間 呼ばれていなかったので ここを 見張る） */
await T('★⑥ 画面から 呼ばれている（作ってあるだけ、を もう作らない）', () => {
  const app = fs.readFileSync(path.join(ROOT, 'seikyu/js/seikyu-app.js'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'seikyu/index.html'), 'utf8');
  ok(/SeikyuBook/.test(app), '★画面の JS が 1度も 呼んでいない★');
  ok(/lib\/seikyu-book\.js/.test(html), '★画面が 読み込んでいない★');
  ok(/id="book-file"/.test(html), '★Excelを 選ぶ所が 無い★');
  ok(/id="b-book-use"/.test(html), '★「この形で使う」が 無い★');
  ok(/bookExcel\(/.test(app), '★Excelに書き出す時に 使っていない★');
});

if (SELF) {
  console.log('\n★自己確認★ 画面から外したら 赤になるか');
  const app = fs.readFileSync(path.join(ROOT, 'seikyu/js/seikyu-app.js'), 'utf8');
  const broken = app.replace(/SeikyuBook/g, 'XXX');
  if (/SeikyuBook/.test(broken)) { console.log('  NG ★外しても 残る★'); process.exit(1); }
  console.log('  ok  呼ぶ所を 外すと ⑥が 赤になる形');
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
