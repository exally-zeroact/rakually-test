/* furui-gyo.mjs — ★一覧の 古い 行から 開いて 金額を 書き戻さない★
 * =============================================================================
 * 2026-10-25 指示役（taiketsu の 叩きで 見つかった 前から 在る 穴・本番 e5940f0 にも 在った）
 *
 * ★本物の seikyu-app.js を jsdom で 動かして 踏んだ 道★（直す前）
 *   7000 で 打って 自動の しまい → 8000 に 直して 自動の しまい（倉庫は 8000）→ 下タブで 一覧 → 同じ 行の「修正」
 *   ＝★7000 で 開き★、件名を 1文字 直すだけで ★倉庫が 7000 に 戻った★（知らせ 0）
 *   訳＝自動の しまいは 静かに しまうので 一覧を 読み直さない／一覧から 開くと 手元の 古い 行の 写しで 開く
 *
 * ★決め★ 自動の しまいが 通ったら、手元の 一覧の その 行も 送った 中身に する（倉庫を 読み直したのと 同じ 姿）
 *   ・お金の 計算は 1文字も 変えない
 *
 * 使い方: node seikyu/tests/furui-gyo.mjs [--self-test] [--bu=1|2|3]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません。この検証は飛ばせません（SKIPを緑と呼ばない）。npm install してください。'); process.exit(1); }

const SELF = process.argv.includes('--self-test');
let pass = 0, fail = 0;
/* ★3つに 割って 回す★（--bu=1 / 2 / 3）＝1段 180秒の 網に 収める（全部で 約180秒・混んだ 機械で 1段 111秒を 見た）。--bu 無し＝全部 */
const BU = Number(((process.argv.find((a) => a.startsWith('--bu=')) || '').split('=')[1]) || 0);
const WARU = 3;
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
      utsu(tr.querySelector('[data-f="name"]'), 'Q品'); utsu(tr.querySelector('[data-f="qty"]'), '1'); utsu(tr.querySelector('[data-f="price"]'), String(kin));
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

console.log('\n[furui-gyo] 一覧の 古い 行から 開いて 金額を 書き戻さない' + (SELF ? '（自分ためし）' : ''));

const MICHI = [];
const michi = (na, fn) => MICHI.push([na, fn]);
const kenmei = (t, s) => { const e = t.$('e-subject'); e.value = s; e.dispatchEvent(new t.win.Event('input', { bubbles: true })); e.dispatchEvent(new t.win.Event('change', { bubbles: true })); };
const tanka = (t) => t.doc.querySelector('#lines-body tr [data-f="price"]').value;

michi('①自動の しまいで 直した 後に 下タブで 一覧へ→同じ 行を 開く＝直した 値（8000）で 開き・件名を 直しても 8000 の まま', async () => {
  const t = await tateru();
  await t.hajime(7000);
  await nemuru(1800);                        /* 7000 が 倉庫に 入る */
  await t.A._loadList();                     /* 一覧に 7000 の 行が 在る */
  t.tanka(8000);
  await nemuru(1800);                        /* 8000 が 自動で 倉庫に 入る（一覧は 読み直さない） */
  eq(JSON.stringify(t.b()), JSON.stringify(['draft:202610-001:8000']), '★前置き：8000 が 倉庫に 入っていない★ ' + t.LOG.join(' | '));
  const tab = t.doc.querySelector('.bn[data-scr="scr-list"]');
  if (tab) { tab.dispatchEvent(new t.win.MouseEvent('click', { bubbles: true })); await nemuru(300); } else t.A._go('scr-list');
  const b = t.doc.querySelector('[data-open]');
  ok(b, '★一覧に 開く 札が 無い★');
  b.dispatchEvent(new t.win.MouseEvent('click', { bubbles: true }));
  await nemuru(50);
  eq(tanka(t), '8000', '★一覧から 開くと 古い 値が 出た★');
  kenmei(t, '件名だけ');
  await nemuru(2000);
  eq(JSON.stringify(t.b()), JSON.stringify(['draft:202610-001:8000']), '★件名を 直すと 金額が 書き戻った★ ' + t.LOG.join(' | '));
});
michi('②一覧の 行の 金額も 直した 値＝一覧に 8000（税込み 8800）が 出る', async () => {
  const t = await tateru();
  await t.hajime(7000);
  await nemuru(1800);
  await t.A._loadList();
  t.tanka(8000);
  await nemuru(1800);
  const row = t.S.invoices.find((x) => x.partner_id === 'pB');
  ok(row, '★一覧に 行が 無い★');
  eq(String(((row.lines || [])[0] || {}).price), '8000', '★一覧の 行の 明細が 古い★');
  eq(Number((row.totals || {}).grandTotal), 8800, '★一覧の 行の 合計が 古い★');
  /* ★手元だけの 印は 一覧の 行に 入れない★（taiketsu 止2＝漏れると 開き直した 1通の「しまえた 中身」が 偽に なり、発行を 断られた 時の 知らせが 消えた） */
  ok(!Object.keys(row).some((k) => k.charAt(0) === '_'), '★一覧の 行に 手元だけの 印が 漏れた★ ' + Object.keys(row).filter((k) => k.charAt(0) === '_').join(','));
});
/* ★送った日時を 消さない★（taiketsu 止1＝丸ごと 重ねると 開いた 時の 古い 空で 上書きされ「まだ 渡していません」が 出た＝二重に 送らせ得る） */
michi('③渡した 発行済みを 開いて 直す＝自動の しまいの 後も 一覧の 行の 送った日時は 残る・「まだ 渡していません」が 出ない', async () => {
  const t = await tateru();
  await t.hajime(7000);
  await t.A._issue(); await nemuru(300);
  const x = t.kura.find((r) => r.partner_id === 'pB');
  ok(x && x.status === 'issued', '★前置き：発行されていない★ ' + t.LOG.join(' | '));
  x.sent_at = null; x.voided_at = null;      /* ★本物の 倉庫は 空の 列も null で 返す★（列が 無いと 丸ごと 重ねても 上書きされず 偽の 緑） */
  t.A._go('scr-list'); await t.A._loadList();
  const b = t.doc.querySelector('[data-open]');
  b.dispatchEvent(new t.win.MouseEvent('click', { bubbles: true }));  /* 渡す 前の 1通を 開いた まま */
  await nemuru(50);
  x.sent_at = '2026-10-26T01:00:00.000Z';    /* 請求/集計で 渡した 印（倉庫と 一覧の 両方に 入る） */
  const r0 = t.S.invoices.find((r) => r.id === x.id); r0.sent_at = x.sent_at;
  t.tanka(9000);
  await nemuru(1800);                        /* 発行済みの 中身を 自動で しまう */
  const row = t.S.invoices.find((r) => r.id === x.id);
  eq(String(((row.lines || [])[0] || {}).price), '9000', '★前置き：一覧の 行が 直っていない★ ' + t.LOG.join(' | '));
  eq(row.sent_at, '2026-10-26T01:00:00.000Z', '★一覧の 行の 送った日時が 消えた★');
  t.A._go('scr-list'); await t.A._loadList(); await nemuru(50);
  eq(t.doc.querySelectorAll('.iv-mada').length, 0, '★渡したのに「まだ 渡していません」★');
});
/* ★手で「保存」→ 返事の 前に 新しい 1通 → 一覧から 開き直す★（taiketsu 10-26 D）＝読み直しを 飛ばすので 古い 行で 開いた */
michi('④手で 保存して 返事の 前に 新しい 1通へ→一覧から 開く＝保存した 値（8000）で 開く', async () => {
  const t = await tateru();
  await t.hajime(7000);
  await nemuru(1800);
  await t.A._loadList();
  t.kuraOsoi.v = 1500;
  t.tanka(8000);
  const p = t.A._saveDraftForTest(); await nemuru(100);
  t.A._go('scr-list'); t.A._new();           /* 返事の 前に 新しい 1通 */
  await p; await nemuru(100);
  eq(JSON.stringify(t.b()), JSON.stringify(['draft:202610-001:8000']), '★前置き：8000 が 倉庫に 入っていない★ ' + t.LOG.join(' | '));
  t.kuraOsoi.v = 0;
  t.A._go('scr-list');
  const b = t.doc.querySelector('[data-open]');
  ok(b, '★一覧に 開く 札が 無い★');
  b.dispatchEvent(new t.win.MouseEvent('click', { bubbles: true }));
  await nemuru(50);
  eq(tanka(t), '8000', '★一覧から 開くと 保存の 前の 古い 値が 出た★');
});
/* ★返事を 待つ 間に 打った 字は 一覧の 行に 入れない★（taiketsu 2回 止1＝返事が 来た 時の 画面を 写すと、倉庫に 無い 番号・単価が 一覧に 入り、
   開き直して 件名を 直すと 偽の「取り消して 作り直して」が 出た） */
const kuraTo = (t) => {
  const x = t.kura.find((r) => r.partner_id === 'pB');
  const row = t.S.invoices.find((r) => r.id === x.id);
  return { x, row, kura: [x.no, String(((x.lines || [])[0] || {}).price), (x.data || {}).subject || ''].join('|'),
    gyo: row && [row.no, String(((row.lines || [])[0] || {}).price), (row.data || {}).subject || ''].join('|') };
};
michi('⑤発行済みを 手で 保存→返事を 待つ 間に 番号と 単価を 打つ→新しい 1通へ＝一覧の 行は 倉庫と 同じ（番号 202610-001・8000）', async () => {
  const t = await tateru();
  await t.hajime(7000);
  await t.A._issue(); await nemuru(300);       /* 発行済み＝番号を 変える しまいは 凍結で 断られる */
  t.A._go('scr-list'); await t.A._loadList();
  t.doc.querySelector('[data-open]').dispatchEvent(new t.win.MouseEvent('click', { bubbles: true }));
  await nemuru(50);
  ok(t.S.cur.status === 'issued', '★前置き：発行済みを 開いていない★');
  t.kuraOsoi.v = 1500;
  t.tanka(8000);
  const p = t.A._saveDraftForTest(); await nemuru(100);
  t.tanka(9000);
  const no = t.$('e-no'); if (no) { no.value = 'X-999'; no.dispatchEvent(new t.win.Event('input', { bubbles: true })); no.dispatchEvent(new t.win.Event('change', { bubbles: true })); }
  t.A._go('scr-list'); t.A._new();
  await p; await nemuru(100);
  const k = kuraTo(t);
  if (process.env.MIRU) console.log('    ⑤', JSON.stringify(k.gyo), JSON.stringify(k.kura), t.LOG.join(' | '), 'cur.no=' + t.S.cur.no);
  eq(k.gyo, k.kura, '★一覧の 行が 倉庫と 違う（返事を 待つ 間に 打った 字が 入った）★');
});
michi('⑥自動の しまいの 返事を 待つ 間に 件名を 打った＝一覧の 行の 件名は 倉庫と 同じ', async () => {
  const t = await tateru();
  await t.hajime(7000);
  await nemuru(1800);
  await t.A._loadList();
  t.kuraOsoi.v = 2000;
  t.tanka(8000);
  await nemuru(1600);                        /* 8000 の 自動の しまいを 送った 直後 */
  kenmei(t, '後で 打った 件名');
  await nemuru(2100);                        /* 8000 の 返事が 来る（3.5秒目）・件名の しまいは まだ 倉庫に 届かない（4.1秒目） */
  const k = kuraTo(t);
  eq(k.gyo, k.kura, '★一覧の 行が 倉庫と 違う（返事を 待つ 間に 打った 件名が 入った）★');
});
/* ★同じ 1通の 自動の しまいが 2本 出て 返事が 逆の 順に 着く★（taiketsu 3回 止1・前から 在る）
   ⑦ 返事が 逆＝一覧の 行が 古い 方（8000）で 上書きされ、開き直して 件名で 倉庫の 9000 を 8000 に 戻した
   ⑧ 倉庫に 当たる 順まで 逆＝倉庫 8000・画面 9000・打ちかけの 印 無し・送り直し 無し（知らせ 0）
   ⇒ 同じ 1通の しまいは 前の 返事の 後へ 並べる・一番 新しく 送った 分より 古い 返事は 一覧に 置かない */
const gyakuMichi = async (kaku8000) => {
  const t = await tateru();
  await t.hajime(7000);
  await nemuru(1800);
  await t.A._loadList();
  t.kuraKaku.v = kaku8000; t.kuraOsoi.v = 4000;   /* 8000 の しまい＝倉庫に 当たる 時刻を 決め・返事は 4秒 */
  t.tanka(8000);
  await nemuru(1600);                        /* 8000 を 送った（1.5秒目） */
  t.kuraKaku.v = null; t.kuraOsoi.v = 200;   /* 後の しまいは 速い */
  t.tanka(9000);
  await nemuru(8000);                        /* どちらの 返事も 着き、送り直しも 済む */
  return t;
};
michi('⑦自動の しまいの 返事が 逆の 順に 着く＝倉庫も 一覧の 行も 9000・開き直して 件名を 直しても 9000', async () => {
  const t = await gyakuMichi(100);
  eq(JSON.stringify(t.b()), JSON.stringify(['draft:202610-001:9000']), '★倉庫が 9000 で ない★ ' + t.LOG.join(' | '));
  const k = kuraTo(t);
  eq(k.gyo, k.kura, '★一覧の 行が 倉庫より 古い★ ' + t.LOG.join(' | '));
  t.A._go('scr-list');
  t.doc.querySelector('[data-open]').dispatchEvent(new t.win.MouseEvent('click', { bubbles: true }));
  await nemuru(50);
  eq(tanka(t), '9000', '★一覧から 開くと 古い 値が 出た★');
  kenmei(t, '件名だけ'); await nemuru(2000);
  eq(JSON.stringify(t.b()), JSON.stringify(['draft:202610-001:9000']), '★件名を 直すと 金額が 書き戻った★ ' + t.LOG.join(' | '));
});
michi('⑧倉庫に 当たる 順まで 逆＝倉庫は 最後に 打った 9000（黙って 8000 に 負けない）', async () => {
  const t = await gyakuMichi(3000);
  eq(JSON.stringify(t.b()), JSON.stringify(['draft:202610-001:9000']), '★倉庫が 古い 8000 に 負けた（画面は 9000）★ ' + t.LOG.join(' | '));
  eq(t.S.dirty, false, '★打ちかけの 印が 残った★');
});
/* ★手で 保存の 側の 直しが 要る 道★（taiketsu 3回＝移る 時の 自動の しまいが 落ちると、手で 保存の 返事だけが 一覧の 行を 直せる） */
michi('⑨手で 保存→返事の 前に 一覧へ（移る 時の 自動の しまいは 落ちる）→新しい 1通→開き直す＝保存した 8000 で 開く', async () => {
  const t = await tateru();
  await t.hajime(7000);
  await nemuru(1800);
  await t.A._loadList();
  t.kuraOsoi.v = 1500;
  t.tanka(8000);
  const p = t.A._saveDraftForTest(); await nemuru(100);
  t.saveDame.v = 1;                          /* 移る 時の 自動の しまいは つながらない */
  t.A._go('scr-list'); t.A._new();
  await p; await nemuru(2500);
  t.saveDame.v = 0; t.kuraOsoi.v = 0;
  eq(JSON.stringify(t.b()), JSON.stringify(['draft:202610-001:8000']), '★前置き：8000 が 倉庫に 入っていない★ ' + t.LOG.join(' | '));
  const k = kuraTo(t);
  eq(k.gyo, k.kura, '★一覧の 行が 倉庫と 違う（手で 保存の 返事で 直っていない）★');
  t.A._go('scr-list');
  t.doc.querySelector('[data-open]').dispatchEvent(new t.win.MouseEvent('click', { bubbles: true }));
  await nemuru(50);
  eq(tanka(t), '8000', '★一覧から 開くと 保存の 前の 古い 値が 出た★ ' + t.LOG.join(' | '));
});

/* ★taiketsu 4回★ 並べると 壊れた 道（並べるのを やめた）と、返事待ちの 開き直し */
michi('⑩自動の しまいの 返事を 待つ 間に 一覧から 同じ 1通を 開き直す＝打った 8000 で 開き・件名を 直しても 倉庫は 8000', async () => {
  const t = await tateru();
  await t.hajime(7000);
  await nemuru(1800);
  await t.A._loadList();
  t.kuraKaku.v = 100; t.kuraOsoi.v = 3000;     /* 8000 は すぐ 倉庫に 入るが 返事は 3秒 */
  t.tanka(8000);
  await nemuru(1700);                          /* 送った 直後 */
  t.A._go('scr-list');
  t.doc.querySelector('[data-open]').dispatchEvent(new t.win.MouseEvent('click', { bubbles: true }));
  await nemuru(50);
  eq(tanka(t), '8000', '★返事待ちに 開き直すと 古い 7000 で 開いた★');
  t.kuraKaku.v = null; t.kuraOsoi.v = 200;
  await nemuru(3500);
  kenmei(t, '件名だけ'); await nemuru(2000);
  eq(JSON.stringify(t.b()), JSON.stringify(['draft:202610-001:8000']), '★件名を 直すと 金額が 書き戻った★ ' + t.LOG.join(' | '));
});
michi('⑪自動の しまいの 返事を 待つ 間に 打ち足して 別の 1通へ＝打ち足した 9000 は 倉庫に 入る（黙って 消えない）', async () => {
  const t = await tateru();
  await t.hajime(7000);
  await nemuru(1800);
  await t.A._loadList();
  t.kuraOsoi.v = 3000;
  t.tanka(8000);
  await nemuru(1600);                          /* 8000 の 返事待ち */
  t.tanka(9000);
  t.A._go('scr-list'); t.A._new();             /* 別の 1通へ */
  await nemuru(4500);
  eq(JSON.stringify(t.b()), JSON.stringify(['draft:202610-001:9000']), '★打ち足した 9000 が 倉庫に 無い★ ' + t.LOG.join(' | '));
});
michi('⑫返事の 来ない しまいが 1本 在っても、後で 打った 字は しまわれる', async () => {
  const t = await tateru();
  await t.hajime(7000);
  await nemuru(1800);
  t.saveKienai.v = 1;
  t.tanka(8000);
  await nemuru(1700);                          /* 8000 の しまいは 返事が 来ない */
  t.tanka(9500);
  await nemuru(1800);
  eq(JSON.stringify(t.b()), JSON.stringify(['draft:202610-001:9500']), '★返事の 来ない 1本の 後ろで しまいが 止まった★ ' + t.LOG.join(' | '));
});

/* ★taiketsu 5回★ 保存の 返事を 待つ 間に 倉庫の 状態が 進んだ（発行・取り消し）＝遅れて 着いた 返事で 一覧の 行を 戻さない */
const torikesuKuchi = (t) => { t.S.store.invoices.voidIt = (id) => new Promise((res) => { setTimeout(() => { const r = t.kura.find((x) => x.id === id); if (r) r.status = 'void'; t.LOG.push('void ' + id); res({ ok: true }); }, 100); }); };
const gyoB = (t) => { const r = t.S.invoices.find((x) => x.partner_id === 'pB'); return r ? r.status + ':' + ((r.lines || [])[0] || {}).price : '(無し)'; };
const kuraB = (t) => { const x = t.kura.find((r) => r.partner_id === 'pB'); return x ? x.status + ':' + ((x.lines || [])[0] || {}).price : '(無し)'; };
const hirakuId = async (t, id) => { t.A._go('scr-list'); await nemuru(50); const b = t.doc.querySelector(id ? '[data-open="' + id + '"]' : '[data-open]'); ok(b, '★開く 札が 無い★ ' + id); b.dispatchEvent(new t.win.MouseEvent('click', { bubbles: true })); await nemuru(50); };
const Cno1tsu = (t) => t.kura.push({ id: 'drfC', doc_type: 'invoice', no: '202610-009', partner_id: 'pC', issue_ymd: '2026-10-26', status: 'draft', tax_mode: 'exclusive', rounding: 'floor', lines: [{ name: 'C品', qty: '1', price: '100', amount: '100' }], totals: {}, data: {}, snapshot: {} });
michi('⑬発行済みを 直した しまいの 返事待ちに 一覧から 取り消す＝遅れた 返事で 一覧の 行を 発行済みに 戻さない・集計に 足さない', async () => {
  const t = await tateru(); torikesuKuchi(t);
  await t.hajime(7000); await nemuru(1800); await t.A._loadList();
  t.kuraOsoi.v = 100;
  t.$('b-issue').dispatchEvent(new t.win.MouseEvent('click', { bubbles: true })); await nemuru(1500);
  t.kuraOsoi.v = 3000; t.kuraKaku.v = 50; t.tanka(8000); await nemuru(1700);   /* 8000 は すぐ 倉庫へ・返事は 3秒 */
  t.A._go('scr-list'); await nemuru(100);
  t.doc.querySelector('[data-kesu]').dispatchEvent(new t.win.MouseEvent('click', { bubbles: true })); await nemuru(800);
  eq(kuraB(t), 'void:8000', '★前置き：取り消せていない★ ' + t.LOG.join(' | '));
  await nemuru(3500);                        /* 遅れた 返事が 着く */
  eq(gyoB(t), 'void:8000', '★遅れた 返事で 取り消し済みが 発行済みに 戻った★');
  const rep = t.A._reportForTest('2026-10');
  eq(rep.totals.count, 0, '★取り消し済みが 集計に 足された★');
});
michi('⑭直して すぐ 別の 1通へ（離れる 時の しまいが 遅い）→戻って 発行＝遅れた 下書きの 返事で 一覧の 行を 下書きに 戻さない・集計に 入る', async () => {
  const t = await tateru(); Cno1tsu(t);
  await t.hajime(7000); await nemuru(1800); await t.A._loadList();
  const hon = t.S.store.invoices.saveDraft; let osoku = true;
  t.S.store.invoices.saveDraft = (v) => { if (osoku && v.partner_id === 'pB') { osoku = false; const c = JSON.parse(JSON.stringify(v)); return new Promise((res) => { setTimeout(() => { hon(c); }, 10); setTimeout(() => res({ ok: true, id: c.id, no: c.no }), 6000); }); } return hon(v); };
  t.kuraOsoi.v = 100;
  t.tanka(8000); await nemuru(100);
  await hirakuId(t, 'drfC'); t.tanka(200); await nemuru(1700);
  await hirakuId(t, t.kura.find((x) => x.partner_id === 'pB').id);
  t.$('b-issue').dispatchEvent(new t.win.MouseEvent('click', { bubbles: true })); await nemuru(1500);
  eq(kuraB(t), 'issued:8000', '★前置き：発行されていない★ ' + t.LOG.join(' | '));
  await nemuru(4500);                        /* 遅れた 下書きの 返事が 着く */
  eq(gyoB(t), 'issued:8000', '★遅れた 下書きの 返事で 発行済みが 下書きに 戻った★');
  const rep = t.A._reportForTest('2026-10');
  eq(rep.totals.count, 1, '★発行済みが 集計から 消えた★');
});
michi('⑮返事の 来ない しまいの 1通が 倉庫で 取り消された＝開くと 取り消し済みで 開く・偽の 知らせが 出ない', async () => {
  const t = await tateru(); torikesuKuchi(t); Cno1tsu(t);
  await t.hajime(7000); await nemuru(1800); await t.A._loadList();
  t.kuraOsoi.v = 100;
  t.$('b-issue').dispatchEvent(new t.win.MouseEvent('click', { bubbles: true })); await nemuru(1500);
  await t.A._loadList();
  t.saveKienai.v = 1;
  t.tanka(8000); await nemuru(1700);         /* この しまいは 返事が 来ない */
  await hirakuId(t, 'drfC');
  t.A._go('scr-list'); await nemuru(100);
  const id = t.kura.find((x) => x.partner_id === 'pB').id;
  t.doc.querySelector('[data-kesu="' + id + '"]').dispatchEvent(new t.win.MouseEvent('click', { bubbles: true })); await nemuru(1500);
  eq(kuraB(t).split(':')[0], 'void', '★前置き：取り消せていない★ ' + t.LOG.join(' | '));
  await hirakuId(t, id);
  eq(t.S.cur.status, 'void', '★取り消し済みを 発行済みで 開いた★');
  const deta = await t.matsuMiru ? '' : '';
  t.A._go('scr-list'); await nemuru(2500);
  ok(!/取り消し.*作り直して/.test(t.$('list-ochita').textContent + t.$('edit-ochita').textContent), '★偽の「取り消して 作り直して」★ ' + t.LOG.join(' | '));
});

/* ★taiketsu 6回★ 読み直しの 遅い 返事が、その 後に 通った 自動の しまいの 行を 古い 値で 上書きする（前から 在る） */
const osoiYomi = async (t, hakko) => {
  await t.hajime(7000); await nemuru(1800); await t.A._loadList();
  t.kuraOsoi.v = 100; t.listOsoi.v = 4000;   /* 保存・発行は 速く、その 後の 読み直しが 遅い */
  if (hakko) t.$('b-issue').dispatchEvent(new t.win.MouseEvent('click', { bubbles: true }));
  else t.A._saveDraftForTest();
  await nemuru(300);                         /* 読み直しが 倉庫を 読んだ（7000） */
  t.tanka(8000); await nemuru(1800);         /* 8000 が 自動で 倉庫へ・一覧の 行も 8000 */
  await nemuru(2500);                        /* 遅い 読み直しの 返事が 着く */
  t.listOsoi.v = 0;
  const k = kuraTo(t);
  eq(k.gyo, k.kura, '★遅い 読み直しで 一覧の 行が 古い 値に 戻った★ ' + t.LOG.join(' | '));
  await hirakuId(t, t.kura.find((x) => x.partner_id === 'pB').id);
  eq(tanka(t), '8000', '★一覧から 開くと 古い 7000★');
  kenmei(t, '件名だけ'); await nemuru(2000);
  eq(kuraB(t).split(':')[1], '8000', '★件名を 直すと 金額が 書き戻った★ ' + t.LOG.join(' | '));
};
michi('⑯手で 保存の 後の 読み直しが 遅い 間に 直して 自動の しまい＝遅い 読み直しで 一覧の 行を 戻さない', async () => { await osoiYomi(await tateru(), false); });
michi('⑰発行の 後の 読み直しが 遅い 間に 直して 自動の しまい＝遅い 読み直しで 一覧の 行を 戻さない', async () => { await osoiYomi(await tateru(), true); });

/* ★taiketsu 7回★ 読み直しの 前に 送った 保存の 返事が、読み直しの 返事より 前に 着く＝送った 番号で 比べると 守れなかった（返事の 順で 比べる） */
const owariMiru = async (t, tag) => {
  t.kuraOsoi.v = 0; t.kuraKaku.v = null; t.listOsoi.v = 0;
  eq(JSON.stringify(t.b()), JSON.stringify(['draft:202610-001:8000']), '★' + tag + ' 前置き：8000 が 倉庫に 無い★ ' + t.LOG.join(' | '));
  const k = kuraTo(t);
  eq(k.gyo, k.kura, '★' + tag + ' 遅い 読み直しで 一覧の 行が 古い 値に 戻った★');
  await hirakuId(t, t.kura.find((x) => x.partner_id === 'pB').id);
  eq(tanka(t), '8000', '★' + tag + ' 一覧から 開くと 古い 7000★');
  kenmei(t, '件名だけ'); await nemuru(2200);
  eq(kuraB(t).split(':')[1], '8000', '★' + tag + ' 件名を 直すと 金額が 書き戻った★ ' + t.LOG.join(' | '));
};
michi('⑱直して 下タブで 一覧へ→すぐ 読み直す（保存は 読み直しの 前に 送り、返事は 読み直しの 返事より 前）＝一覧の 行は 8000', async () => {
  const t = await tateru();
  await t.hajime(7000); await nemuru(1800); await t.A._loadList();
  t.kuraOsoi.v = 1000; t.kuraKaku.v = 600; t.listOsoi.v = 1500;
  t.tanka(8000);
  t.A._go('scr-list');                       /* 移る 時の 自動の しまいが 送る */
  t.A._loadList();                           /* すぐ 読み直す（倉庫を 読むのは 書く 前） */
  await nemuru(2000);
  await owariMiru(t, '⑱');
});
michi('⑲直して すぐ「複製」（前の 1通を しまって 読み直す）＝前の 1通の 一覧の 行は 8000', async () => {
  const t = await tateru();
  await t.hajime(7000); await nemuru(1800); await t.A._loadList();
  t.kuraOsoi.v = 1000; t.kuraKaku.v = 600; t.listOsoi.v = 1500;
  t.tanka(8000);
  await t.A._duplicateForTest(); await nemuru(2500);
  await owariMiru(t, '⑲');
});
/* ★重ねた 写しが 残り続けない★（taiketsu 7回 止2）＝保存の 返事の 後に 始めた 読み直しでは 重ねない＝別の 端末で 直した 9000 が 出る */
michi('⑳保存の 返事の 後に 別の 端末が 9000 に 直した→読み直す＝一覧の 行は 9000（古い 写しを 重ね続けない）', async () => {
  const t = await tateru();
  await t.hajime(7000); await nemuru(1800); await t.A._loadList();
  t.kuraOsoi.v = 100; t.listOsoi.v = 1500;
  t.tanka(7500); const p = t.A._saveDraftForTest(); await nemuru(250);   /* 保存→遅い 読み直し */
  t.tanka(8000); await nemuru(1800);         /* 自動の しまい 8000（読み直しの 返事より 前） */
  await p; await nemuru(1500);
  t.listOsoi.v = 0;
  const r = t.kura.find((x) => x.partner_id === 'pB');
  eq(String(r.lines[0].price), '8000', '★前置き：8000 が 倉庫に 無い★ ' + t.LOG.join(' | '));
  r.lines[0].price = '9000'; r.totals = Object.assign({}, r.totals, { grandTotal: 9900 });   /* 別の 端末 */
  t.A._go('scr-list'); await t.A._loadList(); await nemuru(100);
  eq(gyoB(t), 'draft:9000', '★古い 写しを 重ね続けて 別の 端末の 9000 が 出ない★');
});

if (!SELF) {
  for (const [i, [na, fn]] of MICHI.entries()) if (buNi(i, MICHI.length)) await T(na, fn);
} else {
  const app = fs.readFileSync(path.join(ROOT, 'seikyu', 'js', 'seikyu-app.js'), 'utf8').replace(/\r\n/g, '\n');
  const kowasu = [
    ['自動の しまいの 後に 一覧の 行を 直さない', '          ichiranNiUtsusu(okuttaGyo, r.id, okuriBan);\n', '', '①'],
    ['一覧の 行を 直さない（合計）', '          ichiranNiUtsusu(okuttaGyo, r.id, okuriBan);\n', '', '②'],
    ['送った 中身を 丸ごと 重ねる（止1・止2）', "    KURA_NI_KAKU.forEach(function (k) { if (v && (k in v)) o[k] = JSON.parse(JSON.stringify(v[k] === undefined ? null : v[k])); });", '    o = JSON.parse(JSON.stringify(v || {}));', '③'],
    ['送った 中身を 丸ごと 重ねる（手元の 印）', "    KURA_NI_KAKU.forEach(function (k) { if (v && (k in v)) o[k] = JSON.parse(JSON.stringify(v[k] === undefined ? null : v[k])); });", '    o = JSON.parse(JSON.stringify(Object.assign({}, v || {}, { _shimatta: "x" })));', '②'],
    ['手で 保存の 写しを 返事の 時の 画面から 取る（2回 止1）', 'D） */\n      ichiranNiUtsusu(okuttaGyo, r.id, okuriBan);\n', 'D） */\n      ichiranNiUtsusu(gyoNoUtsushi(v), r.id, okuriBan);\n', '⑤'],
    ['自動の しまいの 写しを 返事の 時に 取る（2回 止1）', '          ichiranNiUtsusu(okuttaGyo, r.id, okuriBan);\n', '          ichiranNiUtsusu(Object.assign({}, okuru, { data: S.cur && S.cur.data }), r.id, okuriBan);\n', '⑥'],
    ['手で 保存の 後に 一覧の 行を 直さない（3回 ④の 道）', 'D） */\n      ichiranNiUtsusu(okuttaGyo, r.id, okuriBan);\n', 'D） */\n', '⑨'],
    /* 逆の 順の 守りは 2つ＝古い 返事を 一覧に 置かない・中身が 違えば 印を 立てて 送り直す。⑦は 2つ 壊すと 赤、⑧（倉庫の 順が 逆）は 送り直しを 壊すと 赤 */
    ['送り直さず 古い 返事も 置く（3回 止1・逆の 返事）', [['    if (ban) { if ((S.utsushitaBan[id] || 0) > ban) return; S.utsushitaBan[id] = ban; }', ''], ['            else { S.dirty = true; jidoYoyaku(); }', '            else jidoYoyaku();']], null, '⑦'],
    ['送り直さない（3回 止1・逆の 当たり）', [['            else { S.dirty = true; jidoYoyaku(); }', '            else jidoYoyaku();']], null, '⑧'],
    ['返事待ちの 1通を 写しで 開く（4回 止3）', "    if (okuriNo) { S.cur = okuriNo; S.dirty = true; fillEdit(); goScreen('scr-edit'); return; }", '', '⑩'],
    ['倉庫の 方が 進んでも 一覧の 行を 置く（5回 止A・止B・取り消し）', "        if (String(S.invoices[i].status || 'draft') !== String(utsushi.status || 'draft')) return;\n", '', '⑬'],
    ['倉庫の 方が 進んでも 一覧の 行を 置く（5回 止A・発行）', "        if (String(S.invoices[i].status || 'draft') !== String(utsushi.status || 'draft')) return;\n", '', '⑭'],
    ['状態の 違う 返事待ちの 1通を 開く（5回 止C）', "    if (okuriNo && String(okuriNo.status || 'draft') !== String(v.status || 'draft')) { okuriOwari(okuriNo); okuriNo = null; }\n", '', '⑮'],
    ['遅い 読み直しで 保存の 後の 行を 戻す（6回 止1・手で 保存）', "        if (u && (S.utsushitaHenji[id] || 0) > yomiBan && String(gyo.status || 'draft') === String(u.status || 'draft')) {", "        if (false) {", '⑯'],
    ['発行の 直後の 写しを 覚えない（6回 止1・発行）', "    S.utsushitaGyo[id] = JSON.parse(JSON.stringify(utsushi));", "    if (S.invoices.some(function (g) { return g && g.id === id && String(g.status || 'draft') === String(utsushi.status || 'draft'); })) S.utsushitaGyo[id] = JSON.parse(JSON.stringify(utsushi));", '⑰'],
    ['送った 番号で 比べる（7回 止1・下タブ）', '    var yomiBan = S.henjiNo; ', '    var yomiBan = S.okuriBan; ', '⑱'],
    ['送った 番号で 比べる（7回 止1・複製）', '    var yomiBan = S.henjiNo; ', '    var yomiBan = S.okuriBan; ', '⑲'],
    ['返事の 順の 比べを ≧ に する（7回 止2）', "        if (u && (S.utsushitaHenji[id] || 0) > yomiBan && String(gyo.status || 'draft') === String(u.status || 'draft')) {", "        if (u && (S.utsushitaHenji[id] || 0) >= yomiBan && String(gyo.status || 'draft') === String(u.status || 'draft')) {", '⑳'],
    ['返事の 順の 比べを 消す（7回 止2）', "        if (u && (S.utsushitaHenji[id] || 0) > yomiBan && String(gyo.status || 'draft') === String(u.status || 'draft')) {", "        if (u && String(gyo.status || 'draft') === String(u.status || 'draft')) {", '⑳'],
  ];
  for (const [i, [na, a, b, mi]] of kowasu.entries()) {
    if (!buNi(i, kowasu.length)) continue;
    await T('壊すと 赤: ' + na, async () => {
      const kumi = Array.isArray(a) ? a : [[a, b]];
      for (const [x] of kumi) ok(app.split(x).length === 2, '★壊す所が 1つ 見つからない★ … ' + x);
      const m = MICHI.find(([n]) => n.startsWith(mi));
      ok(m, '★見張る 道が 無い★ ' + mi);
      APP_KAE = kumi.reduce((acc, [x, y]) => acc.replace(x, y), app);
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
