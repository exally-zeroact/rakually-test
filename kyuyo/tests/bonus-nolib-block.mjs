/* bonus-nolib-block.mjs — ★賞与の計算部品(ShoyoZei)が読めない時、社保0+源泉0を黙って確定/振込させない★（2026-10-08 ダイコメ横断(a)2）
 * =============================================================================
 * ★守る事★
 *   ShoyoZei(賞与の税/社保 lib)が完全に読めないと computeBonus の si/tax が 0 になる＝★社保0・源泉0の賞与★。
 *   前は taxMitei(確定可否)が lib欠落を見ておらず、prevAfter 在り&非委託なら ★0社保0税が黙って確定・振込できた★
 *   （年調・賃金台帳に混入／全銀・Excelでフル総支給が銀行へ）。司さんの原則「計算できないなら止めて警告」(2026-10-04 振込)を賞与に当てる。
 *   直し＝computeBonus に szMissing(=!_contractor&&!SZl) を足し taxMitei に OR／buildTransfers で szMissing→keisanOchi(振込作らせない)／
 *   saveBonusPayslips 冒頭に「taxMitei が1人でも居たら保存しない」門。★金額・計算式は変えない＝止めて警告するだけ★。
 * ★この歯★… 本物の app.js を jsdom に読み(ShoyoZei は index.html:209 で載る)、computeBonus/buildTransfers/saveBonusPayslips を直接叩く。
 *   ①lib在り＝taxMitei/szMissing=false(確定可) ②win.ShoyoZei を消す＝szMissing/taxMitei=true(ブロック) ③業務委託は lib無しでも false
 *   ④振込: lib無し＝その人の keisanOchi=true・ready=false(全銀作らせない) ⑤保存: lib無し＝savePayslip を1回も呼ばない(門が止める)。
 * ★わざと(--waza)★… szMissing を taxMitei に足さない旧判定を注入＝②④⑤が赤＝load-bearing。
 * 依存: jsdom。使い方: node kyuyo/tests/bonus-nolib-block.mjs   ／   --waza
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WAZA = process.argv.includes('--waza');
let JSDOM;
try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません（SKIPを緑と呼ばない）。npm install してください。'); process.exit(1); }

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1].replace(/\?.*$/, ''))
  .filter((s) => !/^https?:/.test(s) && !/supabase|supa-config|auth/.test(s));
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
const win = dom.window, doc = win.document;
win.fetch = () => Promise.reject(new Error('no net'));
win.print = () => {};
for (const src of srcs) {
  let code = fs.readFileSync(path.join(ROOT, src), 'utf8');
  if (WAZA && src.indexOf('app.js') >= 0) {
    /* ★旧判定へ退行＝szMissing を taxMitei に足さない（lib欠落を見ない）★ */
    code = code.replace('!_contractor && (szMissing || noPrev || !!(tax.special && !tax.specialComputed))',
      '!_contractor && (noPrev || !!(tax.special && !tax.specialComputed))');
    /* 振込側も旧へ＝szMissing を keisanOchi にしない */
    code = code.replace('if(bonus){ var _cb=computeBonus(e); net=_cb.net; if(_cb.szMissing) keisanOchi=true; } else { net=compute(e).net; }',
      'net = bonus ? computeBonus(e).net : compute(e).net;');
  }
  const el = doc.createElement('script'); el.textContent = code; doc.body.appendChild(el);
}

let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };

const A = win.__PAYSLIP_TEST;
if (!A || !A.computeBonus || !A.buildTransfers || !A.bonusEntry || !A.state) { console.log('✗ ★computeBonus/buildTransfers/bonusEntry/state が 取れない★'); process.exit(1); }

/* 当月に在籍する1名＋賞与（amount>0・前月給与 prevAfter 手入力＝noPrev を外す）。振込口座も埋める（ready の他条件を満たす）。 */
const ym = '2026-12';
const e1 = Object.assign(A.defEmp('賞与 太郎'), { id: 'b1', base: '300000', pref: '東京都',
  furiBankNo: '0001', furiBranchNo: '001', furiAccount: '1234567', furiKana: 'ショウヨ タロウ' });
A.state.company = A.state.company || {}; A.state.company.name = '株式会社テスト';
A.state.employees = [e1];
A.state.month = ym;
A.state.bonus = { payYm: ym, payDay: '2026-12-10', byEmp: { b1: { amount: '500000', prevAfter: '280000', ytd: '' } } };

const lib = win.ShoyoZei;
if (!lib) { console.log('✗ ★shoyo-zei.js が 読めていない（この歯の前提が崩れる）★'); process.exit(1); }

console.log('\n[bonus-nolib-block] 賞与の計算部品が読めない時 0社保0税を黙って確定/振込させない' + (WAZA ? '  ★★旧判定を注入した回★★' : ''));

/* ① lib 在り＝確定できる（szMissing/taxMitei false・net 出る） */
win.ShoyoZei = lib;
var c1 = A.computeBonus(e1);
T('① lib在り＝szMissing=false・taxMitei=false（確定できる）', c1.szMissing === false && c1.taxMitei === false, JSON.stringify({ sz: c1.szMissing, mitei: c1.taxMitei }));
T('① lib在り＝社保/源泉が 出ている（net>0・計算されている）', c1.si && c1.si.total > 0 && c1.net > 0, JSON.stringify({ siTotal: c1.si && c1.si.total, net: c1.net }));

/* ② lib を消す＝計算部品欠落。szMissing=true・taxMitei=true（ブロック） */
try { delete win.ShoyoZei; } catch (e) { win.ShoyoZei = undefined; }
win.ShoyoZei = undefined;
var c2 = A.computeBonus(e1);
if (!WAZA) {
  T('② ★lib欠落＝szMissing=true・taxMitei=true（黙って確定させない）★', c2.szMissing === true && c2.taxMitei === true, JSON.stringify({ sz: c2.szMissing, mitei: c2.taxMitei }));
} else {
  T('② ★--waza: 旧判定だと lib欠落でも taxMitei=false（＝門が無い＝歯が守る）', c2.taxMitei === false, 'mitei=' + c2.taxMitei);
}

/* ③ 業務委託は lib無しでも 源泉なしが正しい＝szMissing/taxMitei false */
var ec = Object.assign(A.defEmp('委託 花子'), { id: 'c1', employmentType: 'contractor' });
A.state.employees = [ec];
A.state.bonus.byEmp.c1 = { amount: '300000', prevAfter: '', ytd: '' };
var c3 = A.computeBonus(ec);
T('③ 業務委託は lib無しでも taxMitei=false（源泉なしが正しい・誤ブロックしない）', c3.taxMitei === false && c3.szMissing === false, JSON.stringify({ sz: c3.szMissing, mitei: c3.taxMitei }));

/* ④ 振込: lib欠落＝その人は keisanOchi=true・ready=false（全銀/Excelを作らせない） */
A.state.employees = [e1];
var tr = A.buildTransfers('bonus').filter(function (t) { return t.emp && t.emp.id === 'b1'; })[0];
if (!WAZA) {
  T('④ ★lib欠落＝振込で keisanOchi=true・ready=false（フル額を銀行へ出さない）★', !!tr && tr.keisanOchi === true && tr.ready === false, JSON.stringify(tr ? { ko: tr.keisanOchi, ready: tr.ready, amount: tr.amount } : null));
} else {
  T('④ ★--waza: 旧だと keisanOchi=false（振込が止まらない＝歯が守る）', !!tr && tr.keisanOchi === false, 'ko=' + (tr && tr.keisanOchi));
}

/* ⑤ 保存: lib欠落＝saveBonusPayslips が savePayslip を1回も呼ばない（save層の門） */
var saveCalls = 0;
win.Store = { savePayslip: function () { saveCalls++; return Promise.resolve(); } };
if (A.saveBonusPayslips) {
  A.saveBonusPayslips();
  if (!WAZA) {
    T('⑤ ★lib欠落＝saveBonusPayslips が 0社保の賞与を 保存しない（savePayslip 0回）★', saveCalls === 0, 'savePayslip 呼び出し=' + saveCalls);
  } else {
    T('⑤ ★--waza: 旧だと taxMitei=false で 保存されてしまう（savePayslip≥1＝歯が守る）', saveCalls >= 1, 'savePayslip=' + saveCalls);
  }
} else {
  T('⑤ saveBonusPayslips が 露出していない（__PAYSLIP_TEST に足す）', false, '');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log('KEKKA {"passed":' + pass + ',"failed":' + fail + ',"mimiso":0}');
process.exit(fail ? 1 : 0);
