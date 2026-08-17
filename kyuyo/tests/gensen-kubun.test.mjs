/* gensen-kubun.test.mjs — ★選べるのに算式が無い区分を残さない（所得税法204条）★
 *
 * なぜ必要か（2026-08-04）:
 *   源泉区分 'genkou'（原稿料）に算式が無く、★選べるのに源泉0★のまま凍結されていた。
 *   名前は「原稿料(該当)」なのに1円も引いていない＝★引き忘れ。追徴されるのは払う側(会社)。★
 *   「名前はあるのに0」が一番悪い。だから機械で止める。
 *
 * 見るもの:
 *   ① ★選べる区分（KUBUN_ORDER）は、源泉ありなら必ず算式を持つ★
 *   ② 算式ごとの実数が国税庁の一次情報と1円一致
 *   ③ 旧データの区分は「選べないが受け取れる」（選択肢には出さない・計算はできる）
 *
 * ★わざと算式の無い区分を足すと赤になることを --self-test で確かめる。
 *
 * 使い方: node tests/gensen-kubun.test.mjs
 *         node tests/gensen-kubun.test.mjs --self-test
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(path.join(ROOT, 'package.json'));
const SC = require_(path.join(ROOT, 'lib/shiharai-chosho.js'));

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + 'expected ' + b + ' got ' + a); };

/* ★純関数: 区分の表から「選べるのに算式が無い物」を返す。self-testで作り物を通せる。 */
export function findNoFormula(kubun, order) {
  return (order || []).filter(k => {
    const d = kubun[k];
    if (!d) return true;                 // 選択肢にあるのに表に無い
    return !!d.gensen && !d.formula;     // 源泉ありなのに算式が無い
  });
}

if (process.argv.includes('--self-test')) {
  console.log('\n[gensen-kubun --self-test] わざと算式の無い区分を足して赤になるか');
  T('今の実物は「選べるのに算式が無い」が0件（前提）', () => {
    const ng = findNoFormula(SC.KUBUN, SC.KUBUN_ORDER);
    if (ng.length) throw new Error('前提が崩れています: ' + ng.join(', '));
  });
  T('★源泉ありなのに算式が無い区分を選択肢に足したら赤', () => {
    const k = Object.assign({}, SC.KUBUN, { nazo: { key: 'nazo', label: '謎の報酬', gensen: true, threshold: 50000 } });
    const ng = findNoFormula(k, SC.KUBUN_ORDER.concat(['nazo']));
    if (ng.indexOf('nazo') < 0) throw new Error('赤になっていない');
  });
  T('★表に無い区分を選択肢に足しても赤', () => {
    const ng = findNoFormula(SC.KUBUN, SC.KUBUN_ORDER.concat(['nai']));
    if (ng.indexOf('nai') < 0) throw new Error('赤になっていない');
  });
  T('源泉なし（非該当）は算式が無くても赤にしない（誤検知を出さない）', () => {
    const ng = findNoFormula(SC.KUBUN, ['none', 'sonota']);
    if (ng.length) throw new Error('誤検知: ' + ng.join(', '));
  });
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

console.log('\n[gensen-kubun] 源泉区分（所得税法204条）と算式');

T('★選べる区分は、源泉ありなら必ず算式を持つ（「名前はあるのに0」を残さない）', () => {
  const ng = findNoFormula(SC.KUBUN, SC.KUBUN_ORDER);
  if (ng.length) {
    throw new Error('選べるのに算式が無い区分: ' + ng.join(', ')
      + '\n   → (a)算式を入れる か (b)選択肢から外す のどちらかにしてください。'
      + '\n     ★選べるのに0になるのが一番悪い（引き忘れ＝会社が追徴される）。');
  }
});

/* ② 国税庁の一次情報と1円一致（★実数で固定する） */
T('A 一般・士業／原稿料・講演料（204条1項1号・2号）— No.2795', () => {
  // 100万円以下 = 支払額×10.21% ／ 100万円超 =（支払額−100万円）×20.42%＋102,100円
  eq(SC.gensenFor('ippan', 300000), 30630, '月30万');
  eq(SC.gensenFor('ippan', 1000000), 102100, 'ちょうど100万');
  eq(SC.gensenFor('ippan', 1500000), 102100 + Math.floor(500000 * 0.2042), '150万（100万超）');
});

T('B 司法書士・土地家屋調査士・海事代理士（2号）— No.2801', () => {
  eq(SC.gensenFor('shihou', 250000), Math.floor((250000 - 10000) * 0.1021), '（支払額−1万円）×10.21%');
  eq(SC.gensenFor('shihou', 10000), 0, '1万円以下は0');
});

T('C 外交員・集金人・検針人（4号）— No.2804', () => {
  eq(SC.gensenFor('gaikou', 250000), Math.floor((250000 - 120000) * 0.1021), '（報酬−12万円）×10.21%');
  eq(SC.gensenFor('gaikou', 100000), 0, '控除後が0以下は0');
});

T('★D ホステス等（6号）— No.2807 のページの例と1円一致', () => {
  // 国税庁の例: 3月1日〜31日（31日間）・報酬75万円 →（750,000−155,000）×10.21% = 60,749円
  eq(SC.gensenFor('hostess', 750000, { days: 31 }), 60749, '国税庁ページの例');
  eq(SC.gensenFor('hostess', 300000, { days: 20 }), Math.floor((300000 - 100000) * 0.1021), '20日・30万');
  eq(SC.gensenFor('hostess', 300000, { days: 0 }), 0, '★日数が渡されない時は0（多く引く方に倒さない）');
  eq(SC.gensenFor('hostess', 100000, { days: 25 }), 0, '控除後が0以下は0');
});

T('非該当は必ず0（運転代行・運送・軽貨物＝不可侵）', () => {
  eq(SC.gensenFor('none', 1000000), 0, '非該当');
  eq(SC.gensenFor('sonota', 1000000), 0, 'その他（要確認）');
});

/* ③ 旧データの区分 */
T('★旧データの区分は「選択肢には出ない」が「受け取って計算できる」', () => {
  const legacy = Object.keys(SC.KUBUN).filter(k => SC.KUBUN[k].legacy);
  if (!legacy.length) throw new Error('旧データの区分が1つも無い（この検査が空振り）');
  for (const k of legacy) {
    if (SC.KUBUN_ORDER.indexOf(k) >= 0) throw new Error(k + ' が選択肢に出ている（新しく選ばせない）');
    if (SC.KUBUN[k].gensen && !SC.KUBUN[k].formula) throw new Error(k + ' に算式が無い');
  }
  eq(SC.gensenFor('genkou', 300000), SC.gensenFor('ippan', 300000), '原稿料は一般・士業と同じ算式');
});

console.log('\n── 実測 ──');
console.log('  選べる区分: ' + SC.KUBUN_ORDER.map(k => k + (SC.KUBUN[k].formula ? '(' + SC.KUBUN[k].formula + ')' : '(源泉なし)')).join(' / '));
console.log('  旧データ  : ' + Object.keys(SC.KUBUN).filter(k => SC.KUBUN[k].legacy).map(k => k + '→' + SC.KUBUN[k].formula).join(' / '));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
