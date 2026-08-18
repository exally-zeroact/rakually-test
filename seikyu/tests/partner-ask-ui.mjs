/* partner-ask-ui.mjs — ★取引先を1問ずつ聞く★を ★実UIで押し込む★
 * =============================================================================
 * なぜ別に要るか（決まり: ★テストは2層★ 実データ＋実UI全ボタン）:
 *   partner-ask.test.mjs は ★中身（lib と ソース）★を見る。
 *   ここは ★本物の index.html と seikyu-app.js を動かして、実際に押す★。
 *   ★押す物の一覧を先に出してから押す★（押した数を報告しない）。
 *
 * ここで止めたい事故:
 *   ①押しても何も起きない（無反応に見える）
 *   ②答えたのに 倉庫へ書かれていない（1問ごと保存が効いていない）
 *   ③答えたのに 画面が返さない（結果が出ない）
 *   ④答え終わっても 入力画面に空欄のカードが残る
 *   ⑤根拠を押しても 何も出ない／alert が出る
 *   ⑥聞いた事が ★紙に届かない★（あて名が変わらない）
 *
 * 依存: jsdom。★入っていなければ赤（SKIPを緑と呼ばない）★
 * 使い方: node seikyu/tests/partner-ask-ui.mjs
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
catch { console.log('★jsdomが入っていません。飛ばせません（SKIPを緑と呼ばない）。npm install してください。'); process.exit(1); }
const { createFakeSupa } = require_(path.join(ROOT, 'tests/fake-supa.js'));

let pass = 0, fail = 0;
const TA = async (n, fn) => { try { await fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const html = fs.readFileSync(path.join(ROOT, 'seikyu/index.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1].split('?')[0])
  .filter((s) => !/^https?:/.test(s) && !/supa-config|auth\.js|exally-login/.test(s));
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'dangerously', url: 'http://localhost/seikyu/', pretendToBeVisual: true });
const win = dom.window, doc = win.document;

const errs = [];
win.addEventListener('error', (e) => errs.push('window.error: ' + (e.message || e)));
win.addEventListener('unhandledrejection', (e) => errs.push('unhandledrejection: ' + ((e.reason && e.reason.message) || e.reason)));
win.fetch = () => Promise.reject(new Error('no net'));
win.scrollTo = () => {}; win.print = () => {};
/* ★alert は使わない★＝呼ばれたら記録して赤にする（知らせの出口は1つ） */
const alerts = [];
win.alert = (m) => { alerts.push(String(m)); };
win.confirm = () => true;
win.URL.createObjectURL = () => 'blob:t'; win.URL.revokeObjectURL = () => {};

for (const src of srcs) {
  const el = doc.createElement('script');
  el.textContent = fs.readFileSync(path.join(ROOT, 'seikyu', src.replace(/^\.\.\//, '../')), 'utf8');
  doc.body.appendChild(el);
}
ok(win.SeikyuApp, 'SeikyuApp が露出していない');

const sb = createFakeSupa({
  uid: 'u1',
  tables: {
    pay_org: [{ account_id: 'u1', data: { yago: '株式会社ゼロアクト', invoiceNo: 'T3500003003293' }, updated_at: '2026-08-01T00:00:00Z' }],
    /* 「前に出た値」を持つ相手を2社。★よく出る順★が効くか測るため 翌月末を2社に揃える */
    pay_partners: [
      { id: 'pt_a', account_id: 'u1', sort: 0, data: { name: 'A株式会社', keisho: '御中', addr: '愛媛県今治市1-1', payTerm: { kind: 'nextEom', n: 0 }, gensen: false, askOk: { honor: 1, person: 1, addr: 1, payTerm: 1, gensen: 1 } }, deleted_at: null },
      { id: 'pt_b', account_id: 'u1', sort: 1, data: { name: 'B工務店', keisho: '御中', addr: '愛媛県今治市2-2', payTerm: { kind: 'nextEom', n: 0 }, gensen: false, askOk: { honor: 1, person: 1, addr: 1, payTerm: 1, gensen: 1 } }, deleted_at: null },
      /* ★これから聞く相手★（名前しか無い＝作った直後の姿） */
      { id: 'pt_n', account_id: 'u1', sort: 2, data: { name: '藤原建設株式会社' }, deleted_at: null },
    ],
    pay_invoices: [],
    pay_receipts: [],
    pay_companies: [{ account_id: 'u1', data: {}, updated_at: '2026-08-01T00:00:00Z' }],
  },
  pk: { pay_org: 'account_id', pay_companies: 'account_id' },
  unique: { pay_invoices: [['account_id', 'doc_type', 'no']] },
});
const db = sb._db;
const $ = (id) => doc.getElementById(id);
const qa = (s) => [...doc.querySelectorAll(s)];
const click = (el) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
const ptn = () => (db.pay_partners.filter((p) => p.id === 'pt_n')[0] || {}).data || {};

console.log('\n[取引先を1問ずつ聞く — 実UIで押す]');
await win.SeikyuApp.attach(sb);
await sleep(30);

/* 設定の画面を開いて この相手を選ぶ */
click(qa('[data-scr="scr-set"]')[0]);
await sleep(20);
const sel = $('s-partner');
sel.value = 'pt_n';
sel.dispatchEvent(new win.Event('change'));
await sleep(20);

/* ═══ ★押す物の一覧を先に出す★（押した数を報告しない） ═══ */
const inventory = [];
function snapshotPressables(tag) {
  const host = $('pt-ask-set');
  const items = [...host.querySelectorAll('button')].map((b) => ({
    tag,
    what: b.className.replace(/\s+/g, '.'),
    label: (b.textContent || '').trim().slice(0, 24),
    key: b.dataset.paskPick || b.dataset.paskOk || b.dataset.paskSkip || b.dataset.paskWhy || b.dataset.paskAgain || b.dataset.paskChip || '',
  }));
  inventory.push(...items);
  return items;
}

console.log('\n── ★押す物の一覧（押す前に書き出す）★ ──');
const q1 = snapshotPressables('問1');
q1.forEach((x) => console.log('   [' + x.tag + '] ' + x.what + ' … ' + x.label + (x.key ? '（' + x.key + '）' : '')));
ok(q1.length > 0, '★聞く形にボタンが1つも無い（描けていない）★');

await TA('1. ★開いた時点で 敬称を当てて 根拠を出している（空欄を並べない）', async () => {
  const t = $('pt-ask-set').textContent;
  ok(/あとに付けるのは/.test(t), '最初の問いが敬称でない：' + t.slice(0, 60));
  ok(/当てました/.test(t), '当てていない（空欄を並べている）');
  ok(/御中/.test(t), '「御中」を当てていない');
  ok(/なぜ？/.test(t), '根拠を見る口が無い');
});

await TA('2. ★「なぜ？」を押すと 根拠が出る（alert は使わない）', async () => {
  const why = $('pt-ask-set').querySelector('[data-pask-why]');
  ok(why, 'なぜ？のボタンが無い');
  click(why); await sleep(10);
  const box = $('pask-note-box');
  ok(box && box.style.display !== 'none', '根拠の知らせが出ない');
  ok(/株式会社/.test($('pask-note-b').textContent), '根拠に手がかりが書いていない：' + $('pask-note-b').textContent);
  eq(alerts.length, 0, '★alert を使っている★');
  click($('pask-note-x')); await sleep(5);
  eq($('pask-note-box').style.display, 'none', '閉じられない');
});

await TA('3. ★答えたら その場で倉庫へ書く（1問ごと保存）★＋結果を返す', async () => {
  const before = JSON.stringify(ptn());
  const btn = [...$('pt-ask-set').querySelectorAll('[data-pask-pick]')].filter((b) => b.dataset.v === '御中')[0];
  ok(btn, '「御中」の押す物が無い');
  click(btn); await sleep(40);
  const d = ptn();
  eq(d.honor, '御中', '★倉庫に書かれていない（1問ごと保存が効いていない）★');
  eq(d.keisho, '御中', 'ハブが読む側のキーに入っていない（画面で食い違う）');
  eq(!!(d.askOk && d.askOk.honor), true, '「答えた」印が付いていない＝また聞かれる');
  ok(before !== JSON.stringify(d), '倉庫が1文字も変わっていない');
  const t = $('pt-ask-set').textContent;
  ok(/藤原建設株式会社　御中/.test(t), '★答えた結果を その場で返していない★：' + t.slice(0, 120));
});

await TA('4. ★次の問いへ進む（担当者は「出さない」で飛ばせる）', async () => {
  const t = $('pt-ask-set').textContent;
  ok(/担当者の名前を出しますか/.test(t), '次の問いに進んでいない：' + t.slice(0, 60));
  const skip = $('pt-ask-set').querySelector('[data-pask-skip]');
  snapshotPressables('問3');
  ok(skip, '「出さない」が無い＝空欄を埋めさせている');
  click(skip); await sleep(40);
  eq(!!(ptn().askOk && ptn().askOk.person), true, '飛ばしたのに「答えた」にならない（また聞く）');
});

await TA('5. ★支払期限は よく出る順で候補が並ぶ（ほか2社が先頭）', async () => {
  const t = $('pt-ask-set').textContent;
  ok(/いつまでに もらう約束/.test(t), '支払期限の問いに来ていない：' + t.slice(0, 60));
  const opts = [...$('pt-ask-set').querySelectorAll('[data-pask-pick]')];
  snapshotPressables('問4');
  ok(opts.length >= 2, '候補が並んでいない');
  eq(opts[0].dataset.v, 'nextEom', '★よく出る順になっていない★（先頭が ' + opts[0].dataset.v + '）');
  ok(/ほか 2社/.test(opts[0].textContent), '何社が使っているかを出していない：' + opts[0].textContent);
  click(opts[0]); await sleep(40);
  eq((ptn().payTerm || {}).kind, 'nextEom', '倉庫に書かれていない');
  ok(/お支払期限は 20\d\d-\d\d-\d\d/.test($('pt-ask-set').textContent), '★期限の日付を その場で返していない★');
});

await TA('6. ★源泉は 他の取引先の多数決を当てて 根拠つき（する／しないの2択）', async () => {
  const t = $('pt-ask-set').textContent;
  ok(/源泉徴収を引きますか/.test(t), '源泉の問いに来ていない：' + t.slice(0, 60));
  ok(/当てました：しない/.test(t.replace(/\s/g, '')) || /しない/.test(t), '当てていない');
  /* 根拠は「なぜ？」の中（問いを短く保つ）＝押して読む */
  click($('pt-ask-set').querySelector('[data-pask-why]')); await sleep(10);
  ok(/2社が「しない」/.test($('pask-note-b').textContent),
    '数えた根拠を出していない：' + $('pask-note-b').textContent);
  click($('pask-note-x')); await sleep(5);
  snapshotPressables('問5');
  const no = [...$('pt-ask-set').querySelectorAll('[data-pask-pick]')].filter((b) => b.dataset.v === 'no')[0];
  click(no); await sleep(40);
  eq(ptn().gensen, false, '倉庫に書かれていない');
});

await TA('7. ★住所は よく出る頭を候補で出す（打たせない）', async () => {
  const t = $('pt-ask-set').textContent;
  ok(/住所は/.test(t), '住所の問いに来ていない：' + t.slice(0, 60));
  const chips = [...$('pt-ask-set').querySelectorAll('[data-pask-chip]')];
  snapshotPressables('問6');
  ok(chips.length >= 1, '★候補が出ていない（空欄に打たせている）★');
  ok(/今治市（2社）/.test(chips[0].textContent), '何社が同じかを出していない：' + chips[0].textContent);
  click(chips[0]); await sleep(10);
  eq($('pask-t').value, '愛媛県今治市', '押しても入力欄に入らない');
  $('pask-t').value = '愛媛県今治市ほげ1-1';
  click($('pt-ask-set').querySelector('[data-pask-ok]')); await sleep(40);
  eq(ptn().addr, '愛媛県今治市ほげ1-1', '倉庫に書かれていない');
});

await TA('8. ★答え終わったら 空欄を残さない（聞く形は「ぜんぶ決まっています」）', async () => {
  const t = $('pt-ask-set').textContent;
  ok(/ぜんぶ決まっています/.test(t), 'まだ聞いている：' + t.slice(0, 80));
  ok(/答えた物（押すと直せます）/.test(t), '答えた物の一覧が無い（直せない）');
  /* ★答えた物には その場の結果が付いている★ */
  ok(/紙のあて名は/.test(t), 'あて名の結果が残っていない');
  ok(/お支払期限は/.test(t), '期限の結果が残っていない');
});

await TA('9. ★押すと 直せる（答えた物を押す→もう一度 聞く）', async () => {
  const again = [...$('pt-ask-set').querySelectorAll('[data-pask-again]')].filter((b) => b.dataset.paskAgain === 'honor')[0];
  snapshotPressables('答えた物');
  ok(again, '直す口が無い');
  click(again); await sleep(40);
  ok(/あとに付けるのは/.test($('pt-ask-set').textContent), '押しても聞き直さない');
  const g = [...$('pt-ask-set').querySelectorAll('[data-pask-pick]')].filter((b) => b.dataset.v === '様')[0];
  click(g); await sleep(40);
  eq(ptn().honor, '様', '直した物が倉庫に入らない');
  eq(ptn().keisho, '様', 'ハブ側のキーが古いまま（画面で食い違う）');
});

await TA('10. ★聞いた事が 紙に届く（あて名が実際に変わる）', async () => {
  /* 入力の画面へ戻り、この相手で1通 作って 紙を組む */
  click(qa('[data-scr="scr-edit"]')[0]);
  await sleep(20);
  const ep = $('e-partner');
  ep.value = 'pt_n';
  ep.dispatchEvent(new win.Event('change'));
  await sleep(30);
  const st = win.SeikyuApp._state;
  st.cur.lines = [{ name: '工事一式', qty: 1, price: 100000, rate: 10 }];
  const p = st.partners.filter((x) => x.id === 'pt_n')[0];
  const paper = win.SeikyuPaper.build({
    inv: st.cur, tax: win.SeikyuTax.compute({ lines: st.cur.lines, mode: 'exclusive', rounding: 'floor' }),
    partner: p.data, org: st.org || {},
    cols: win.SeikyuCols.normalizeSpec(null),
  });
  const ph = paper.html || '';
  ok(/藤原建設株式会社/.test(ph), '紙にあて名が出ていない');
  ok(/藤原建設株式会社　様/.test(ph), '★聞いて直した敬称が 紙に届いていない★');
  /* ★聞いていない物は 紙に出ない（郵便番号・電話・相手の登録番号）★ */
  ok(!/T1234567890123/.test(ph), '相手の登録番号が紙に出ている（聞かない物なのに出す＝食い違う）');
});

await TA('11. ★答えていない相手を選んだ時だけ 入力の画面でも聞く（済んだら消える）', async () => {
  const card = $('pt-ask-card');
  ok(card.style.display === 'none', '★ぜんぶ答えた相手なのに 空欄のカードが残っている★');
  /* まだ答えていない相手（pt_a は askOk あり／新しく作る） */
  win.SeikyuApp._state.partners.push({ id: 'pt_z', sort: 3, data: { name: 'Z商会' } });
  const ep = $('e-partner');
  const o = doc.createElement('option'); o.value = 'pt_z'; o.textContent = 'Z商会'; ep.appendChild(o);
  ep.value = 'pt_z';
  ep.dispatchEvent(new win.Event('change'));
  await sleep(30);
  ok($('pt-ask-card').style.display !== 'none', '答えていない相手なのに 入力の画面で聞かない（設定へ行かせている）');
  ok(/あとに付けるのは/.test($('pt-ask-edit').textContent), '入力の画面で問いが出ていない');
});

await TA('12. ★登録番号は 打った その場で見る（形が違えば止める・検査数字は注意だけ）', async () => {
  click(qa('[data-scr="scr-set"]')[0]);
  await sleep(20);
  $('s-partner').value = 'pt_n';
  $('s-partner').dispatchEvent(new win.Event('change'));
  await sleep(20);
  $('pt-all').open = true;
  const inp = $('s-pinvoice');
  inp.value = 'T123';
  inp.dispatchEvent(new win.Event('input'));
  ok(/この形では登録番号になりません/.test($('s-pinvoice-hint').textContent), '形の違いを言わない');
  click($('b-pt-save')); await sleep(30);
  ok(!ptn().invoiceNo, '★形が違うのに保存した★');
  inp.value = 'T1234567890123';
  inp.dispatchEvent(new win.Event('input'));
  ok(/打ち間違いかもしれません/.test($('s-pinvoice-hint').textContent), '検査用数字の違いを言わない');
  click($('b-pt-save')); await sleep(40);
  eq(ptn().invoiceNo, 'T1234567890123', '★注意だけのはずが 止めている（個人の番号を弾く）★');
  eq(alerts.length, 0, '★alert を使っている★');
});

await TA('13. ★「ぜんぶ見る」で入れた物は もう一度 聞かない', async () => {
  const d = ptn();
  ['honor', 'person', 'addr', 'payTerm', 'gensen'].forEach((k) => {
    eq(!!(d.askOk && d.askOk[k]), true, k + ' が「答えた」になっていない＝同じ事を2度 聞く');
  });
});

await TA('14. ★最後まで JS が1つも落ちていない', async () => {
  eq(errs.length, 0, errs.join(' / '));
});

console.log('\n── ★押した物（一覧に出した物を全部）★ ' + inventory.length + '個 ──');
console.log('   ' + [...new Set(inventory.map((x) => x.what))].join(' / '));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
