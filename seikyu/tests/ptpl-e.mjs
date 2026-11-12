/* ptpl-e.mjs — ★設定 ▸ 取引先 の「この相手だけの紙」の 様式を 絵で 選ぶ★（2026-11-13 請求書 UI/UX 案 v8 件2）
 * =============================================================================
 * 決め（コンサル [be6f32] 案 an.md v4「入れる物 2」・v5「件2（直し）」・v6「件2 の字」／設計前 taiketsu 止め3 を 直した 形）
 *   ・s-ptpl（select）の ★下★ に 絵＝「会社の既定のまま」＋ 様式ぜんぶ。select は 残す（保存・入力からの 道は 今のまま）。
 *   ・絵を 押して ★今と 同じ 値なら 何もしない★・違う 時だけ s-ptpl に 入れて change を 出す（今の run が 走る）。
 *   ・絵の 中身＝その 相手の ★一番新しい 発行済みの 請求書★（請求書の 棚 billSrc）。無い・読み込み中・読めない 時は 見本の 中身＋字で 言う。
 *   ・止1＝入力で 開いている 別の 相手の 1通の 中身を 絵に 出さない（描く 間は 毎回 1通を 入れ替える）。
 *   ・止2＝描くのに 転んでも 外へ 投げない（一覧が「読めていません」に ならない・入力の 鍵は かかる）。
 *   ・止3＝行数・件名を 変えたら 絵も 変わる（中身で 比べて 描き直す）。
 *   ・描くのは 設定の 画面に 居る 時だけ（入力の 画面で 7枚の 紙を 作らない）。
 *
 * 試験
 *   (1) 相手を 開くと 札が 1＋様式の数・選ばれているのは select の 値
 *   (2) 違う 札を 押す → select の 値が 変わり change 1回・相手の 紙に 入る
 *   (3) 同じ 札を 押す → change 0回
 *   (4) 相手を 閉じる → 絵は 隠れて 空
 *   (5) 中身＝その 相手の 一番新しい 発行済み（下書きは 拾わない）・字に 番号
 *   (6) 入力で 別の 相手の 下書きを 開いた まま、1通も 無い 相手を 開く → 絵に その 下書きの 品名が 出ない・字は「まだ」
 *   (7) 請求書を 読めない 時の 字／読み込み中の 字
 *   (8) 読み終わったら 描き直す（loadBillInv の then）
 *   (9) select が 押せない 時は 絵を 押しても 変わらない
 *   (10) 行数を 変えると 絵の 中身も 変わる
 *   (11) 紙を 作るのが 転んでも 外へ 投げない（一覧は 読めた まま・字で 言う・今の 1通は 戻る）
 *   (12) 入力の 画面では 描かない
 *
 * 使い方: node seikyu/tests/ptpl-e.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません。この検証は飛ばせません（SKIPを緑と呼ばない）。npm install してください。'); process.exit(1); }
const require_ = createRequire(import.meta.url);

const SELF = process.argv.includes('--self-test');
let pass = 0, fail = 0, akaNa = [];
const T = async (n, fn) => { try { await fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; akaNa.push(n.split(' ')[0]); console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };
const eq = (a, b, m) => { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error((m || '') + ' … 期待 ' + y + ' / 実際 ' + x); };
const nemuru = (ms) => new Promise((r) => setTimeout(r, ms));

const rel = 'seikyu/index.html', file = path.join(ROOT, rel);
const html = fs.readFileSync(file, 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'seikyu/js/seikyu-app.js'), 'utf8');
/* ★様式の 数を 決め打ちしない★＝lib が 持つ 数が 正 */
const TPL_N = require_(path.join(ROOT, 'seikyu/lib/seikyu-templates.js')).list().length;
const line = (na, kin) => ({ name: na, qty: '1', unit: '式', price: String(kin), amount: String(kin), rate: 10, memo: '' });
const iss = (id, pid, ymd, na, extra) => Object.assign({ id, no: id.toUpperCase(), status: 'issued', doc_type: 'invoice', partner_id: pid,
  issue_ymd: ymd, tax_mode: 'exclusive', rounding: 'floor', lines: [line(na, 10000)], data: {}, totals: { grandTotal: 11000 },
  updated_at: ymd + 'T10:00:00Z' }, extra || {});
/* A工業＝8月・9月 発行＋10月の 下書き（下書きは 拾わない）／void の 11月（拾わない）
   B商店＝発行1通／C建設＝下書き だけ／E設備＝1通も 無い */
const KURA0 = [
  iss('a8', 'pA', '2026-08-31', 'A社の古い品'),
  iss('a9', 'pA', '2026-09-30', 'A社の定期保守'),
  { id: 'a10', no: '', status: 'draft', doc_type: 'invoice', partner_id: 'pA', issue_ymd: '2026-10-20', lines: [line('A下書きの品', 1)], data: {} },
  iss('a11', 'pA', '2026-11-02', 'A取り消しの品', { status: 'void' }),
  iss('b9', 'pB', '2026-09-15', 'B社の品'),
  { id: 'c10', no: '', status: 'draft', doc_type: 'invoice', partner_id: 'pC', issue_ymd: '2026-10-21', due_ymd: '2026-11-30', tax_mode: 'exclusive', rounding: 'floor', lines: [line('C下書きの品', 5000)], data: {} },
];

let APP_KAE = null;
async function tateru(o) {
  o = o || {};
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''),
    { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' + rel });
  const win = dom.window, doc = win.document;
  win.fetch = () => Promise.reject(new Error('no net'));
  win.scrollTo = () => {}; win.print = () => {}; win.confirm = () => true;
  win.URL.createObjectURL = () => 'blob:fake';
  for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
    const src = m[1].split('?')[0];
    if (/^https?:/.test(src) || ['supa-config.js', 'auth.js', 'env-badge.js'].indexOf(src.split('/').pop()) >= 0) continue;
    const p = path.resolve(path.dirname(file), src);
    if (!fs.existsSync(p)) continue;
    const el = doc.createElement('script');
    el.textContent = (APP_KAE && /seikyu-app\.js$/.test(src)) ? APP_KAE : fs.readFileSync(p, 'utf8');
    doc.body.appendChild(el);
  }
  await nemuru(300);
  doc.getElementById('app').hidden = false;
  const A = win.SeikyuApp, S = A._state;
  S.org = { yago: '合同会社Rakunally', addr: '東京都架空区見本台1-2-3', invoiceNo: 'T1234567890123' };
  S.partners = [
    { id: 'pA', sort: 1, data: { name: 'A工業', honor: '御中' } },
    { id: 'pB', sort: 2, data: { name: 'B商店', honor: '御中' } },
    { id: 'pC', sort: 3, data: { name: 'C建設', honor: '御中' } },
    { id: 'pE', sort: 4, data: { name: 'E設備', honor: '御中' } },
  ];
  S.partnersReadOk = true; S.orgReadOk = true;
  const kura = JSON.parse(JSON.stringify(KURA0));
  const ctl = { ochiru: o.ochiru || 0, matsu: null };
  S.invoices = []; S.receipts = []; S.fil = 'all'; S.docType = 'invoice';
  S.store = {
    partners: { list: () => Promise.resolve(S.partners), gone: () => Promise.resolve([]), patch: () => Promise.resolve({ ok: true }) },
    invoices: {
      list: (k) => {
        if (ctl.ochiru > 0) { ctl.ochiru--; return Promise.reject(new Error('net down')); }
        const r = JSON.parse(JSON.stringify(kura.filter((x) => (x.doc_type || 'invoice') === (k || 'invoice'))));
        if (ctl.matsu) { const m = ctl.matsu; ctl.matsu = null; return m.then(() => r); }
        return Promise.resolve(r);
      },
      usedNos: () => Promise.resolve(kura.map((x) => x.no)),
      saveDraft: (v) => Promise.resolve({ ok: true, id: v.id || 'n1' }),
      issue: (row) => Promise.resolve({ ok: true, id: row.id || 'n2', no: 'X-1' }),
      removeDraft: () => Promise.resolve({ ok: true }),
      markSent: () => Promise.resolve({ ok: true }),
    },
    org: { save: (p) => Promise.resolve({ ok: true, data: Object.assign({}, S.org, p) }) },
    receipts: { list: () => Promise.resolve([]) },
    payments: { list: () => Promise.resolve([]) },
  };
  S.suite = { org: { get: () => Promise.resolve(S.org) }, partners: { list: () => Promise.resolve(S.partners) } };
  A._bindForTest();
  await A._loadList().catch(() => {});
  await nemuru(20);
  const $ = (id) => doc.getElementById(id);
  const t = {
    win, doc, A, S, $, kura, ctl,
    settei: async () => { doc.querySelector('.bn[data-scr="scr-set"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true })); await nemuru(60); },
    hiraku: async (pid) => { const s = $('s-partner'); s.value = pid; s.dispatchEvent(new win.Event('change', { bubbles: true })); await nemuru(40); },
    fuda: () => [...doc.querySelectorAll('#s-ptpl-e [data-tpl]')],
    onNa: () => [...doc.querySelectorAll('#s-ptpl-e [data-tpl].on')].map((b) => b.getAttribute('data-tpl')),
    e: () => [...doc.querySelectorAll('#s-ptpl-e iframe')].map((f) => f.getAttribute('srcdoc') || ''),
    why: () => ($('s-ptpl-e-why') && $('s-ptpl-e-why').textContent) || '',
    mieru: () => { for (let e = $('s-ptpl-e'); e && e !== doc.body; e = e.parentElement) { if (e.style && e.style.display === 'none') return false; } return !!$('s-ptpl-e'); },
    osu: async (id) => { const b = doc.querySelector('#s-ptpl-e [data-tpl="' + id + '"]'); ok(b, '★押す 札が 無い★ ' + id); b.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); await nemuru(40); },
  };
  return t;
}

async function main() {
  console.log('\n[ptpl-e] 設定 ▸ 取引先 の 様式を 絵で 選ぶ（v8 件2）');

  await T('(1) 相手を 開くと 札が 1＋様式の数・選ばれているのは select の 値', async () => {
    const t = await tateru();
    await t.settei(); await t.hiraku('pA');
    ok(t.$('s-ptpl-e'), '★絵の 置き場（#s-ptpl-e）が 無い★');
    ok(t.mieru(), '★相手を 開いたのに 絵が 隠れている★');
    eq(t.fuda().length, 1 + TPL_N, '札の 数');
    eq(t.fuda()[0].getAttribute('data-tpl'), '', '先頭は「会社の既定のまま」');
    ok(/既定のまま/.test(t.fuda()[0].textContent), '先頭の 札の 字');
    eq(t.onNa(), [t.$('s-ptpl').value], '選ばれている 札＝select の 値');
    /* ★select の 下★（上だと ptTplHiraku の focus で 絵が 画面の 外） */
    ok(t.$('s-ptpl').compareDocumentPosition(t.$('s-ptpl-e')) & t.win.Node.DOCUMENT_POSITION_FOLLOWING, '★絵が select より 上★');
  });

  await T('(2) 違う 札を 押す → select の 値が 変わり change 1回・相手の 紙に 入る', async () => {
    const t = await tateru();
    await t.settei(); await t.hiraku('pA');
    let n = 0; t.$('s-ptpl').addEventListener('change', () => { n++; });
    await t.osu('koujo');
    eq(t.$('s-ptpl').value, 'koujo', 'select の 値');
    eq(n, 1, 'change の 回数');
    eq(((t.S.partners[0].data.paper) || {}).template, 'koujo', '相手の 紙（保存前の 形）');
    eq(t.onNa(), ['koujo'], '押した 札が 選ばれている');
    await t.osu('');
    eq(t.$('s-ptpl').value, '', '既定へ 戻せる');
    eq(n, 2, '戻した 時も change 1回');
  });

  await T('(3) 同じ 札を 押す → change 0回', async () => {
    const t = await tateru();
    await t.settei(); await t.hiraku('pA');
    let n = 0; t.$('s-ptpl').addEventListener('change', () => { n++; });
    await t.osu('');
    eq(n, 0, '既定のまま を 押した 時の change');
    await t.osu('genba'); n = 0;
    await t.osu('genba');
    eq(n, 0, '同じ 様式を もう一度 押した 時の change');
  });

  await T('(4) 相手を 閉じる → 絵は 隠れて 空', async () => {
    const t = await tateru();
    await t.settei(); await t.hiraku('pA');
    await t.hiraku('');
    ok(!t.mieru(), '★相手が 無いのに 絵が 出ている★');
    eq(t.fuda().length, 0, '隠した 時の 札（中身も 空に する＝文書の 絵を 数える 所が 混ざらない）');
  });

  await T('(5) 中身＝その 相手の 一番新しい 発行済み（下書き・取り消しは 拾わない）・字に 番号', async () => {
    const t = await tateru();
    /* ★棚に 下書きと 取り消しが 居る 事を 先に 作る★（一覧の 読みが 落とす 物が 在っても 絞りの 試験が 空振りしない） */
    ['a10', 'a11'].forEach((id) => { if (!t.S.invoices.some((x) => x.id === id)) t.S.invoices.push(JSON.parse(JSON.stringify(t.kura.find((x) => x.id === id)))); });
    ok(t.S.listKind === 'invoice' && t.S.listReadOk === true && t.S.invoices.some((x) => x.id === 'a11'), '前置き：請求書の 棚に 取り消しが 居る');
    await t.settei(); await t.hiraku('pA');
    const e = t.e();
    eq(e.length, 1 + TPL_N, '絵の 数');
    ok(e.every((h) => h.indexOf('A社の定期保守') >= 0), '★一番新しい 発行済み（9月）の 品名が 絵に 無い★');
    ok(e.every((h) => h.indexOf('A下書きの品') < 0 && h.indexOf('A取り消しの品') < 0 && h.indexOf('A社の古い品') < 0), '★下書き・取り消し・古い 1通を 拾った★');
    ok(/A9/.test(t.why()), '★どの 1通で 見せているかを 言っていない★: ' + t.why());
    await t.hiraku('pB');
    ok(t.e().every((h) => h.indexOf('B社の品') >= 0 && h.indexOf('A社の定期保守') < 0), '★相手を 変えても 前の 相手の 絵★');
  });

  await T('(6) 入力で 別の 相手の 下書きを 開いた まま、1通も 無い 相手を 開く → その 下書きの 品名が 絵に 出ない', async () => {
    const t = await tateru();
    t.S.cur = JSON.parse(JSON.stringify(t.kura.find((x) => x.id === 'c10')));
    t.A._go('scr-edit'); t.A._fillEdit(); await nemuru(30);
    const keep = t.S.cur;
    await t.settei(); await t.hiraku('pE');
    ok(t.e().length === 1 + TPL_N, '絵が 描かれていない');
    ok(t.e().every((h) => h.indexOf('C下書きの品') < 0 && h.indexOf('C建設') < 0), '★別の 相手の 下書きの 中身が 絵に 出た（見本と 言いながら 嘘）★');
    ok(t.e().every((h) => h.indexOf('（見本）') >= 0), '★見本の 中身で 描いていない★');
    ok(/まだ/.test(t.why()) && /見本/.test(t.why()), '★0件の 字★: ' + t.why());
    ok(t.S.cur === keep, '★入力の 1通が 戻っていない★');
    await t.hiraku('pC');
    ok(t.e().every((h) => h.indexOf('C下書きの品') < 0), '★下書き だけの 相手で 下書きを 拾った★');
  });

  await T('(7) 請求書を 読めない 時の 字／読み込み中の 字', async () => {
    const t = await tateru({ ochiru: 99 });
    eq(t.S.billOk, false, '前置き：読めていない');
    await t.settei(); await t.hiraku('pA');
    ok(/読めていません/.test(t.why()) && /見本/.test(t.why()), '★読めない 時の 字★: ' + t.why());
    ok(t.e().every((h) => h.indexOf('（見本）') >= 0), '読めない 時は 見本の 中身');
    t.S.billOk = null; t.S.listReadOk = null;
    await t.hiraku(''); await t.hiraku('pA');
    ok(/読み込んで/.test(t.why()), '★読み込み中の 字★: ' + t.why());
  });

  await T('(8) 読み終わったら 描き直す（読み込み中 → 読めた）', async () => {
    const t = await tateru();
    let tok; t.ctl.matsu = new Promise((r) => { tok = r; });
    t.S.listReadOk = false; t.S.listKind = 'invoice'; t.S.billOk = undefined; t.S.billInv = undefined;
    await t.settei(); await t.hiraku('pA');
    ok(/読み込んで/.test(t.why()), '★読みに 行っていない（読み込み中の 字で ない）★: ' + t.why());
    tok(); await nemuru(60);
    ok(t.e().length && t.e().every((h) => h.indexOf('A社の定期保守') >= 0), '★読めた 後に 描き直していない★');
    ok(/A9/.test(t.why()), '読めた 後の 字: ' + t.why());
  });

  await T('(9) select が 押せない 時は 絵を 押しても 変わらない', async () => {
    const t = await tateru();
    await t.settei(); await t.hiraku('pA');
    t.$('s-ptpl').disabled = true;
    let n = 0; t.$('s-ptpl').addEventListener('change', () => { n++; });
    await t.osu('koujo');
    eq(t.$('s-ptpl').value, '', '押せない 時の 値');
    eq(n, 0, '押せない 時の change');
  });

  await T('(10) 行数を 変えると 絵の 中身も 変わる', async () => {
    const t = await tateru();
    await t.settei(); await t.hiraku('pA');
    const mae = t.e()[0];
    const r = t.$('s-prows'); r.value = '3'; r.dispatchEvent(new t.win.Event('change', { bubbles: true })); await nemuru(40);
    ok(t.e()[0] !== mae, '★行数を 変えたのに 絵が 古い まま★');
  });

  await T('(11) 紙を 作るのが 転んでも 外へ 投げない（一覧は 読めた まま・字で 言う・今の 1通は 戻る）', async () => {
    const t = await tateru();
    await t.settei(); await t.hiraku('pA');
    const keep = t.S.cur;
    const P = t.win.SeikyuPaper, moto = P.build;
    P.build = () => { throw new Error('わざと'); };
    let nageta = null;
    try {
      await t.hiraku(''); await t.hiraku('pB');
      await t.A._loadList().catch((e) => { nageta = e; });
      await nemuru(30);
    } finally { P.build = moto; }
    ok(!nageta, '★読み直しが 投げた★');
    eq(t.S.listReadOk, true, '★絵が 転んで 一覧が「読めていない」に なった★');
    ok(/描けません/.test(t.why()), '★転んだ 事を 字で 言っていない★: ' + t.why());
    ok(t.S.cur === keep, '★今の 1通が 戻っていない★');
    eq(t.$('b-pt-save').disabled, false, '★転んで 保存が 押せない まま★');
  });

  await T('(12) 入力の 画面では 描かない', async () => {
    const t = await tateru();
    await t.settei(); await t.hiraku('pA');
    t.S.cur = JSON.parse(JSON.stringify(t.kura.find((x) => x.id === 'b9')));
    t.A._go('scr-edit'); t.A._fillEdit(); await nemuru(30);
    eq(t.fuda().length, 0, '★入力の 画面で 絵を 作った（7枚の 紙）★');
  });

}

/* ★自分ためし★＝描く所・門を 1つずつ 抜いて、★狙った 試験（ate）★が 赤に なるかを 見る */
const KOWASHI = [
  { na: '同じ 値でも change を 出す', ate: '(3)', from: "if ((sel.value || '') === (id || '')) return;", to: '' },
  { na: '押せない 時の 門を 外す', ate: '(9)', from: 'if (!sel || sel.disabled) return;', to: 'if (!sel) return;' },
  { na: '読み終わりで 描き直さない', ate: '(8)', from: 'ptPicsRedraw();   /* ★設定の 取引先の 絵も★', to: 'void 0;   /* ★設定の 取引先の 絵も★' },
  { na: '相手で 絞らない', ate: '(5)', from: "if (String(v.partner_id || '') !== String(pid)) return;", to: '' },
  { na: '発行済み だけに 絞らない', ate: '(5)', from: "if (!v || v.status !== 'issued' || (v.doc_type || 'invoice') !== 'invoice') return;", to: "if (!v || (v.doc_type || 'invoice') !== 'invoice') return;" },
  { na: '1通が 無い 時に 今の 1通を 外さない（止1）', ate: '(6)', from: 'S.cur = c;   /* ★無い 時も 入れ替える★', to: 'if (c) S.cur = c;   /* ★無い 時も 入れ替える★' },
  { na: '転んだのを 外へ 投げる（止2）', ate: '(11)', from: '} catch (e) { err = e; } finally { S.cur = keep; S.dirty = keepDirty; }', to: '} finally { S.cur = keep; S.dirty = keepDirty; }' },
  { na: '中身が 同じかを 見ずに 古い 絵を 残す（止3）', ate: '(10)', from: "if (f && f.getAttribute('srcdoc') !== h) f.srcdoc = h;", to: "if (f && !f.getAttribute('srcdoc')) f.srcdoc = h;" },
  { na: '入力の 画面でも 描く', ate: '(12)', from: 'if (!p || !ptPicsShown()) {', to: 'if (!p) {' },
  { na: '読めない 時に 読みに 行かない', ate: '(8)', from: "if (src.ok !== true && S.billOk === undefined && S.listReadOk !== null) loadBillInv();", to: '' },
];

if (SELF) {
  let aka = 0;
  for (const k of KOWASHI) {
    /* ★壊す所は 1か所 だけ★（同じ 字が 他に 在ると 別の 所を 壊して 空振りする＝11-13 に 踏んだ） */
    if (APP.split(k.from).length !== 2) { console.log('  ✗ 壊す所が 1か所で ない（' + (APP.split(k.from).length - 1) + '）＝自分ためし 失敗: ' + k.na); aka = -999; continue; }
    APP_KAE = APP.replace(k.from, k.to);
    pass = 0; fail = 0; akaNa = [];
    const log = console.log; console.log = () => {};
    try { await main(); } finally { console.log = log; }
    if (akaNa.indexOf(k.ate) >= 0) { aka++; console.log('  ✓ 壊すと 赤: ' + k.na + '（狙い ' + k.ate + ' 赤・全部で 赤 ' + fail + '＝' + akaNa.join(' ') + '）'); }
    else console.log('  ✗ 狙いの ' + k.ate + ' が 緑＝見張れていない: ' + k.na + '（赤 ' + (akaNa.join(' ') || '0') + '）');
  }
  const zen = KOWASHI.length;
  console.log('KEKKA ' + (aka === zen ? 'passed' : 'failed') + ' 自分ためし ' + aka + '/' + zen);
  process.exit(aka === zen ? 0 : 1);
} else {
  await main();
  console.log('KEKKA ' + (fail ? 'failed' : 'passed') + ' ' + pass + '✓ ' + fail + '✗');
  process.exit(fail ? 1 : 0);
}
