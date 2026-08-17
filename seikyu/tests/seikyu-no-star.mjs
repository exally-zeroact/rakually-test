/* seikyu-no-star.mjs — ★画面に「★」を出さない★
 *
 * ★なぜ要るのか★
 *   ★ は ★私たちが自分に向けて書く印★（「ここが大事」を仲間に伝える記号）。
 *   ★客の画面に出す物ではありません。★ 出ていると
 *     ・何かの記号だと思われる（押せるのかと探される）
 *     ・強調が多すぎて ★どれも強調でなくなる★
 *   2026-08-15 指示役が配信を数えて見つけた（HTMLの本文に2件・jsの文にも複数）。
 *
 * ★ソースを読むのではなく「描き終わった画面」から数える★
 *   ソースの grep だと、コメントの ★ まで拾って ★直す所を間違える★。
 *   逆に、js が組み立てて後から差し込む文は grep で拾えない。
 *   だから ★本物の画面を動かして、出来上がった本文だけを見る★。
 *
 * ★開いた画面を全部 溜めて、数えるのは一番 下★
 *   畳み（details）や、発行してから出る箱（入金）は、開かないと本文が無い。
 *   開くたびに溜めておいて、最後にまとめて数える＝★後から開く箱を見落とさない★。
 *
 * 依存: jsdom。★入っていなければ赤（SKIPを緑と呼ばない）★
 * 使い方: node seikyu/tests/seikyu-no-star.mjs
 *         node seikyu/tests/seikyu-no-star.mjs --self-test
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const require_ = createRequire(path.join(ROOT, 'package.json'));
let JSDOM;
try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません。この検証は飛ばせません（SKIPを緑と呼ばない）。npm install してください。'); process.exit(1); }
const { createFakeSupa } = require_(path.join(ROOT, 'tests/fake-supa.js'));

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 画面に出る印。★ だけでなく、同じ使い方をする記号もまとめて見る */
const MARKS = ['★', '☆', '■', '◆'];
const markRe = new RegExp('[' + MARKS.join('') + ']');

/* ── 本物の画面を読む ── */
const html = fs.readFileSync(path.join(ROOT, 'seikyu/index.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1].split('?')[0])
  .filter((s) => !/^https?:/.test(s) && !/supa-config|auth\.js|exally-login/.test(s));
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'dangerously', url: 'http://localhost/seikyu/', pretendToBeVisual: true });
const win = dom.window, doc = win.document;
win.fetch = () => Promise.reject(new Error('no net'));
win.confirm = () => true;
win.scrollTo = () => {};
win.print = () => {};
win.open = function () {
  const w = { _html: '', document: { open() {}, write(s) { w._html += s; }, close() {}, readyState: 'complete', title: '' }, addEventListener() {}, focus() {}, print() {} };
  return w;
};
win.URL.createObjectURL = () => 'blob:test';
win.URL.revokeObjectURL = () => {};
win.HTMLAnchorElement.prototype.click = function () {};
for (const src of srcs) {
  const el = doc.createElement('script');
  el.textContent = fs.readFileSync(path.join(ROOT, 'seikyu', src.replace(/^\.\.\//, '../')), 'utf8');
  doc.body.appendChild(el);
}
ok(win.SeikyuApp, 'SeikyuApp が露出していない（読み込みに失敗）');

const sb = createFakeSupa({
  uid: 'u1',
  tables: {
    pay_org: [{ account_id: 'u1', data: { yago: '合同会社ZEROact', invoiceNo: 'T3500003003293' }, updated_at: '2026-08-01T00:00:00Z' }],
    pay_partners: [{ id: 'pt_a', account_id: 'u1', sort: 0, data: { name: '八木工業 株式会社', keisho: '御中' }, deleted_at: null }],
    pay_invoices: [], pay_receipts: [],
    pay_companies: [{ account_id: 'u1', data: {}, updated_at: '2026-08-01T00:00:00Z' }],
  },
  pk: { pay_org: 'account_id', pay_companies: 'account_id' },
  unique: { pay_invoices: [['account_id', 'doc_type', 'no']] },
});
const $ = (id) => doc.getElementById(id);
const setVal = (id, v) => { const e = $(id); e.value = v; e.dispatchEvent(new win.Event('input')); e.dispatchEvent(new win.Event('change')); };
const setLine = (i, k, v) => {
  const tr = doc.querySelectorAll('#lines-body tr')[i]; if (!tr) return;
  const e = tr.querySelector('[data-f="' + k + '"]'); if (!e) return;
  e.value = v; e.dispatchEvent(new win.Event('input')); e.dispatchEvent(new win.Event('change'));
};

await win.SeikyuApp.attach(sb);
await sleep(30);

/* ── 開いた画面を溜める（数えるのは一番 下） ────────────────────
   ★見えている物だけ★を溜める（display:none の箱の中は「まだ画面に出ていない」）。 */
const seen = [];
function shown(el) {
  for (let e = el; e && e !== doc.body; e = e.parentElement) {
    if (e.style && e.style.display === 'none') return false;
    if (e.tagName === 'DETAILS' && !e.open) return false;
  }
  return true;
}
function soakUp(where) {
  for (const scr of ['scr-list', 'scr-edit', 'scr-set']) {
    const el = $(scr);
    if (!el || !el.classList.contains('active')) continue;
    for (const node of el.querySelectorAll('*')) {
      if (node.children.length) continue;              // 葉だけ見る（親で二重に数えない）
      if (!shown(node)) continue;
      const txt = (node.textContent || '').trim();
      const ph = node.getAttribute && node.getAttribute('placeholder');
      const ttl = node.getAttribute && node.getAttribute('title');
      const aria = node.getAttribute && node.getAttribute('aria-label');
      for (const [kind, t] of [['本文', txt], ['placeholder', ph], ['title', ttl], ['aria-label', aria]]) {
        if (t && markRe.test(t)) seen.push({ where, kind, id: node.id || node.className || node.tagName, text: t.slice(0, 90) });
      }
    }
  }
}

/* ── 画面を一通り 開いて回る（畳みも 発行後に出る箱も） ── */
async function walk() {
  // 一覧（請求書／見積書 の両方）
  doc.querySelector('.bn[data-scr="scr-list"]').click(); await sleep(20); soakUp('一覧');
  doc.querySelector('#kind-seg [data-kind="quote"]').click(); await sleep(60); soakUp('一覧(見積)');
  doc.querySelector('#kind-seg [data-kind="invoice"]').click(); await sleep(60); soakUp('一覧(請求)');

  // 入力（下書き）＝畳みも全部 開く
  $('b-new').click(); await sleep(30);
  for (const d of doc.querySelectorAll('#scr-edit details')) d.open = true;
  await sleep(20); soakUp('入力(下書き)');

  // 中身を入れて 合計・控除・注意書きを出す
  setVal('e-partner', 'pt_a'); await sleep(60);
  if (win.getComputedStyle($('guess-card')).display !== 'none') soakUp('入力(前回から当てる)');
  if (win.getComputedStyle($('guess-card')).display !== 'none') { $('b-guess-edit').click(); await sleep(20); }
  setVal('e-issue', '2026-07-21'); await sleep(40);
  setLine(0, 'name', '工事代金'); setLine(0, 'qty', '140'); setLine(0, 'price', '1900');
  await sleep(60); soakUp('入力(合計あり)');

  // 控除（空＝赤／埋める）
  $('b-ded-add').click(); await sleep(40); soakUp('入力(控除が空＝赤)');
  const dn = doc.querySelector('[data-dn="0"]'), da = doc.querySelector('[data-da="0"]');
  dn.value = '弁当代'; dn.dispatchEvent(new win.Event('input'));
  da.value = '11340'; da.dispatchEvent(new win.Event('input'));
  await sleep(60); soakUp('入力(控除あり)');

  // 端数を寄せる形（税込入力）＝その説明も画面に出る
  setVal('e-taxmode', 'inclusive'); await sleep(40);
  setLine(0, 'qty', ''); setLine(0, 'price', ''); setLine(0, 'amount', '1005');
  $('b-addline').click(); await sleep(20); setLine(1, 'name', 'b'); setLine(1, 'amount', '1005');
  $('b-addline').click(); await sleep(20); setLine(2, 'name', 'c'); setLine(2, 'amount', '1005');
  await sleep(80); soakUp('入力(端数を寄せた)');
  setVal('e-taxmode', 'exclusive'); await sleep(40);

  // 発行 → 入金の箱・出来る事の畳み
  $('b-issue').click(); await sleep(120);
  for (const d of doc.querySelectorAll('#scr-edit details')) d.open = true;
  await sleep(20); soakUp('入力(発行済み)');
  setVal('pay-ymd', '2026-08-31'); setVal('pay-amt', '1000'); await sleep(20);
  $('b-pay-add').click(); await sleep(120); soakUp('入力(入金あり)');

  // 設定（3つの箱ぜんぶ）
  doc.querySelector('.bn[data-scr="scr-set"]').click(); await sleep(60);
  for (const d of doc.querySelectorAll('#scr-set details')) d.open = true;
  await sleep(20); soakUp('設定');
  setVal('s-partner', 'pt_a'); await sleep(40); soakUp('設定(取引先を選んだ)');
}

/* ── self-test：わざと1つ戻して赤になるか ── */
if (process.argv.includes('--self-test')) {
  console.log('\n[seikyu-no-star --self-test] わざと1つ戻すと赤になるか');
  let sp = 0, sf = 0;
  const S = (n, fn) => { try { fn(); sp++; console.log('  ✓ ' + n); } catch (e) { sf++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };

  await walk();
  const before = seen.length;
  S('★まず 今の画面に印が0件（ここが0でないと 下の自己確認が意味を持たない）', () => {
    if (before !== 0) throw new Error('印が ' + before + '件 残っている: ' + seen.map((x) => x.text).join(' / '));
  });

  S('★画面に ★ を1つ戻すと 見つかる（見つからなければ この見張りは空振り）', () => {
    doc.querySelector('.bn[data-scr="scr-edit"]').click();
    const el = $('ded-why');
    if (!el) throw new Error('戻す先の文が無い');
    el.textContent = '★ここが大事★';
    seen.length = 0;
    soakUp('自己確認');
    if (!seen.length) throw new Error('★戻した印を見つけられない★');
    el.textContent = 'もどした';
  });

  S('★placeholder の中の印も見つける（本文だけ見ていたら見落とす）', () => {
    /* ★今 見えている欄で試す★（畳んで隠れている欄で試すと、
       見落としても「隠れているから0件」で緑になる＝自己確認が空振りになる） */
    const el = $('pay-memo');
    if (!el || win.getComputedStyle($('pay-card')).display === 'none') throw new Error('見えている欄が無い（発行まで進んでいない）');
    const keep = el.getAttribute('placeholder');
    el.setAttribute('placeholder', '例：★手数料 差引後★');
    seen.length = 0;
    soakUp('自己確認');
    const hit = seen.filter((x) => x.kind === 'placeholder');
    el.setAttribute('placeholder', keep);
    if (!hit.length) throw new Error('★placeholder の印を見落とす★');
  });

  S('★畳みの中（開いていない details）は「まだ画面に出ていない」と数える', () => {
    const d = $('out-box');           // 発行済みでも在る畳み
    if (!d || d.tagName !== 'DETAILS') throw new Error('畳みが無い');
    const probe = doc.createElement('p');
    probe.id = 'star-probe';
    probe.textContent = '★かくれている★';
    d.appendChild(probe);
    const keepOpen = d.open;
    d.open = false;
    seen.length = 0;
    soakUp('自己確認');
    const hidden = seen.filter((x) => x.id === 'star-probe').length;
    // ★開けば見つかる★（開いても見つからないなら、この確認そのものが空振り）
    d.open = true;
    seen.length = 0;
    soakUp('自己確認');
    const opened = seen.filter((x) => x.id === 'star-probe').length;
    probe.remove();
    d.open = keepOpen;
    if (hidden) throw new Error('畳んだままの物を数えている（開いた時に数える）');
    if (!opened) throw new Error('★開いても見つけられない＝この確認が空振り★');
  });

  console.log('\n[self-test] ' + sp + ' passed, ' + sf + ' failed');
  process.exit(sf ? 1 : 0);
}

/* ── 本体 ── */
console.log('\n[請求書 画面に「★」を出さない]');
await walk();

T('★画面を一通り 開いて回れている（0画面なら何も見ていない）', () => {
  ok(doc.querySelectorAll('#scr-edit .card').length >= 4, '入力の画面の箱が少なすぎる');
  ok(doc.querySelectorAll('#lines-body tr').length >= 1, '明細が描かれていない');
  ok($('pay-card') && $('pay-card').style.display !== 'none', '発行しても入金の箱が出ていない＝開き切れていない');
});

T('★★描き終わった画面に ★ が1つも無い★★', () => {
  ok(seen.length === 0, '★画面に印が ' + seen.length + '件 出ている★\n       '
    + seen.map((x) => '[' + x.where + '] ' + x.kind + ' <' + x.id + '> ' + x.text).join('\n       '));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
