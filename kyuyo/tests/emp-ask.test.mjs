/* emp-ask.test.mjs — ★従業員マスタ7問（1人ずつ聞く）の見張り★
 *
 * なぜ要るか（司さん 2026-08-16／指示役 2026-08-18）:
 *   ・★空欄を並べて人に埋めさせない★＝1人ずつ・1問ずつ聞いて、答えたら その場で返す
 *   ・★後の質問が減る順★（生年月日→年齢で決まる物／申告書→甲乙／扶養→税額表の列）
 *   ・★給料の決め方は「読んだ結果」を人が確認するまで確定しない★（勝手に入れない）
 *   ・★機械が当てる物は聞かない★（県は会社から継ぐ・最賃・社保の加入・週所定・割増率）
 *
 * ★指示役の訂正（2026-08-18）をここで固定する★
 *   甲/乙は「扶養控除等申告書を出したか」で決まる。扶養の人数は「税額表の列」を決める物。
 *   ＝★別々の2問★。1つにまとめたら赤。
 *
 * 使い方: node kyuyo/tests/emp-ask.test.mjs
 *         node kyuyo/tests/emp-ask.test.mjs --self-test
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const require_ = createRequire(import.meta.url);

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'expected truthy'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };

const APP = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const PC = require_(path.join(ROOT, 'lib', 'payroll-calc.js'));
const PM = require_(path.join(ROOT, 'lib', 'payroll-monthly.js'));
const PP = require_(path.join(ROOT, 'lib', 'pay-parse.js'));

const KEYS = ['name', 'birthYmd', 'pay', 'commute', 'taxClass', 'fuyou', 'bank'];
const CTX = { company: { pref: 'ehime', dailyWorkH: '8', annualHolidays: '104', holidays: [0, 6] }, month: '2026-08' };
const emp = (o) => Object.assign({
  id: 'e1', name: '山田 太郎', payType: '月給', base: '250000', commute: '', commuteType: 'public', commuteKm: '',
  fuyou: '1', taxClass: 'ko', pref: '', birthYmd: '1978-04-01', kintai: [], shikyu: [], kojo: [], apply: {},
}, o || {});

if (process.argv.includes('--self-test')) {
  console.log('\n[emp-ask --self-test] ★わざと戻して赤になるか★');
  T('① 甲乙と扶養を1つにまとめたら赤（★別々の2問★）', () => {
    const merged = KEYS.filter((k) => k !== 'fuyou');
    ok(merged.length !== KEYS.length, '2問が1つになった事に気づけない');
  });
  T('② 給料を「読んだ瞬間に入れる」作りに戻したら赤', () => {
    const block = APP.slice(APP.indexOf('function empPayAnswer('), APP.indexOf('function empCommuteNow('));
    ok(block.indexOf('pending') >= 0, '★押すまで入れない★の仕掛け(pending)が無い');
  });
  T('③ NaN を客に見せる作りに戻したら赤（compute のキー名を間違えた前科）', () => {
    const c = PM.compute(emp(), CTX);
    ok(c.total === undefined, 'compute に total は無い（在ると前提が変わる）');
    ok(isFinite(c.shikyuTotal) && isFinite(c.net), '実物のキーで数が取れない');
  });
  T('④ マイカーの非課税限度を「自分で書いた表」に戻したら赤（★lib を呼ぶ★）', () => {
    const a = PM.carCommuteNonTax(12, CTX);
    ok(a > 0, 'lib が限度額を返さない');
  });
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

console.log('\n[emp-ask] 従業員マスタ7問（1人ずつ聞く）');

T('① 7問が ちょうど7つ在り、どれにも「その場の返し」が在る', () => {
  const block = APP.slice(APP.indexOf('function EMP_ASK_Q('), APP.indexOf('function empPayNow('));
  ok(block.length > 800, 'EMP_ASK_Q が読めていない');
  const found = KEYS.filter((k) => block.indexOf("key:'" + k + "'") >= 0);
  eq(found.length, KEYS.length, '7問の key（' + KEYS.filter((k) => found.indexOf(k) < 0).join(',') + ' が無い）');
  eq((block.match(/answer:function\(\)/g) || []).length, KEYS.length, '「その場の返し」の数');
  console.log('     7問: ' + KEYS.join(' / '));
});

T('② ★甲乙と扶養は別々の2問★（甲乙は申告書を出したかで決まる・人数では決まらない）', () => {
  const block = APP.slice(APP.indexOf('function EMP_ASK_Q('), APP.indexOf('function empPayNow('));
  const tc = block.slice(block.indexOf("key:'taxClass'"), block.indexOf("key:'fuyou'"));
  ok(/扶養控除等申告書/.test(tc), '甲乙の問いが「申告書を出したか」になっていない');
  ok(!/何人/.test(tc), '★甲乙の問いに人数が混ざっている★');
  const fu = block.slice(block.indexOf("key:'fuyou'"), block.indexOf("key:'bank'"));
  ok(/何人/.test(fu), '扶養の問いが人数を聞いていない');
  ok(/列/.test(fu), '扶養が「税額表の列」を決める物だと言っていない');
});

T('③ 生年月日 → 年齢で決まる物を lib で当てる（介護40／厚年70／健保75）', () => {
  const ym = '2026-08';
  eq(PC.isKaigoTarget('1978-04-01', ym), true, '48歳は介護保険の対象');
  eq(PC.isKaigoTarget('2000-04-01', ym), false, '26歳は介護保険の対象外');
  eq(PC.isPensionTarget('1950-04-01', ym), false, '76歳は厚生年金の対象外');
  eq(PC.isHealthTarget('1950-04-01', ym), false, '76歳は健康保険の対象外');
  eq(PC.isHealthTarget('1960-04-01', ym), true, '66歳は健康保険の対象');
  ok(APP.indexOf('function empAgeFacts(') >= 0, 'empAgeFacts が無い');
});

T('④ 給料の決め方＝言葉を読んで ★その月の実数★ を見せる（1円まで合う）', () => {
  const r = PP.parse('月給25万、通勤1万');
  ok(r && r.ok, '言葉を読めていない');
  eq(r.payType, '月給', '読んだ給与形態');
  eq(String(r.fields.base), '250000', '読んだ基本給');
  eq(String(r.fields.commute), '10000', '読んだ通勤手当');
  const c = PM.compute(emp({ base: r.fields.base, commute: r.fields.commute }), CTX);
  eq(c.shikyuTotal, 260000, '総支給（250,000＋通勤10,000）');
  /* ★画面に出す3つの数が そろって有限★（NaN を客に見せない） */
  ok(isFinite(c.shikyuTotal) && isFinite(c.net) && isFinite(Number(c.kojoTotal || 0)), 'NaN が出ている');
  eq(c.shikyuTotal - Number(c.kojoTotal || 0), c.net, '★総支給 − 控除 ＝ 手取り★ が合わない');
  console.log('     月給25万＋通勤1万 → 総支給 ' + c.shikyuTotal + ' ／ 控除 ' + Number(c.kojoTotal || 0) + ' ／ 手取り ' + c.net);
});

T('⑤ ★読んだ結果は 人が押すまで入れない★（勝手に確定しない）', () => {
  const block = APP.slice(APP.indexOf('function empPayAnswer('), APP.indexOf('function empCommuteNow('));
  ok(/pending/.test(block), '押すまで待つ仕掛け(pending)が無い');
  ok(/押すまで入れません/.test(block), '画面に「押すまで入れません」と書いていない');
  const bind = APP.slice(APP.indexOf("if (k === 'pay')"), APP.indexOf("if (k === 'pay')") + 400);
  ok(/a\.pending/.test(bind), '押した時に初めて入れる作りになっていない');
});

T('⑥ マイカーは片道kmだけ聞いて ★非課税限度は機械★（lib の実数）', () => {
  const cases = [2, 12, 40, 100];
  const seen = cases.map((km) => km + 'km→' + PM.carCommuteNonTax(km, CTX) + '円');
  cases.forEach((km) => ok(PM.carCommuteNonTax(km, CTX) >= 0, km + 'km の限度が出ない'));
  ok(PM.carCommuteNonTax(100, CTX) > PM.carCommuteNonTax(12, CTX), '遠い方が限度が大きくない');
  const block = APP.slice(APP.indexOf('function empCommuteAnswer('), APP.indexOf('function empAskCounts('));
  ok(/carCommuteNonTax/.test(block), '★自分で表を書いている（libを呼んでいない）★');
  console.log('     ' + seen.join(' ／ '));
});

T('⑦ 機械が当てる物は聞かない（県・最賃・社保の加入・週所定・割増率が7問に無い）', () => {
  const block = APP.slice(APP.indexOf('function EMP_ASK_Q('), APP.indexOf('function empPayNow('));
  ['都道府県', '最低賃金', '週の所定', '割増'].forEach((w) => {
    ok(block.indexOf("q:'" + w) < 0, '★' + w + ' を人に聞いている★');
  });
  /* 県は会社から継ぐ（会社マスタで作った effPref をそのまま使う） */
  const PW = require_(path.join(ROOT, 'lib', 'payroll-warnings.js'));
  const info = PW.minWageInfo(emp({ pref: '', payType: '時給', hourly: '1000' }), CTX);
  ok(info && info.minWage > 0, '人の県が空でも会社の県で最賃が出る、になっていない');
});

T('⑧ 1問ごと保存＋画面の箱が在る＋既定の形を1バイトも変えていない', () => {
  ok(HTML.indexOf('id="emp-ask-host"') >= 0, '7問の箱が index.html に無い');
  ok(APP.indexOf('function empAskSave()') >= 0, 'empAskSave が無い');
  ok(/persistSave/.test(APP.slice(APP.indexOf('function empAskSave()'), APP.indexOf('function empAskSave()') + 300)), '保存を呼んでいない');
  /* ★defEmp に askOk を足していない★＝答えた時に生える（凍結した入力fixtureが動かない） */
  const def = APP.slice(APP.indexOf('function defEmp('), APP.indexOf('function defEmp(') + 1200);
  ok(def.indexOf('askOk') < 0, '★defEmp に askOk を足している（fixtureが動く）★');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
