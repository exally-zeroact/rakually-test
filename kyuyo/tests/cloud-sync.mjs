// cloud-sync.mjs — ★クラウド保存層(store.js)の回帰テスト★
//  Supabaseをモックして store.js の cloudSaveState/cloudLoadState を検証。
//  専門家QA(2026-07-16)が見つけた P0-1(保存項目の欠落)/P0-2(差分ハードデリート)/P1-4(保存成否) を二度と出さない。
//  依存: jsdom(store.jsを window付きで読む為)。使い方: node tests/cloud-sync.mjs (jsdom未導入なら SKIP)。
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません。この検証は飛ばせません（SKIPを緑と呼ばない）。npm install してください。'); process.exit(1); }

let pass = 0, fail = 0;
function T(name, fn) { return fn().then(() => { pass++; console.log('  ✓ ' + name); }, e => { fail++; console.log('  ✗ ' + name + ' — ' + (e && e.message)); }); }
function ok(c, m) { if (!c) throw new Error(m || 'expected truthy'); }

// ── Supabaseモック(呼び出しを記録・失敗も注入できる) ──
function makeMock(opts) {
  opts = opts || {};
  const calls = { companyUpsert: [], empUpsert: [], deletes: [], selects: [] };
  let serverEmpIds = (opts.serverEmpIds || []).slice();
  // dbFormatモード=実Postgres(timestamptz)を模擬: 送られたISO(…Z)を保存時に…+00:00へ書式変換し、読み戻しはその値を返す。
  //  ＝JS生成文字列(…Z)を競合基準にすると読み戻し(…+00:00)と毎回不一致になる本番バグを再現する。
  const dbFmt = s => (opts.dbFormat && typeof s === 'string') ? s.replace(/Z$/, '+00:00') : s;
  let storedUA = (typeof opts.companyUpdatedAt === 'function') ? opts.companyUpdatedAt() : opts.companyUpdatedAt;
  function curCompanyUA() {
    if (opts.dbFormat) return storedUA; // upsertで更新された保存値を返す
    return (typeof opts.companyUpdatedAt === 'function') ? opts.companyUpdatedAt() : opts.companyUpdatedAt;
  }
  // ★loadDelay/loadFail = ★読み込みだけ★ 遅らせる/落とす(cols に data が入る物)。
  //  2026-09-03のP0(読み込みより先に 保存が走って 倉庫が消えた)を ★倉庫なしで★ 再現する為。
  function query(kind, cols) {
    const yomi = cols != null && String(cols).indexOf('data') >= 0;
    const dly = (yomi && opts.loadDelay) ? opts.loadDelay : 0;
    const koware = !!(yomi && opts.loadFail);
    const wait = (v) => koware ? Promise.reject(new Error('読み込み失敗'))
      : (dly ? new Promise(r => setTimeout(() => r(v), dly)) : Promise.resolve(v));
    const _cua = curCompanyUA();
    let res;
    if (kind === 'ledger') { // K4: pay_ledger。count:'exact'(切れ検知)を模擬
      const rows = opts.ledgerRows || [];
      res = { data: rows, count: (opts.ledgerCount != null ? opts.ledgerCount : rows.length), error: opts.ledgerError || null };
    } else {
      const data = kind === 'companyData' ? ((opts.companyData || _cua) ? { data: opts.companyData, updated_at: _cua } : null)
        : kind === 'empIds' ? serverEmpIds.map(id => ({ id }))
          : (opts.serverEmps || []);
      res = { data, error: null };
    }
    // is/gte/lte もチェーン可能(pay_ledger の .is().gte().lte().order() 用)
    // range: store.js の全件ページング(fetchAllQ)を本物どおりに模擬。配列はrange位置で1000件ずつスライス
    //  (少件数モックでは1ページ目=全件・2ページ目=空)。count注入(切れ検知テスト)もそのまま保つ。
    let _lo = 0;
    function paged() {
      if (!Array.isArray(res.data)) return res; // 単一行(maybeSingle系)はそのまま
      return { data: res.data.slice(_lo, _lo + 1000), count: (res.count != null ? res.count : res.data.length), error: res.error };
    }
    const q = { eq: () => q, is: () => q, gte: () => q, lte: () => q, order: () => q, range: (a) => { _lo = a; return q; }, maybeSingle: () => wait(res), then: (f, r) => wait(paged()).then(f, r) };
    return q;
  }
  function from(table) {
    return {
      upsert: (d) => {
        (table === 'pay_companies' ? calls.companyUpsert : calls.empUpsert).push(d);
        let retUA = null;
        if (table === 'pay_companies' && d && d.updated_at != null) { retUA = dbFmt(d.updated_at); if (opts.dbFormat) storedUA = retUA; }
        const res = { error: opts.failUpsert ? { message: 'upsert失敗' } : null, data: retUA != null ? { updated_at: retUA } : null };
        // upsert(...) は Promise。さらに .select('updated_at').single() でDB保存後の updated_at を返せるようにする。
        const p = Promise.resolve(res);
        p.select = () => ({ single: () => Promise.resolve(res), maybeSingle: () => Promise.resolve(res), then: (f, r) => Promise.resolve(res).then(f, r) });
        return p;
      },
      select: (cols, sopts) => { calls.selects.push({ table, cols, opts: sopts || {} }); return query(table === 'pay_ledger' ? 'ledger' : table === 'pay_companies' ? 'companyData' : cols === 'id' ? 'empIds' : 'emps', cols); },
      delete: () => ({ in: (col, ids) => { calls.deletes.push(ids); return Promise.resolve({ error: null }); } }),
    };
  }
  return { from, auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) }, __calls: calls };
}

function loadStore(mock) {
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
  const win = dom.window;
  win.SUPA = { url: 'https://x.supabase.co', key: 'anon' };
  win.supabase = { createClient: () => mock };
  const el = win.document.createElement('script');
  el.textContent = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
  win.document.body.appendChild(el);
  return win.Store;
}

const SNAP = { v: 1, company: { name: 'A' }, month: '2026-06', theme: 't', prefer: 'p', depts: [], roles: [], showRetired: false,
  bonus: { byEmp: { e1: { amount: '500000' } } }, confirmed: { '2026-06': { e1: true } }, nencho: { e1: { kyuyoShunyu: '5000000' } },
  onboardDone: true, onboardOutput: true, payPatterns: [{ id: 'p1' }],
  employees: [{ id: 'e1', name: '山田' }, { id: 'e2', name: '佐藤' }] };

console.log('\n[cloud-sync] クラウド保存層 回帰テスト');
const runs = [];

// P0-1: 全スナップショット項目(確定印/年末調整/賞与/カスタム給/onboard)がクラウドに載る
runs.push(T('P0-1: confirmed/nencho/bonus/payPatterns/onboard も pay_companies に保存される', async function () {
  const mock = makeMock({});
  const Store = loadStore(mock);
  const r = await Store.cloudSaveState(SNAP);
  ok(r.ok, '保存ok');
  const saved = mock.__calls.companyUpsert[0].data; // upsert({account_id,data:settings})→ .data
  ['confirmed', 'nencho', 'bonus', 'payPatterns', 'onboardDone', 'onboardOutput'].forEach(k => ok(saved[k] !== undefined, k + ' が保存されている'));
  ok(saved.employees === undefined, 'employeesはsettingsに含めない(別テーブル)');
}));

// P0-2: 同期前(load前)は差分削除しない=古い/空の端末が本番を消さない
runs.push(T('P0-2: 未同期(load前)は差分ハードデリートを実行しない', async function () {
  const mock = makeMock({ serverEmpIds: ['e1', 'e2', 'e3'] }); // サーバに3人居る
  const Store = loadStore(mock);
  // load せずに save(手元e1,e2のみ)。従来なら e3 を delete していた=消失バグ
  await Store.cloudSaveState(SNAP);
  ok(mock.__calls.deletes.length === 0, '未同期セッションでは delete を呼ばない(消さない)');
}));

// P0-2b: 同期後(load済)は差分削除する=正しく消えたempはクラウドからも消える
runs.push(T('P0-2b: 同期後(load済)は手元に無いempを差分削除する', async function () {
  const mock = makeMock({ serverEmpIds: ['e1', 'e2', 'e3'], serverEmps: [{ data: { id: 'e1' } }, { data: { id: 'e2' } }, { data: { id: 'e3' } }], companyData: { company: { name: 'A' } } });
  const Store = loadStore(mock);
  await Store.cloudLoadState(); // 同期する
  await Store.cloudSaveState(SNAP); // 手元は e1,e2 のみ → e3 を削除
  ok(mock.__calls.deletes.length === 1 && mock.__calls.deletes[0].indexOf('e3') >= 0, '同期後は e3 を削除: ' + JSON.stringify(mock.__calls.deletes));
}));

// P1-4: 保存失敗は {ok:false} を返す(「保存済」と嘘をつかない)
// ── ★2026-09-03 P0: 開いただけで 倉庫の従業員が 消えた(実測 6/10)★ ──────────────
//  正体= 新しい端末で ★保存が 読み込みより 先に 成功★→cloudSynced=true→次の保存で 差分削除。
//  直し= ①消してよいかは ★読めたか(cloudLoaded)★ で決める ②読み込みが 済むまで 保存を 保留。
//  ここは ★倉庫なしで CIで 毎回 回る★ 形の 見張り(実物で 数えるのは kyuyo/tests/load-before-delete-live.mjs)。
runs.push(T('★P0-race①: 読み込みが遅くて 保存が先でも クラウドの従業員を 消さない', async function () {
  const mock = makeMock({ loadDelay: 120, serverEmpIds: ['e1', 'e2', 'e3'], serverEmps: [{ data: { id: 'e1' } }, { data: { id: 'e2' } }, { data: { id: 'e3' } }], companyData: { company: {} }, companyUpdatedAt: null });
  const Store = loadStore(mock);
  // ★実物の 順番を そのまま 写す★=1本目が ★済んでから★ 2本目(実測 186ms あいだが 空いた)。
  //  同時に 走らせると 昔の形でも 緑に なる(2026-09-03 わざと戻して 確かめた)＝再現に ならない。
  // ★読めたら 手元の一覧も 入れ替わる★(app.js の applyCloudState)ので そこまで 写す。
  //  写さないと「読めた後の 保存が 古い一覧で 消す」= ★実物では 起きない★ 赤に なる。
  let ima = SNAP;
  if (Store.setSnapshotFn) Store.setSnapshotFn(function () { return ima; });
  const load = Store.cloudLoadState().then(function (st) {   // 読み込みは 遅い(まだ 返らない)
    if (st && st.employees) ima = Object.assign({}, SNAP, { employees: st.employees });
    return st;
  });
  await Store.cloudSaveState(ima);              // ★1本目の 自動保存(手元は e1,e2 だけ)が 成功
  await Store.cloudSaveState(ima);              // ★2本目 ← 昔は ここで e3 が 消えた
  await load;
  ok(mock.__calls.deletes.length === 0, '読み込み待ちの間に delete を呼ばない: ' + JSON.stringify(mock.__calls.deletes));
}));

runs.push(T('★P0-race②: 保留した保存は 読み込みの後に ★1回だけ★ 出る', async function () {
  const mock = makeMock({ loadDelay: 120, serverEmpIds: ['e1'], serverEmps: [{ data: { id: 'e1' } }], companyData: { company: {} }, companyUpdatedAt: null });
  const Store = loadStore(mock);
  Store.setSnapshotFn(function(){ return SNAP; });   // app.js と同じ=出す時に 新しい中身を もらう
  const load = Store.cloudLoadState();
  const s1 = Store.cloudSaveState(SNAP), s2 = Store.cloudSaveState(SNAP), s3 = Store.cloudSaveState(SNAP);
  await Promise.all([load, s1, s2, s3]);
  ok(mock.__calls.companyUpsert.length === 1, '3本 頼んでも 保存は 1回: ' + mock.__calls.companyUpsert.length + '回');
}));

runs.push(T('★P0-race③: 読み込みが 失敗した端末は 1人も 消さない', async function () {
  const mock = makeMock({ loadFail: true, serverEmpIds: ['e1', 'e2', 'e3'] });
  const Store = loadStore(mock);
  await Store.cloudLoadState().catch(function () { });   // 読めない(圏外・倉庫が死んでいる)
  // ★2本 続けて 出す★=1本目が 書けた事で「知っている」と 取り違えると 2本目で 消す(昔の形)。
  await Store.cloudSaveState(SNAP);
  await Store.cloudSaveState(SNAP);
  ok(mock.__calls.deletes.length === 0, '読めていないのに delete を呼んだ: ' + JSON.stringify(mock.__calls.deletes));
}));

runs.push(T('P1-4: 書込失敗時は ok:false を返す', async function () {
  const mock = makeMock({ failUpsert: true });
  const Store = loadStore(mock);
  const r = await Store.cloudSaveState(SNAP);
  ok(r.ok === false, '失敗を ok:false で返す(reason=' + r.reason + ')');
}));

// 楽観ロック: 読込後にクラウドのupdated_atが別端末で変わっていたら上書きせず conflict を返す
runs.push(T('楽観ロック: 別端末が後から更新→保存は conflict で上書きしない', async function () {
  let cua = '2026-07-17T00:00:00.000Z'; // 現在のクラウドupdated_at(可変)
  const mock = makeMock({ companyData: { company: { name: 'A' } }, companyUpdatedAt: () => cua });
  const Store = loadStore(mock);
  await Store.cloudLoadState(); // 読込=lastCompanyUpdatedAt を U0 に
  // 同じ値のまま保存 → 競合なし=保存される
  const r1 = await Store.cloudSaveState(SNAP);
  ok(r1.ok === true, '競合なしなら保存OK(reason=' + r1.reason + ')');
  const upsertsBefore = mock.__calls.companyUpsert.length;
  // 別端末がクラウドを更新(updated_atが進む) → 次の保存は conflict
  cua = '2026-07-17T09:00:00.000Z';
  const r2 = await Store.cloudSaveState(SNAP);
  ok(r2.ok === false && r2.reason === 'conflict', '別端末更新後は conflict(reason=' + r2.reason + ')');
  ok(mock.__calls.companyUpsert.length === upsertsBefore, 'conflict時は pay_companies を上書きしない');
}));
// ★P0根治: DB書式(…+00:00)とJS生成(…Z)の差で、外部変更なしの連続保存が誤conflictしない
runs.push(T('楽観ロック(P0): DB書式差(+00:00 vs Z)で誤conflictしない=連続保存が通る', async function () {
  const initialUA = '2026-07-20T00:00:00.000+00:00'; // DBが返す既存値(＋00:00)
  const mock = makeMock({ companyData: { company: { name: 'A' } }, companyUpdatedAt: initialUA, dbFormat: true });
  const Store = loadStore(mock);
  await Store.cloudLoadState();            // baseline = initialUA(DB書式)
  const r1 = await Store.cloudSaveState(SNAP); ok(r1.ok === true, 'save1 ok(reason=' + r1.reason + ')');
  // 外部変更なしの2回目(スクロール等の自動保存相当)。書式差で誤発火してはいけない。
  const r2 = await Store.cloudSaveState(SNAP);
  ok(r2.ok === true && r2.reason !== 'conflict', '2回目保存が誤conflictしない(reason=' + r2.reason + ')');
  const r3 = await Store.cloudSaveState(SNAP);
  ok(r3.ok === true && r3.reason !== 'conflict', '3回目も誤conflictしない(reason=' + r3.reason + ')');
}));
// 書式が違っても「本物の別端末更新」は依然 conflict で検出する(根治で検出力を落とさない)
runs.push(T('楽観ロック(P0): 書式差対応後も、本物の別端末更新は conflict を検出する', async function () {
  let ua = '2026-07-20T00:00:00.000+00:00';
  const mock = makeMock({ companyData: { company: { name: 'A' } }, companyUpdatedAt: () => ua });
  const Store = loadStore(mock);
  await Store.cloudLoadState();
  const r1 = await Store.cloudSaveState(SNAP); ok(r1.ok === true, 'save1 ok');
  ua = '2026-07-20T09:00:00.000+00:00'; // 別端末が後から更新
  const r2 = await Store.cloudSaveState(SNAP);
  ok(r2.ok === false && r2.reason === 'conflict', '本物の別端末更新は conflict(reason=' + r2.reason + ')');
}));
// 初回(未load/クラウド空)は競合判定せず保存できる(新規アカウント)
runs.push(T('楽観ロック: 初回(load前)は競合扱いにせず保存できる', async function () {
  const mock = makeMock({}); // クラウド空
  const Store = loadStore(mock);
  const r = await Store.cloudSaveState(SNAP);
  ok(r.ok === true, '初回保存OK(reason=' + r.reason + ')');
}));

// ── K4: Store.getLedger(pay_ledger 読取・count:'exact' 切れ検知) ──
// HANDOFF §1: count > data.length なら「全部読めていない」= truncated:true(静かな過少を検出)
runs.push(T('K4 getLedger: 全行読めた時 truncated:false・rows/count 一致', async function () {
  const rows = [
    { id: 'l1', employee_id: 'e1', ymd: '2026-07-03', data: { uriage: 100000 } },
    { id: 'l2', employee_id: 'e1', ymd: '2026-07-05', data: { minutes: 480 } },
    { id: 'l3', employee_id: 'e2', ymd: '2026-07-06', data: { amount: 5000 } }
  ];
  const mock = makeMock({ ledgerRows: rows, ledgerCount: 3 });
  const Store = loadStore(mock);
  const r = await Store.getLedger('2026-07-01', '2026-07-31');
  ok(r.rows.length === 3, 'rows=3件: ' + r.rows.length);
  ok(r.count === 3, 'count=3: ' + r.count);
  ok(r.truncated === false, '切れていない(truncated:false): ' + r.truncated);
  ok(!r.error, 'errorなし');
}));

runs.push(T('K4 getLedger: サーバ上限で切れたら truncated:true(count>rows)', async function () {
  // Supabase既定1000行で切れた状況: 実データ1500件だが1000件しか返らない
  const rows = Array.from({ length: 1000 }, (_, i) => ({ id: 'l' + i, employee_id: 'e1', ymd: '2026-07-03', data: {} }));

// ── K4: Store.countLedger(行を読まずに件数だけ) ──
//  ★何に使うか★＝「台帳から取り込む」を出すか出さないかだけ。だから ★head:true(本文なし)★。
//  ★読めない を 0件 にしない★（0件＝本当に無い／null＝分からない。どちらでも呼び手は「出さない」）
runs.push(T('K4 countLedger: 件数だけ返す・★行は読まない(head:true)★', async function () {
  const mock = makeMock({ ledgerRows: [], ledgerCount: 5 });
  const Store = loadStore(mock);
  const r = await Store.countLedger('2026-08-01', '2026-08-31');
  ok(r.count === 5, 'count=5: ' + r.count);
  ok(!r.error, 'errorなし');
  const sel = mock.__calls.selects.filter(x => x.table === 'pay_ledger').pop();
  ok(sel && sel.opts.head === true, '★head:true で呼んでいない(行を読んでしまう)★: ' + JSON.stringify(sel && sel.opts));
  ok(sel && sel.cols === 'id', '読む列が id ではない: ' + (sel && sel.cols));
}));

runs.push(T('K4 countLedger: ★読めない時は count:null（0件にしない）★', async function () {
  const mock = makeMock({ ledgerRows: [], ledgerError: { message: '権限がありません' } });
  const Store = loadStore(mock);
  const r = await Store.countLedger('2026-08-01', '2026-08-31');
  ok(r.count === null, '★読めないのに 0件と言っている★: ' + JSON.stringify(r));
  ok(!!r.error, '理由(error)が付いていない');
}));
  const mock = makeMock({ ledgerRows: rows, ledgerCount: 1500 });
  const Store = loadStore(mock);
  const r = await Store.getLedger('2026-07-01', '2026-07-31');
  ok(r.count === 1500 && r.rows.length === 1000, 'count1500 > rows1000');
  ok(r.truncated === true, '★切れ検知 truncated:true(合計を静かに過少にしない): ' + r.truncated);
}));

runs.push(T('K4 getLedger: エラー時は空+error(嘘の空集計を返さない)', async function () {
  const mock = makeMock({ ledgerError: { message: 'permission denied' } });
  const Store = loadStore(mock);
  const r = await Store.getLedger('2026-07-01', '2026-07-31');
  ok(r.rows.length === 0 && r.count === 0, '空');
  ok(r.error === 'permission denied', 'errorを載せる: ' + r.error);
  ok(r.truncated === false, 'エラー時 truncated:false');
}));

await Promise.all(runs);
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
