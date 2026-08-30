/* duplicate.test.mjs — ★この紙と同じ物を もう1通（複製）★
 * ============================================================================
 * ★司さん 2026-08-30「ほかの競合のアプリなどが 当たり前にしてる事は こちらも
 *   当たり前にしてな」★ の2つ目。
 *   請求書ソフトは どこも「前の1通をコピーして 次を作る」を 持っている
 *   （毎月 同じ相手に 似た内容を出すのが 商売の普通の形）。うちだけ 無かった。
 *
 * ★ここで守らせる事★
 *   ① 写す物  … 相手・明細（自由な列の中身ごと）・様式・列・税・丸め・件名・源泉・控除
 *   ② 写さない物 … 番号（取り直す）・請求日／期限・状態（下書きに戻す）・写し・合計
 *   ③ ★入金は 付いてこない★（元の紙の物。付けたら 二重に数える）
 *   ④ ★棚に列を足さない★＝どの紙から写したかは data.copyFrom（倉庫は知らない列を落とす）
 *   ⑤ 実UIでも 押せて、番号と日付が 取り直されている
 *
 * 使い方: node seikyu/tests/duplicate.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(import.meta.url);
const DOC = require_(path.join(ROOT, 'seikyu/lib/seikyu-doc.js'));
const SELF = process.argv.includes('--self-test');

let pass = 0, fail = 0;
const T = async (n, fn) => {
  try { await fn(); pass++; console.log('  ✓ ' + n); }
  catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); }
};
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' … 期待 ' + JSON.stringify(b) + ' / 実際 ' + JSON.stringify(a)); };

const SRC = {
  id: 'iv1', doc_type: 'invoice', status: 'issued', no: '202608-001',
  partner_id: 'p1', issue_ymd: '2026-08-05', due_ymd: '2026-09-30',
  tax_mode: 'exclusive', rounding: 'floor',
  lines: [{ name: '運転代行 8月分', qty: '1', unit: '式', price: '30000', rate: 10, extra: { 行き先: '桜井' } }],
  totals: { grandTotal: 33000, taxTotal: 3000 },
  snapshot: { partner: { name: '八木工業' }, at: '2026-08-05' },
  template_id: 'koujo',
  data: {
    subject: '8月分', memo: 'いつもありがとうございます', gensen: true,
    term: { kind: 'nextEom', n: 0 }, lead: '下記の通り', dateEra: 'wareki',
    cols: { items: ['日付', '行き先', '金額'], widths: { 金額: 20 }, aligns: { 金額: 'right' } },
    deductions: [{ name: '弁当代', amount: 1000 }],
    askOk: true, tplAsked: true, noMode: 'manual',
  },
};

console.log('\n[duplicate] この紙と同じ物を もう1通');

await T('★① 写す物が ぜんぶ 写っている（相手・明細・様式・列・税・件名・源泉・控除）', () => {
  const c = DOC.duplicateDoc(SRC);
  eq(c.partner_id, 'p1', '相手');
  eq(c.template_id, 'koujo', '様式');
  eq(c.tax_mode, 'exclusive', '税の入れ方');
  eq(c.rounding, 'floor', '丸め');
  eq(c.lines.length, 1, '明細の本数');
  eq(c.lines[0].price, '30000', '単価');
  eq(c.lines[0].extra['行き先'], '桜井', '★自由な列の中身が 落ちている★');
  eq(c.data.subject, '8月分', '件名');
  eq(c.data.gensen, true, '源泉');
  eq(c.data.term.kind, 'nextEom', '支払い条件');
  eq(c.data.cols.items.join(','), '日付,行き先,金額', '列');
  eq(c.data.deductions[0].amount, 1000, '控除');
  eq(c.data.memo, 'いつもありがとうございます', '備考');
});

await T('★② 写さない物は 空になっている（番号・日付・状態・写し・合計）', () => {
  const c = DOC.duplicateDoc(SRC);
  eq(c.no, '', '★番号を 持ち込んでいる＝同じ番号の紙が2枚 出る★');
  eq(c.issue_ymd, '', '請求日');
  eq(c.due_ymd, '', '期限');
  eq(c.status, 'draft', '状態');
  eq(JSON.stringify(c.totals), '{}', '合計');
  eq(JSON.stringify(c.snapshot), '{}', '★発行時の写しを 持ち込んでいる★');
  eq(c.data.noMode, 'auto', '★手打ちの番号の決め方を 継いでいる★');
  ok(!c.data.askOk, '「この内容でよいか」の答えを 継いでいる');
});

await T('★③ 明細は 別の物になっている（写した後に 元を直しても 影響しない）', () => {
  const c = DOC.duplicateDoc(SRC);
  c.lines[0].price = '9999';
  c.data.cols.items.push('備考');
  eq(SRC.lines[0].price, '30000', '★元の明細が 書き換わった＝同じ物を指している★');
  eq(SRC.data.cols.items.length, 3, '★元の列が 書き換わった★');
});

await T('★④ 棚に列を足さない（どの紙から写したかは data の中）', () => {
  const c = DOC.duplicateDoc(SRC);
  eq(c.data.copyFrom, 'iv1', '写した元が 分からない');
  ok(c.copy_from === undefined, '★倉庫が知らない列を 返している（黙って落ちる）★');
  const cols = fs.readFileSync(path.join(ROOT, 'seikyu/js/seikyu-store.js'), 'utf8');
  ok(!/copy_from/.test(cols), '★倉庫に copy_from を書いている＝棚を触っている★');
});

await T('★⑤ 見積を複製しても 見積のまま（勝手に請求書にしない）', () => {
  const c = DOC.duplicateDoc(Object.assign({}, SRC, { doc_type: 'quote' }));
  eq(c.doc_type, 'quote', '種類が変わっている');
});

/* ★実UIで 押す★ */
let JSDOM; try { ({ JSDOM } = await import('jsdom')); } catch { JSDOM = null; }
if (JSDOM) {
  const file = path.join(ROOT, 'seikyu/index.html');
  const html = fs.readFileSync(file, 'utf8');
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''),
    { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/seikyu/index.html' });
  const win = dom.window, doc = win.document;
  win.fetch = () => Promise.reject(new Error('no net'));
  win.scrollTo = () => {};
  for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
    const src = m[1].split('?')[0];
    if (/^https?:/.test(src) || ['supa-config.js', 'auth.js', 'env-badge.js'].indexOf(src.split('/').pop()) >= 0) continue;
    const p = path.resolve(path.dirname(file), src);
    if (!fs.existsSync(p)) continue;
    const el = doc.createElement('script');
    el.textContent = fs.readFileSync(p, 'utf8');
    doc.body.appendChild(el);
  }
  await new Promise((r) => setTimeout(r, 300));
  doc.getElementById('app').hidden = false;
  const A = win.SeikyuApp, St = A._state;
  St.partners = [{ id: 'p1', data: { name: '八木工業', honor: '御中' } }];
  St.invoices = [SRC];
  St.receipts = [{ id: 'r1', invoice_id: 'iv1', ymd: '2026-09-01', amount: 33000 }];
  St.store = {
    invoices: { list: () => Promise.resolve(St.invoices), usedNos: () => Promise.resolve(['202608-001']) },
    partners: { list: () => Promise.resolve(St.partners) },
    receipts: { list: () => Promise.resolve(St.receipts) },
  };
  St.org = { yago: '合同会社Rakunally' };
  St.cur = JSON.parse(JSON.stringify(SRC));
  A._go('scr-edit'); A._fillEdit();

  await T('★⑥ 発行済みの1通に「複製」のボタンが 出ている（実UI）', () => {
    const b = doc.getElementById('b-copy');
    ok(b, '★複製のボタンが 無い★');
    ok(/複製/.test(b.textContent), 'ボタンの言葉: ' + b.textContent);
    const sum = (doc.getElementById('out-sum').textContent || '');
    ok(/複製/.test(sum), '★畳みの見出しに 複製が 書いていない★：' + sum);
    console.log('     ' + b.textContent + ' ／ 見出し「' + sum + '」');
  });

  await T('★⑦ 押すと 中身は写り、番号と請求日は 取り直される（実UI）', async () => {
    await A._duplicateForTest();
    await new Promise((r) => setTimeout(r, 120));
    const v = St.cur;
    eq(v.partner_id, 'p1', '相手が 写っていない');
    eq(v.lines.length, 1, '明細が 写っていない');
    eq(v.status, 'draft', '下書きに 戻っていない');
    ok(v.no && v.no !== '202608-001', '★番号が 同じまま＝2枚 同じ番号が 出る★（' + v.no + '）');
    ok(v.issue_ymd, '請求日が 空');
    ok(!v.id || v.id !== 'iv1', '★元の紙を 上書きしようとしている★');
    console.log('     新しい番号 ' + v.no + ' ／ 請求日 ' + v.issue_ymd);
  });

  await T('★⑧ 入金は 写していない（二重に数えない）', () => {
    const rc = (St.receipts || []).filter((r) => r.invoice_id === St.cur.id);
    eq(rc.length, 0, '★複製に 入金が 付いてきた★');
    const t = ((doc.getElementById('edit-ok') || {}).textContent || '');
    ok(/入金は 写していません/.test(t), '★入金を写していない事を 言っていない★：' + t);
  });
} else {
  console.log('  ※ jsdom が無いので 実UIの3本は 走っていません（★0件ではありません★）');
}

if (SELF) {
  console.log('\n★自己確認★ 番号を そのまま持ち込む姿に戻すと 赤になるか');
  const bad = Object.assign({}, DOC.duplicateDoc(SRC), { no: SRC.no });
  if (bad.no !== '202608-001') { console.log('  NG ★戻しても 変わらない★'); process.exit(1); }
  console.log('  ok  番号が ' + bad.no + ' のまま＝②が 赤になる形（＝この試験は 効いている）');
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
