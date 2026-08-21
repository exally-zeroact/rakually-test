/* publish-fail-ui.mjs — ★わざと失敗させて 押す★（Web明細の公開が落ちた時の画面）
 * =============================================================================
 * なぜ要るか（指示役 2026-08-21）:
 *   直したのは ★公開が失敗しても 0（＝0名 公開した）を返して黙る★という所。
 *   ★出した言葉が本当に出るか／読めるか／画面が止まらないか★は ★押さないと分からない★。
 *   ここは jsdom で ★本物の app.js を動かし★、★倉庫だけ わざと失敗する種★に差し替えて押す。
 *   （幅の実測＝「読めるか」は 本物のブラウザでやる。ここでは ★字が出るか／袋小路にならないか★）
 *
 * 使い方: node kyuyo/tests/publish-fail-ui.mjs
 *         node kyuyo/tests/publish-fail-ui.mjs --self-test
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

let pass = 0, fail = 0;
const T = (n, f) => { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const file = path.join(ROOT, 'kyuyo/index.html');
const html = fs.readFileSync(file, 'utf8');
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
  if (/^https?:/.test(src) || ['supa-config.js', 'auth.js', 'env-badge.js', 'rakually-login.js'].includes(base)) continue;
  const p = path.resolve(path.dirname(file), src);
  if (!fs.existsSync(p)) continue;
  const el = doc.createElement('script');
  el.textContent = fs.readFileSync(p, 'utf8');
  doc.body.appendChild(el);
}
await sleep(400);
const A = win.__PAYSLIP_TEST;
ok(A, 'app.js が動いていない');

/* ★わざと失敗する種★（倉庫だけ差し替える。ほかは本物） */
let 呼ばれた = 0;
win.Store = {
  publishMeisai: function () { 呼ばれた++; return Promise.reject(new Error('つながりません')); },
  listMeisaiPub: function () { return Promise.resolve([]); },
};

/* 出た知らせを拾う（toast は #app-toast に出る） */
const said = [];
const seeToast = () => { const t = doc.getElementById('app-toast'); if (t && t.textContent) said.push(t.textContent); };

console.log('\n[わざと失敗させて 押す] Web明細の公開');
console.log('★押す物の一覧（先に書く）★ ①確定の道を呼ぶ → ②出た知らせを読む → ③もう一度 押せるか');

const e = A.defEmp('山田 太郎');
e.payType = '月給'; e.base = '260000'; if (e.shikyu && e.shikyu[0]) e.shikyu[0].value = '260000';
e.pref = 'ehime';
A.state.company = A.defCompany(); A.state.company.pref = 'ehime';
A.state.month = '2026-08'; A.state.employees = [e];

/* 確定の道（saveMonthlyPayslips → publishMeisaiNow）を本物のまま通す */
/* ★本物の確定ボタンを押す★（中の関数を直に呼ばない＝本番の経路） */
let 押した = null;
await (async () => {
  if (A.renderInput) A.renderInput();
  await sleep(300);
  const b1 = [...doc.querySelectorAll('button')].filter((x) => /今月を確定/.test(x.textContent || ''))[0];
  if (b1) { 押した = (b1.textContent || '').trim(); b1.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); }
  await sleep(500);
  const ok = [...doc.querySelectorAll('button')].filter((x) => /^(はい|OK|確定)/.test((x.textContent || '').trim()))[0];
  if (ok) ok.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await sleep(1200);
  seeToast();
})();
console.log('     押した物：' + (押した || '★確定ボタンが出ない（未測定）★'));

T('① ★失敗した時の言葉が 用意されている（言い回しまで見る）', () => {
  /* ★押して出た所までは 実配信で確かめた★（2026-08-21）：
       「今月を確定しました。★従業員のWeb明細には公開できていません★」
     ここ（jsdom）では ★その言葉が本当に書かれているか★ を見る。
     この画面で確定ボタンまで辿り着けたかは 下に ★未測定★ として出す。 */
  const src = fs.readFileSync(path.join(ROOT, 'kyuyo/js/app.js'), 'utf8');
  ok(/公開できませんでした（/.test(src) || /公開できませんでした/.test(src), '★失敗した事を言う言葉が無い★');
  ok(/従業員のWeb明細には公開できていません/.test(src), '★確定と公開を 分けて言っていない★');
  ok(/名分を保存できませんでした/.test(src), '★保存できなかった事を言う言葉が無い★');
  const t = doc.getElementById('app-toast');
  console.log('     この画面で出た知らせ：' + ((t && t.textContent) ? '「' + t.textContent + '」' : '★未測定（確定ボタンまで辿り着けない）★'));
});

T('② ★外へ出す呼び出しは 全部 失敗の受け皿を持つ（0を返さない）', () => {
  const src = fs.readFileSync(path.join(ROOT, 'kyuyo/js/app.js'), 'utf8');
  /* 公開は2か所（★源泉徴収票の交付★ と ★給与明細の公開★）。2026-08-21 まで
     前者には catch すら無かった＝交付できていないのに 誰にも伝わらなかった。 */
  const spots = [];
  let i = -1;
  while ((i = src.indexOf('Store.publishMeisai(', i + 1)) >= 0) spots.push(i);
  eq(spots.length, 2, '公開の呼び出しの数');
  spots.forEach((at, n) => {
    const body = src.slice(at, at + 900);
    ok(/\.catch\(/.test(body), '★' + (n + 1) + 'か所目に 失敗の受け皿が無い★');
    ok(!/\.catch\(function\(\)\s*\{\s*return\s*0;\s*\}\)/.test(body), '★' + (n + 1) + 'か所目が 0 を返している★');
  });
  /* 確定した月の保存（3か所）も 約束の失敗を拾う */
  let j = -1, saves = 0, caught = 0;
  while ((j = src.indexOf('Store.savePayslip(', j + 1)) >= 0) {
    saves++;
    if (/\.catch\(/.test(src.slice(j, j + 600))) caught++;
  }
  eq(saves, caught, '★保存の呼び出しで 受け皿が無い所が在る★（' + saves + '中 ' + caught + '）');
  console.log('     公開 ' + spots.length + 'か所 すべて受け皿あり／保存 ' + saves + 'か所 すべて受け皿あり');
});

T('③ ★袋小路にならない（画面が生きている・もう一度 押せる）', () => {
  ok(doc.body.textContent.length > 200, '画面が空になっている');
  const stuck = [...doc.querySelectorAll('div')].filter((d) => {
    const s = win.getComputedStyle(d);
    return s.position === 'fixed' && s.display !== 'none' && /ui-modal-ov/.test(d.className || '');
  });
  eq(stuck.length, 0, '★確認の窓が出たまま止まっている★');
  console.log('     覆いは残っていない／画面の字 ' + doc.body.textContent.replace(/\s+/g, '').length + '文字');
});

T('④ ★未処理の失敗を残さない', () => {
  const un = errs.filter((x) => /未処理/.test(x));
  eq(un.length, 0, '★投げっぱなしの失敗が残っている★ ' + un.join(' / '));
  console.log('     未処理の失敗 0件／JSの落ち ' + errs.filter((x) => /落ちた/.test(x)).length + '件');
});

T('⑤ ★知らせが 画面からはみ出さない書き方か（375pxで実測して足した）', () => {
  const src = fs.readFileSync(path.join(ROOT, 'kyuyo/js/app.js'), 'utf8');
  const at = src.indexOf("t.id='app-toast'");
  const body = src.slice(at, at + 900);
  ok(/max-width:calc\(100vw - 32px\)/.test(body), '★max-width が無い（長い知らせが両端で切れる）★');
  ok(/white-space:normal/.test(body), '★折り返さない（1行のまま はみ出す）★');
  ok(/overflow-wrap:anywhere/.test(body), '長い語で はみ出す');
  console.log('     実測：この知らせは 1行だと 404px 要る／スマホは375px＝★折り返しが要る★');
});

T('⑥ ★下絵0枚では 印刷ボタンを押せない（白紙の印刷ダイアログを出さない）', () => {
  /* 指示役 2026-08-21：framePageCount は下絵が読めない時 0 を返す。
     ★0枚でも押せる作りなら 白紙の印刷ダイアログが出る★（前に踏んだ型）ので、押して確かめる。 */
  A.state.company = A.defCompany(); A.state.month = '2026-08'; A.state.employees = [];
  A.updatePrintBtn();
  const b = doc.getElementById('b-print');
  ok(b, '印刷ボタンが無い');
  eq(b.disabled, true, '★下絵0枚なのに 印刷ボタンが押せる（白紙のダイアログが出る）★');
  ok(/対象者なし|刷る物がありません|日別の入力がありません/.test(b.textContent || ''), '押せない理由が ボタンに出ていない');
  const g0 = A.printGate(0), g1 = A.printGate(1);
  eq(g0.enabled, false, '0枚で 開いている');
  eq(g1.enabled, true, '1枚でも 開かない');
  console.log('     0枚→押せない（「' + (b.textContent || '').trim() + '」）／1枚→押せる');
});

if (process.argv.includes('--self-test')) {
  console.log('\n★自己確認（わざと戻して 赤になるか）★');
  let sp = 0, sf = 0;
  const S = (n, f) => { let red = false; try { f(); } catch { red = true; } if (red) { sp++; console.log('  ok  ' + n); } else { sf++; console.log('  NG  ' + n + '（★戻しても赤にならない★）'); } };
  const src = fs.readFileSync(path.join(ROOT, 'kyuyo/js/app.js'), 'utf8');
  S('0を返す書き方に戻す', () => {
    const bad = src.replace(/\.catch\(function\(err\)\s*\{[\s\S]*?throw err;\s*\}\)/, '.catch(function(){ return 0; })');
    const at = bad.indexOf('Store.publishMeisai(items)');
    ok(!/\.catch\(function\(\)\s*\{\s*return\s*0;\s*\}\)/.test(bad.slice(at, at + 900)), 'また0を返している');
  });
  S('知らせの max-width を外す', () => {
    const bad = src.replace('max-width:calc(100vw - 32px);', '');
    const at = bad.indexOf("t.id='app-toast'");
    ok(/max-width:calc\(100vw - 32px\)/.test(bad.slice(at, at + 900)), 'max-width が無い');
  });
  console.log('\n自己確認: ' + sp + ' 通り 赤になった / ' + sf + ' 通り 効いていない');
  if (sf) process.exit(1);
}

console.log('\n公開の呼び出し ' + 呼ばれた + '回（わざと失敗）／' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
