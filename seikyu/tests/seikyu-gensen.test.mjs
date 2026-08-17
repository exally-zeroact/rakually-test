/* seikyu-gensen.test.mjs — ★源泉徴収（士業・フリーランス相手の請求書）★
 *
 * なぜ必要か（国税庁 タックスアンサー No.2798）:
 *   弁護士・税理士・デザイナー・ライター・講師などへの報酬は ★源泉徴収の対象★。
 *   請求書に「源泉徴収税額」と「差引お支払額」が無いと、★その商売では1通も出せない★。
 *   ・★消費税が明確に区分されている請求書は、消費税を除いた報酬額のみが対象★
 *   ・謝金・調査費・日当・旅費の名目でも対象に含まれる（＝立替と混ぜない設計が要る）
 *
 * ★率はこのファイルにも lib にも書かない★
 *   100万円以下 10.21% ／ 100万円超 (A−100万)×20.42%+102,100 の式は
 *   ★kyuyo/lib/shiharai-chosho.js の gensenA() が唯一の正★（給与が既に持っている）。
 *   請求書はそれを呼ぶだけ。同じ物を2箇所に持たない。
 *
 * ここで止めたい事故:
 *   ① 消費税まで源泉の対象に入れる（税込に掛けると多く引きすぎる）
 *   ② 立替（交通費・高速代）まで源泉の対象に入れる
 *   ③ 100万円の境界を跨ぐ時に1円ずれる
 *   ④ 対象が0本なのに「源泉徴収税額 0円」と刷る（★引いていない事と0円は違う★）
 *
 * 使い方: node seikyu/tests/seikyu-gensen.test.mjs
 *         node seikyu/tests/seikyu-gensen.test.mjs --self-test
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(path.join(ROOT, 'package.json'));
const GEN = require_(path.join(ROOT, 'seikyu/lib/seikyu-gensen.js'));
const TAX = require_(path.join(ROOT, 'seikyu/lib/seikyu-tax.js'));
const CHOSHO = require_(path.join(ROOT, 'kyuyo/lib/shiharai-chosho.js'));
const SR = require_(path.join(ROOT, 'kyuyo/lib/shouhizei-ritsu.js'));

const STD = Math.round(SR.hyojun * 10000) / 100;
const RED = Math.round(SR.keigen * 10000) / 100;

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };

/* 対象額 A に対する正しい税額を、★給与の lib から取る★（このテストにも率を書かない） */
const want = (a) => CHOSHO.gensenA(a);

function calc(lines, taxMode, rounding) {
  const tax = TAX.compute({ lines, taxMode: taxMode || 'exclusive', rounding: rounding || 'floor' });
  return GEN.compute({ lines: tax.lines, taxMode: taxMode || 'exclusive', rounding: rounding || 'floor', tax });
}

/* ★純関数（self-test で作り物を通せる）★ やってはいけない方＝税込に掛ける */
export function gensenOnGross(grandTotal) { return CHOSHO.gensenA(grandTotal); }

/* ── self-test：わざと壊して赤になるか ─────────────────────────────── */
if (process.argv.includes('--self-test')) {
  console.log('\n[seikyu-gensen --self-test] わざと壊して赤になるか');
  let sp = 0, sf = 0;
  const S = (n, fn) => { try { fn(); sp++; console.log('  ✓ ' + n); } catch (e) { sf++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };

  S('① 税込に掛ける作り方は、消費税ぶん多く引く（本物は税抜に掛ける）', () => {
    const lines = [{ name: '原稿料', amount: 100000, rate: STD, gensen: true }];
    const t = TAX.compute({ lines, taxMode: 'exclusive', rounding: 'floor' });
    const bad = gensenOnGross(t.grandTotal);          // 110,000 に掛ける
    const good = calc(lines).amount;                   // 100,000 に掛ける
    ok(bad > good, '作り物の方が多くない＝この検査が空振り');
    eq(good, want(100000), '本物が税抜で計算していない');
  });

  S('② 立替まで対象に入れる作り方は、引きすぎる（本物は対象行だけ）', () => {
    const lines = [
      { name: '原稿料', amount: 100000, rate: STD, gensen: true },
      { name: '交通費（立替）', amount: 5000, rate: 0, gensen: false },
    ];
    const badBase = 105000, goodBase = 100000;
    ok(want(badBase) > want(goodBase), '作り物の方が多くない＝この検査が空振り');
    eq(calc(lines).amount, want(goodBase), '本物が立替まで対象にしている');
  });

  S('③ 100万円の境界で切り捨てを四捨五入にすると1円ずれる', () => {
    // 999,999 は 102,099（切捨）。四捨五入なら 102,100 になり1円ずれる
    const floorV = Math.floor(999999 * 0.1021);
    const roundV = Math.round(999999 * 0.1021);
    ok(floorV !== roundV, '境界の例が悪い＝この検査が空振り');
    eq(want(999999), floorV, '★1円未満は切り捨て★');
  });

  console.log('\n[self-test] ' + sp + ' passed, ' + sf + ' failed');
  if (sf) process.exit(1);
}

/* ── 本体 ──────────────────────────────────────────────────────── */
console.log('\n[請求書 源泉徴収]');

/* ① 率をこのアプリに書いていない ------------------------------------ */
T('★率も式も請求書側に書いていない（給与の gensenA が唯一の正）', () => {
  const fs = require_('node:fs');
  const src = fs.readFileSync(path.join(ROOT, 'seikyu/lib/seikyu-gensen.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  ok(!/0\.1021|10\.21/.test(code), '10.21% を書いている');
  ok(!/0\.2042|20\.42/.test(code), '20.42% を書いている');
  ok(!/102100|102,100/.test(code), '102,100 を書いている');
  ok(!/1000000|1,000,000/.test(code), '100万円の境界を書いている');
  ok(/gensenA/.test(code), '給与の gensenA を呼んでいない');
});

/* ② 対象額＝消費税を除いた報酬額 ------------------------------------ */
T('★消費税を除いた報酬額にだけ掛ける（外税）', () => {
  const lines = [{ name: '原稿料', amount: 100000, rate: STD, gensen: true }];
  const r = calc(lines);
  eq(r.base, 100000, '対象額が税抜でない');
  eq(r.amount, want(100000));
});

T('★内税でも「消費税を除いた額」に掛ける（税込のまま掛けない）', () => {
  const lines = [{ name: '原稿料', amount: 110000, rate: STD, gensen: true }];
  const r = calc(lines, 'inclusive');
  const t = TAX.compute({ lines, taxMode: 'inclusive', rounding: 'floor' });
  eq(r.base, t.subtotal, '対象額が税抜になっていない');
  ok(r.base < 110000, '税込のまま掛けている');
  eq(r.amount, want(r.base));
});

T('★立替（対象外）や非課税の行は源泉の対象にしない', () => {
  const lines = [
    { name: '原稿料', amount: 100000, rate: STD, gensen: true },
    { name: '交通費（立替）', amount: 5000, rate: 0, gensen: false },
    { name: '印紙代', amount: 200, rate: 0, nontax: true, gensen: false },
  ];
  const r = calc(lines);
  eq(r.base, 100000);
  eq(r.amount, want(100000));
});

T('★同じ紙に 対象の行と対象でない行が混ざっても、対象だけを足す', () => {
  const lines = [
    { name: '原稿料', amount: 300000, rate: STD, gensen: true },
    { name: 'デザイン料', amount: 200000, rate: STD, gensen: true },
    { name: '物品販売', amount: 50000, rate: STD, gensen: false },
    { name: 'お弁当', amount: 1000, rate: RED, gensen: false },
  ];
  const r = calc(lines);
  eq(r.base, 500000);
  eq(r.amount, want(500000));
});

/* ③ 境界（★実物で測ってテストに埋める★） --------------------------- */
T('★境界：100万円ちょうど／1円上／1円下／0円', () => {
  const at = (base) => calc([{ name: '報酬', amount: base, rate: STD, gensen: true }]);
  eq(at(1000000).amount, want(1000000), '100万円ちょうど');
  eq(at(1000001).amount, want(1000001), '100万円+1円');
  eq(at(999999).amount, want(999999), '100万円−1円');
  eq(at(0).amount, 0, '0円');
  // ★実数で固定（給与の lib が変わったらここが赤になる）
  eq(want(1000000), 102100, '100万円ちょうどの実額');
  eq(want(999999), 102099, '100万円−1円の実額');
  eq(want(1000001), 102100, '100万円+1円の実額（超過1円ぶんは切り捨て）');
});

T('★境界：1円未満は切り捨て（多く引かない）', () => {
  // 105円×10.21% = 10.7205 → 10円
  eq(calc([{ name: '報酬', amount: 105, rate: STD, gensen: true }]).amount, 10);
  eq(calc([{ name: '報酬', amount: 1, rate: STD, gensen: true }]).amount, 0);
});

T('★境界：対象の行が0本＝「引いていない」。0円と作り分ける', () => {
  const r = calc([{ name: '物品', amount: 50000, rate: STD, gensen: false }]);
  eq(r.on, false, '対象が0本なのに「引いた」ことになっている');
  eq(r.amount, 0);
  eq(r.base, 0);
});

T('★境界：対象が全部 立替＝これも「引いていない」', () => {
  const r = calc([
    { name: '交通費（立替）', amount: 5000, rate: 0, gensen: false },
    { name: '宿泊費（立替）', amount: 8000, rate: 0, gensen: false },
  ]);
  eq(r.on, false);
  eq(r.amount, 0);
});

T('★境界：明細が0行', () => {
  const r = calc([]);
  eq(r.on, false);
  eq(r.amount, 0);
  eq(r.base, 0);
});

/* ④ 差引お支払額 ---------------------------------------------------- */
T('★差引お支払額 = 合計 − 源泉徴収税額（実額で固定）', () => {
  const lines = [
    { name: '原稿料', amount: 100000, rate: STD, gensen: true },
    { name: '交通費（立替）', amount: 5000, rate: 0, gensen: false },
  ];
  const t = TAX.compute({ lines, taxMode: 'exclusive', rounding: 'floor' });
  const r = calc(lines);
  eq(t.grandTotal, 115000, '前提の合計');   // 100,000 + 消費税10,000 + 立替5,000
  eq(r.base, 100000);
  eq(r.amount, 10210);
  eq(r.net, 104790, '差引お支払額');
  eq(t.grandTotal - r.amount, r.net);
});

T('★引いていない時の差引お支払額は 合計そのもの', () => {
  const lines = [{ name: '物品', amount: 50000, rate: STD, gensen: false }];
  const t = TAX.compute({ lines, taxMode: 'exclusive', rounding: 'floor' });
  const r = calc(lines);
  eq(r.on, false);
  eq(r.net, t.grandTotal);
});

/* ⑤ 網羅 ------------------------------------------------------------ */
T('★網羅：金額×内外×丸め を全部流して、対象額が税抜・税額が lib と一致・差引が合う', () => {
  const amounts = [0, 1, 105, 999, 100000, 999999, 1000000, 1000001, 3000000];
  let n = 0;
  for (const a of amounts) {
    for (const mode of ['exclusive', 'inclusive']) {
      for (const rd of ['floor', 'ceil', 'round']) {
        const lines = [
          { name: '報酬', amount: a, rate: STD, gensen: true },
          { name: '立替', amount: 3000, rate: 0, gensen: false },
        ];
        const t = TAX.compute({ lines, taxMode: mode, rounding: rd });
        const r = GEN.compute({ lines: t.lines, taxMode: mode, rounding: rd, tax: t });
        n++;
        if (!Number.isInteger(r.amount)) throw new Error('円未満が残った: ' + r.amount);
        if (r.amount < 0) throw new Error('マイナスの源泉: ' + r.amount);
        if (r.amount !== want(r.base)) throw new Error('lib と違う: ' + r.amount + ' / ' + want(r.base));
        if (r.net !== t.grandTotal - r.amount) throw new Error('差引が合わない');
        if (r.base > t.subtotal) throw new Error('対象額が税抜の合計を超えた');
      }
    }
  }
  if (n < 50) throw new Error('組合せが少なすぎる（検査が空振り）: ' + n);
  console.log('     実測: ' + n + '通りで矛盾0件');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
