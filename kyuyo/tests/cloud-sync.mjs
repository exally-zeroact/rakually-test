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
  const calls = { companyUpsert: [], empUpsert: [], deletes: [], selects: [], slipUpsert: [], getUser: [] };
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
        /* ★★`empDelay`＝★`pay_employees` の 書きだけ 遅らせる★★★（2026-09-28）
           ★訳★ … 束は 3本（会社の 書き／人の 書き／差分削除）で、
             ★控えを 新しく するのが 3本 全部 返って から★だと
             ★①が 倉庫に 着いた 後 ②が 返るまで★
             『★倉庫は 新しい／控えは 旧い★』窓が 開く。
           ⇒ ★★その 窓を 試験で 作る には ②を 遅らせる しか ない★★ */
        if (table === 'pay_employees' && opts.empDelay) {
          calls.empUpsert.push(d);
          return new Promise((r) => setTimeout(() => r({ error: null, data: null }), opts.empDelay));
        }
        /* ★明細の 書き込みも 数える★（2026-09-15＝孤児の 元を 縛る為） */
        (table === 'pay_companies' ? calls.companyUpsert
          : table === 'pay_payslips' ? calls.slipUpsert : calls.empUpsert).push(d);
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
  /* ★`opts.noUser`★ … ★入口を 通って いない 端末★（既定＝通って いる）
     ＝★『読み込みが 始まる 前の 隙』は ★入口を 通って いる時だけ★ 待つ★ 事を 見る為 */
  return {
    from,
    /* ★★`getUser` を 呼んだ 回数も 数える★★（2026-09-28）
       ★訳★ … `getUser()` は ★倉庫へ 問い合わせます★。
         ★読み込み前の 隙を 待つ 輪★が 刻みごとに 呼ぶと
         ★1回の 保存で 何十往復★に なる ⇒ ★客の 通信が 増える★
       ⇒ ★★数えないと 気づけません★★（`kaisuu.getUser`） */
    auth: {
      getUser: () => {
        calls.getUser.push(1);
        return Promise.resolve({ data: { user: opts.noUser ? null : { id: 'u1' } } });
      },
    },
    __calls: calls,
  };
}

function loadStore(mock, wopts) {
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
  const win = dom.window;
  /* ★★試験では 待つ 上限を ★短く★ する★★（2026-09-28）
     ★訳★ … 本物は 8秒。★`cloudLoadState` を 呼ばない 試験は 毎回 8秒 待つ★＝★束が 遅くなる★
     ★上限の ★値★ は 契約では ありません★（★機構＝『永久に 待たない』は ★隙②★ が 見る★）
     ⇒ ★既定 300ms／要る 試験だけ 明に 渡す★ */
  win.__YOMI_MACHI_MS__ = (wopts && typeof wopts.machiMs === 'number') ? wopts.machiMs : 300;
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


/* ★★この 3本は「壊して 赤」まで 見た（2026-09-15）★★
   ★壊した 形を そのまま 残す★＝次に 書き直す 人が ★何を 守っていたか★を 読める:
     ①… store.js の ★if(saveHold) → if(false)★        ⇒ 19 passed, 1 failed（赤は ①だけ）
     ②… store.js の ★if(!iru) → if(true)★              ⇒ 19 passed, 1 failed（赤は ②だけ）
     ③… 保留が 無い道の return を ★{ok:false} に 差替え★ ⇒ 19 passed, 1 failed（赤は ③だけ）
   ★1本ずつ 壊した★（まとめて 壊すと どれが どれを 守ったか 分からない）／
   ★赤は 毎回 1本だけ★（重なっていない）／★戻して 全部 緑★まで 見た。 */

/* ★★P0-maboroshi: 明細の 保存も 読み込みを 待つ（2026-09-15）★★
   ★見つけた 害★＝ログインの 直後、state は まだ ★初期値の『従業員 1』1人★。
     そこで 保存が 走ると ★明細だけ 待たずに 書かれ★、後から 読み込みが 着いて
     その人が 消える ⇒ ★書かれた 明細が 持ち主を 失う（孤児）★。
     数えた … 試験の 倉庫 ★孤児 3,599行★／★本番 明細 12行中 9行が 孤児★。
   ★保存の 入口は 2本★＝(a) cloudSaveState（2026-09-03 から 保留）／(b) savePayslip（★素通りだった★）。
   ★字では 縛らない★（「saveHold の 字が 在るか」では また 素通りする）＝★動きで 縛る★。 */
runs.push(T('P0-maboroshi①: ★読み込み中に 書いた 明細は 倉庫に 書かれない★（幻の人）', async function () {
  const mock = makeMock({ loadDelay: 60, serverEmps: [{ data: { id: 'e9', name: '本物' } }] });
  const Store = loadStore(mock);
  Store.setSnapshotFn(() => ({ employees: [{ id: 'e9', name: '本物' }] }));   /* 読み込み後の 姿 */
  const yomi = Store.cloudLoadState();                       /* ★読み込みを 始める＝保留が 立つ★ */
  const r = await Store.savePayslip('2026-06', 'maboroshi1', { name: '従業員 1' });
  await yomi;
  ok(mock.__calls.slipUpsert.length === 0, '★幻の人の 明細が 書かれてしまった★');
  ok(r && r.reason === 'held-skipped-maboroshi', '★書かなかった 訳を 言っていない★（出たのは ' + JSON.stringify(r) + '）');
}));

runs.push(T('P0-maboroshi②: ★読み込み後に 居る人の 明細は ちゃんと 書かれる★（本物を 落とさない）', async function () {
  const mock = makeMock({ loadDelay: 60, serverEmps: [{ data: { id: 'e9', name: '本物' } }] });
  const Store = loadStore(mock);
  Store.setSnapshotFn(() => ({ employees: [{ id: 'e9', name: '本物' }] }));
  const yomi = Store.cloudLoadState();
  await Store.savePayslip('2026-06', 'e9', { name: '本物' });
  await yomi;
  ok(mock.__calls.slipUpsert.length === 1, '★本物の 明細が 書かれていない★（' + mock.__calls.slipUpsert.length + '件）');
  ok(mock.__calls.slipUpsert[0].employee_id === 'e9', '★別の人を 書いている★');
}));

runs.push(T('P0-maboroshi③: ★読み込みを していない時は そのまま 書く★（消す より 安全側）', async function () {
  const mock = makeMock({});
  const Store = loadStore(mock);
  await Store.savePayslip('2026-06', 'e1', { name: '山田' });
  ok(mock.__calls.slipUpsert.length === 1, '★保留が 無いのに 書かれていない★');
}));

/* ★★④は 書いたが ★消しました★（2026-09-15）＝★守る物が 無かった★★★
   書いた物 … 「読み込みが 失敗しても 保留は 解ける（永久に 待たない）」
   ★壊しても 緑のままだった★＝★見張りに なっていなかった★。
   ★訳を 2つ 立てて 実際に 走らせて 決めた★（★前提で 決めない★）:
     ㋒ 済んだ 約束が 残るだけ … 次の 保存は すぐ 解ける＝★客には 何も 起きない★
     ㋓ 失敗した 約束が 残る   … その後の 保存が 全部 失敗の 道＝★明細が 二度と 保存されない★
   ★測った★＝store.js の 解きを わざと 外し、★読み込みを 失敗させた 後に もう 1回 保存★:
     ⇒ ★「おわった」／倉庫に 書いた回数 1★＝★客の 明細は ちゃんと 書かれる★＝★㋒★
   ⇒ ★守る 物が 無い＝消す★。★緑の 顔を した 見張りを 残すと「4本 守られている」と 思わせる★。
   ★次に 同じ物を 書きたくなった 人へ★＝
     ★saveHold を null に 戻すかは 客には 出ません★（約束そのものは 必ず 済む）。
     ★見張りは 客に 起きる 事で 縛る★＝中の 変数の 姿では 縛らない。
   ★保留が「1回だけ 出る」事は 別の 試験が 既に 見ています★＝★P0-race②★（この 上に 在る）。 */

/* ★★★読み込みが 始まる ★前★ の 隙（2026-09-28）★★★
   ★因（8日 追って 確定した 物）★
     `kyuyo/js/auth.js` の afterLogin は
       ① 使える／止まって いる を 読む（★倉庫へ 1往復★）
       ② `PayslipReloadCloud()` … ここで 初めて `cloudLoadState()` が 呼ばれる
     ⇒ ★①の 間は `saveHold` が まだ 立って いない＝誰も 保存を 止めて いない★
   ★実測（09-27）★ … 覆い 14:55:23.692（hikae=null／neverSynced=true）
                    読み込み kaime=1 14:55:24.545（★0.853秒 後★）
   ★1回 conflict に なると 控えは 二度と 新しく ならない★（conflict の 道は doSave に 行かない）
     ⇒ ★開き直すまで 全部 conflict★（実測＝覆い 65回／控えは 65回とも 同値）
   ★★ここで 縛る 物★★ … ⑴隙が 閉まる ⑵★永久に 待たない★ */
runs.push(T('★隙①: 読み込みを 呼ぶ ★前★ に 保存が 走っても 誤 conflict に しない', async function () {
  /* 倉庫に 既に データが 在る（companyUpdatedAt 在り）＝★前は ここで 必ず conflict★ */
  const mock = makeMock({ companyUpdatedAt: '2026-09-27T13:23:47.938+00:00', loadDelay: 120, companyData: { name: 'クラウドのA' } });
  const Store = loadStore(mock, { machiMs: 5000 });
  Store.setSnapshotFn(() => SNAP);
  const hozon = Store.cloudSaveState(SNAP);       // ★読み込みより 先★
  await new Promise(r => setTimeout(r, 60));      // ★①の 往復ぶん 遅れて★
  const yomi = Store.cloudLoadState();            // ★ここで やっと saveHold が 立つ★
  const [r] = await Promise.all([hozon, yomi]);
  ok(!(r && r.reason === 'conflict'), '★読み込み前の 保存が conflict に なった★（出たのは ' + JSON.stringify(r) + '）');
  const m = Store.machiNoKazu();
  ok(m.kai > 0, '★待って いません＝隙の 道を 通って いない＝この 試験は 何も 見て いない★（' + JSON.stringify(m) + '）');
  ok(m.kire === 0, '★待ち切れた＝上限を 超えた★（' + JSON.stringify(m) + '）');
  /* ★★待った ms も 縛る★★（2026-09-28・指示役1 の ②）
     ★訳★ … ★これは 客が 開いた 直後の 道★＝★長いと『押したのに 何も 起きない』に 見える★
     ⇒ ★回数だけでは 客の 速さは 分かりません★ */
  ok(m.ms.length > 0, '★待った ms を 1件も 控えて いない＝客の 速さが 出せない★（' + JSON.stringify(m) + '）');
  ok(m.msSaidai != null && m.msSaidai < 2000, '★待ちが 長すぎる（客に 出ます）★（最大 ' + m.msSaidai + 'ms）');
}));

runs.push(T('★隙②: 読み込みが ★来なくても★ 永久に 待たない（上限で 今までの 道に 出る）', async function () {
  /* ★`cloudLoadState` を ★一度も 呼ばない★★＝読み込みが 来ない 端末 */
  /* ★★上限は ★刻み（200ms）の 10倍★ に する★★
     ＝★刻みが 1回しか 回らない 窓では ★下の『往復の 数』は 何も 見て いません★★
       （★09-28 実測＝上限 400ms だと 刻み 2回＝壊しても 緑だった★） */
  const mock = makeMock({ companyUpdatedAt: '2026-09-27T13:23:47.938+00:00' });
  const Store = loadStore(mock, { machiMs: 2000 });
  Store.setSnapshotFn(() => SNAP);
  const t0 = Date.now();
  const r = await Store.cloudSaveState(SNAP);
  const kakatta = Date.now() - t0;
  ok(kakatta < 6000, '★上限で 出て いません＝永久に 待つ 恐れ★（' + kakatta + 'ms）');
  ok(r && r.ok === false && r.reason === 'conflict', '★上限の 後は 今までどおり conflict で 止める★（出たのは ' + JSON.stringify(r) + '）');
  const m = Store.machiNoKazu();
  ok(m.kire > 0, '★待ち切れた印が 立って いない★（' + JSON.stringify(m) + '）');
  ok(m.kai >= 8, '★刻みが 足りない＝下の『往復の 数』が 何も 見て いません★（待った ' + m.kai + '回）');
  /* ★★待つ 輪が ★通信を 増やして いない★★★（2026-09-28・★踏みかけた 穴★）
     `curUid()` は `getUser()`＝★倉庫へ 問い合わせる★。
     ★刻み 200ms × 上限 8秒★ で 呼び直すと ★1回の 保存で 最大 40往復★ に なる。
     ⇒ ★★『待つ』の 代金を 数えないと 気づけません★★
     ★1つの 保存＝★入口を 訊くのは 1回／実際に 書く時に もう 1回★★ ⇒ ★多くて 3回★ */
  ok(mock.__calls.getUser.length <= 3,
    '★待つ 輪が 入口を 何度も 訊いて います＝客の 通信が 増えます★（'
      + mock.__calls.getUser.length + '回／待った ' + m.kai + '回）');
}));

runs.push(T('★隙③: 入口を 通って いない時は ★1回も 待たない★（ログイン前を 遅くしない）', async function () {
  const mock = makeMock({ noUser: true, companyUpdatedAt: '2026-09-27T13:23:47.938+00:00' });
  const Store = loadStore(mock, { machiMs: 5000 });
  const t0 = Date.now();
  await Store.cloudSaveState(SNAP);
  ok(Date.now() - t0 < 1000, '★入口を 通って いないのに 待った★');
  ok(Store.machiNoKazu().kai === 0, '★待った 回数が 0 でない★（' + JSON.stringify(Store.machiNoKazu()) + '）');
}));

/* ★★★㋑＝★読んだ 後★ に 自分の 書きで 自分が 弾かれる 窓★★★（2026-09-28・★実測から★）
   ★実物（WebKit run `36343338113`）★
     `★覆いの その場（2回目）★ souko=…19:15:35.12 ★hikae=…19:15:34.71★
        onajiShunkan=false ★neverSynced=false★`
     ⇒ ★読み込みは 済んで いる／★控えが 0.41秒 古い だけ★★
   ★指示役1 が 数えた 分母（同じ 走り）★
     保存(POST) ★788本★／★重なった 組 10455組★／★同時に 飛んで いた 最大 45本★
     ★『自分で 自分を 弾ける 組』1組★（★同じ 束の `pay_employees` が まだ 返って いない★）
   ★★ここで 縛る 物★★
     ★束の 他の 書きが 遅れても ★次の 保存は 誤 conflict に しない★★ */
runs.push(T('★㋑: 束の 他の 書きが 遅れても ★次の 保存を 誤 conflict に しない★（自分で 自分を 弾かない）', async function () {
  /* ★dbFormat＝倉庫が 書いた 値を 読み戻す（本物と 同じ 形）／`empDelay`＝②だけ 300ms 遅らせる★
     ★倉庫に 先に 行が 在る★＝読み込みで 控えが ★null では なく なる★
     ⇒ ★★壊した 時の 字が 実物と 同じ `neverSynced=false` に なる★★
       （実物＝WebKit run `36343338113` の 覆い 2回目） */
  const mock = makeMock({ dbFormat: true, empDelay: 300, companyUpdatedAt: '2026-09-27T19:15:00.000+00:00', companyData: { name: 'A' } });
  const Store = loadStore(mock);
  /* ★先に 1回 読んで おく★＝★`neverSynced` の 道を 通らない＝★㋑ だけを 見る★★ */
  await Store.cloudLoadState();
  /* ★★★1回目を ★待たない★★★＝★待つと 窓が 閉じて この 試験は 何も 見ません★
     （★09-28 実測＝`await` して いた 形は ★わざと 壊しても 緑★だった★） */
  const ichiP = Store.cloudSaveState(SNAP);        /* ★①は すぐ 着く／②は 300ms 掛かる★ */
  await new Promise((r) => setTimeout(r, 120));    /* ★①の 後・②の 前＝★窓の 中★★ */
  const niP = Store.cloudSaveState(SNAP);          /* ★2回目が ここで `select updated_at` する★ */
  const [ichi, ni] = await Promise.all([ichiP, niP]);
  ok(ichi.ok, '★1回目が 保存できて いない★（' + JSON.stringify(ichi) + '）');
  const h = Store.hikaeNoKazu();
  ok(h.hayaku > 0, '★束を 待たずに 控えた 回数が 0＝この 試験は 何も 見て いません（未測定）★（' + JSON.stringify(h) + '）');
  ok(!(ni && ni.reason === 'conflict'),
    '★★自分の 書きで 自分が 弾かれました★★（出たのは ' + JSON.stringify(ni) + '）');
  ok(ni.ok, '★2回目が 保存できて いない★（' + JSON.stringify(ni) + '）');
}));

await Promise.all(runs);
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
