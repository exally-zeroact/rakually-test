/* maeno-hito-utsushi.test.mjs — ★前に 入った 人の 写しを 別の 人の 倉庫へ 書かない・画面に 出さない★（2026-11-14）
 * ============================================================================
 * ★疑い（odan の 候補・コンサル [45ab77]）★
 *   端末の 写し（localStorage 'payslip_state_v1'）は 人で 分けて いない。ログアウトは signOut→reload だけで 写しを 消さない。
 *   B が 入ると auth.js:60-61 は 倉庫を 読み、読めた 中身が 0人なら「新規」と 見て persistSave＝★A の 写しを B の 倉庫へ 書く★。
 * ★この 試験は 本物を 立ち上げる★＝本物の kyuyo/index.html の 部品（app.js・store.js・access.js・auth.js）を 偽の supabase で 動かす。
 *   ログイン画面の 部品（rakunally-login.js）だけ 偽物（画面は 見ない）。
 * ★見る 事★
 *   ① A が 使った 端末で（A は 保存まで 済み）B が 入る・B の 倉庫は 空（新規）→ B の 倉庫に A の 人・会社が 書かれない
 *   ② ①の 時 B の 画面に A の 人が 出ない
 *   ③ B の 倉庫に 人が 居る 時も B の 倉庫・画面に A の 人が 混ざらない（A が 未送信の まま 閉じた 端末）
 *   ④ B の 倉庫が 読めない 時も B の 倉庫に 書かない（store.js:609 の 門）
 *   ⑤ 同じ 人（A）が 入り直した 時は 手元の 写しを 使える（前の 動きを 壊さない）
 *   ⑥ ログインせずに 使った 写し（口の 印 無し）を 新規の 口へ 上げる「初回アップ」は 前の まま
 * 使い方: node kyuyo/tests/maeno-hito-utsushi.test.mjs [--bu=1〜12]（CI と 押す前の 網は 12段に 割って 回す・--bu 無し＝全部 約12分）
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
function makeKura(opt) {
  const k = { uid: opt.uid, coData: opt.coData || null, coUA: opt.coUA || null, emps: (opt.emps || []).map((e, i) => ({ id: e.id, sort: i, data: e })),
    yomenai: !!opt.yomenai, hold: false, coWrites: [], empUpserts: [], deletes: [], slipOps: [], logged: !opt.nashi };
  const pending = () => new Promise(() => {});
  function resolve(t, ops) {
    const op = ops.find((o) => ['select', 'update', 'upsert', 'delete', 'insert'].includes(o.m)) || { m: 'select', a: [] };
    const eqs = {}; ops.filter((o) => o.m === 'eq').forEach((o) => { eqs[o.a[0]] = o.a[1]; });
    const tanIchi = ops.some((o) => o.m === 'maybeSingle' || o.m === 'single');
    if (eqs.account_id != null && eqs.account_id !== k.uid) return { data: null, error: { message: '別の 口（RLS）' } };
    if (t === 'pay_payslips') { k.slipOps.push(op.m + ':' + JSON.stringify(eqs)); return tanIchi ? { data: null, error: null } : { data: [], error: null }; }
    if (t === 'pay_companies') {
      if (op.m === 'select') {
        if (k.yomenai) return { data: null, error: { message: 'つながらない' } };
        if (!k.coUA) return { data: null, error: null };
        return { data: { data: k.coData, updated_at: k.coUA }, error: null };
      }
      if (op.m === 'update' || op.m === 'upsert') {
        if (op.m === 'update' && eqs.updated_at != null && k.coUA && Date.parse(eqs.updated_at) !== Date.parse(k.coUA)) return { data: [], error: null };
        k.coData = op.a[0].data; k.coUA = op.a[0].updated_at; k.coWrites.push(op.a[0]);
        if (k.hold) return 'HOLD';
        return { data: op.m === 'update' ? [{ updated_at: k.coUA }] : { updated_at: k.coUA }, error: null };
      }
    }
    if (t === 'pay_employees') {
      if (op.m === 'select') {
        if (k.yomenai) return { data: null, error: { message: 'つながらない' } };
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
      if (name === 'then') return (f, r) => { const v = resolve(t, ops); return (v === 'HOLD' ? pending() : Promise.resolve(v)).then(f, r); };
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
  const A = win.__PAYSLIP_TEST;
  for (let i = 0; i < 60 && !(A && A.state && A.state._souko && A.state._souko !== 'machi'); i++) await sleep(100);
  if (o2.sugu) return { win, A, errs };
  await sleep(1500);   /* ★auth.js の afterLogin（読み直し→初回アップ→会社の 設定）が 済むまで★ */
  return { win, A, errs };
}
const lsDake = (win) => { const o = {}; const S = win.localStorage; for (let i = 0; i < S.length; i++) { const key = S.key(i); o[key] = S.getItem(key); } return o; };

let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };
/* ★段を 12に 分ける（--bu=1〜12）★＝全部で 1回 約12分（本体 約104秒＋⑫ 壊し1つ 約56秒×11）＝押す前の 網の 1段の 上限 180秒を 越えた（11-14 網が 180秒で 切った・3つずつでも 170秒）。
   --bu=1＝本体の 場面だけ（⑫ 無し）／--bu=2〜12＝⑫ の 壊しを 1つずつ（KOWASU の 順・本体は 走らせない）／--bu 無し＝全部。中身は 1つも 変えない。打ち間違いや 壊しの 数との ずれは 止める。 */
const buA = process.argv.filter((x) => x.indexOf('--bu') === 0);
if (buA.length > 1 || (buA.length === 1 && !/^--bu=([1-9]|1[0-2])$/.test(buA[0]))) {
  console.log('  ★--bu の 字が 違います（' + buA.join(' ') + '）＝何も 走らせずに 止めます★'); process.exit(2);
}
const BU = buA.length ? Number(buA[0].slice(5)) : 0;
const HONTAI = BU === 0 || BU === 1;
console.log('\n[maeno-hito-utsushi] 前に 入った 人の 写しを 別の 人の 倉庫へ 書かない・画面に 出さない');

/* defEmp/defCompany を 借りる */
const boot = await hiraku(makeKura({ uid: 'u-boot' }), null);
const B0 = boot.A; boot.win.close();
if (!B0 || !B0.defEmp) { console.log('✗ ★立ち上がらない★ ' + boot.errs.slice(0, 3).join(' | ')); process.exit(1); }
const emp = (id, name) => Object.assign(B0.defEmp(), { id, name, pref: '東京都', birthYmd: '1990-01-01', base: 250000 });
const kaisha = (name) => ({ v: 1, company: Object.assign(B0.defCompany(), { name, furiAccount: '1234567' }), month: '2026-11' });
const idsOf = (A) => (A.state.employees || []).map((e) => e.id).join(',');

/* A が 使った 端末を 作る（A の 倉庫に 2人・開いて 1回 保存して 閉じる）＝返り＝閉じた 時の localStorage */
async function aGaTsukatta(tojiruMae, srcs) {
  const kA = makeKura({ uid: 'u-A', coData: kaisha('Aの会社'), coUA: T0, emps: [emp('a1', 'Aの人1'), emp('a2', 'Aの人2')] });
  const tA = await hiraku(kA, null, { srcs });
  if (idsOf(tA.A) !== 'a1,a2') { T('前提：A の 端末で A の 人が 読めた', false, idsOf(tA.A) + '／' + tA.errs.slice(0, 3).join(' | ')); }
  if (tojiruMae) await tojiruMae(tA, kA);
  else { tA.A.persistSaveDebounced(); await sleep(1500); }
  const ls = lsDake(tA.win); tA.win.close();
  return ls;
}

/* ①② B は 新規（倉庫 空） */
if (HONTAI) {
  const ls = await aGaTsukatta();
  T('前提：写しに A の 人が 居る', /Aの人1/.test(ls.payslip_state_v1 || ''), (ls.payslip_state_v1 || '').slice(0, 80));
  const kB = makeKura({ uid: 'u-B' });
  const tB = await hiraku(kB, ls);
  const kaki = JSON.stringify(kB.coWrites) + JSON.stringify(kB.emps);
  T('① ★B の 倉庫に A の 人を 書かない★', !kB.emps.some((r) => /^a/.test(r.id)) && !/Aの人/.test(kaki), '倉庫の 人=' + kB.emps.map((r) => r.id).join(','));
  T('① ★B の 倉庫に A の 会社を 書かない★', !/Aの会社/.test(kaki), '会社の 書き=' + kB.coWrites.length);
  T('② ★B の 画面に A の 人が 出ない★', !/a1|a2/.test(idsOf(tB.A)), '画面の 人=' + idsOf(tB.A));
  T('② ★B の 画面に A の 会社名が 出ない★', !/Aの会社/.test(String(tB.A.state.company && tB.A.state.company.name)), '会社名=' + (tB.A.state.company && tB.A.state.company.name));
  tB.win.close();
}

/* ③ B に 人が 居る・A は 未送信の まま 閉じた（dirty）＋A の 確定の 控え */
if (HONTAI) {
  const ls = await aGaTsukatta(async (tA, kA) => {
    kA.hold = true;
    tA.A.state.confirmed = Object.assign({}, tA.A.state.confirmed || {}, { '2026-10': { a1: { net: 200000 } } });
    tA.A.state.employees[0].name = 'Aの人1（直した）';
    tA.A.persistSaveDebounced(); await sleep(1500);
  });
  const kB = makeKura({ uid: 'u-B', coData: kaisha('Bの会社'), coUA: '2026-11-02T00:00:00.000Z', emps: [emp('b1', 'Bの人')] });
  const tB = await hiraku(kB, ls);
  const kaki = JSON.stringify(kB.coWrites) + JSON.stringify(kB.emps);
  T('③ ★B の 画面は B の 人だけ★', idsOf(tB.A) === 'b1', '画面の 人=' + idsOf(tB.A));
  T('③ ★B の 倉庫に A の 人・確定の 控えを 書かない★', !/Aの人|"a1"|a2/.test(kaki), '会社の 書き=' + kB.coWrites.length + '／倉庫の 人=' + kB.emps.map((r) => r.id).join(','));
  T('③ ★B の 画面の 確定の 控えに A の 物が 混ざらない★', !/a1/.test(JSON.stringify(tB.A.state.confirmed || {})), JSON.stringify(tB.A.state.confirmed || {}).slice(0, 120));
  tB.win.close();
}

/* ④ B の 倉庫が 読めない */
if (HONTAI) {
  const ls = await aGaTsukatta();
  const kB = makeKura({ uid: 'u-B', yomenai: true });
  const tB = await hiraku(kB, ls);
  T('④ B の 倉庫が 読めない 時も B の 倉庫に 書かない', kB.coWrites.length === 0 && kB.empUpserts.length === 0, '会社の 書き=' + kB.coWrites.length + '／人の 書き=' + kB.empUpserts.length);
  T('④ B の 倉庫が 読めない 時も B の 画面に A の 人が 出ない', !/a1|a2/.test(idsOf(tB.A)), '画面の 人=' + idsOf(tB.A) + '／souko=' + tB.A.state._souko);
  tB.win.close();
}

/* ⑤ 同じ A が 入り直す（倉庫が 空に 見える 事は 無いので、倉庫は 前の まま）＝手元の 写しで 読み込み中も 壊れない */
if (HONTAI) {
  const ls = await aGaTsukatta();
  const kA2 = makeKura({ uid: 'u-A', coData: kaisha('Aの会社'), coUA: T0, emps: [emp('a1', 'Aの人1'), emp('a2', 'Aの人2')] });
  const tA2 = await hiraku(kA2, ls);
  T('⑤ 同じ A が 入り直すと A の 人が 出る（前の 動き）', idsOf(tA2.A) === 'a1,a2', '画面の 人=' + idsOf(tA2.A));
  tA2.win.close();
}

/* ⑥ ログインせずに 使った 写し（口の 印 無し）を 新規の 口へ 上げる（初回アップ＝前の まま） */
if (HONTAI) {
  const u = { v: 1, company: Object.assign(B0.defCompany(), { name: '手元の会社' }), month: '2026-11', employees: [emp('l1', '手元の人')] };
  const kN = makeKura({ uid: 'u-N' });
  const tN = await hiraku(kN, { payslip_state_v1: JSON.stringify(u) });
  T('⑥ ログイン前の 写しは 新規の 口へ 初回アップされる（前の 動き）', kN.emps.some((r) => r.id === 'l1'), '倉庫の 人=' + kN.emps.map((r) => r.id).join(',') + '／' + tN.errs.slice(0, 2).join(' | '));
  tN.win.close();
}

/* ⑦ セッション 無しで 開く（A の 写し）→ ログイン画面の 上で 押す → B が 入る（S1＝口が 決まる 前の 保存） */
async function bamen7(srcs) {
  const ls = await aGaTsukatta();
  const kB = makeKura({ uid: 'u-B', nashi: true });
  const tB = await hiraku(kB, ls, { srcs });
  tB.win.document.body.dispatchEvent(new tB.win.Event('click', { bubbles: true }));
  tB.win.document.body.dispatchEvent(new tB.win.Event('input', { bubbles: true }));
  kB.logged = true; tB.win.__loginOpts.onLogin({ email: 'u-B@example.invalid' });
  await sleep(2500);
  const r = { kaki: !/Aの人|Aの会社/.test(kakiA(kB)) && !kB.emps.some((x) => /^a/.test(x.id)), gamen: !/a1|a2/.test(idsOf(tB.A)), kB, ids: idsOf(tB.A) };
  tB.win.close(); return r;
}
if (HONTAI) {
  const r = await bamen7();
  T('⑦ ★ログイン画面で 押してから B が 入っても B の 倉庫に A を 書かない★', r.kaki, kakiA(r.kB).slice(0, 160));
  T('⑦ ★その 後の B の 画面に A の 人が 出ない★', r.gamen, '画面の 人=' + r.ids);
}

/* ⑦b 同じ ページで A が 入って いて、B に 替わる（切れて 入り直し） */
async function bamen7b(srcs) {
  const kA = makeKura({ uid: 'u-A', coData: kaisha('Aの会社'), coUA: T0, emps: [emp('a1', 'Aの人1'), emp('a2', 'Aの人2')] });
  const sw = kirikae(kA);
  const t = await hiraku(sw, null, { srcs });
  const kB = makeKura({ uid: 'u-B' });
  sw.cur = kB; t.win.__loginOpts.onLogin({ email: 'u-B@example.invalid' });
  t.win.document.body.dispatchEvent(new t.win.Event('click', { bubbles: true }));
  await sleep(2500);
  const r = { kaki: !/Aの人|Aの会社/.test(kakiA(kB)), gamen: !/a1|a2/.test(idsOf(t.A)), kA, kB, ids: idsOf(t.A) };
  t.win.close(); return r;
}
if (HONTAI) {
  const r = await bamen7b();
  T('⑦b ★同じ ページで B に 替わっても B の 倉庫に A を 書かない★', r.kaki, kakiA(r.kB).slice(0, 160));
  T('⑦b ★同じ ページで B に 替わった 後の 画面に A の 人が 出ない★', r.gamen, '画面の 人=' + r.ids);
  T('⑦b A の 倉庫は 減らない', r.kA.emps.length === 2 && r.kA.deletes.length === 0, '人=' + r.kA.emps.length + '／消し=' + r.kA.deletes.length);
}

/* ⑧ A の 端末に 退職者 a1 の 確定の 取り消し（machi）が 残る → B が 入る（S2＝外しを B へ 送って 控えを 消さない） */
async function bamen8(srcs) {
  const ls = await aGaTsukatta(async (tA) => { tA.A.state.employees[0].taishokuYmd = '2026-09-30'; tA.A.persistSaveDebounced(); await sleep(1500); });
  ls.payslip_hazushi_v1 = JSON.stringify({ '2026-10|a1': 'machi' });
  const kB = makeKura({ uid: 'u-B' });
  const tB = await hiraku(kB, ls, { srcs });
  tB.win.document.body.dispatchEvent(new tB.win.Event('click', { bubbles: true }));
  await sleep(1500);
  const nokori = Object.entries(lsDake(tB.win)).filter(([key]) => /hazushi|tana/.test(key)).map(([, v]) => v).join('');
  const r = { okuranai: kB.slipOps.length === 0, ops: kB.slipOps.join(' '), nokoru: /2026-10\|a1/.test(nokori), nokori };
  tB.win.close(); return r;
}
if (HONTAI) {
  const r = await bamen8();
  T('⑧ ★B の 倉庫へ A の 人の 確定の 外しを 送らない★', r.okuranai, r.ops);
  T('⑧ ★A の 取り消しの 控えは 消えずに 残る★', r.nokoru, r.nokori.slice(0, 160));
}

/* ⑨ 古い 写し（口の 印 無し・名簿 無し）＋未送信 → A が 入り直す／B が 入る（S3） */
async function furuiUtsushi() {
  const ls = await aGaTsukatta(async (tA, kA) => {
    kA.hold = true; tA.A.state.employees[0].name = 'Aの人1（直した）'; tA.A.persistSaveDebounced(); await sleep(1500);
  });
  const s = JSON.parse(ls.payslip_state_v1); delete s._kuchi; delete s._okutta; ls.payslip_state_v1 = JSON.stringify(s);
  const m = JSON.parse(ls.payslip_syncmeta_v1 || '{}'); delete m.kuchi; ls.payslip_syncmeta_v1 = JSON.stringify(m);   /* ★前の 形＝同期の 印にも 口が 無い★ */
  return ls;
}
if (HONTAI) {
  const ls = await furuiUtsushi();
  const kA2 = makeKura({ uid: 'u-A', coData: kaisha('Aの会社'), coUA: T0, emps: [emp('a1', 'Aの人1'), emp('a2', 'Aの人2')] });
  const tA2 = await hiraku(kA2, ls);
  const n = ((tA2.A.state.employees || [])[0] || {}).name;
  T('⑨ ★古い 写しの A の 未送信の 直しは A が 入り直すと 残る★', n === 'Aの人1（直した）', '名前=' + n);
  tA2.win.close();
}
if (HONTAI) {
  const ls = await furuiUtsushi();
  const kB = makeKura({ uid: 'u-B', coData: kaisha('Bの会社'), coUA: '2026-11-02T00:00:00.000Z', emps: [emp('b1', 'Bの人')] });
  const tB = await hiraku(kB, ls);
  const L = lsDake(tB.win);
  T('⑨ 古い 写しで B が 入ると 画面は B の 人だけ', idsOf(tB.A) === 'b1', '画面の 人=' + idsOf(tB.A));
  T('⑨ 古い 写しで B が 入っても B の 倉庫に A を 書かない', !/Aの人/.test(kakiA(kB)), kakiA(kB).slice(0, 160));
  T('⑨ ★口の 分からない 写しは 棚（@?…）に 残す＝消さない★', Object.keys(L).some((key) => /^payslip_tana_v1@\?/.test(key) && /直した/.test(L[key])), Object.keys(L).join(','));
  tB.win.close();
}

/* ⑩ 棚に 書けない（容量）→ 写しを 消さない・B に 書かない・黙らない（S4） */
if (HONTAI) {
  const ls = await aGaTsukatta();
  const kB = makeKura({ uid: 'u-B' });
  const tB = await hiraku(kB, ls, { tanaOtosu: true });
  tB.win.document.body.dispatchEvent(new tB.win.Event('click', { bubbles: true }));
  await sleep(1500);
  const L = lsDake(tB.win);
  T('⑩ ★棚に 書けない 時は A の 写しを 消さない★', /Aの人1/.test(L.payslip_state_v1 || ''), (L.payslip_state_v1 || '(無い)').slice(0, 80));
  T('⑩ 棚に 書けない 時も B の 倉庫に A を 書かない', !/Aの人|Aの会社/.test(kakiA(kB)), kakiA(kB).slice(0, 160));
  T('⑩ 棚に 書けない 時も B の 画面に A の 人が 出ない', !/a1|a2/.test(idsOf(tB.A)), '画面の 人=' + idsOf(tB.A));
  T('⑩ 棚に 書けない 事を 黙らない（console.error）', tB.errs.some((e) => /棚へ 移せません/.test(e)), tB.errs.slice(0, 3).join(' | '));
  tB.win.close();
}

/* ⑪ A（未送信）→ B が 開いて 閉じる → A が 戻る＝A の 未送信の 直しが 戻る */
if (HONTAI) {
  const ls = await aGaTsukatta(async (tA, kA) => {
    kA.hold = true; tA.A.state.employees[0].name = 'Aの人1（直した）'; tA.A.persistSaveDebounced(); await sleep(1500);
  });
  const kB = makeKura({ uid: 'u-B', coData: kaisha('Bの会社'), coUA: '2026-11-02T00:00:00.000Z', emps: [emp('b1', 'Bの人')] });
  const tB = await hiraku(kB, ls);
  tB.win.document.body.dispatchEvent(new tB.win.Event('click', { bubbles: true }));
  await sleep(1500);
  const ls2 = lsDake(tB.win); tB.win.close();
  const kA2 = makeKura({ uid: 'u-A', coData: kaisha('Aの会社'), coUA: T0, emps: [emp('a1', 'Aの人1'), emp('a2', 'Aの人2')] });
  const tA2 = await hiraku(kA2, ls2);
  const n = ((tA2.A.state.employees || [])[0] || {}).name;
  T('⑪ ★A→B→A で A の 未送信の 直しが 戻る★', n === 'Aの人1（直した）' && idsOf(tA2.A) === 'a1,a2', '人=' + idsOf(tA2.A) + '／名前=' + n);
  T('⑪ B の 倉庫に A を 書かない／A の 倉庫に B を 書かない', !/Aの人/.test(kakiA(kB)) && !/Bの人|Bの会社/.test(kakiA(kA2)), '');
  tA2.win.close();
}

/* ⑦c ★競り合い★＝B の セッションが 来たが 画面の 読み直し（onLogin）が まだ の 間に 保存が 走る（store の 門だけが 止める 道・S1/S2）
   A の 写し（退職者 a1 の 確定の 取り消し machi 付き）で セッション 無しで 開く → B の セッションが 来る → 押す */
async function bamen7c(srcs) {
  const ls = await aGaTsukatta(async (tA) => { tA.A.state.employees[0].taishokuYmd = '2026-09-30'; tA.A.persistSaveDebounced(); await sleep(1500); });
  ls.payslip_hazushi_v1 = JSON.stringify({ '2026-10|a1': 'machi' });
  const kB = makeKura({ uid: 'u-B', nashi: true });
  const tB = await hiraku(kB, ls, { srcs });
  kB.logged = true;
  tB.win.document.body.dispatchEvent(new tB.win.Event('click', { bubbles: true }));
  await sleep(2000);
  const L = lsDake(tB.win);
  const r = { kaki: !/Aの人|Aの会社/.test(kakiA(kB)) && kB.empUpserts.length === 0, kB, slip: kB.slipOps.length === 0, ops: kB.slipOps.join(' '),
    nokoru: /2026-10\|a1/.test(L.payslip_hazushi_v1 || ''), kai: (tB.win.Store.kuchiMadaKai ? tB.win.Store.kuchiMadaKai() : null) };
  r.hashitta = !!(r.kai && r.kai.kaisha > 0 && r.kai.meisai > 0 && r.kai.hazushi > 0) ? 'はい' : '';
  tB.win.close(); return r;
}
if (HONTAI) {
  const r = await bamen7c();
  T('⑦c ★口が 決まる 前の 保存は B の 倉庫に A の 会社・人を 書かない★', r.kaki, kakiA(r.kB).slice(0, 160));
  T('⑦c ★口が 決まる 前は B の 倉庫へ A の 明細・確定の 外しを 送らない★', r.slip, r.ops);
  T('⑦c 口が 決まる 前は A の 取り消しの 控えを 消さない', r.nokoru, '');
  T('⑦c 前提：口が 決まる 前に 明細（下書き）・確定の 外しの 道が 走った', r.hashitta, '門で 止めた 回数＝' + JSON.stringify(r.kai));
}

/* ⑪b 名簿（_okutta）の 無い 写し（口の 印 _kuchi だけ）で A→B→A＝口の 印で A の 棚に 移り、A に 戻る */
async function bamen11b(srcs) {
  const ls = await aGaTsukatta(async (tA, kA) => {
    kA.hold = true; tA.A.state.employees[0].name = 'Aの人1（直した）'; tA.A.persistSaveDebounced(); await sleep(1500);
  }, srcs);
  const s = JSON.parse(ls.payslip_state_v1); delete s._okutta; ls.payslip_state_v1 = JSON.stringify(s);
  const m = JSON.parse(ls.payslip_syncmeta_v1 || '{}'); delete m.kuchi; ls.payslip_syncmeta_v1 = JSON.stringify(m);   /* ★写しの 口の 印 だけが 頼り★ */
  const kB = makeKura({ uid: 'u-B', coData: kaisha('Bの会社'), coUA: '2026-11-02T00:00:00.000Z', emps: [emp('b1', 'Bの人')] });
  const tB = await hiraku(kB, ls, { srcs });
  const ls2 = lsDake(tB.win); tB.win.close();
  const kA2 = makeKura({ uid: 'u-A', coData: kaisha('Aの会社'), coUA: T0, emps: [emp('a1', 'Aの人1'), emp('a2', 'Aの人2')] });
  const tA2 = await hiraku(kA2, ls2, { srcs });
  const n = ((tA2.A.state.employees || [])[0] || {}).name;
  tA2.win.close(); return { ok: n === 'Aの人1（直した）', n };
}
if (HONTAI) {
  const r = await bamen11b();
  T('⑪b ★名簿の 無い 写しでも 口の 印で A→B→A の 未送信が 戻る★', r.ok, '名前=' + r.n);
}

/* ⑬ 古い 写し（口の 印 無し・名簿 無し）で A が 0人・会社だけ 入力済み → B が 入る（taiketsu 叩き直し 止め-1 の 見立て）。
   ★測った＝起きない★：_utsushiYomu は 人が 居る 写しだけ state へ 入れる＝0人の 写しの 会社（振込元）は 読まれない。見張りとして 残す。
   （A 本人の 0人の 写しの 会社の 直しも 読まれず、倉庫の 会社が 既定で 上書きされる＝★別件「会社設定の上書き」★＝ここでは 見ない） */
/* A は 新規の 口で 会社だけ 入れて 1回 届けた（倉庫＝Aの会社・時刻 X）→ 直して 届かずに 閉じた（dirty・基準 X） */
async function furui0nin(srcs) {
  const kA = makeKura({ uid: 'u-A' });
  const tA = await hiraku(kA, null, { srcs });
  tA.A.state.company.furiAccount = '1234567'; tA.A.persistSaveDebounced(); await sleep(1500);
  kA.hold = true; tA.A.state.company.furiAccount = '7654321'; tA.A.persistSaveDebounced(); await sleep(1500);   /* ★会社名は 入口の 会社の 設定（yago）で 読み直される＝振込元の 口座で 見る★ */
  const ls = lsDake(tA.win); tA.win.close();
  ls.__kA = { coData: kA.coData, coUA: kA.coUA };
  const s = JSON.parse(ls.payslip_state_v1); delete s._kuchi; delete s._okutta; ls.payslip_state_v1 = JSON.stringify(s);
  const m = JSON.parse(ls.payslip_syncmeta_v1 || '{}'); delete m.kuchi; ls.payslip_syncmeta_v1 = JSON.stringify(m);
  return ls;
}
async function bamen13(srcs) {
  const out = {};
  { const ls = await furui0nin(srcs); const kA0 = ls.__kA; delete ls.__kA; const kB = makeKura({ uid: 'u-B' }); const tB = await hiraku(kB, ls, { srcs });
    const fu = String(tB.A.state.company && tB.A.state.company.furiAccount);
    out.shinki = !/1234567|7654321/.test(JSON.stringify(kB.coWrites)) && !/1234567|7654321/.test(fu);
    out.shinkiM = '倉庫の 書き ' + kB.coWrites.length + '本 振込元＝' + (JSON.stringify(kB.coWrites).match(/"furiAccount":"[0-9]*"/) || ['無し'])[0] + '／画面の 振込元=' + fu;
    out.tana = Object.keys(lsDake(tB.win)).some((key) => /^payslip_tana_v1@\?/.test(key)); tB.win.close(); }
  { const ls = await furui0nin(srcs); const kA0 = ls.__kA; delete ls.__kA; const kB = makeKura({ uid: 'u-B', coData: kaisha('Bの会社'), coUA: '2026-11-02T00:00:00.000Z', emps: [] }); const tB = await hiraku(kB, ls, { srcs });
    out.uwagaki = !/7654321/.test(JSON.stringify(kB.coWrites)) && !/7654321/.test(JSON.stringify(kB.coData)); out.uwagakiM = '倉庫の 振込元＝' + (JSON.stringify(kB.coData).match(/"furiAccount":"[0-9]*"/) || ['無し'])[0]; tB.win.close(); }
  return out;
}
if (HONTAI) {
  const r = await bamen13();
  T('⑬ 0人・会社だけの 古い 写しで 新規の B が 入っても B の 倉庫・画面に A の 振込元を 出さない', r.shinki, r.shinkiM);
  T('⑬ 会社の 行が 在る 0人の B の 倉庫へ A の 振込元を 書かない', r.uwagaki, r.uwagakiM);
}

/* ⑭ 開いた 時に 口（getUser）が 通信で 落ちた → 網が 戻ってから 直す＝★「自動保存済」と 言わない★（止め-2＝倉庫へは 書いて いない） */
async function bamen14(srcs) {
  const kA = makeKura({ uid: 'u-A', coData: kaisha('Aの会社'), coUA: T0, emps: [emp('a1', 'Aの人1')] });
  const g0 = kA.client.auth.getUser; let ochi = true;
  kA.client.auth.getUser = () => ochi ? Promise.resolve({ data: { user: null }, error: { name: 'AuthRetryableFetchError', message: 'つながらない' } }) : g0();
  const tA = await hiraku(kA, null, { srcs });
  ochi = false;
  tA.A.state.company.name = 'Aの会社（直した）'; tA.A.persistSaveDebounced(); await sleep(1500);
  const sa = tA.win.document.getElementById('save-alert'); const ji = sa && !sa.hidden ? String(sa.textContent || '') : '(帯 無し＝保存できた 扱い)';   /* ★どの 画面でも 見える 帯（hozonFuda）★ */
  const ok = kA.coWrites.length === 0 && /読み込めていない/.test(ji);
  tA.win.close(); return { ok, ji, kaki: kA.coWrites.length };
}
/* ⑭b 口が 決まった 後に 別の 口に 替わった（同じ 端末の 別の タブ 等）＝kuchi-mada でも「自動保存済」と 言わない */
async function bamen14b(srcs) {
  const kA = makeKura({ uid: 'u-A', coData: kaisha('Aの会社'), coUA: T0, emps: [emp('a1', 'Aの人1')] });
  const tA = await hiraku(kA, null, { srcs });
  const n0 = kA.coWrites.length;
  tA.win.Store.setKakuKuchi('u-B');
  tA.A.state.company.name = 'Aの会社（直した）'; tA.A.persistSaveDebounced(); await sleep(1500);
  const sa = tA.win.document.getElementById('save-alert'); const ji = sa && !sa.hidden ? String(sa.textContent || '') : '(帯 無し＝保存できた 扱い)';   /* ★どの 画面でも 見える 帯（hozonFuda）★ */
  const ok = kA.coWrites.length === n0 && /まだ 保存していません/.test(ji);
  tA.win.close(); return { ok, ji, kaki: kA.coWrites.length - n0 };
}
if (HONTAI) {
  const r = await bamen14();
  T('⑭ ★口が 落ちた 後は 書かず 帯で「読み込めていない」と 言う（保存できた 扱いに しない）★', r.ok, '字=' + r.ji + '／会社の 書き=' + r.kaki);
  const r2 = await bamen14b();
  T('⑭b ★口が 合わない 間は 書かず 帯で「まだ 保存していません」と 言う★', r2.ok, '字=' + r2.ji + '／会社の 書き=' + r2.kaki);
}

/* ⑫ ★自己確認＝門を 1つずつ 外すと どれかの 場面が 赤に なる★（外しても 緑なら その 門は 見張られて いない） */
async function bamen1(srcs) {
  const ls = await aGaTsukatta();
  const kB = makeKura({ uid: 'u-B' });
  const tB = await hiraku(kB, ls, { srcs });
  const ok = !/Aの人|Aの会社/.test(kakiA(kB)) && !/a1|a2/.test(idsOf(tB.A));
  tB.win.close(); return ok;
}
async function bamen10(srcs) {
  const ls = await aGaTsukatta();
  const kB = makeKura({ uid: 'u-B' });
  const tB = await hiraku(kB, ls, { tanaOtosu: true, srcs });
  tB.win.document.body.dispatchEvent(new tB.win.Event('click', { bubbles: true }));
  await sleep(1500);
  const ok = /Aの人1/.test(lsDake(tB.win).payslip_state_v1 || '') && !/Aの人|Aの会社/.test(kakiA(kB));
  tB.win.close(); return ok;
}
const KOWASU = [
  ['store：書く 口の 門（realSave）', 'store.js', "if(_kuchiChigau(uid) || (state && state._kuchi != null && state._kuchi !== uid)){ _kuchiMadaKai.kaisha++; return { ok:false, reason:'kuchi-mada' }; }", ''],
  ['store：明細の 保存の 門', 'store.js', "if(_kuchiChigau(uid)) throw _kuchiMadaErr('明細');", ''],
  ['store：明細の 確定の 外しの 門', 'store.js', "if(_kuchiChigau(uid)) throw _kuchiMadaErr('明細の 確定の 外し');", ''],
  ['store：閉じた 門（null でも 止める）', 'store.js', 'return _kuchiKanri && (!_kakuKuchi || _kakuKuchi !== uid);', 'return _kuchiKanri && (_kakuKuchi && _kakuKuchi !== uid);'],
  ['app：門の 届け出', 'app.js', 'if(window.Store&&Store.kuchiKanri) Store.kuchiKanri();', 'if(0) Store.kuchiKanri();'],
  ['app：口合わせ（読めた 時）', 'app.js', '_kuchiAwase(_yondaUid, cs, true);', ''],
  ['app：口合わせ（読めない 時）', 'app.js', '_kuchiAwase(_yondaUid, null, false);', ''],
  ['app：棚に 書けない 時は 写しを 書かない', 'app.js', 'if(_utsushiTomeru) return false;', ''],
  ['app：写しの 持ち主の 印', 'app.js', "if(_stateKuchi && _stateKuchi!=='?') o._kuchi=_stateKuchi;", ''],
  ['store：読み込み落ちを 門より 先に（止め-2）', 'store.js', "        if(_yomiOchitaUid && (_yomiOchitaUid === '*' || _yomiOchitaUid === uid)) return { ok:false, reason:'load-failed' };" + '\n' + "        if(_kuchiChigau(uid)", "        if(_kuchiChigau(uid)"],
  ['app：口が 合わない 時の 帯（止め-2・前の 形＝kuchi-mada を 黙る）', 'app.js', "else if(r&&r.ok===false&&r.reason==='kuchi-mada'){ setS(", "else if(r&&r.ok===false&&r.reason==='kuchi-mada'){ if(lsOk){ state._savedAt=hhmm; setS('自動保存済 '+hhmm, 'ok'); } if(0) setS("]
];
const BAMEN = [['①', bamen1], ['⑦', async (s) => { const r = await bamen7(s); return r.kaki && r.gamen; }], ['⑦b', async (s) => { const r = await bamen7b(s); return r.kaki && r.gamen; }],
  ['⑧', async (s) => { const r = await bamen8(s); return r.okuranai && r.nokoru; }], ['⑩', bamen10]];
const BAMEN_YOMENAI = async (s) => {   /* ④ */
  const ls = await aGaTsukatta(); const kB = makeKura({ uid: 'u-B', yomenai: true });
  const tB = await hiraku(kB, ls, { srcs: s }); const ok = !/a1|a2/.test(idsOf(tB.A)); tB.win.close(); return ok;
};
BAMEN.push(['④', BAMEN_YOMENAI]);
BAMEN.push(['⑦c', async (s) => { const r = await bamen7c(s); return r.kaki && r.slip && r.nokoru; }]);
BAMEN.push(['⑪b', async (s) => (await bamen11b(s)).ok]);
BAMEN.push(['⑭', async (s) => (await bamen14(s)).ok]);
BAMEN.push(['⑭b', async (s) => (await bamen14b(s)).ok]);
const KOWASU_KONO = (process.env.MAENO_SUGU || BU === 1) ? [] : (BU >= 2 ? KOWASU.filter((_k, i) => i === BU - 2) : KOWASU);
console.log('  段 ' + (BU || '全部') + '＝本体 ' + (HONTAI ? '有り' : '無し') + '・⑫ の 壊し ' + KOWASU_KONO.length + '／' + KOWASU.length);
if (KOWASU.length !== 11) { console.log('  ★壊しの 数が ' + KOWASU.length + '（段割りは 11 の つもり）＝ci.yml の --bu の 段を 直す★'); process.exit(2); }
if (BU >= 2 && !KOWASU_KONO.length) { console.log('  ★この 段に 壊す 所が 0＝空振り★'); process.exit(1); }
for (const [na, f, kara, he] of KOWASU_KONO) {   /* MAENO_SUGU=1＝⑫ を 飛ばす（直す 途中の 速い 回し・本番前は 必ず 全部） */
  const n = SRCS.filter(([b, src]) => b === f && src.includes(kara)).length;
  if (n !== 1) { T('⑫ ' + na + '：外す 所が 1か所 見つかる', false, '見つかった=' + n); continue; }
  const srcs = SRCS.map(([b, src]) => [b, b === f ? src.replace(kara, he) : src]);
  const aka = [];
  for (const [bn, fn] of BAMEN) { if (!(await fn(srcs))) aka.push(bn); }
  T('⑫ ' + na + ' を 外すと 赤', aka.length > 0, '外しても 全部 緑');
  if (aka.length) console.log('      赤に なった 場面＝' + aka.join(' '));
}

console.log('\n' + (fail ? '✗' : '✓') + ' maeno-hito-utsushi: ' + pass + ' ✓ / ' + fail + ' ✗');
console.log('KEKKA {"passed":' + pass + ',"failed":' + fail + ',"mimiso":0}');   /* ★約束の行（tools/_bunrui.mjs 用）★ */
process.exit(fail ? 1 : 0);
