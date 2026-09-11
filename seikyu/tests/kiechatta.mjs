/* kiechatta.mjs — ★打った物が 消えない／画面が 嘘を 言わない★
 * =============================================================================
 * 2026-09-10 専門家の 審査（司さん「UI/UX を 厳しい目で 見て」）で 出た 2つ。
 *
 * ★① 打った 明細が 消える★
 *   明細を 打つと S.dirty＝true を 立てるだけで、
 *   ★この印は 14か所で 書かれて 1か所も 読まれていなかった★（実測）。
 *   画面を 切り替える goScreen も 保存を 呼ばず、窓を 閉じる 保険も 無し。
 *   ＝5行 打って ★下タブに 指が 当たった 瞬間 消える★（下タブ＝親指の すぐ下）。
 *
 * ★② 画面が 嘘を 言う★
 *   司さん 2026-09-09「発行とゆう概念が めんどくさい／いつでも 編集できるように」で
 *   canEdit を true に したのに、「発行した請求書は あとから中身を直せません」等
 *   ★3か所 231文字が そのまま★ 残っていた。
 *   さらに ★倉庫（SQL）の 引き金は 12列を 固めたまま★＝直して 保存すると 必ず 落ちる。
 *
 * 見る物:
 *   ① 明細を 打つと ★少し待って 倉庫へ しまう★
 *   ② ★画面を 変える時★に その場で しまう（下タブの 誤爆で 消えない）
 *   ③ ★窓を 隠した時★も しまう（別のアプリへ 行った・ホームに 戻した）
 *   ④ ★相手が 決まる前は しまわない★（「（取引先が未選択）0円」の 下書きを 作らない）
 *   ⑤ ★画面の 字と canEdit が 同じ向き★（「直せません」と 言わない）
 *   ⑥ ★canEdit と 倉庫の 引き金が 同じ向き★（画面は直せる・倉庫は断る、に ならない）
 *   ⑦ 空振りしない（本当に 打てている／本当に 保存の道が 在る）
 *
 * 使い方: node seikyu/tests/kiechatta.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません。この検証は飛ばせません（SKIPを緑と呼ばない）。npm install してください。'); process.exit(1); }

const SELF = process.argv.includes('--self-test');
let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ' … 期待 ' + JSON.stringify(b) + ' / 実際 ' + JSON.stringify(a)); };
const nemuru = (ms) => new Promise((r) => setTimeout(r, ms));

const rel = 'seikyu/index.html', file = path.join(ROOT, rel);
const html = fs.readFileSync(file, 'utf8');
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''),
  { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' + rel });
const win = dom.window, doc = win.document;
win.fetch = () => Promise.reject(new Error('no net'));
win.scrollTo = () => {}; win.print = () => {};
win.URL.createObjectURL = () => 'blob:fake';
win.open = () => ({ document: { write() {}, close() {} }, focus() {}, print() {}, close() {} });
for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
  const src = m[1].split('?')[0];
  if (/^https?:/.test(src) || ['supa-config.js', 'auth.js', 'env-badge.js'].indexOf(src.split('/').pop()) >= 0) continue;
  const p = path.resolve(path.dirname(file), src);
  if (!fs.existsSync(p)) continue;
  const el = doc.createElement('script');
  el.textContent = fs.readFileSync(p, 'utf8');
  doc.body.appendChild(el);
}
await nemuru(500);
doc.getElementById('app').hidden = false;

const A = win.SeikyuApp, S = A._state, DOC = win.SeikyuDoc;
const $ = (id) => doc.getElementById(id);

/* ★倉庫は 作り物★＝しまった回数と 中身を 数える */
const shimatta = [];
S.org = { yago: '合同会社Rakunally', invoiceNo: 'T1234567890123' };
S.partners = [{ id: 'pt_a', data: { name: '黒田空調', honor: '御中' } }];
S.invoices = []; S.list = []; S.receipts = [];
S.store = {
  partners: { list: () => Promise.resolve(S.partners) },
  invoices: {
    list: () => Promise.resolve(S.invoices),
    usedNos: () => Promise.resolve([]),
    saveDraft: (v) => { shimatta.push(JSON.parse(JSON.stringify(v))); return Promise.resolve({ ok: true, id: 'iv_1' }); },
  },
  org: { save: (p) => Promise.resolve({ ok: true, data: Object.assign({}, S.org, p) }) },
  receipts: { list: () => Promise.resolve([]) },
};
A._bindForTest();
A._new();                 /* ★白紙の 1通を 作る★（ふだんは 起動が やる） */
A._fillEdit();

console.log('\n[kiechatta] 打った物が 消えない／画面が 嘘を 言わない' + (SELF ? '（自分ためし）' : ''));

const app = fs.readFileSync(path.join(ROOT, 'seikyu', 'js', 'seikyu-app.js'), 'utf8');
const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'schema-seikyu.sql'), 'utf8');

if (SELF) {
  const kowasu = [
    ['打ったら 予約するのを やめる', app, '        jidoYoyaku();                    /* ★打ったら 少し 待って しまう★ */'],
    ['入力から 出る時に しまうのを やめる', app,
      '    if (deru) { try { jidoHozon(); } catch (e) { /* しまえなくても 画面は 切り替える */ } }'],
    ['窓を 隠した時に しまうのを やめる', app, "    global.addEventListener('visibilitychange', function () {"],
    ['中身の 無い 紙も しまう', app,
      '    if (!(S.cur && S.cur.id) && !(tsukuruYoi && v.partner_id && naka)) return;'],
  ];
  kowasu.forEach(([na, src, x]) => ok(src.split(x).length === 2, '★壊す所が 1つ 見つからない★ ' + na + ' … ' + x));
  console.log('     壊す所 ' + kowasu.length + '箇所（本当に コードに 在る事を 見た）');
}

/* ── 1通 打つ（相手あり） ───────────────────────────── */
A._go('scr-edit');
await nemuru(50);
const utsu = () => {
  const tr = doc.querySelector('#lines-body tr');
  ok(tr, '★明細の 行が 無い★');
  const na = tr.querySelector('[data-f="name"]'), am = tr.querySelector('[data-f="amount"]');
  ok(na && am, '★品名か 金額の 欄が 無い★');
  na.value = 'エアコン取付工事'; na.dispatchEvent(new win.Event('input', { bubbles: true }));
  am.value = '42000'; am.dispatchEvent(new win.Event('input', { bubbles: true }));
};

T('★⑦ 空振りしていない（打つ道・しまう道が 本当に 在る）', () => {
  ok(S.cur, '★1通が 出来ていない★');
  ok(doc.querySelector('#lines-body tr'), '★明細の 行が 出ていない★');
  ok(app.indexOf('function jidoHozon(') > 0, '★しまう 道が 無い★');
  ok(app.indexOf('function jidoYoyaku()') > 0, '★予約する 道が 無い★');
  ok(typeof S.store.invoices.saveDraft === 'function', '★作り物の 倉庫が 無い★');
});

T('★④ 相手が 決まる前は しまわない（0円の 下書きを 作らない）', () => {
  /* ★1社しか 無い時は アプリが 先に 選ぶ★（良い作り）ので、
     ここでは ★まだ 選んでいない★状態を 作って 見る。 */
  S.cur.partner_id = '';
  if ($('e-partner')) $('e-partner').value = '';
  shimatta.length = 0;
  utsu();
  A._go('scr-list');                       /* 画面を 変えても しまわない はず */
  eq(shimatta.length, 0, '★相手が 決まる前に しまっている★: ' + JSON.stringify(shimatta[0] || {}));
});

/* 相手を 決める */
A._go('scr-edit');
await nemuru(30);
$('e-partner').value = 'pt_a';
$('e-partner').dispatchEvent(new win.Event('change', { bubbles: true }));
await nemuru(60);

await (async () => {
  shimatta.length = 0;
  utsu();
  await nemuru(60);
  const sugu = shimatta.length;
  await nemuru(1800);                      /* ★1.5秒 待つ★ 決めより 少し 長く */
  T('★① 明細を 打つと 少し待って しまう（打っている 最中は 行かない）', () => {
    eq(sugu, 0, '★打った そばから 倉庫へ 行っている★');
    ok(shimatta.length >= 1, '★待っても しまっていない★');
    const v = shimatta[shimatta.length - 1];
    ok((v.lines || []).some((l) => String(l.name || '').indexOf('エアコン') >= 0),
      '★打った 明細が 入っていない★: ' + JSON.stringify(v.lines));
  });
})();

await (async () => {
  /* もう一度 打って、待たずに 画面を 変える */
  A._go('scr-edit');
  await nemuru(30);
  shimatta.length = 0;
  const tr = doc.querySelector('#lines-body tr');
  const am = tr.querySelector('[data-f="amount"]');
  am.value = '55000'; am.dispatchEvent(new win.Event('input', { bubbles: true }));
  A._go('scr-list');                       /* ★待たずに 下タブ★ */
  T('★② 画面を 変える時に その場で しまう（下タブの 誤爆で 消えない）', () => {
    ok(shimatta.length >= 1, '★画面を 変えた 時に しまっていない★');
    const v = shimatta[shimatta.length - 1];
    ok((v.lines || []).some((l) => String(l.amount || '') === '55000'),
      '★直前に 打った 金額が 入っていない★: ' + JSON.stringify(v.lines));
  });
})();

await (async () => {
  A._go('scr-edit');
  await nemuru(30);
  shimatta.length = 0;
  const tr = doc.querySelector('#lines-body tr');
  const am = tr.querySelector('[data-f="amount"]');
  am.value = '61000'; am.dispatchEvent(new win.Event('input', { bubbles: true }));
  /* ★窓を 隠す★＝別のアプリへ 行った・ホームに 戻した */
  Object.defineProperty(doc, 'visibilityState', { value: 'hidden', configurable: true });
  win.dispatchEvent(new win.Event('visibilitychange'));
  T('★③ 窓を 隠した時も しまう（別のアプリへ 行っても 消えない）', () => {
    ok(shimatta.length >= 1, '★隠した 時に しまっていない★');
    const v = shimatta[shimatta.length - 1];
    ok((v.lines || []).some((l) => String(l.amount || '') === '61000'),
      '★直前に 打った 金額が 入っていない★');
  });
})();

T('★⑤ 画面の 字と canEdit が 同じ向き（「直せません」と 言わない）', () => {
  /* ★覚書（コメント）は 数えない★＝画面に 出る 字だけ 見る */
  const noComment = (t) => t.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const h = noComment(html);
  const a = noComment(app);
  ok(DOC.canEdit({ status: 'issued' }) === true, '★canEdit が 直せないと 言っている★（前提）');
  ['直せません', '直す・消す事は 出来なくなります', '中身は固まります'].forEach((w) => {
    ok(h.indexOf(w) < 0, '★画面（index.html）が まだ 言っている★: ' + w);
    ok(a.indexOf(w) < 0, '★画面（app.js）が まだ 言っている★: ' + w);
  });
  /* ★出ている 字が 本当に 直せると 言っているか★（消しただけで 黙るのを 止める） */
  ok(a.indexOf('あとから中身を直せます') > 0 || h.indexOf('あとから中身を直せます') > 0,
    '★消しただけで 何も 言っていない★');
});

T('★⑥ canEdit と 倉庫の 引き金が 同じ向き（画面は直せる・倉庫は断る に ならない）', () => {
  /* ★倉庫の SQL を 読む★＝lib と SQL は schema-contract が 突き合わせている。
     ここで 見るのは ★canEdit（画面の 答え）と 固まる列の 向き★。 */
  ok(DOC.FROZEN_FIELDS.indexOf('lines') < 0,
    '★画面は「直せる」のに 倉庫が 明細を 固めている＝保存で 必ず 落ちる★');
  ok(DOC.FROZEN_FIELDS.indexOf('totals') < 0, '★合計を 固めている★');
  ok(DOC.FROZEN_FIELDS.indexOf('issue_ymd') < 0,
    '★請求日を 固めている★（司さん「請求日を いつでも 触れるように」）');
  ok(sql.indexOf('new.lines       is distinct from old.lines') < 0,
    '★SQL が まだ 明細を 固めている★');
  ok(sql.indexOf('new.no          is distinct from old.no') > 0,
    '★番号まで 外している＝同じ番号を 二度 使えてしまう★');
  ok(sql.indexOf('pay_invoices_no_delete') > 0, '★発行済みを 消せるように なっている★');
  console.log('     固まる列 … ' + DOC.FROZEN_FIELDS.join(' / ') + '（前は 12列）');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
