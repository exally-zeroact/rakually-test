/* recurring.test.mjs — ★毎月の請求（今月まだ出していない相手を 当てて見せる）★
 * ============================================================================
 * ★司さん 2026-08-30「ほかの競合のアプリなどが 当たり前にしてる事は こちらも
 *   当たり前にしてな」★ の5つ目。
 *   Misoca も freee も ★定期請求★（毎月 同じ内容を 自動で作る）を持っている。
 *   うちは 何も無かった＝★出し忘れる★。
 *
 * ★うちは 勝手に作らない★
 *   ・端末の中だけで動く＝決まった時刻に 動く物が 居ない（出来ない物を 出来ると見せない）
 *   ・人が見ていない所で 請求書が出来ているのは 怖い（間違っていたら 取り消しの手間が増える）
 *   ⇒ 開いた時に「毎月 出している相手で 今月まだの人」を 出す。押すのは 人。
 *
 * ★ここで守らせる事★
 *   ① 連続2か月 出している相手だけ（1回きり・とびとびは 毎月ではない）
 *   ② 今月 すでに在る相手は 出さない（★下書き・取り消しでも 在れば 出さない＝二重に作らせない★）
 *   ③ 見積は 数に入れない
 *   ④ 押すと 前回の中身が 写り、番号と請求日は 取り直される（＝複製と同じ道）
 *   ⑤ ★画面が 勝手に 作らない★（押すまで 1通も 増えない）
 *
 * 使い方: node seikyu/tests/recurring.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(import.meta.url);
const RC = require_(path.join(ROOT, 'seikyu/lib/seikyu-recurring.js'));
const SELF = process.argv.includes('--self-test');

let pass = 0, fail = 0;
const T = async (n, fn) => {
  try { await fn(); pass++; console.log('  ✓ ' + n); }
  catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); }
};
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' … 期待 ' + JSON.stringify(b) + ' / 実際 ' + JSON.stringify(a)); };

const mk = (id, p, ym, st, kind) => ({
  id, no: id, doc_type: kind || 'invoice', status: st || 'issued',
  issue_ymd: ym + '-05', partner_id: p, tax_mode: 'exclusive', rounding: 'floor',
  lines: [{ name: '運転代行', qty: '1', unit: '式', price: '30000', rate: 10 }],
  totals: { grandTotal: 33000 }, data: { subject: '毎月ぶん' },
});
const INV = [
  mk('a', 'p1', '2026-06'), mk('b', 'p1', '2026-07'),              // 毎月 → 8月まだ
  mk('c', 'p2', '2026-06'), mk('d', 'p2', '2026-07'), mk('e', 'p2', '2026-08', 'draft'), // 下書き在り
  mk('f', 'p3', '2026-04'),                                        // 1回きり
  mk('g', 'p4', '2026-06'), mk('h', 'p4', '2026-07'), mk('i', 'p4', '2026-08'),          // もう出した
  mk('j', 'p5', '2026-04'), mk('k', 'p5', '2026-06'),              // とびとび
  mk('l', 'p6', '2026-06', 'issued', 'quote'), mk('m', 'p6', '2026-07', 'issued', 'quote'), // 見積だけ
];
const PT = [
  { id: 'p1', data: { name: '八木工業' } }, { id: 'p2', data: { name: '黒田空調' } },
  { id: 'p3', data: { name: '一度きり' } }, { id: 'p4', data: { name: 'もう出した' } },
  { id: 'p5', data: { name: 'とびとび' } }, { id: 'p6', data: { name: '見積だけ' } },
];
const due = (ym) => RC.dueList({ invoices: INV, partners: PT, ym: ym || '2026-08' });

console.log('\n[recurring] 毎月の請求（今月まだの相手）');

await T('★① 連続2か月 出している相手だけ 出す', () => {
  const d = due();
  eq(d.map((x) => x.name).join(','), '八木工業', '出た相手: ' + d.map((x) => x.name).join(','));
  eq(d[0].run, 2, '連続の月数');
  console.log('     ' + d[0].name + ' … ' + d[0].lastYm + 'まで ' + d[0].run + 'か月／前回 ' + d[0].lastNo);
});

await T('★② 今月 下書きが在る相手は 出さない（二重に作らせない）', () => {
  ok(!due().some((x) => x.name === '黒田空調'), '★下書きが在るのに 出している★');
});

await T('★③ もう出した相手・1回きり・とびとびは 出さない', () => {
  const names = due().map((x) => x.name);
  ok(names.indexOf('もう出した') < 0, 'もう出した相手が 出ている');
  ok(names.indexOf('一度きり') < 0, '1回きりの相手が 出ている');
  ok(names.indexOf('とびとび') < 0, 'とびとびの相手が 出ている');
});

await T('★④ 見積は 数に入れない（見積を毎月出しても 請求の催促はしない）', () => {
  ok(!due().some((x) => x.name === '見積だけ'), '★見積を 数に入れている★');
});

await T('★⑤ 取り消した紙も「今月 在る」に数える（気づいていない ではない）', () => {
  const inv = INV.concat([mk('z', 'p1', '2026-08', 'void')]);
  const d = RC.dueList({ invoices: inv, partners: PT, ym: '2026-08' });
  ok(!d.some((x) => x.name === '八木工業'), '★一度 作って消した相手に また催促している★');
});

await T('★⑥ 月をまたいでも 効く（9月になれば また出る）', () => {
  const inv = INV.concat([mk('n', 'p1', '2026-08')]);
  const d = RC.dueList({ invoices: inv, partners: PT, ym: '2026-09' });
  ok(d.some((x) => x.name === '八木工業'), '9月に 出ていない');
});

await T('★⑦ 年をまたいでも 月の計算が 合う', () => {
  eq(RC.shift('2026-01', -1), '2025-12', '1月の1つ前');
  eq(RC.shift('2026-12', 1), '2027-01', '12月の1つ後');
  const inv = [mk('x', 'p1', '2025-12'), mk('y', 'p1', '2026-01')];
  const d = RC.dueList({ invoices: inv, partners: PT, ym: '2026-02' });
  eq(d.length, 1, '年をまたぐと 見つからない');
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
  /* ★今日の日付で 動く物★＝試験の日に左右されないよう、今月と先月の紙を その場で作る */
  const now = new Date();
  const ym = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const prev = RC.shift(ym, -1), prev2 = RC.shift(ym, -2);
  St.invoices = [mk('p', 'p1', prev2), mk('q', 'p1', prev)];
  St.partners = [{ id: 'p1', data: { name: '八木工業', honor: '御中' } }];
  St.receipts = []; St.kind = 'invoice'; St.fil = 'all';
  St.org = { yago: '合同会社Rakunally' };
  St.store = {
    invoices: { list: () => Promise.resolve(St.invoices), usedNos: () => Promise.resolve(['p', 'q']) },
    partners: { list: () => Promise.resolve(St.partners) },
    receipts: { list: () => Promise.resolve(St.receipts) },
  };
  A._go('scr-list'); A._renderListForTest();
  const txt = (id) => ((doc.getElementById(id) || {}).textContent || '').replace(/\s+/g, ' ').trim();

  await T('★⑧ 一覧に「今月まだ」が 出ている（実UI）', () => {
    const t = txt('rec-box');
    ok(/八木工業/.test(t), '★相手が 出ていない★：' + t.slice(0, 80));
    ok(/まだ/.test(t), '★まだ、と 言っていない★');
    ok(doc.querySelector('[data-rec]'), '★押す物が 無い★');
    console.log('     ' + t.slice(0, 90));
  });

  await T('★⑨ 勝手に作っていない（押すまで 1通も 増えない）', () => {
    eq(St.invoices.length, 2, '★押していないのに 紙が 増えた★');
    ok(!/自動で作りました/.test(txt('rec-box')), '★作ったと 言っている★');
    ok(/勝手に 請求書を 作る事は ありません/.test(txt('rec-box')), '★作らないと 書いていない★');
  });

  await T('★⑩ 押すと 前回の中身が 写り、番号と請求日は 取り直される（実UI）', async () => {
    doc.querySelector('[data-rec]').click();
    await new Promise((r) => setTimeout(r, 200));
    const v = St.cur;
    eq(v.partner_id, 'p1', '相手が 写っていない');
    eq(v.lines[0].name, '運転代行', '明細が 写っていない');
    eq(v.status, 'draft', '下書きに なっていない');
    ok(v.no && v.no !== 'q', '★前回の番号のまま★（' + v.no + '）');
    ok(v.issue_ymd, '請求日が 空');
    console.log('     新しい番号 ' + v.no + ' ／ 請求日 ' + v.issue_ymd);
  });

  await T('★⑪ 見積を見ている時は 出さない（請求の話）', () => {
    St.kind = 'quote'; A._renderListForTest();
    eq(txt('rec-box'), '', '★見積の画面にも 出ている★');
    St.kind = 'invoice';
  });
} else {
  console.log('  ※ jsdom が無いので 実UIの4本は 走っていません（★0件ではありません★）');
}

if (SELF) {
  console.log('\n★自己確認★ 1回きりの相手も 出す姿にすると 赤になるか');
  const loose = RC.dueList({ invoices: INV, partners: PT, ym: '2026-08' });
  const names = loose.map((x) => x.name);
  if (names.length !== 1) { console.log('  NG ★今の姿で すでに ' + names.length + '件 出ている★'); process.exit(1); }
  console.log('  ok  今は ' + names.join(',') + ' の1件だけ＝連続の縛りを外せば ①が赤になる');
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
