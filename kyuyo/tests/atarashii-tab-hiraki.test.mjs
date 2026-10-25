/* atarashii-tab-hiraki.test.mjs — ★押して すぐ 閉じる・iPhone で アプリを 払う → 新しい タブで 開き直しても 消した 人が 戻らない★（案a・2026-10-25）
 * ============================================================================
 * ★客の 穴★ … 人を 消す → 保存（会社の 行は 倉庫に 着く・人の 書きと 差分削除は まだ）→ 閉じる。
 *   開き直しは 新しい タブ（タブの 控え sessionStorage も 消える）＝「倉庫の 会社の 時刻＝自分が 送った 値」と 分からず、
 *   両方 編集＝倉庫を 採る に 倒れて ★消した 人が 黙って 戻る・他の 編集も 黙って 消える★。
 * ★直し★ … 自分が 送った 時刻の 名簿を 写し（payslip_state_v1）の 中に、中身と 同じ 1回の setItem で 持つ（_okutta）。
 * ★この 試験は 本物を 立ち上げる★ … 本物の kyuyo/index.html の 部品（app.js・store.js …）を 偽の supabase で 動かす
 *   （isOwnCompanyUA・cloudSaveState を 差し替えない＝store の 口 → app の 写しの 書き の つなぎを 通る・taiketsu 10-25 止める-2）。
 * ★見る 事★
 *   ① 会社だけ 着いて 閉じ、localStorage だけ 持って 新しい タブで 開く → 手元を 採り、消した 人に DELETE が 出る
 *   ② 写しの 名簿が 別の 口（uid）の 物なら 倉庫を 採る（他の 口の 書きで 通さない）
 *   ③ 古い タブが 後から 写しを 上書きした（名簿は 古い タブの 物）なら 倉庫を 採る
 *   ④ 最後の 1人を 消して 閉じても、会社の 設定（振込元 など）を 既定値で 倉庫へ 上書きしない（taiketsu 10-25 止める-1）
 *   ⑤ 写しの 名簿は クラウドへ 送る 中身に 混ざらない
 * ★空振り止め（--waza=1..5）★ … ①口を 何もしない 物に ②口（uid）の 照合を 外す ③名簿を 写しと 別の キーに 書く ④0人の 門を 外す ⑤名簿を 写す 呼び出しを 会社の 返事の 後ろへ 移す＝それぞれ 赤に なる事
 * 使い方: node kyuyo/tests/atarashii-tab-hiraki.test.mjs   ／   --waza=1 ／ --waza=2 ／ --waza=3 ／ --waza=4 ／ --waza=5
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
const WAZA = Number((process.argv.find((a) => a.startsWith('--waza=')) || '').split('=')[1] || 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const UID = 'u-ana', T0 = '2026-10-25T00:00:00.000Z';
/* ★倉庫が 返す 時刻の 字の 形★（本物の timestamptz＝末尾の 0 を 落として +00:00・送「…01.120Z」→返「…01.12+00:00」）＝名簿の 比べが ms で 揃うかも 通す（taiketsu 10-25 任意-4） */
const dbFmt = (v) => String(v).replace(/\.(\d+)Z$/, (_m, d) => { const t = d.replace(/0+$/, ''); return (t ? '.' + t : '') + '+00:00'; });
const html = fs.readFileSync(path.join(ROOT, 'kyuyo/index.html'), 'utf8');
const file = path.join(ROOT, 'kyuyo/index.html');

/* ★わざと 壊す（--waza）★＝読み込む 字を 置き換える。置き換えが 当たらなければ 試験の 方が 古い＝赤で 止める */
function kowasu(base, src) {
  const swap = (from, to) => { if (src.indexOf(from) < 0) { console.log('✗ ★--waza=' + WAZA + ' の 置き換え先が ' + base + ' に 無い★＝' + from); process.exit(1); } return src.split(from).join(to); };
  if (WAZA === 1 && base === 'app.js') return swap('Store.setMaeKakiFn(_maeKakiUke)', 'Store.setMaeKakiFn(function(){})');
  if (WAZA === 2 && base === 'store.js') return swap('o.u === uid && ', '');
  if (WAZA === 3 && base === 'app.js') return swap('o._okutta=_okuttaUtsushi;', 'try{ localStorage.setItem("rk_waza_okutta", JSON.stringify(_okuttaUtsushi)); }catch(_eW){}');
  if (WAZA === 5 && base === 'store.js') {   /* ★名簿を 写す 呼び出しを 会社の 返事の 後ろへ 移す（taiketsu 10-25 止める-1＝順番の 見張り）★ */
    const gyo = (src.split('\n').find((l) => l.indexOf('_maeKakiFn({ u:uid') >= 0) || '');
    if (!gyo) { console.log('✗ ★--waza=5 の 呼び出しの 行が store.js に 無い★'); process.exit(1); }
    const ato = 'if(_ua){ _okuttaIreru(_ua); }';
    if (src.indexOf(ato) < 0) { console.log('✗ ★--waza=5 の 移し先が store.js に 無い★'); process.exit(1); }
    return src.split(gyo + '\n').join('').replace(ato, ato + '\n' + gyo);
  }
  if (WAZA === 4 && base === 'app.js') return swap("dec.apply==='local' && !(state.employees && state.employees.length)", "false && dec.apply==='local'");
  return src;
}
const SRCS = [];
for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
  const src = m[1].split('?')[0]; const base = src.split('/').pop();
  if (/^https?:/.test(src) || /^supabase-js/.test(base) || ['supa-config.js', 'auth.js', 'env-badge.js', 'rakunally-login.js'].includes(base)) continue;
  const p = path.resolve(path.dirname(file), src); if (!fs.existsSync(p)) continue;
  SRCS.push([base, kowasu(base, fs.readFileSync(p, 'utf8'))]);
}

/* ── 偽の 倉庫（会社 1行・人 の 棚）＝本物と 同じ 順に 動く ── */
function makeKura(opt) {
  const k = { coData: opt.coData, coUA: opt.coUA, emps: opt.emps.map((e, i) => ({ id: e.id, sort: i, data: e })),
    hold: false, coHold: false, deletes: [], coWrites: [], empUpserts: 0 };
  const pending = () => new Promise(() => {});                   /* ★返らない＝閉じた 体★ */
  function resolve(t, ops) {
    const op = ops.find((o) => ['select', 'update', 'upsert', 'delete', 'insert'].includes(o.m)) || { m: 'select', a: [] };
    const eqs = {}; ops.filter((o) => o.m === 'eq').forEach((o) => { eqs[o.a[0]] = o.a[1]; });
    const tanIchi = ops.some((o) => o.m === 'maybeSingle' || o.m === 'single');
    if (t === 'pay_companies') {
      if (op.m === 'select') {
        if (!k.coUA) return { data: null, error: null };
        return { data: { data: k.coData, updated_at: k.coUA }, error: null };
      }
      if (op.m === 'update') {
        if (eqs.updated_at != null && Date.parse(eqs.updated_at) !== Date.parse(k.coUA)) return { data: [], error: null };
        k.coData = op.a[0].data; k.coUA = dbFmt(op.a[0].updated_at); k.coWrites.push(op.a[0]);
        if (k.coHold) return 'HOLD';                                 /* ★倉庫には 着いたが 返事が 来る 前に 閉じた★ */
        return { data: [{ updated_at: k.coUA }], error: null };
      }
      if (op.m === 'upsert') { k.coData = op.a[0].data; k.coUA = dbFmt(op.a[0].updated_at); k.coWrites.push(op.a[0]); return { data: { updated_at: k.coUA }, error: null }; }
    }
    if (t === 'pay_employees') {
      if (k.hold) return 'HOLD';
      if (op.m === 'select') {
        const cols = String(op.a[0] || '');
        const rows = cols.indexOf('data') >= 0 ? k.emps.map((r) => ({ data: r.data, sort: r.sort })) : k.emps.map((r) => ({ id: r.id }));
        return { data: rows, count: rows.length, error: null };
      }
      if (op.m === 'upsert') {
        k.empUpserts++;
        for (const r of op.a[0]) { const i = k.emps.findIndex((x) => x.id === r.id); if (i >= 0) k.emps[i] = { id: r.id, sort: r.sort, data: r.data }; else k.emps.push({ id: r.id, sort: r.sort, data: r.data }); }
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
  const user = { id: UID, email: 'ana@example.invalid' };
  const auth = new Proxy({
    getUser: () => Promise.resolve({ data: { user }, error: null }),
    getSession: () => Promise.resolve({ data: { session: { user, access_token: 'x' } }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
  }, { get(o, n) { return o[n] || (() => Promise.resolve({ data: {}, error: null })); } });
  const client = new Proxy({ from, auth }, { get(o, n) { return o[n] || (() => from('rpc:' + String(n))); } });
  k.client = client;
  return k;
}

async function tabWoHiraku(kura, ls, nav) {
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/kyuyo/index.html' });
  const win = dom.window, doc = win.document;
  for (const [key, v] of Object.entries(ls || {})) win.localStorage.setItem(key, v);
  win.fetch = () => Promise.reject(new Error('no net')); win.alert = () => {}; win.confirm = () => true; win.scrollTo = () => {}; win.print = () => {};
  win.__RK_NAV__ = nav || 'navigate';
  win.__YOMI_MACHI_MS__ = 300;
  win.SUPA = { url: 'https://x.supabase.co', key: 'anon' };
  win.supabase = { createClient: () => kura.client };
  const errs = []; win.console.error = (...a) => errs.push(a.map(String).join(' '));
  for (const [, src] of SRCS) { const el = doc.createElement('script'); el.textContent = src; doc.body.appendChild(el); }
  const A = win.__PAYSLIP_TEST;
  for (let i = 0; i < 60 && !(A && A.state && A.state._souko === 'ok'); i++) await sleep(100);
  return { win, A, errs };
}
const lsDake = (win) => { const o = {}; const S = win.localStorage; for (let i = 0; i < S.length; i++) { const key = S.key(i); o[key] = S.getItem(key); } return o; };

let pass = 0, fail = 0;
const akaNo = [];
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; akaNo.push(n); console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };
console.log('\n[atarashii-tab-hiraki] 押して すぐ 閉じて 新しい タブで 開いても 消した 人が 戻らない' + (WAZA ? '  ★★--waza=' + WAZA + '★★' : ''));

const emp = (A, id, name) => Object.assign(A.defEmp(), { id, name, pref: '東京都', birthYmd: '1990-01-01', base: 250000 });
const kaisha = (A, name) => ({ v: 1, company: Object.assign(A.defCompany(), { name, furiAccount: '1234567' }), month: '2026-10' });

/* 会社だけ 着いて 閉じた 写しを 作る（タブA）。返り＝閉じた 時の localStorage */
async function kesiteTojiru(kura, nokosu, kaishaDeTojiru) {
  const tA = await tabWoHiraku(kura, null, 'navigate');
  if (!tA.A || tA.A.state._souko !== 'ok') { T('タブA が 立ち上がる', false, 'souko=' + (tA.A && tA.A.state && tA.A.state._souko) + '／' + tA.errs.slice(0, 3).join(' | ')); return null; }
  if (kaishaDeTojiru) kura.coHold = true; else kura.hold = true;                                                   /* ★人の 書き・差分削除は 返らない＝その前に 閉じる★ */
  tA.A.state.employees = tA.A.state.employees.filter((e) => nokosu.includes(e.id));
  tA.A.persistSaveDebounced();
  for (let i = 0; i < 40 && kura.coWrites.length === 0; i++) await sleep(100);
  await sleep(200);
  const ls = lsDake(tA.win);
  tA.win.close();
  kura.hold = false; kura.coHold = false;
  return { ls, tA };
}

/* ① 本筋 */
{
  const kura = makeKura({ coData: null, coUA: T0, emps: [] });
  const boot = await tabWoHiraku(makeKura({ coData: null, coUA: null, emps: [] }), null);   /* defEmp/defCompany を 借りる 為だけ */
  const B0 = boot.A; boot.win.close();
  kura.coData = kaisha(B0, '本物の会社'); kura.emps = [emp(B0, 'e1', '残る人'), emp(B0, 'e2', '消す人')].map((e, i) => ({ id: e.id, sort: i, data: e }));
  const r = await kesiteTojiru(kura, ['e1']);
  if (r) {
    T('① 前提：会社の 行は 倉庫に 着いた・人は まだ 倉庫に 2人', kura.coWrites.length >= 1 && kura.emps.length === 2, '会社の 書き=' + kura.coWrites.length + '／倉庫の 人=' + kura.emps.length);
    const u = JSON.parse(r.ls.payslip_state_v1 || 'null');
    T('⑤ 写しの 名簿は クラウドへ 送る 中身に 混ざらない', kura.coWrites.every((w) => !JSON.stringify(w.data).includes('_okutta')), JSON.stringify(Object.keys((kura.coWrites[0] || {}).data || {})));
    const tB = await tabWoHiraku(kura, r.ls, 'navigate');                 /* ★新しい タブ＝sessionStorage は 無い★ */
    await sleep(1500);
    const namae = (tB.A.state.employees || []).map((e) => e.id).join(',');
    T('① ★新しい タブで 開いても 手元（消した 後）を 採る★', namae === 'e1', '画面の 人=' + namae + '／写しの 名簿=' + JSON.stringify(u && u._okutta));
    T('① ★消した 人に 消し（DELETE）が 出て、倉庫からも 消える★', kura.deletes.includes('e2') && !kura.emps.some((x) => x.id === 'e2'), '消し=' + JSON.stringify(kura.deletes) + '／倉庫の 人=' + kura.emps.map((x) => x.id).join(','));
    tB.win.close();

    /* ② 名簿が 別の 口の 物 */
    const kura2 = makeKura({ coData: kura.coData, coUA: dbFmt(kura.coWrites[0].updated_at), emps: [emp(B0, 'e1', '残る人'), emp(B0, 'e2', '消す人')] });
    const u2 = JSON.parse(r.ls.payslip_state_v1); if (u2._okutta) u2._okutta.u = 'betsu-no-kuchi';
    const tC = await tabWoHiraku(kura2, Object.assign({}, r.ls, { payslip_state_v1: JSON.stringify(u2) }), 'navigate');
    await sleep(1200);
    T('② 写しの 名簿が 別の 口の 物なら 倉庫を 採る（消した 人は 戻る＝前の 動き）', (tC.A.state.employees || []).length === 2 && kura2.deletes.length === 0, '画面の 人=' + (tC.A.state.employees || []).map((e) => e.id).join(',') + '／消し=' + JSON.stringify(kura2.deletes));
    tC.win.close();

    /* ③ 古い タブが 後から 写しを 上書き（中身も 名簿も 古い タブの 物＝名簿に 倉庫の 時刻は 無い） */
    const kura3 = makeKura({ coData: kura.coData, coUA: dbFmt(kura.coWrites[0].updated_at), emps: [emp(B0, 'e1', '残る人'), emp(B0, 'e2', '消す人'), emp(B0, 'e3', '別のタブで足した人')] });
    const u3 = JSON.parse(r.ls.payslip_state_v1); u3._okutta = { u: UID, t: [Date.parse('2026-10-24T23:00:00.000Z')] }; u3._tab = 'furui-tab';
    const tD = await tabWoHiraku(kura3, Object.assign({}, r.ls, { payslip_state_v1: JSON.stringify(u3) }), 'navigate');
    await sleep(1200);
    T('③ 古い タブの 写し（名簿に 倉庫の 時刻が 無い）なら 倉庫を 採る（別の タブで 足した 人を 消さない）', (tD.A.state.employees || []).some((e) => e.id === 'e3') && kura3.deletes.length === 0, '画面の 人=' + (tD.A.state.employees || []).map((e) => e.id).join(',') + '／消し=' + JSON.stringify(kura3.deletes));
    tD.win.close();
  }

  /* ①' ★会社の 書きは 倉庫に 着いたが 返事の 前に 閉じた（アプリを 払った）★＝名簿は 会社を 書く ★前★に 写しへ 入って いないと 効かない */
  const kura5 = makeKura({ coData: kaisha(B0, '本物の会社'), coUA: T0, emps: [emp(B0, 'e1', '残る人'), emp(B0, 'e2', '消す人')] });
  const r5 = await kesiteTojiru(kura5, ['e1'], true);
  if (r5) {
    T("①' 前提：会社の 行は 倉庫に 着き（返事は 来ない）・人は まだ 倉庫に 2人", kura5.coWrites.length >= 1 && kura5.emps.length === 2, '会社の 書き=' + kura5.coWrites.length + '／倉庫の 人=' + kura5.emps.length);
    const tF = await tabWoHiraku(kura5, r5.ls, 'navigate');
    await sleep(1500);
    const n5 = (tF.A.state.employees || []).map((e) => e.id).join(',');
    T("①' ★会社の 返事の 前に 閉じても 新しい タブで 手元を 採り、消した 人が 消える★", n5 === 'e1' && kura5.deletes.includes('e2'), '画面の 人=' + n5 + '／消し=' + JSON.stringify(kura5.deletes));
    tF.win.close();
  }

  /* ④ 最後の 1人を 消して 閉じる */
  const kura4 = makeKura({ coData: kaisha(B0, '本物の会社'), coUA: T0, emps: [emp(B0, 'e9', '最後の人')] });
  const r4 = await kesiteTojiru(kura4, [], true);   /* ★0人は 人の 書きが 無い＝会社の 返事の 前で 閉じる（taiketsu 10-25 止める-1 の 形）★ */
  if (r4) {
    const kakiMae = kura4.coWrites.length;
    const tE = await tabWoHiraku(kura4, r4.ls, 'navigate');
    await sleep(1500);
    const ato = kura4.coWrites.slice(kakiMae);
    const kimochi = ato.map((w) => (w.data && w.data.company && w.data.company.name) + '/' + (w.data && w.data.company && w.data.company.furiAccount));
    T('④ ★最後の 1人を 消して 閉じても、会社の 設定を 既定値で 倉庫へ 上書きしない★', ato.every((w) => w.data && w.data.company && w.data.company.name === '本物の会社' && w.data.company.furiAccount === '1234567'),
      '開き直しの 後の 会社の 書き=' + JSON.stringify(kimochi));
    T('④ 開き直した 画面の 会社名は 本物のまま', tE.A.state.company && tE.A.state.company.name === '本物の会社', '会社名=' + (tE.A.state.company && tE.A.state.company.name));
    tE.win.close();
  }
}

if (WAZA) {
  /* ★壊した 回は「壊した 所を 見張る 試験が 赤」の 時だけ 緑★（転んだ・別の 所だけ 赤＝空振りの 恐れ＝赤） */
  const MATO = { 1: '① ★新しい タブ', 2: '② ', 3: '① ★新しい タブ', 4: '④ ★最後の', 5: "①' ★会社の" }[WAZA];
  const atatta = !!MATO && akaNo.some((n) => n.startsWith(MATO));
  console.log('\n--waza=' + WAZA + '：' + (atatta ? '★壊すと「' + MATO + '…」が 赤＝門が 守っている★' : '★壊しても「' + MATO + '…」が 赤に ならない＝空振り★') + '（赤＝' + akaNo.length + '件）');
  console.log('KEKKA {"passed":' + (atatta ? 1 : 0) + ',"failed":' + (atatta ? 0 : 1) + ',"mimiso":0}');
  process.exit(atatta ? 0 : 1);
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('KEKKA {"passed":' + pass + ',"failed":' + fail + ',"mimiso":0}');
process.exit(fail ? 1 : 0);
