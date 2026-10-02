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
  const tanaIma = () => serverEmpIds.slice();   /* ★今 棚に 居る 人★（★試験が 最後に 数える★） */
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
      const data = kind === 'companyData' ? ((opts.hideCompanyRow) ? null : (opts.companyData || _cua) ? { data: opts.companyData, updated_at: _cua } : null)
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
          /* ★★★遅れて 着く 書きは ★着いた 時に★ 棚へ 入れる★★★（2026-09-28・実測から）
             ★訳★ … 本番の 赤（WebKit `36441683363`）で 起きた 形は
               ★消せと 言った id が ★後から 着いた 書き★に 入って いた★（id `e592de8zk`）
             ⇒ ★★＝『遅れて 着く』を ★棚の 中身まで★ 真似ないと ★この 穴は 偽の 倉庫で 出ません★★★
             ★前★ … `calls` に 積むだけ＝★棚は 動かない★＝★書き戻しが 起きない★
             ★今★ … ★resolve の 瞬間に 棚へ 入れる★＝★本物と 同じ 順に なる★ */
          return new Promise((r) => setTimeout(() => {
            (Array.isArray(d) ? d : [d]).forEach((x) => {
              const id = x && x.id; if (id && serverEmpIds.indexOf(id) < 0) serverEmpIds.push(id);
            });
            r({ error: null, data: null });
          }, opts.empDelay));
        }
        /* ★★`companyReplyDelay`＝★会社の 書きの ★返りだけ★ 遅らせる★★★（2026-09-28）
           ★訳（指示役1 の ③）★ … `pay_companies` の POST の 行き帰りは ★実測 627〜643ms★。
             ★倉庫は すぐ 書き換わる／端末が 知るのは その 後★
           ⇒ ★★控えを どこで 入れても 残る 窓＝★ここ★★★
           ★倉庫の 値（`storedUA`）は ★同期的に★ 上げる／★返りだけ 遅らせる★ */
        /* ★★`companyStoredButError`＝★倉庫には 書けた／返りは 失敗★★★（2026-09-28）
           ★なぜ 要るか★ … ★門（控えが null の 時は 名簿を 見ない）に ★辿り着く 道★★
             ・弾かれた 保存は 名簿に 何も 入れない（送る 前に 弾かれる）
             ・書けて 返れば ★控えが 埋まる★
             ⇒ ★★『名簿に 在る／控えは null』は ★書けたのに 返りが 失敗した 時★だけ★★
             ＝★通信が 落ちた／途中で 切れた★＝★実際に 起きる★
           ★これが 無いと ㋓は ★門を 外しても 緑★＝★何も 見て いません★★（★09-28 に 実測★） */
        if (table === 'pay_companies' && opts.companyStoredButError) {
          calls.companyUpsert.push(d);
          if (d && d.updated_at != null && opts.dbFormat) storedUA = dbFmt(d.updated_at);
          const res = { error: { message: '返りが 落ちた（倉庫には 書けて いる）' }, data: null };
          const p2 = Promise.resolve(res);
          p2.select = () => ({ single: () => p2, maybeSingle: () => p2, then: (f, r2) => p2.then(f, r2) });
          return p2;
        }
        if (table === 'pay_companies' && opts.companyReplyDelay) {
          calls.companyUpsert.push(d);
          let rUA = null;
          if (d && d.updated_at != null) { rUA = dbFmt(d.updated_at); if (opts.dbFormat) storedUA = rUA; }
          const res = { error: null, data: rUA != null ? { updated_at: rUA } : null };
          const slow = new Promise((r) => setTimeout(() => r(res), opts.companyReplyDelay));
          slow.select = () => ({ single: () => slow, maybeSingle: () => slow, then: (f, r2) => slow.then(f, r2) });
          return slow;
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
      /* ★★条件付き update（棚⑦・2026-10-03）★★＝store.js は会社を
         `update({data,updated_at}).eq('account_id',uid).eq('updated_at',控え).select('updated_at')` で書く。
         今のDBの updated_at（dbFormat は storedUA／他は curCompanyUA）と .eq('updated_at') が一致した時だけ
         1行書けて、返りに新しい updated_at を返す。違えば0行（＝控えが古い＝誰かが書いた/応答落ち）。 */
      update: (d) => {
        const eqs = {};
        const applyNow = () => {
          if (table !== 'pay_companies') return { data: [], error: null };
          calls.companyUpdate = calls.companyUpdate || [];
          calls.companyUpdate.push(d);
          if (opts.failUpsert) return { data: [], error: { message: 'update失敗' } };
          /* ★★TOCTOUの隙＝事前SELECTと本書きの間に、自分の別の書き（この now）が倉庫へ着いた★★（新path専用）
             ＝storedUA を この更新の updated_at（＝自分が送った値・名簿に在る）へ進めてから 0行を返す。
               follow-up select は storedUA を返す → _jibunGaOkuttaKa で自分送りと分かり conflict にしない道を縛る。
             ★一発★（次の やり直しでは 当たって 通る）。 */
          if (opts.gapBumpStored) { opts.gapBumpStored = false; storedUA = dbFmt(d.updated_at); return { data: [], error: null }; }
          /* ★網で書きを偽の200・空配列[]で止めた★（倉庫は動かない）＝新store.jsが「0行」と読む道。
             follow-up select は 倉庫そのまま（控えと同値）→ conflict にせず writeFail（帯）で返る、を確かめる為。 */
          if (opts.fakeOk200Empty) return { data: [], error: null };   /* 0行・error無し・storedUA 動かさない */
          /* ★ログイン切れ＝RLSで 行が 見えない★＝0行・書かない（follow-up select も null） */
          if (opts.hideCompanyRow) return { data: [], error: null };
          /* ★倉庫には書けて 返りだけ落ちた★＝storedUA は 進む／返りは error（控えは進まない） */
          if (opts.companyStoredButError) { if (opts.dbFormat) storedUA = dbFmt(d.updated_at); return { data: [], error: { message: '返りが 落ちた（倉庫には 書けて いる）' } }; }
          const cur = opts.dbFormat ? storedUA : curCompanyUA();
          const kiso = eqs['updated_at'];
          if (kiso != null && kiso === cur) {              /* 控えが今のDBと一致＝書ける */
            const ret = dbFmt(d.updated_at);
            if (opts.dbFormat) storedUA = ret;             /* 倉庫のUAが進む */
            return { data: [{ updated_at: ret }], error: null };
          }
          return { data: [], error: null };                /* 0行（控えが古い） */
        };
        /* ★倉庫はすぐ書き換わる／返りは遅れる★＝applyNow(書き)は今・★返りだけ companyReplyDelay 遅らせる★
           （㋒＝返り待ちの窓。列で save2 が待てば matta>0・自分送り名簿が通せば toshita>0 で縛る） */
        const run = () => {
          const r = applyNow();
          if (table === 'pay_companies' && opts.companyReplyDelay) return new Promise((res) => setTimeout(() => res(r), opts.companyReplyDelay));
          return Promise.resolve(r);
        };
        const b = {
          eq: (k, v) => { eqs[k] = v; return b; },
          select: () => b,
          single: () => run().then(r => ({ data: (r.data && r.data[0]) || null, error: r.error })),
          maybeSingle: () => run().then(r => ({ data: (r.data && r.data[0]) || null, error: r.error })),
          then: (f, r) => run().then(f, r),
        };
        return b;
      },
      select: (cols, sopts) => { calls.selects.push({ table, cols, opts: sopts || {} }); return query(table === 'pay_ledger' ? 'ledger' : table === 'pay_companies' ? 'companyData' : cols === 'id' ? 'empIds' : 'emps', cols); },
      /* ★★消しも ★棚を 実際に 減らす★／`.select('id')` で ★消えた id を 返す★★★（2026-09-28）
         ★訳★ … `store.js` は `.delete().in('id',rm)★.select('id')★` を 呼びます（指示役1 の ④）
           ⇒ ★前の 偽の 倉庫には `.select` が ★無く★、しかも ★棚も 減らなかった★
           ⇒ ★★＝差分削除の 道は ★偽の 倉庫で 1度も 通って いませんでした★★★（★25段 緑 なのに★）
         ★`204` では なく ★消えた 行★を 返す★＝★本物と 同じ 形★ */
      delete: () => ({
        in: (col, ids) => {
          calls.deletes.push(ids);
          const kieta = (ids || []).filter((id) => serverEmpIds.indexOf(id) >= 0);
          serverEmpIds = serverEmpIds.filter((id) => (ids || []).indexOf(id) < 0);
          const res = { error: null, data: kieta.map((id) => ({ id })) };
          return { select: () => Promise.resolve(res), then: (f, r2) => Promise.resolve(res).then(f, r2) };
        },
      }),
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
    /* ★今 棚に 居る 人の id★（★書き戻しが 起きたか を 数える 口★） */
    __tana: tanaIma,
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

/* ★★★㋒＝★控えを どこで 入れても 残る 窓★（★行き帰りの ずれ★）★★★（2026-09-28・指示役1 の ③）
   ★実測（指示役1）★ … `pay_companies` GET ★208〜239ms★／POST ★627〜643ms★
   ⇒ ★倉庫が 書いた 瞬間と 端末が 知る 瞬間は ★必ず ずれる★★
   ⇒ ★★『いつ 控えるか』では 解けない＝『★何を 比べるか★』を 変えた★★
   ★ここで 縛る 物★ … ★会社の 書きの ★返りが 遅れても★ 次の 保存を 誤 conflict に しない★ */
/* ★★★棚（★まだ 作って いない 段★）＝★列が 無い 世界でも 名簿の 門が 働くか★★★（2026-09-28・指示役1 の ③）
   ★何が 心配か★ … 保存を ★1本ずつ 並べた★ ので、
     ★この 段（㋒）の 窓＝『会社の 書きの 返りを 待つ 間に 次の 保存が 走る』は ★構造的に 開きません★★
   ⇒ ★★＝★名簿の 門（`okuttaNoKazu().toshita`）は この 道では ★1回も 押されません★★★
   ⇒ ★★＝『在るのに 効いて いるか 分からない 門』に なり得ます★★
   ★★要る／要らないは ★数で★ 決めます（★積んだ まま 腐らせない★＝指示役1 の 字）★★
     ・★CI の 片づけ ⑤-3 で `matta`（待たせた）が ★1回以上★ 付いた★
       ⇒ ★列は 本当に 重なりを 止めて いる★ ⇒ ★★この 棚は ★要る★★（★名簿の 門を 別の 道で 1回 押す 段を 作る★）
     ・★`matta` が ★0 の まま★★
       ⇒ ★重なりが そもそも 起きて いない★ ⇒ ★★この 棚は ★要らない★★
          ＋★★その時は ★列の 直し 自体が 未測定★★＝★そちらが 先★
   ★★下の 2つの `ok` の 役★★（★1行だけ 見て 強さを 判じない★）
     ⑴★分母★ … 重なりを ★頼めたか★（名簿の 門 or 列が 1回でも 働いたか）＝★空振りなら 赤★
     ⑵★★結果★★ … ★誤 conflict が 出て いないか（★無条件★）★＝★守りが 全部 壊れたら ここが 赤★ */
runs.push(T('★㋒: 会社の 書きの ★返りが 遅れても★ 次の 保存を 誤 conflict に しない（残った 窓）', async function () {
  const mock = makeMock({ dbFormat: true, companyReplyDelay: 400, companyUpdatedAt: '2026-09-27T19:15:00.000+00:00', companyData: { name: 'A' } });
  const Store = loadStore(mock);
  Store.setSnapshotFn(() => SNAP);
  await Store.cloudLoadState();                    /* ★先に 読む＝控えが null では なく なる（門を 通る）★ */
  const ichiP = Store.cloudSaveState(SNAP);        /* ★倉庫は すぐ 上がる／返りは 400ms 後★ */
  await new Promise((r) => setTimeout(r, 150));    /* ★★返りの 前＝残った 窓の 中★★ */
  const niP = Store.cloudSaveState(SNAP);
  const [, ni] = await Promise.all([ichiP, niP]);
  const o = Store.okuttaNoKazu();
  /* ★★★守りが ★2枚★に なりました★★★（2026-09-28・★保存を 列に した 後★）
     ★1枚目（新）★ … ★保存を 1本ずつ 並べる★ ⇒ ★★この 窓（前の 保存の 返り待ち）は ★構造的に 開きません★★★
       ＝★2本目は 1本目が 返ってから 走る＝★重なりが 起きない★
     ★2枚目（元）★ … ★自分が 送った 値の 名簿★（`okuttaNoKazu().toshita`）
       ＝★別の 道（読み込みと 保存が 重なる 等）では まだ 働きます★
     ⇒ ★★＝『名簿の 門が 0回』は ★穴では なく ★列が 先に 塞いだ★ 印★★
     ⇒ ★★但し ★どちらも 0回 なら この 試験は 空振り★★＝★そこは 今まで通り 赤に します★
     ★★P0 の 判じ（誤 conflict に しない）は 1文字も 変えて いません★★ */
  const q = (typeof Store.retsuNoKazu === 'function') ? Store.retsuNoKazu() : null;
  ok(o.toshita > 0 || (q && (q.matta > 0 || q.tatanda > 0)),
    '★どちらの 守りも 働いて いません＝この 試験は 何も 見て いません（未測定）★'
    + '（名簿の 門 ' + JSON.stringify(o) + '／列 ' + JSON.stringify(q) + '）');
  ok(!(ni && ni.reason === 'conflict'),
    '★★返りの 前に 自分で 自分を 弾きました★★（出たのは ' + JSON.stringify(ni) + '）');
}));

/* ★★★㋓＝★門（指示役1 が 止めた P0）★★★（2026-09-28）
   ★名簿を そのまま 使うと こう なる★
     ㋐読み込む 前の 端末（控え null・中身は ほぼ 空）が 保存 → ★T1 を 送る★
     ㋑同じ 端末が もう 一度 保存 → `cloudUA=T1`／控えは ★まだ null★
        ⇒ ★T1 は 自分の 名簿に 在る★ ⇒ ★通って しまう★
     ⇒ ★★空の 端末が 本番の 確定印・年末調整・会社設定を 黙って 巻き戻す★★
   ★ここで 縛る 物★ … ★読み込む 前は ★2回目も 必ず 弾く★★ */
runs.push(T('★㋓: ★倉庫には 書けて 返りが 落ちた★ 後でも ★読んで いない 端末は 必ず 弾く★（巻き戻さない）', async function () {
  /* ★★この 形で なければ 門を ★1回も 通りません★★（★09-28 実測＝門を 外しても 緑だった★）
     ★訳★ … ⑴★弾かれた 保存は 名簿に 何も 入れない★（送る 前に 弾かれる）
             ⑵★書けて 返れば 控えが 埋まる★
     ⇒ ★★『名簿に 在る／控えは null』は ★倉庫には 書けて 返りが 落ちた 時★だけ★★
     ★倉庫は 空から 始める★＝1回目は 弾かれずに ★送れる★（＝名簿に 入る）
     ★上限を 短く★＝『読み込み前の 隙』の 待ちで 時間を 食わない（★別の 用件★） */
  const mock = makeMock({ dbFormat: true, companyStoredButError: true });
  const Store = loadStore(mock, { machiMs: 100 });
  Store.setSnapshotFn(() => SNAP);
  const ichi = await Store.cloudSaveState(SNAP);
  ok(ichi && ichi.ok === false, '★1回目が 失敗に なって いない＝この 試験の 前提が 崩れて います★（' + JSON.stringify(ichi) + '）');
  ok(mock.__calls.companyUpsert.length === 1, '★1回目が 送られて いない＝名簿が 空＝門を 通りません★（' + mock.__calls.companyUpsert.length + '本）');
  const o = Store.okuttaNoKazu();
  ok(o.meibo > 0, '★名簿が 空＝この 試験は 門を 1回も 通りません（未測定）★（' + JSON.stringify(o) + '）');
  /* ★★2回目★★＝倉庫には T1 が 在る／★控えは まだ null★／★名簿には T1 が 在る★ */
  const ni = await Store.cloudSaveState(SNAP);
  ok(ni && ni.ok === false && ni.reason === 'conflict',
    '★★読んで いない 端末が 通りました＝本番の 確定印・年調・会社設定を 巻き戻せます★★（出たのは ' + JSON.stringify(ni) + '）');
  ok(ni.neverSynced === true, '★`neverSynced` が 立って いない＝画面の 文言が 変わります★（' + JSON.stringify(ni) + '）');
  ok(mock.__calls.companyUpsert.length === 1, '★2回目も 会社の 行を 書いて います＝巻き戻して います★（' + mock.__calls.companyUpsert.length + '本）');
}));

/* ★★★㋔: ★消した 人が ★前の 保存★で 書き戻らない★★★（2026-09-28・★本番の 赤から★）
   ★実測（WebKit `36441683363`／押し `ef49647`／`soshitsu-ui`）★
     ⑤-3 差分削除 … ★走った 32回／読み込めて いない 0回／手元が 空 0回★ ⇒ ★㋒（走って いない）は 死亡★
     ⑥-2 … DELETE ★1本★（消せと 言った id ★1件★）／★頼んだ 1件・消えた 1件（合う）★ ⇒ ★㋑（消せて いない）は 死亡★
           ★★㋐＝消せと 言った id（`e592de8zk`）が ★後から 着いた 書きに 入って いた★★
     ⑥ … ★残り 1人★
   ★客に 出る 形★
     ★人を 消すと ★消す 前の 名簿を 積んだ 保存が まだ 飛んで います★★
     ⇒ ★それが 消した 後に 着くと ★消した 人が 復活します★★
     ⇒ ★画面には「『◯◯』を 削除しました」と 出た まま★（`app.js:5545`〜＝★頭の 1文は 無条件★）
   ★この 段が 見る 物★ … ★倉庫（偽）の 棚に ★消した 人が 残って いないか★★
     ＝★『送った 本数』でも『返り値』でも なく ★最後に 棚に 誰が 居るか★★
   ★★ブラウザも 本物の 倉庫も 使いません★★＝★毎回 機械が 押せます★ */
runs.push(T('★★㋔: 消した 人が ★前の 保存★で 書き戻らない（客の 穴）★★', async () => {
  const AB = Object.assign({}, SNAP, { employees: [{ id: 'eA', name: 'A' }, { id: 'eB', name: 'B' }] });
  const A = Object.assign({}, SNAP, { employees: [{ id: 'eA', name: 'A' }] });
  const mock = makeMock({
    serverEmpIds: ['eA', 'eB'],
    serverEmps: [{ data: { id: 'eA' } }, { data: { id: 'eB' } }],
    companyData: { company: {} }, companyUpdatedAt: '2026-09-28T00:00:00Z', dbFormat: true,
    empDelay: 150,                 /* ★人の 書きだけ 遅らせる＝★飛んで いる 保存★を 作る★ */
  });
  const Store = loadStore(mock, { machiMs: 100 });
  Store.setSnapshotFn(() => AB);
  await Store.cloudLoadState();    /* ★読み込めた＝差分削除の 門を 通す★ */
  ok(mock.__tana().indexOf('eB') >= 0, '★前提が 崩れて います＝棚に eB が 居ません★');
  /* ⑴★消す前の 名簿で 保存を 出す（まだ 待たない＝飛んで いる 状態）★ */
  const mae = Store.cloudSaveState(AB);
  /* ⑵★人を 消して もう 1回 保存＝ここで 差分削除が 走る★ */
  Store.setSnapshotFn(() => A);
  await Store.cloudSaveState(A);
  /* ★★中途の 棚は 見ません★★（2026-09-28＝★一度 そこで 落として 訳を 誤りました★）
     ★訳★ … ★前の 保存の 書きが 着く のは ★消しの 前か 後か 時刻で 変わります★★
       ⇒ ★中途で 落とすと『差分削除が 効いて いない』と ★嘘の 訳★が 出ます★
     ⇒ ★★見るのは ⑴★消しが 走ったか★（決まって います）／⑵★最後に 棚に 誰が 居るか★★ */
  ok(mock.__calls.deletes.length >= 1, '★差分削除が 走って いません＝この 段は 何も 測れません（未測定）★');
  ok(mock.__calls.deletes.some((a) => (a || []).indexOf('eB') >= 0),
    '★消せと 言った 相手に eB が 入って いません＝この 段は 別の 事を 測って います（未測定）★（'
    + JSON.stringify(mock.__calls.deletes) + '）');
  /* ⑶★飛んで いた 保存が 後から 着く★ */
  await mae;
  await new Promise((r) => setTimeout(r, 250));
  ok(mock.__tana().indexOf('eB') < 0,
    '★★消した 人（eB）が ★前の 保存★で 書き戻りました＝★客の 穴★★（今 棚に 居るのは '
    + JSON.stringify(mock.__tana()) + '）');
}));


/* ★★★⑦-応答落ち: 倉庫には書けて 返りだけ落ちた後、2回目の保存を 誤conflictにしない★★★（2026-10-03・指示役）
   ★何が怖いか★ … 条件付きupdateにした後、「線が約19秒で落ちる」で ★応答だけ★ 落ちると、
     倉庫は自分が送った now に進むが 控えは古いまま → 次の .eq(古い控え) が0行 → 見えて控えと違う →
     ★conflict★ に見える。でも書いたのは自分。朝直した①が別の道から戻る。
   ★縛る物★ … 自分が送った値の名簿（送る前の now も入る・Date.parseで字形正規化）を見て 誤conflictにしない。 */
runs.push(T('★⑦応答落ち: 倉庫に書けて返りが落ちた後、2回目の保存は誤conflictにしない', async function () {
  const o = { dbFormat: true, companyData: { name: 'A' }, companyUpdatedAt: '2026-10-03T00:00:00.000+00:00' };
  const mock = makeMock(o);
  const Store = loadStore(mock);
  await Store.cloudLoadState();                 // 控え=initialUA(DB書式)
  o.companyStoredButError = true;               // 1回目＝倉庫には書けて 返りが落ちる
  const r1 = await Store.cloudSaveState(SNAP);
  ok(r1.ok === false, '1回目は返り落ちで ok:false（' + JSON.stringify(r1) + '）');
  o.companyStoredButError = false;              // 返りは戻った（倉庫は自分のnowに進んでいる）
  const r2 = await Store.cloudSaveState(SNAP);
  ok(!(r2 && r2.reason === 'conflict'), '★2回目が自分の書きで誤conflictした（出たのは ' + JSON.stringify(r2) + '）');
  ok(r2.ok === true, '★2回目が保存できていない（' + JSON.stringify(r2) + '）');
}));

/* ★★★⑦-ログイン切れ: 0行かつ行が見えない時は conflict でも no-user でもなく 帯が出る理由で返す★★★（2026-10-03・指示役）
   ★退化を作らない★ … 「見えない→no-user」は app.js で黙る（帯が出ない）＝使用中に切れた人を黙らせる。
     今(upsert)も RLS で転んで帯が出る。直し後も帯が出る形を保つ＝sync-check-failed（app.js:6644 で帯）。 */
runs.push(T('★⑦ログイン切れ: 0行かつ行が見えない＝conflictにせず no-userにもせず sync-check-failed（帯）', async function () {
  const o = { dbFormat: true, companyData: { name: 'A' }, companyUpdatedAt: '2026-10-03T00:00:00.000+00:00' };
  const mock = makeMock(o);
  const Store = loadStore(mock);
  await Store.cloudLoadState();                 // 控え=initialUA（この時点では見える）
  o.hideCompanyRow = true;                       // ★使用中にログインが切れた＝行が見えない★
  const r = await Store.cloudSaveState(SNAP);
  ok(r.ok === false, 'ok:false（' + JSON.stringify(r) + '）');
  ok(r.reason !== 'conflict', '★conflictにした＝ログイン切れを別端末更新と嘘をつく（' + JSON.stringify(r) + '）');
  ok(r.reason !== 'no-user', '★no-userにした＝帯が出ず黙る退化（' + JSON.stringify(r) + '）');
  ok(r.reason === 'sync-check-failed', '★帯が出る理由(sync-check-failed)で返していない（出たのは ' + r.reason + '）');
}));

/* ★★★⑦-TOCTOU: ★新しい0行follow-upの名簿分岐★だけを縛る★★★（2026-10-03・指示役）
   事前SELECTが捕まえない隙＝SELECTは控えと同じ値を返す（通す）→その後、本書きの .eq(控え) の前に
   自分の別の書き(この now)が倉庫へ着く→0行→follow-up select は自分送りの値→conflictにせず控えを進め1回で通る。
   ★この分岐を外すと（--waza相当）follow-up値!=控え で conflict に化ける＝下で手で確かめた（赤）。 */
runs.push(T('★⑦TOCTOU: 事前SELECT後・本書き前に自分の書きが着いても、新path名簿で誤conflictにしない', async function () {
  const o = { dbFormat: true, companyData: { name: 'A' }, companyUpdatedAt: '2026-10-03T01:00:00.000+00:00' };
  const mock = makeMock(o);
  const Store = loadStore(mock);
  await Store.cloudLoadState();                 // 控え=initialUA
  const rA = await Store.cloudSaveState(SNAP);  // save A（通常）→ 控え=nowA・名簿に nowA
  ok(rA.ok === true, 'save A ok（' + JSON.stringify(rA) + '）');
  o.gapBumpStored = true;                        // ★隙に自分の書き(nowB)が着く★＝本書きの直前に storedUA を進める
  const rB = await Store.cloudSaveState(SNAP);   // save B：pre-check は控えと同値で通る→本書き0行→follow-upは自分送り
  ok(!(rB && rB.reason === 'conflict'), '★新pathが自分の書きを誤conflictにした（出たのは ' + JSON.stringify(rB) + '）');
  ok(rB.ok === true, '★save B が通っていない（' + JSON.stringify(rB) + '）');
}));

/* ★★★⑦-連鎖: 応答落ちが ★続いて★ も 控えが前進し、収まれば通る（自分で自分を弾き続けない）★★★（2026-10-03・指示役）
   ★fuyo-ui で 1回 踏んだ赤（控えが止まり souko だけ進む conflict 連鎖）が、直しの狙いの真ん中。
     線が落ちた間 会社の書きの応答が 連続で 落ちる＝倉庫は自分のnowに進む／控えは返らず古いまま。
     ★縛る物★＝毎回 事前SELECTの自分送り分岐で控えが ★1つずつ前進★し、落ちが収まれば ★保存が通る★。
   ★控えが前進しない＝conflict連鎖＝赤★（＝直す前の穴 or 新path穴。どちらでも ここで止める）。 */
runs.push(T('★⑦連鎖: 応答落ちが続いても 控えが前進し 連鎖しない（収まれば通る）', async function () {
  const o = { dbFormat: true, companyData: { name: 'A' }, companyUpdatedAt: '2026-10-03T02:00:00.000+00:00' };
  const mock = makeMock(o);
  const Store = loadStore(mock);
  await Store.cloudLoadState();                 // 控え=U0
  o.companyStoredButError = true;               // ★線落ちが続く＝会社の書きの応答が連続で落ちる★
  let last = Store.okuttaNoKazu().toshita, stuck = 0;
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 3));  // ★実機は 保存が ≥500ms 間隔＝now が別の時刻★（mock が速すぎて同じ ms に なるのを防ぐ）
    const r = await Store.cloudSaveState(SNAP);
    const t = Store.okuttaNoKazu().toshita;     // 自分送りで控えが前進した回数
    ok(r.ok === false, '落ちている間は ok:false（' + JSON.stringify(r) + '）');
    if (i >= 1 && t <= last) stuck++;           // 2回目以降 前進していないと 連鎖
    last = t;
  }
  ok(stuck === 0, '★控えが前進していない＝自分で自分を弾き続ける連鎖（停滞 ' + stuck + '回）');
  o.companyStoredButError = false;              // 線が戻った
  const rec = await Store.cloudSaveState(SNAP);
  ok(rec.ok === true && rec.reason !== 'conflict', '★線が戻っても保存が通らない＝連鎖が残った（' + JSON.stringify(rec) + '）');
}));

/* ★★★⑦-網で偽200: 網で書きを 偽の200・空配列[] で止めても ★conflict覆いにしない★（帯で返る）★★★（2026-10-03・指示役）
   ★訳★ … 実ブラウザ試験の中には 書きを 網で止める物が在る。偽の200で空配列を返す形だと、新store.jsの
     条件付きupdateは「0行」と読む → follow-up select（GETは本物の倉庫・止めていない）は 倉庫そのまま（控えと同値）
     → ★conflict にせず writeFail（帯）で返る★。＝客の画面を塞ぐ覆い（別の端末で更新）は出ない。
   ★これが縛る物★ … 網で止めた書きが 偽の conflict 覆いに化けない（覆いはタブのクリックを塞ぐ＝はかれないの元）。 */
runs.push(T('★⑦網で偽200: 書きを偽200・空配列で止めても conflict覆いにせず writeFail（帯）で返る', async function () {
  const o = { dbFormat: true, companyData: { name: 'A' }, companyUpdatedAt: '2026-10-03T03:00:00.000+00:00' };
  const mock = makeMock(o);
  const Store = loadStore(mock);
  await Store.cloudLoadState();                 // 控え=initialUA
  o.fakeOk200Empty = true;                        // ★網で 偽200・空配列[] で止める★（倉庫は動かない）
  const r = await Store.cloudSaveState(SNAP);
  ok(r.ok === false, 'ok:false（' + JSON.stringify(r) + '）');
  ok(r.reason !== 'conflict', '★偽200空配列を conflict にした＝タブを塞ぐ覆いが出る（はかれないの元）（' + JSON.stringify(r) + '）');
}));

await Promise.all(runs);
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
