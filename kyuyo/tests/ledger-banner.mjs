/* ledger-banner.mjs — ★「台帳から取り込む」は 行数を見てから出す★（指示役の裁定 2026-08-22）
 * =============================================================================
 * なぜ要るか:
 *   台帳(pay_ledger)に書く画面は Rakunally に 0件。だから台帳が空の会社では
 *   ★押すと必ず空振り★ なのに ボタンと「二度打ちは不要です」が出ていた。
 *   ＝★出来ていない物のボタンを見せるな★。
 * 決まり（そのまま試験にした）:
 *   ①出す条件＝その月の pay_ledger が1件以上。0件なら ★見出し・ボタン・説明文の3つとも★ 出さない
 *   ②読めなかった時（通信失敗・権限）は 出さない＝★「読めない＝在る」にしない★
 *   ③問い合わせを増やすな＝★月ごとに1回だけ★・行は読まない（head:true の countLedger）
 *   ④★初めは出さない → 読めてから出す★（先に描いて後で消すと 一瞬 嘘が見える）
 *   ⑤説明文「二度打ちは不要です」は ボタンが出ている時だけ
 *   ⑦★行数を見ずに描いていたら赤★ ← --self-test が これを実際に確かめる
 *
 * 使い方: node kyuyo/tests/ledger-banner.mjs
 *         node kyuyo/tests/ledger-banner.mjs --self-test
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const require_ = createRequire(pathToFileURL(path.join(ROOT, 'package.json')));
let JSDOM;
try { ({ JSDOM } = require_('jsdom')); }
catch { console.log('★jsdom が要ります（npm install）。飛ばせません（SKIPを緑と呼ばない）。'); process.exit(1); }

const SELF = process.argv.includes('--self-test');
let pass = 0, fail = 0;
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const INDEX = path.join(ROOT, 'kyuyo/index.html');
const html = fs.readFileSync(INDEX, 'utf8');
const APP = path.join(ROOT, 'kyuyo/js/app.js');
const APP_SRC = fs.readFileSync(APP, 'utf8');

/* ★行数を見る★ と印を付けた行だけを抜く＝「行数を見ずに描く」昔の姿に戻す（--self-test 用） */
const MARK = '/*★行数を見る★*/';
function blindSrc() {
  const lines = APP_SRC.split('\n');
  const kept = lines.filter((l) => l.indexOf(MARK) < 0);
  if (lines.length - kept.length !== 3) {
    console.log('★印「' + MARK + '」が 3行 見つかりません（' + (lines.length - kept.length) + '行）。空振りします。');
    process.exit(2);
  }
  return kept.join('\n');
}

/* 本物の画面を動かす。倉庫だけ差し替える（ほかは本物） */
async function boot(appSrc, store) {
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/kyuyo/index.html',
  });
  const win = dom.window, doc = win.document;
  win.fetch = () => Promise.reject(new Error('no net'));
  win.alert = () => {}; win.confirm = () => true; win.scrollTo = () => {}; win.print = () => {};
  const errs = [];
  win.addEventListener('error', (e) => errs.push('落ちた:' + (e.message || e)));
  win.addEventListener('unhandledrejection', (e) => errs.push('★未処理の失敗★:' + ((e.reason && e.reason.message) || e.reason)));
  for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
    const src = m[1].split('?')[0];
    const base = src.split('/').pop();
    if (/^https?:/.test(src) || ['supa-config.js', 'auth.js', 'env-badge.js', 'rakunally-login.js'].includes(base)) continue;
    const p = path.resolve(path.dirname(INDEX), src);
    if (!fs.existsSync(p)) continue;
    const el = doc.createElement('script');
    el.textContent = (base === 'app.js') ? appSrc : fs.readFileSync(p, 'utf8');
    doc.body.appendChild(el);
  }
  await sleep(300);
  const A = win.__PAYSLIP_TEST;
  ok(A, 'app.js が動いていない');
  win.SUPA = { url: 'https://x.supabase.co', key: 'k', env: 'test' };  // クラウド接続の姿
  win.Store = store;
  const e = A.defEmp('山田 太郎');
  e.payType = '月給'; e.base = '260000'; if (e.shikyu && e.shikyu[0]) e.shikyu[0].value = '260000';
  e.pref = 'ehime';
  A.state.company = A.defCompany(); A.state.company.pref = 'ehime';
  A.state.month = '2026-08'; A.state.employees = [e];
  return { win, doc, A, errs };
}

/* 画面に出ている「3つ」を数える（見出し・ボタン・説明文） */
function banner(doc) {
  const host = doc.getElementById('input-list');
  const h = host ? host.innerHTML : '';
  return {
    // ★見出しとボタンは 同じ「台帳から取り込む」を持つ★ので、見出しは絵文字つきで数える（混ぜない）
    見出し: h.split('🗒️ 台帳から取り込む').length - 1,
    ボタン: host ? host.querySelectorAll('[data-ledger-import]').length : 0,
    説明文: h.split('二度打ちは不要です').length - 1,
  };
}
const 出ていない = (b) => b.見出し === 0 && b.ボタン === 0 && b.説明文 === 0;

/* 種（倉庫）。countLedger の返し方だけ変える */
function seed(kind) {
  const calls = { count: 0, get: 0, range: null };
  const back = {
    'まだ返らない': () => new Promise(() => {}),
    '0件': () => Promise.resolve({ count: 0 }),
    '読めない': () => Promise.resolve({ count: null, error: '権限がありません' }),
    '3件': () => Promise.resolve({ count: 3 }),
  }[kind];
  return {
    calls,
    countLedger: (a, b) => { calls.count++; calls.range = a + '〜' + b; return back(); },
    getLedger: () => { calls.get++; return Promise.resolve({ rows: [], count: 0, truncated: false }); },
  };
}

const T = async (name, fn) => {
  try { await fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + ' — ' + (e && e.message)); }
};

async function 一式(appSrc, ラベル) {
  console.log('\n[' + ラベル + '] ★押す物の一覧（先に書く）★');
  console.log('  ① まだ数えていない ② 0件 ③ 読めない ④ 3件→出る→押す ⑤ 問い合わせは1回 ⑥ 読めない時は2回まで');

  await T('① ★まだ数え終わっていない間は 3つとも出ない★（先に描いて後で消さない）', async () => {
    const st = seed('まだ返らない');
    const { A, doc } = await boot(appSrc, st);
    A.renderInput(); await sleep(60);
    const b = banner(doc);
    ok(出ていない(b), '出てしまった: ' + JSON.stringify(b));
  });

  await T('② ★0件なら 見出し・ボタン・説明文の3つとも出ない★', async () => {
    const st = seed('0件');
    const { A, doc } = await boot(appSrc, st);
    A.renderInput(); await sleep(120); A.renderInput(); await sleep(60);
    const b = banner(doc);
    ok(出ていない(b), '0件なのに出た: ' + JSON.stringify(b));
    ok(st.calls.range === '2026-08-01〜2026-08-31', '数えた期間が当月でない: ' + st.calls.range);
  });

  await T('③ ★読めない時は ボタンを出さず「1行だけ」言う★（読めない＝在る にしない）', async () => {
    const st = seed('読めない');
    const { A, doc } = await boot(appSrc, st);
    A.renderInput(); await sleep(120); A.renderInput(); await sleep(120); A.renderInput(); await sleep(60);
    const b = banner(doc);
    ok(出ていない(b), '読めないのにボタンが出た: ' + JSON.stringify(b));
    /* ★2回とも読めなかった時だけ 1行★（指示役の裁定 2026-08-22）
       ＝黙って消えると 台帳を持つ会社が そのまま二度打ちに戻る */
    const host = doc.getElementById('input-list');
    const 知らせ = (host ? host.innerHTML : '').split('台帳を読み込めませんでした').length - 1;
    ok(知らせ === 1, '「読み込めませんでした」の1行が ' + 知らせ + '件（1件のはず）');
    /* jsdom に innerText は無い＝textContent で読む（無い物で測ると いつも緑になる） */
    ok((host.textContent || '').indexOf('開き直すと もう一度 読みに行きます') >= 0, '次の手が書かれていない');
  });

  await T('④ ★1件以上なら 3つとも出る／押すと台帳を読みに行く★', async () => {
    const st = seed('3件');
    const { A, doc, errs } = await boot(appSrc, st);
    A.renderInput(); /* ★待たない＝1回目の描画そのものを見る★（偽の倉庫は一瞬で返るので待つと測れない） */
    ok(出ていない(banner(doc)), '数える前から出ている（④初めは出さない）');
    await sleep(150);
    const b = banner(doc);
    ok(b.見出し === 1 && b.ボタン === 1 && b.説明文 === 1, '3件なのに出ない: ' + JSON.stringify(b));
    const btn = doc.getElementById('input-list').querySelector('[data-ledger-import]');
    btn.dispatchEvent(new (doc.defaultView.MouseEvent)('click', { bubbles: true }));
    await sleep(200);
    ok(st.calls.get === 1, '押しても台帳を読みに行かない（getLedger ' + st.calls.get + '回）');
    ok(errs.length === 0, '押したら落ちた: ' + errs.join(' / '));
  });

  await T('⑤ ★問い合わせを増やさない＝同じ月を3回 描いても 数えるのは1回★', async () => {
    const st = seed('3件');
    const { A } = await boot(appSrc, st);
    A.renderInput(); await sleep(150); A.renderInput(); A.renderInput(); await sleep(80);
    ok(st.calls.count === 1, '数えた回数が ' + st.calls.count + '回（1回のはず）');
  });

  await T('⑥ ★読めない時の数え直しは 2回まで（叩き続けない）★', async () => {
    const st = seed('読めない');
    const { A } = await boot(appSrc, st);
    for (let i = 0; i < 5; i++) { A.renderInput(); await sleep(60); }
    ok(st.calls.count === 2, '数えた回数が ' + st.calls.count + '回（2回のはず）');
  });
}

if (!SELF) {
  await 一式(APP_SRC, '本物の app.js');
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
} else {
  console.log('\n★自己診断★ … 「行数を見る」2行を抜いて（＝昔の姿に戻して）赤が出るかを見る');
  await 一式(blindSrc(), '行数を見ない app.js（わざと壊した）');
  const 捕まえた = fail;
  console.log('\n  わざと壊した時に 赤になった数 … ' + 捕まえた + '件（①②③が赤になるはず＝3件以上）');
  if (捕まえた < 3) { console.log('  ✗ ★空振りです★ 壊しても赤にならない＝この試験は守っていません'); process.exit(1); }
  console.log('  ✓ ★壊したら赤になった＝この試験は本当に見張っています★');
  process.exit(0);
}
