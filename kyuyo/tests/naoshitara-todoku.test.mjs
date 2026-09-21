/* naoshitara-todoku.test.mjs — ★確定した 後に 直したら ★紙にも 記録にも 届く★★
 * ============================================================================
 * ★司さんの 言葉（2026-09-21）★ … 「★直したなら 直らないかん やろ★」
 *
 * ★前は こうだった（実測）★
 *   ・確定を 押すと その月は ★凍結★（`saveMonthlyPayslips` が 確定済みを 書かない）
 *   ・その後 画面で 直すと … ★画面の 数字だけ 新しく なる★
 *   ・★賃金台帳（pay_payslips）★も ★従業員の Web明細★も ★古いまま★
 *   ⇒ ★★『直した』のに 客の 紙が 古い★★
 *
 * ★凍結は 消しません（訳）★
 *   ★開いただけ／描き直しただけ★で ★今の マスタで 過去月を 黙って 上書き★するのを 止める為（D1）。
 *   ⇒ ★★『開いた』と『人が 打った』を 分ける★★のが この 直しの 心臓。
 *
 * ★★この 見張りが 見る 物★★
 *   ⑴ ★開いただけ★（`saveMonthlyPayslips` を そのまま 呼ぶ）⇒ ★確定済みは 書かれない★（凍結は 生きている）
 *   ⑵ ★人が 打った★（入力画面の 欄に 本物の input）⇒ ★印が 付く★
 *   ⑶ ★印が 付いた 人だけ★ 記録が 書き直される（★他の 確定済みは 凍結のまま★）
 *   ⑷ ★紙も 出し直す★（`publishMeisai` が 呼ばれる）
 *   ⑸ ★確定して いない 月では 出し直さない★（今までどおり）
 *   ⑹ ★記録が 失敗したら 印を 消さない★（★次の 保存で もう一度 出す★）
 *   ⑺ ★出し直した 事を 字に 出す★（★黙って やらない★）
 *
 * ★測り済み（この 紙では 測り直しません）★
 *   ・★出し直しは 上書き＝紙は 増えない★（2026-09-21 実測）
 *   ・★未読の 印は 戻らない★＝★既に 読んだ 人は 数が 変わった事に 気づけません★
 *     ⇒ ★★『直った＝届いた』／『知らせて いる』では ない★★（知らせるかは 司さんの 決め）
 *
 * 使い方:
 *   node kyuyo/tests/naoshitara-todoku.test.mjs
 *   node kyuyo/tests/naoshitara-todoku.test.mjs --waza   ★わざと 凍結を 外して 赤に なるか★
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/* ★`kyuyo/` が 読み先★（★repo の 入口の index.html では ない★）
   ＝2026-09-21 に `'..','..'` と 書いて ★入口の 頁を 読み、__PAYSLIP_TEST が 出ずに 赤★ */
const ROOT = path.join(__dirname, '..');

let JSDOM;
try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdom が 入って いません。この 検証は 飛ばせません（SKIP を 緑と 呼ばない）。npm install して ください。'); process.exit(1); }

const WAZA = process.argv.includes('--waza');
let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };
const machi = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 本物の アプリを jsdom に 読み込む（integration.mjs と 同じ 形）── */
function loadApp() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1].replace(/\?.*$/, ''))
    .filter((s) => !/^https?:/.test(s) && !/supabase|supa-config|auth/.test(s));
  const domHtml = html.replace(/<script[\s\S]*?<\/script>/g, '');
  const dom = new JSDOM(domHtml, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
  const win = dom.window;
  win.fetch = () => Promise.reject(new Error('no network in test'));
  for (const src of srcs) {
    const el = win.document.createElement('script');
    el.textContent = fs.readFileSync(path.join(ROOT, src), 'utf8');
    win.document.body.appendChild(el);
  }
  if (!win.__PAYSLIP_TEST) { console.log('  ✗ ★__PAYSLIP_TEST が 出て いません（app.js の init が 失敗）★'); process.exit(1); }
  return win;
}

const win = loadApp();
const A = win.__PAYSLIP_TEST;

console.log('\n[naoshitara-todoku] ★確定した 後に 直したら 紙にも 記録にも 届くか★');

/* ★★口を 1つに する★★＝この 紙の どの 試しも ★同じ 偽物の 倉庫★を 使う
   （★約束を 返す★＝本物と 同じ形。integration.mjs の 偽物は 約束を 返さないので
     `.then` が 落ちて `catch(_e){}` に 飲まれます＝★そこを 踏まない★） */
function souko(win2, opt) {
  const o = opt || {};
  const kiroku = [], kami = [];
  win2.Store = win2.Store || {};
  win2.Store.savePayslip = function (ym, id) {
    kiroku.push(id);
    return o.kirokuKowasu ? Promise.reject(new Error('わざと 倉庫が 落ちた')) : Promise.resolve({ ok: true });
  };
  win2.Store.publishMeisai = function (items) {
    /* ★誰が 呼んだかを 残す★＝★『2回 呼ばれた』の 訳を 当てずに 見る為★ */
    kami.push({ nin: (items || []).length, doko: (new Error('こ')).stack.split('\n').slice(1, 4).join(' / ') });
    return o.kamiKowasu ? Promise.reject(new Error('わざと 出し直せない')) : Promise.resolve({ ok: true });
  };
  return { kiroku, kami };
}

/* ★人を 2人 置いて 片方だけ 確定する（毎回 同じ 支度）★ */
function shitaku(tsuki) {
  const st = A.state;
  const e0 = A.defEmp('確定した人'); e0.id = 'k1'; e0.payType = '月給'; e0.base = '250000';
  const e1 = A.defEmp('確定した人2'); e1.id = 'k2'; e1.payType = '月給'; e1.base = '260000';
  const e2 = A.defEmp('確定して いない人'); e2.id = 'm1'; e2.payType = '月給'; e2.base = '200000';
  /* ★自動計算で ない 行を 1本 足す★＝★打っても 字が 戻らない 欄★（⑷で 使う） */
  [e0, e1, e2].forEach(function (e) { (e.shikyu = e.shikyu || []).push({ label: '資格手当', value: '5000' }); });
  st.employees = [e0, e1, e2];
  st.month = tsuki; st.confirmed = {}; st._naoshita = {};
  A.setConfirm('k1', true); A.setConfirm('k2', true);
  return { e0, e1, e2, st };
}

/* ⑴ ★開いただけでは 動かない（凍結は 生きている）★ */
{
  const { kiroku } = souko(win);
  const { e0 } = shitaku('2026-04');
  e0.base = '999999';                      /* ★マスタだけ 変わった（＝開いた だけ の 形）★ */
  kiroku.length = 0;
  A.saveMonthlyPayslips(false);
  T('⑴ ★開いただけ★＝確定済みは 書かれない（凍結が 生きている）',
    kiroku.indexOf('k1') < 0 && kiroku.indexOf('m1') >= 0, '書いた … ' + kiroku.join(','));
}

/* ⑵⑶ ★人が 打った 人だけ 凍結が 解ける★ */
{
  const { kiroku } = souko(win);
  shitaku('2026-04');
  A.naoshitaShirushi('2026-04', 'k1');     /* ★打った 印★（⑷で 本物の 打ち込みからも 付く事を 見る） */
  kiroku.length = 0;
  A.saveMonthlyPayslips(false);
  T('⑵ ★打った 人（k1）は 書き直される★', kiroku.indexOf('k1') >= 0, '書いた … ' + kiroku.join(','));
  T('⑶ ★打って いない 確定済み（k2）は 凍結のまま★', kiroku.indexOf('k2') < 0, '書いた … ' + kiroku.join(','));
}

/* ⑷ ★入力画面に 本物の input を 打ったら 印が 付く★（★配線を 見る＝在る／効く は 別★） */
{
  souko(win);
  const { st } = shitaku('2026-04');
  st._naoshita = {};
  A.renderInput();
  const host = win.document.querySelector('#input-list');
  /* ★★打つ 欄は ★自動計算で ない 行★を 選ぶ★★（2026-09-21 実測で 踏んだ）
     ★はじめ★ … `.acc[data-i="0"]` の ★最初の shikyu の 欄★に 打った
     ★実物★ … それは ★基本給＝自動計算の 行★＝★注意文を 出して 字を 戻して ★帰る★★
       ⇒ ★中身は 変わらない★ので ★印も 付かない（正しい）★
       ⇒ ★★試験が 間違った 欄を 打って いた★★（★アプリの 誤りでは ない★）
     ⇒ ★支度で 自前の 行を 足し、そこを 打つ★ */
  const rans = host ? host.querySelectorAll('.acc[data-i="0"] input[data-g="shikyu"][data-f="value"]') : [];
  const ran = rans.length ? rans[rans.length - 1] : null;     /* ★最後＝足した 自前の 行★ */
  if (!ran) {
    T('⑷ ★入力画面の 欄が 在る★', false, '打つ 欄が 見つかりません（画面の 形が 変わった？）');
  } else {
    ran.value = '123456';
    ran.dispatchEvent(new win.Event('input', { bubbles: true }));
    T('⑷ ★入力画面に 打ったら 印が 付く（配線）★', A.naoshitaKa('2026-04', 'k1') === true,
      '印が 付いて いません＝★足したのに 繋がって いない★'
      + '（打った 欄 … ' + rans.length + '個中 最後／行の 名前 … '
      + (A.state.employees[0].shikyu || []).map(function (x) { return x.label; }).join('・') + '）');
  }
}

/* ⑸ ★確定して いない 人を 打っても 印は 付かない（今までどおり）★ */
{
  souko(win);
  const { st } = shitaku('2026-04');
  st._naoshita = {};
  A.renderInput();
  const host = win.document.querySelector('#input-list');
  const ran = host && host.querySelector('.acc[data-i="2"] input[data-g="shikyu"][data-f="value"]');
  if (!ran) T('⑸ ★確定して いない人の 欄が 在る★', false, '欄が 見つかりません');
  else {
    ran.value = '111';
    ran.dispatchEvent(new win.Event('input', { bubbles: true }));
    T('⑸ ★確定して いない人には 印を 付けない★', A.naoshitaKa('2026-04', 'm1') === false,
      '★要らない 人にまで 付いて います★');
  }
}

/* ⑹ ★紙も 出し直す★／⑺ ★届いたら 印を 消す★ */
{
  /* ★★先に 静まるのを 待つ★★（2026-09-21 実測で 踏んだ）
     ★何が 起きたか★ … ⑷で 本物の input を 打った ⇒ ★500ms の 保存待ちが 仕掛かる★
       ⇒ その 保存が ★この 試しの 最中に 落ちて きて★ `publishMeisai` が ★2回★ 数えられた
     ★出しで 分かった★ … 2本とも ★同じ 行（app.js の 出し直しの 所）★から
       ⇒ ★アプリが 2回 出した のでは なく ★前の 試しの 尾が 残って いた★★
     ⇒ ★★数える 前に 落としきる★★（★数を ごまかさない＝待って から 0に する★） */
  const { kiroku, kami } = souko(win);
  await machi(700);                        /* ★前の 試しの 保存待ち（500ms）より 長く★ */
  shitaku('2026-04');
  A.naoshitaShirushi('2026-04', 'k1');
  kiroku.length = 0; kami.length = 0;
  A.saveMonthlyPayslips(false);
  await machi(60);
  if (kami.length !== 1) kami.forEach(function (k, i) { console.log('       ★呼ばれた ' + (i + 1) + '★ 人 ' + k.nin + ' ／ ' + k.doko); });
  T('⑹ ★紙も 出し直す（publishMeisai が 呼ばれる）★', kami.length === 1,
    '呼ばれた 回数 ' + kami.length + '＝★記録だけ 直して 紙が 古いまま★');
  T('⑺ ★届いたら 印を 消す★', A.naoshitaKa('2026-04', 'k1') === false,
    '印が 残って います＝★毎回 出し直して しまう★');
}

/* ⑻ ★記録が 落ちたら 印を 消さない（次の 保存で もう一度 出す）★ */
{
  const { kami } = souko(win, { kirokuKowasu: true });
  shitaku('2026-04');
  A.naoshitaShirushi('2026-04', 'k1');
  kami.length = 0;
  A.saveMonthlyPayslips(false);
  await machi(60);
  T('⑻ ★記録が 落ちたら 紙も 出さない★', kami.length === 0, '記録が 落ちたのに 紙を 出しました');
  T('⑻ ★印を 消さない（次に もう一度 出す）★', A.naoshitaKa('2026-04', 'k1') === true,
    '★落ちたのに 印を 消しました＝二度と 届きません★');
}

/* ⑼ ★紙が 落ちたら 印を 消さない★ */
{
  souko(win, { kamiKowasu: true });
  shitaku('2026-04');
  A.naoshitaShirushi('2026-04', 'k1');
  A.saveMonthlyPayslips(false);
  await machi(60);
  T('⑼ ★紙が 落ちたら 印を 消さない★', A.naoshitaKa('2026-04', 'k1') === true,
    '★落ちたのに 印を 消しました★');
}

/* ⑽ ★確定が 1人も 無い 月では 出し直さない（今までどおり）★ */
{
  const { kami } = souko(win);
  const st = A.state;
  const e = A.defEmp('だれか'); e.id = 'n1'; e.payType = '月給'; e.base = '200000';
  st.employees = [e]; st.month = '2026-05'; st.confirmed = {}; st._naoshita = {};
  kami.length = 0;
  A.saveMonthlyPayslips(false);
  await machi(60);
  T('⑽ ★確定が 無い 月では 紙を 出し直さない★', kami.length === 0, '出し直した 回数 ' + kami.length);
}

/* ★★わざと＝凍結を 外したら 赤に なるか★★（★この 見張りが 空振りして いないか★） */
if (WAZA) {
  console.log('\n  ★わざと★ … ★印が 無くても 書く★ ように して 赤が 出るか');
  const { kiroku } = souko(win);
  const { e0 } = shitaku('2026-04');
  e0.base = '999999';
  kiroku.length = 0;
  A.saveMonthlyPayslips(true);            /* ★force＝凍結を 外した 時と 同じ★ */
  const akaDeru = kiroku.indexOf('k1') >= 0;
  T('★わざと 凍結を 外したら ⑴の 判じが 赤に なる★', akaDeru,
    '★force でも 書かれません＝この 見張りは 空振りです★');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
