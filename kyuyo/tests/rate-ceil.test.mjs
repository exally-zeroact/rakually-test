/* rate-ceil.test.mjs — ★割増率・みなし時間が 高すぎる（桁が1つ多い恐れ）の 警告★（㉖・2026-11-09）
 * ★なぜ★ ㉓の前は 欄が 点を 消したので「137.5」→1375%・「22.5」時間→225時間 で 保存された 会社が 残る＝黙って 多く/少なく 払う。
 *   警告は 設定画面だけだと 届かない（設定を 開かない）＝毎月の 割増の 欄・集計の 要確認・ops にも 出す。保存・計算は 止めない。
 *   ①lib の 線（300%/上乗せ200%/みなし45h）②毎月の 欄と 要確認に 出る ③ops の code ④画面の 3か所に 差してある
 * 使い方: node kyuyo/tests/rate-ceil.test.mjs
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

console.log('\n[rate-ceil] 割増率・みなし時間が 高すぎる（桁が1つ多い）時に 黄の 警告');


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


const W = win.Warimashi, PW = win.PayrollWarnings;
ok(W && W.aboveSaneRates, 'Warimashi.aboveSaneRates が 無い'); ok(PW && PW.ceilWarn, 'PayrollWarnings.ceilWarn が 無い');
const keys = (r) => W.aboveSaneRates(r).map((x) => x.key).join(',');
T('① lib の 線：10倍は 拾う・正しい 値は 拾わない', () => {
  eq(keys({ ot: 13.75, holiday: 13.5, night: 2.5, over60Add: 2.5 }), 'ot,holiday,night,over60Add', '10倍');
  eq(keys({ ot: 12.5 }), 'ot'); eq(keys({ over60Add: 5 }), 'over60Add'); eq(keys({ night: 3.5 }), 'night');
  eq(keys({ ot: 1.25, holiday: 1.35, night: 0.25, over60Add: 0.25 }), '', '法定どおり');
  eq(keys({ ot: 1.5, holiday: 2, night: 0.5, over60Add: 0.5 }), '', '上げた 会社');
  eq(keys({ ot: 3, holiday: 3, night: 2, over60Add: 2 }), '', 'ちょうど 線');
  eq(keys({}), '', '空');
});
const ctx = (co) => ({ company: co, month: A.state.month });
const emp = (x) => Object.assign({ id: 'e1', name: 'テスト', payType: '月給', base: 300000 }, x || {});
T('② 毎月の 欄と 要確認（empWarnings）に 出る・正しい 値では 出ない', () => {
  ok(/1375%/.test(PW.ceilWarn(emp(), ctx({ rateOt: '1375' }))), '1375% が 欄に 出ない');
  ok(PW.empWarnings(emp(), ctx({ rateOt: '1375' })).some((t) => /^割増の率が高すぎ/.test(t)), '要確認に 出ない');
  ok(/225時間/.test(PW.ceilWarn(emp({ minashiH: '225' }), ctx({}))), 'みなし 225 が 出ない');
  ok(/75時間/.test(PW.ceilWarn(emp(), ctx({ minashiH: '75' }))), '会社の みなし 75 が 出ない');
  for (const [co, e, m] of [[{ rateOt: '137.5' }, emp(), '137.5%'], [{ rateOt: '125', rateHoliday: '135', rateNight: '25', rateOver60: '25' }, emp(), '法定'],
    [{}, emp({ minashiH: '45' }), 'みなし45'], [{}, emp({ minashiH: '22.5' }), 'みなし22.5'], [{ rateOt: '1375', minashiH: '225' }, emp({ payType: '役員' }), '役員']])
    eq(PW.ceilWarn(e, ctx(co)), '', m + ' で 出た');
});
T('③ ops：会社は RATE_TOO_HIGH_*・人は MINASHI_TOO_HIGH（休業の code に 化けない）', () => {
  const cc = PW.collectCompany(ctx({ rateOt: '1375', rateNight: '250' })).map((x) => x.code);
  ok(cc.includes('RATE_TOO_HIGH_OT') && cc.includes('RATE_TOO_HIGH_NIGHT'), 'collectCompany: ' + cc.join(','));
  const e = emp({ minashiH: '225' }); try { win.PayrollMonthly.compute(e, ctx({})); } catch (_) {}
  const ec = PW.collect(e, ctx({ rateOt: '1375' })).map((x) => x.code);
  ok(ec.includes('MINASHI_TOO_HIGH'), 'collect: ' + ec.join(','));
  ok(!ec.some((c) => /^KYUGYO_/.test(c)), '休業の code に 化けた: ' + ec.join(','));
  ok(!ec.some((c) => /^RATE_TOO_HIGH/.test(c)), '率は 会社の 方だけ（人ごとに 重ねない）: ' + ec.join(','));
});
T('④ 画面の 3か所（設定の 割増の率・かんたん/詳細の 割増）に 差してある', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  const cnt = (s) => src.split(s).length - 1;
  eq(cnt('rateFloorWarn(c)+rateCeilWarn(c)'), 1, '設定画面');
  eq(cnt("+ceilWarn(e)+'<div class=\"wi-limitw\">'"), 2, '毎月の 割増の 欄');
});
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
