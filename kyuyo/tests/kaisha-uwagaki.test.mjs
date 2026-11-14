/* kaisha-uwagaki.test.mjs — ★倉庫に 会社の 行が 在り 人が 0人の 口で 開いても 会社の 設定を 既定で 上書きしない★（2026-11-14）
 * ============================================================================
 * ★穴★ store.js cloudLoadState は 会社の 行＋0人を {…会社, employees:[]} で 返す → app.js applyCloudState は 0人で false →
 *   auth.js:61 が「新規」と 読み PayslipPersistSave＝端末の 既定の 会社（振込元 空）で 倉庫の 会社の 行を 上書き。
 *   客の 害＝人を 入れる 前に 会社の 設定（振込元 等）を 入れて 開き直すと 既定に 戻る。
 * ★直し（3版）★ このページで 1回目＝倉庫の 会社を 採る（読み込みの 途中の 直しは 入らない＝窓で 1回 言う）／
 *   2回目から（_kaishaYonda）＝reconcile に 任せ「手元 0人なら 倉庫」倒しは 倉庫も 0人の 時だけ 外す。
 * ★見る 事（taiketsu の 5本）★
 *   1 読み込み中に 振込元を 7654321 に 直す → 着いた 後 画面・倉庫とも 1234567＋窓（ui-modal）が 保存の 後も 残る
 *   2 触らず 開く → 窓 0・倉庫へ 振込元 "" を 書かない（＋開いた 後の 直しが 振込元を 残して 届く）
 *   3 読んだ 後に 直す→送りが 落ちる（dirty）→読み直す→送りが 戻る→倉庫・画面とも 7654321
 *   4 倉庫に 人・手元 0人・読んだ 後 → 倉庫の 人が 戻る（前の 倒しの まま）
 *   5 前の 回の 未送信（dirty・0人）が 読み込み中に online で 送られても 振込元を 既定で 上書きしない
 *   ④ 本当の 新規は 前の まま 初回アップ ／ ⑤ 壊し＝(i) 外す→2・5 赤／倒しの 外しを 外す→3 赤／窓を 外す→1 赤
 *   （測るだけ）手元に 人・倉庫は 会社の 行＋0人＝別件（taiketsu 任意C）の 数を 出す
 * 使い方: node kyuyo/tests/kaisha-uwagaki.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(pathToFileURL(path.join(ROOT, 'package.json')));
let JSDOM;
try { ({ JSDOM } = require_('jsdom')); }
catch { console.log('★jsdom が要ります（npm install）。飛ばせません（SKIPを緑と呼ばない）。'); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T0 = '2026-11-01T00:00:00.000Z';
const html = fs.readFileSync(path.join(ROOT, 'kyuyo/index.html'), 'utf8');
const file = path.join(ROOT, 'kyuyo/index.html');

const SRCS = [];
for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
  const src = m[1].split('?')[0]; const base = src.split('/').pop();
  if (/^https?:/.test(src) || /^supabase-js/.test(base) || ['supa-config.js', 'env-badge.js', 'rakunally-login.js'].includes(base)) continue;
  const p = path.resolve(path.dirname(file), src); if (!fs.existsSync(p)) continue;
  SRCS.push([base, fs.readFileSync(p, 'utf8')]);
}
if (!SRCS.some(([b]) => b === 'auth.js')) { console.log('✗ ★auth.js が index.html に 無い＝試験が 古い★'); process.exit(1); }

/* ── 偽の 倉庫（口＝uid ごとに 1つ）── */
/* ── 偽の 倉庫（口＝uid ごとに 1つ）── */
function makeKura(opt) {
  const k = { uid: opt.uid, coData: opt.coData || null, coUA: opt.coUA || null, emps: (opt.emps || []).map((e, i) => ({ id: e.id, sort: i, data: e })),
    yomenai: !!opt.yomenai, hold: false, otosu: false, yomiMachi: !!opt.yomiMachi, coWrites: [], empUpserts: [], deletes: [], slipOps: [], logged: !opt.nashi };
  const pending = () => new Promise(() => {});
  let _toku; const yomiP = new Promise((r) => { _toku = r; }); k.toku = () => { k.yomiMachi = false; _toku(); };   /* ★読み込みを 止めて おいて 後で 通す★ */
  function resolve(t, ops) {
    const op = ops.find((o) => ['select', 'update', 'upsert', 'delete', 'insert'].includes(o.m)) || { m: 'select', a: [] };
    const eqs = {}; ops.filter((o) => o.m === 'eq').forEach((o) => { eqs[o.a[0]] = o.a[1]; });
    const tanIchi = ops.some((o) => o.m === 'maybeSingle' || o.m === 'single');
    if (eqs.account_id != null && eqs.account_id !== k.uid) return { data: null, error: { message: '別の 口（RLS）' } };
    if (t === 'pay_payslips') { k.slipOps.push(op.m + ':' + JSON.stringify(eqs)); return tanIchi ? { data: null, error: null } : { data: [], error: null }; }
    if (t === 'pay_companies') {
      if (op.m === 'select') {
        if (k.yomenai) return { data: null, error: { message: 'つながらない' } };
        if (k.yomiMachi) return 'YHOLD';
        if (!k.coUA) return { data: null, error: null };
        return { data: { data: k.coData, updated_at: k.coUA }, error: null };
      }
      if (op.m === 'update' || op.m === 'upsert') {
        if (k.otosu) return { data: null, error: { message: 'つながらない（送り 落ち）' } };
        if (op.m === 'update' && eqs.updated_at != null && k.coUA && Date.parse(eqs.updated_at) !== Date.parse(k.coUA)) return { data: [], error: null };
        k.coData = op.a[0].data; k.coUA = op.a[0].updated_at; k.coWrites.push(op.a[0]);
        if (k.hold) return 'HOLD';
        return { data: op.m === 'update' ? [{ updated_at: k.coUA }] : { updated_at: k.coUA }, error: null };
      }
    }
    if (t === 'pay_employees') {
      if (op.m === 'select') {
        if (k.yomenai) return { data: null, error: { message: 'つながらない' } };
        if (k.yomiMachi) return 'YHOLD';
        const cols = String(op.a[0] || '');
        const rows = cols.indexOf('data') >= 0 ? k.emps.map((r) => ({ data: r.data, sort: r.sort })) : k.emps.map((r) => ({ id: r.id }));
        return { data: rows, count: rows.length, error: null };
      }
      if (k.hold) return 'HOLD';
      if (op.m === 'upsert') {
        for (const r of op.a[0]) { k.empUpserts.push(r.id); const i = k.emps.findIndex((x) => x.id === r.id); if (i >= 0) k.emps[i] = { id: r.id, sort: r.sort, data: r.data }; else k.emps.push({ id: r.id, sort: r.sort, data: r.data }); }
        return { data: null, error: null };
      }
      if (op.m === 'delete') {
        const ids = (ops.find((o) => o.m === 'in') || { a: [null, []] }).a[1];
        const kieta = k.emps.filter((r) => ids.includes(r.id)).map((r) => ({ id: r.id }));
        k.emps = k.emps.filter((r) => !ids.includes(r.id)); k.deletes.push(...ids);
        return { data: kieta, error: null };
      }
    }
    return tanIchi ? { data: null, error: null } : { data: [], count: 0, error: null };
  }
  function from(t) {
    const ops = [];
    const ch = new Proxy({}, { get(_o, name) {
      if (name === 'then') return (f, r) => { const v = resolve(t, ops); return (v === 'HOLD' ? pending() : v === 'YHOLD' ? yomiP.then(() => resolve(t, ops)) : Promise.resolve(v)).then(f, r); };
      if (name === 'catch') return (r) => ch.then(undefined, r);
      return (...a) => { ops.push({ m: name, a }); return ch; };
    } });
    return ch;
  }
  const user = { id: opt.uid, email: opt.uid + '@example.invalid' };
  const auth = new Proxy({
    getUser: () => Promise.resolve({ data: { user: k.logged ? user : null }, error: null }),
    getSession: () => Promise.resolve({ data: { session: k.logged ? { user, access_token: 'x', refresh_token: 'r' } : null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
  }, { get(o, n) { return o[n] || (() => Promise.resolve({ data: {}, error: null })); } });
  k.client = new Proxy({ from, auth }, { get(o, n) { return o[n] || (() => from('rpc:' + String(n))); } });
  return k;
}
/* ★同じ ページで 口が 替わる★＝倉庫の 口を 差し替える 偽（sw.cur を 替えると 次の 呼びから 別の 人） */
function kirikae(k0) { const sw = { cur: k0 }; sw.client = new Proxy({}, { get(_o, n) { return sw.cur.client[n]; } }); return sw; }
const kakiA = (k) => JSON.stringify(k.coWrites) + JSON.stringify(k.emps);

async function hiraku(kura, ls, o2) {
  o2 = o2 || {};
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/kyuyo/index.html' });
  const win = dom.window, doc = win.document;
  for (const [key, v] of Object.entries(ls || {})) win.localStorage.setItem(key, v);
  if (o2.tanaOtosu) { const P = win.Storage.prototype, sv = P.setItem; P.setItem = function (key, v) { if (/^payslip_tana_v1@/.test(key)) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } return sv.call(this, key, v); }; }
  win.fetch = () => Promise.reject(new Error('no net')); win.alert = () => {}; win.confirm = () => true; win.scrollTo = () => {}; win.print = () => {};
  win.__RK_NAV__ = 'navigate'; win.__YOMI_MACHI_MS__ = 300;
  win.SUPA = { url: 'https://x.supabase.co', key: 'anon' };
  win.supabase = { createClient: () => kura.client };
  const el0 = doc.createElement('div');
  win.RakunallyLogin = { mount: (o) => { win.__loginOpts = o; return { el: el0, show() {}, hide() {}, error() {} }; }, friendly: (e) => String((e && e.message) || '') };
  const errs = []; win.console.error = (...a) => errs.push(a.map(String).join(' '));
  for (const [, src] of (o2.srcs || SRCS)) { const el = doc.createElement('script'); el.textContent = src; doc.body.appendChild(el); }
  if (o2.machiDake) { await sleep(300); return { win, A: win.__PAYSLIP_TEST, errs }; }   /* ★読み込みの 答えを 待たない★ */
  const A = win.__PAYSLIP_TEST;
  for (let i = 0; i < 60 && !(A && A.state && A.state._souko && A.state._souko !== 'machi'); i++) await sleep(100);
  if (o2.sugu) return { win, A, errs };
  await sleep(1500);   /* ★auth.js の afterLogin（読み直し→初回アップ→会社の 設定）が 済むまで★ */
  return { win, A, errs };
}
const lsDake = (win) => { const o = {}; const S = win.localStorage; for (let i = 0; i < S.length; i++) { const key = S.key(i); o[key] = S.getItem(key); } return o; };

let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };
console.log('\n[kaisha-uwagaki] 会社の 行が 在り 人 0人の 口で 開いても 会社の 設定を 既定で 上書きしない');

const boot = await hiraku(makeKura({ uid: 'u-boot' }), null);
const B0 = boot.A; boot.win.close();
if (!B0 || !B0.defEmp) { console.log('✗ ★立ち上がらない★ ' + boot.errs.slice(0, 3).join(' | ')); process.exit(1); }
const emp = (id, name) => Object.assign(B0.defEmp(), { id, name, pref: '東京都', birthYmd: '1990-01-01', base: 250000 });
const kaisha = (name, furi) => ({ v: 1, company: Object.assign(B0.defCompany(), { name, furiAccount: furi || '1234567' }), month: '2026-11' });
const furiOf = (o) => (JSON.stringify(o).match(/"furiAccount":"[0-9]*"/) || ['無し'])[0];
const saigo = (k) => (k.coWrites.length ? k.coWrites[k.coWrites.length - 1] : null);

const mado = (win) => win.document.querySelectorAll('.ui-modal-ov').length;
const madoJi = (win) => Array.from(win.document.querySelectorAll('.ui-modal-ov')).map((e) => e.textContent).join('|');
/* 2（＋開いた 後の 直し） */
async function bamen2(srcs) {
  const k = makeKura({ uid: 'u-K', coData: kaisha('Kの会社'), coUA: T0, emps: [] });
  const t = await hiraku(k, null, { srcs });
  const fu = String(t.A.state.company && t.A.state.company.furiAccount), nm = mado(t.win);
  const ok1 = !/"furiAccount":""/.test(JSON.stringify(k.coWrites)) && /1234567/.test(JSON.stringify(k.coData)) && fu === '1234567' && t.A.state._souko === 'ok' && nm === 0;
  const m1 = '倉庫の 書き ' + k.coWrites.length + '本（' + k.coWrites.map(furiOf).join(',') + '）／倉庫の 今=' + furiOf(k.coData) + '／画面=' + fu + '／窓=' + nm;
  t.A.state.company.furiName = 'カ）ケイ'; t.A.persistSaveDebounced(); await sleep(1500);
  const w = saigo(k);
  const ok2 = !!w && /1234567/.test(JSON.stringify(w)) && /カ）ケイ/.test(JSON.stringify(w));
  const m2 = '最後の 書き=' + (w ? furiOf(w) + '・名義 ' + (/カ）ケイ/.test(JSON.stringify(w)) ? '有り' : '無し') : '無し');
  t.win.close(); return { ok: ok1 && ok2, m: m1 + '／' + m2 };
}
/* 1 読み込み中に 直す → 倉庫を 採り 窓で 言う */
async function bamen1(srcs) {
  const k = makeKura({ uid: 'u-K', coData: kaisha('Kの会社'), coUA: T0, emps: [], yomiMachi: true });
  const t = await hiraku(k, null, { srcs, machiDake: true });
  const A = t.win.__PAYSLIP_TEST;
  if (!A || !A.state || A.state._souko !== 'machi') { const m = '前提：読み込み中で 止まって いない souko=' + (A && A.state && A.state._souko); t.win.close(); return { ok: false, m }; }
  A.state.company.furiAccount = '7654321'; A.persistSaveDebounced(); await sleep(900);
  k.toku(); await sleep(2500);
  A.state.company.furiName = 'カ）ケイ'; A.persistSaveDebounced(); await sleep(1500);
  const fu = String(A.state.company.furiAccount), nm = mado(t.win), ji = madoJi(t.win);
  const ok = fu === '1234567' && /1234567/.test(furiOf(k.coData)) && nm === 1 && /入っていません/.test(ji);
  const m = '画面=' + fu + '／倉庫の 今=' + furiOf(k.coData) + '／窓=' + nm + '（' + ji.slice(0, 40) + '）';
  t.win.close(); return { ok, m };
}
/* 3 読んだ 後の 直し→送り 落ち→読み直し→送り 戻る */
async function bamen3(srcs) {
  const k = makeKura({ uid: 'u-K', coData: kaisha('Kの会社'), coUA: T0, emps: [] });
  const t = await hiraku(k, null, { srcs });
  k.otosu = true; t.A.state.company.furiAccount = '7654321'; t.A.persistSaveDebounced(); await sleep(1500);
  let meta = {}; try { meta = JSON.parse(t.win.localStorage.getItem('payslip_syncmeta_v1') || '{}'); } catch {}
  if (meta.dirty !== true || /7654321/.test(furiOf(k.coData))) { const m = '前提：送りが 落ちて dirty に なって いない dirty=' + meta.dirty + '／倉庫=' + furiOf(k.coData); t.win.close(); return { ok: false, m }; }
  await t.win.PayslipReloadCloud(); await sleep(300);
  const fuMid = String(t.A.state.company.furiAccount);
  k.otosu = false; await t.win.PayslipReloadCloud(); await sleep(1500);
  const fu = String(t.A.state.company.furiAccount);
  const ok = fuMid === '7654321' && fu === '7654321' && /7654321/.test(furiOf(k.coData));
  const m = '読み直し 1回目の 画面=' + fuMid + '／2回目の 画面=' + fu + '／倉庫の 今=' + furiOf(k.coData);
  t.win.close(); return { ok, m };
}
/* 4 倉庫に 人・手元 0人・読んだ 後 → 倉庫の 人が 戻る */
async function bamen4b(srcs) {
  const k = makeKura({ uid: 'u-K', coData: kaisha('Kの会社'), coUA: T0, emps: [] });
  const t = await hiraku(k, null, { srcs });
  k.otosu = true; t.A.state.company.furiName = 'カ）ケイ'; t.A.persistSaveDebounced(); await sleep(1500);
  k.emps = [{ id: 'c1', sort: 0, data: emp('c1', 'Kの人1') }]; k.otosu = false;
  await t.win.PayslipReloadCloud(); await sleep(1500);
  const ids = (t.A.state.employees || []).map((e) => e.id).join(',');
  const ok = ids === 'c1' && k.emps.length === 1;
  const m = '画面の 人=' + (ids || '0人') + '／倉庫の 人=' + k.emps.map((e) => e.id).join(',');
  t.win.close(); return { ok, m };
}
/* ③c 前の 回の 送りが 落ちて 印が dirty の まま 0人 → 読み込み中に 線が 戻る（online）＝_drainIfDirty（taiketsu 叩き直し 止め2） */
async function bamen3c(srcs) {
  const k = makeKura({ uid: 'u-K', coData: kaisha('Kの会社'), coUA: T0, emps: [], yomiMachi: true });
  const t = await hiraku(k, { payslip_syncmeta_v1: JSON.stringify({ dirty: true, baseCoUA: null, kuchi: 'u-K' }) }, { srcs, machiDake: true });
  const A = t.win.__PAYSLIP_TEST;
  if (!A || !A.state || A.state._souko !== 'machi') { const m = '前提：読み込み中で 止まって いない'; t.win.close(); return { ok: false, m }; }
  t.win.dispatchEvent(new t.win.Event('online')); await sleep(900);
  k.toku(); await sleep(2500);
  const ok = !/"furiAccount":""/.test(JSON.stringify(k.coWrites)) && /1234567/.test(furiOf(k.coData)) && String(A.state.company.furiAccount) === '1234567';
  const m = '倉庫の 書き ' + k.coWrites.length + '本（' + k.coWrites.map(furiOf).join(',') + '）／倉庫の 今=' + furiOf(k.coData) + '／画面=' + A.state.company.furiAccount;
  t.win.close(); return { ok, m };
}
/* ④ 本当の 新規 */
async function bamen4(srcs) {
  const k = makeKura({ uid: 'u-N' });
  const t = await hiraku(k, null, { srcs });
  const ok = k.coWrites.length >= 1 && t.A.state._souko === 'ok';
  const m = '倉庫の 書き ' + k.coWrites.length + '本';
  t.win.close(); return { ok, m };
}
/* 測るだけ（別件＝taiketsu 任意C）：手元に 人（同じ 口・dirty 無し）・倉庫は 会社の 行（新しい 振込元）＋0人 */
async function hakaruC() {
  const k1 = makeKura({ uid: 'u-C', coData: kaisha('Cの会社', '1111111'), coUA: T0, emps: [emp('c1', 'Cの人1')] });
  const t1 = await hiraku(k1, null); t1.A.persistSaveDebounced(); await sleep(1500); const ls = lsDake(t1.win); t1.win.close();
  const k2 = makeKura({ uid: 'u-C', coData: kaisha('Cの会社', '2222222'), coUA: '2026-11-05T00:00:00.000Z', emps: [] });
  const t2 = await hiraku(k2, ls);
  const r = '倉庫の 振込元 2222222 → ' + furiOf(k2.coData) + '／倉庫の 人 ' + k2.emps.map((e) => e.id).join(',');
  t2.win.close(); return r;
}

const r1 = await bamen1();
T('1 ★読み込み中の 直しは 倉庫の 会社に 負けるが 窓で 1回 言う★（保存の 後も 残る）', r1.ok, r1.m);
const r2 = await bamen2();
T('2 会社の 行・0人で 触らず 開く→窓 0・倉庫へ 既定を 書かない・開いた 後の 直しは 振込元を 残して 届く', r2.ok, r2.m);
const r3 = await bamen3();
T('3 ★読んだ 後の 直し（送り 落ち）を 読み直しで 倉庫の 古い 値に 戻さない★', r3.ok, r3.m);
const r4b = await bamen4b();
T('4 倉庫に 人・手元 0人 なら 倉庫の 人が 戻る（前の 倒しの まま）', r4b.ok, r4b.m);
const r3c = await bamen3c();
T('5 ★前の 回の 未送信（dirty・0人）が 読み込み中に 送られても 倉庫の 会社を 既定で 上書きしない★', r3c.ok, r3c.m);
const r4 = await bamen4();
T('④ 本当の 新規（会社の 行も 人も 無い）は 前の まま 初回アップ', r4.ok, r4.m);
console.log('  （測るだけ・別件）手元に 人・倉庫は 会社の 行＋0人：' + await hakaruC());

/* ⑤ 自己確認 */
const KOWASU = [
  ['app：会社の 行＋0人なら 倉庫を 採る（(i)）', 'app.js', 'if(!_hitoCs && !_kaishaAri) return false;', 'if(!_hitoCs) return false;', (r) => !r.r2.ok && !r.r3c.ok, ['r2', 'r3c']],
  ['app：2回目は「手元 0人なら 倉庫」倒しを 外す', 'app.js', "dec.apply==='local' && !_hitoTe && !_kaishaNido){", "dec.apply==='local' && !_hitoTe){", (r) => !r.r3.ok, ['r3']],
  ['app：途中の 直しが 入らない 時の 窓', 'app.js', 'if(_kaishaKieru) uiAlert(', 'if(false) uiAlert(', (r) => !r.r1.ok, ['r1']]
];
const FN = { r1: bamen1, r2: bamen2, r3: bamen3, r3c: bamen3c };
for (const [na, f, kara, he, aka, mi] of KOWASU) {
  const n = SRCS.filter(([b, src]) => b === f && src.includes(kara)).length;
  if (n !== 1) { T('⑤ ' + na + '：外す 所が 1か所 見つかる', false, '見つかった=' + n); continue; }
  const srcs = SRCS.map(([b, src]) => [b, b === f ? src.replace(kara, he) : src]);
  const r = {}; for (const key of mi) r[key] = await FN[key](srcs);
  T('⑤ ' + na + ' を 外すと 赤', aka(r), '外しても 緑（' + mi.map((key) => key + '：' + r[key].m).join('／') + '）');
}

console.log('\n' + (fail ? '✗' : '✓') + ' kaisha-uwagaki: ' + pass + ' ✓ / ' + fail + ' ✗');
console.log('KEKKA {"passed":' + pass + ',"failed":' + fail + ',"mimiso":0}');   /* ★約束の行（tools/_bunrui.mjs 用）★ */
process.exit(fail ? 1 : 0);
