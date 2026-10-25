/* hakko-to-jido.mjs — ★発行と 自動の しまいが ぶつからない★
 * =============================================================================
 * 2026-10-25 指示役（引き継ぎで「別の 件で 残す」と された 物を 実測）
 *
 * ★本物の seikyu-app.js を jsdom で 動かし、返事の 遅い 倉庫で 踏んだ 道★（直す前）
 *   ①id の 在る 下書きを 打ち直して すぐ「発行する」
 *     ＝予約して あった 自動の しまいが ★発行済みに 下書きで 当たり★ 凍結（23514）に 拒まれ、
 *       偽の「発行済みなので…取り消しにして、新しく 作り直してください」が 残った（正しい 請求書を 取り消させかねない）
 *   ②id の 無い 1通を 打って すぐ「発行する」
 *     ＝予約の しまいが 同じ 番号で 2通目を 作ろうとして、偽の「この番号は 既に 使われています」
 *   ③最初の 自動の しまいの 返事待ちに「発行する」
 *     ＝★下書きと 発行済みの 2通★（番号が 1つ 進む）＝後で 下書きを 発行すると 二重の 請求
 *   ④返事待ちの 間に もう一度「発行する」（2度 押し）
 *     ＝★発行済みが 2通★（番号を 進めて 出し直した）＝二重の 請求
 *
 * ★決め★
 *   ・発行の 前に 予約を 消し、自動の しまいの 返事を 待って ★返った id で★ 発行する（1通の まま）
 *   ・発行の 返事まで その 1通の 自動の しまいを 止める。待つ 間に 打った 字は 返事の 後に しまう（落とさない）
 *   ・返事待ちの 2度目の「発行する」は 通さない
 *   ・お金の 計算は 1文字も 変えない
 *
 * 倉庫の 偽物は 本物に 近く した（taiketsu 10-25 の 覚え＝真似ないと 偽の 緑）：
 *   送った 時に 写す・当たるのは 半分の 時間・返事は 全部の 時間・凍結（発行済みの no／issued_at／status）＝23514・
 *   番号の 一意＝23505（発行は 番号を 進めて やり直す＝本物の store.issue と 同じ）
 *
 * 使い方: node seikyu/tests/hakko-to-jido.mjs [--self-test] [--bu=1|2|3]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません。この検証は飛ばせません（SKIPを緑と呼ばない）。npm install してください。'); process.exit(1); }

const SELF = process.argv.includes('--self-test');
/* ★3つに 割って 回す★（--bu=1 / 2 / 3）＝1段 180秒の 網に 収める（全部で 約220秒）。--bu 無し＝全部 */
const BU = Number(((process.argv.find((a) => a.startsWith('--bu=')) || '').split('=')[1]) || 0);
const WARU = 3;
const buNi = (i, n) => !BU || Math.floor(i / Math.ceil(n / WARU)) === BU - 1;
let pass = 0, fail = 0;
const T = async (n, fn) => { try { await fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' … 期待 ' + JSON.stringify(b) + ' / 実際 ' + JSON.stringify(a)); };
const nemuru = (ms) => new Promise((r) => setTimeout(r, ms));

const rel = 'seikyu/index.html', file = path.join(ROOT, rel);
const html = fs.readFileSync(file, 'utf8');

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
      if (old && kind === 'save') c.issued_at = old.issued_at;
      const i = kura.findIndex((x) => x.id === c.id); if (i >= 0) kura[i] = c; else kura.push(c);
      LOG.push(kind + ' ' + c.id + ' ' + c.status + ' no=' + c.no + ' ' + (c.lines || []).map((l) => l.name + '@' + l.price).join(','));
      return { ok: true, id: c.id, no: c.no, bumped: tr };
    }
    return { ok: false, reason: '番号を 進めきれません' };
  };
  /* ★送った 時点で 写す★（後で 写すと 待つ間に 打った 字まで 入って 偽の 緑） */
  const okuruKura = (kind, v) => {
    const c = JSON.parse(JSON.stringify(v));
    const d = kuraOsoi.v;
    return new Promise((res) => {
      let r = null;
      setTimeout(() => { r = ataru(kind, c); }, d / 2);
      setTimeout(() => res(r), d);
    });
  };
  S.invoices = []; S.receipts = []; S.fil = 'all'; S.docType = 'invoice';
  S.store = {
    partners: { list: () => Promise.resolve(S.partners), gone: () => Promise.resolve([]), create: () => Promise.resolve({ ok: false }) },
    invoices: {
      list: (k) => Promise.resolve(k === 'quote' ? [] : JSON.parse(JSON.stringify(kura))),
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
    win, doc, A, S, $, kura, LOG, kuraOsoi, hakkoDame,
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

console.log('\n[hakko-to-jido] 発行と 自動の しまいが ぶつからない' + (SELF ? '（自分ためし）' : ''));

const MICHI = [];
const michi = (na, fn) => MICHI.push([na, fn]);

michi('①id の 在る 下書きを 打ち直して すぐ 発行＝偽の「取り消して 作り直して」が 出ない・打ち直した 値で 1通', async () => {
  const t = await tateru();
  await t.hajime(7000);
  await nemuru(1800);                        /* 最初の 自動の しまいが 済む（id が 付く） */
  ok(t.S.cur.id, '★前置き：自動の しまいで id が 付いていない★');
  t.kuraOsoi.v = 3000;
  t.tanka(8000);
  await nemuru(200);
  const pI = t.A._issue();
  const deta = await t.matsuMiru(7000);   /* 返事（3秒）の 後に 来る 偽の 知らせまで 見る */
  await pI;
  eq(deta, '', '★偽の「保存されていません」が 出た★ ' + t.LOG.join(' | '));
  eq(JSON.stringify(t.b()), JSON.stringify(['issued:202610-001:8000']), '★倉庫の 1通が 違う★ ' + t.LOG.join(' | '));
});
michi('②id の 無い 1通を 打って すぐ 発行＝偽の「この番号は 既に 使われています」が 出ない・1通', async () => {
  const t = await tateru();
  t.kuraOsoi.v = 3000;
  await t.hajime(7000);
  await nemuru(200);
  const pI = t.A._issue();
  const deta = await t.matsuMiru(7000);   /* 返事（3秒）の 後に 来る 偽の 知らせまで 見る */
  await pI;
  eq(deta, '', '★偽の「保存されていません」が 出た★ ' + t.LOG.join(' | '));
  eq(JSON.stringify(t.b()), JSON.stringify(['issued:202610-001:7000']), '★倉庫の 1通が 違う★ ' + t.LOG.join(' | '));
});
michi('③最初の 自動の しまいの 返事待ちに 発行＝下書きと 発行済みの 2通に ならない（番号も 進まない）', async () => {
  const t = await tateru();
  t.kuraOsoi.v = 3000;
  await t.hajime(7000);
  await nemuru(1600);                        /* 自動の しまいを 送った 直後（返事は まだ） */
  ok(!t.S.cur.id, '★前置き：もう id が 付いている（返事待ちに なっていない）★');
  await t.A._issue(); await nemuru(4000);
  eq(JSON.stringify(t.b()), JSON.stringify(['issued:202610-001:7000']), '★2通 出来た（二重の 請求の 元）★ ' + t.LOG.join(' | '));
  eq(t.ochita(), '', '★偽の「保存されていません」が 出た★');
});
michi('④返事待ちの 間に もう一度「発行する」＝発行済みが 2通に ならない', async () => {
  const t = await tateru();
  await t.hajime(7000);
  t.kuraOsoi.v = 3000;
  const p1 = t.A._issue(); await nemuru(100);
  const p2 = t.A._issue();
  ok(/待って/.test(t.$('edit-err').textContent), '★2度目に 何も 言わない★ ' + JSON.stringify(t.$('edit-err').textContent));
  await Promise.all([p1, p2]); await nemuru(1500);
  eq(JSON.stringify(t.b()), JSON.stringify(['issued:202610-001:7000']), '★発行済みが 2通（二重の 請求）★ ' + t.LOG.join(' | '));
});
michi('⑤発行の 返事待ちに 打った 字＝凍結に 拒まれず、返事の 後に しまわれる', async () => {
  const t = await tateru();
  await t.hajime(7000);
  await nemuru(1800);
  t.kuraOsoi.v = 3000;
  const p = t.A._issue(); await nemuru(200);
  t.tanka(9000);                             /* 返事待ちに 打つ＝予約の しまいは 返事の 前に 来る */
  const deta = await t.matsuMiru(8500);
  await p;
  eq(deta, '', '★偽の「保存されていません」が 出た（後で 消えても 客は 見る）★ ' + t.LOG.join(' | '));
  eq(JSON.stringify(t.b()), JSON.stringify(['issued:202610-001:9000']), '★待つ間に 打った 字が 倉庫に 無い★ ' + t.LOG.join(' | '));
  eq(t.S.dirty, false, '★打ちかけの 印が 残った★');
});
michi('⑥発行を 倉庫が 断った＝待つ間に 打った 字は 下書きと して しまわれる', async () => {
  const t = await tateru();
  await t.hajime(7000);
  await nemuru(1800);
  t.kuraOsoi.v = 3000; t.hakkoDame.v = true;   /* 返事は 打った 字の 予約（1.5秒）より 遅い */
  const p = t.A._issue(); await nemuru(200);
  t.tanka(9000);
  await p;
  t.kuraOsoi.v = 600;
  ok(/発行できませんでした/.test(t.$('edit-err').textContent), '★断られたのに 言わない★');
  await nemuru(2800);
  eq(JSON.stringify(t.b()), JSON.stringify(['draft:202610-001:9000']), '★待つ間に 打った 字が 倉庫に 無い★ ' + t.LOG.join(' | '));
});
/* ★返事待ちに 打って 別の 1通へ 移った★（taiketsu 10-25 止1）＝その 1通の 自動の しまいは 止めて あるので、
   黙って 捨てずに「まだ 保存されていません」に 打った 値ごと 残す（開き直すと その 値で 戻る） */
const nokotta = (t, kin) => Object.values(t.S.ochita || {}).some((o) => (o.v.lines || []).some((l) => String(l.price) === String(kin)));
michi('⑦発行の 返事待ちに 打って 別の 1通へ 移った＝打った 値を 黙って 捨てない', async () => {
  const t = await tateru();
  await t.hajime(7000);
  await nemuru(1800);
  t.kuraOsoi.v = 3000;
  const p = t.A._issue(); await nemuru(200);
  t.tanka(9000);
  t.A._go('scr-list'); t.A._new();             /* 下タブで 一覧へ → 新しい 1通 */
  await p; await nemuru(2000);
  ok(nokotta(t, 9000), '★打った 9000 が どこにも 残っていない（黙って 消えた）★ ' + t.LOG.join(' | '));
  ok(/保存されていません/.test(t.$('list-ochita').textContent), '★一覧に 知らせが 出ない★ ' + JSON.stringify(t.$('list-ochita').textContent));
  eq(JSON.stringify(t.b()), JSON.stringify(['issued:202610-001:7000']), '★倉庫の 1通が 違う★ ' + t.LOG.join(' | '));
});
michi('⑧発行を 断られ、返事待ちに 打って 別の 1通へ 移った＝打った 値を 黙って 捨てない', async () => {
  const t = await tateru();
  await t.hajime(7000);
  await nemuru(1800);
  t.kuraOsoi.v = 3000; t.hakkoDame.v = true;
  const p = t.A._issue(); await nemuru(200);
  t.tanka(9000);
  t.A._go('scr-list'); t.A._new();
  await p; await nemuru(2000);
  ok(nokotta(t, 9000), '★打った 9000 が どこにも 残っていない（黙って 消えた）★ ' + t.LOG.join(' | '));
  eq(JSON.stringify(t.b()), JSON.stringify(['draft:202610-001:7000']), '★倉庫の 1通が 違う★ ' + t.LOG.join(' | '));
});
/* ★返事待ちに「保存」を 押した★（taiketsu 10-25 止2）＝下書きで 送ると ①②と 同じ 偽の 字が 出た */
michi('⑨発行の 返事待ちに「保存」を 押した（id 在り）＝偽の「取り消して 作り直して」が 出ない・打った 値は 返事の 後に しまう', async () => {
  const t = await tateru();
  await t.hajime(7000);
  await nemuru(1800);
  t.kuraOsoi.v = 3000;
  const p = t.A._issue(); await nemuru(200);
  t.tanka(9000);
  await t.A._saveDraftForTest();
  ok(/待って/.test(t.$('edit-err').textContent), '★返事待ちの「保存」に 何も 言わない★ ' + JSON.stringify(t.$('edit-err').textContent));
  const deta = await t.matsuMiru(8000);
  await p;
  eq(deta, '', '★偽の「保存されていません」が 出た★ ' + t.LOG.join(' | '));
  eq(JSON.stringify(t.b()), JSON.stringify(['issued:202610-001:9000']), '★倉庫の 1通が 違う★ ' + t.LOG.join(' | '));
});
michi('⑩id の 無い 1通で 発行の 返事待ちに「保存」＝偽の「番号は 既に 使われています」が 出ない・1通', async () => {
  const t = await tateru();
  t.kuraOsoi.v = 3000;
  await t.hajime(7000);
  const p = t.A._issue(); await nemuru(200);
  await t.A._saveDraftForTest();
  ok(!/使われています/.test(t.$('edit-err').textContent), '★偽の「番号は 既に 使われています」★ ' + JSON.stringify(t.$('edit-err').textContent));
  await p; await nemuru(3500);
  ok(!/使われています/.test(t.$('edit-err').textContent + t.ochita()), '★偽の「番号は 既に 使われています」★');
  eq(JSON.stringify(t.b()), JSON.stringify(['issued:202610-001:7000']), '★倉庫の 1通が 違う★ ' + t.LOG.join(' | '));
});

/* ★返事待ちに 一覧から 同じ 1通を 開き直した★（taiketsu 10-25 2回目 止A）＝写しで 開くと 止めを すり抜け、
   下書きの 9000 と 発行済みの 7000 が 食い違ったまま「発行しました」／凍結に 拒まれて 偽の 知らせ */
michi('⑪発行の 返事待ちに 一覧から 同じ 1通を 開き直して 打った＝発行済みに その 値が 入り・偽の 知らせが 出ない', async () => {
  const t = await tateru();
  await t.hajime(7000);
  await nemuru(1800);
  const id = t.S.cur.id;
  ok(id, '★前置き：id が 付いていない★');
  t.kuraOsoi.v = 3000;
  t.tanka(8000);                             /* 打ち直して すぐ 発行＝8000 は 発行で 送る（倉庫の 下書きは 7000 の まま） */
  await nemuru(200);
  const p = t.A._issue(); await nemuru(200);
  t.A._go('scr-list');
  await t.A._loadList();
  const b = t.doc.querySelector('[data-open="' + id + '"]');
  ok(b, '★一覧に その 1通を 開く 札が 無い★');
  b.dispatchEvent(new t.win.MouseEvent('click', { bubbles: true }));
  await nemuru(50);
  /* ★開き直した 画面は 発行に 送った 値★（倉庫の 古い 下書きの 写しで 開くと 8000 が 7000 に 戻って 見えた） */
  eq(t.doc.querySelector('#lines-body tr [data-f="price"]').value, '8000', '★開き直すと 発行に 送った 値でなく 古い 下書きの 値が 出た★');
  t.tanka(9000);
  const deta = await t.matsuMiru(8000);
  await p;
  eq(deta, '', '★偽の「保存されていません」が 出た★ ' + t.LOG.join(' | '));
  eq(JSON.stringify(t.b()), JSON.stringify(['issued:202610-001:9000']), '★倉庫の 1通が 画面と 食い違う★ ' + t.LOG.join(' | '));
  eq(t.S.cur.status, 'issued', '★画面の 1通が 発行済みに ならない★');
});
/* ★打っていない 1通に 偽の「まだ 保存されていません」を 積まない★（taiketsu 10-25 2回目 任意1） */
michi('⑫しまいの 返事待ちに 発行→別の 1通へ→断られた＝倉庫に 入った 1通に 偽の 知らせを 積まない', async () => {
  const t = await tateru();
  t.kuraOsoi.v = 3000;
  await t.hajime(8000);
  await nemuru(1600);                        /* 自動の しまいを 送った 直後 */
  t.hakkoDame.v = true;
  const p = t.A._issue(); await nemuru(200);
  t.A._go('scr-list'); t.A._new();
  await p; await nemuru(2000);
  eq(JSON.stringify(t.b()), JSON.stringify(['draft:202610-001:8000']), '★前置き：倉庫に 下書きが 入っていない★ ' + t.LOG.join(' | '));
  eq(t.ochita(), '', '★しまえた 1通に 偽の「まだ 保存されていません」★');
});

/* ★返事待ちに 消す★（taiketsu 10-25 3回目 止1）＝消すのが 後に 当たると 0行で「消せた」に なり、消した 印で その 発行済みが 直せなくなった */
const kesuMiru = async (t, sel) => {
  await t.hajime(7000);
  await nemuru(1800);
  const id = t.S.cur.id;
  ok(id, '★前置き：id が 付いていない★');
  t.A._fillEdit();
  t.kuraOsoi.v = 3000;
  const p = t.A._issue(); await nemuru(200);
  if (sel === 'list') { t.A._go('scr-list'); await t.A._loadList(); }
  const b = t.doc.querySelector(sel === 'list' ? '[data-kesu="' + id + '"]' : '#b-delete');
  ok(b, '★消す 札が 無い★ ' + sel);
  b.dispatchEvent(new t.win.MouseEvent('click', { bubbles: true }));
  await nemuru(50);
  /* ★断りは 今 見ている 画面に 出す★（一覧から 消した 時に 入力の 画面へ 出すと 客には 何も 見えない） */
  ok(/待って/.test(t.$(sel === 'list' ? 'list-err' : 'edit-err').textContent), '★見ている 画面に 断りが 出ない★ ' + sel);
  await p; await nemuru(3500);
  eq(JSON.stringify(t.b()), JSON.stringify(['issued:202610-001:7000']), '★倉庫の 1通が 違う★ ' + t.LOG.join(' | '));
  ok(!(t.S.kieta && t.S.kieta[id]), '★発行済みに「消した」印が 残った（直せなくなる）★');
  ok(!t.LOG.some((x) => /^remove/.test(x)), '★返事待ちに 消すを 送った★ ' + t.LOG.join(' | '));
};
michi('⑬発行の 返事待ちに 入力の「下書きを削除」＝送らない・消した 印を 残さない', async () => { await kesuMiru(await tateru(), 'edit'); });
michi('⑭発行の 返事待ちに 一覧から 消す＝送らない・消した 印を 残さない', async () => { await kesuMiru(await tateru(), 'list'); });
/* ★id の 付く 前の 一覧の 行★（taiketsu 10-25 3回目 任意A・4回目 止1）＝最初の しまいが 倉庫に 当たり 返事の 前。
   その 行は 古い 下書き（7000）＝写しで 開くと、打ち直して 発行した 8000 と 食い違い、件名を 直すだけで 発行済みを 7000 に 書き戻した。
   ⇒ 同じ 種類・同じ 番号の 行は その 1通 そのものを 開く（写しを 作らない）・消させずに 断る（taiketsu 5回 止2＝断って 開き直させると 古い 行が 開いた） */
const idMaeNoGyo = async (sel, dame) => {
  const t = await tateru();
  t.kuraOsoi.v = 3000;
  await t.hajime(7000);
  await nemuru(1600);                        /* 自動の しまい（7000）を 送った 直後 */
  t.tanka(8000);                             /* 打ち直して すぐ 発行＝8000 は 発行で 送る */
  if (dame) t.hakkoDame.v = true;
  const p = t.A._issue(); await nemuru(1500);  /* しまいは 倉庫に 当たった・返事は まだ */
  ok(!t.S.cur.id, '★前置き：もう id が 付いている★');
  const hakko = t.S.cur;
  t.A._go('scr-list'); await t.A._loadList();
  const b = t.doc.querySelector(sel);
  ok(b, '★一覧に 札が 無い★ ' + sel);
  b.dispatchEvent(new t.win.MouseEvent('click', { bubbles: true }));
  await nemuru(50);
  if (sel === '[data-kesu]') ok(/待って/.test(t.$('list-err').textContent), '★一覧に 断りが 出ない★ ' + JSON.stringify(t.$('list-err').textContent));
  ok(t.S.cur === hakko, '★古い 下書きの 写しを 開いた★');
  if (sel === '[data-open]') eq(t.doc.querySelector('#lines-body tr [data-f="price"]').value, '8000', '★開くと 古い 下書きの 値が 出た★');
  const deta = await t.matsuMiru(6000);
  await p;
  eq(deta, '', '★偽の「保存されていません」が 出た★ ' + t.LOG.join(' | '));
  ok(!t.LOG.some((x) => /^remove/.test(x)), '★返事待ちに 消すを 送った★ ' + t.LOG.join(' | '));
  ok(!/返事を 待っています/.test(t.$('list-err').textContent), '★返事の 後も 一覧に「待っています」が 残った★');
  return t;
};
michi('⑮しまいの 返事待ちに 打ち直して 発行→id の 付く 前に 一覧から 開く＝その 1通（8000）を 開く・発行済みは 8000', async () => {
  const t = await idMaeNoGyo('[data-open]');
  eq(JSON.stringify(t.b()), JSON.stringify(['issued:202610-001:8000']), '★倉庫の 発行済みが 違う★ ' + t.LOG.join(' | '));
});
michi('⑯しまいの 返事待ちに 打ち直して 発行→id の 付く 前に 一覧から 消す＝送らず 断る・発行済みは 8000', async () => {
  const t = await idMaeNoGyo('[data-kesu]');
  eq(JSON.stringify(t.b()), JSON.stringify(['issued:202610-001:8000']), '★倉庫の 発行済みが 違う★ ' + t.LOG.join(' | '));
});
/* ★断られた 道★（taiketsu 5回 止2）＝断った 後に 一覧から 開き直させると 古い 7000 が 開き、件名を 直すだけで 8000 を 7000 に 書き戻した */
michi('⑰⑮と 同じで 発行を 断られた＝一覧に「待っています」が 残らず・件名を 直しても 8000 の まま', async () => {
  const t = await idMaeNoGyo('[data-open]', true);
  await nemuru(2500);                        /* 予約し直した しまい（8000）が 倉庫に 入る */
  eq(JSON.stringify(t.b()), JSON.stringify(['draft:202610-001:8000']), '★断られた 後に 打った 値が 倉庫に 無い★ ' + t.LOG.join(' | '));
  t.kuraOsoi.v = 600;
  const sj = t.$('e-subject'); sj.value = '件名X'; sj.dispatchEvent(new t.win.Event('input', { bubbles: true }));
  await nemuru(2500);
  eq(JSON.stringify(t.b()), JSON.stringify(['draft:202610-001:8000']), '★件名を 直すと 金額が 書き戻った★ ' + t.LOG.join(' | '));
});
michi('⑲⑯と 同じで 発行を 断られた＝一覧の「待っています」が 残らない・打った 8000 は 下書きに', async () => {
  const t = await idMaeNoGyo('[data-kesu]', true);
  await nemuru(2500);
  eq(JSON.stringify(t.b()), JSON.stringify(['draft:202610-001:8000']), '★断られた 後に 打った 値が 倉庫に 無い★ ' + t.LOG.join(' | '));
});
/* ★id の 無い 別の 1通★（taiketsu 5回 止1）＝新しく 作った 1通に 自動で 同じ 番号が 出ても、その 1通の 自動の しまいは 止めない */
michi('⑱id の 無い 1通の 発行の 返事待ちに 新しく 作った 1通＝打った 字を 黙って 残さない 事が 無い', async () => {
  const t = await tateru();
  t.kuraOsoi.v = 3000;
  await t.hajime(7000);
  const p = t.A._issue(); await nemuru(200);
  t.A._go('scr-list');
  await t.hajime(5500);                      /* 新しく 作って 打つ（hajime が _new から 始める） */
  eq(t.S.cur.no, '202610-001', '★前置き：新しい 1通の 番号が 発行待ちと 違う（この 道に なっていない）★');
  await p; await nemuru(4500);
  const kura = t.LOG.some((x) => /^save .* 5500|Q品@5500/.test(x));
  const nokori = nokotta(t, 5500) || /使われています/.test(t.$('edit-err').textContent + t.ochita());
  ok(kura || nokori, '★新しい 1通に 打った 5500 が 送られも 知らされも しない（黙って 残らない）★ ' + t.LOG.join(' | '));
  eq(JSON.stringify(t.b()), JSON.stringify(['issued:202610-001:7000']), '★新しい 1通の 5500 が 発行済みを 上書きした★ ' + t.LOG.join(' | '));
});
/* ★返事待ちに 打って 別の 1通を 開き、また 一覧から 戻った★（taiketsu 6回 止1）＝別の 1通で 打ちかけの 印が 落ち、
   戻っても 印が 無いので、発行を 断られると 打った 値が 黙って 消えた */
const modoruMichi = async (idAri) => {
  const t = await tateru();
  if (!idAri) t.kuraOsoi.v = 3000;
  await t.hajime(7000);
  if (idAri) { await nemuru(1800); ok(t.S.cur.id, '★前置き：id が 付いていない★'); t.kuraOsoi.v = 3000; }
  else { await nemuru(1600); t.tanka(8000); }
  t.hakkoDame.v = true;
  const p = t.A._issue(); await nemuru(idAri ? 200 : 1500);
  if (idAri) t.tanka(9000);
  t.A._go('scr-list'); t.A._new();           /* 別の 1通（新しい 白紙）を 開く＝打ちかけの 印が 落ちる */
  t.A._go('scr-list'); await t.A._loadList();
  const b = t.doc.querySelector('[data-open]');
  ok(b, '★一覧に 開く 札が 無い★');
  b.dispatchEvent(new t.win.MouseEvent('click', { bubbles: true }));
  await nemuru(50);
  await p; t.kuraOsoi.v = 600; await nemuru(2500);
  const kin = idAri ? 9000 : 8000;
  eq(JSON.stringify(t.b()), JSON.stringify(['draft:202610-001:' + kin]), '★断られた 後に 打った ' + kin + ' が 倉庫に 無い（黙って 消えた）★ ' + t.LOG.join(' | '));
};
michi('⑳id の 在る 1通の 返事待ちに 打って 別の 1通→一覧から 戻る→断られた＝打った 9000 は 下書きに', async () => { await modoruMichi(true); });
michi('㉑id の 無い 1通で 同じ 道＝打ち直した 8000 は 下書きに', async () => { await modoruMichi(false); });
/* ★返事待ちに 相手を 選び直した★（taiketsu 6回 止2）＝番号が 取り直されて 001→002 に 動き、今の 番号で 見分けると 一覧の 001 の 行が 古い 下書きの 写しで 開いた */
michi('㉒id の 無い 1通の 返事待ちに 相手を 選び直して 戻す→一覧の 行を 開く＝発行中の その 1通（8000）が 開く', async () => {
  const t = await tateru();
  t.kuraOsoi.v = 3000;
  await t.hajime(7000);
  await nemuru(1600); t.tanka(8000);
  const hakko = t.S.cur;
  const p = t.A._issue(); await nemuru(1500);
  ok(!t.S.cur.id, '★前置き：もう id が 付いている★');
  for (const pid of ['pC', 'pB']) { t.$('e-partner').value = pid; t.$('e-partner').dispatchEvent(new t.win.Event('change', { bubbles: true })); await nemuru(30); }
  t.A._go('scr-list'); await t.A._loadList();
  const b = t.doc.querySelector('[data-open]');
  ok(b, '★一覧に 開く 札が 無い★');
  b.dispatchEvent(new t.win.MouseEvent('click', { bubbles: true }));
  await nemuru(50);
  ok(t.S.cur === hakko, '★古い 下書きの 写しを 開いた★（番号 ' + hakko.no + '）');
  const deta = await t.matsuMiru(4500);
  await p;
  eq(deta, '', '★偽の「保存されていません」が 出た★ ' + t.LOG.join(' | '));
});

if (!SELF) {
  for (const [i, [na, fn]] of MICHI.entries()) if (buNi(i, MICHI.length)) await T(na, fn);
} else {
  /* ★自分ためし★＝直しの 要の 行を 1つずつ 本当に 壊して、その 道が ★赤に なる★事を 見る。行末は そろえる（CRLF と LF） */
  const app = fs.readFileSync(path.join(ROOT, 'seikyu', 'js', 'seikyu-app.js'), 'utf8').replace(/\r\n/g, '\n');
  const kowasu = [
    ['発行の 返事待ちでも 自動の しまいを 送る', '    if (hakkoMachi(S.cur)) return;\n', '', '⑤'],
    ['しまいの 返事を 待たずに 発行する', '    return Promise.resolve(S.hozonChu).then(', '    return Promise.resolve(null).then(', '③'],
    ['しまいが 付けた id で 発行しない', '      if (!row.id && hakko.id) row.id = hakko.id;', '', '③'],
    ['2度 押しを 通す', "    if (S.hakkoChu) { box('edit-err', '発行の 返事を 待っています。", "    if (false) { box('edit-err', '発行の 返事を 待っています。", '④'],
    ['断られた 後に 待つ間の 字を しまわない', '      if (S.cur === hakko) { if (S.dirty) jidoYoyaku(); return; }', '      if (S.cur === hakko) { return; }', '⑥'],
    ['別の 1通へ 移ったら 打った 値を 残さない（止1）', "      if (S.cur !== hakko) nokosu('発行の 返事を 待つ 間に 直したため', true);", '', '⑦'],
    ['断られて 別の 1通へ 移ったら 打った 値を 残さない（止1）', "        nokosu('発行できなかったため', false);   /* 待つ 間に", "        if (S.cur === hakko && S.dirty) jidoYoyaku();   /* 待つ 間に", '⑧'],
    ['返事待ちの「保存」を 下書きで 送る（止2・id 在り）', "    if (hakkoMachi(S.cur)) { box('edit-err', '発行の 返事を 待っています。直した", "    if (false) { box('edit-err', '発行の 返事を 待っています。直した", '⑨'],
    ['返事待ちの「保存」を 下書きで 送る（止2・id 無し）', "    if (hakkoMachi(S.cur)) { box('edit-err', '発行の 返事を 待っています。直した", "    if (false) { box('edit-err', '発行の 返事を 待っています。直した", '⑩'],
    ['返事待ちに 同じ 1通を 写しで 開く（止A）', "    if (hakkoMachi(v)) { S.cur = S.hakkoChu; S.dirty = true; fillEdit();", "    if (hakkoMachi(v)) { S.cur = JSON.parse(JSON.stringify(v)); S.dirty = false; fillEdit();", '⑪'],
    ['断られた 時に しまえた 中身を 見ない（任意1）', ' && hozonKata(hakko) !== hakko._shimatta);', ');', '⑫'],
    ['入力の 削除を 返事待ちでも 送る（3回 止1）', "    /* ★発行の 返事を 待つ 1通は 消さない★（消すのが 後に", "    if (false) /* （消すのが 後に", '⑬'],
    ['一覧から 消すのを 返事待ちでも 送る（3回 止1）', "    if (hakkoMachi(v)) { box('list-err',", "    if (false) { box('list-err',", '⑭'],
    ['同じ id を 同じ 1通と 見ない（3回 任意A）', '    if (h === v || (v.id && h.id === v.id)) return true;', '    if (h === v) return true;', '⑭'],
    ['id の 無い 間 番号で 見分けない（4回 止1・開く）', "    return !h.id && !!v.id && !!no && String(v.no || '') === String(no)", "    return false && String(v.no || '') === String(no)", '⑮'],
    ['id の 無い 間 番号で 見分けない（4回 止1・消す）', "    return !h.id && !!v.id && !!no && String(v.no || '') === String(no)", "    return false && String(v.no || '') === String(no)", '⑯'],
    ['返事待ちの 1通を 開く 時に 写しを 作る（4回 止1・5回 止2）', '    if (hakkoMachi(v)) { S.cur = S.hakkoChu; S.dirty = true; fillEdit();', '    if (false) { S.cur = S.hakkoChu; S.dirty = true; fillEdit();', '⑮'],
    ['id の 無い 別の 1通も 番号で 止める（5回 止1）', "    return !h.id && !!v.id && !!no &&", "    return !h.id && !!no &&", '⑱'],
    ['返事の 後に 一覧の「待っています」を 消さない（5回 止2）', "      if (le && /発行の 返事を 待っています/.test(le.textContent)) box('list-err', '');", '', '⑲'],
    ['開き直しで 打ちかけの 印を 立てない（6回 止1）', '    if (hakkoMachi(v)) { S.cur = S.hakkoChu; S.dirty = true; fillEdit();', '    if (hakkoMachi(v)) { S.cur = S.hakkoChu; fillEdit();', '㉑'],
    ['今の 番号で 見分ける（6回 止2）', '    var no = S.hakkoNo || h.no;', '    var no = h.no;', '㉒'],
    ['予約を 消さずに しまいの 止めも 外す', "    if (jidoTimer) { clearTimeout(jidoTimer); jidoTimer = null; }\n    S.hakkoChu = hakko;", '    S.hakkoChu = null;', '②'],
  ];
  for (const [i, [na, a, b, mi]] of kowasu.entries()) {
    if (!buNi(i, kowasu.length)) continue;
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
/* ★1本も 走らない 段は 赤★（--bu の 数を 間違えた・道が 減って 段が 空に なった 時に 0本で 緑に しない・taiketsu 7回 任意2） */
if (pass + fail === 0) { console.log('★この 段は 1本も 走っていない（--bu の 数か 道の 数を 見直す）★'); process.exit(1); }
process.exit(fail ? 1 : 0);
