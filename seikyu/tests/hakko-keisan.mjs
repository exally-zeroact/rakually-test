/* hakko-keisan.mjs — ★発行済みの 1通は 金額が 計算できない 間 しまわない★（合計を 空 {} で 倉庫に 入れない）
 * =============================================================================
 * 2026-10-30 taiketsu（本番の 倉庫の 凍結を 3列へ 入れ替える 前の 叩き・止1）
 *   jidoHozon・saveDraft は 計算できない（「1万」「-」等）と v.totals = {} で 送っていた。
 *   12列の 凍結は 発行済みの totals の 変化を 拒んでいたので 塞がっていたが、3列に すると 通り、
 *   入金の 残り・繰越・源泉・集計が 空を 読む。⇒ 発行済み・取り消し済みは 計算できる 形に なるまで しまわない。
 *   下書きは 今まで通り しまう（打ちかけを 落とさない）。
 *
 * 画面を 立てる 所は 一覧の 古い 行の 試験 furui-gyo.mjs 等と 同じ 形（本物の seikyu-app.js を jsdom で 動かす・倉庫は 14列だけ 書く 偽物）
 * 使い方: node seikyu/tests/hakko-keisan.mjs [--self-test]
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
console.log('\n[hakko-keisan] 発行済みは 計算できない 間 しまわない' + (SELF ? '（自分ためし）' : ''));
const oshu = async (t, sel) => { const b = t.doc.querySelector(sel); ok(b, '★押す 物が 無い★ ' + sel); b.dispatchEvent(new t.win.MouseEvent('click', { bubbles: true })); await nemuru(100); };
const shuseiDe = async (t) => { t.A._go('scr-list'); await t.A._loadList(); await nemuru(50); await oshu(t, '[data-open]'); };
const hakkoSumi = async () => {
  const t = await tateru();
  await t.hajime(7000); await nemuru(1800);
  t.kuraOsoi.v = 100; await t.A._issue(); await nemuru(500);
  ok(t.S.cur.status === 'issued', '★前置き：発行されていない★ ' + t.LOG.join(' | '));
  return t;
};
const kuraB = (t) => t.kura.find((r) => r.partner_id === 'pB');
const gokei = (x) => JSON.stringify((x && x.totals) || null);

michi('①発行済みで 単価を「-」に して 手を 止める＝自動で しまわない（倉庫の 合計は 前の まま・空に ならない）', async () => {
  const t = await hakkoSumi();
  await shuseiDe(t);
  const mae = gokei(kuraB(t));
  ok(mae !== '{}' && mae !== 'null', '★前置き：発行済みの 合計が 無い★ ' + mae);
  const n0 = t.LOG.length;
  t.tanka('-'); await nemuru(2000);
  eq(gokei(kuraB(t)), mae, '★計算できないのに 合計が 書き換わった★');
  ok(!t.LOG.slice(n0).some((l) => /^save /.test(l)), '★計算できないのに 倉庫へ 送った★ ' + t.LOG.slice(n0).join(' | '));
  ok(t.$('edit-err').textContent.trim().length > 0, '★どこが 数に ならないかの 知らせが 無い★');
});
michi('②①の 後に 直すと しまう（直れば 止めっぱなしに しない）', async () => {
  const t = await hakkoSumi();
  await shuseiDe(t);
  t.tanka('-'); await nemuru(2000);
  t.tanka(9000); await nemuru(2000);
  const x = kuraB(t);
  eq(String((x.lines[0] || {}).price), '9000', '★直したのに しまわれない★ ' + t.LOG.join(' | '));
  ok(gokei(x) !== '{}', '★合計が 空★');
});
michi('③発行済みで「-」の まま 手で 保存＝送らず「計算できる 形に なるまで 保存しません」と 言う', async () => {
  const t = await hakkoSumi();
  await shuseiDe(t);
  const mae = gokei(kuraB(t));
  t.tanka('-'); await nemuru(50);
  const n0 = t.LOG.length;
  await t.A._saveDraftForTest(); await nemuru(300);
  eq(gokei(kuraB(t)), mae, '★手の 保存で 合計が 書き換わった★');
  ok(!t.LOG.slice(n0).some((l) => /^save /.test(l)), '★手の 保存で 送った★');
  ok(/保存しません/.test(t.$('edit-err').textContent), '★止めた 訳を 言わない★ ' + t.$('edit-err').textContent);
});
michi('④下書きは 今まで通り「-」でも しまう（打ちかけを 落とさない）', async () => {
  const t = await tateru();
  await t.hajime(7000); await nemuru(1800);
  const n0 = t.LOG.length;
  t.tanka('-'); await nemuru(2000);
  ok(t.LOG.slice(n0).some((l) => /^save /.test(l)), '★下書きの 打ちかけを しまわなくなった★ ' + t.LOG.slice(n0).join(' | '));
});
michi('⑤発行済みで 控除の 行を 足し 金額を 読めない 字の まま 手を 止める＝しまわない（請求額が 控除前で 入らない）', async () => {
  const t = await hakkoSumi();
  await shuseiDe(t);
  const mae = gokei(kuraB(t));
  await oshu(t, '#b-ded-add');
  const el = t.doc.querySelector('[data-da]'); ok(el, '★前置き：控除の 金額の 欄が 無い★');
  const n0 = t.LOG.length;
  el.value = '1万'; el.dispatchEvent(new t.win.Event('input', { bubbles: true }));
  await nemuru(2000);
  eq(gokei(kuraB(t)), mae, '★控除が 読めないのに 合計が 書き換わった★');
  ok(!t.LOG.slice(n0).some((l) => /^save /.test(l)), '★控除が 読めないのに 倉庫へ 送った★ ' + t.LOG.slice(n0).join(' | '));
});
const kenmei = (t, x) => { const e = t.$('e-subject'); e.value = x; e.dispatchEvent(new t.win.Event('input', { bubbles: true })); e.dispatchEvent(new t.win.Event('change', { bubbles: true })); };
michi('⑥「-」の まま 下タブで 一覧へ 出る＝打った 値ごと 知らせが 残り、同じ 1通を 開き直しても 消えない', async () => {
  const t = await hakkoSumi();
  await shuseiDe(t);
  kenmei(t, '直した件名');
  t.tanka('-'); await nemuru(300);
  await oshu(t, '.bn[data-scr="scr-list"]'); await nemuru(300);
  const li = t.$('list-ochita');
  ok(li && li.style.display !== 'none' && /計算できない/.test(li.textContent), '★一覧に 知らせが 無い★ ' + (li && li.textContent));
  await shuseiDe(t); await nemuru(200);
  eq(t.$('e-subject').value, '直した件名', '★開き直したら 打った 件名が 消えた★');
});

if (!SELF) {
  for (const [na, fn] of MICHI) await T(na, fn);
} else {
  const app = fs.readFileSync(path.join(ROOT, 'seikyu', 'js', 'seikyu-app.js'), 'utf8').replace(/\r\n/g, '\n');
  const kowasu = [
    ['自動の しまいで 門を 見ない', '    if (keisanDekinaiHakko(v, t)) {\n      /*', '    if (false) {\n      /*', '①'],
    ['手の 保存で 門を 見ない', '    if (keisanDekinaiHakko(v, t)) {\n      box(', '    if (false) {\n      box(', '③'],
    ['下書きも 止める', "    return !!(v && v.status && v.status !== 'draft' && (", '    return !!(v && (', '④'],
    ['控除を 門に 入れない', ' && (!(t && t.ok) || currentDeduct() === null));', ' && !(t && t.ok));', '⑤'],
    ['画面を 出る 時に 知らせを 残さない', '      if (!tsukuruYoi) ochita(S.cur, { reason: KEISAN_DEKINAI });\n', '', '⑥'],
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
