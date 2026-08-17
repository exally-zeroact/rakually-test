/* ops-real-values.test.mjs — ★契約の「決まった値」が、アプリの実データを全部受け取れるか★
 *
 * なぜ必要か（2026-08-04・司さんの実機で機能が死んだ）:
 *   契約は employmentType を英語（employee/contractor）と決めていたのに、
 *   ★司さんの実データは日本語（従業員/業務委託）★ だった。
 *   検証で弾かれて ★Excelが1枚も出せなくなった★（今まで出ていた物が出なくなった＝機能が死んだ）。
 *
 *   なぜ気づけなかったか:
 *     ops-app-parity の「69シート完全一致」は ★英語の値を入れた作り物★ で通していた。
 *     ★実物と違う形のテストが嘘をついた。★
 *
 * だからここでは2つやる:
 *   ① ★アプリ自身が作りうる値★（画面の選択肢・既定値）を app.js から【機械で抜き出して】
 *      契約がそれを全部受け取れるかを見る。人が書き写さない＝写し間違いが起きない。
 *   ② 実データに出てくる書き方（日本語・旧表記）を入れて、★engineが通る★ことを見る。
 *
 * 使い方: node tests/ops-real-values.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(path.join(ROOT, 'package.json'));
const op = require_(path.join(ROOT, 'ops/payroll.monthly.js'));
const APP = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };

/* ── ① アプリが作りうる値を app.js から機械で抜く ───────────────────── */
function pick(re, idx = 1) {
  const out = new Set(); let m;
  const r = new RegExp(re.source, re.flags.indexOf('g') >= 0 ? re.flags : re.flags + 'g');
  while ((m = r.exec(APP))) out.add(m[idx]);
  return [...out];
}
/* 画面の選択肢は [['employee','従業員（…）'],['contractor','…']] の形で書かれている。
   ★その配列そのものから取る（テンプレートの '+o[0]+' を拾わないため）。 */
function optionKeys(anchor) {
  const i = APP.indexOf(anchor);
  if (i < 0) return [];
  const arr = APP.slice(i - 400, i);
  const m = arr.match(/\[\s*(\[\s*'[^']+'\s*,\s*'[^']*'\s*\]\s*,?\s*)+\]/g);
  if (!m) return [];
  const last = m[m.length - 1];
  return [...last.matchAll(/\[\s*'([^']+)'\s*,/g)].map(x => x[1]);
}
const APP_VALUES = {
  employmentType: optionKeys('data-emptype="'),
  taxClass: optionKeys('data-taxc="'),
  payType: (() => { const m = /var PAYTYPES=\[([^\]]+)\]/.exec(APP); return m ? m[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')) : []; })(),
};

/* 既定値（defEmp）も実データになる */
const DEFAULTS = {
  employmentType: (/employmentType:\s*'([^']+)'/.exec(APP) || [])[1],
  taxClass: (/taxClass:\s*'([^']+)'/.exec(APP) || [])[1],
};

const COMPANY = { name: 'テスト社', annualHolidays: '120', dailyWorkH: '8', dailyWorkM: '0', gyoshu: 'ippan' };
const emp = (over) => Object.assign({ id: 'e1', name: 'テスト', payType: '月給', base: '250000', pref: 'tokyo', taxClass: 'ko', employmentType: 'employee', shikyu: [], kintai: [] }, over);
const run = (employees) => op.engine({ month: '2026-06', company: COMPANY, employees: employees, otHistory: {}, options: {} });

console.log('\n[ops-real-values] 契約がアプリの実データを受け取れるか');

T('抜き出しが空振りしていない（app.js から実際に選択肢を取れている）', () => {
  if (APP_VALUES.employmentType.length < 2) throw new Error('雇用形態の選択肢が取れていない: ' + JSON.stringify(APP_VALUES.employmentType));
  if (APP_VALUES.taxClass.length < 3) throw new Error('所得税区分の選択肢が取れていない: ' + JSON.stringify(APP_VALUES.taxClass));
  if (APP_VALUES.payType.length < 6) throw new Error('給与形態の選択肢が取れていない: ' + JSON.stringify(APP_VALUES.payType));
});

T('★アプリの画面が作る値を、契約が全部受け取れる（人が書き写していない）', () => {
  const ng = [];
  for (const [field, values] of Object.entries(APP_VALUES)) {
    for (const v of values) {
      const r = run([emp({ [field]: v })]);
      if (r.errors && r.errors.length) ng.push(field + '=' + JSON.stringify(v) + ' → ' + r.errors[0].message);
    }
  }
  for (const [field, v] of Object.entries(DEFAULTS)) {
    if (!v) continue;
    const r = run([emp({ [field]: v })]);
    if (r.errors && r.errors.length) ng.push('既定 ' + field + '=' + JSON.stringify(v) + ' → ' + r.errors[0].message);
  }
  if (ng.length) throw new Error('契約が受け取れない値があります:\n' + ng.map(x => '   - ' + x).join('\n')
    + '\n   → ★アプリの実データが正。契約に入る手前で直す（対応表は1箇所）。');
});

/* ── ② 実データに出てくる書き方（司さんの実機で出た形） ─────────────── */
T('★★司さんの実データ（日本語の雇用形態）でExcelが出る', () => {
  const r = run([emp({ id: 'a', name: 'A', employmentType: '従業員' }), emp({ id: 'b', name: 'B', employmentType: '業務委託' })]);
  if (r.errors && r.errors.length) {
    throw new Error('弾かれています（＝Excelが1枚も出ない）:\n'
      + r.errors.map(e => '   - ' + e.path + ' ' + e.message).join('\n'));
  }
  if (!r.cells || !r.cells.sheets || r.cells.sheets.length < 3) throw new Error('シートが作られていない');
});

T('日本語の書き方が「業務委託」として正しく効く（employeeに寄せていない）', () => {
  const r = run([emp({ id: 'a', name: 'A', employmentType: '業務委託', base: '300000' })]);
  if (r.errors && r.errors.length) throw new Error('弾かれた');
  const p = r.value.people ? r.value.people[0] : (r.cells._people && r.cells._people[0]);
  const kojo = (p.kojo || []).map(x => x.label).join(',');
  if (/健康保険|厚生年金/.test(kojo)) throw new Error('★業務委託なのに社会保険が引かれている＝employeeとして扱われた: ' + kojo);
});

T('他の書き方も受け取れる（正社員/パート/個人事業主/外注）', () => {
  const ng = [];
  for (const v of ['正社員', 'パート', 'アルバイト', '個人事業主', '外注', 'employee', 'contractor']) {
    const r = run([emp({ employmentType: v })]);
    if (r.errors && r.errors.length) ng.push(v + ' → ' + r.errors[0].message);
  }
  if (ng.length) throw new Error('受け取れない書き方:\n' + ng.map(x => '   - ' + x).join('\n'));
});

T('★分からない書き方は【黙って通さない】（お金の判定が変わるため）', () => {
  const r = run([emp({ name: '謎', employmentType: 'なぞの区分' })]);
  if (!r.errors || !r.errors.length) throw new Error('★通してしまった。雇用形態は社保・源泉の有無を決める＝勝手に決めない');
  if (r.value !== null) throw new Error('検証NGなのに value を作っている');
});

T('空・未設定は既定（従業員）として通す（昔のデータに項目が無いことがある）', () => {
  for (const v of [undefined, '', null]) {
    const r = run([emp({ employmentType: v })]);
    if (r.errors && r.errors.length) throw new Error(JSON.stringify(v) + ' が弾かれた: ' + r.errors[0].message);
  }
});

/* ── ★業務委託の源泉徴収（所得税法204条）─────────────────────────
   2026-08-04: 業務委託の控除が完全に0だったので確かめた。
   ★「業務委託＝控除ゼロ」で固定にはなっていない。源泉区分を見て、区分ごとの算式で引いている。
   ★ただし区分の値を検証していなかったため、打ち間違い等が来ると【黙って源泉0】になっていた。
     「引かない」が既定だと、引くべき源泉を引き忘れる。だから契約で弾くようにした。 */
function gensenOf(kubun, amt) {
  const e = Object.assign(emp({ employmentType: '業務委託', base: String(amt), houshuKubun: kubun }),
    { shikyu: [{ label: '基本給', value: String(amt) }] });
  const r = run([e]);
  if (r.errors && r.errors.length) throw new Error(String(kubun) + ' が弾かれた: ' + r.errors[0].message);
  const p = r.cells._people[0];
  return {
    gensen: (p.kojo || []).filter(x => /源泉/.test(x.label)).reduce((a, x) => a + Number(x.value || 0), 0),
    shaho: (p.kojo || []).filter(x => /健康保険|厚生年金|介護|雇用保険/.test(x.label)).length,
  };
}

T('★業務委託の源泉徴収が区分ごとに正しく引かれる（実数）', () => {
  const cases = [
    ['none', 250000, 0, '非該当（運転代行・運送等）＝源泉なし'],
    ['ippan', 250000, Math.floor(250000 * 0.1021), '一般・士業＝支払額×10.21%'],
    ['shihou', 250000, Math.floor((250000 - 10000) * 0.1021), '司法書士等＝（支払額−1万円）×10.21%'],
    ['gaikou', 250000, Math.floor((250000 - 120000) * 0.1021), '外交員等＝（報酬−12万円）×10.21%'],
    ['sonota', 250000, 0, 'その他（要確認）＝非該当扱い'],
  ];
  for (const [k, amt, want, why] of cases) {
    const m = gensenOf(k, amt);
    if (m.gensen !== want) throw new Error(why + ': 期待 ' + want + ' 実際 ' + m.gensen);
    if (m.shaho !== 0) throw new Error(why + ': ★業務委託なのに社会保険が引かれている');
  }
});

T('★源泉区分の打ち間違いは【黙って0にしない】（引くべき源泉を引き忘れないため）', () => {
  const r = run([emp({ employmentType: '業務委託', houshuKubun: 'shiho' })]);   // 正しくは shihou
  if (!r.errors || !r.errors.length) throw new Error('★通してしまった＝源泉0で計算されてしまう');
});

T('源泉区分の日本語の書き方も受け取る', () => {
  for (const v of ['非該当', '一般', '士業', '司法書士', '外交員', 'その他']) {
    const r = run([emp({ employmentType: '業務委託', houshuKubun: v })]);
    if (r.errors && r.errors.length) throw new Error(v + ' → ' + r.errors[0].message);
  }
});

T('源泉区分が未設定・空でも通る（既定＝非該当）', () => {
  for (const v of [undefined, '', null]) {
    const r = run([emp({ employmentType: '業務委託', houshuKubun: v })]);
    if (r.errors && r.errors.length) throw new Error(JSON.stringify(v) + ' が弾かれた');
  }
});

/* ★2026-08-04 判断: 'genkou'(原稿料) は ippan(一般・士業) と同じ算式に寄せた。
   国税庁 No.2795（100万円以下=支払額×10.21%）。引き忘れは払う側(会社)の義務違反のため。
   ＝以前は源泉0だったが、今は引く。ゴールデンとの差は ops-golden-parity の INTENDED に明記してある。 */
T('★昔のデータ genkou(原稿料) も、今はちゃんと源泉を引く', () => {
  const r = run([Object.assign(emp({ name: '原稿料の人', employmentType: '業務委託', base: '300000', houshuKubun: 'genkou' }),
    { shikyu: [{ label: '基本給', value: '300000' }] })]);
  if (r.errors && r.errors.length) throw new Error('弾かれた: ' + r.errors[0].message);
  const p = r.cells._people[0];
  const g = (p.kojo || []).filter(x => /源泉/.test(x.label)).reduce((a, x) => a + Number(x.value || 0), 0);
  if (g !== 30630) throw new Error('月30万の源泉が違う: 期待 30630 実際 ' + g);
  const list = (r.provenance && r.provenance.gensenNoFormula) || [];
  if (list.length) throw new Error('算式がある区分なので出てはいけない: ' + JSON.stringify(list));
});

T('★選べる区分すべてに算式があるので、いま「源泉0で計算した」人は出ない', () => {
  const SC = require_(path.join(ROOT, 'lib/shiharai-chosho.js'));
  for (const k of SC.KUBUN_ORDER) {
    const r = run([emp({ employmentType: '業務委託', houshuKubun: k, kintai: [{ label: '出勤日数', value: '20' }] })]);
    const list = (r.provenance && r.provenance.gensenNoFormula) || [];
    if (list.length) throw new Error(k + ' で出てしまった: ' + JSON.stringify(list));
  }
});

/* ★provenance.gensenNoFormula は「二重の網」として残してある。
   今は契約(enum)が【もっと手前で】弾くので、通常はここに何も出ない（上のテストで確認済み）。
   区分の一覧に算式の無い物が入り込む事故は tests/gensen-kubun.test.mjs が
   「選べるのに算式が無い区分」として赤にする（わざと足して赤になるのも確認済み）。 */

console.log('\n── 実測 ──');
console.log('  アプリが作る値: ' + Object.entries(APP_VALUES).map(([k, v]) => k + '=' + v.join('/')).join('  '));
console.log('  業務委託 月25万の源泉: ' + ['none', 'ippan', 'shihou', 'gaikou', 'sonota']
  .map(k => k + '=' + gensenOf(k, 250000).gensen + '円').join(' / '));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
