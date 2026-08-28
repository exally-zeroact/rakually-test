/* paycycle-nweeks.test.mjs — ★支給サイクルの「任意（N週ごと）」★（司さん 2026-08-28）
 * =============================================================================
 * ★なぜ足したか★
 *   司さんが実機で触って … ★締め方には「任意N日」が在るのに 支給サイクルには 任意が無い★。
 *   「月2回だが10日と25日」「隔週」「4週ごと」が 入れられなかった。
 * ★作り方の決まり（指示役 2026-08-28）★
 *   ・★締め方と同じ作り★（4択＋任意／任意の時だけ N の欄を出す）＝別の作りにしない
 *   ・★計算方式は変えない★（今の注意書きのとおり＝明細の表示と税区分の目安）
 *   ・★聞く形で聞く★（「何回 払いますか」→選ばせる→その場で 次の支給日を出す）
 *
 * ここで見る物（★字を読むだけにせず 実際に選んで押す★）
 *   ① 画面に「任意（N週ごと）」が在り、★選ぶまで N の欄は出ない★
 *   ② 選ぶと ★N の欄が出る★／戻すと ★引っ込む★（締め方と同じ動き）
 *   ③ N を入れると ★注意書きが その数で変わる★（3 → 「3週ごと」）
 *   ④ ★紙の「支給日」に （N週ごと）が出る★
 *   ⑤ 聞く形に「何回 払いますか？」が在り、★N を入れるまで 答えを返さない★
 *   ⑥ ★計算方式は変わっていない★＝月1回の時と 同じ金額（1円も動かない）
 *
 * 使い方: node kyuyo/tests/paycycle-nweeks.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません。この検証は飛ばせません（SKIPを緑と呼ばない）。npm install してください。'); process.exit(1); }

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'false'); };

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1].replace(/\?.*$/, ''))
  .filter((s) => !/^https?:/.test(s) && !/supabase|supa-config|auth/.test(s));
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''),
  { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
const win = dom.window, doc = win.document;
win.fetch = () => Promise.reject(new Error('no net'));
win.print = () => {};
const errs = [];
win.addEventListener('error', (e) => errs.push('window.error: ' + (e.message || e)));
for (const src of srcs) {
  const el = doc.createElement('script');
  el.textContent = fs.readFileSync(path.join(ROOT, src), 'utf8');
  doc.body.appendChild(el);
}
const A = win.__PAYSLIP_TEST;
ok(A, '__PAYSLIP_TEST 露出(init成功)');

const $ = (id) => doc.getElementById(id);
const fire = (el, type) => el.dispatchEvent(new win.Event(type, { bubbles: true }));
/** 実際に select を選ぶ（値を入れて change を出す＝人が選んだのと同じ道） */
function pick(id, v) { const el = $(id); el.value = v; fire(el, 'change'); }
function typeIn(id, v) { const el = $(id); el.value = v; fire(el, 'input'); }

console.log('\n[paycycle-nweeks] 支給サイクルの「任意（N週ごと）」を 実際に選んで押す');

T('★① 画面に「任意（N週ごと）」が在る（締め方と同じ作り）', () => {
  const sel = $('c-paycycle');
  ok(sel, '支給サイクルの選ぶ所が無い');
  const vals = [...sel.options].map((o) => o.value);
  ok(vals.indexOf('nweeks') >= 0, '「任意」が無い（在るのは ' + vals.join('/') + '）');
  /* 締め方と 同じ形か＝どちらも「最後が任意」「任意の時だけ N の欄」 */
  const shime = [...$('c-shime').options].map((o) => o.value);
  ok(shime[shime.length - 1] === 'ndays', '締め方の作りが変わっている');
  ok(vals[vals.length - 1] === 'nweeks', '任意が最後に無い＝締め方と揃っていない');
  console.log('     支給サイクル ' + vals.join('/') + ' ／ 締め方 ' + shime.join('/'));
});

T('★② 選ぶまで N の欄は出ない／選ぶと出る／戻すと引っ込む', () => {
  const row = $('c-paycyclen-row');
  ok(row, 'N週の欄が無い');
  pick('c-paycycle', 'monthly');
  ok(row.style.display === 'none', '月1回なのに N の欄が出ている（' + row.style.display + '）');
  pick('c-paycycle', 'nweeks');
  ok(row.style.display !== 'none', '任意を選んでも N の欄が出ない');
  pick('c-paycycle', 'weekly');
  ok(row.style.display === 'none', '任意をやめても N の欄が残っている');
  console.log('     月1回=隠れる ／ 任意=出る ／ 週払い=隠れる');
});

T('★③ N を入れると 注意書きが その数で変わる（実際に打つ）', () => {
  pick('c-paycycle', 'nweeks');
  typeIn('c-paycyclen', '3');
  ok(A.state.company.payCycleN === '3', '打った数が入っていない（' + A.state.company.payCycleN + '）');
  const note = $('paycycle-note').textContent;
  ok(/3週ごと/.test(note), '注意書きに 3週ごと が出ない：「' + note.slice(0, 60) + '」');
  ok(/計算方式は変わりません/.test(note), '★計算方式は変わらない、と言っていない★');
  typeIn('c-paycyclen', '4');
  ok(/4週ごと/.test($('paycycle-note').textContent), '数を変えても 注意書きが追わない');
  console.log('     3→「' + note.replace(/<[^>]*>/g, '').slice(0, 28) + '…」／4も追う');
});

T('★④ 数字でない字は 入らない（その場で直す）', () => {
  typeIn('c-paycyclen', '2週');
  ok(A.state.company.payCycleN === '2', '数字以外が入った（' + A.state.company.payCycleN + '）');
  ok($('c-paycyclen').value === '2', '画面の字が 直っていない（' + $('c-paycyclen').value + '）');
});

T('★⑤ 紙の「支給日」に （N週ごと）が出る', () => {
  pick('c-paycycle', 'nweeks');
  typeIn('c-paycyclen', '2');
  const s = A.payDateForSlip ? A.payDateForSlip() : null;
  ok(s !== null, '★紙の支給日を作る所を 見られない（__PAYSLIP_TEST に payDateForSlip が無い）★');
  ok(/（2週ごと）/.test(s), '紙に 出ない：「' + s + '」');
  pick('c-paycycle', 'monthly');
  ok(!/週ごと/.test(A.payDateForSlip()), '月1回に戻したのに 週ごと が残る：「' + A.payDateForSlip() + '」');
  console.log('     2週ごと →「' + s + '」／月1回 →「' + A.payDateForSlip() + '」');
});

T('★⑥ 聞く形に「何回 払いますか？」が在り、N を入れるまで 答えを返さない', () => {
  ok(A.ASK_Q, '★聞く形の問いを 見られない（__PAYSLIP_TEST に ASK_Q が無い）★');
  const q = A.ASK_Q().filter((x) => x.key === 'payCycle')[0];
  ok(q, '「何回 払いますか？」が 聞く形に無い');
  ok(/何回/.test(q.q), '問いの字が「' + q.q + '」');
  A.state.company.payCycle = 'nweeks'; A.state.company.payCycleN = '';
  ok(A.ASK_Q().filter((x) => x.key === 'payCycle')[0].answer() === null,
    '★数を入れていないのに 答えを返している（当てずっぽうを返さない）★');
  A.state.company.payCycleN = '2';
  const a = A.ASK_Q().filter((x) => x.key === 'payCycle')[0].answer();
  ok(a && /2週ごと/.test(a.text), 'その場の返しが 出ない：' + JSON.stringify(a));
  A.state.company.payCycle = 'monthly'; A.state.company.paydayDay = '25';
  const a2 = A.ASK_Q().filter((x) => x.key === 'payCycle')[0].answer();
  ok(a2 && /次の支給日/.test(a2.text), '★月1回の時に 次の支給日を出していない★：' + JSON.stringify(a2));
  console.log('     任意→「' + a.text.replace(/<[^>]*>/g, '').slice(0, 30) + '…」／月1回→次の支給日を出す');
});

T('★⑦ 計算方式は変わっていない（1円も動かない）', () => {
  A.state.employees = [A.defEmp('山田 太郎')];
  A.state.employees[0].base = '300000';
  A.state.month = '2026-06';
  A.state.company.payCycle = 'monthly';
  const m = A.compute(A.state.employees[0]);
  A.state.company.payCycle = 'nweeks'; A.state.company.payCycleN = '2';
  const n = A.compute(A.state.employees[0]);
  /* ★空どうしを比べて緑にしない★＝先に「数が本当に在る」事を確かめる */
  const F = ['shikyuTotal', 'kojoTotal', 'net'];
  F.forEach((k) => {
    ok(Number.isFinite(m[k]) && m[k] !== 0, '★' + k + ' が 数で出ていない（' + m[k] + '）＝比べても意味が無い★');
  });
  F.forEach((k) => {
    ok(m[k] === n[k], '★支給サイクルを変えたら ' + k + ' が動いた★ 月1回=' + m[k] + ' 任意=' + n[k]);
  });
  console.log('     月1回 総支給' + m.shikyuTotal + '・控除' + m.kojoTotal + '・手取り' + m.net
    + ' ＝ 任意（2週ごと）と ★同じ★');
});

T('★⑧ ここまで JSの落ちが0', () => {
  ok(!errs.length, errs.join(' / '));
});

/* ═══ ★自己確認：わざと壊して 赤になるか★（この見張りが 空振りでない事） ═══ */
if (process.argv.includes('--self-test')) {
  console.log('\n[--self-test] ★わざと壊して 赤になるか★');
  T('★自① 選ぶ所から「任意」を消すと 見つけられる', () => {
    const sel = $('c-paycycle');
    const opt = [...sel.options].filter((o) => o.value === 'nweeks')[0];
    sel.removeChild(opt);
    ok([...sel.options].map((o) => o.value).indexOf('nweeks') < 0, '★消したのに 見つけられない＝空振り★');
    sel.appendChild(opt);                                   // ★戻す★
    ok([...sel.options].map((o) => o.value).indexOf('nweeks') >= 0, '戻せていない');
  });
  T('★自② N の欄を出しっぱなしにしても 選び直せば 引っ込む（仕掛けが効いている）', () => {
    const row = $('c-paycyclen-row');
    row.style.display = '';                                 // わざと出しっぱなしにする
    ok(row.style.display !== 'none', '★出しっぱなしを 作れていない＝空振り★');
    pick('c-paycycle', 'monthly');                          // 選び直すと
    ok(row.style.display === 'none', '★選び直しても 引っ込まない＝仕掛けが効いていない★');
  });
  T('★自③ 数を空にすると 聞く形が 答えを返さない（当てずっぽうを返さない）', () => {
    A.state.company.payCycle = 'nweeks';
    A.state.company.payCycleN = '2';
    ok(A.ASK_Q().filter((x) => x.key === 'payCycle')[0].answer(), '2週ごとで 答えが出ない');
    A.state.company.payCycleN = '';
    ok(A.ASK_Q().filter((x) => x.key === 'payCycle')[0].answer() === null,
      '★空でも 答えを返している＝当てずっぽう★');
  });
  T('★自④ 金額の突き合わせが 空どうしになっていない（数が本当に出ている）', () => {
    A.state.employees = [A.defEmp('山田 太郎')];
    A.state.employees[0].base = '300000';
    A.state.month = '2026-06';
    const r = A.compute(A.state.employees[0]);
    ok(Number.isFinite(r.shikyuTotal) && r.shikyuTotal > 0, '総支給が 数で出ていない（' + r.shikyuTotal + '）');
    ok(Number.isFinite(r.net) && r.net > 0, '手取りが 数で出ていない（' + r.net + '）');
    console.log('     総支給 ' + r.shikyuTotal + ' ／ 手取り ' + r.net + '（0や undefined ではない）');
  });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
