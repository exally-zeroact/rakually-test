/* seikyu-own-name.mjs — ★この画面は Rakually の物★（司さん 2026-08-17）
 *
 * 何を止めたいか:
 *   ★請求書は Rakually のアプリなのに、客が読む字に「Exally」を出していた★
 *   （司さん 2026-08-17「いつまでExallyのこといよんど／Rakuallyは別アプリなんはいつ理解するわけ？」）
 *   実測で ★4か所★ … タブの題／戻るリンク「← Exally」／
 *   「Exally のハブ（共有データ ▸ 取引先）で追加してください」／同（会社）
 *   さらに ★別のアプリの画面へ行かせる出口★ が 2つ（取引先を追加・会社情報を直す）。
 *   ＝★字を消すだけでは嘘★になる（押したら結局 別のアプリに着く）。出口ごと数える。
 *
 * ここで数える物:
 *   ① 客が読む字（★描き終わった画面から★・script/style は数えない）に他アプリの名前が無いか
 *   ② 紙（刷る物）に他アプリの名前が無いか
 *   ③ ★取引先が0社でも この画面の中だけで相手を作れるか★（外へ出さない）
 *   ④ 作った相手が ★その場でこの請求書の相手になるか★（答えたら結果を返す）
 *   ⑤ 同じ名前の相手を2つ作らないか
 *   ⑥ 自社の情報が ★中身で★ 見えるか（置き場所の説明で済ませない）
 *
 * 依存: jsdom（★入っていなければ赤。SKIPを緑と呼ばない★）
 * 使い方: node seikyu/tests/seikyu-own-name.mjs
 *         node seikyu/tests/seikyu-own-name.mjs --self-test
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(path.join(ROOT, 'package.json'));
let JSDOM;
try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません。この検証は飛ばせません（SKIPを緑と呼ばない）。'); process.exit(1); }
const { createFakeSupa } = require_(path.join(ROOT, 'tests/fake-supa.js'));

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const TA = async (n, fn) => { try { await fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ★他のアプリの名前★（この画面の客が読んではいけない字）
   ★Rakually の中の物（給与・請求書）は お互いの名前を出してよい★＝同じ1つのアプリなので。 */
const OTHER_APPS = ['Exally', 'エクサリー', 'exally', 'Kyually', 'キュアリー', 'Castally', 'ダイコメ', 'アマかせ'];
/* ★字の中では見逃す物★＝ファイル名やクラス名は客が読まない（css/exally-ui.css など）。
   ここは「画面に描かれた文字」だけを数えるので、その手の物は そもそも入ってこない。 */

/* ── 本物の画面を読む（CDN・接続設定・ログインは外す＝ネットに出ない） ── */
const html = fs.readFileSync(path.join(ROOT, 'seikyu/index.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1].split('?')[0])
  .filter((s) => !/^https?:/.test(s) && !/supa-config|auth\.js|exally-login/.test(s));
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'dangerously', url: 'http://localhost/seikyu/', pretendToBeVisual: true });
const win = dom.window, doc = win.document;
win.fetch = () => Promise.reject(new Error('no net'));
win.confirm = () => true; win.print = () => {}; win.scrollTo = () => {};
win.open = () => ({ document: { open() {}, write() {}, close() {}, readyState: 'complete' }, addEventListener() {}, focus() {}, print() {} });
win.URL.createObjectURL = () => 'blob:x'; win.URL.revokeObjectURL = () => {};
for (const src of srcs) {
  const el = doc.createElement('script');
  el.textContent = fs.readFileSync(path.join(ROOT, 'seikyu', src.replace(/^\.\.\//, '../')), 'utf8');
  doc.body.appendChild(el);
}

/* ★初めて使う人と同じ形★＝倉庫は空（会社0・取引先0・請求書0） */
const sb = createFakeSupa({
  uid: 'u1',
  tables: { pay_org: [], pay_partners: [], pay_invoices: [], pay_receipts: [], pay_companies: [] },
  pk: { pay_org: 'account_id', pay_companies: 'account_id' },
  unique: { pay_invoices: [['account_id', 'doc_type', 'no']] },
});
const $ = (id) => doc.getElementById(id);
const SCREENS = ['scr-list', 'scr-edit', 'scr-set'];

console.log('\n[請求書 これは Rakually の画面か]');
await win.SeikyuApp.attach(sb);
await sleep(30);

/* ★描き終わった画面から数える★（ソースの grep はコメントまで拾う）
   ★畳んである物を全部 開く／その形でしか出ない物を出してから数える★ */
function visibleText() {
  /* ★畳んである物を全部 開く★（開かずに数えると 中の字を見ていない） */
  [...doc.querySelectorAll('details')].forEach((d) => { d.open = true; });
  /* ★body を1回だけ歩く★（画面ごとに歩くと 同じ字を2回 数えて
     「1つ戻したのに2件」という嘘の数になる＝2026-08-17 実際に出た） */
  const out = [];
  const w = doc.createTreeWalker(doc.body, win.NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement && /SCRIPT|STYLE|TEMPLATE/.test(n.parentElement.tagName))
      ? win.NodeFilter.FILTER_REJECT : win.NodeFilter.FILTER_ACCEPT,
  });
  let n;
  while ((n = w.nextNode())) {
    const t = (n.nodeValue || '').trim();
    if (!t) continue;
    const sc = SCREENS.find((s) => $(s) && $(s).contains(n)) || '画面の外';
    out.push([sc, t]);
  }
  return out;
}
/* ★3画面とも 実際に押して描かせてから数える★（class を付け替えるだけでは描く所が走らない） */
async function drawAllScreens() {
  for (const sc of SCREENS) {
    const nav = [...doc.querySelectorAll('.bn')].find((b) => b.getAttribute('data-scr') === sc);
    if (nav) { nav.click(); await sleep(20); }
  }
}
await drawAllScreens();
const hitsOf = (rows) => rows.filter(([, t]) => OTHER_APPS.some((a) => t.includes(a)));

T('★① 客が読む字に 他のアプリの名前を出さない', () => {
  const bad = hitsOf(visibleText());
  eq(bad.length, 0, '★他のアプリの名前が出ている★\n   ' + bad.slice(0, 6).map((b) => '[' + b[0] + '] ' + b[1].slice(0, 70)).join('\n   '));
});

T('★① タブに出る題も この画面の物の名前', () => {
  const bad = OTHER_APPS.filter((a) => doc.title.includes(a));
  eq(bad.length, 0, '★タブの題に 他のアプリの名前★ ' + JSON.stringify(doc.title));
});

T('★② 紙（刷る物）にも 他のアプリの名前を出さない', () => {
  const P = win.SeikyuPaper;
  const paper = P.css() + P.build({
    inv: { doc_type: 'invoice', no: 'X', issue_ymd: '2026-07-21', data: {} },
    tax: { ok: true, lines: [], byRate: [], subtotal: 0, taxTotal: 0, grandTotal: 0 },
    partner: { name: 'A' }, org: { yago: 'Z' },
  }).html;
  const bad = OTHER_APPS.filter((a) => paper.includes(a));
  eq(bad.length, 0, '★紙に 他のアプリの名前★ ' + bad.join(' , '));
});

await TA('★③ 取引先が0社でも この画面の中だけで相手を作れる（外へ出さない）', async () => {
  SCREENS.forEach((x) => $(x).classList.toggle('active', x === 'scr-edit'));
  eq(win.SeikyuApp._state.partners.length, 0, '前提：取引先0社で始めていない');
  ok($('pt-new') && $('pt-new').style.display !== 'none', '★取引先0社なのに 作る口が出ていない★');
  ok($('pt-new-name') && $('b-pt-new'), '会社名の欄／作るボタンが無い');
  /* ★聞くのは会社名1つだけ★（ここで住所や登録番号を並べて埋めさせない） */
  const asks = [...$('pt-new').querySelectorAll('input,select,textarea')].filter((e) => !e.disabled);
  eq(asks.length, 1, '★作る口で 1つより多く聞いている（埋めさせている）★ ' + asks.map((e) => e.id).join(','));
});

await TA('★④ 会社名を1つ答えたら、その場で相手が出来て この請求書の相手になる', async () => {
  $('pt-new-name').value = '八木工業 株式会社';
  $('b-pt-new').click();
  await sleep(40);
  const st = win.SeikyuApp._state;
  eq(st.partners.length, 1, '★相手が出来ていない★');
  eq((st.partners[0].data || {}).name, '八木工業 株式会社', '名前が違う');
  eq((st.partners[0].data || {}).honor, '御中', '★敬称が空＝紙の宛名が尻切れになる★');
  ok(st.cur && st.cur.partner_id === st.partners[0].id, '★作ったのに この請求書の相手になっていない★');
  eq($('e-partner').value, st.partners[0].id, '★画面の「だれに」が その相手になっていない★');
  const msg = ($('pt-new-msg').textContent || '');
  ok(/八木工業/.test(msg), '★何が起きたかを その場で言っていない★ ' + JSON.stringify(msg));
  ok($('pt-new').style.display === 'none', '★相手が居るのに 作る口が出たまま★');
});

await TA('★⑤ 同じ名前の相手を2つ作らない', async () => {
  const before = win.SeikyuApp._state.partners.length;
  const r = await win.SeikyuApp._state.store.partners.create({ name: '八木工業 株式会社' });
  ok(r.ok, '作れなかった: ' + r.reason);
  ok(r.already, '★同じ名前なのに 新しく作った★');
  const list = await win.SeikyuApp._state.store.partners.list();
  eq(list.length, before, '★同じ名前の相手が増えている★');
});

await TA('★⑥ 自社の情報は「置き場所の説明」でなく 中身を見せる', async () => {
  /* ★実際に押して開く★（class を付け替えるだけだと 描く所が走らず「空だから緑」になる） */
  const nav = [...doc.querySelectorAll('.bn')].find((b) => b.getAttribute('data-scr') === 'scr-set');
  ok(nav, '設定のボタンが無い');
  nav.click();
  await sleep(30);
  const box = $('org-view');
  ok(box, 'org-view が無い');
  const t = (box.textContent || '').replace(/\s+/g, ' ');
  for (const k of ['会社名', '住所', '電話', 'インボイス登録番号']) {
    ok(t.includes(k), '★' + k + ' が出ていない★ ' + t.slice(0, 90));
  }
  /* ★入っていない物は「（未入力）」と字で置く★＝空欄を黙って飛ばさない */
  ok(t.includes('（未入力）'), '★入っていないのに 何も言っていない★ ' + t.slice(0, 90));
});

/* ── self-test：わざと壊して赤になるか ─────────────────────────────── */
if (process.argv.includes('--self-test')) {
  console.log('\n[seikyu-own-name --self-test] わざと壊して赤になるか');
  const S = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };

  S('★画面の字に 他のアプリの名前を1つ戻したら 捕まる', () => {
    const el = doc.createElement('p');
    el.textContent = 'Exally のハブで追加してください';
    $('scr-set').appendChild(el);
    try { eq(hitsOf(visibleText()).length, 1, '★戻したのに 捕まらない（何も見ていない）★'); }
    finally { el.remove(); }
    eq(hitsOf(visibleText()).length, 0, '片づけ後に残っている');
  });

  S('★タブの題に戻したら 捕まる', () => {
    const keep = doc.title;
    doc.title = '請求書 — Exally';
    try { ok(OTHER_APPS.some((a) => doc.title.includes(a)), '★題を見ていない★'); }
    finally { doc.title = keep; }
  });

  S('★<script> の中のコメントは 数えない（数えると直しようが無い赤になる）', () => {
    const sc = doc.createElement('script');
    sc.textContent = '/* Exally スイート共有 */';
    $('scr-set').appendChild(sc);
    try { eq(hitsOf(visibleText()).length, 0, '★客が読まない字まで数えている★'); }
    finally { sc.remove(); }
  });

  S('★作る口を隠したら 捕まる（0社なのに外へ出す形に戻す）', () => {
    const el = $('pt-new');
    const keep = el.style.display;
    el.style.display = 'none';
    try {
      let caught = false;
      try { ok(el.style.display !== 'none', 'dummy'); } catch { caught = true; }
      ok(caught, '★隠したのに 気づかない★');
    } finally { el.style.display = keep; }
  });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
