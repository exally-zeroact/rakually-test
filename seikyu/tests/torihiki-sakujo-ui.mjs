/* torihiki-sakujo-ui.mjs — ★取引先を 消せる★（消しても 出した 請求書は 残る・名前は 嘘に ならない）
 * =============================================================================
 * 司さん 2026-10-23 ⑤「取引先を削除できるようにしろ」
 *   手本＝代行請求書（daikou-seikyu.html）の deleteCompany
 *   ＝閉じた 札の 左スワイプで 赤い「削除」／開いた 中の「取引先を削除」→ 確かめ → 論理削除（deleted_at）。
 *   確かめの 字＝「◯◯ を取引先から削除します。よろしいですか？（出した請求書は残ります）」
 *
 * ★倉庫は 共有層（js/suite-data.js の partners.remove）を 呼ぶだけ★＝行は 消さず deleted_at を 立てる。
 *
 * 見る物:
 *   ① 札に「削除」が 2つの 道で 在る（スワイプの 赤／開いた 中の「取引先を削除」）
 *   ② 確かめで「いいえ」＝何も 消えない（倉庫も 札も そのまま・remove を 呼ばない）
 *   ③ 確かめで「はい」＝字が 手本どおり・remove が 呼ばれ deleted_at が 立つ・札が 消える
 *   ④ 左スワイプで 赤い 削除が 出て、押すと 同じ 確かめ → 消える（開いている 札は 払っても 動かない）
 *   ⑤ 消した 相手の 出した請求書・下書きは 残り、一覧の 名前が 正しい（「（消えた取引先）」に ならない）
 *   ⑥ 開き直しても（倉庫から 読み直しても）名前が 正しい・下書きの 紙にも 正しい 名前
 *   ⑦ 新しい請求書の 相手の 選び肢に 消した 相手が 出ない（下書きを 開いた時は「削除済み」と 正直に 出す）
 *   ⑧ 倉庫に 書けなかった時は 消したと 言わない（札も 残す）
 *   ⑨ 消した 相手の 下書きは 発行できない（訳が 出る）               … taiketsu 10-23 止1
 *   ⑩ 倉庫で 1行も 書けていない時も「削除しました」と 言わない     … taiketsu 10-23 止2
 *   ⑪⑫⑬ 前に 消した 同じ名前で 足す＝混ぜるかを 訊く（手本 mazeruKaKiku）
 *   ⑭⑮⑯ 混ぜるかを 訊く 所を 通り抜けない（見積書の 一覧の 時・消した 相手が 読めない 時・読み直し中）… taiketsu 10-23 止A
 *   ⑰ 消した 相手は「毎月の請求（今月まだ）」に 出ない                                           … taiketsu 10-23 止B
 *   ⑱⑲⑳ 画面の 控えに 頼らない（別の 端末で 消された 後・消した 直後の 読み直し前・一覧が 読めない 時）… taiketsu 10-23 3回目
 *   ㉑㉒ 期限（20秒）の 後に 遅れて 返っても 確かめも 作りも 戻しも しない                      … taiketsu 10-23 4回目 止1
 *   ㉓㉔㉕ 入力の 画面の「この相手を作る」も 同じ 判じ（混ぜるか 訊く・読めなければ 作らない）   … taiketsu 10-23 4回目 止2
 *   ㉖ 入力の 画面で「混ぜる」も 選びで 変えた 時と 同じ 道（aiteWoKaeta）＝源泉・前回の 当てが 入り 前の 相手の 物が 残らない
 *
 * 使い方: node seikyu/tests/torihiki-sakujo-ui.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const require_ = createRequire(pathToFileURL(path.join(ROOT, 'package.json')));
let JSDOM;
try { ({ JSDOM } = require_('jsdom')); }
catch { console.log('★jsdom が要ります（npm install）。飛ばせません（SKIPを緑と呼ばない）。'); process.exit(1); }

const SELF = process.argv.some((a) => a === '--self-test' || a.startsWith('--self-test='));
let pass = 0, fail = 0;
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + 'ほしい ' + JSON.stringify(b) + ' / 出た ' + JSON.stringify(a)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FILE = path.join(ROOT, 'seikyu/index.html');
const AKETA = [];
function tojiru() { while (AKETA.length) { const w = AKETA.pop(); try { w.close(); } catch (e) { /* 閉じられなくても 進む */ } } }

async function boot(o) {
  o = o || {};
  const html = o.html || fs.readFileSync(FILE, 'utf8');
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/seikyu/index.html',
  });
  const win = dom.window, doc = win.document;
  AKETA.push(win);                 /* ★1本ごとに 閉じる★（開けっぱなしで 3GB まで 膨らんだ・2026-10-24） */
  const errs = [];
  win.addEventListener('error', (e) => errs.push('window.error: ' + (e.message || e)));
  win.fetch = () => Promise.reject(new Error('no net'));
  win.alert = () => {}; win.confirm = () => true; win.scrollTo = () => {}; win.print = () => {};
  win.URL.createObjectURL = () => 'blob:fake';
  const src = fs.readFileSync(path.join(ROOT, 'tests/fake-supa.js'), 'utf8');
  const m = { exports: {} };
  new Function('module', 'exports', src)(m, m.exports);
  const sb = m.exports.createFakeSupa({
    uid: 'u1',
    tables: {
      pay_org: [{ account_id: 'u1', data: { yago: '合同会社Rakunally', invoiceNo: 'T9000000000009', bank: '見本銀行 本店 普通 1234567 ラクナリー' }, updated_at: '2026-08-01T00:00:00Z' }],
      pay_partners: (o.partners || [
        { id: 'pt_a', account_id: 'u1', sort: 0, data: { name: 'A株式会社', keisho: '御中', honor: '御中' }, deleted_at: null },
        { id: 'pt_b', account_id: 'u1', sort: 1, data: { name: 'B工務店', keisho: '様', honor: '様' }, deleted_at: null },
      ]),
      pay_invoices: o.invoices || [], pay_receipts: [],
      pay_companies: [{ account_id: 'u1', data: {}, updated_at: '2026-08-01T00:00:00Z' }],
    },
    pk: { pay_org: 'account_id', pay_companies: 'account_id' },
    unique: { pay_invoices: [['account_id', 'doc_type', 'no']] },
  });
  const DROP = ['supa-config.js', 'auth.js', 'env-badge.js', 'store.js', 'rakunally-login.js'];
  for (const mm of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
    const s = mm[1].split('?')[0], base = s.split('/').pop();
    if (/^https?:/.test(s) || DROP.includes(base)) continue;
    const p = path.resolve(path.dirname(FILE), s);
    if (!fs.existsSync(p)) continue;
    const el = doc.createElement('script');
    el.textContent = (base === 'seikyu-app.js' && o.app) ? o.app
      : (base === 'seikyu-store.js' && o.store) ? o.store : fs.readFileSync(p, 'utf8');
    doc.body.appendChild(el);
  }
  await sleep(300);
  ok(win.SeikyuApp, 'seikyu-app.js が動いていない');
  if (o.patchSb) o.patchSb(sb);     /* ★倉庫の 落ち方を 作る★（試験の 場面ごと） */
  await win.SeikyuApp.attach(sb);
  await sleep(300);
  return { win, doc, sb, errs };
}
/** ★お客さんと 同じ道で 設定を 開く★（下の タブ） */
async function openSet(r) {
  const tab = r.doc.querySelector('.bn[data-scr="scr-set"]');
  ok(tab, '設定の タブが 無い');
  tab.click();
  await sleep(300);
}

const MSG = (nm) => nm + ' を取引先から削除します。よろしいですか？（出した請求書は残ります）';
const LINES = [{ name: '運転代行 10月分', qty: '1', unit: '式', price: '30000', amount: 30000, rate: 10 }];
const INVOICES = [
  { id: 'iv_hakko', account_id: 'u1', doc_type: 'invoice', status: 'issued', no: '202610-001', partner_id: 'pt_a',
    issue_ymd: '2026-10-05', due_ymd: '2026-11-30', tax_mode: 'exclusive', rounding: 'floor', lines: LINES,
    totals: { grandTotal: 33000, taxTotal: 3000 },
    snapshot: { partner: { name: 'A株式会社', honor: '御中' }, org: { yago: '合同会社Rakunally' }, at: '2026-10-05' },
    data: {}, template_id: 'std1', deleted_at: null, updated_at: '2026-10-05T00:00:00Z' },
  { id: 'iv_shita', account_id: 'u1', doc_type: 'invoice', status: 'draft', no: '202610-002', partner_id: 'pt_a',
    issue_ymd: '2026-10-20', due_ymd: '', tax_mode: 'exclusive', rounding: 'floor', lines: LINES,
    totals: { grandTotal: 33000, taxTotal: 3000 }, snapshot: {}, data: {}, template_id: 'std1', deleted_at: null,
    updated_at: '2026-10-20T00:00:00Z' },
];
const clone = (x) => JSON.parse(JSON.stringify(x));
const cardOf = (doc, nm) => [...doc.querySelectorAll('#pt-cards .pt-co')]
  .find((c) => ((c.querySelector('.pt-co-name') || {}).textContent || '').trim() === nm) || null;
/* ★指で 払う★（jsdom に Touch は 無いので touches を 持たせた 出来事を 送る） */
function touch(win, el, type, x, y) {
  const e = new win.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'touches', { value: type === 'touchend' ? [] : [{ clientX: x, clientY: y }] });
  el.dispatchEvent(e);
}
async function listNames(r) {
  r.doc.querySelector('.bn[data-scr="scr-list"]').click();
  await sleep(200);
  return [...r.doc.querySelectorAll('#list-body .iv-card')]
    .map((c) => (c.querySelector('.iv-no').textContent + ' ' + c.querySelector('.iv-name').textContent).trim());
}
async function kesuA(r) {
  const c = cardOf(r.doc, 'A株式会社');
  c.querySelector('.pt-co-hd').click(); await sleep(30);
  c.querySelector('.pt-co-body [data-pt-del]').click(); await sleep(300);
}

async function run(label, o) {
  console.log('\n[' + label + '] ★押す物の一覧（先に書く）★');
  console.log('  ① 削除が2つの道 ② いいえ＝何も消えない ③ はい＝remove・札が消える ④ 左スワイプ'
    + ' ⑤ 出した請求書は残り名前が正しい ⑥ 読み直しても・紙も ⑦ 新しい請求書の相手に出ない ⑧ 書けない時は消したと言わない');
  const T = async (n, f) => {
    try { await f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); }
    tojiru();
  };
  const bootI = () => boot(Object.assign({ invoices: clone(INVOICES) }, o));

  await T('① 札に「削除」が 2つの 道で 在る（スワイプの 赤／開いた 中の「取引先を削除」）', async () => {
    const r = await bootI(); await openSet(r);
    const c = cardOf(r.doc, 'A株式会社');
    ok(c, 'A の 札が 無い');
    const sw = c.querySelector('.swipe-action [data-pt-del]');
    ok(sw && sw.textContent.trim() === '削除', '★スワイプの「削除」が 無い★');
    ok(sw.classList.contains('bdel'), 'スワイプの 削除が 消す（赤）の 顔でない');
    c.querySelector('.pt-co-hd').click(); await sleep(30);
    const inBtn = [...c.querySelectorAll('.pt-co-body [data-pt-del]')];
    eq(inBtn.length, 1, '開いた 中の 削除の 数');
    eq(inBtn[0].textContent.trim(), '取引先を削除', '開いた 中の 削除の 字');
    ok(inBtn[0].classList.contains('bdel'), '開いた 中の 削除が 赤の 顔でない');
  });

  await T('② 確かめで「いいえ」＝何も 消えない（倉庫も 札も そのまま・remove を 呼ばない）', async () => {
    const r = await bootI(); await openSet(r);
    const asked = []; r.win.confirm = (m) => { asked.push(String(m)); return false; };
    const st = r.win.SeikyuApp._state.store;
    ok(typeof st.partners.remove === 'function', '★seikyu-store の partners に remove が 無い★');
    let called = 0; const rm = st.partners.remove;
    st.partners.remove = function () { called++; return rm.apply(this, arguments); };
    await kesuA(r);
    eq(asked.length, 1, '確かめを 出していない');
    eq(called, 0, '★いいえ なのに remove を 呼んだ★');
    ok(r.sb._db.pay_partners.every((x) => x.deleted_at == null), '★いいえ なのに 倉庫で 消えた★');
    ok(cardOf(r.doc, 'A株式会社'), '★いいえ なのに 札が 消えた★');
    eq(r.doc.querySelectorAll('#pt-cards .pt-co').length, 2, '札の 数');
  });

  await T('③ 確かめで「はい」＝字が 手本どおり・remove が 呼ばれ deleted_at が 立つ・札が 消える', async () => {
    const r = await bootI(); await openSet(r);
    const asked = []; r.win.confirm = (m) => { asked.push(String(m)); return true; };
    const st = r.win.SeikyuApp._state.store;
    ok(typeof st.partners.remove === 'function', '★seikyu-store の partners に remove が 無い★');
    const ids = []; const rm = st.partners.remove;
    st.partners.remove = function (id) { ids.push(id); return rm.apply(this, arguments); };
    await kesuA(r);
    eq(asked[0], MSG('A株式会社'), '確かめの 字');
    eq(ids.join(','), 'pt_a', 'remove に 渡した 相手');
    const row = r.sb._db.pay_partners.find((x) => x.id === 'pt_a');
    ok(row && row.deleted_at, '★倉庫で deleted_at が 立っていない★');
    eq(r.sb._db.pay_partners.length, 2, '★行を 本当に 消した（論理削除でない）★');
    ok(!cardOf(r.doc, 'A株式会社'), '★札が 残っている★');
    ok(cardOf(r.doc, 'B工務店'), '★消していない B まで 消えた★');
    eq(r.doc.getElementById('s-partner').value, '', '消した 相手が 選ばれたまま');
    ok(r.doc.getElementById('pt-all') && !r.doc.getElementById('pt-all').closest('.pt-co'), '欄が 札と 一緒に 消えた');
    ok(/削除しました/.test(r.doc.getElementById('pt-list-ok').textContent), '削除しましたと 言わない');
  });

  await T('④ 左スワイプで 赤い 削除が 出て、押すと 同じ 確かめ → 消える／開いている 札は 動かない', async () => {
    const r = await bootI(); await openSet(r);
    const asked = []; r.win.confirm = (m) => { asked.push(String(m)); return true; };
    let c = cardOf(r.doc, 'B工務店');
    const sc = c.querySelector('.swipe-content');
    ok(sc, 'スワイプの 器が 無い');
    const hd = sc.querySelector('.pt-co-hd');
    touch(r.win, hd, 'touchstart', 300, 100);
    touch(r.win, hd, 'touchmove', 250, 102);
    touch(r.win, hd, 'touchmove', 190, 103);
    touch(r.win, hd, 'touchend', 0, 0);
    await sleep(30);
    ok(sc.classList.contains('swipe-open'), '★左に 払っても 削除が 出ない★');
    ok(/translateX\(-\d+px\)/.test(sc.style.transform), '札が 動いていない ' + sc.style.transform);
    ok(!c.classList.contains('open'), 'スワイプで 札が 開いた');
    /* 払った 後の 1押し＝閉じるだけ（開かない・消さない） */
    hd.click(); await sleep(30);
    ok(!sc.classList.contains('swipe-open') && !c.classList.contains('open'), '払った 後の 1押しで 閉じない／開いた');
    touch(r.win, hd, 'touchstart', 300, 100); touch(r.win, hd, 'touchmove', 200, 100); touch(r.win, hd, 'touchend', 0, 0);
    await sleep(30);
    c.querySelector('.swipe-action [data-pt-del]').click(); await sleep(300);
    eq(asked[0], MSG('B工務店'), '確かめの 字');
    ok(r.sb._db.pay_partners.find((x) => x.id === 'pt_b').deleted_at, '★倉庫で 消えていない★');
    ok(!cardOf(r.doc, 'B工務店'), '★札が 残っている★');
    c = cardOf(r.doc, 'A株式会社');
    c.querySelector('.pt-co-hd').click(); await sleep(30);
    const sc2 = c.querySelector('.swipe-content');
    const hd2 = c.querySelector('.pt-co-hd');
    touch(r.win, hd2, 'touchstart', 300, 100); touch(r.win, hd2, 'touchmove', 180, 100); touch(r.win, hd2, 'touchend', 0, 0);
    await sleep(30);
    ok(!sc2.classList.contains('swipe-open'), '★開いている 札が 払って 動いた★');
  });

  await T('⑤ 消した 相手の 出した請求書・下書きは 残り、一覧の 名前が 正しい', async () => {
    const r = await bootI(); await openSet(r);
    r.win.confirm = () => true;
    await kesuA(r);
    eq(r.sb._db.pay_invoices.length, 2, '★請求書が 倉庫から 消えた★');
    ok(r.sb._db.pay_invoices.every((v) => v.deleted_at == null && v.partner_id === 'pt_a'), '★請求書が 書き換わった★');
    const names = await listNames(r);
    eq(names.length, 2, '一覧の 数 ' + names.join(' / '));
    ok(names.every((x) => /A株式会社/.test(x)), '★一覧の 名前が 正しくない★ ' + names.join(' / '));
    ok(names.every((x) => !/消えた取引先|未選択/.test(x)), '★嘘の 字★ ' + names.join(' / '));
  });

  await T('⑥ 開き直しても（倉庫から 読み直しても）名前が 正しい・下書きの 紙にも 正しい 名前', async () => {
    const parts = [
      { id: 'pt_a', account_id: 'u1', sort: 0, data: { name: 'A株式会社', keisho: '御中', honor: '御中' }, deleted_at: '2026-10-22T00:00:00Z' },
      { id: 'pt_b', account_id: 'u1', sort: 1, data: { name: 'B工務店', keisho: '様', honor: '様' }, deleted_at: null },
    ];
    const r = await boot(Object.assign({ invoices: clone(INVOICES), partners: parts }, o));
    eq(r.win.SeikyuApp._state.partners.map((p) => p.id).join(','), 'pt_b', '消した 相手が 生きている 一覧に 居る');
    const names = await listNames(r);
    ok(names.length === 2 && names.every((x) => /A株式会社/.test(x)), '★読み直した 一覧の 名前★ ' + names.join(' / '));
    const look = [...r.doc.querySelectorAll('#list-body [data-look]')].find((b) => b.getAttribute('data-look') === 'iv_shita');
    ok(look, '下書きの 確認が 無い');
    look.click(); await sleep(300);
    const lv = r.doc.getElementById('lv');
    const paper = lv.getAttribute('srcdoc') || lv.srcdoc || '';
    ok(paper.length > 100, '紙が 出ていない');
    ok(/A株式会社/.test(paper), '★下書きの 紙に 相手の 名前が 無い★');
    ok(!/取引先が未選択|消えた取引先/.test(paper), '★紙に 嘘の 字★');
    /* 設定の 札には 出ない（消した 相手は 一覧から 消えたまま） */
    await openSet(r);
    ok(!cardOf(r.doc, 'A株式会社') && cardOf(r.doc, 'B工務店'), '★消した 相手の 札が 戻ってきた★');
  });

  await T('⑦ 新しい請求書の 相手の 選び肢に 消した 相手が 出ない（下書きでは「削除済み」と 正直に 出す）', async () => {
    const r = await bootI(); await openSet(r);
    r.win.confirm = () => true;
    await kesuA(r);
    r.doc.querySelector('.bn[data-scr="scr-list"]').click(); await sleep(150);
    r.doc.getElementById('b-new').click(); await sleep(300);
    const opts = [...r.doc.querySelectorAll('#e-partner option')].map((x) => x.textContent);
    ok(!opts.some((t) => /A株式会社/.test(t)), '★新しい請求書の 相手に 消した 相手が 出る★ ' + opts.join(' / '));
    ok(opts.some((t) => /B工務店/.test(t)), '消していない 相手が 出ない');
    r.doc.querySelector('.bn[data-scr="scr-list"]').click(); await sleep(150);
    const op = [...r.doc.querySelectorAll('#list-body [data-open]')].find((b) => b.getAttribute('data-open') === 'iv_shita');
    ok(op, '下書きの 修正が 無い');
    op.click(); await sleep(300);
    const sel = r.doc.getElementById('e-partner');
    eq(sel.value, 'pt_a', '下書きの 相手が 外れた');
    const t = sel.options[sel.selectedIndex].textContent;
    ok(/A株式会社/.test(t) && /削除済み/.test(t), '★下書きの 相手の 字★ ' + t);
    /* ★消した 相手の 事は もう 聞かない★（答えても しまう 先が 無い） */
    const ask = r.doc.getElementById('pt-ask-card');
    ok(!ask || ask.style.display === 'none', '★消した 相手の 事を 入力で 聞いている★');
  });

  await T('⑧ 倉庫に 書けなかった時は 消したと 言わない（札も 残す）', async () => {
    const r = await bootI(); await openSet(r);
    r.win.confirm = () => true;
    r.win.SeikyuApp._state.store.partners.remove = () => Promise.resolve({ ok: false, reason: 'つながりません' });
    await kesuA(r);
    ok(cardOf(r.doc, 'A株式会社'), '★書けなかったのに 札が 消えた★');
    ok(/削除できませんでした/.test(r.doc.getElementById('pt-list-err').textContent), '書けなかったと 言わない');
    ok(!/削除しました/.test(r.doc.getElementById('pt-list-ok').textContent), '★嘘の 成功★');
  });

  /* ═══ taiketsu 2026-10-23 の 叩き（止1・止2・手本どおり）═══ */
  await T('⑨ ★消した 相手の 下書きは 発行できない★（訳が 出る・番号も 使わない）', async () => {
    const parts = [
      { id: 'pt_a', account_id: 'u1', sort: 0, data: { name: 'A株式会社', keisho: '御中', honor: '御中' }, deleted_at: '2026-10-22T00:00:00Z' },
      { id: 'pt_b', account_id: 'u1', sort: 1, data: { name: 'B工務店', keisho: '様', honor: '様' }, deleted_at: null },
    ];
    const r = await boot(Object.assign({ invoices: clone(INVOICES), partners: parts }, o));
    r.doc.querySelector('.bn[data-scr="scr-list"]').click(); await sleep(150);
    const op = [...r.doc.querySelectorAll('#list-body [data-open]')].find((b) => b.getAttribute('data-open') === 'iv_shita');
    ok(op, '下書きの 修正が 無い');
    op.click(); await sleep(300);
    const b = r.doc.getElementById('b-issue');
    ok(b && b.disabled, '★消した 相手の 下書きの「発行する」が 押せる★');
    ok(/取引先/.test(b.textContent + ' ' + (b.title || '')), '押せない 訳に 取引先の 事が 無い: ' + b.textContent);
    await r.win.SeikyuApp._issue(); await sleep(200);
    const row = r.sb._db.pay_invoices.find((x) => x.id === 'iv_shita');
    eq(row.status, 'draft', '★消した 相手の 下書きが 発行された★');
    ok(/取引先がマスタに見つかりません/.test(r.doc.getElementById('edit-err').textContent), '発行を 断る 訳が 出ていない: ' + r.doc.getElementById('edit-err').textContent);
    /* 名前は 正しいまま（嘘の 字に しない） */
    ok(/A株式会社/.test(r.doc.getElementById('e-partner').selectedOptions[0].textContent), '名前が 消えた');
  });

  await T('⑩ ★倉庫で 1行も 書けていないのに「削除しました」と 言わない★（共有層は ok を 返す 形）', async () => {
    const r = await bootI(); await openSet(r);
    r.win.confirm = () => true;
    /* 共有層の update().eq() が ★0行でも エラー無し★で 返る 形を 作る（RLS で 見えない 行・別の 端末で 先に 消えた 等） */
    const from0 = r.sb.from;
    r.sb.from = function (t) {
      const q = from0.call(this, t);
      if (t === 'pay_partners') q.update = () => ({ eq: () => Promise.resolve({ data: [], error: null }) });
      return q;
    };
    await kesuA(r);
    eq(r.sb._db.pay_partners.find((x) => x.id === 'pt_a').deleted_at, null, '試験の 形が 違う（本当に 書けてしまった）');
    ok(cardOf(r.doc, 'A株式会社'), '★書けていないのに 札が 消えた★');
    ok(/削除できませんでした/.test(r.doc.getElementById('pt-list-err').textContent), '★書けていないのに 黙っている★');
    ok(!/削除しました/.test(r.doc.getElementById('pt-list-ok').textContent), '★嘘の「削除しました」★');
  });

  const goneA = () => [
    { id: 'pt_a', account_id: 'u1', sort: 0, data: { name: 'A株式会社', keisho: '御中', honor: '御中', addr: '東京都架空区見本台1-1' }, deleted_at: '2026-10-22T00:00:00Z' },
    { id: 'pt_b', account_id: 'u1', sort: 1, data: { name: 'B工務店', keisho: '様', honor: '様' }, deleted_at: null },
  ];
  async function addName(r, nm) {
    r.doc.getElementById('pt-add-name').value = nm;
    r.doc.getElementById('b-pt-add').click();
    await sleep(400);
  }

  await T('⑪ ★前に 消した 同じ名前で 足す＝混ぜるかを 訊く★「混ぜる」＝前の 相手を 戻す（同じ id・請求書が 続く）', async () => {
    const r = await boot(Object.assign({ invoices: clone(INVOICES), partners: goneA() }, o));
    await openSet(r);
    const asked = []; r.win.confirm = (m) => { asked.push(String(m)); return true; };
    await addName(r, 'A株式会社');
    eq(asked.length, 1, '★混ぜるかを 訊いていない★');
    ok(/A株式会社/.test(asked[0]) && /請求書 2通/.test(asked[0]) && /混ぜますか/.test(asked[0]), '訊く 字: ' + asked[0]);
    const rows = r.sb._db.pay_partners.filter((x) => (x.data || {}).name === 'A株式会社');
    eq(rows.length, 1, '★同じ名前の 行が 2つに なった（戻さずに 作った）★');
    eq(rows[0].id, 'pt_a', '戻した 相手の id');
    eq(rows[0].deleted_at, null, '★消した 印が 残っている★');
    eq(rows[0].data.addr, '東京都架空区見本台1-1', '前の 中身が 消えた');
    const c = cardOf(r.doc, 'A株式会社');
    ok(c && c.classList.contains('open'), '戻した 札が 開いていない');
    ok(/戻しました/.test(r.doc.getElementById('pt-list-ok').textContent), '戻したと 言わない: ' + r.doc.getElementById('pt-list-ok').textContent);
    /* 新しい 請求書の 相手に また 出る（同じ id＝前の 請求書と 続く） */
    r.doc.querySelector('.bn[data-scr="scr-list"]').click(); await sleep(150);
    r.doc.getElementById('b-new').click(); await sleep(300);
    ok([...r.doc.querySelectorAll('#e-partner option')].some((x) => x.value === 'pt_a'), '戻した 相手が 選べない');
  });

  await T('⑫ ★「混ぜない」＝新しい 取引先★（前の 請求書は 前の 相手の まま・繰越は 引き継がないと 字で 言う）', async () => {
    const r = await boot(Object.assign({ invoices: clone(INVOICES), partners: goneA() }, o));
    await openSet(r);
    const asked = []; r.win.confirm = (m) => { asked.push(String(m)); return false; };
    await addName(r, 'A株式会社');
    eq(asked.length, 1, '★混ぜるかを 訊いていない★');
    ok(/引き継ぎません/.test(asked[0]), '混ぜない時の 事を 訊く前に 言っていない: ' + asked[0]);
    const rows = r.sb._db.pay_partners.filter((x) => (x.data || {}).name === 'A株式会社');
    eq(rows.length, 2, '新しい 相手が 作られていない');
    const nw = rows.find((x) => x.id !== 'pt_a');
    eq(nw.deleted_at == null, true, '新しい 相手が 消えている');
    ok(rows.find((x) => x.id === 'pt_a').deleted_at, '★混ぜないのに 前の 相手を 戻した★');
    ok(r.sb._db.pay_invoices.every((v) => v.partner_id === 'pt_a'), '★前の 請求書の 相手が 書き換わった★');
    ok(/引き継ぎません/.test(r.doc.getElementById('pt-list-ok').textContent), '新しく 作った 時に 繰越の 事を 言わない: ' + r.doc.getElementById('pt-list-ok').textContent);
  });

  await T('⑬ 前の 記録が 無い 同じ名前（請求書 0通）は 訊かずに 作る', async () => {
    const r = await boot(Object.assign({ invoices: [], partners: goneA() }, o));
    await openSet(r);
    const asked = []; r.win.confirm = (m) => { asked.push(String(m)); return true; };
    await addName(r, 'A株式会社');
    eq(asked.length, 0, '残っている 物が 無いのに 訊いた');
    ok(cardOf(r.doc, 'A株式会社'), '作れていない');
  });

  /* ═══ taiketsu 2026-10-23 2回目（止A・止B）═══ */
  const tadashii = (r) => r.sb._db.pay_partners.filter((x) => (x.data || {}).name === 'A株式会社');
  await T('⑭ 止A① 一覧を「見積書」に 切り替えてから 足しても 混ぜるかを 訊く（請求書を 数える）', async () => {
    const r = await boot(Object.assign({ invoices: clone(INVOICES), partners: goneA() }, o));
    const q = r.doc.querySelector('#kind-seg [data-kind="quote"]');
    ok(q, '見積書の 切り替えが 無い');
    q.click(); await sleep(300);
    await openSet(r);
    const asked = []; r.win.confirm = (m) => { asked.push(String(m)); return true; };
    await addName(r, 'A株式会社');
    eq(asked.length, 1, '★見積書の 一覧の 時に 訊かずに 通った★');
    ok(/請求書 2通/.test(asked[0]), '数えた 請求書の 数: ' + asked[0]);
    eq(tadashii(r).length, 1, '★新しい 相手を 作った★');
  });

  await T('⑮ 止A② 消した 取引先が 読めなかった時は 足さない（「今は 確かめられません」）', async () => {
    const r = await boot(Object.assign({ invoices: clone(INVOICES), partners: goneA(), patchSb: (sb) => {
      const from0 = sb.from;
      sb.from = function (t) {
        const qq = from0.call(this, t);
        if (t === 'pay_partners') {
          const sel0 = qq.select;
          qq.select = function (cols, oo) {
            const x = sel0.call(this, cols, oo);
            if (cols === 'id,data,deleted_at') x._run = () => ({ data: null, error: { message: 'つながりません' } });
            return x;
          };
        }
        return qq;
      };
    } }, o));
    await openSet(r);
    const asked = []; r.win.confirm = (m) => { asked.push(String(m)); return true; };
    await addName(r, 'A株式会社');
    eq(tadashii(r).length, 1, '★消した 相手が 読めないのに 新しい 相手を 作った★');
    ok(/確かめられません/.test(r.doc.getElementById('pt-list-err').textContent), '足さなかった 訳を 言わない: ' + r.doc.getElementById('pt-list-err').textContent);
  });

  await T('⑯ 止A③ 一覧を 読み直している 途中（まだ 読めていない）でも 訊かずに 作らない', async () => {
    const r = await boot(Object.assign({ invoices: clone(INVOICES), partners: goneA() }, o));
    await openSet(r);
    const S = r.win.SeikyuApp._state;
    S.listReadOk = null; S.invoices = []; S.quotes = [];
    const asked = []; r.win.confirm = (m) => { asked.push(String(m)); return true; };
    await addName(r, 'A株式会社');
    const rows = tadashii(r);
    ok(!(rows.length === 2 && asked.length === 0), '★読めていないのに 訊かずに 新しい 相手を 作った★');
    ok(asked.length === 1 ? /請求書 2通/.test(asked[0]) : /確かめられません/.test(r.doc.getElementById('pt-list-err').textContent),
      '訊くなら 正しい 数で／止めるなら 訳を: ' + (asked[0] || r.doc.getElementById('pt-list-err').textContent));
  });

  await T('⑰ 止B 消した 取引先は「毎月の請求（今月まだの相手）」に 出ない', async () => {
    const d = new Date();
    const ym = (k) => { const x = new Date(d.getFullYear(), d.getMonth() - k, 5); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-05'; };
    const iv = (id, pid, ymd, nm) => ({ id, account_id: 'u1', doc_type: 'invoice', status: 'issued', no: id, partner_id: pid,
      issue_ymd: ymd, due_ymd: '', tax_mode: 'exclusive', rounding: 'floor', lines: LINES,
      totals: { grandTotal: 33000, taxTotal: 3000 }, snapshot: { partner: { name: nm }, org: {} }, data: {}, template_id: 'std1',
      deleted_at: null, updated_at: ymd + 'T00:00:00Z' });
    const invs = [iv('a1', 'pt_a', ym(2), 'A株式会社'), iv('a2', 'pt_a', ym(1), 'A株式会社'),
      iv('b1', 'pt_b', ym(2), 'B工務店'), iv('b2', 'pt_b', ym(1), 'B工務店')];
    const r = await boot(Object.assign({ invoices: invs, partners: goneA() }, o));
    r.doc.querySelector('.bn[data-scr="scr-list"]').click(); await sleep(200);
    const names = [...r.doc.querySelectorAll('#rec-box .rec-n')].map((x) => x.firstChild.textContent.trim());
    ok(names.includes('B工務店'), '生きている 相手が 出ない（試験の 形が 違う）: ' + names.join(','));
    ok(!names.includes('A株式会社'), '★消した 相手が「今月まだ」に 出ている★: ' + names.join(','));
  });

  /* ═══ taiketsu 2026-10-23 3回目（止1＝画面の 控えに 頼らない）═══ */
  await T('⑱ 別の 端末で 消された 後に 同じ 名前を 足す＝倉庫を 読み直して 混ぜるかを 訊く（控えでは まだ 生きている）', async () => {
    const r = await bootI(); await openSet(r);
    /* 画面を 開いた 後に ★倉庫だけで★ 消す（別の 端末・別の タブ） */
    r.sb._db.pay_partners.find((x) => x.id === 'pt_a').deleted_at = '2026-10-23T09:00:00Z';
    const asked = []; r.win.confirm = (m) => { asked.push(String(m)); return true; };
    await addName(r, 'A株式会社');
    eq(asked.length, 1, '★控えを 信じて 訊かずに 通った★');
    ok(/請求書 2通/.test(asked[0]), '数え: ' + asked[0]);
    const rows = tadashii(r);
    eq(rows.length, 1, '★新しい A を 作った★ ' + rows.map((x) => x.id + ':' + x.deleted_at).join(','));
    eq(rows[0].id, 'pt_a', '戻した 相手');
    eq(rows[0].deleted_at, null, '戻っていない');
  });

  await T('⑲ この 画面で 消した 直後（一覧の 読み直しが 返る 前）に 同じ 名前を 足しても 訊く', async () => {
    const r = await bootI(); await openSet(r);
    r.win.confirm = () => true;
    await kesuA(r);
    /* 読み直しが まだ 返っていない 姿＝控えには A が 生きていて、消した 控えにも 無い */
    const S = r.win.SeikyuApp._state;
    S.partners = [{ id: 'pt_a', sort: 0, data: { name: 'A株式会社', keisho: '御中', honor: '御中' } }].concat(S.partners);
    S.gonePartners = {};
    const asked = []; r.win.confirm = (m) => { asked.push(String(m)); return false; };
    await addName(r, 'A株式会社');
    eq(asked.length, 1, '★控えを 信じて 訊かずに 通った★');
    const rows = tadashii(r);
    eq(rows.length, 2, '「混ぜない」なのに 新しい 相手が 無い');
    ok(rows.find((x) => x.id === 'pt_a').deleted_at, '★混ぜないのに 戻した★');
  });

  await T('⑳ 生きている 取引先の 一覧が 倉庫から 読めない 時は 足さない（「確かめられません」）', async () => {
    const r = await bootI(); await openSet(r);
    r.win.SeikyuApp._state.store.partners.list = () => Promise.reject(new Error('つながりません'));
    const asked = []; r.win.confirm = (m) => { asked.push(String(m)); return true; };
    await addName(r, 'C商事');
    eq(r.sb._db.pay_partners.filter((x) => (x.data || {}).name === 'C商事').length, 0, '★確かめられないのに 足した★');
    ok(/確かめられません/.test(r.doc.getElementById('pt-list-err').textContent), '訳: ' + r.doc.getElementById('pt-list-err').textContent);
    /* もう一度 押せる（確かめ中の 印が 残っていない） */
    eq(r.win.SeikyuApp._state.ptAddChu, false, '確かめ中の 印が 立ったまま');
  });

  /* ═══ taiketsu 2026-10-23 4回目（止1＝期限の 後に 作らない・止2＝入力の 画面の 道）═══ */
  const osoku = (fn, ms) => function () { const a = arguments, self = this; return new Promise((res) => setTimeout(res, ms)).then(() => fn.apply(self, a)); };

  await T('㉑ K1 期限が 切れた 後に 遅れて 返っても 確かめも 戻しも しない', async () => {
    const r = await boot(Object.assign({ invoices: clone(INVOICES), partners: goneA() }, o));
    await openSet(r);
    const A = r.win.SeikyuApp;
    ok(typeof A._ptAddKigenForTest === 'function', '期限を 縮める 口が 無い');
    A._ptAddKigenForTest(80);
    const st = A._state.store;
    st.invoices.list = osoku(st.invoices.list, 300);           /* 残りの 数えが 遅い */
    const asked = []; r.win.confirm = (m) => { asked.push(String(m)); return true; };
    r.doc.getElementById('pt-add-name').value = 'A株式会社';
    r.doc.getElementById('b-pt-add').click();
    await sleep(150);
    ok(/返ってきません/.test(r.doc.getElementById('pt-list-err').textContent), '期限の 訳が 出ない: ' + r.doc.getElementById('pt-list-err').textContent);
    await sleep(500);
    eq(asked.length, 0, '★期限の 後に 確かめが 出た★');
    ok(tadashii(r).every((x) => x.id !== 'pt_a' || x.deleted_at), '★期限の 後に 戻した★');
    eq(tadashii(r).length, 1, '★期限の 後に 作った★');
    eq(A._state.ptAddChu, false, '返った 後も 印が 立ったまま');
  });

  await T('㉒ K2 書き込みが 遅い 時に 期限の 後 もう一度 押しても 同じ 名前は 1行', async () => {
    const r = await bootI(); await openSet(r);
    const A = r.win.SeikyuApp;
    A._ptAddKigenForTest(80);
    const st = A._state.store;
    const create0 = st.partners.create;
    st.partners.create = osoku(create0, 300);
    r.win.confirm = () => true;
    r.doc.getElementById('pt-add-name').value = 'C商事';
    r.doc.getElementById('b-pt-add').click();
    await sleep(150);                                           /* 期限は 過ぎた・書き込みは まだ */
    r.doc.getElementById('pt-add-name').value = 'C商事';
    r.doc.getElementById('b-pt-add').click();                   /* 「もう一度」に 従う */
    await sleep(700);
    const n = r.sb._db.pay_partners.filter((x) => (x.data || {}).name === 'C商事').length;
    ok(n <= 1, '★同じ 名前が 倉庫に ' + n + '行★');
    st.partners.create = create0;
    if (n === 0) { r.doc.getElementById('pt-add-name').value = 'C商事'; r.doc.getElementById('b-pt-add').click(); await sleep(400); }
    eq(r.sb._db.pay_partners.filter((x) => (x.data || {}).name === 'C商事').length, 1, '最後に 1行に ならない');
  });

  /* ── 入力の 画面の「この相手を作る」（newPartner）も 同じ 判じ ── */
  async function nyuuryokuDeTsukuru(r, nm) {
    r.doc.querySelector('.bn[data-scr="scr-list"]').click(); await sleep(100);
    r.doc.getElementById('b-new').click(); await sleep(300);
    r.doc.getElementById('pt-new-name').value = nm;
    r.doc.getElementById('b-pt-new').click();
    await sleep(500);
    return (r.doc.getElementById('pt-new-msg') || {}).textContent || '';
  }
  await T('㉓ 入力の 画面で 前に 消した 同じ 名前を 作る＝混ぜるかを 訊く・「混ぜる」で 前の 相手を 戻して この 請求書の 相手に', async () => {
    const r = await boot(Object.assign({ invoices: clone(INVOICES), partners: goneA() }, o));
    const asked = []; r.win.confirm = (m) => { asked.push(String(m)); return true; };
    const msg = await nyuuryokuDeTsukuru(r, 'A株式会社');
    eq(asked.length, 1, '★入力の 画面で 訊かずに 作った★');
    ok(/請求書 2通/.test(asked[0]), '数え: ' + asked[0]);
    const rows = tadashii(r);
    eq(rows.length, 1, '★新しい 同じ 名前を 作った★');
    eq(rows[0].deleted_at, null, '戻っていない');
    eq(r.win.SeikyuApp._state.cur.partner_id, 'pt_a', '入力中の 請求書の 相手が 戻した 相手で ない');
    ok(/前の 取引先に 戻して/.test(msg), '字: ' + msg);
  });

  await T('㉔ 入力の 画面で「混ぜない」＝新しい 相手を この 請求書の 相手に（繰越は 引き継がないと 言う）', async () => {
    const r = await boot(Object.assign({ invoices: clone(INVOICES), partners: goneA() }, o));
    const asked = []; r.win.confirm = (m) => { asked.push(String(m)); return false; };
    const msg = await nyuuryokuDeTsukuru(r, 'A株式会社');
    eq(asked.length, 1, '★訊いていない★');
    const rows = tadashii(r);
    eq(rows.length, 2, '新しい 相手が 無い');
    const nw = rows.find((x) => x.id !== 'pt_a');
    eq(r.win.SeikyuApp._state.cur.partner_id, nw.id, '入力中の 請求書の 相手');
    ok(rows.find((x) => x.id === 'pt_a').deleted_at, '★混ぜないのに 戻した★');
    ok(/引き継ぎません/.test(msg), '字: ' + msg);
  });

  await T('㉕ 入力の 画面で 倉庫が 読めない 時は 作らない（訳を 言う）', async () => {
    const r = await bootI();
    r.win.SeikyuApp._state.store.partners.list = () => Promise.reject(new Error('no-user'));
    const msg = await nyuuryokuDeTsukuru(r, 'C商事');
    eq(r.sb._db.pay_partners.filter((x) => (x.data || {}).name === 'C商事').length, 0, '★確かめられないのに 作った★');
    ok(/確かめられません/.test(msg), '字: ' + msg);
  });

  await T('㉖ 入力の 画面で「混ぜる」＝相手を 選びで 変えた 時と 同じ 道（aiteWoKaeta）＝源泉の 対象の A を B の 白紙から 戻すと 源泉・前回の 当てが 入り B の 物が 残らない', async () => {
    /* A＝源泉の 対象（消した）・前回 出した 1通に 件名と 明細／B＝前回 出した 1通に B の 件名と 明細 */
    const ptA = goneA();
    ptA[0].data.gensen = true;
    const ivs = clone(INVOICES);
    ivs[0].data = { subject: 'A社の件名', gensen: true };
    ivs[0].lines = [{ name: 'A社の工事', qty: '1', unit: '式', price: '30000', amount: 30000, rate: 10 }];
    ivs.push({ id: 'iv_b', account_id: 'u1', doc_type: 'invoice', status: 'issued', no: '202609-009', partner_id: 'pt_b',
      issue_ymd: '2026-09-30', due_ymd: '2026-10-31', tax_mode: 'exclusive', rounding: 'floor',
      lines: [{ name: 'B社の品', qty: '1', unit: '式', price: '5000', amount: 5000, rate: 10 }],
      totals: { grandTotal: 5500, taxTotal: 500 },
      snapshot: { partner: { name: 'B工務店', honor: '様' }, org: { yago: '合同会社Rakunally' }, at: '2026-09-30' },
      data: { subject: 'B社の件名' }, template_id: 'std1', deleted_at: null, updated_at: '2026-09-30T00:00:00Z' });
    const r = await boot(Object.assign({ invoices: ivs, partners: ptA }, o));
    const $ = (id) => r.doc.getElementById(id);
    r.doc.querySelector('.bn[data-scr="scr-list"]').click(); await sleep(100);
    $('b-new').click(); await sleep(300);
    $('e-partner').value = 'pt_b';
    eq($('e-partner').value, 'pt_b', '★相手の 選びに B が 無い★（空振り）');
    $('e-partner').dispatchEvent(new r.win.Event('change', { bubbles: true }));
    await sleep(300);
    const S = r.win.SeikyuApp._state;
    const meisai = () => (S.cur.lines || []).map((l) => l && l.name).filter(Boolean).join('|');
    /* ★空振りしない★＝B を 選んだ 時に B の 前回が 本当に 入っている（入らなければ「残らない」を 見る 意味が 無い） */
    eq(S.cur.data.subject, 'B社の件名', '★B の 前回が 入っていない（空振り）★');
    ok(/B社の品/.test(meisai()), '★B の 前回の 明細が 入っていない（空振り）★: ' + meisai());
    eq(!!S.cur.data.gensen, false, 'B は 源泉の 対象で ない');
    const asked = []; r.win.confirm = (m) => { asked.push(String(m)); return true; };
    $('pt-new-name').value = 'A株式会社';
    $('b-pt-new').click();
    await sleep(500);
    eq(asked.length, 1, '★混ぜるかを 訊いていない★');
    eq(S.cur.partner_id, 'pt_a', '入力中の 請求書の 相手が 戻した A で ない');
    eq(S.cur.data.gensen, true, '★戻した A の 源泉が 入っていない（aiteWoKaeta を 通っていない）★');
    eq($('e-gensen').checked, true, '★源泉の 欄が 外れて 見える★');
    eq(S.cur.data.subject, 'A社の件名', '★A の 前回の 件名が 当たっていない★');
    eq($('e-subject').value, 'A社の件名', '★画面の 件名が A の 前回で ない★');
    ok(!/B社の品/.test(meisai()), '★B の 明細が 残った★: ' + meisai());
    ok(!/B社の件名/.test($('e-subject').value), '★B の 件名が 画面に 残った★');
    ok(!/202609-009/.test(($('edit-ok') || {}).textContent || ''), '★B の「前回（No.202609-009）と 同じ」が 残った★');
    eq(r.errs.length, 0, '画面の 誤り: ' + r.errs.join(' / '));
  });
}

if (!SELF) {
  await run('本物', {});
} else {
  /* ★わざと 壊して 赤に なるかを 見る★ */
  const app = fs.readFileSync(path.join(ROOT, 'seikyu/js/seikyu-app.js'), 'utf8');
  const store = fs.readFileSync(path.join(ROOT, 'seikyu/js/seikyu-store.js'), 'utf8');
  const cases = [
    ['確かめを 飛ばす', { app: app.replace("if (!global.confirm(nm + ' を取引先から削除します", "if (false && !global.confirm(nm + ' を取引先から削除します") }],
    ['消した 名前を 覚えない', { app: app.replace('function partnerById(id) {', 'function partnerById(id) { S.gonePartners = {};') }],
    ['下書きの 相手を 黙って 外す', { app: app.replace('function ptGoneOpt(v) {', 'function ptGoneOpt(v) { return null;') }],
    ['消した 相手で 発行させる', { app: app.split('var p = ptLive(v.partner_id);').join('var p = partnerById(v.partner_id);').split('partner: ptLive(v.partner_id),').join('partner: partnerById(v.partner_id),') }],
    ['同じ 名前で 訊かない', { app: app.replace('if (mae.tsu > 0) {', 'if (false) {') }],
    ['消した 相手を 読めないのを「無し」扱い', { app: app.replace('var live = r[0], gone = r[1];', 'var live = r[0], gone = r[1] || [];') }],
    ['生きている 相手を 画面の 控えで 判じる', { app: app.replace('      S.store.partners.list(),' + String.fromCharCode(10) + '      Promise.resolve(S.store.partners.gone', '      Promise.resolve(S.partners),' + String.fromCharCode(10) + '      Promise.resolve(S.store.partners.gone') }],
    ['残りの 請求書を 画面の 一覧で 数える', { app: app.replace("      S.store.invoices.list('invoice'),", '      Promise.resolve(S.invoices),') }],
    ['毎月の請求に 消した 相手を 出す', { app: app.replace('.filter(function (d) { return !!ptLive(d.partnerId); });', ';') }],
    ['期限の 後でも 書く（owari を 見ない）', { app: app.split('if (kireta) return osoi();').join('') }],
    ['入力の 画面で 判じを 通さない', { app: app.replace('    return ptNayose(name, {' + String.fromCharCode(10) + '      err: say,', '    return (function (w) { return w.create(false); })({' + String.fromCharCode(10) + '      err: say,') }],
    ['入力の 画面で 作った・戻した 相手を aiteWoKaeta に 通さない', { app: app.replace('if (S.cur && S.cur.partner_id !== id) aiteWoKaeta(id);', 'if (S.cur) S.cur.partner_id = id;') }],
    ['倉庫で 消えたかを 確かめない（seikyu-store）', { store: store.replace("if (!q || !q.data || !q.data.deleted_at) return { ok: false, reason: '消せたか 確かめられませんでした。もう一度 お試しください' };", '') }],
  ];
  /* ★--self-test=3 のように 番号で 1通りだけ 回せる★（別の 席の 空きを 食わない為） */
  const hitotsu = (process.argv.find((a) => /^--self-test=\d+$/.test(a)) || '').split('=')[1];
  /* ★段を 7つに 分ける（--bu=1〜7）★＝13通りを 1回で 回すと 583秒・5つ割りでも 1段 135秒＝押す前の 網の 1段の 上限 180秒に 近すぎる。
     中身は 変えず、壊し方を 順に 割る（--bu 無し＝全部）。打ち間違いは 止める（何も 走らせずに 緑、を 作らない） */
  const buA = process.argv.filter((a) => a.indexOf('--bu') === 0);
  if (buA.length > 1 || (buA.length === 1 && !/^--bu=[1-7]$/.test(buA[0]))) { console.log('★--bu の 字が 違います（' + buA.join(' ') + '）＝止めます★'); process.exit(2); }
  const BU = buA.length ? Number(buA[0].slice(5)) : 0;
  const erabu = hitotsu ? [cases[Number(hitotsu) - 1]].filter(Boolean) : (BU ? cases.filter((c, i) => i % 7 === BU - 1) : cases);
  let red = 0;
  for (const [nm, oo] of erabu) {
    const p0 = pass, f0 = fail;
    await run('壊す: ' + nm, oo);
    if (fail > f0) red++;
    pass = p0; fail = f0;
  }
  console.log('\n壊した ' + erabu.length + '通り のうち 赤 ' + red + (hitotsu ? '（' + hitotsu + '番目だけ）' : '') + (BU ? '（段 ' + BU + '／7）' : ''));
  /* ★約束の 行★（tools/_bunrui.mjs が 最初に 読む）＝わざと 壊した 回の ✗ は 狙った 赤 */
  console.log('KEKKA {"passed":' + red + ',"failed":' + (erabu.length - red) + ',"mimiso":0}');
  process.exit(red === erabu.length && erabu.length ? 0 : 1);
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
