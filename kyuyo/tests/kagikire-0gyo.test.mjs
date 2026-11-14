// kagikire-0gyo.test.mjs — ★ログインが 切れた（anon）・別の 端末で 先に 消えた 等で、書き換え／消しが
//   倉庫の RLS で 0行に なっても「できました」と 言わない★（2026-11-14）。
//   PostgREST は 0行でも 204・error null を 返す（テスト倉庫で 実測＝.select('id') を 付けると 200・data=[]）。
//   見本＝js/suite-data.js の kesetaKa（書けた 行を 数える）。
//   ここは ★偽の supabase★（.select を 付けた 時は data=[] か 行・付けない 時は 204 の形）で 本物の
//   seikyu/js/seikyu-store.js と kyuyo/js/store.js を 読み、返りを 見る。倉庫には 触らない。
//   使い方: node kyuyo/tests/kagikire-0gyo.test.mjs [--self-test]
//     --self-test … 直しを 1つずつ 外した 写しで 回し、それぞれ 赤に なる事を 確かめる（門が 本当に 守るか）。
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdom が要ります（npm install）。飛ばせません（SKIPを緑と呼ばない）。'); process.exit(1); }

const yomu = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* 偽の supabase。rows＝.select を 付けた 時に 返す 行（[]＝RLS で 0行）。
   付けない 時は 本物と 同じく data:null・error:null（204）。log に 呼びを 残す。 */
function nisemono(state) {
  function builder(table) {
    const op = { table, kind: 'select', sel: false, eq: [] };
    const b = {
      update(v) { op.kind = 'update'; op.v = v; return b; },
      delete() { op.kind = 'delete'; return b; },
      insert(v) { op.kind = 'insert'; op.v = v; return b; },
      upsert(v) { op.kind = 'upsert'; op.v = v; return b; },
      select() { if (op.kind !== 'select') op.sel = true; return b; },
      eq(k, v) { op.eq.push([k, v]); return b; }, is() { return b; }, in() { return b; },
      order() { return b; }, range() { return b; }, limit() { return b; },
      maybeSingle() { op.single = true; return b; }, single() { op.single = true; return b; },
      then(res, rej) {
        state.log.push(op);
        let r;
        if (state.error) r = { data: null, error: { message: state.error } };
        else if (op.kind === 'select') r = { data: op.single ? null : [], error: null, count: 0 };
        else if (op.sel) r = { data: state.rows.slice(), error: null, status: 200 };
        else r = { data: null, error: null, status: 204 };
        return Promise.resolve(r).then(res, rej);
      },
    };
    return b;
  }
  const auth = {
    getUser: () => Promise.resolve({ data: { user: { id: 'u1' } }, error: null }),
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    setSession: () => Promise.resolve({ data: {}, error: null }),
    signOut: () => Promise.resolve({ error: null }),
  };
  return { from: builder, auth, rpc: () => Promise.resolve({ data: null, error: null }) };
}

function oku(win, src) { const el = win.document.createElement('script'); el.textContent = src; win.document.body.appendChild(el); }

async function mawasu(src) {
  let pass = 0, fail = 0; const kekka = [];
  async function T(name, fn) { try { await fn(); pass++; kekka.push('  ✓ ' + name); } catch (e) { fail++; kekka.push('  ✗ ' + name + ' — ' + (e && e.message)); } }
  const ok = (c, m) => { if (!c) throw new Error(m || 'expected truthy'); };

  /* ── 請求書の 倉庫（seikyu-store） ── */
  const d1 = new JSDOM('<!doctype html><body></body>', { runScripts: 'dangerously', url: 'http://localhost/' });
  const w1 = d1.window; w1.console.log = () => {};
  oku(w1, src.ritsu); oku(w1, src.tax); oku(w1, src.doc); oku(w1, src.seikyu);
  const st = { rows: [], log: [], error: null };
  const S = w1.SeikyuStore.create({ client: nisemono(st) });
  const yobi = [
    ['取り消し（voidIt）', () => S.invoices.voidIt('iv1')],
    ['下書きを消す（removeDraft）', () => S.invoices.removeDraft('iv1')],
    ['送った印（markSent）', () => S.invoices.markSent('iv1')],
    ['入金の取り消し（receipts.remove）', () => S.receipts.remove('rc1')],
  ];
  for (const [nm, f] of yobi) {
    await T('① ' + nm + '：倉庫が 0行（ログイン切れ・もう無い）なら ok にしない', async () => {
      st.rows = []; st.error = null; st.log.length = 0;
      const r = await f();
      ok(r && r.ok === false, 'ok=' + (r && r.ok));
      ok(/ログインが切れたか/.test(String(r.reason || '')), 'reason=' + (r && r.reason));
      const o = st.log[st.log.length - 1]; ok(o && o.sel, '.select を 付けていない（行を 数えられない）');
    });
    await T('② ' + nm + '：1行 書けたら ok', async () => {
      st.rows = [{ id: 'x' }]; st.error = null;
      const r = await f(); ok(r && r.ok === true, 'ok=' + (r && r.ok) + ' reason=' + (r && r.reason));
    });
    await T('③ ' + nm + '：倉庫の error は 今まで通り その字で ok:false', async () => {
      st.rows = [{ id: 'x' }]; st.error = 'JWT expired';
      const r = await f(); ok(r && r.ok === false && /JWT expired/.test(r.reason), 'r=' + JSON.stringify(r));
      st.error = null;
    });
  }

  /* ── 給与の 倉庫（kyuyo/js/store.js）＝初回コードの 再発行 ── */
  const d2 = new JSDOM('<!doctype html><body></body>', { runScripts: 'dangerously', url: 'http://localhost/' });
  const w2 = d2.window; w2.console.log = () => {}; w2.console.warn = () => {};
  const st2 = { rows: [], log: [], error: null };
  w2.SUPA = { url: 'https://x.supabase.co', key: 'k' };
  w2.supabase = { createClient: () => nisemono(st2) };
  oku(w2, src.store);
  const Store = w2.Store;
  await T('④ 初回コードの再発行：倉庫が 0行なら ok にしない（使えない コードを 渡さない）', async () => {
    st2.rows = []; st2.error = null; st2.log.length = 0;
    const r = await Store.reissueMeisaiInit('tA');
    ok(r && r.ok === false, 'ok=' + (r && r.ok));
    const o = st2.log.filter((x) => x.table === 'pay_meisai_pub').pop(); ok(o && o.sel, '.select を 付けていない');
  });
  await T('④ 初回コードの再発行：1行 書けたら ok と コード', async () => {
    st2.rows = [{ token: 'tA' }]; st2.error = null;
    const r = await Store.reissueMeisaiInit('tA');
    ok(r && r.ok === true && r.initCode, 'r=' + JSON.stringify(r));
  });
  await T('④ 束の消し（Store.remove・呼ぶ人0）：0行は false', async () => {
    st2.rows = []; const r = await Store.remove('b1'); ok(r === false, 'r=' + r);
    st2.rows = [{ id: 'b1' }]; const r2 = await Store.remove('b1'); ok(r2 === true, 'r2=' + r2);
  });

  /* ── 使う側（字の門＝画面ごと 立てるのは 重い） ── */
  await T('⑤ 給与の画面：再発行は r.ok を 見てから「再発行しました」と言う', async () => {
    const i = src.app.indexOf('Store.reissueMeisaiInit(tok)'); ok(i >= 0, '呼びが 無い');
    const kiri = src.app.slice(i, i + 900);
    const a = kiri.indexOf("toast('初回コードを再発行しました')"); ok(a >= 0, '「再発行しました」が 無い');
    ok(/if\(!r\|\|!r\.ok\)/.test(kiri.slice(0, a)), '「再発行しました」の 前に r.ok を 見ていない');
  });
  await T('⑥ 管理画面：プランの変更は 書けた 行を 数えてから「変更しました」と言う', async () => {
    const i = src.admin.indexOf('function setPlan'); ok(i >= 0, 'setPlan が 無い');
    const kiri = src.admin.slice(i, i + 1200);
    const a = kiri.indexOf("'」に変更しました'"); ok(a >= 0, '「変更しました」が 無い');
    const mae = kiri.slice(0, a);
    ok(/\.select\(/.test(mae), '.select を 付けていない');
    /* ★0行の 判じ そのものを 見る★（taiketsu 11-14 任3＝近くの 関係ない .length でも 通っていた） */
    ok(/if \(!\(r\.data && r\.data\.length\)\) \{ toast\('変更できませんでした（ログインが切れたか/.test(mae), '0行の時に 止めていない');
  });
  return { pass, fail, kekka };
}

const moto = {
  ritsu: yomu('kyuyo/lib/shouhizei-ritsu.js'), tax: yomu('seikyu/lib/seikyu-tax.js'),
  doc: yomu('seikyu/lib/seikyu-doc.js'), seikyu: yomu('seikyu/js/seikyu-store.js'),
  store: yomu('kyuyo/js/store.js'), app: yomu('kyuyo/js/app.js'), admin: yomu('kyuyo/js/admin.js'),
};

if (process.argv.includes('--self-test')) {
  /* ★直しを 1つずつ 外す★（外すと 赤に なる＝門が 本当に 守る）。置き換え先が 無ければ それ自体が 赤 */
  const KOWASHI = [
    ['seikyu の 0行の判じを外す', 'seikyu', /function kakitaKa\(w, ji\) \{[\s\S]*?\n  \}/, 'function kakitaKa(w, ji) { return (w && w.error) ? { ok: false, reason: err(w.error) } : { ok: true }; }'],
    ['voidIt の .select を外す', 'seikyu', ".eq('id', id).select('id'))\n            .then(kakitaKa)", ".eq('id', id))\n            .then(kakitaKa)"],
    ['再発行の 0行の判じを外す', 'store', "if(!(r.data&&r.data.length)) return { ok:false", "if(false) return { ok:false"],
    ['束の消しの 0行の判じを外す', 'store', "return !!(r&&!r.error&&r.data&&r.data.length);", 'return true;'],
    ['画面の r.ok を外す', 'app', "if(!r||!r.ok){ toast('初回コードを再発行できませんでした", "if(false){ toast('初回コードを再発行できませんでした"],
    ['管理画面の 0行の判じを外す', 'admin', "if (!(r.data && r.data.length))", 'if (false)'],
  ];
  let aka = 0, ng = 0;
  for (const [nm, k, from, to] of KOWASHI) {
    const s = Object.assign({}, moto);
    const ato = s[k].replace(from, to);
    if (ato === s[k]) { ng++; console.log('  ✗ 壊し「' + nm + '」の 置き換え先が 無い'); continue; }
    s[k] = ato;
    const r = await mawasu(s);
    if (r.fail > 0) { aka++; console.log('  ✓ 壊し「' + nm + '」＝赤 ' + r.fail + '件（門が 守る）'); }
    else { ng++; console.log('  ✗ 壊し「' + nm + '」でも 緑＝門が 守っていない'); }
  }
  console.log('\n✓ kagikire-0gyo --self-test: 赤 ' + aka + ' / 抜け ' + ng);
  console.log('KEKKA ' + JSON.stringify({ passed: aka, failed: ng, mimiso: 0 }));
  process.exit(ng ? 1 : 0);
}

console.log('\n[kagikire-0gyo] 倉庫が 0行の 書きを「できました」と 言わない');
const r = await mawasu(moto);
r.kekka.forEach((x) => console.log(x));
console.log('\n' + (r.fail ? '✗' : '✓') + ' kagikire-0gyo: ' + r.pass + ' ✓ / ' + r.fail + ' ✗');
console.log('KEKKA ' + JSON.stringify({ passed: r.pass, failed: r.fail, mimiso: 0 }));
process.exit(r.fail ? 1 : 0);
