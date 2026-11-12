/* aite-mada.mjs — ★入力の「だれに」の 選びの 先頭に「◯月ぶん まだ」★（2026-11-09 請求書 UI/UX 案 v8 件1）
 * =============================================================================
 * 決め（コンサル [be6f32] 案 v8・設計前 taiketsu 止め0＝taiketsu10.md）
 *   ・e-partner の 中身だけを 描く 関数（aiteSelectWoKaku）に 分ける。fillEdit は その 呼び 1つ。
 *   ・先頭に optgroup「◯月ぶん まだ」＝dueList（毎月の 相手で 今月 まだ）を ptLive で 絞る。
 *     下は 組が ある 時だけ optgroup「ほかの相手」。同じ 相手は 2回 並べない。「＋」と 削除済みは 一番下（組の 外）。
 *   ・組を 出すのは listReadOk===true・partnersReadOk===true・一覧も 今の 1通も 請求書 の 時だけ。
 *   ・loadList の then・catch からも 描く＝門 S.cur===S.gamen && !S.lookMae（＋ partnersReadOk===true）。
 *     focus 中は 描かず blur で 描く。fillEdit は 呼ばない（入金の 打ちかけを 消さない）。
 *
 * 試験（案の 番号）
 *   (1) 毎月の 相手2社（1社は 今月 下書き在り）→ 組に 1社だけ・下の 並びに その 1社が 無い
 *   (2) 一覧が 読めない → 組が 無く 並びは 今どおり
 *   (3) 見積の 一覧 → 組が 無い
 *   (4) 組から 選ぶ（option から 選んで change）→ 前回の 中身が 入る
 *   (5) 消した 相手（出した 請求書は 在る）が 組に 出ない
 *   (6) 見積の 1通を 開いた まま 一覧を 請求書に 替える → 組が 無い
 *   (7) 発行済みの 1通（一覧の「修正」で 開いた）で 入金の 金額・メモを 打つ → 一覧へ →「読み直す」→ 入力へ 戻る → 残っている
 *   (8) 読み直しの 返事が 遅い 間に「確認」で 別の 社の 1通を 見る → 返事 → 閉じる → 欄の 相手は 打ちかけの 1通の 相手
 *   (9) 1回目の 読みが 落ちる → 「読み直す」の 後に 組が 出る（fillEdit を 通らない 道）
 *   (10) 選びを 開いている（focus）間の 読み直しでは 描かず、blur で 描く
 *
 * 使い方: node seikyu/tests/aite-mada.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません。この検証は飛ばせません（SKIPを緑と呼ばない）。npm install してください。'); process.exit(1); }

const SELF = process.argv.includes('--self-test');
let pass = 0, fail = 0, akaNa = [];
const T = async (n, fn) => { try { await fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; akaNa.push(n.split(' ')[0]); console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };
const eq = (a, b, m) => { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error((m || '') + ' … 期待 ' + y + ' / 実際 ' + x); };
const nemuru = (ms) => new Promise((r) => setTimeout(r, ms));

const rel = 'seikyu/index.html', file = path.join(ROOT, rel);
const html = fs.readFileSync(file, 'utf8');
const appRel = 'seikyu/js/seikyu-app.js';
const APP = fs.readFileSync(path.join(ROOT, appRel), 'utf8');
const line = (na, kin) => ({ name: na, qty: '1', unit: '式', price: String(kin), amount: String(kin), rate: 10, memo: '' });
const IMA = Date.parse('2026-10-25T12:00:00+09:00');   /* 今月＝2026-10 */

/* ★倉庫★
   A工業＝8月・9月に 発行（今月 まだ）＝★組に 出る★
   B商店＝8月・9月に 発行＋今月の 下書き＝出ない
   C建設＝9月だけ＝毎月でない＝出ない
   D設備＝8月・9月に 発行・★取引先から 消した★＝出ない（(5)） */
const iss = (id, pid, ymd, extra) => Object.assign({ id, no: id.toUpperCase(), status: 'issued', doc_type: 'invoice', partner_id: pid,
  issue_ymd: ymd, tax_mode: 'exclusive', rounding: 'floor', lines: [line(pid + 'の品', 10000)], data: { subject: pid + 'の件名' },
  totals: { grandTotal: 11000 } }, extra || {});
const KURA0 = [
  iss('a8', 'pA', '2026-08-31'), iss('a9', 'pA', '2026-09-30', { lines: [line('A社の定期保守', 30000)], data: { subject: 'A社の9月分' } }),
  iss('b8', 'pB', '2026-08-31'), iss('b9', 'pB', '2026-09-30'),
  { id: 'b10', no: '', status: 'draft', doc_type: 'invoice', partner_id: 'pB', issue_ymd: '2026-10-20', lines: [line('B下書き', 1)], data: {} },
  iss('c9', 'pC', '2026-09-30'),
  iss('d8', 'pD', '2026-08-31'), iss('d9', 'pD', '2026-09-30'),
];
const QUOTE = { id: 'q1', no: 'Q-1', status: 'draft', doc_type: 'quote', partner_id: 'pB', issue_ymd: '2026-10-20', lines: [line('見積の品', 5000)], data: {} };

let APP_KAE = null;
async function tateru(o) {
  o = o || {};
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''),
    { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' + rel });
  const win = dom.window, doc = win.document;
  win.fetch = () => Promise.reject(new Error('no net'));
  win.eval('Date = class extends Date { constructor(...a) { if (a.length) super(...a); else super(' + IMA + '); } static now() { return ' + IMA + '; } };');
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
  ];
  S.gonePartners = { pD: { id: 'pD', data: { name: 'D設備' } } };
  S.partnersReadOk = true; S.orgReadOk = true;
  const kura = JSON.parse(JSON.stringify(KURA0));
  if (o.quote) kura.push(JSON.parse(JSON.stringify(QUOTE)));
  /* 一覧の 読みを 落とす 回数・遅らせる 手 */
  const ctl = { ochiru: o.ochiru || 0, matsu: null };
  S.invoices = []; S.receipts = []; S.fil = 'all'; S.docType = o.docType || 'invoice';
  S.store = {
    partners: { list: () => Promise.resolve(S.partners), gone: () => Promise.resolve([]) },
    invoices: {
      list: (k) => {
        if (ctl.ochiru > 0) { ctl.ochiru--; return Promise.reject(new Error('net down')); }
        /* ★doc_type の 無い 古い 見積の 行★（dueList は 無い 時 請求書と 数える＝一覧の 種類の 門だけが 止める） */
        if (o.quoteNashiType && k === 'quote') {
          return Promise.resolve(['2026-08-31', '2026-09-30'].map((d, i) => { const x = iss('q' + i, 'pC', d); delete x.doc_type; return x; }));
        }
        const r =JSON.parse(JSON.stringify(kura.filter((x) => (x.doc_type || 'invoice') === (k || 'invoice'))));
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
  /* 「読み直す」の loadMasters が 読む 共有の 倉庫 */
  S.suite = { org: { get: () => Promise.resolve(S.org) }, partners: { list: () => Promise.resolve(S.partners) } };
  A._bindForTest();
  await A._loadList().catch(() => {});
  await nemuru(20);
  const $ = (id) => doc.getElementById(id);
  const t = {
    win, doc, A, S, $, kura, ctl,
    gumi: () => [...doc.querySelectorAll('#e-partner optgroup[label*="まだ"] option')].map((x) => x.value),
    gumiLabel: () => { const g = doc.querySelector('#e-partner optgroup[label*="まだ"]'); return g ? g.getAttribute('label') : null; },
    hoka: () => [...doc.querySelectorAll('#e-partner optgroup[label="ほかの相手"] option')].map((x) => x.value),
    zenbu: () => [...doc.querySelectorAll('#e-partner option')].map((x) => x.value),
    osu: async (sel) => { const b = doc.querySelector(sel); ok(b, '★押す物が 無い★ ' + sel); b.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); await nemuru(80); },
    utsu: (el, val) => { el.value = val; el.dispatchEvent(new win.Event('input', { bubbles: true })); },
    atarashii: async () => { A._new(); await nemuru(30); },
  };
  return t;
}

async function main() {
  console.log('aite-mada（入力の 相手の 選びの 先頭に「◯月ぶん まだ」）' + (APP_KAE ? '［壊した 本文］' : ''));

  await T('(1) 毎月の 相手で 今月 まだの A工業だけが 組に 出る・下の 並びに A は 無い・「＋」は 一番下', async () => {
    const t = await tateru();
    await t.atarashii();
    eq(t.gumi(), ['pA'], '組の 中身');
    eq(t.gumiLabel(), '10月ぶん まだ', '組の 名前');
    eq(t.hoka(), ['pB', 'pC'], '下の 並び（同じ 相手を 2回 並べない）');
    const z = t.zenbu();
    eq(z[0], '', '先頭は（選んでください）');
    eq(z[z.length - 1], '__new__', '一番下は ＋ 新しい相手を作る');
    ok(!t.doc.querySelector('#e-partner optgroup option[value="__new__"]'), '★「＋」が 組の 中に 入った★');
  });

  await T('(2) 一覧が 読めない 時は 組を 出さず 並びは 今どおり', async () => {
    const t = await tateru({ ochiru: 1 });
    eq(t.S.listReadOk, false, '一覧は 読めていない');
    await t.atarashii();
    eq(t.doc.querySelectorAll('#e-partner optgroup').length, 0, '組（optgroup）の 数');
    eq(t.zenbu(), ['', 'pA', 'pB', 'pC', '__new__'], '並び');
  });

  await T('(2b) 1度 読めた 後に 読み直しが 落ちたら 古い 組を 消す（前の 一覧で「まだ」と 言い切らない）', async () => {
    const t = await tateru();
    await t.atarashii();
    eq(t.gumi(), ['pA'], '読めた 時の 組');
    t.$('e-partner').value = 'pA';   /* ★相手を 選んだ まま 読み直しが 落ちる★（'' の ままでは 値を 保たなくても 緑＝taiketsu 11-13 任意2c） */
    t.$('e-partner').dispatchEvent(new t.win.Event('change', { bubbles: true }));
    await nemuru(60);
    eq(t.S.cur.partner_id, 'pA', '選んだ 相手');
    t.ctl.ochiru = 1;
    await t.A._loadList(); await nemuru(20);
    eq(t.S.listReadOk, false, '読み直しは 落ちた');
    eq(t.doc.querySelectorAll('#e-partner optgroup').length, 0, '組（optgroup）の 数');
    eq(t.$('e-partner').value, 'pA', '選ばれた 値は 保つ');
    eq(t.zenbu(), ['', 'pA', 'pB', 'pC', '__new__'], '組を 消した 後の 並び');
  });

  await T('(3b) 請求書の 1通を 開いた まま 一覧を 見積に 替えたら 組を 出さない（古い 行で doc_type が 無くても）', async () => {
    const t = await tateru({ quoteNashiType: true });
    await t.atarashii();
    eq(t.gumi(), ['pA'], '請求書の 一覧の 時の 組');
    t.S.docType = 'quote';
    await t.A._loadList(); await nemuru(20);
    eq(t.S.listKind, 'quote', '一覧の 種類');
    eq(t.S.cur.doc_type || 'invoice', 'invoice', '今の 1通は 請求書の まま');
    eq(t.doc.querySelectorAll('#e-partner optgroup').length, 0, '組（optgroup）の 数');
  });

  await T('(3) 見積の 一覧の 時は 組を 出さない', async () => {
    const t = await tateru({ docType: 'quote', quote: true });
    eq(t.S.listKind, 'quote', '一覧の 種類');
    await t.atarashii();
    eq(t.doc.querySelectorAll('#e-partner optgroup').length, 0, '組（optgroup）の 数');
  });

  await T('(4) 組から 選ぶと 前回（9月分）の 中身が 入る', async () => {
    const t = await tateru();
    await t.atarashii();
    const o = t.doc.querySelector('#e-partner optgroup[label*="まだ"] option');
    ok(o, '★組の option が 無い★（空振り）');
    t.$('e-partner').value = o.value;
    t.$('e-partner').dispatchEvent(new t.win.Event('change', { bubbles: true }));
    await nemuru(60);
    eq(t.S.cur.partner_id, 'pA', '選ばれた 相手');
    ok((t.S.cur.lines || []).some((l) => l.name === 'A社の定期保守'), '★前回の 明細が 入らない★ ' + JSON.stringify((t.S.cur.lines || []).map((l) => l.name)));
  });

  await T('(5) 消した 取引先（出した 請求書は 在る）は 組に 出ない', async () => {
    const t = await tateru();
    await t.atarashii();
    eq(t.gumi(), ['pA'], '組は 出ている（空の 組で 緑に しない）');
    ok(t.gumi().indexOf('pD') < 0, '★消した D設備が 組に 出た★ ' + JSON.stringify(t.gumi()));
    ok(t.zenbu().indexOf('pD') < 0, '★消した D設備が 並びに 出た★');
  });

  await T('(6) 見積の 1通を 開いた まま 一覧を 請求書に 替えても 組を 出さない', async () => {
    const t = await tateru({ docType: 'quote', quote: true });
    await t.atarashii();
    eq(t.S.cur.doc_type, 'quote', '今の 1通');
    t.S.docType = 'invoice';
    await t.A._loadList();
    await nemuru(20);
    eq(t.S.listKind, 'invoice', '一覧は 請求書');
    eq(t.doc.querySelectorAll('#e-partner optgroup').length, 0, '組（optgroup）の 数');
  });

  await T('(7) 発行済みの 1通で 入金を 打ちかけ → 一覧で「読み直す」→ 戻っても 打ちかけが 残る', async () => {
    const t = await tateru();
    t.A._go('scr-list'); t.A._renderListForTest(); await nemuru(30);
    await t.osu('[data-open="c9"]');
    eq(t.S.cur && t.S.cur.id, 'c9', '開いた 1通');
    t.utsu(t.$('pay-amt'), '7000');
    t.utsu(t.$('pay-memo'), '手数料 差引');
    t.A._go('scr-list'); await nemuru(30);
    await t.osu('#b-reload'); await nemuru(80);
    t.A._go('scr-edit'); await nemuru(30);
    eq(t.$('pay-amt').value, '7000', '入金の 金額');
    eq(t.$('pay-memo').value, '手数料 差引', '入金の メモ');
  });

  await T('(8) 読み直しが 遅い 間に「確認」で 別の 社の 1通を 見て 閉じても、欄の 相手は 打ちかけの 1通の まま', async () => {
    const t = await tateru();
    await t.atarashii();
    t.$('e-partner').value = 'pC';
    t.$('e-partner').dispatchEvent(new t.win.Event('change', { bubbles: true }));
    await nemuru(40);
    const mine = t.S.cur;
    eq(mine.partner_id, 'pC', '打ちかけの 相手');
    let hanasu; t.ctl.matsu = new Promise((r) => { hanasu = r; });
    const yomi = t.A._loadList();
    t.A._go('scr-list'); t.A._renderListForTest(); await nemuru(30);
    await t.osu('[data-look="a9"]');
    ok(t.A._lookOpenedForTest(), '★確認の 窓が 開かない★（空振り）');
    hanasu(); await yomi; await nemuru(30);
    t.win.document.dispatchEvent(new t.win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nemuru(30);
    ok(t.S.cur === mine, '★閉じた 後の S.cur が 打ちかけの 1通で ない★');
    eq(t.$('e-partner').value, 'pC', '欄の 相手（打ちかけの 1通の 相手）');
  });

  await T('(9) 1回目の 読みが 落ちても「読み直す」の 後に 組が 出る（fillEdit を 通らない 道）', async () => {
    const t = await tateru({ ochiru: 1 });
    await t.atarashii();
    eq(t.gumi(), [], '読めない 間は 組なし');
    t.A._go('scr-list'); await nemuru(20);
    await t.osu('#b-reload'); await nemuru(80);
    eq(t.S.listReadOk, true, '読み直しで 読めた');
    eq(t.gumi(), ['pA'], '読み直しの 後の 組');
  });

  await T('(10) 選びを 開いている 間の 読み直しでは 描かず、閉じたら（blur）描く', async () => {
    const t = await tateru({ ochiru: 1 });
    await t.atarashii();
    t.A._go('scr-edit'); await nemuru(20);
    t.$('e-partner').focus();
    eq(t.doc.activeElement && t.doc.activeElement.id, 'e-partner', 'focus');
    await t.A._loadList(); await nemuru(20);
    eq(t.gumi(), [], '開いている 間は 描かない');
    t.$('e-partner').blur();
    t.$('e-partner').dispatchEvent(new t.win.FocusEvent('blur'));
    await nemuru(20);
    eq(t.gumi(), ['pA'], '閉じた 後の 組');
  });

  await T('(11) 取引先が 読めない 時の 読み直しでは 選びを 描き直さない（空の 取引先で 並びを 消さない）', async () => {
    const t = await tateru();
    await t.atarashii();
    const mae = t.zenbu();
    eq(mae, ['', 'pA', 'pB', 'pC', '__new__'], '前の 並び');
    t.S.partners = []; t.S.partnersReadOk = false;   /* loadMasters が 落ちた 時と 同じ 形（S.partners＝[]） */
    await t.A._loadList(); await nemuru(20);
    eq(t.S.listReadOk, true, '一覧は 読めた');
    eq(t.zenbu(), mae, '並びは 前の まま');
  });
}

/* ★自分ためし★＝描く所・門を 1つずつ 抜いて、★狙った 試験（ate）★が 赤に なるかを 見る（他の 試験の 赤では 数えない・taiketsu 11-13 任意4） */
const KOWASHI = [
  { na: '組を 描かない（描く所を 抜く）', ate: '(1)', from: 'var g = aiteMadaGumi(v);', to: 'var g = null;' },
  { na: '消した 相手を 絞らない', ate: '(5)', from: ".filter(function (d) { return !!ptLive(d.partnerId); });\n    if (!due.length) return null;", to: ";\n    if (!due.length) return null;" },
  { na: '一覧が 読めたかを 見ない', ate: '(2b)', from: "if (!RC || S.listReadOk !== true || S.partnersReadOk", to: "if (!RC || S.partnersReadOk" },
  { na: '一覧の 種類を 見ない', ate: '(3b)', from: " || S.listKind !== 'invoice') return null;", to: ') return null;' },
  { na: '今の 1通の 種類を 見ない', ate: '(6)', from: "if ((v.doc_type || S.docType || 'invoice') !== 'invoice') return null;", to: '' },
  { na: '読み直しの 後に 描かない', ate: '(9)', from: "aiteYomiNoAto();   /* ★まだの 相手の 組を 今の 一覧で 描く★", to: "void 0;   /* ★まだの 相手の 組を 今の 一覧で 描く★" },
  { na: '読み直しの 門（S.gamen・lookMae）を 外す', ate: '(8)', from: 'if (!(S.cur && S.cur === S.gamen && !S.lookMae)) return;', to: 'if (!S.cur) return;' },
  { na: '読み直しから fillEdit で 描く（v7 の 形）', ate: '(7)', from: "if (global.document.activeElement === el) { aiteBlurMachi = true; return; }\n      aiteSelectWoKaku();", to: "if (global.document.activeElement === el) { aiteBlurMachi = true; return; }\n      fillEdit();" },
  { na: 'focus 中でも 描く', ate: '(10)', from: 'if (global.document.activeElement === el) { aiteBlurMachi = true; return; }', to: '' },
  { na: 'blur で 描かない', ate: '(10)', from: "aiteBlurMachi = false;\n      aiteYomiNoAto();\n    };", to: "aiteBlurMachi = false;\n    };" },
  { na: '読みが 落ちた 時に 描き直さない（catch の 呼びを 抜く）', ate: '(2b)', from: 'aiteYomiNoAto();   /* ★読めない 時は 古い 組を 消す★', to: 'void 0;   /* ★読めない 時は 古い 組を 消す★' },
  { na: '読み直しの 取引先の 門を 外す', ate: '(11)', from: "      if (S.partnersReadOk !== true) return;\n      var el = $('e-partner');", to: "      var el = $('e-partner');" },
];

if (SELF) {
  let aka = 0;
  for (const k of KOWASHI) {
    if (APP.indexOf(k.from) < 0) { console.log('  ✗ 壊す所が 見つからない＝自分ためし 失敗: ' + k.na); aka = -999; continue; }
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
