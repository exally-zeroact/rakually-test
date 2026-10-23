/* input-page.test.mjs — ★人が 多くても 入力の 画面は 1ページ 50名・探せる／お金は 全員に かかる★（jsdom・ブラウザ無し）
 * ============================================================================
 * ★守る事（2026-10-23 司さん「150人で重くなるシステムに問題があるやろが」）★
 *   158人を 一度に 描くと 部品 約19,600個・入力タブで 画面が 1.3秒 固まった（電話の 遅さ・実測）。
 *   競合（マネーフォワード クラウド給与 2026-10-16）と 同じく 1ページ 50名＋名前／番号で 探す 形に した。
 * ★この門が 見る事★
 *   ① 120人 … 1ページ目 50枚・次で 51〜100・最後 20枚・前へ 戻れる
 *   ② 描かれない ページの 日給の 人も 出勤が 所定日数で 埋まる（★0円で 確定されない★）
 *   ③ 確認の 数・「今月を確定」は 全員（120名）を 数える
 *   ④ 名前・番号で 探すと 当たる 人だけ 出る／当たらない 時は そう 言う
 *   ⑤ 10人の 会社は 前後の 帯も 探す 欄も 出ない（今の 画面の まま）
 *   ⑥ 表で まとめて も 1ページ 50行
 *   ⑦ 部品の 数＝120人でも 50人の 時と ほぼ 同じ（人数に 比例して 増えない）
 * ★空振り止め（--waza）★ … renderInput の 頭の umeShotei() を 外して 配る ⇒ ② が 赤＝門が 埋めを 守っている 証し。
 * 使い方: node kyuyo/tests/input-page.test.mjs   ／   --waza
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
const WAZA = process.argv.includes('--waza');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KESU_MAE = "    umeShotei();\n";
let kesita = 0;

const file = path.join(ROOT, 'kyuyo/index.html');
const html = fs.readFileSync(file, 'utf8');
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/kyuyo/index.html' });
const win = dom.window, doc = win.document;
win.fetch = () => Promise.reject(new Error('no net')); win.alert = () => {}; win.confirm = () => true; win.scrollTo = () => {}; win.print = () => {};
for (const m of html.matchAll(/<script src="([^"]+)"><\/script>/g)) {
  const src = m[1].split('?')[0]; const base = src.split('/').pop();
  if (/^https?:/.test(src) || ['supa-config.js', 'auth.js', 'env-badge.js', 'rakunally-login.js'].includes(base)) continue;
  const p = path.resolve(path.dirname(file), src); if (!fs.existsSync(p)) continue;
  let code = fs.readFileSync(p, 'utf8');
  if (base === 'app.js') {
    const at = code.indexOf('  function renderInput(){');
    const head = code.slice(0, at), tail = code.slice(at);
    kesita = tail.split(KESU_MAE).length - 1 > 0 ? 1 : 0;
    if (WAZA) code = head + tail.replace(KESU_MAE, '');
  }
  const el = doc.createElement('script'); el.textContent = code; doc.body.appendChild(el);
}
await sleep(400);

let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };
const A = win.__PAYSLIP_TEST;
if (!A || !A.renderInput || !A.defEmp || !A.state || !A.umeShotei) { console.log('✗ ★app.js から renderInput／defEmp／state／umeShotei が 取れない★'); process.exit(1); }
console.log('\n[input-page] 入力の 画面は 1ページ 50名・探せる／お金は 全員に かかる' + (WAZA ? '  ★★umeShotei を 外した回★★' : ''));
T('★renderInput の 頭に umeShotei() が 在る★', kesita === 1);

/* 倉庫の 答えを 待たない（読み込み中の 画面に しない） */
try { A.state._soukoYomikomi = false; } catch (e) {}
const host = () => doc.querySelector('#input-list');
const fuda = () => [...host().querySelectorAll('.acc[data-i]')].map((x) => +x.dataset.i);
const mk = (n, extra) => Object.assign(A.defEmp(), { id: 'E' + String(n).padStart(3, '0'), name: '試し' + String(n).padStart(3, '0'), no: String(1000 + n), base: '250000', pref: 'ehime' }, extra || {});
A.state.company = A.defCompany ? A.defCompany() : (A.state.company || {});
A.state.month = '2026-07';
A.state.confirmed = {};
A.state.inputView = 'card';
A.state._inputQ = ''; A.state._inputPage = 0; A.state._reviewOnly = false;
A.state.employees = [];
for (let n = 1; n <= 120; n++) A.state.employees.push(mk(n, n === 110 ? { payType: '日給', daily: '10000' } : {}));
/* 110番の 日給の 人は 出勤を 空に（描かれない 3ページ目） */
A.umeShotei = A.umeShotei; // 出し口の 確かめ
const e110 = A.state.employees[109];
A.ensureKintai ? A.ensureKintai(e110) : null;
const kinOf = (e) => (e.kintai || []).find((k) => /出勤/.test(k.label || ''));
if (kinOf(e110)) kinOf(e110).value = '';

A.renderInput();
let f1 = fuda();
const soukoMachi = /読み込み中|つながりません/.test(host().textContent) && f1.length === 0;
if (soukoMachi) { console.log('✗ ★倉庫の 答え待ちの 画面に なった（試験の 支度が 足りない）★'); process.exit(1); }
T('① 120人 … 1ページ目は 50枚', f1.length === 50, '枚数 ' + f1.length);
T('① 帯に「1〜50人目／120名」', /1〜50人目／120名/.test(host().textContent), host().textContent.slice(0, 200));
const k110 = kinOf(e110);
if (!WAZA) T('★② 描かれない 3ページ目の 日給の 人も 出勤が 所定日数で 埋まる（0円で 確定されない）★', !!k110 && String(k110.value) !== '' && +k110.value > 0, '出勤=' + (k110 && k110.value));
else T('★--waza: umeShotei を 外すと 3ページ目の 日給の 人は 出勤が 空の まま（門が 埋めを 守っている 証し）★', !!k110 && String(k110.value) === '', '出勤=' + (k110 && k110.value));
T('③ 確認の 数は 全員（120名）を 数える', /確認 \d+\/120名/.test(host().textContent), (host().textContent.match(/確認 \d+\/\d+名/) || [''])[0]);
const domN1 = host().getElementsByTagName('*').length;

host().querySelector('[data-ipage="1"]').click(); await sleep(20);
let f2 = fuda();
T('① 次へ … 51〜100人目', f2.length === 50 && f2[0] === 50 && f2[49] === 99, '先頭 ' + f2[0] + ' 末尾 ' + f2[f2.length - 1]);
host().querySelector('[data-ipage="1"]').click(); await sleep(20);
let f3 = fuda();
T('① 最後の ページは 20枚（101〜120人目）', f3.length === 20 && f3[0] === 100, '枚数 ' + f3.length);
T('① 最後の ページで「次へ」は 押せない', host().querySelector('[data-ipage="1"]').disabled === true);
host().querySelector('[data-ipage="-1"]').click(); await sleep(20);
T('① 前へ 戻れる', fuda()[0] === 50);

/* ④ 探す */
const q = host().querySelector('[data-inputq]');
q.value = '試し077'; q.dispatchEvent(new win.Event('input', { bubbles: true })); await sleep(350);
T('④ 名前で 探すと 当たる 1人だけ 出る（ページは 1へ 戻る）', fuda().length === 1 && fuda()[0] === 76, '出た ' + fuda().join(','));
const q2 = host().querySelector('[data-inputq]');
T('④ 探した 後も 探す 欄に 字が 残る', q2 && q2.value === '試し077');
q2.value = '1088'; q2.dispatchEvent(new win.Event('input', { bubbles: true })); await sleep(350);
T('④ 従業員番号で 探せる', fuda().length === 1 && fuda()[0] === 87, '出た ' + fuda().join(','));
const q3 = host().querySelector('[data-inputq]');
q3.value = '居ない人'; q3.dispatchEvent(new win.Event('input', { bubbles: true })); await sleep(350);
T('④ 当たらない 時は「当たる人はいません」と 言う', fuda().length === 0 && /当たる人はいません/.test(host().textContent));

/* ⑧ カナ・全角半角（taiketsu S2）… 41番の 人に カナ「ヤマダ タロウ」 */
A.state.employees[40].kana = 'ヤマダ タロウ';
const utsu = async (ji) => { const x = host().querySelector('[data-inputq]'); x.value = ji; x.dispatchEvent(new win.Event('input', { bubbles: true })); await sleep(350); };
await utsu('やまだ');
T('⑧ ひらがなで 打っても カタカナの カナに 当たる', fuda().length === 1 && fuda()[0] === 40, '出た ' + fuda().join(','));
await utsu('ﾔﾏﾀﾞ');
T('⑧ 半角カナでも 当たる', fuda().length === 1 && fuda()[0] === 40, '出た ' + fuda().join(','));
await utsu('１０８８');
T('⑧ 全角の 数字でも 従業員番号に 当たる', fuda().length === 1 && fuda()[0] === 87, '出た ' + fuda().join(','));

/* ⑨ 日本語の 変換中は 描き直さない（taiketsu S1）… 欄が 作り直されると 打っている 字が 壊れる */
await utsu('');
const qa = host().querySelector('[data-inputq]');
qa.dispatchEvent(new win.CompositionEvent('compositionstart', { bubbles: true }));
qa.value = 'やま'; qa.dispatchEvent(new win.InputEvent('input', { bubbles: true, isComposing: true })); await sleep(350);
T('⑨ 変換中は 欄が 作り直されない（同じ 欄の まま・まだ 絞らない）', qa.isConnected && host().querySelector('[data-inputq]') === qa && fuda().length === 50, '同じ欄 ' + qa.isConnected + '／札 ' + fuda().length);
qa.dispatchEvent(new win.CompositionEvent('compositionend', { bubbles: true, data: 'やま' })); await sleep(350);
T('⑨ 変換が 決まったら 絞る（カナ ヤマダ の 1人）', fuda().length === 1 && fuda()[0] === 40, '出た ' + fuda().join(','));
/* ⑨ 決めた 直後（250ms 以内）に 次の 変換を 始めたら、待ちの 描き直しも 止まる */
const qb = host().querySelector('[data-inputq]');
qb.dispatchEvent(new win.CompositionEvent('compositionend', { bubbles: true, data: 'やま' })); await sleep(100);
qb.dispatchEvent(new win.CompositionEvent('compositionstart', { bubbles: true })); await sleep(350);
T('⑨ 決めた 直後に 次の 変換を 始めたら 欄は 作り直されない', qb.isConnected && host().querySelector('[data-inputq]') === qb);
qb.dispatchEvent(new win.CompositionEvent('compositionend', { bubbles: true, data: 'やま' })); await sleep(350);

/* ⑩ 表で 探して 当たらない 時（taiketsu S3）… 「全員確認済み」と 言わない */
A.state.inputView = 'table'; A.state._inputQ = '居ない人'; A.state._inputPage = 0; A.renderInput();
T('⑩ 表で 当たらない 時は「当たる人はいません」・「全員確認済み」とは 言わない', /当たる人はいません/.test(host().textContent) && !/全員確認済み/.test(host().textContent), host().textContent.slice(-120));
A.state.inputView = 'card';
/* ⑪ 「要確認だけ」で 確認済みの 人を 探した 時は「当たる要確認の人はいません」（居ないとは 言わない） */
A.setConfirm('E005', true);
A.state._reviewOnly = true; A.state._inputQ = '試し005'; A.state._inputPage = 0; A.renderInput();
T('⑪ 要確認だけの 時に 確認済みの 人を 探すと「当たる要確認の人はいません」', fuda().length === 0 && /当たる要確認の人はいません/.test(host().textContent), '札 ' + fuda().length + ' ' + host().textContent.slice(-80));
A.setConfirm('E005', false); A.state._reviewOnly = false;
A.state._inputQ = ''; A.state._inputPage = 0;

/* ⑥ 表 */
A.state.inputView = 'table'; A.renderInput();
const trows = host().querySelectorAll('.trow[data-i]').length;
T('⑥ 表で まとめて も 1ページ 50行', trows === 50, '行 ' + trows);
A.state.inputView = 'card';

/* ⑦ 部品の 数 */
A.state.employees = A.state.employees.slice(0, 50); A.renderInput();
const domN50 = host().getElementsByTagName('*').length;
T('⑦ 120人の 画面の 部品の 数は 50人の 時の 1.2倍 以内（人数に 比例して 増えない）', domN1 <= domN50 * 1.2, '120人 ' + domN1 + '／50人 ' + domN50);

/* ⑤ 10人 */
A.state.employees = A.state.employees.slice(0, 10); A.renderInput();
T('⑤ 10人の 会社は 10枚・前後の 帯も 探す 欄も 出ない（今の 画面の まま）', fuda().length === 10 && !host().querySelector('.in-pager') && !host().querySelector('[data-ipage]'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('KEKKA {"passed":' + pass + ',"failed":' + fail + ',"mimiso":0}');
process.exit(fail ? 1 : 0);
