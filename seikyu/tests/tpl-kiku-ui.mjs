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
import v8 from 'node:v8';
import vm from 'node:vm';

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
/* ★1件ごとに 窓を 閉じる★（2026-10-24 自己診断が 2.7GB まで 膨らみ 別の席の 網を 止めた＝jsdom の 窓を 開けっぱなしだった） */
const MADO = [];
/* ★閉じた後に 片付けを 呼ぶ★＝呼ばないと 1.2GB／呼ぶと 0.5GB（2026-10-24 実測）。CI でも 旗なしで 効くように ここで 開ける */
v8.setFlagsFromString('--expose-gc');
const GC = (() => { try { return vm.runInNewContext('gc'); } catch { return () => {}; } })();
const tojiru = () => { while (MADO.length) { try { MADO.pop().close(); } catch { /* 閉じられなくても 次へ */ } } GC(); };
const T = async (n, f) => {
  try { await f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); }
  finally { tojiru(); }
};

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
  MADO.push(win);
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

  /* ═══ F. ★取引先ごとに 紙を 変えられる事が 画面で 分かるか★（司さん 2026-10-23
         「会社ごとに 請求書の様式の変えも ちゃんとできるか 分かりにくい」）═══ */
  const NAIBU = new RegExp('\\b(' + Object.keys(TPL.TEMPLATES).join('|') + ')\\b');
  const vis = (el) => !!el && el.style.display !== 'none';
  await T('F1 入力：相手を選ぶと「この取引先だけ 別の紙にする」が出る → 押すと 設定 ▸ 取引先 のその相手の「様式」が 開く', async () => {
    const r = await boot(appSrc, { org: { invoiceTemplate: MAE, invoiceCols: COLS.normalizeSpec(TPL.get(MAE).cols) } });
    await tab(r, 'scr-edit');
    const ep = r.doc.getElementById('e-partner');
    ep.value = 'pt_a'; ep.dispatchEvent(new r.win.Event('change', { bubbles: true }));
    await sleep(250);
    const b = r.doc.getElementById('b-tpl-pt');
    ok(vis(b), '★入力に 取引先ごとの紙へ 行く ボタンが 無い★');
    ok(/この取引先だけ/.test(b.textContent), 'ボタンの字: ' + b.textContent);
    const why = r.doc.getElementById('tpl-strip-why').textContent || '';
    ok(/取引先ごとに/.test(why), '★取引先ごとに 変えられると 言っていない★: ' + why);
    b.click();
    await sleep(250);
    ok(r.doc.getElementById('scr-set').classList.contains('active'), '★設定へ 行っていない★');
    eq(r.doc.getElementById('s-partner').value, 'pt_a', '★その相手が 選ばれていない★');
    ok(r.doc.getElementById('pt-all').open, '★「様式」の 欄が 畳みの中に 隠れたまま★');
    ok(vis(r.doc.getElementById('s-pt-tpl-row')), '★この取引先の紙が 1行で 出ていない★');
    eq(r.doc.getElementById('s-pt-tpl-now').textContent, TPL.get(MAE).label, 'この取引先の紙');
    eq(r.S.cur.partner_id, 'pt_a', '★行ったら 作りかけの相手が 消えた★');
  });
  await T('F2 取引先 A を「' + TPL.get('koujo').label + '」にすると 設定と入力の両方で 今の紙と 決まった所が 分かる', async () => {
    const r = await boot(appSrc, { org: { invoiceTemplate: MAE, invoiceCols: COLS.normalizeSpec(TPL.get(MAE).cols) } });
    await pickPartner(r, 'pt_a', 'koujo');
    eq(r.doc.getElementById('s-pt-tpl-now').textContent, TPL.get('koujo').label, '★設定の「この取引先の紙」が 変わらない★');
    const pwhy = r.doc.getElementById('s-pt-tpl-why').textContent || '';
    ok(/設定 ▸ 取引先/.test(pwhy) && pwhy.indexOf(TPL.get(MAE).label) >= 0, '★どこで決まったか／会社の既定を 言っていない★: ' + pwhy);
    const list = r.doc.getElementById('s-tpl-pt').textContent || '';
    ok(list.indexOf('A株式会社') >= 0 && list.indexOf(TPL.get('koujo').label) >= 0,
      '★会社の「紙の様式」に 別の紙の取引先が 出ていない★: ' + list);
    ok(list.indexOf('B株式会社') < 0, '★会社の既定のままの相手まで 並べている★: ' + list);
    await tab(r, 'scr-list');
    r.doc.getElementById('b-new').click();
    await sleep(300);
    const ep = r.doc.getElementById('e-partner');
    ep.value = 'pt_a'; ep.dispatchEvent(new r.win.Event('change', { bubbles: true }));
    await sleep(250);
    eq(r.doc.getElementById('tpl-strip-v').textContent, TPL.get('koujo').label, '★入力の 今の紙が 相手の紙に なっていない★');
    const why = r.doc.getElementById('tpl-strip-why').textContent || '';
    ok(/A株式会社 は 設定 ▸ 取引先/.test(why), '★入力で どこで決まったか 言っていない★: ' + why);
    eq(r.doc.getElementById('b-tpl-pt').textContent, 'この取引先の紙を変える', 'ボタンの字');
    [why, pwhy, list, r.doc.getElementById('s-pt-tpl-now').textContent].forEach((x) => {
      ok(!NAIBU.test(x), '★内部の名前が 客の字に 出ている★: ' + x);
    });
  });

  /* ═══ G. taiketsu 2026-10-24 止1〜3 ═══ */
  const GENBA_OLD = {
    id: 'iv_old', account_id: 'u1', doc_type: 'invoice', no: '202608-001', partner_id: 'pt_a',
    issue_ymd: '2026-08-18', due_ymd: null, status: 'issued', tax_mode: 'exclusive', rounding: 'floor',
    lines: [{ name: '前の工事', qty: '1', unit: '式', price: '10000', amount: '10000', rate: 10 }],
    totals: { grandTotal: 11000 }, snapshot: { cols: COLS.normalizeSpec(TPL.get(MAE).cols) },
    data: {}, template_id: MAE, quote_from: null,
    issued_at: '2026-08-18T00:00:00Z', sent_at: null, voided_at: null, updated_at: '2026-08-18T00:00:00Z',
  };
  const GENBA_PLUS = ['項目', '数量', '単位', '金額', '消費税', '備考', '現場名'];
  await T('G1 ★選んだ時刻の 無い 会社★（控除を 保存済み）が 前に ' + MAE + ' で出した相手に 新しい1通 → 控除の列', async () => {
    const r = await boot(appSrc, {
      org: { invoiceTemplate: 'koujo', invoiceCols: COLS.normalizeSpec(TPL.get('koujo').cols) },
      invoices: [GENBA_OLD],
    });
    const g = await makeAndLook(r, 'pt_a', { fresh: true });
    eq(g.cols, colsOfTpl('koujo'), '★前回の様式が 会社の保存した様式に 勝った★');
    eq(g.tplId, 'koujo', '1通の様式');
  });
  await T('G1b 設定を 1度も 保存して いない 会社は 前回の様式（' + MAE + '）を 当てる（今までの当て方）', async () => {
    const r = await boot(appSrc, { invoices: [GENBA_OLD] });
    const g = await makeAndLook(r, 'pt_a', { fresh: true });
    eq(g.tplId, MAE, '前回の様式');
    eq(g.cols, colsOfTpl(MAE), '前回の様式の列');
  });
  await T('G4 ★控除を 選ぶ → 取引先 A だけ ' + MAE + ' で 下書きを 保存 → A を 会社の既定に 戻す★ → 新しい1通は 控除の列（下書きは「前回」に 数えない）', async () => {
    const r = await boot(appSrc, { org: { invoiceTemplate: MAE, invoiceCols: COLS.normalizeSpec(TPL.get(MAE).cols) } });
    await pickOrg(r, 'koujo');
    const okuri = r.doc.getElementById('col-ok').textContent || '';
    await pickPartner(r, 'pt_a', MAE);
    const g0 = await makeAndLook(r, 'pt_a', { fresh: true });
    eq(g0.tplId, MAE, '前提：A の下書きが ' + MAE + ' で しまわれていない');
    /* A を 会社の既定に 戻す（様式の欄を 空に） */
    await tab(r, 'scr-set');
    const sel = r.doc.getElementById('s-partner');
    sel.value = 'pt_a'; sel.dispatchEvent(new r.win.Event('change', { bubbles: true }));
    await sleep(100);
    const t = r.doc.getElementById('s-ptpl');
    t.value = ''; t.dispatchEvent(new r.win.Event('change', { bubbles: true }));
    await sleep(100);
    r.doc.getElementById('b-pt-save').click();
    await sleep(250);
    ok(!(r.S.partners.find((p) => p.id === 'pt_a').data.paper || {}).template, '前提：A の様式が 外れていない');
    eq(r.doc.getElementById('s-pt-tpl-now').textContent, TPL.get('koujo').label, '★設定の「この取引先の紙」が 会社の既定に なっていない★');
    const g = await makeAndLook(r, 'pt_a', { fresh: true });
    eq(g.tplId, 'koujo', '★残った下書きが「前回」として 勝った★');
    eq(g.cols, colsOfTpl('koujo'), '★控除の紙に 備考の列が 出た★');
  });
  await T('G4b 同じ様式（控除）を もう1度 押すと「前に 別の紙で 出した 相手にも この紙を 使います」→ 言った通り 前に ' + MAE + ' で 出し・下書きも 残る 相手でも 控除', async () => {
    const r = await boot(appSrc, {
      org: { invoiceTemplate: 'koujo', invoiceCols: COLS.normalizeSpec(TPL.get('koujo').cols) },
      invoices: [GENBA_OLD, Object.assign({}, GENBA_OLD, { id: 'iv_draft', no: '202610-009', status: 'draft',
        issued_at: null, issue_ymd: '2026-10-20', updated_at: '2099-01-01T00:00:00Z' })],
    });
    await pickOrg(r, 'koujo');
    const okuri = r.doc.getElementById('col-ok').textContent || '';
    ok(/前に 別の紙で 出した 相手にも この紙を 使います/.test(okuri), '知らせ: ' + okuri);
    const g = await makeAndLook(r, 'pt_a', { fresh: true });
    eq(g.tplId, 'koujo', '★知らせと 違い 前の紙（' + MAE + '）が 使われた★');
    eq(g.cols, colsOfTpl('koujo'), '★控除の紙に 備考の列が 出た★');
  });
  await T('G5 ★会社＝控除 → 取引先 A だけ ' + MAE + ' → A に 1通 発行 → A を「会社の既定のまま」に 戻す★ → 設定の行と 次の1通が どちらも 控除', async () => {
    const r = await boot(appSrc, { org: { invoiceTemplate: MAE, invoiceCols: COLS.normalizeSpec(TPL.get(MAE).cols) } });
    await pickOrg(r, 'koujo');
    await pickPartner(r, 'pt_a', MAE);
    /* A に 1通 作って 発行（★客と 同じ道＝入力で 打って 保存 → 発行★） */
    await tab(r, 'scr-list');
    r.doc.getElementById('b-new').click();
    await sleep(300);
    const ep = r.doc.getElementById('e-partner');
    ep.value = 'pt_a'; ep.dispatchEvent(new r.win.Event('change', { bubbles: true }));
    await sleep(250);
    const row = r.doc.querySelector('#lines-body tr');
    const setF = (k, v) => { const e = row.querySelector('[data-f="' + k + '"]'); if (!e || e.readOnly) return; e.value = v; e.dispatchEvent(new r.win.Event('input', { bubbles: true })); e.dispatchEvent(new r.win.Event('change', { bubbles: true })); };
    setF('name', '工事代金'); setF('qty', '1'); setF('unit', '式'); setF('price', '30000'); setF('amount', '30000');
    await sleep(100);
    await r.A._saveDraftForTest();
    await sleep(150);
    await r.A._issue();
    await sleep(300);
    const hakko = r.S.invoices.find((x) => x.partner_id === 'pt_a' && x.status === 'issued');
    ok(hakko, '前提：A の1通が 発行されていない: ' + (r.doc.getElementById('edit-err').textContent || ''));
    eq(hakko.template_id, MAE, '前提：発行した紙の様式');
    await sleep(20);
    /* A を 会社の既定のまま に 戻して 保存 */
    await tab(r, 'scr-set');
    const sel = r.doc.getElementById('s-partner');
    sel.value = 'pt_a'; sel.dispatchEvent(new r.win.Event('change', { bubbles: true }));
    await sleep(100);
    const t = r.doc.getElementById('s-ptpl');
    t.value = ''; t.dispatchEvent(new r.win.Event('change', { bubbles: true }));
    await sleep(100);
    r.doc.getElementById('b-pt-save').click();
    await sleep(250);
    const gyo = r.doc.getElementById('s-pt-tpl-now').textContent;
    eq(gyo, TPL.get('koujo').label, '★設定の「この取引先の紙」が 会社の既定に なっていない★');
    const g = await makeAndLook(r, 'pt_a', { fresh: true });
    eq(TPL.get(g.tplId).label, gyo, '★設定の行と 紙の様式が 食い違う★');
    eq(g.cols, colsOfTpl('koujo'), '★控除の紙に 備考の列が 出た★');
  });
  await T('G6 ★見積書でも 前回の様式が 効く★（設定を 保存して いない会社・A に ' + MAE + ' の見積を 発行済み）', async () => {
    const r = await boot(appSrc, { invoices: [Object.assign({}, GENBA_OLD, { id: 'q_old', doc_type: 'quote', no: 'Q-202608-001' })] });
    await tab(r, 'scr-list');
    const k = r.doc.querySelector('[data-kind="quote"]');
    ok(k, '見積書の 切り替えが 無い');
    k.click();
    await sleep(300);
    r.doc.getElementById('b-new').click();
    await sleep(300);
    eq(r.S.cur.doc_type, 'quote', '前提：見積書を 作っていない');
    const ep = r.doc.getElementById('e-partner');
    ep.value = 'pt_a'; ep.dispatchEvent(new r.win.Event('change', { bubbles: true }));
    await sleep(250);
    eq(r.S.cur.template_id, MAE, '★見積書で 前回の様式が 効いていない★');
    eq(r.doc.getElementById('tpl-strip-v').textContent, TPL.get(MAE).label, '入力の 今の紙');
  });
  await T('G2 ★様式＝控除・相手だけの列＝' + MAE + '＋現場名（印の無い 古い列）★の相手 → 控除の紙に 備考を 出さない', async () => {
    const r = await boot(appSrc, {
      org: { invoiceTemplate: MAE, invoiceCols: COLS.normalizeSpec(TPL.get(MAE).cols) },
      ptA: { paper: { template: 'koujo', cols: COLS.normalizeSpec({ items: GENBA_PLUS }) } },
    });
    const g = await makeAndLook(r, 'pt_a', { fresh: true });
    eq(g.cols, colsOfTpl('koujo'), '★相手の列が 様式を 見ずに 使われた★');
  });
  await T('G2b 同じ古い列の相手でも 様式が ' + MAE + ' なら 手で作った列（現場名つき）で 出る', async () => {
    const r = await boot(appSrc, {
      org: { invoiceTemplate: MAE, invoiceCols: COLS.normalizeSpec(TPL.get(MAE).cols) },
      ptA: { paper: { cols: COLS.normalizeSpec({ items: GENBA_PLUS }) } },
    });
    const g = await makeAndLook(r, 'pt_a', { fresh: true });
    eq(g.cols, GENBA_PLUS.join('|'), '★手で作った 相手の列が 使われない★');
  });
  await T('G3 ★相手の列に 現場名を足す → 控除に 変える → ' + MAE + ' に 戻すと 現場名が 残る★（選び直しで 列を 消さない）', async () => {
    const r = await boot(appSrc, { org: { invoiceTemplate: MAE, invoiceCols: COLS.normalizeSpec(TPL.get(MAE).cols) } });
    await tab(r, 'scr-set');
    const sel = r.doc.getElementById('s-partner');
    sel.value = 'pt_a'; sel.dispatchEvent(new r.win.Event('change', { bubbles: true }));
    await sleep(100);
    r.doc.getElementById('b-pcols-own').click();
    await sleep(100);
    r.doc.getElementById('col-new').value = '現場名';
    r.doc.getElementById('b-col-add').click();
    await sleep(100);
    const pa = () => r.S.partners.find((p) => p.id === 'pt_a').data.paper || {};
    eq((pa().cols || { items: [] }).items.join('|'), GENBA_PLUS.join('|'), '前提：相手の列に 現場名が 入っていない');
    r.doc.getElementById('b-pt-save').click();
    await sleep(250);
    await pickPartner(r, 'pt_a', 'koujo');
    eq((pa().cols || { items: [] }).items.join('|'), GENBA_PLUS.join('|'), '★様式を 選び直したら 相手の列が 上書きされた★');
    const hint = r.doc.getElementById('s-pcols-hint').textContent || '';
    ok(/使わず/.test(hint) && /消してはいません/.test(hint), '★知らせが 中身と 合っていない★: ' + hint);
    const g = await makeAndLook(r, 'pt_a', { fresh: true });
    eq(g.cols, colsOfTpl('koujo'), '★控除の紙に 相手の列（備考・現場名）が 出た★');
    await pickPartner(r, 'pt_a', MAE);
    const g2 = await makeAndLook(r, 'pt_a', { fresh: true });
    eq(g2.cols, GENBA_PLUS.join('|'), '★元の様式に 戻したのに 手で作った列が 帰ってこない★');
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
  /* ★壊す形＝直す前の 作り★（1つずつ 壊して、それぞれ 赤が 出るかを 見る） */
  const KOWASU = [
    ['下書きに 写した列・会社の列を 様式を 見ずに 使う', '    return !!colsTpl && colsTpl === tpl;', '    return true;'],
    ['相手だけの列を 様式を 見ずに 使う（止2）', '    return ptColsTpls(paper).indexOf(tpl) >= 0;', '    return true;'],
    ['時刻の 無い 会社でも 前回の様式を 当てる（止1）', '    if (kaishaEranda && !erandaAt) return null;', ''],
    ['下書きも「前回」に 数える（止A）',
      "      if (x.status !== 'issued' || (x.doc_type || 'invoice') !== shurui) return false;"
        + String.fromCharCode(10) + "      return !kijun || String(x.issued_at || '') > kijun;",
      "      if ((x.doc_type || 'invoice') !== shurui) return false;"
        + String.fromCharCode(10) + "      return !kijun || String(x.issued_at || x.updated_at || x.issue_ymd || '') > kijun;"],
    ['種類を 請求書と 決め打ちする（止C）',
      "(x.doc_type || 'invoice') !== shurui) return false;", "(x.doc_type || 'invoice') !== 'invoice') return false;"],
    ['相手の 様式を 外した 時刻を 見ない（止B）',
      '    var kijun = (ptAt > erandaAt) ? ptAt : erandaAt;', '    var kijun = erandaAt;'],
  ];
  let nige = 0, akaKei = 0;
  /* ★--only=N で 1通りだけ 回せる★（メモリを 抑える・1回ごとに node を 終わらせて 戻す） */
  const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
  const erabu = only ? KOWASU.filter((_, i) => String(i + 1) === only) : KOWASU;
  if (only && !erabu.length) { console.log('  ★--only=' + only + ' の 壊し方が 無い（1〜' + KOWASU.length + '）★'); process.exit(2); }
  for (const [na, mark, kae] of erabu) {
    if (keep.indexOf(mark) < 0) { console.log('  ★壊す場所が見つからない＝この自己診断は古い★ ' + na); process.exit(2); }
    const mae = fail;
    await run('わざと壊した：' + na, keep.replace(mark, kae));
    const aka = fail - mae;
    akaKei += aka;
    console.log('  → ' + na + ' … 赤 ' + aka + '件');
    if (aka < 1) { nige++; console.log('  ✗ ★空振り★ ' + na); }
  }
  console.log('\n  わざと壊した時に 赤になった数 … ' + akaKei + '件（' + erabu.length + '通り それぞれ 1件以上のはず）');
  if (nige) console.log('  ✗ ★空振りです★ 壊しても赤にならない');
  else console.log('  ✓ ★壊したら赤になった＝この試験は本当に見張っています★');
  console.log('KEKKA {"passed":' + (erabu.length - nige) + ',"failed":' + nige + ',"mimiso":0}');
  process.exit(nige ? 1 : 0);
}
