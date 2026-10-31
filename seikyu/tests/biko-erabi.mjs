/* biko-erabi.mjs — ★発行済みの 1通で 様式を 選び直したら、紙の 列も その様式に する★
 * =============================================================================
 * 2026-10-29 司さん（客の実画面）「ある取引先の請求書やけど 修正から 備考なしで 選択したのに まだ 反映されんやないか 何を直したんど」
 *
 * ★本物の seikyu-app.js を jsdom で 動かして 踏んだ 道★（直す前）
 *   取引先の紙「項目・金額＋控除＋備考」で 発行 →「修正」→「この取引先の紙を変える」で「項目と金額だけ＋控除」（備考なし）→「入力」
 *   ＝上の 札は「項目と金額だけ＋控除」に なるのに、紙の 列は 発行した 時の 写し（項目・数量・単位・金額・消費税・★備考★）の まま
 *   訳＝発行済みも 直せる（canEdit）ので 様式の 合わせ（tplSync）が 名前だけ 変え、列は 写し（snapshot.cols）が いちばん 先に 勝っていた
 *
 * ★決め★ 発行済みの 1通から 選び直した 時だけ その 1通に 様式と 印（data.tplErabi）を 当てて しまう＝修正・確認・まとめ出しで 同じ 紙。
 *   設定を 変えただけでは 過去の 発行済みは 変えない（出した紙の 列を 勝手に 変えない）
 *   ・お金の 計算は 1文字も 変えない（列だけ）
 *
 * 使い方: node seikyu/tests/biko-erabi.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません。この検証は飛ばせません（SKIPを緑と呼ばない）。npm install してください。'); process.exit(1); }

const SELF = process.argv.includes('--self-test');
let pass = 0, fail = 0;
/* ★2つに 割って 回す★（--bu=1 / 2）＝1段 180秒の 網に 収める（全部で 約115秒）。--bu 無し＝全部 */
const BU = Number(((process.argv.find((a) => a.startsWith('--bu=')) || '').split('=')[1]) || 0);
const WARU = 2;
const buNi = (i, n) => !BU || Math.floor(i / Math.ceil(n / WARU)) === BU - 1;
const T = async (n, fn) => { try { await fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' … 期待 ' + JSON.stringify(b) + ' / 実際 ' + JSON.stringify(a)); };
const nemuru = (ms) => new Promise((r) => setTimeout(r, ms));

const rel = 'seikyu/index.html', file = path.join(ROOT, rel);
const html = fs.readFileSync(file, 'utf8');

/* 本物の seikyu-store.js saveDraft が 倉庫へ 書く 列（id・account_id・deleted_at・updated_at の 他） */
const KURA_NI_KAKU = ['doc_type', 'no', 'partner_id', 'issue_ymd', 'due_ymd', 'status', 'tax_mode', 'rounding',
  'lines', 'totals', 'snapshot', 'data', 'template_id', 'quote_from'];
let APP_KAE = null;   /* 自分ためしで 壊した 本文（ふだんは null＝本物を 読む） */
/* ★1つの 道ごとに 画面を 1から 立てる★ */
async function tateru() {
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
  S.partners = [{ id: 'pB', sort: 1, data: { name: 'B商店', honor: '御中' } }, { id: 'pC', sort: 2, data: { name: 'C建設', honor: '御中' } }];
  const kura = [];
  const LOG = [];
  const kuraOsoi = { v: 0 };     /* 倉庫の 返事の 遅さ（ミリ秒） */
  const hakkoDame = { v: false }; /* 発行を 倉庫が 断る */
  const kuraKaku = { v: null };
  const saveDame = { v: 0 };
  const saveKienai = { v: 0 };
  const listOsoi = { v: 0 };     /* 読み直しの 返事の 遅さ */   /* 次の N本の 保存は 返事が 来ない（倉庫にも 当たらない） */
  let n = 0;
  const bump = (no) => { const m = /^(.*?)(\d+)$/.exec(no); if (!m) return null; return m[1] + String(+m[2] + 1).padStart(m[2].length, '0'); };
  const ataru = (kind, c) => {
    if (kind === 'issue' && hakkoDame.v) { LOG.push('issue 断る'); return { ok: false, reason: 'クラウドに つながりません' }; }
    if (!c.id) c.id = (kind === 'issue' ? 'iss' : 'drf') + (++n);
    for (let tr = 0; tr < 5; tr++) {
      const old = kura.find((x) => x.id === c.id);
      if (old && old.status !== 'draft') {
        if (c.no !== old.no || (c.issued_at !== undefined && c.issued_at !== old.issued_at) || (c.status !== old.status && !(old.status === 'issued' && c.status === 'void'))) {
          LOG.push(kind + ' ' + c.id + ' 凍結で 拒む ' + old.status + '->' + c.status);
          return { ok: false, reason: '発行済みの請求書は…: no=' + old.no, code: '23514' };
        }
      }
      const dupR = kura.find((x) => x.id !== c.id && x.doc_type === (c.doc_type || 'invoice') && x.no === c.no);
      if (dupR) {
        LOG.push(kind + ' ' + c.id + ' 番号 ' + c.no + ' が ' + dupR.id + ' と ぶつかる');
        if (kind === 'issue') { c.no = bump(c.no); continue; }
        return { ok: false, reason: 'duplicate key', dup: true, code: '23505' };
      }
      /* ★本物の 保存と 同じく 14列だけ 書く★（seikyu-store.js saveDraft）＝送った日時・発行日時 等は 倉庫の 物が 残る・手元の 印は 入らない
         （丸ごと 置くと 送った日時が 消え 手元の 印が 入って、止1・止2 が 試験に 見えなかった・taiketsu 任1） */
      if (kind === 'save') {
        const kaku = {}; for (const k of KURA_NI_KAKU) if (k in c) kaku[k] = c[k];
        c = Object.assign({}, old || {}, kaku, { id: c.id });
      }
      const i = kura.findIndex((x) => x.id === c.id); if (i >= 0) kura[i] = c; else kura.push(c);
      LOG.push(kind + ' ' + c.id + ' ' + c.status + ' no=' + c.no + ' ' + (c.lines || []).map((l) => l.name + '@' + l.price).join(','));
      return { ok: true, id: c.id, no: c.no, bumped: tr };
    }
    return { ok: false, reason: '番号を 進めきれません' };
  };
  /* ★送った 時点で 写す★（後で 写すと 待つ間に 打った 字まで 入って 偽の 緑） */
  /* kuraKaku＝倉庫に 当たる 時刻（null＝返事の 半分）／saveDame＝次の N本の 保存を 倉庫が 断る（つながらない） */
  const okuruKura = (kind, v) => {
    const c = JSON.parse(JSON.stringify(v));
    const d = kuraOsoi.v;
    const w = kuraKaku.v == null ? d / 2 : kuraKaku.v;
    const dame = kind === 'save' && saveDame.v > 0 ? (saveDame.v--, true) : false;
    if (kind === 'save' && saveKienai.v > 0) { saveKienai.v--; LOG.push('save 返事 無し'); return new Promise(() => {}); }
    return new Promise((res) => {
      let r = null;
      setTimeout(() => { r = dame ? (LOG.push('save 断る'), { ok: false, reason: 'クラウドに つながりません' }) : ataru(kind, c); }, w);
      setTimeout(() => res(r), Math.max(d, w));
    });
  };
  S.invoices = []; S.receipts = []; S.fil = 'all'; S.docType = 'invoice';
  S.store = {
    partners: { list: () => Promise.resolve(S.partners), gone: () => Promise.resolve([]), create: () => Promise.resolve({ ok: false }) },
    invoices: {
      /* ★読み直しは 呼んだ 時の 倉庫を 読み、返事は listOsoi 後★（読み直しが 遅いと 後で 通った 保存を 古い 行で 上書きした・taiketsu 6回 止1） */
      list: (k) => { const yomu = k === 'quote' ? [] : JSON.parse(JSON.stringify(kura)); return listOsoi.v ? new Promise((res) => setTimeout(() => res(yomu), listOsoi.v)) : Promise.resolve(yomu); },
      usedNos: () => Promise.resolve(kura.map((x) => x.no)),
      saveDraft: (v) => okuruKura('save', v),
      issue: (row, at) => okuruKura('issue', Object.assign({}, row, { status: 'issued', issued_at: at })),
      /* ★本物と 同じく id と 下書きで 消す・0行でも ok（seikyu-store.js removeDraft）・遅い★ */
      removeDraft: (id) => new Promise((res) => {
        setTimeout(() => { const i = kura.findIndex((x) => x.id === id && x.status === 'draft'); LOG.push('remove ' + id + ' ' + (i >= 0 ? '1行' : '0行')); if (i >= 0) kura.splice(i, 1); }, kuraOsoi.v / 2);
        setTimeout(() => res({ ok: true }), kuraOsoi.v);
      }),
      markSent: () => Promise.resolve({ ok: true }),
    },
    org: { save: (p) => Promise.resolve({ ok: true, data: Object.assign({}, S.org, p) }) },
    receipts: { list: () => Promise.resolve([]) },
  };
  A._bindForTest();
  await A._loadList();
  const $ = (id) => doc.getElementById(id);
  const utsu = (el, val) => { el.value = val; el.dispatchEvent(new win.Event('input', { bubbles: true })); el.dispatchEvent(new win.Event('change', { bubbles: true })); };
  const t = {
    win, doc, A, S, $, kura, LOG, kuraOsoi, hakkoDame, kuraKaku, saveDame, saveKienai, listOsoi,
    hajime: async (kin) => {
      A._new();
      $('e-partner').value = 'pB';
      ok($('e-partner').value === 'pB', '★相手の 選びに pB が 無い★（空振り）');
      $('e-partner').dispatchEvent(new win.Event('change', { bubbles: true }));
      await nemuru(30);
      const tr = doc.querySelector('#lines-body tr');
      utsu(tr.querySelector('[data-f="name"]'), 'Q品'); { const q = tr.querySelector('[data-f="qty"]'); if (q) utsu(q, '1'); } utsu(tr.querySelector('[data-f="price"]') || tr.querySelector('[data-f="amount"]'), String(kin));
    },
    tanka: (kin) => utsu(doc.querySelector('#lines-body tr [data-f="price"]'), String(kin)),
    ochita: () => [$('edit-ochita'), $('list-ochita')].map((e) => (e && e.style.display !== 'none') ? e.textContent : '').join(''),
    /* ★待つ 間ずっと 見る★（偽の 知らせが 出て 後で 消える 道を 最後だけ 見て 緑に しない） */
    matsuMiru: async (ms) => {
      const deta = [];
      for (let k = 0; k < ms; k += 100) { await nemuru(100); const o = t.ochita(); if (o && deta.indexOf(o) < 0) deta.push(o); }
      return deta.join(' / ');
    },
    /* ★倉庫の B商店★＝何通・どれが 発行済みか・単価 */
    b: () => kura.filter((x) => x.partner_id === 'pB').map((x) => x.status + ':' + x.no + ':' + ((x.lines[0] || {}).price)),
  };
  return t;
}


const MICHI = [];
const michi = (na, fn) => MICHI.push([na, fn]);
const kenmei = (t, s) => { const e = t.$('e-subject'); e.value = s; e.dispatchEvent(new t.win.Event('input', { bubbles: true })); e.dispatchEvent(new t.win.Event('change', { bubbles: true })); };
const tanka = (t) => t.doc.querySelector('#lines-body tr [data-f="price"]').value;

console.log('\n[biko-erabi] 発行済みで 様式を 選び直したら 紙の 列も その様式' + (SELF ? '（自分ためし）' : ''));
const retsu = (t) => (t.A._colsForTest().items || []).join(',');
const setPt = (t, tpl) => { const p = t.S.partners.find((x) => x.id === 'pB'); p.data = Object.assign({}, p.data, { paper: Object.assign({}, p.data.paper || {}, { template: tpl }) }); };
const oshu = async (t, sel) => { const b = t.doc.querySelector(sel); ok(b, '★押す 物が 無い★ ' + sel); b.dispatchEvent(new t.win.MouseEvent('click', { bubbles: true })); await nemuru(100); };
const shuseiDe = async (t) => { t.A._go('scr-list'); await t.A._loadList(); await nemuru(50); await oshu(t, '[data-open]'); };
const kakunin = async (t) => { t.A._go('scr-list'); await t.A._loadList(); await nemuru(50); await oshu(t, '[data-look]'); const f = t.$('lv'); return String((f && f.srcdoc) || ''); };
const matome = async (t) => { await oshu(t, '.bn[data-scr="scr-bill"]'); await nemuru(200); const f = t.doc.querySelector('#scr-bill iframe'); return String((f && f.srcdoc) || ''); };
/* 紙の 見出しに 備考の 列が 在るか（備考欄の 字では なく 列の 見出し） */
const bikoRetsu = (html) => /<th[^>]*>\s*備考\s*<\/th>/.test(html);
const hakkoSumi = async (tpl) => {
  const t = await tateru();
  setPt(t, tpl);
  await t.hajime(7000); await nemuru(1800);
  t.kuraOsoi.v = 100; await t.A._issue(); await nemuru(500);
  ok(t.S.cur.status === 'issued', '★前置き：発行されていない★ ' + t.LOG.join(' | '));
  return t;
};
/* ★客の 道★ 発行済みを「修正」で 開く →「この取引先の紙を変える」→ 様式を 選ぶ → 下タブの「入力」で 戻る */
const erabiNaosu = async (t, tpl) => {
  await shuseiDe(t);
  await oshu(t, '#b-tpl-pt');
  const sel = t.$('s-ptpl'); ok(sel, '★取引先の 様式の 欄が 無い★');
  ok([...sel.options].some((o) => o.value === tpl), '★様式の 欄に ' + tpl + ' が 無い★');
  sel.value = tpl; sel.dispatchEvent(new t.win.Event('change', { bubbles: true })); await nemuru(50);
  await oshu(t, '.bn[data-scr="scr-edit"]');
  await nemuru(1800);                        /* 当てた 様式が 自動で しまわれる */
};
michi('①発行済みを 修正で 開き「この取引先の紙を変える」で 備考なしを 選んで 戻る＝紙の 列に 備考が 無い・札も 同じ・倉庫に 入る', async () => {
  const t = await hakkoSumi('koujomemo');
  eq(retsu(t), '項目,数量,単位,金額,消費税,備考', '★前置き：発行の 時の 列が 違う★');
  await erabiNaosu(t, 'koujo');
  eq(t.S.cur.template_id, 'koujo', '★その 1通の 様式が 選んだ 物に ならない★');
  eq(retsu(t), '項目,金額', '★選び直したのに 紙の 列が 控除の 様式に ならない★ ' + retsu(t));
  ok(/項目と金額だけ/.test(t.$('tpl-strip-v').textContent), '★上の 札が 選んだ 様式で ない★ ' + t.$('tpl-strip-v').textContent);
  const x = t.kura.find((r) => r.partner_id === 'pB');
  eq(x.template_id + '|' + ((x.data || {}).tplErabi || ''), 'koujo|koujo', '★選び直しが 倉庫に 入っていない★ ' + t.LOG.join(' | '));
});
michi('②①の 後に 一覧の「確認」と 請求/集計の 紙＝どちらも 備考の 列が 無い（出口で 紙が 違わない）', async () => {
  const t = await hakkoSumi('koujomemo');
  await erabiNaosu(t, 'koujo');
  const h1 = await kakunin(t);
  ok(h1.length > 0, '★前置き：確認の 紙が 出ていない★');
  ok(!bikoRetsu(h1), '★一覧の「確認」の 紙に 備考の 列が 残った★');
  t.A._go('scr-list');
  const h2 = await matome(t);
  ok(h2.length > 0, '★前置き：請求/集計の 紙が 出ていない★');
  ok(!bikoRetsu(h2), '★請求/集計の 紙に 備考の 列が 残った★');
});
michi('③発行済みの 1通から 来ずに 設定だけ 変えた＝過去の 発行済みは 発行した 時の 紙の まま（勝手に 変えない）', async () => {
  const t = await hakkoSumi('koujomemo');
  setPt(t, 'koujo');                         /* 設定 ▸ 取引先 で 変えた（修正から では ない） */
  await shuseiDe(t);
  eq(t.S.cur.template_id, 'koujomemo', '★選び直していない 発行済みの 様式が 変わった★');
  eq(retsu(t), '項目,数量,単位,金額,消費税,備考', '★選び直していない 発行済みの 紙の 列が 変わった★');
  ok(/備考/.test(t.$('tpl-strip-v').textContent), '★上の 札が 発行済みの 様式で ない★ ' + t.$('tpl-strip-v').textContent);
  ok(bikoRetsu(await kakunin(t)), '★確認の 紙が 発行した 時の 紙で ない★');
});
michi('④発行済みで 備考なし→「備考あり」に 選び直す＝紙の 列に 備考が 出る', async () => {
  const t = await hakkoSumi('koujo');
  eq(retsu(t), '項目,金額', '★前置き：発行の 時の 列が 違う★');
  await erabiNaosu(t, 'koujomemo');
  ok(/備考/.test(retsu(t)), '★選び直したのに 備考の 列が 出ない★ ' + retsu(t));
});
michi('⑤下書きは 今まで通り（設定の 様式に その場で 合う）', async () => {
  const t = await tateru();
  setPt(t, 'koujomemo');
  await t.hajime(7000); await nemuru(1800);
  setPt(t, 'koujo');
  await shuseiDe(t);
  eq(retsu(t), '項目,金額', '★下書きが 設定の 様式に 合わない★');
});

/* ★taiketsu 10-29 2回目★ 客の 道の 違い（発行した 直後の 画面から／設定から 一覧の「修正」で 開き直して） */
const erabuDake = async (t, tpl) => {
  await oshu(t, '#b-tpl-pt');
  const sel = t.$('s-ptpl');
  sel.value = tpl; sel.dispatchEvent(new t.win.Event('change', { bubbles: true })); await nemuru(50);
};
const atattaKa = (t) => {
  eq(t.S.cur.status, 'issued', '★戻った 画面が 発行済みの 1通で ない（白紙が 開いた）★');
  eq(t.S.cur.template_id, 'koujo', '★その 1通に 選んだ 様式が 当たらない★');
  eq(retsu(t), '項目,金額', '★紙の 列が 選んだ 様式に ならない★');
  const x = t.kura.find((r) => r.partner_id === 'pB' && r.status === 'issued');
  eq(x.template_id + '|' + ((x.data || {}).tplErabi || ''), 'koujo|koujo', '★選び直しが 倉庫に 入っていない★ ' + t.LOG.join(' | '));
};
michi('⑥発行した 直後の 画面から「この取引先の紙を変える」→ 備考なし →「入力」＝白紙で なく その 1通に 当たる', async () => {
  const t = await hakkoSumi('koujomemo');
  await erabuDake(t, 'koujo');
  await oshu(t, '.bn[data-scr="scr-edit"]'); await nemuru(1800);
  atattaKa(t);
});
michi('⑦「この取引先の紙を変える」→ 備考なし → 一覧の「修正」で 開き直す＝その 1通に 当たる', async () => {
  const t = await hakkoSumi('koujomemo');
  await shuseiDe(t);
  await erabuDake(t, 'koujo');
  await shuseiDe(t); await nemuru(1800);
  atattaKa(t);
});
michi('⑧「この取引先の紙を変える」の 後に 別の 1通を 開いた＝覚えは 捨てる（後で 戻っても 当たらない）', async () => {
  const t = await hakkoSumi('koujomemo');
  await shuseiDe(t);
  await erabuDake(t, 'koujo');
  t.A._go('scr-list'); t.A._new(); await nemuru(50);   /* 別の 1通（新しい 白紙） */
  eq(t.S.tplErabi || null, null, '★別の 1通を 開いても 覚えが 残った★');
});
michi('⑨取り消し済みの 札は「取り消し済み」と 言う', async () => {
  const t = await hakkoSumi('koujomemo');
  t.S.cur.status = 'void'; t.A._fillEdit(); await nemuru(50);
  ok(/取り消し済み/.test(t.$('tpl-strip-why').textContent), '★取り消し済みを「発行済み」と 言った★ ' + t.$('tpl-strip-why').textContent);
});

/* ★taiketsu 10-29 3回目 止A★ 客の 1通そのもの＝取引先の 紙は もう 備考なしで 保存済み・1通は 備考ありで 発行済み
   ＝「この取引先の紙を変える」で 同じ 物を 選んでも change が 起きない ⇒ 札の 釦で その場で 当てる */
const ateruBtn = (t) => t.$('b-tpl-ateru');
const mieru = (el) => !!el && el.style.display !== 'none';
michi('⑩取引先の 紙は もう 備考なし・1通は 備考ありで 発行済み＝札に「この1通も…にする」が 出て、押すと 紙・倉庫に 当たる', async () => {
  const t = await hakkoSumi('koujomemo');
  setPt(t, 'koujo');                         /* 前に 取引先の 紙だけ 保存された（凍結で 1通には 入らなかった） */
  await shuseiDe(t);
  /* 同じ 物を 選んでも ブラウザは change を 出さない＝欄が もう 備考なしなのを 見て そのまま 戻る（jsdom で change を 投げると 起きない 事が 起きる） */
  await oshu(t, '#b-tpl-pt');
  eq(t.$('s-ptpl').value, 'koujo', '★前置き：取引先の 欄が 保存した 紙で ない★');
  await oshu(t, '.bn[data-scr="scr-edit"]'); await nemuru(300);
  eq(t.S.cur.template_id, 'koujomemo', '★前置き：押す 前から 当たっている★');
  const b = ateruBtn(t);
  ok(mieru(b), '★取引先の 今の紙と 違うのに 当てる 釦が 出ない★ ' + t.$('tpl-strip-why').textContent);
  eq(b.textContent, 'この1通も この取引先の紙にする', '★ボタンの 字★');
  ok(/今の紙は「項目と金額だけ/.test(t.$('tpl-strip-why').textContent), '★札が 取引先の 今の紙を 言わない★ ' + t.$('tpl-strip-why').textContent);
  await oshu(t, '#b-tpl-ateru'); await nemuru(1800);
  atattaKa(t);
  ok(!mieru(ateruBtn(t)), '★当てた 後も 釦が 残る★');
  ok(!bikoRetsu(await kakunin(t)), '★当てた 後の「確認」の 紙に 備考の 列が 残った★');
});
michi('⑫自動の しまいの 返事を 待つ 間に「この1通も…」を 押す＝選んだ 紙が 倉庫に 入る（中身が 同じと 見て 印を 降ろさない）', async () => {
  const t = await hakkoSumi('koujomemo');
  setPt(t, 'koujo');
  await shuseiDe(t);
  t.kuraOsoi.v = 4000;                       /* 返事は 送ってから 4秒 後 */
  { const tr = t.doc.querySelector('#lines-body tr'); const el = tr.querySelector('[data-f="price"]') || tr.querySelector('[data-f="amount"]'); ok(el, '★前置き：金額の 欄が 無い★'); el.value = '8000'; el.dispatchEvent(new t.win.Event('input', { bubbles: true })); el.dispatchEvent(new t.win.Event('change', { bubbles: true })); }
  await nemuru(4500);          /* 1.5秒 待って 送った＋3秒＝返事の 1秒 前に 押す（押した 後の 予約は 返事の 後に 走る） */
  ok(mieru(ateruBtn(t)), '★前置き：ボタンが 出ていない★');
  await oshu(t, '#b-tpl-ateru');
  await nemuru(9000);
  const x = t.kura.find((r) => r.partner_id === 'pB' && r.status === 'issued');
  eq(x.template_id + '|' + ((x.data || {}).tplErabi || ''), 'koujo|koujo', '★返事待ちに 押した 紙が 倉庫に 入らない★ ' + t.LOG.join(' | '));
  ok(/8000/.test(JSON.stringify(x.lines[0] || {})), '★前置き：金額の 直しが 倉庫に 無い★ ' + JSON.stringify(x.lines[0]));
});
michi('⑪当てる 釦は 要らない時に 出ない（下書き・取引先の 紙と 同じ 発行済み）', async () => {
  const t = await tateru();
  setPt(t, 'koujomemo');
  await t.hajime(7000); await nemuru(300);
  ok(!mieru(ateruBtn(t)), '★下書きに 当てる 釦が 出た★');
  t.kuraOsoi.v = 100; await t.A._issue(); await nemuru(500);
  await shuseiDe(t);
  ok(!mieru(ateruBtn(t)), '★取引先の 紙と 同じ 発行済みに 当てる 釦が 出た★');
  eq(t.S.cur.template_id, 'koujomemo', '★押していないのに 様式が 変わった★');
});
/* ★taiketsu 10-30 止1★ 前の 作りで 名前だけ ずれて しまわれた 1通＝template_id は 取引先の 今の紙・写しは 発行の 時の 紙・印 無し
   ＝名前で 比べると「もう 当たっている」に 見えて 釦が 出ず、選び直しても 当たらず、札は「選び直すと 当たります」と 言っていた */
michi('⑬名前だけ ずれて しまわれた 発行済み（印 無し）＝札は 写しの 紙を 言い、釦が 出て、押すと 紙・倉庫に 当たる', async () => {
  const t = await hakkoSumi('koujomemo');
  setPt(t, 'koujo');
  const x0 = t.kura.find((r) => r.partner_id === 'pB' && r.status === 'issued');
  x0.template_id = 'koujo';                  /* 前の tplSync が 名前だけ 書き換えて しまった 形（印は 無い） */
  ok(!(x0.data && x0.data.tplErabi), '★前置き：印が 付いている★');
  await shuseiDe(t);
  eq(t.S.cur.template_id, 'koujo', '★前置き：ずれた 名前で 開いていない★');
  eq(retsu(t), '項目,数量,単位,金額,消費税,備考', '★前置き：写しの 列で ない★');
  ok(!/項目と金額だけ/.test(t.$('tpl-strip-v').textContent), '★札が ずれた 名前（今 効いていない 紙）を 言う★ ' + t.$('tpl-strip-v').textContent);
  ok(mieru(ateruBtn(t)), '★写しの 紙と 取引先の 今の紙が 違うのに 当てる 釦が 出ない★ ' + t.$('tpl-strip-why').textContent);
  await oshu(t, '#b-tpl-ateru'); await nemuru(1800);
  atattaKa(t);
  ok(!bikoRetsu(await kakunin(t)), '★当てた 後の「確認」の 紙に 備考の 列が 残った★');
});
michi('⑭名前だけ ずれた 1通を「この取引先の紙を変える」で 選び直して 戻る＝その 1通に 当たる', async () => {
  const t = await hakkoSumi('koujomemo');
  const x0 = t.kura.find((r) => r.partner_id === 'pB' && r.status === 'issued');
  x0.template_id = 'koujo';
  await erabiNaosu(t, 'koujo');
  atattaKa(t);
});

/* ★taiketsu 10-30 任意A・止1・止2★ 選び直した 時の 列を その 1通に 固める（data.cols でなく data.erabiCols） */
const setPtCols = (t, items) => { const p = t.S.partners.find((x) => x.id === 'pB'); p.data.paper = Object.assign({}, p.data.paper, { cols: { items }, colsTpl: 'koujo' }); };
const ateruDe = async (t) => {
  const t0 = await hakkoSumi('koujomemo');
  setPt(t0, 'koujo');
  await shuseiDe(t0);
  await oshu(t0, '#b-tpl-ateru'); await nemuru(1800);
  atattaKa(t0);
  return t0;
};
michi('⑮当てた 後に 取引先の 列を 変えても、その 1通の 紙の 列は 動かない（倉庫にも 固めた 列）', async () => {
  const t = await ateruDe();
  setPtCols(t, ['項目', '数量', '金額']);
  await shuseiDe(t);
  eq(retsu(t), '項目,金額', '★当てた 後に 取引先の 列を 変えたら 出した 紙の 列が 動いた★');
  const x = t.kura.find((r) => r.partner_id === 'pB' && r.status === 'issued');
  eq(((((x.data || {}).erabiCols || {}).cols || {}).items || []).join(','), '項目,金額', '★固めた 列が 倉庫に 無い★ ' + JSON.stringify(x.data));
});
michi('⑯当てた 1通を 複製 → 取引先の 列を 変えた＝新しい 下書きは 取引先の 今の 列（固めた 列が 流れ込まない）', async () => {
  const t = await ateruDe();
  setPtCols(t, ['項目', '数量', '金額']);
  t.A._duplicateForTest(); await nemuru(300);
  eq(t.S.cur.status || 'draft', 'draft', '★前置き：複製が 下書きで ない★');
  eq(retsu(t), '項目,数量,金額', '★複製した 下書きに 固めた 列が 流れ込んだ★ ' + retsu(t));
});
michi('⑰取引先が 読めなかった 時は 当てる 釦を 出さず、当てない（違う 紙を 固めない）', async () => {
  const t = await hakkoSumi('koujomemo');
  setPt(t, 'koujo');
  await shuseiDe(t);
  ok(mieru(ateruBtn(t)), '★前置き：釦が 出ていない★');
  t.S.partnersReadOk = false; t.A._fillEdit(); await nemuru(50);
  ok(!mieru(ateruBtn(t)), '★取引先が 読めないのに 当てる 釦が 出た★');
  await oshu(t, '#b-tpl-ateru'); await nemuru(1800);
  eq(t.S.cur.template_id, 'koujomemo', '★取引先が 読めないのに 当てた★');
});
michi('⑱自社が 読めなかった 時も 当てる 釦を 出さず、当てない', async () => {
  const t = await hakkoSumi('koujomemo');
  setPt(t, 'koujo');
  await shuseiDe(t);
  ok(mieru(ateruBtn(t)), '★前置き：釦が 出ていない★');
  t.S.orgReadOk = false; t.A._fillEdit(); await nemuru(50);
  ok(!mieru(ateruBtn(t)), '★自社が 読めないのに 当てる 釦が 出た★');
  await oshu(t, '#b-tpl-ateru'); await nemuru(1800);
  eq(t.S.cur.template_id, 'koujomemo', '★自社が 読めないのに 当てた★');
});

/* ★taiketsu 10-30 2回目 控え★ 様式を 選び直した 見積・古い 1通を 請求書・複製に すると 備考の 列が 出た
   （受け側が 印の 無い 列に 今の 様式の 印を 当てていた・convertQuoteToInvoice は 印を 落としていた） */
const KOUJOMEMO = { items: ['項目', '数量', '単位', '金額', '消費税', '備考'] };
const mitsumori = (data) => ({ id: 'q1', doc_type: 'quote', status: 'issued', no: 'Q-0001', partner_id: 'pB', issue_ymd: '2026-10-01',
  template_id: 'koujo', tax_mode: 'exclusive', rounding: 'floor', lines: [{ name: 'Q品', qty: 1, price: 7000, amount: 7000 }],
  totals: {}, snapshot: { templateId: 'koujo' }, data });
const seikyuNi = async (data, snap, tpl) => {
  const t = await tateru();
  setPt(t, tpl || 'koujo');
  t.S.docType = 'quote'; t.S.cur = mitsumori(data);
  if (snap) t.S.cur.snapshot = snap;
  if (tpl) t.S.cur.template_id = tpl;
  t.A._fillEdit(); await nemuru(50);
  const mae = retsu(t);
  if (!tpl) ok(mae.indexOf('備考') < 0, '★前置き：見積の 紙に 備考が 在る★ ' + mae);
  await oshu(t, '#b-toinv'); await nemuru(600);
  eq(t.S.cur.doc_type, 'invoice', '★前置き：請求書に なっていない★');
  return { t, mae };
};
michi('⑲様式を 選び直した 見積（列の 印が 古い 様式）を 請求書に＝見積の 紙と 同じ 列（備考が 出ない）', async () => {
  const { t, mae } = await seikyuNi({ cols: KOUJOMEMO, colsTpl: 'koujomemo' });
  eq(retsu(t), mae, '★見積に 無い 備考の 列が 請求書に 出た★');
});
/* ★選び直した 紙★＝備考つき（koujomemo）で 出した 後に「備考なし」（koujo）を 選んで 当てた（印 tplErabi・写しの 様式は koujomemo のまま）。
   列は 10-23 より前の 物で 印が 無い */
const erabiNaoshita = (data) => Object.assign(data, { tplErabi: 'koujo' });
const ERABI_SNAP = { templateId: 'koujomemo', cols: KOUJOMEMO };
michi('⑳様式を 選び直した 古い 見積（列の 印 無し）を 請求書に＝見積の 紙と 同じ 列（備考が 出ない）', async () => {
  const { t, mae } = await seikyuNi(erabiNaoshita({ cols: KOUJOMEMO }), ERABI_SNAP);
  eq(retsu(t), mae, '★見積に 無い 備考の 列が 請求書に 出た★');
});
michi('㉑見積の 様式の 為の 列は 請求書へ そのまま 持っていく（印も 写す）', async () => {
  const { t } = await seikyuNi({ cols: { items: ['項目', '金額', '消費税'] }, colsTpl: 'koujo' });
  eq(t.S.cur.data.colsTpl, 'koujo', '★列の 印が 写っていない★');
  eq(retsu(t), '項目,金額,消費税', '★見積で 選んだ 列が 落ちた★');
});
const fukusei = async (data, snap, tpl) => {
  const t = await tateru();
  setPt(t, tpl);
  t.S.cur = Object.assign(mitsumori(data), { id: 'i1', doc_type: 'invoice', no: 'B-0001', template_id: tpl, snapshot: snap });
  t.A._fillEdit(); await nemuru(50);
  const mae = retsu(t);
  t.A._duplicateForTest(); await nemuru(300);
  eq(t.S.cur.status || 'draft', 'draft', '★前置き：複製が 下書きで ない★');
  return { t, mae };
};
michi('㉒様式を 選び直した 古い 1通（列の 印 無し）を 複製＝今の 様式の 列（備考つきの 古い 列が 出ない）', async () => {
  const { t } = await fukusei(erabiNaoshita({ cols: KOUJOMEMO }), ERABI_SNAP, 'koujo');
  ok(retsu(t).indexOf('備考') < 0, '★様式は 備考なしなのに 複製に 備考の 列が 出た★ ' + retsu(t));
});
/* ★taiketsu 10-31 止1★ 10-23 より前に 出した 紙は 写しの列＝印の 無い data.cols＝手で 足した 列（現場名）を 落とさない */
const GENBAMEI = { items: ['#', '品名・内容', '現場名', '数量', '単位', '単価', '金額', '消費税'] };
const genbaLines = (t) => { t.S.cur.lines = [{ name: 'Q品', qty: 1, price: 7000, amount: 7000, extra: { 現場名: 'A邸' } }]; };
michi('㉓10-23 より前に 出した 見積（手で 足した 現場名・印 無し）を 請求書に＝現場名の 列が 残る', async () => {
  const { t, mae } = await seikyuNi({ cols: GENBAMEI }, { templateId: 'std1', cols: GENBAMEI }, 'std1');
  ok(mae.indexOf('現場名') >= 0, '★前置き：見積の 紙に 現場名が 無い★ ' + mae);
  eq(retsu(t), mae, '★見積で 足した 現場名の 列が 請求書で 消えた★');
});
michi('㉔10-23 より前に 出した 請求書（手で 足した 現場名・印 無し）を 複製＝現場名の 列が 残る', async () => {
  const { t, mae } = await fukusei({ cols: GENBAMEI }, { templateId: 'std1', cols: GENBAMEI }, 'std1');
  ok(mae.indexOf('現場名') >= 0, '★前置き：元の 紙に 現場名が 無い★ ' + mae);
  eq(retsu(t), mae, '★元の 紙の 現場名の 列が 複製で 消えた★');
});

if (!SELF) {
  for (const [na, fn] of MICHI) await T(na, fn);
} else {
  const app = fs.readFileSync(path.join(ROOT, 'seikyu', 'js', 'seikyu-app.js'), 'utf8').replace(/\r\n/g, '\n');
  const kowasu = [
    ['戻っても その 1通に 当てない', '    if (!m.erabi) return;\n', '    return;\n', '①'],
    ['取引先の 様式を 選んでも 印を 付けない', "        if (id === 's-ptpl' && S.tplErabi && S.tplErabi.pid === pp.id) S.tplErabi.erabi = true;", '', '①'],
    ['印を 見ず 写しの 列を 使う（確認・まとめ出し）', '    var erabiNaoshi = !!(snapTpl && v.template_id && v.data && v.data.tplErabi === v.template_id && snapTpl !== v.template_id);', '    var erabiNaoshi = false;', '②'],
    ['発行済みにも 設定の 様式を 当てる（過去の 紙が 変わる）', "    if (v.status && v.status !== 'draft') return;\n", '', '③'],
    ['当てる 釦を 出さない', '      show(ab, !!saki);', '      show(ab, false);', '⑩'],
    ['当てる 釦を 押しても 当てない', '      tplAteru(v, t);\n      renderTplAsk();', '      renderTplAsk();', '⑩'],
    ['当てる 釦を いつも 出す', '      show(ab, !!saki);', '      show(ab, true);', '⑪'],
    ['釦を 出すかを 名前で 比べる（ずれた 1通に 釦が 出ない）', '    return (t && t !== tplKiku(v)) ? t : null;', '    return (t && t !== v.template_id) ? t : null;', '⑬'],
    ['選び直しを 名前で 比べる（ずれた 1通に 当たらない）', '    if (!t || t === tplKiku(v)) return;\n    tplAteru(v, t);', '    if (!t || t === v.template_id) return;\n    tplAteru(v, t);', '⑭'],
    ['選び直した 時の 列を 固めない', '    if (snapTpl && snapTpl !== t) v.data.erabiCols = { tpl: t, cols: colsSaki(v.partner_id, t) };', '    if (false) v.data.erabiCols = null;', '⑮'],
    ['固めた 列を 紙で 読まない（倉庫に 在っても 今の 列で 刷る）', '    if (ec && ec.tpl === v.template_id && ec.cols && Array.isArray(ec.cols.items) && ec.cols.items.length) return COLS.normalizeSpec(ec.cols);\n', '', '⑮'],
    ['固める 先を data.cols に する（複製に 流れ込む）', '    if (snapTpl && snapTpl !== t) v.data.erabiCols = { tpl: t, cols: colsSaki(v.partner_id, t) };', '    if (snapTpl && snapTpl !== t) { v.data.cols = colsSaki(v.partner_id, t); v.data.colsTpl = t; }', '⑯'],
    ['取引先が 読めなくても 当てる', '    return S.partnersReadOk !== false && S.orgReadOk !== false && !!partnerById(v.partner_id);', '    return S.orgReadOk !== false && !!partnerById(v.partner_id);', '⑰'],
    ['自社が 読めなくても 当てる', '    return S.partnersReadOk !== false && S.orgReadOk !== false && !!partnerById(v.partner_id);', '    return S.partnersReadOk !== false && !!partnerById(v.partner_id);', '⑱'],
    ['見積の 印の 無い 列に 今の 様式の 印を 当てる（前の 作り）', '      var shq = utsushiShirushi(q);\n      if (shq) S.cur.data.colsTpl = shq; else delete S.cur.data.cols;', '      S.cur.data.colsTpl = q.template_id;', '⑳'],
    ['写しの 様式を 見ず 今の 様式を 印に する', "    return (src.snapshot && src.snapshot.templateId) || src.template_id || null;", '    return src.template_id || null;', '⑳'],
    ['見積の 印の 無い 列を 捨てる（手で 足した 列が 消える・taiketsu 10-31 止1）', '      var shq = utsushiShirushi(q);\n      if (shq) S.cur.data.colsTpl = shq; else delete S.cur.data.cols;', '      delete S.cur.data.cols;', '㉓'],
    ['見積の 列を 全部 捨てる（選んだ 列が 落ちる）', '    if (S.cur.data.cols && !S.cur.data.colsTpl) {\n      var shq', '    delete S.cur.data.cols;\n    if (false) {\n      var shq', '㉑'],
    ['複製の 印の 無い 列に 今の 様式の 印を 当てる（前の 作り）', '      var shd = utsushiShirushi(src);\n      if (shd) S.cur.data.colsTpl = shd; else delete S.cur.data.cols;', '      S.cur.data.colsTpl = src.template_id;', '㉒'],
    ['複製の 印の 無い 列を 捨てる（手で 足した 列が 消える）', '      var shd = utsushiShirushi(src);\n      if (shd) S.cur.data.colsTpl = shd; else delete S.cur.data.cols;', '      delete S.cur.data.cols;', '㉔'],
    ['送った 中身の 比べに 様式を 入れない', '[v.no, nakamiKata(v), v.template_id || null, (v.data && v.data.tplErabi) || null]', '[v.no, nakamiKata(v)]', '⑫'],
  ];
  for (const [na, a, b, mi] of kowasu) {
    await T('壊すと 赤: ' + na, async () => {
      ok(app.split(a).length === 2, '★壊す所が 1つ 見つからない★ … ' + a);
      const m = MICHI.find(([n]) => n.startsWith(mi));
      ok(m, '★見張る 道が 無い★ ' + mi);
      APP_KAE = app.replace(a, b);
      try { new Function(APP_KAE); } catch (e) { APP_KAE = null; throw new Error('★壊し方が 文に なっていない★ ' + e.message); }
      let aka = false;
      try { await m[1](); } catch (e) { aka = true; }
      APP_KAE = null;
      ok(aka, '★壊したのに ' + mi + ' が 緑のまま＝この 試験は 何も 見ていない★');
    });
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (pass + fail === 0) { console.log('★1本も 走っていない★'); process.exit(1); }
process.exit(fail ? 1 : 0);
