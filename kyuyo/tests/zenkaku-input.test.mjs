/* zenkaku-input.test.mjs — ★入力中に 数字以外を 消す 欄で 全角の 数字が 黙って 消えない★（㉓・2026-11-08）
 * =============================================================================
 * ★なぜ足したか★ 入力中に `値.replace(/[^0-9]/g,'')` で 数字以外を 消していたため、IME で 打つと 出る
 *   全角の「１２３」が 黙って 空/0 で 保存された（歩合額・賞与・割増の時間・支給日・郵便番号 等）。
 *   割増率・みなし時間は「137.5」が 1375 で 保存された（13.75倍）。lib の num は 全角の「．」を 寄せず「１２．５」が 0。
 * ここで見る物
 *   ① 門＝app.js・meisai.js・todokede-csv.js の `replace(/[^0-9` は 全部 全角を 寄せてから（寄せない 行 0本）
 *   ② 実際に 打つ＝支給日の並び「１０，２５」「１０、２５」→10,25・間隔「２」→2・支給日「２５」→25・半角は 前の まま
 *   ③ 割増率・みなし時間は 小数を 残す（「137.5」→137.5・「１３７．５」→137.5・点の 2つ目は 捨てる）・欄に data-dec が 5つ
 *   ④ lib の num は 全角の 点も 読む
 * 使い方: node kyuyo/tests/zenkaku-input.test.mjs
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
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };

console.log('\n[zenkaku-input] 数字以外を 消す 欄で 全角の 数字が 消えない');

T('① 門：数字以外を 消す 行は 全部 全角を 寄せてから（寄せない 行 0本）', () => {
  const dame = []; let mita = 0;
  for (const f of ['js/app.js', 'js/meisai.js', 'lib/todokede-csv.js']) {
    fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').forEach((line, i) => {
      const n = (line.match(/\.replace\(\/\[\^0-9/g) || []).length; if (!n) return;
      mita += n;
      if (!/hanSuji\(|0xFEE0/.test(line)) dame.push(f + ':' + (i + 1));
    });
  }
  ok(mita >= 30, '見た 数が 少ない（拾い方が 壊れた）: ' + mita);
  eq(dame.length, 0, '全角を 寄せずに 数字以外を 消す 行 ' + dame.join(' '));
});

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1].replace(/\?.*$/, ''))
  .filter((s) => !/^https?:/.test(s) && !/supabase|supa-config|auth/.test(s));
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''),
  { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
const win = dom.window, doc = win.document;
win.fetch = () => Promise.reject(new Error('no net'));
win.print = () => {};
for (const src of srcs) {
  const el = doc.createElement('script');
  el.textContent = fs.readFileSync(path.join(ROOT, src), 'utf8');
  doc.body.appendChild(el);
}
const A = win.__PAYSLIP_TEST;
ok(A, '__PAYSLIP_TEST 露出(init成功)');
const $ = (id) => doc.getElementById(id);
const typeIn = (el, v) => { el.value = v; el.dispatchEvent(new win.Event('input', { bubbles: true })); };

T('② 支給日の並び・間隔・支給日：全角でも 半角と 同じ 保存（半角は 前の まま）', () => {
  const c = A.state.company;
  for (const [ji, want] of [['１０，２５', '10,25'], ['１０、２５', '10,25'], ['10,25', '10,25']]) { typeIn($('c-paydays'), ji); eq(c.payDays, want, '支給日の並び ' + ji); }
  for (const [ji, want] of [['２', '2'], ['3', '3']]) { typeIn($('c-paycyclen'), ji); eq(c.payCycleN, want, '間隔 ' + ji); }
  for (const [ji, want] of [['２５', '25'], ['末', '末'], ['10', '10']]) { typeIn($('c-payday-day'), ji); eq(c.paydayDay, want, '支給日 ' + ji); }
});

T('③ 割増率・みなし時間は 小数を 残す（data-dec）・他の 欄は 整数（全角も 読む）', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  for (const k of ['rateOt', 'rateHoliday', 'rateNight', 'rateOver60', 'minashiH']) ok(src.indexOf('data-cf="' + k + '" data-dec inputmode="decimal"') >= 0, k + ' の 欄に data-dec が 無い');
  const host = $('rule-host'); ok(host, 'rule-host が 無い');
  const mk = (f, dec) => { const el = doc.createElement('input'); el.dataset.cf = f; if (dec) el.setAttribute('data-dec', ''); host.appendChild(el); return el; };
  const c = A.state.company;
  const r = mk('rateOt', true);
  for (const [ji, want] of [['137.5', '137.5'], ['１３７．５', '137.5'], ['125', '125'], ['１２５', '125'], ['1.2.5', '1.25'], ['１３７。５', '137.5'], ['137。5', '137.5']]) { typeIn(r, ji); eq(c.rateOt, want, '残業の 率 ' + ji); }
  const m = mk('minashiH', true); typeIn(m, '２２．５'); eq(c.minashiH, '22.5', 'みなし時間'); typeIn(m, '２２。５'); eq(c.minashiH, '22.5', 'みなし時間（句点）');
  const z = mk('zzTest', false); typeIn(z, '１２．５'); eq(c.zzTest, '125', 'data-dec の 無い 欄は 整数のまま（前と 同じ）');
  delete c.zzTest; c.rateOt = ''; c.minashiH = ''; r.remove(); m.remove(); z.remove();
});

T('④ lib の num：全角の 点も 読む（給与の 決まりの 額「１２．５」が 0 に ならない）', () => {
  const num = win.PayrollMonthly && win.PayrollMonthly.num;
  ok(typeof num === 'function', 'PayrollMonthly.num が 無い');
  eq(num('１２．５'), 12.5, '全角の 点'); eq(num('12.5'), 12.5, '半角の 点（前の まま）'); eq(num('２０，０００'), 20000, '全角の カンマ');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
