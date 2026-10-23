/* tpl-kiku-ui.mjs — ★選んだ様式（テンプレ）の 列が その紙に 出るか★を 全様式で 押して 確かめる
 * =============================================================================
 * 司さん 2026-10-23（客の実画面・スマホ）
 *   「設定のテンプレで『項目と金額だけ＋控除（工事・運転むけ）』を選んでいるのに、
 *    保存して一覧から確認したら 備考が入っている（項目・数量・単位・金額・消費税・備考＝genba の列）。
 *    ちゃんと選べていないから、全テンプレが反映されるか確認して直せ」
 *
 * ★本物の seikyu-app.js を 本物の倉庫の形（tests/fake-supa.js）で 動かし、客と 同じ道を 押す★
 *   設定で 様式 X を 選ぶ → 保存 → 入力で 請求書を 作る → 下書きを保存 → 一覧の「確認」→ 紙の 列
 *
 * 見る事（★様式の 数は 決め打ちしない＝lib の list() が 正★）
 *   A. 会社の設定で 選ぶ … 前は genba の会社が X を選ぶ
 *        A1 選ぶ前から 作りかけだった 下書き ／ A2 選んだ後に 作った 新しい1通
 *   B. 取引先ごとに 決める … 会社は genba のまま、相手 A だけ X にする
 *   C. 前に 別の様式（genba）で 出した 相手 … 会社の設定で X を 選んだら X が 効くか
 *   D. ★出した紙（写し）は 変えない★ … 発行済みは 様式を 変えても 出した時の 列のまま
 *   E. ★お金は 様式で 1円も 変わらない★ … どの X でも 合計は 同じ
 *
 * 使い方: node seikyu/tests/tpl-kiku-ui.mjs
 *         node seikyu/tests/tpl-kiku-ui.mjs --self-test   （直す前の姿に 戻して 赤が 出るかを見る）
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

const SELF = process.argv.includes('--self-test');
let pass = 0, fail = 0;
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + 'ほしい ' + b + ' / 出た ' + a); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = async (n, f) => { try { await f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };

const FILE = path.join(ROOT, 'seikyu/index.html');
const TPL = require_(path.join(ROOT, 'seikyu/lib/seikyu-templates.js'));
const COLS = require_(path.join(ROOT, 'seikyu/lib/seikyu-cols.js'));
const IDS = TPL.list().map((t) => t.id);            /* ★選べる 様式 ぜんぶ★ */
const colsOfTpl = (id) => COLS.normalizeSpec(TPL.getOrDefault(id).cols).items.join('|');
const MAE = 'genba';                                 /* ★客が 前に 使っていた 様式★ */

async function boot(appSrc, tane) {
  tane = tane || {};
  const html = fs.readFileSync(FILE, 'utf8');
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/seikyu/index.html',
  });
  const win = dom.window, doc = win.document;
  win.fetch = () => Promise.reject(new Error('no net'));
  win.alert = () => {}; win.confirm = () => true; win.scrollTo = () => {}; win.print = () => {};
  win.URL.createObjectURL = () => 'blob:fake';
  win.open = () => ({ document: { write() {}, close() {} }, focus() {}, print() {}, close() {} });
  const errs = [];
  win.addEventListener('error', (e) => errs.push(String(e.message || e)));
  const src = fs.readFileSync(path.join(ROOT, 'tests/fake-supa.js'), 'utf8');
  const m = { exports: {} };
  new Function('module', 'exports', src)(m, m.exports);
  const orgData = Object.assign({ yago: '合同会社Rakunally', invoiceNo: 'T9000000000009' }, tane.org || {});
  win.__mkSb = () => m.exports.createFakeSupa({
    uid: 'u1',
    tables: {
      pay_org: [{ account_id: 'u1', data: orgData, updated_at: '2026-08-01T00:00:00Z' }],
      pay_partners: [
        { id: 'pt_a', account_id: 'u1', sort: 0, data: Object.assign({ name: 'A株式会社', keisho: '御中' }, tane.ptA || {}), deleted_at: null },
        { id: 'pt_b', account_id: 'u1', sort: 1, data: { name: 'B株式会社', keisho: '御中' }, deleted_at: null },
      ],
      pay_invoices: tane.invoices || [], pay_receipts: [],
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
    el.textContent = (base === 'seikyu-app.js' && appSrc) ? appSrc : fs.readFileSync(p, 'utf8');
    doc.body.appendChild(el);
  }
  await sleep(300);
  ok(win.SeikyuApp, 'seikyu-app.js が動いていない');
  await win.SeikyuApp.attach(win.__mkSb());
  await sleep(250);
  doc.getElementById('b-new').click();
  await sleep(300);
  return { win, doc, errs, S: win.SeikyuApp._state, A: win.SeikyuApp };
}

const tab = async (r, scr) => { r.doc.querySelector('.bn[data-scr="' + scr + '"]').click(); await sleep(250); };

/** 設定 ▸ 紙の様式 で X を押して 保存（★客と 同じ道★） */
async function pickOrg(r, id) {
  await tab(r, 'scr-set');
  const box = r.doc.getElementById('s-tpl-box');
  if (box && box.style.display === 'none') { r.doc.getElementById('b-tpl-open').click(); await sleep(150); }
  const b = r.doc.querySelector('#s-tpl [data-tpl="' + id + '"]');
  ok(b, '★設定に ' + id + ' の札が 無い＝選べない★');
  b.click();
  await sleep(150);
  r.doc.getElementById('b-set-save').click();
  await sleep(250);
  ok(/保存しました/.test(r.doc.getElementById('set-ok').textContent || ''),
    '★設定の保存が 通っていない★: ' + (r.doc.getElementById('set-err').textContent || ''));
}

/** 設定 ▸ 取引先 で 相手 pid の 様式を id にして 保存 */
async function pickPartner(r, pid, id) {
  await tab(r, 'scr-set');
  const sel = r.doc.getElementById('s-partner');
  sel.value = pid; sel.dispatchEvent(new r.win.Event('change', { bubbles: true }));
  await sleep(100);
  const t = r.doc.getElementById('s-ptpl');
  ok([...t.options].some((o) => o.value === id), '★取引先の 様式に ' + id + ' が 無い★');
  t.value = id; t.dispatchEvent(new r.win.Event('change', { bubbles: true }));
  await sleep(100);
  r.doc.getElementById('b-pt-save').click();
  await sleep(250);
  eq((r.S.partners.find((p) => p.id === pid).data.paper || {}).template, id, '★相手の様式が 倉庫に 入っていない★');
}

/** 入力で 相手と 明細1行を 入れて 下書きを保存 → 一覧の「確認」で 紙を 開く → 紙の 列 */
async function makeAndLook(r, pid, opt) {
  opt = opt || {};
  if (opt.fresh) {
    await tab(r, 'scr-list');
    r.doc.getElementById('b-new').click();
    await sleep(300);
  } else {
    await tab(r, 'scr-edit');
  }
  const ep = r.doc.getElementById('e-partner');
  ep.value = pid; ep.dispatchEvent(new r.win.Event('change', { bubbles: true }));
  await sleep(250);
  const row = r.doc.querySelector('#lines-body tr');
  ok(row, '明細の行が 無い');
  const setF = (k, v) => {
    const e = row.querySelector('[data-f="' + k + '"]');
    if (!e || e.readOnly || e.disabled) return false;
    e.value = v; e.dispatchEvent(new r.win.Event('input', { bubbles: true })); e.dispatchEvent(new r.win.Event('change', { bubbles: true }));
    return true;
  };
  setF('name', '工事代金');
  setF('qty', '1');
  setF('unit', '式');
  if (!setF('price', '30000')) setF('amount', '30000');
  else setF('amount', '30000');
  await sleep(150);
  await r.A._saveDraftForTest();
  await sleep(250);
  const id = r.S.cur.id;
  ok(id, '★下書きが 保存できていない★: ' + (r.doc.getElementById('edit-err').textContent || ''));
  await tab(r, 'scr-list');
  const look = r.doc.querySelector('[data-look="' + id + '"]');
  ok(look, '★一覧に「確認」が 無い★');
  look.click();
  await sleep(250);
  ok(r.A._lookOpenedForTest(), '★「確認」で 紙が 開かない★');
  const h = String(r.A._paperHtml() || '');
  ok(h.length > 500, '★紙が 作れていない★');
  const head = /<table class="items"><thead><tr>([\s\S]*?)<\/tr><\/thead>/.exec(h);
  ok(head, '★紙に 明細の表が 無い★');
  const cols = [...head[1].matchAll(/<th class="c-col[^"]*"[^>]*>([^<]*)<\/th>/g)].map((x) => x[1]);
  const saved = r.S.invoices.find((x) => x.id === id) || {};
  return { cols: cols.join('|'), tplId: saved.template_id, grand: Number((saved.totals || {}).grandTotal),
    strip: r.doc.getElementById('tpl-strip-v').textContent || '' };
}

async function run(label, appSrc) {
  console.log('\n[' + label + '] 様式 ' + IDS.length + '個（' + IDS.join(' / ') + '）を 1つずつ 押す');
  const grands = {};

  for (const X of IDS) {
    await T('A1 会社の設定で「' + TPL.get(X).label + '」→ 作りかけの下書きを保存 → 確認の紙の列が ' + X, async () => {
      const r = await boot(appSrc, { org: { invoiceTemplate: MAE, invoiceCols: COLS.normalizeSpec(TPL.get(MAE).cols) } });
      await pickOrg(r, X);
      const g = await makeAndLook(r, 'pt_a');
      eq(g.cols, colsOfTpl(X), '★紙の列が 選んだ様式と 違う★');
      eq(g.tplId, X, '★しまった1通の 様式が 選んだ物と 違う★');
      grands[X] = g.grand;
      ok(!r.errs.length, 'JSの落ち: ' + r.errs.join(' / '));
    });
    await T('A2 会社の設定で「' + TPL.get(X).label + '」→ 新しい1通 → 確認の紙の列が ' + X, async () => {
      const r = await boot(appSrc, { org: { invoiceTemplate: MAE, invoiceCols: COLS.normalizeSpec(TPL.get(MAE).cols) } });
      await pickOrg(r, X);
      const g = await makeAndLook(r, 'pt_a', { fresh: true });
      eq(g.cols, colsOfTpl(X), '★紙の列が 選んだ様式と 違う★');
      eq(g.tplId, X, '★しまった1通の 様式が 選んだ物と 違う★');
    });
    await T('B  取引先 A だけ「' + TPL.get(X).label + '」（会社は ' + MAE + '）→ A の紙は ' + X + '／B の紙は ' + MAE, async () => {
      const r = await boot(appSrc, { org: { invoiceTemplate: MAE, invoiceCols: COLS.normalizeSpec(TPL.get(MAE).cols) } });
      await pickPartner(r, 'pt_a', X);
      const g = await makeAndLook(r, 'pt_a', { fresh: true });
      eq(g.cols, colsOfTpl(X), '★相手の様式の 列が 紙に 出ていない★');
      eq(g.tplId, X, '★相手の様式が 1通に 効いていない★');
      const gb = await makeAndLook(r, 'pt_b', { fresh: true });
      eq(gb.cols, colsOfTpl(MAE), '★よその相手の 紙まで 変わった★');
    });
    await T('B2 「この相手だけの列」（' + MAE + ' の列）を持つ相手に「' + TPL.get(X).label + '」→ 紙は ' + X, async () => {
      const r = await boot(appSrc, {
        org: { invoiceTemplate: MAE, invoiceCols: COLS.normalizeSpec(TPL.get(MAE).cols) },
        ptA: { paper: { cols: COLS.normalizeSpec(TPL.get(MAE).cols) } },
      });
      await pickPartner(r, 'pt_a', X);
      const g = await makeAndLook(r, 'pt_a', { fresh: true });
      eq(g.cols, colsOfTpl(X), '★相手の列が 前の様式の まま 残った★');
    });
    await T('C  前に ' + MAE + ' で出した相手に、会社の設定で「' + TPL.get(X).label + '」を選んだ後 → 紙は ' + X, async () => {
      const r = await boot(appSrc, { invoices: [{
        id: 'iv_old', account_id: 'u1', doc_type: 'invoice', no: '202608-001', partner_id: 'pt_a',
        issue_ymd: '2026-08-18', due_ymd: null, status: 'issued', tax_mode: 'exclusive', rounding: 'floor',
        lines: [{ name: '前の工事', qty: '1', unit: '式', price: '10000', amount: '10000', rate: 10 }],
        totals: { grandTotal: 11000 }, snapshot: { cols: COLS.normalizeSpec(TPL.get(MAE).cols) },
        data: {}, template_id: MAE, quote_from: null,
        issued_at: '2026-08-18T00:00:00Z', sent_at: null, voided_at: null, updated_at: '2026-08-18T00:00:00Z',
      }] });
      await pickOrg(r, X);
      const g = await makeAndLook(r, 'pt_a', { fresh: true });
      eq(g.cols, colsOfTpl(X), '★前回の様式（' + MAE + '）の 列が 出た＝今 選んだ様式が 効いていない★');
      eq(g.tplId, X, '★前回の様式が 今 選んだ様式に 勝った★');
    });
  }

  await T('D  ★出した紙は 写しのまま★（発行済みの ' + MAE + ' を 一覧で 確認 → 様式を 変えても ' + MAE + ' の列）', async () => {
    const r = await boot(appSrc, { invoices: [{
      id: 'iv_old', account_id: 'u1', doc_type: 'invoice', no: '202608-001', partner_id: 'pt_a',
      issue_ymd: '2026-08-18', due_ymd: null, status: 'issued', tax_mode: 'exclusive', rounding: 'floor',
      lines: [{ name: '前の工事', qty: '1', unit: '式', price: '10000', amount: '10000', rate: 10 }],
      totals: { grandTotal: 11000 }, snapshot: { cols: COLS.normalizeSpec(TPL.get(MAE).cols) },
      data: {}, template_id: MAE, quote_from: null,
      issued_at: '2026-08-18T00:00:00Z', sent_at: null, voided_at: null, updated_at: '2026-08-18T00:00:00Z',
    }] });
    await pickOrg(r, 'koujo');
    await tab(r, 'scr-list');
    r.doc.querySelector('[data-look="iv_old"]').click();
    await sleep(250);
    const h = String(r.A._paperHtml() || '');
    const head = /<table class="items"><thead><tr>([\s\S]*?)<\/tr><\/thead>/.exec(h);
    ok(head, '紙に 明細の表が 無い');
    const cols = [...head[1].matchAll(/<th class="c-col[^"]*"[^>]*>([^<]*)<\/th>/g)].map((x) => x[1]).join('|');
    eq(cols, colsOfTpl(MAE), '★出した紙の 列が 後から 変わった★');
  });

  await T('E  ★お金は 様式で 1円も 変わらない★（A1 の 合計が 全様式で 同じ）', async () => {
    const vals = IDS.map((x) => grands[x]);
    ok(vals.every((v) => Number.isFinite(v) && v > 0), '合計が 取れていない: ' + JSON.stringify(grands));
    ok(new Set(vals).size === 1, '★様式で 合計が 変わった★ ' + JSON.stringify(grands));
    console.log('      合計 ' + vals[0] + ' 円（' + IDS.length + '様式 すべて 同じ）');
  });
}

const APP = path.join(ROOT, 'seikyu/js/seikyu-app.js');
if (!SELF) {
  await run('本物の seikyu-app.js');
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
} else {
  /* ★直した所を 直す前の姿に 戻す★＝この見張りが 本当に 赤を 出せるかを見る */
  console.log('\n★自己診断★ … 列を 様式に 合わせる所を 外して 赤が 出るかを見る');
  const keep = fs.readFileSync(APP, 'utf8');
  /* ★壊す形＝直す前の 作り★：下書きに 写した列・会社の列を ★様式を 見ずに★ 使う */
  const mark = '    return !!colsTpl && colsTpl === tpl;';
  if (keep.indexOf(mark) < 0) { console.log('  ★壊す場所が見つからない＝この自己診断は古い★'); process.exit(2); }
  await run('列を 様式に 合わせない seikyu-app.js（わざと壊した）', keep.replace(mark, '    return true;'));
  const want = 2;
  const nige = Math.max(0, want - fail);
  console.log('\n  わざと壊した時に 赤になった数 … ' + fail + '件（' + want + '件以上のはず）');
  if (nige) console.log('  ✗ ★空振りです★ 壊しても赤にならない');
  else console.log('  ✓ ★壊したら赤になった＝この試験は本当に見張っています★');
  console.log('KEKKA {"passed":' + fail + ',"failed":' + nige + ',"mimiso":0}');
  process.exit(nige ? 1 : 0);
}
