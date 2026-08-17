/* ops-golden-parity.test.mjs — ★1円一致の証明★
 *
 * 比較相手は【移設前(1c128e1)に凍結したゴールデン】。移設後のapp.jsとの比較ではない。
 *   移設後は app.js も op も同じ lib を呼ぶので、両者の比較は自己参照＝常に緑＝何も証明しない。
 *
 * 見るもの:
 *   ① お金   … 総支給/控除各項目/控除計/手取り/課税A/標準報酬/中間値si を全ケース完全一致
 *   ② Excel … buildPeople の出力(people)と AOA/cols/merges をセル単位で一致
 *   ③ 警告   … 経理向け(Excelの要確認列)は文言まで完全一致。UI由来の全文言はコード集合で網羅を確認
 *
 * 使い方: node tests/ops-golden-parity.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const op = require(path.join(ROOT, 'ops/payroll.monthly.js'));

const input = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/payroll-input.json'), 'utf8'));
const golden = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/golden-1c128e1.json'), 'utf8'));

let pass = 0, fail = 0;
const diffs = [];
function T(name, fn) { try { fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + ' — ' + (e && e.message)); } }

/* ★ゴールデンと【わざと変えた】所（＝指示役が判断した物だけ）。
 *  ここに書いていない差分は今までどおり赤。★黙って差分を増やせない。★
 *  ゴールデンは移設前(1c128e1)の凍結値なので作り直さない（golden-immutable が守っている）。
 *  ここに1行足す時は「誰が・いくら・なぜ・一次情報・判断日」を必ず書く。
 */
const INTENDED = [
  {
    who: '業務委託 原稿料(該当)', dataset: 'main-2026-06',
    from: 0, to: 30630,
    why: '源泉区分 genkou(原稿料) に算式が無く【源泉0】で凍結されていた。'
      + '国税庁 No.2795 により 原稿料・講演料は 100万円以下=支払額×10.21%（＝ippanと同じ算式）。'
      + '月30万 → 30,630円。★引き忘れは払う側(会社)の義務違反で追徴されるのは会社★。',
    source: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2795.htm',
    decidedAt: '2026-08-04', decidedBy: '指示役（一次情報で確認）',
  },
];
const intendedFor = (name) => INTENDED.find(x => x.who === name) || null;
function eqNum(a, b, where) { if (a !== b) { diffs.push(`${where}: golden=${b} op=${a} 差=${a - b}`); throw new Error(`${where} golden=${b} op=${a}`); } }
function deep(a, b, where) { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) { diffs.push(`${where}: 不一致`); throw new Error(`${where}\n  golden=${B.slice(0, 300)}\n  op    =${A.slice(0, 300)}`); } }

// ゴールデンのUI文言 → 警告コード（テスト側の分類器。opの出力からは作らない）
function codesOf(text) {
  const c = new Set();
  if (/^最低賃金（.+）を下回っています/.test(text)) c.add('MIN_WAGE_UNDER');
  if (/保障給がありません/.test(text)) c.add('NO_GUARANTEE_PAY');
  if (/年間の労働時間が法律の目安/.test(text)) c.add('ANNUAL_HOURS_OVER');
  if (/単月100時間以上/.test(text)) c.add('OT_OVER100');
  if (/時間外が月45時間を超えています/.test(text)) c.add('OT_OVER45');
  if (/深夜（22時〜翌5時）の労働/.test(text)) c.add('MINOR_NIGHT');
  if (/18歳未満の方に時間外・休日労働/.test(text)) c.add('MINOR_OT');
  if (/平均が月80時間を超えています/.test(text)) c.add('OT36_AVG80');
  if (/年720時間を超えています/.test(text)) c.add('OT36_YEAR720');
  if (/月45時間を超えた月が年\d+回/.test(text)) c.add('OT36_COUNT6');
  if (/をオフにしています。短時間労働者などの適用除外/.test(text)) c.add('SHAHO_OFF_ELIGIBLE');
  if (/社会保険（健康保険・厚生年金）の加入対象の可能性/.test(text)) c.add('SHAHO_KANYU_REQUIRED');
  if (/控除なしの報酬明細/.test(text)) c.add('CONTRACTOR_DISGUISED');
  if (/丙は給与形態＝日給が前提です/.test(text)) c.add('HEI_NOT_DAILY');
  if (/休業手当が未入力/.test(text)) c.add('KYUGYO_TEATE_MISSING');
  if (/休業手当が平均賃金の約?60%を下回/.test(text)) c.add('KYUGYO_TEATE_LOW');
  if (/差引支給がマイナス/.test(text)) c.add('NET_NEGATIVE');
  if (/につき在籍\d+日で日割/.test(text)) c.add('PRORATE_JOIN_LEAVE');
  if (/月中退職のため当月の社保/.test(text)) c.add('MID_LEAVE_NO_SHAHO');
  if (/日が不就労のため控除/.test(text)) c.add('LEAVE_NOWORK_DEDUCTED');
  if (/固定残業（みなし）\d+時間を控除/.test(text)) c.add('MINASHI_APPLIED');
  if (/割増の率が法定下限を下回っています|が労基法37条の下限を下回/.test(text)) { c.add('RATE_BELOW_LEGAL'); }
  if (/は未収録の年度です/.test(text)) c.add('STATUTORY_STALE');
  return c;
}
const RATE_CODES = ['RATE_BELOW_LEGAL_OT', 'RATE_BELOW_LEGAL_HOLIDAY', 'RATE_BELOW_LEGAL_NIGHT', 'RATE_BELOW_LEGAL_OVER60'];

console.log('\n[ops-golden-parity] 移設前ゴールデン(1c128e1) vs ops/payroll.monthly');

let moneyChecked = 0, cellChecked = 0;

for (const ds of input.datasets) {
  const g = golden.datasets.find(x => x.id === ds.id);
  if (!g) { fail++; console.log('  ✗ ゴールデンに ' + ds.id + ' がありません'); continue; }

  const res = op.engine({ month: ds.month, company: ds.company, employees: ds.employees, otHistory: ds.otHistory });

  T(`[${ds.id}] 契約検証を通過し errors が空`, function () {
    if (res.errors.length) throw new Error(JSON.stringify(res.errors).slice(0, 300));
    if (!res.value) throw new Error('value が null');
  });

  T(`[${ds.id}] お金が1円まで一致（${g.people.length}名 × 総支給/控除各項目/手取り/課税A/標準報酬/si）`, function () {
    if (res.value.people.length !== g.people.length) throw new Error(`人数 golden=${g.people.length} op=${res.value.people.length}`);
    g.people.forEach((gp, i) => {
      const op_ = res.value.people[i];
      const w = `${ds.id}/${gp.name}`;
      if (op_.empId !== gp.empId) throw new Error(`${w}: empId golden=${gp.empId} op=${op_.empId}`);
      const m = gp.money;
      const intended = intendedFor(gp.name);
      if (intended) {
        // ★わざと変えた人。変わってよいのは「源泉徴収税ぶんだけ」＝それ以外は今までどおり1円一致。
        eqNum(op_.shikyuTotal, m.shikyuTotal, `${w}.総支給`);           // 支給は変わらない
        eqNum(op_.kojoTotal, m.kojoTotal + intended.to - intended.from, `${w}.控除計(意図した差分)`);
        eqNum(op_.net, m.net - (intended.to - intended.from), `${w}.手取り(意図した差分)`);
        eqNum(op_.kazei, m.kazei, `${w}.課税A`);
        for (const k of ['health', 'kaigo', 'pension', 'employ', 'total']) eqNum(op_.si[k], m.si[k], `${w}.si.${k}（社保は変わらない）`);
        deep(op_.shikyu.map(x => ({ label: x.label, value: x.value, hikazei: !!x.hikazei })), m.shikyu, `${w}.支給明細`);
        const add = op_.kojo.filter(x => !m.kojo.some(y => y.label === x.label));
        if (add.length !== 1 || !/源泉/.test(add[0].label)) throw new Error(`${w}: 増えた控除が源泉徴収税ではない: ${JSON.stringify(add)}`);
        if (Number(add[0].value) !== intended.to) throw new Error(`${w}: 源泉額 期待 ${intended.to} 実際 ${add[0].value}`);
        moneyChecked++;
        return;
      }
      eqNum(op_.shikyuTotal, m.shikyuTotal, `${w}.総支給`);
      eqNum(op_.kojoTotal, m.kojoTotal, `${w}.控除計`);
      eqNum(op_.net, m.net, `${w}.手取り`);
      eqNum(op_.kazei, m.kazei, `${w}.課税A`);
      eqNum(op_.nonTaxable, m.nonTaxable, `${w}.非課税`);
      eqNum(op_.hyojun, m.hyojun, `${w}.標準報酬`);
      eqNum(op_.hyojunHealth, m.hyojunHealth, `${w}.標準報酬(健保)`);
      eqNum(op_.hyojunPension, m.hyojunPension, `${w}.標準報酬(厚年)`);
      eqNum(op_.incomeTax, m.incomeTax, `${w}.所得税`);
      eqNum(op_.residentTax, m.residentTax, `${w}.住民税`);
      for (const k of ['health', 'kaigo', 'pension', 'employ', 'total']) eqNum(op_.si[k], m.si[k], `${w}.si.${k}`);
      deep(op_.shikyu.map(x => ({ label: x.label, value: x.value, hikazei: !!x.hikazei })), m.shikyu, `${w}.支給明細`);
      deep(op_.kojo.map(x => ({ label: x.label, value: x.value })), m.kojo, `${w}.控除明細`);
      if (op_.netNegative !== m.netNegative) throw new Error(`${w}.差引マイナス判定`);
      moneyChecked++;
    });
  });

  T(`[${ds.id}] Excel(buildPeople出力)が一致`, function () {
    const p = res.cells._people;
    if (p.length !== g.excel.people.length) throw new Error(`人数 golden=${g.excel.people.length} op=${p.length}`);
    g.excel.people.forEach((gp, i) => {
      if (intendedFor(gp.name)) return;      // ★わざと変えた人は上のお金の比較で1点ずつ見ている
      deep(p[i], gp, `${ds.id}/${gp.name} excel.person`);
    });
    deep(res.cells._opts, g.excel.opts, `${ds.id} excel.opts`);
  });

  T(`[${ds.id}] Excelのセル(AOA/cols/merges)がセル単位で一致`, function () {
    const sheets = res.cells.sheets;
    const names = INTENDED.filter(x => x.dataset === ds.id);
    // ★集計シート: わざと変えた人の行と「合計」行だけが、その額ぶん動いていること。他の行は1セルも変わらない。
    const A = sheets[0].aoa, B = g.excel.shukei.aoa;
    if (A.length !== B.length) throw new Error(`${ds.id} 集計シートの行数 golden=${B.length} op=${A.length}`);
    const delta = names.reduce((a, x) => a + (x.to - x.from), 0);
    let movedRows = 0;
    for (let i = 0; i < A.length; i++) {
      if (JSON.stringify(A[i]) === JSON.stringify(B[i])) continue;
      const label = String((B[i] || [])[0] || '');
      const hit = names.find(x => x.who === label);
      const isTotal = /^合計$/.test(label);
      if (!hit && !isTotal) throw new Error(`${ds.id} 集計シート 行${i}(${label}) が意図せず変わっています
  golden=${JSON.stringify(B[i])}
  op    =${JSON.stringify(A[i])}`);
      const d = hit ? (hit.to - hit.from) : delta;                   // 合計行は全員ぶんの合計
      // 列: [名前, 総支給, 控除計, 差引, 備考] → 控除計は +d、差引は −d、他は同じ
      const want = (B[i] || []).slice();
      want[2] = Number(want[2]) + d;
      want[3] = Number(want[3]) - d;
      if (JSON.stringify(A[i]) !== JSON.stringify(want)) {
        throw new Error(`${ds.id} 集計シート 行${i}(${label}) の動き方が違います
  期待=${JSON.stringify(want)}
  実際=${JSON.stringify(A[i])}`);
      }
      movedRows++;
    }
    if (names.length && movedRows !== names.length + 1) throw new Error(`${ds.id} 集計シートで動いた行が ${movedRows}（人数+合計=${names.length + 1} のはず）`);
    deep(sheets[0].cols, g.excel.shukei.cols, `${ds.id} 集計シート cols`);
    deep(sheets[0].merges, g.excel.shukei.merges, `${ds.id} 集計シート merges`);

    g.excel.meishi.forEach((gm, i) => {
      const s = sheets[i + 1];
      if (s.name !== gm.sheetName) throw new Error(`${ds.id} シート名 golden=${gm.sheetName} op=${s.name}`);
      const hit = names.find(x => x.who === gm.sheetName);
      if (hit) {
        // ★わざと変えた人の明細: 源泉徴収税の行が増えていること（額はお金の比較で見ている）
        const flat = JSON.stringify(s.aoa);
        if (flat.indexOf('源泉徴収税') < 0) throw new Error(`${ds.id} ${gm.sheetName}: 源泉徴収税の行が無い`);
        cellChecked++;
        return;
      }
      deep({ aoa: s.aoa, cols: s.cols, merges: s.merges }, { aoa: gm.aoa, cols: gm.cols, merges: gm.merges }, `${ds.id} 明細シート#${i + 1}`);
      cellChecked++;
    });
  });

  T(`[${ds.id}] 経理向け警告(Excelの要確認列)が文言まで一致`, function () {
    g.excel.people.forEach((gp, i) => deep(res.cells._people[i].warnings, gp.warnings, `${ds.id}/${gp.name} empWarnings`));
  });

  T(`[${ds.id}] UI由来の警告をオペが1つも落としていない(コード網羅)`, function () {
    const opCodes = new Set(res.warnings.map(w => (RATE_CODES.indexOf(w.code) >= 0 ? 'RATE_BELOW_LEGAL' : w.code)));
    const goldenCodes = new Set();
    g.companyWarnings.forEach(t => codesOf(t).forEach(c => goldenCodes.add(c)));
    g.people.forEach(p => p.warnings.forEach(t => codesOf(t).forEach(c => goldenCodes.add(c))));
    const missing = [...goldenCodes].filter(c => !opCodes.has(c));
    if (missing.length) throw new Error(`オペ側に無い警告: ${missing.join(', ')}（ゴールデンには出ている）`);
  });
}

T('比較件数が十分（空振りしていない）', function () {
  if (moneyChecked < 50) throw new Error('お金の比較件数が少なすぎます: ' + moneyChecked);
  if (cellChecked < 50) throw new Error('Excelシートの比較件数が少なすぎます: ' + cellChecked);
});

console.log(`\n── 実測 ──`);
console.log(`  お金を突き合わせた人数: ${moneyChecked}名（1人あたり 総支給/控除計/手取り/課税A/非課税/標準報酬×3/所得税/住民税/si×5/支給明細/控除明細）`);
console.log(`  Excel明細シート: ${cellChecked}枚をセル単位で比較`);
console.log(`  差分: ${diffs.length} 件` + (diffs.length ? '\n   ' + diffs.slice(0, 20).join('\n   ') : '  ← 差分ゼロ'));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
