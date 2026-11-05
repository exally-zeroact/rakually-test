/* shiharaibi-zeihyo.test.mjs — ★所得税の税額表は 支払日の 年で 選ぶ★（2026-11-04 R9 押し3）
 *
 * 法令：源泉徴収税額表（令和9年分）は 令和9年1月1日 以後に「支払うべき」給与に 当たる。
 *   出典 国税庁 令和8年度改正 Q&A Q1-1／https://www.nta.go.jp/publication/pamph/gensen/zeigakuhyo2027/01.htm
 * 前は 対象月の 年で 選んでいた＝12月分を 翌月(1月)払いする 会社に 古い年の 表が 当たった。
 *
 * 期待値は 自分の 出力から 作らない：その年の 表（lib の calcByClass に 年を 直に 渡した 値）と 比べ、
 * しかも ★その課税額で 古い年と 新しい年の 額が 違う★ 事を 先に 確かめる（同じ額なら 試験が 空振りする）。
 */
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const op = require(path.join(ROOT, 'ops/payroll.monthly.js'));
const PM = require(path.join(ROOT, 'lib/payroll-monthly.js'));
const D = require(path.join(ROOT, 'lib/shotokuzei-densan.js'));
const HEI = require(path.join(ROOT, 'lib/shotokuzei-hei.js'));
const NICHI = require(path.join(ROOT, 'lib/shotokuzei-nichi.js'));
const DP = require(path.join(ROOT, 'lib/daily-pay.js'));
const KOYO_ = require(path.join(ROOT, 'lib/koyo-hoken.js'));

let pass = 0, fail = 0;
function T(n, fn) { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } }
function eq(a, b, m) { if (a !== b) throw new Error((m ? m + ': ' : '') + `expected ${b} got ${a}`); }
function ne(a, b, m) { if (a === b) throw new Error((m ? m + ': ' : '') + `${a} と ${b} が同じ＝試験が空振り`); }

const CO = (o) => Object.assign({ name: 'S', annualHolidays: '120', dailyWorkH: '8', dailyWorkM: '0', gyoshu: 'ippan', holidays: [0], ruleOn: {}, paydayDay: '25' }, o);
const EMP = { id: 'b01', name: 'B', payType: '月給', base: '300000', fuyou: '0', pref: 'tokyo', birthYmd: '1985-04-10' };
const one = (ym, co, emp) => op.engine({ month: ym, company: CO(co), employees: [emp || EMP] }).value.people[0];
const hyou = (kazei, y) => D.calcByClass(kazei, 0, 'ko', { year: y });

console.log('\n[shiharaibi-zeihyo] 所得税の表は 支払日の 年で 選ぶ');

T('2026-12 分・翌月払い（2027-01-25 払い）＝令和9年分の表', () => {
  const p = one('2026-12', { paydayRel: 'next' });
  ne(hyou(p.kazei, 2026), hyou(p.kazei, 2027), 'R8/R9');
  eq(p.incomeTax, hyou(p.kazei, 2027), '所得税');
});
T('2026-12 分・当月払い（2026-12-25 払い）＝令和8年分の表', () => {
  const p = one('2026-12', { paydayRel: 'current' });
  ne(hyou(p.kazei, 2026), hyou(p.kazei, 2027), 'R8/R9');
  eq(p.incomeTax, hyou(p.kazei, 2026), '所得税');
});
T('2026-11 分・翌月払い（2026-12-25 払い）＝令和8年分の表', () => {
  const p = one('2026-11', { paydayRel: 'next' });
  eq(p.incomeTax, hyou(p.kazei, 2026), '所得税');
});
T('2027-01 分・当月払い＝令和9年分の表', () => {
  const p = one('2027-01', { paydayRel: 'current' });
  ne(hyou(p.kazei, 2026), hyou(p.kazei, 2027), 'R8/R9');
  eq(p.incomeTax, hyou(p.kazei, 2027), '所得税');
});
T('2025-12 分・翌月払い（2026-01 払い）＝令和8年分の表（R8 表も 支払日で当たる）', () => {
  const p = one('2025-12', { paydayRel: 'next' });
  ne(hyou(p.kazei, 2025), hyou(p.kazei, 2026), 'R7/R8');
  eq(p.incomeTax, hyou(p.kazei, 2026), '所得税');
});
T('支給日の欄が無い会社（既定＝翌月）でも 2026-12 分は令和9年分', () => {
  const p = one('2026-12', {});
  eq(p.incomeTax, hyou(p.kazei, 2027), '所得税');
});
// ★taiketsu 止め1★ 日払い・週払いは 月次の 支払日が 無い＝対象月の 年の まま
T('日払いの会社の 2026-12 月次＝令和8年分（翌月払いの欄が在っても）', () => {
  const p = one('2026-12', { paydayRel: 'next', payCycle: 'daily' });
  ne(hyou(p.kazei, 2026), hyou(p.kazei, 2027), 'R8/R9');
  eq(p.incomeTax, hyou(p.kazei, 2026), '所得税');
});
T('週払いの会社の 2026-12 月次＝令和8年分', () => {
  const p = one('2026-12', { payCycle: 'weekly' });
  eq(p.incomeTax, hyou(p.kazei, 2026), '所得税');
});
T('社保は 対象月で 選ぶ（翌月払いでも 当月払いと 同じ）', () => {
  const a = one('2026-12', { paydayRel: 'next' }), b = one('2026-12', { paydayRel: 'current' });
  eq(a.si.total, b.si.total, '社保の合計');
});
T('丙欄（日給）も 支払日の 年', () => {
  const emp = { id: 'h01', name: 'H', payType: '日給', base: '10000', fuyou: '0', pref: 'tokyo', birthYmd: '1985-04-10', taxClass: 'hei',
    kintai: [{ label: '出勤日数', value: 3 }] };
  ne(HEI.heiTax(10000, { year: 2026 }), HEI.heiTax(10000, { year: 2027 }), '丙 R8/R9');
  const a = one('2026-12', { paydayRel: 'next' }, emp), b = one('2026-12', { paydayRel: 'current' }, emp);
  eq(a.incomeTax, HEI.heiTax(10000, { year: 2027 }) * 3, '翌月払い');
  eq(b.incomeTax, HEI.heiTax(10000, { year: 2026 }) * 3, '当月払い');
});
T('taxYearOf：契約の支給日の年（振込日を休みで前に寄せても 年は動かない）', () => {
  eq(PM.taxYearOf({ month: '2026-12', company: { paydayRel: 'next', paydayDay: '1' } }), 2027, '翌月1日払い');
  eq(PM.taxYearOf({ month: '2026-12', company: { paydayRel: 'next', paydayDay: '末' } }), 2027, '翌月末払い');
  eq(PM.taxYearOf({ month: '', company: {} }), 2026, '対象月が空');
});
// 日払い・週払いの 日別の紙＝その日の ymd を dayTaxFn へ 渡す（app.js buildDailyData が 日ごとの 年を 選ぶ）
T('daily-pay：dayTaxFn に その日の ymd が 渡る', () => {
  const seen = [];
  DP.computeDaily([{ ymd: '2026-12-31', min: 480, amount: 12000 }, { ymd: '2027-01-01', min: 480, amount: 12000 }],
    { taxClass: 'ko', dayTaxFn: function (t, ymd) { seen.push(ymd); return 0; } });
  eq(seen.join(','), '2026-12-31,2027-01-01', '渡った日');
});
T('日額表 甲：12,000円は R8 と R9 で額が違う（日別の年が効く 前提）', () => {
  ne(NICHI.nichiTax(12000, { taxClass: 'ko', deps: 0, year: 2026 }), NICHI.nichiTax(12000, { taxClass: 'ko', deps: 0, year: 2027 }), '日額 R8/R9');
});
// ★日別の 紙の 年（app.js buildDailyData は dp.taxYearForDay を呼ぶだけ）＝額で 見る★
const nichiKo = (t, y) => NICHI.nichiTax(t, { taxClass: 'ko', deps: 0, year: y });
const dayTax = (entries, cycle, fy) => DP.computeDaily(entries, { taxClass: 'ko',
  dayTaxFn: (t, ymd) => nichiKo(t, DP.taxYearForDay(ymd, { cycle, entries, fallbackYear: fy })) }).days.map((d) => d.tax).join(',');
const TOSHI = [{ ymd: '2026-12-31', min: 480, amount: 12000 }, { ymd: '2027-01-01', min: 480, amount: 12000 }];
T('日払い：12-31 は令和8・01-01 は令和9 の日額表', () => {
  eq(dayTax(TOSHI, 'daily', 2026), [nichiKo(12000, 2026), nichiKo(12000, 2027)].join(','), '日ごとの税');
});
T('週払い：年をまたぐ週は 一番遅い日（01-01＝令和9）で 全部の日', () => {
  eq(dayTax(TOSHI, 'weekly', 2026), [nichiKo(12000, 2027), nichiKo(12000, 2027)].join(','), '日ごとの税');
});
// ★週払いの紙 1枚＝1回の払い（今週支給額・手取り 1つ）＝1枚の中で 年を 混ぜない（taiketsu 11-04 4回目）★
T('週払い：年末に 毎日働いた 1枚（12-28〜01-02）＝1回の払い＝全部の日が令和9（混ぜない）', () => {
  const ds = ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'];
  const e = ds.map((ymd) => ({ ymd, min: 480, amount: 12000 }));
  const r9 = nichiKo(12000, 2027);
  eq(dayTax(e, 'weekly', 2026), ds.map(() => r9).join(','), '日ごとの税');
});
T('週払い：12-24 と 01-02 の 1枚＝払いは 01-02 の後＝両方とも令和9（日の近くで 週を推さない）', () => {
  const e = [{ ymd: '2026-12-24', min: 480, amount: 12000 }, { ymd: '2027-01-02', min: 480, amount: 12000 }];
  eq(dayTax(e, 'weekly', 2026), [nichiKo(12000, 2027), nichiKo(12000, 2027)].join(','), '日ごとの税');
});
T('週払い：12月の紙に 12-30 だけ＝令和8（1月の日が無い＝対象月の年）', () => {
  eq(dayTax([{ ymd: '2026-12-30', min: 480, amount: 12000 }], 'weekly', 2026), String(nichiKo(12000, 2026)), '日の税');
});
T('週払い：1月の紙に 12-25〜12-31 だけ（12-31 締め→1月払い）＝令和9（対象月の年が下限）', () => {
  const ds = ['2026-12-25', '2026-12-26', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31'];
  const e = ds.map((ymd) => ({ ymd, min: 480, amount: 12000 }));
  eq(dayTax(e, 'weekly', 2027), ds.map(() => nichiKo(12000, 2027)).join(','), '日ごとの税');
  // 同じ紙の 月次（週払いの会社＝対象月の年）とも 同じ年
  eq(PM.taxYearOf({ month: '2027-01', company: { payCycle: 'weekly' } }), 2027, '月次の年');
});
T('週払い：12月だけの 1枚は 令和8（前の年の日が在っても 動かない）', () => {
  const e = [{ ymd: '2026-12-21', min: 480, amount: 12000 }, { ymd: '2026-12-25', min: 480, amount: 12000 }];
  eq(dayTax(e, 'weekly', 2026), [nichiKo(12000, 2026), nichiKo(12000, 2026)].join(','), '日ごとの税');
});
T('週払い：日付の打ち間違い（2062）1つで 表を動かさない', () => {
  const e = [{ ymd: '2026-12-07', min: 480, amount: 12000 }, { ymd: '2062-12-08', min: 480, amount: 12000 }];
  eq(dayTax(e, 'weekly', 2026), [nichiKo(12000, 2026), nichiKo(12000, 2026)].join(','), '日ごとの税');
});
T('日払い：日付が空・打ち間違いなら 対象月の年／1月の紙の 12-31 は その日の年', () => {
  eq(DP.taxYearForDay('', { cycle: 'daily', fallbackYear: 2026 }), 2026, '空');
  eq(DP.taxYearForDay('2062-01-01', { cycle: 'daily', fallbackYear: 2026 }), 2026, '2062');
  eq(DP.taxYearForDay('2026-12-31', { cycle: 'daily', fallbackYear: 2027 }), 2026, '1月の紙の 12-31');
});
T('app.js の日別の税は 3つとも dp.taxYearForDay を通る（字の見張り・額は上の4件）', () => {
  const s = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  eq((s.match(/year:yearOfDay\(ymd\)/g) || []).length, 3, '丙・乙・甲の3つ');
  if (!/function yearOfDay\(ymd\)\{ return dp\.taxYearForDay\(ymd,/.test(s)) throw new Error('yearOfDay が lib を呼んでいない');
});
// ★古い表の警告＝出る／出ない で 見る★ 社保・最賃の 古さを 外して 所得税の 年だけで 判じる
T('警告：2027-12 分 翌月払い（2028 払い＝未収録）は出る・当月払い（2027＝収録済み）は出ない', () => {
  const SHH = require(path.join(ROOT, 'lib/shakaihoken-hyo.js'));
  const SAI = require(path.join(ROOT, 'lib/saitei-chingin.js'));
  const PW = require(path.join(ROOT, 'lib/payroll-warnings.js'));
  const keep = { k: SHH.getKenko, g: SHH.getKaigo, s: SAI.saiteiStale, e: KOYO_.employStale };
  try {
    SHH.getKenko = function () { return Object.assign({}, keep.k.apply(this, arguments), { stale: false }); };
    SHH.getKaigo = function () { return Object.assign({}, keep.g.apply(this, arguments), { stale: false }); };
    KOYO_.employStale = function () { return false; }; // 雇用保険（11-06 候補⑥）も 古くない 事に＝ここは 所得税の 字だけを 見る
    SAI.saiteiStale = function () { return false; };
    const next = PW.statutoryStaleWarn({ month: '2027-12', company: { paydayRel: 'next', paydayDay: '25' } });
    const cur = PW.statutoryStaleWarn({ month: '2027-12', company: { paydayRel: 'current', paydayDay: '25' } });
    if (!/所得税額表/.test(next)) throw new Error('翌月払いで 警告が 出ない');
    eq(cur, '', '当月払い');
  } finally { SHH.getKenko = keep.k; SHH.getKaigo = keep.g; SAI.saiteiStale = keep.s; KOYO_.employStale = keep.e; }
});

// ★丙欄の 字の 年（社員の 画面）＝支払日の 年★ app.js の heiNenOf を 取り出して 本物の taxYearOf で 回す
T('丙欄の字：2026-12 分 翌月払い＝令和9年分・当月払い＝令和8年分・読めない時は 対象月の年', () => {
  const s = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  const m = s.match(/  function heiNenOf\(\)\{[^\n]*\n/);
  if (!m) throw new Error('heiNenOf が無い');
  if (s.includes('日額表 丙欄（令和8年分）')) throw new Error('令和8年分 の 決め打ちが 残っている');
  if (!s.includes("日額表 丙欄（令和'+heiNenOf()+'年分）")) throw new Error('丙欄の 字が heiNenOf を 使っていない');
  const PMo = require(path.join(ROOT, 'lib/payroll-monthly.js'));
  const HEIo = require(path.join(ROOT, 'lib/shotokuzei-hei.js'));
  const mk = (pm, month, company, hei = HEIo) => new Function('PM', 'HEI', 'state', 'ctxOf', m[0] + 'return heiNenOf();')(
    () => pm, () => hei, { month }, () => ({ month, company }));
  eq(mk(PMo, '2026-12', { paydayRel: 'next', paydayDay: '25' }), 9, '翌月払い');
  eq(mk(PMo, '2026-12', { paydayRel: 'current', paydayDay: '25' }), 8, '当月払い');
  eq(mk(null, '2027-03', {}), 9, 'PM が 読めない＝対象月の年');
  // 収録の無い年＝実際に 使う 表の 年（tableFor と 同じ）。字の年と 表が 同じ物かを 本物の 表で 見る
  const nen = (month, company) => mk(PMo, month, company);
  for (const [month, company] of [['2027-12', { paydayRel: 'next' }], ['2028-03', {}], ['2025-06', { paydayRel: 'current' }], ['2026-12', { paydayRel: 'next' }]]) {
    const y = PMo.taxYearOf({ month, company });
    if (HEIo.tableFor(nen(month, company) + 2018) !== HEIo.tableFor(y)) throw new Error(month + ' 字の年の表と 使う表が 違う');
  }
  eq(nen('2027-12', { paydayRel: 'next' }), 9, '2028 払い＝未収録＝令和9 の表を 使う');
  eq(nen('2025-06', { paydayRel: 'current' }), 8, '2025＝収録より前＝令和8 の表を 使う');
  eq(mk(PMo, '2026-12', { paydayRel: 'next' }, null), 9, '丙の lib が 読めない時は 支払日の年');
  // 同じ 画面の 💡（taxclass）も 対象月で なく 支払日の 年と 書く
  const help = (s.match(/taxclass:\{[^\n]*/) || [''])[0];
  if (!/支払日の年/.test(help) || /対象月から自動/.test(help)) throw new Error('💡 taxclass が 支払日の年 に なっていない');
});

/* ★日払い・週払いの 紙は 日ごとの 年で 表を 選ぶ＝黄警告も その日の 年で 見る★（2026-11-04 候補③）
   前は statutoryStaleWarn が daily/weekly で 対象月の 年だけ を 見た＝2027-12 の 紙に 2028-01 の 日が 入ると
   表は 黙って 令和9（tableFor の 最新）・警告なし。上の 試験と 同じく 社保・最賃の 古さを 外して 所得税の 年だけで 判じる。 */
T('警告：日払い/週払い 2027-12 の 紙に 2028-01 の 日（未収録）は出る・同じ年の日だけ／±1外／月次は出ない', () => {
  const SHH = require(path.join(ROOT, 'lib/shakaihoken-hyo.js'));
  const SAI = require(path.join(ROOT, 'lib/saitei-chingin.js'));
  const PW = require(path.join(ROOT, 'lib/payroll-warnings.js'));
  const zl = Math.max(...Object.keys(D.PARAMS).filter(k => /^\d{4}$/.test(k)).map(Number));
  eq(zl, 2027, '前提：所得税の 収録の 最新＝2027（変わったら 年を 直す）');
  eq(DP.taxYearForDay('2028-01-04', { cycle: 'daily', fallbackYear: 2027 }), 2028, '前提：日払いの 表の 年');
  eq(DP.taxYearForDay('2027-12-28', { cycle: 'weekly', entries: [{ ymd: '2027-12-28' }, { ymd: '2028-01-04' }], fallbackYear: 2027 }), 2028, '前提：週払いの 表の 年');
  const keep = { k: SHH.getKenko, g: SHH.getKaigo, s: SAI.saiteiStale, e: KOYO_.employStale };
  try {
    SHH.getKenko = function () { return Object.assign({}, keep.k.apply(this, arguments), { stale: false }); };
    SHH.getKaigo = function () { return Object.assign({}, keep.g.apply(this, arguments), { stale: false }); };
    KOYO_.employStale = function () { return false; }; // 雇用保険（11-06 候補⑥）も 古くない 事に＝ここは 所得税の 字だけを 見る
    SAI.saiteiStale = function () { return false; };
    // 日の 年は 呼ぶ側（app.js staleCtx）が lib daily-pay maxTaxYearOf（taxYearForDay を 紙ごとに）で 回して 渡す＝ここでは その 決まりで 作る（年を 打ち込まない）
    const dty = (cycle, ymds) => DP.maxTaxYearOf([ymds.map((ymd) => ({ ymd }))], { cycle, fallbackYear: 2027 });
    const w = (company, ymds) => PW.statutoryStaleWarn(ymds ? { month: '2027-12', company, dayTaxYear: dty(company.payCycle, ymds) } : { month: '2027-12', company });
    eq(w({ payCycle: 'daily' }), '', '前提：日の 年を 渡さなければ 出ない（前と 同じ）');
    if (!/所得税額表/.test(w({ payCycle: 'daily' }, ['2027-12-28', '2028-01-04']))) throw new Error('日払い：2028-01 の 日が 有るのに 出ない');
    if (!/所得税額表/.test(w({ payCycle: 'weekly' }, ['2027-12-28', '2028-01-04']))) throw new Error('週払い：2028-01 の 日が 有るのに 出ない');
    eq(w({ payCycle: 'daily' }, ['2027-12-28', '', null]), '', '同じ年の 日と 空の 日だけ');
    eq(w({ payCycle: 'daily' }, ['2062-01-01']), '', '対象月の 年±1 の 外＝打ち間違い＝表も 動かない');
    eq(w({ payCycle: 'monthly', paydayRel: 'current', paydayDay: '25' }, ['2028-01-04']), '', '月次は 日の 年を 見ない（月次の 年は taxYearOf）');
    eq(DP.maxTaxYearOf([[{ ymd: '2028-01-04' }]], { cycle: 'monthly', fallbackYear: 2027 }), 0, '月次の 会社は 日の 年を 0');
    eq(DP.maxTaxYearOf([[{ ymd: '2027-12-27' }], [{ ymd: '2027-12-28' }, { ymd: '2028-01-04' }]], { cycle: 'daily', fallbackYear: 2027 }), 2028, '人を またいで 最大');
    eq(PW.statutoryStaleWarn({ month: '2027-12', company: { payCycle: 'daily' }, dayTaxYear: 2027 }), '', '収録の 内の 年＝出ない');
  } finally { SHH.getKenko = keep.k; SHH.getKaigo = keep.g; SAI.saiteiStale = keep.s; KOYO_.employStale = keep.e; }
});

/* ★古い表の 警告の 字＝何が・どの年で 古いかを 正しく 言う★（2026-11-04 候補④）
   前は 1種類「対象月（YYYY-MM）の 社会保険料率・所得税額表 は未収録の年度です」＝
   ・2027-12 分 翌月払い（所得税は 2028 の表）でも「対象月 2027-12」と 書き、収録済みの 社保まで 古いと 言った
   ・社保だけ 古い 月（2027-06・所得税 2027 は 収録済み）でも「所得税額表」と 言った
   社保・最賃は 対象月で、所得税は 支払日の 年（日払い/週払いは 日の 年）で 選ぶ＝字も 分ける。
   「は未収録の年度です」は 残す（ops-golden-parity が この字で STATUTORY_STALE を 拾う）。 */
T('警告の字：所得税だけ古い＝所得税額表の 年分と 基準を 書き、対象月・社保とは 言わない／社保だけ古い＝所得税額表と 言わない', () => {
  const SHH = require(path.join(ROOT, 'lib/shakaihoken-hyo.js'));
  const SAI = require(path.join(ROOT, 'lib/saitei-chingin.js'));
  const PW = require(path.join(ROOT, 'lib/payroll-warnings.js'));
  const zl = Math.max(...Object.keys(D.PARAMS).filter(k => /^\d{4}$/.test(k)).map(Number));
  eq(zl, 2027, '前提：所得税の 収録の 最新＝2027（変わったら 年を 直す）');
  const txt = (h) => String(h || '').replace(/<[^>]+>/g, '');
  const keep = { k: SHH.getKenko, g: SHH.getKaigo, s: SAI.saiteiStale, e: KOYO_.employStale };
  try {
    SHH.getKenko = function () { return Object.assign({}, keep.k.apply(this, arguments), { stale: false }); };
    SHH.getKaigo = function () { return Object.assign({}, keep.g.apply(this, arguments), { stale: false }); };
    KOYO_.employStale = function () { return false; }; // 雇用保険（11-06 候補⑥）も 古くない 事に＝ここは 所得税の 字だけを 見る
    SAI.saiteiStale = function () { return false; };
    const tsugi = txt(PW.statutoryStaleWarn({ month: '2027-12', company: { paydayRel: 'next', paydayDay: '25' } }));
    if (!/所得税額表の 2028年分（支払日の年）/.test(tsugi)) throw new Error('月次 翌月払い：「所得税額表の 2028年分（支払日の年）」が無い＝' + tsugi);
    if (/対象月|社会保険料率/.test(tsugi)) throw new Error('月次 翌月払い：古くない 対象月・社保を 言っている＝' + tsugi);
    if (!/は未収録の年度です/.test(tsugi)) throw new Error('「は未収録の年度です」が 消えた（golden の コード拾いが 割れる）');
    const hi = txt(PW.statutoryStaleWarn({ month: '2027-12', company: { payCycle: 'daily' }, dayTaxYear: 2028 }));
    if (!/所得税額表の 2028年分（日払い・週払いの日の年）/.test(hi)) throw new Error('日払い 翌年の日：基準が 日の年に なっていない＝' + hi);
    if (/対象月|社会保険料率/.test(hi)) throw new Error('日払い 翌年の日：古くない 対象月・社保を 言っている＝' + hi);
    // 日払い・週払いで 対象月の 年 そのものが 古い（2028-01）＝基準は「対象月の年」（日の 年が 同じ・無い 時も）。月次の「支払日の年」と 取り違えない（taiketsu 任意1）
    for (const d of [0, 2028]) {
      const t = txt(PW.statutoryStaleWarn({ month: '2028-01', company: { payCycle: 'weekly' }, dayTaxYear: d }));
      if (!/所得税額表の 2028年分（対象月の年）/.test(t)) throw new Error('週払い 2028-01 dayTaxYear=' + d + '：基準が 対象月の年に なっていない＝' + t);
    }
    // 年を またぐ 紙で 2年分とも 古い（2028-12 の 紙に 2029-01 の 日）＝両方の 年を 書く（差分 taiketsu 任意1）
    const futa = txt(PW.statutoryStaleWarn({ month: '2028-12', company: { payCycle: 'daily' }, dayTaxYear: 2029 }));
    if (!/所得税額表の 2028年分（対象月の年）・2029年分（日払い・週払いの日の年）/.test(futa)) throw new Error('2年分とも 古い：片方の 年が 落ちた＝' + futa);
  } finally { SHH.getKenko = keep.k; SHH.getKaigo = keep.g; SAI.saiteiStale = keep.s; KOYO_.employStale = keep.e; }
  // 本物の lib のまま：2027-06 当月払い＝健保と 雇用保険が 古い（社保は 2027-02 まで・雇用は 2027-03 まで 収録・所得税 2027 は 収録済み・最賃 令和8年度は 2027-09 まで）
  eq(SHH.getKenko('tokyo', '2027-06').stale, true, '前提：2027-06 の 健保は 古い');
  eq(SAI.saiteiStale('2027-06'), false, '前提：2027-06 の 最賃は 収録済み');
  const shaho = txt(PW.statutoryStaleWarn({ month: '2027-06', company: { paydayRel: 'current', paydayDay: '25' } }));
  if (!/対象月（2027-06）の 社会保険料率・雇用保険料率 は未収録の年度です/.test(shaho)) throw new Error('社保だけ 古い：字が 違う＝' + shaho);
  if (/所得税額表/.test(shaho)) throw new Error('社保だけ 古い のに 所得税額表と 言っている＝' + shaho);
  // 両方 古い：2028-01 当月払い
  const ryo = txt(PW.statutoryStaleWarn({ month: '2028-01', company: { paydayRel: 'current', paydayDay: '25' } }));
  if (!/対象月（2028-01）の 社会保険料率/.test(ryo) || !/所得税額表の 2028年分（支払日の年）/.test(ryo)) throw new Error('両方 古い：字が 違う＝' + ryo);
});

/* ★2026-11-06 候補⑥ 賞与も 雇用保険の 古さを 支給月で 見る★（賞与の 雇用保険料は app.js computeBonus の employYearOfYm(支給月)） */
T('警告：賞与の 雇用保険料率が 未収録（支給 2027-06＝令和9年度）なら 黄警告・2027-03 支給は 出ない', () => {
  const SHH = require(path.join(ROOT, 'lib/shakaihoken-hyo.js'));
  const KH = require(path.join(ROOT, 'lib/koyo-hoken.js'));
  const PW = require(path.join(ROOT, 'lib/payroll-warnings.js'));
  const txt = (h) => String(h || '').replace(/<[^>]+>/g, '');
  const keep = { k: SHH.getKenko, g: SHH.getKaigo };
  try {
    SHH.getKenko = function () { return Object.assign({}, keep.k.apply(this, arguments), { stale: false }); };
    SHH.getKaigo = function () { return Object.assign({}, keep.g.apply(this, arguments), { stale: false }); };
    eq(KH.employStale('2027-06'), true, '前提：令和9年度の 雇用保険料率は 未収録');
    const t = txt(PW.bonusStaleWarn({ month: '2027-06' }));
    if (!/支給月（2027-06）の 雇用保険料率/.test(t)) throw new Error('支給 2027-06：「支給月（2027-06）の 雇用保険料率」が無い＝' + t);
    if (/社会保険料率/.test(t)) throw new Error('支給 2027-06：古く ない 社保と 言っている＝' + t);
    if (!/は未収録の年度です/.test(t)) throw new Error('「は未収録の年度です」が 消えた');
    eq(PW.bonusStaleWarn({ month: '2027-03' }), '', '支給 2027-03（令和8年度）＝出ない');
  } finally { SHH.getKenko = keep.k; SHH.getKaigo = keep.g; }
});

/* ★賞与の 古い表の 黄警告は 支給月（payYm）で 見る★（2026-11-04 夜）
   賞与の 計算は ym＝支給月（app.js bonusYmOf）で 健保・介護（支給月の 年度）と 賞与の 所得税（shoyo-zei shoyoYearOf＝支給月の 年・
   甲乙の 算出率表 KOU/OTSU_BY_YEAR、前月なし等の 特例は 月額表＝densan PARAMS）を 選ぶ。
   前は 賞与の 画面にも 印刷にも 警告が 無かった＝対象月 2027-12・支給 2028-01 で 黙って 令和9の 表。 */
T('警告：賞与は 支給月で 見る（社保＝支給月・所得税＝支給月の年の 賞与の表）', () => {
  const SHH = require(path.join(ROOT, 'lib/shakaihoken-hyo.js'));
  const SAI = require(path.join(ROOT, 'lib/saitei-chingin.js'));
  const SZ = require(path.join(ROOT, 'lib/shoyo-zei.js'));
  const PW = require(path.join(ROOT, 'lib/payroll-warnings.js'));
  if (typeof PW.bonusStaleWarn !== 'function') throw new Error('PW.bonusStaleWarn が無い');
  const mx = (o) => Math.max(...Object.keys(o).filter(k => /^\d{4}$/.test(k)).map(Number));
  eq(mx(SZ.KOU_BY_YEAR), 2027, '前提：賞与 甲の 収録の 最新＝2027'); eq(mx(SZ.OTSU_BY_YEAR), 2027, '前提：賞与 乙の 収録の 最新＝2027');
  const txt = (h) => String(h || '').replace(/<[^>]+>/g, '');
  const keep = { k: SHH.getKenko, g: SHH.getKaigo, s: SAI.saiteiStale, e: KOYO_.employStale };
  try {
    SHH.getKenko = function () { return Object.assign({}, keep.k.apply(this, arguments), { stale: false }); };
    SHH.getKaigo = function () { return Object.assign({}, keep.g.apply(this, arguments), { stale: false }); };
    KOYO_.employStale = function () { return false; }; // 雇用保険（11-06 候補⑥）も 古くない 事に＝ここは 所得税の 字だけを 見る
    SAI.saiteiStale = function () { return true; }; // 最賃は 賞与に 効かない＝古くても 言わない
    const t28 = txt(PW.bonusStaleWarn({ month: '2028-01' }));
    if (!/賞与の所得税の表の 2028年分（支給月の年）/.test(t28)) throw new Error('支給 2028-01：「賞与の所得税の表の 2028年分（支給月の年）」が無い＝' + t28);
    if (/社会保険料率|最低賃金|対象月/.test(t28)) throw new Error('支給 2028-01：古くない 社保・最賃・対象月を 言っている＝' + t28);
    if (!/は未収録の年度です/.test(t28)) throw new Error('「は未収録の年度です」が 消えた');
    eq(PW.bonusStaleWarn({ month: '2027-12' }), '', '支給 2027-12（収録済み）＝出ない');
    // 収録より 古い 年（支給 2025-12）＝甲乙の 算出率表は 2026 へ 寄せる（pickYear）＝黙って 令和8の 表＝出す（設計前 taiketsu S1・支給月の 箱は 24か月 前まで 選べる）
    eq(SZ.bonusRate(100000, 0, { year: 2025 }).stale, true, '前提：2025 の 賞与の 表は 無い（2026 へ 寄せる）');
    const t25 = txt(PW.bonusStaleWarn({ month: '2025-12' }));
    if (!/賞与の所得税の表の 2025年分（支給月の年）/.test(t25)) throw new Error('支給 2025-12（収録より 古い）：出ない＝' + t25);
    if (/公表されたら/.test(t25)) throw new Error('古い 年（もう 公表済み）に「公表されたら」と 言っている（差分 taiketsu 任意1）＝' + t25);
    // 支給日の 月が 支給月と 違う（年を またぐ）＝表は 支給月で 選んでいる と 黄色で 言う（式は 変えない・設計前 taiketsu S2）
    const gap = txt(PW.bonusStaleWarn({ month: '2027-12', payDay: '2028-01-08' }));
    if (!/支給日（2028-01-08）と 賞与支給月（2027-12）の 月が 違います/.test(gap)) throw new Error('支給日と 支給月の ずれ：出ない＝' + gap);
    if (/未収録/.test(gap)) throw new Error('ずれだけ なのに 未収録と 言っている＝' + gap);
    eq(PW.bonusStaleWarn({ month: '2027-12', payDay: '2027-12-10' }), '', '支給日が 支給月の 中＝出ない');
    // 客が よく 打つ 書き方でも 読む（差分 taiketsu 止め1：前は 2028-01-08 の 形だけ＝8通り中 2通り）
    for (const w of ['2028/01/08', '2028/1/8', '2028-1-8', '2028.1.8', '2028年1月8日', '2028 年 1 月 8 日', '令和10年1月8日', '令和１０年１月８日', '２０２８-０１-０８', ' 2028/1/8 ', '1月8日', '1/8',
      // 曜日・「予定」「支給」・R略記・全角の区切り（差分 taiketsu 2回目 任意1＝振込を 使わない 会社は ここでしか 気づけない）
      '2028年1月8日（土）', '2028/01/08(土)', '1月8日(土)', '1月8日支給', '2028/1/8 予定', 'R10.1.8', '令和10.1.8', '２０２８．１．８', '2028－01－08', '20280108',
      // 「支払」・コロン・後ろの「振込」・長音や − ‐ の区切り（差分 taiketsu 3回目 任意3）
      '支払日 2028/1/8', '2028年1月8日支払', '支給日：2028/1/8', '支給日:2028/1/8', '2028/1/8 振込', '2028ー01ー08', '2028−01−08', '2028‐01‐08',
      // 名簿に 無い 語が 付いても 読む（差分 taiketsu 4回目 任意1〜3＝語を 足す 形を やめ 日付の 字 以外を 落とす）
      '支払い日 2028/1/8', '2028年1月8日支払い', '振込日 2028/1/8', '2028–01–08', '2028―01―08', '2028ｰ01ｰ08', 'ボーナス 2028/1/8']) {
      const t = txt(PW.bonusStaleWarn({ month: '2027-12', payDay: w }));
      if (!/月が 違います/.test(t)) throw new Error('支給日「' + w + '」（2028-01）で ずれが 出ない＝' + t);
    }
    // 黙る 側は「読めて 支給月の 中」を 直に 見る（読めずに 黙るのと 区別する＝差分 taiketsu 3回目 任意1 の 空振り）
    if (typeof PW._shikyubiYm !== 'function') throw new Error('PW._shikyubiYm が 無い（読みを 直に 試せない）');
    for (const w of ['2027/12/10', '令和9年12月10日', '12月10日', '１２月１０日', '12/10', '2027年12月10日（金）', '12/10 支給予定', 'R9.12.10', '支払日：2027/12/10']) {
      eq(PW._shikyubiYm(w, '2027-12'), '2027-12', '支給日「' + w + '」を 2027-12 と 読む');
      eq(PW.bonusStaleWarn({ month: '2027-12', payDay: w }), '', '支給日「' + w + '」は 支給月の 中＝出ない');
    }
    eq(PW._shikyubiYm('末日', '2027-12'), '', '「末日」は 読めない（空）');
    eq(PW.bonusStaleWarn({ month: '2027-12', payDay: '末日' }), '', '日付と 読めない 自由文＝ずれは 言わない（読めない 物で 決めない）');
    // 甲乙・月額表の どれか 1つでも その年が 無ければ 出す（乙だけ 入れ忘れた 日・特例の 月額表だけ 古い 日）
    const o27 = SZ.OTSU_BY_YEAR[2027];
    try { delete SZ.OTSU_BY_YEAR[2027]; if (!/2027年分（支給月の年）/.test(txt(PW.bonusStaleWarn({ month: '2027-12' })))) throw new Error('乙の 2027 が 無いのに 出ない'); }
    finally { SZ.OTSU_BY_YEAR[2027] = o27; }
    const p27 = D.PARAMS[2027];
    try { delete D.PARAMS[2027]; if (!/2027年分（支給月の年）/.test(txt(PW.bonusStaleWarn({ month: '2027-12' })))) throw new Error('月額表（特例）の 2027 が 無いのに 出ない'); }
    finally { D.PARAMS[2027] = p27; }
  } finally { SHH.getKenko = keep.k; SHH.getKaigo = keep.g; SAI.saiteiStale = keep.s; KOYO_.employStale = keep.e; }
  // 本物の lib のまま：支給 2027-06＝健保と 雇用保険が 古い（所得税 2027 は 収録済み）
  const sh = txt(PW.bonusStaleWarn({ month: '2027-06' }));
  if (!/支給月（2027-06）の 社会保険料率・雇用保険料率 は未収録の年度です/.test(sh)) throw new Error('支給 2027-06：字が 違う＝' + sh);
  if (/所得税/.test(sh)) throw new Error('支給 2027-06：収録済みの 所得税を 言っている＝' + sh);
  eq(PW.bonusStaleWarn({ month: '2026-12' }), '', '支給 2026-12（全部 収録済み）＝出ない');
});

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
