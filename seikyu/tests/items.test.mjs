/* items.test.mjs — ★よく使う品目（品名を選ぶと 単位・単価・税率が 入る）★
 * ============================================================================
 * ★司さん 2026-08-30「ほかの競合のアプリなどが 当たり前にしてる事は こちらも
 *   当たり前にしてな」★ の4つ目。
 *   freee も Misoca も ★品目マスタ★を持っている（登録しておくと 次から 選ぶだけ）。
 *   うちは 毎回 一から打たせていた。
 *
 * ★うちのやり方＝登録させない。過去の紙から 覚える★
 *   競合は「先に登録」＝仕事が1つ増える。うちは もう出した紙に 答えが在る。
 *   ＝初めての人は 準備が要らず、2通目から 勝手に楽になる。
 *
 * ★ここで守らせる事★
 *   ① よく使う順（同じ回数なら 新しい順）
 *   ② 同じ品名で 単価が違う時は ★出した紙★が 下書きより 強い（打ちかけを 単価にしない）
 *   ③ ★人が打った物は 1文字も 上書きしない★
 *   ④ 空の品名は 覚えない
 *   ⑤ 実UIでも 候補が出て、品名を決めると 空いている所だけ 埋まる
 *
 * 使い方: node seikyu/tests/items.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(import.meta.url);
const IT = require_(path.join(ROOT, 'seikyu/lib/seikyu-items.js'));
const SELF = process.argv.includes('--self-test');

let pass = 0, fail = 0;
const T = async (n, fn) => {
  try { await fn(); pass++; console.log('  ✓ ' + n); }
  catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); }
};
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' … 期待 ' + JSON.stringify(b) + ' / 実際 ' + JSON.stringify(a)); };

const INV = [
  { id: '1', doc_type: 'invoice', status: 'issued', issue_ymd: '2026-06-05',
    lines: [{ name: '運転代行', unit: '式', price: '30000', rate: 10 },
      { name: '待機料', unit: '時間', price: '2000', rate: 10 }] },
  { id: '2', doc_type: 'invoice', status: 'issued', issue_ymd: '2026-07-05',
    lines: [{ name: '運転代行', unit: '式', price: '32000', rate: 10 }] },
  { id: '3', doc_type: 'invoice', status: 'draft', issue_ymd: '2026-08-05',
    lines: [{ name: '運転代行', unit: '式', price: '999999', rate: 10 },
      { name: '  ', price: '1' }] },
  { id: '4', doc_type: 'quote', status: 'issued', issue_ymd: '2026-08-06',
    lines: [{ name: '見積だけの品', unit: '式', price: '777', rate: 10 }] },
];

console.log('\n[items] よく使う品目（過去の紙から覚える）');

await T('★① よく使う順（同じ回数なら 新しい順）', () => {
  const L = IT.learn(INV);
  eq(L[0].name, '運転代行', '1番目');
  eq(L[0].n, 3, '回数');
  ok(L.length >= 2, '2つ目が 無い');
});

await T('★② 単価は「出した紙」が 下書きより 強い（打ちかけを 単価にしない）', () => {
  const L = IT.learn(INV);
  eq(IT.find(L, '運転代行').price, '32000', '★下書きの 999999 を 単価にしている★');
});

await T('★③ 空の品名は 覚えない', () => {
  const L = IT.learn(INV);
  ok(!L.some((x) => !x.name.trim()), '★空の品名を 覚えている★');
});

await T('★④ 種類で分けられる（請求の候補に 見積だけの品を 混ぜない）', () => {
  const inv = IT.learn(INV, { kind: 'invoice' });
  ok(!IT.find(inv, '見積だけの品'), '★請求の候補に 見積の品が 混ざっている★');
  const q = IT.learn(INV, { kind: 'quote' });
  ok(IT.find(q, '見積だけの品'), '見積の候補に 出ていない');
});

await T('★⑤ 空いている所だけ 埋める（人が打った物は 1文字も 上書きしない）', () => {
  const L = IT.learn(INV);
  const item = IT.find(L, '運転代行');
  const a = IT.fill({ name: '運転代行' }, item);
  eq(a.line.price, '32000', '単価が 入っていない');
  eq(a.line.unit, '式', '単位が 入っていない');
  eq(a.line.qty, '1', '数量が 入っていない');
  const b = IT.fill({ name: '運転代行', price: '50000', qty: '2', unit: '回' }, item);
  eq(b.line.price, '50000', '★打った単価を 上書きした★');
  eq(b.line.qty, '2', '★打った数量を 上書きした★');
  eq(b.line.unit, '回', '★打った単位を 上書きした★');
  eq(b.filled.join(''), '税率', '入れた物が 違う: ' + b.filled.join('・'));
});

await T('★⑥ 知らない品名では 何もしない（勝手に埋めない）', () => {
  const L = IT.learn(INV);
  ok(!IT.find(L, 'まだ無い品'), '知らない物を 知っていると言う');
  const r = IT.fill({ name: 'まだ無い品' }, null);
  eq(r.filled.length, 0, '★知らないのに 埋めている★');
});

await T('★⑦ 紙が1枚も無い時は 候補も 0（空振りで 落ちない）', () => {
  eq(IT.learn([]).length, 0, '空で 何か返している');
  eq(IT.learn(null).length, 0, 'null で 落ちる');
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
  St.invoices = INV; St.partners = []; St.receipts = []; St.kind = 'invoice';
  St.org = { yago: '合同会社Rakunally' };
  St.cur = { id: 'new', doc_type: 'invoice', status: 'draft', no: 'X-1', issue_ymd: '2026-08-30',
    tax_mode: 'exclusive', rounding: 'floor', lines: [{ name: '', qty: '', unit: '', price: '', rate: 10 }], data: {} };
  A._go('scr-edit'); A._fillEdit();

  await T('★⑧ 品名の欄に 候補が付いている（実UI）', () => {
    const dl = doc.getElementById('items-dl');
    ok(dl, '★候補の箱が 無い★');
    const names = [...dl.querySelectorAll('option')].map((o) => o.value);
    ok(names.indexOf('運転代行') >= 0, '★候補に 運転代行が 無い★：' + names.join('/'));
    const inp = doc.querySelector('#lines-body [data-f="name"]');
    ok(inp, '品名の欄が 無い');
    eq(inp.getAttribute('list'), 'items-dl', '★品名の欄に 候補が 繋がっていない★');
    console.log('     候補 ' + names.length + '個 … ' + names.join(' / '));
  });

  await T('★⑨ 品名を決めると 空いている所だけ 埋まる（実UI）', () => {
    const inp = doc.querySelector('#lines-body [data-f="name"]');
    inp.value = '運転代行';
    inp.dispatchEvent(new win.Event('input', { bubbles: true }));
    inp.dispatchEvent(new win.Event('change', { bubbles: true }));
    const ln = St.cur.lines[0];
    eq(ln.price, '32000', '★単価が 入っていない★');
    eq(ln.unit, '式', '★単位が 入っていない★');
    eq(ln.qty, '1', '★数量が 入っていない★');
    const t = ((doc.getElementById('edit-ok') || {}).textContent || '');
    ok(/運転代行/.test(t) && /入れました/.test(t), '★何を入れたかを 言っていない★：' + t);
    console.log('     ' + t);
  });

  await T('★⑩ 打ってある単価は 上書きしない（実UI）', () => {
    St.cur.lines.push({ name: '', qty: '', unit: '', price: '55555', rate: 10 });
    A._fillEdit();
    const inps = doc.querySelectorAll('#lines-body [data-f="name"]');
    const inp = inps[inps.length - 1];
    inp.value = '運転代行';
    inp.dispatchEvent(new win.Event('input', { bubbles: true }));
    inp.dispatchEvent(new win.Event('change', { bubbles: true }));
    eq(St.cur.lines[1].price, '55555', '★打った単価を 上書きした★');
    eq(St.cur.lines[1].unit, '式', '空いていた単位は 入るはず');
  });
} else {
  console.log('  ※ jsdom が無いので 実UIの3本は 走っていません（★0件ではありません★）');
}

if (SELF) {
  console.log('\n★自己確認★ 打った単価を 上書きする姿にすると 赤になるか');
  const item = IT.find(IT.learn(INV), '運転代行');
  const bad = Object.assign({}, IT.fill({ name: '運転代行', price: '50000' }, item).line, { price: item.price });
  if (bad.price !== '32000') { console.log('  NG ★戻しても 変わらない★'); process.exit(1); }
  console.log('  ok  上書きすると 50000 が ' + bad.price + ' になる＝⑤が 赤になる形');
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
