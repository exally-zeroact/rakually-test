/* seikyu-tax.test.mjs — ★請求書の消費税（法律で決まっている所）を実数で固定する★
 *
 * なぜ必要か（国税庁 適格請求書等保存方式）:
 *   ★「一の適格請求書につき、税率ごとに1回の端数処理を行う必要があります」★
 *   ★「個々の商品ごとに消費税額等を計算し、1円未満の端数処理を行い、その合計額を
 *      消費税額等として記載することは認められません」★
 *   ＝★丸めるのは「税率ごとの合計に対して1回だけ」。行ごとに丸めてはいけない。★
 *   丸め方（切上げ・切捨て・四捨五入）だけが任意＝会社ごとの設定。
 *
 * ここで止めたい事故:
 *   ① ★「明細ごとに丸める」に書き換えたら赤になる★（実測で1円ずれる例を固定してある）
 *   ② 8%が1行でも混ざったら、10%と8%を★別々に集計して別々に丸める★
 *   ③ 税率が空/知らない値の時に★黙って10%に寄せない★（赤で止める）
 *   ④ 税抜+消費税=税込 が★全パターンで必ず一致★する（NaN・矛盾ゼロ）
 *
 * ★法定の率は1つも書かない★。kyuyo/lib/shouhizei-ritsu.js（唯一の正）から取る。
 *
 * 使い方: node seikyu/tests/seikyu-tax.test.mjs
 *         node seikyu/tests/seikyu-tax.test.mjs --self-test
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(path.join(ROOT, 'package.json'));
const TAX = require_(path.join(ROOT, 'seikyu/lib/seikyu-tax.js'));
const SR = require_(path.join(ROOT, 'kyuyo/lib/shouhizei-ritsu.js'));

const STD = Math.round(SR.hyojun * 10000) / 100; // 標準税率(%) ★数字を書かずに取る
const RED = Math.round(SR.keigen * 10000) / 100; // 軽減税率(%)

let pass = 0, fail = 0;
const T = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };
const ok = (v, m) => { if (!v) throw new Error(m || 'false'); };

/* ★純関数（self-test で作り物を通せる）★
   「明細ごとに丸める」＝法律が認めない方の計算。★本物と比べて違う事を固定するために使う★ */
export function taxPerLine(lines, taxMode, rounding) {
  const r = (x) => {
    const s = x < 0 ? -1 : 1, a = Math.abs(x);
    return s * (rounding === 'ceil' ? Math.ceil(a) : rounding === 'round' ? Math.floor(a + 0.5) : Math.floor(a));
  };
  let t = 0;
  for (const ln of lines) {
    const num = Math.round(ln.rate * 100);
    if (!num) continue;
    t += taxMode === 'inclusive' ? r(ln.amount * num / (10000 + num)) : r(ln.amount * num / 10000);
  }
  return t;
}

/* ── self-test：わざと壊して赤になるかを先に見せる ───────────────────── */
if (process.argv.includes('--self-test')) {
  console.log('\n[seikyu-tax --self-test] わざと壊して赤になるか');
  let sp = 0, sf = 0;
  const S = (n, fn) => { try { fn(); sp++; console.log('  ✓ ' + n); } catch (e) { sf++; console.log('  ✗ ' + n + ' — ' + (e && e.message)); } };

  S('★「明細ごとに丸める」計算は、本物と実際に違う答えを出す（同じなら検査が空振り）', () => {
    const lines = [{ name: 'a', amount: 105, rate: STD }, { name: 'b', amount: 105, rate: STD }, { name: 'c', amount: 105, rate: STD }];
    const real = TAX.compute({ lines, taxMode: 'exclusive', rounding: 'floor' });
    const wrong = taxPerLine(lines, 'exclusive', 'floor');
    if (real.taxTotal === wrong) throw new Error('同じ答えになった＝この検査は何も守っていない');
    if (real.taxTotal !== 31 || wrong !== 30) throw new Error('実測値がずれた real=' + real.taxTotal + ' wrong=' + wrong);
  });

  S('★税率を知らない値にすると赤（黙って標準税率に寄せない）', () => {
    const r = TAX.compute({ lines: [{ name: 'x', amount: 1000, rate: 5 }], taxMode: 'exclusive', rounding: 'floor' });
    if (r.ok) throw new Error('知らない税率5%が通ってしまった');
    if (r.taxTotal !== 0) throw new Error('通らないのに税額が出ている');
  });

  S('★税率を書かない行も赤（空を既定値で埋めない）', () => {
    const r = TAX.compute({ lines: [{ name: 'x', amount: 1000 }], taxMode: 'exclusive', rounding: 'floor' });
    if (r.ok) throw new Error('税率なしが通ってしまった');
  });

  S('★率の出どころを壊す（shouhizei-ritsu を渡さない）と赤', () => {
    let threw = false;
    try { TAX.compute({ lines: [], taxMode: 'exclusive', rounding: 'floor' }, { rates: null }); } catch (e) { threw = true; }
    if (!threw) throw new Error('率の出どころが無くても動いてしまった');
  });

  S('★丸め方を知らない値にすると赤（黙って切捨てにしない）', () => {
    const r = TAX.compute({ lines: [{ name: 'x', amount: 105, rate: STD }], taxMode: 'exclusive', rounding: 'gozen' });
    if (r.ok) throw new Error('知らない丸め方が通ってしまった');
  });

  console.log('\n[self-test] ' + sp + ' passed, ' + sf + ' failed');
  process.exit(sf ? 1 : 0);
}

/* ── 本番の検査 ───────────────────────────────────────────────── */
console.log('\n[seikyu-tax] 税率ごとに1回だけ丸める（国税庁の定め）');
console.log('  使う率: 標準 ' + STD + '% / 軽減 ' + RED + '%（kyuyo/lib/shouhizei-ritsu.js から取得）');

/* ① 丸めるのは税率ごとの合計に1回だけ ------------------------------- */
T('★外税・切捨て：3行×税抜105 → 税は合計315から1回だけ（31円。行ごとだと30円）', () => {
  const lines = [{ name: 'a', amount: 105, rate: STD }, { name: 'b', amount: 105, rate: STD }, { name: 'c', amount: 105, rate: STD }];
  const r = TAX.compute({ lines, taxMode: 'exclusive', rounding: 'floor' });
  ok(r.ok, r.errors.join(','));
  eq(r.subtotal, 315, '税抜合計');
  eq(r.taxTotal, 31, '消費税');
  eq(r.grandTotal, 346, '税込合計');
  eq(taxPerLine(lines, 'exclusive', 'floor'), 30, '（比較用）行ごとに丸めた誤った額');
});

T('★内税・切捨て：3行×税込105 → 税は合計315から1回だけ（28円。行ごとだと27円）', () => {
  const lines = [{ name: 'a', amount: 105, rate: STD }, { name: 'b', amount: 105, rate: STD }, { name: 'c', amount: 105, rate: STD }];
  const r = TAX.compute({ lines, taxMode: 'inclusive', rounding: 'floor' });
  eq(r.taxTotal, 28, '消費税');
  eq(r.subtotal, 287, '税抜合計');
  eq(r.grandTotal, 315, '税込合計');
  eq(taxPerLine(lines, 'inclusive', 'floor'), 27, '（比較用）行ごとに丸めた誤った額');
});

/* ② 税率ごとに別々 --------------------------------------------------- */
T('★8%が1行でもあれば、標準と軽減を別々に集計して別々に丸める（内税）', () => {
  const r = TAX.compute({
    lines: [{ name: '運送料', amount: 1100, rate: STD }, { name: '茶菓', amount: 1080, rate: RED }],
    taxMode: 'inclusive', rounding: 'floor',
  });
  eq(r.byRate.length, 2, '税率の区分数');
  const std = r.byRate.find(x => x.pct === STD), red = r.byRate.find(x => x.pct === RED);
  eq(std.base, 1000, '標準の対価'); eq(std.tax, 100, '標準の税');
  eq(red.base, 1000, '軽減の対価'); eq(red.tax, 80, '軽減の税');
  eq(r.subtotal, 2000); eq(r.taxTotal, 180); eq(r.grandTotal, 2180);
});

T('★軽減税率の行があることを紙が言えるように印を返す（※の根拠）', () => {
  const r = TAX.compute({ lines: [{ name: 'a', amount: 1080, rate: RED }], taxMode: 'inclusive', rounding: 'floor' });
  ok(r.hasReduced, '軽減の行があるのに印が立っていない');
  const r2 = TAX.compute({ lines: [{ name: 'a', amount: 1100, rate: STD }], taxMode: 'inclusive', rounding: 'floor' });
  ok(!r2.hasReduced, '軽減が無いのに印が立っている');
});

/* ③ 丸め方3種（法律で任意＝会社の設定） ------------------------------- */
T('★丸め方3種：外税・税抜5円（税ちょうど0.5円）で 切捨0 / 切上1 / 四捨五入1', () => {
  const L = [{ name: 'x', amount: 5, rate: STD }];
  eq(TAX.compute({ lines: L, taxMode: 'exclusive', rounding: 'floor' }).taxTotal, 0, '切捨て');
  eq(TAX.compute({ lines: L, taxMode: 'exclusive', rounding: 'ceil' }).taxTotal, 1, '切上げ');
  eq(TAX.compute({ lines: L, taxMode: 'exclusive', rounding: 'round' }).taxTotal, 1, '四捨五入');
});

/* ④ 境界を実物で測る ------------------------------------------------- */
T('★境界(端)：0円・1円・マイナス（値引き行）', () => {
  eq(TAX.compute({ lines: [{ name: 'z', amount: 0, rate: STD }], taxMode: 'exclusive', rounding: 'floor' }).taxTotal, 0, '0円');
  eq(TAX.compute({ lines: [{ name: 'z', amount: 1, rate: STD }], taxMode: 'exclusive', rounding: 'floor' }).taxTotal, 0, '1円・切捨て');
  eq(TAX.compute({ lines: [{ name: 'z', amount: 1, rate: STD }], taxMode: 'exclusive', rounding: 'ceil' }).taxTotal, 1, '1円・切上げ');
  // ★マイナスは「絶対値で丸めて符号を戻す」＝切捨ては0に近づく側。値引きで税が増えない。
  const m = TAX.compute({ lines: [{ name: '値引', amount: -105, rate: STD }], taxMode: 'exclusive', rounding: 'floor' });
  eq(m.taxTotal, -10, 'マイナス・切捨て');
  eq(TAX.compute({ lines: [{ name: '値引', amount: -105, rate: STD }], taxMode: 'exclusive', rounding: 'ceil' }).taxTotal, -11, 'マイナス・切上げ');
});

T('★境界(空)：明細0行なら 0円・区分も0個（NaNにしない）', () => {
  const r = TAX.compute({ lines: [], taxMode: 'inclusive', rounding: 'floor' });
  ok(r.ok, r.errors.join(','));
  eq(r.byRate.length, 0); eq(r.subtotal, 0); eq(r.taxTotal, 0); eq(r.grandTotal, 0);
});

T('★境界(不明)：税率が空・知らない値なら赤で止める（黙って標準税率にしない）', () => {
  const a = TAX.compute({ lines: [{ name: 'x', amount: 1000 }], taxMode: 'exclusive', rounding: 'floor' });
  ok(!a.ok, '税率なしが通った'); ok(a.errors.length > 0, '理由が出ていない');
  const b = TAX.compute({ lines: [{ name: 'x', amount: 1000, rate: 5 }], taxMode: 'exclusive', rounding: 'floor' });
  ok(!b.ok, '知らない税率が通った');
});

T('★境界(等号)：ちょうど0.5円が出るのは「外税の標準税率」だけ（1〜20000円を実測）', () => {
  const frac = (v) => Math.abs(v - Math.floor(v));
  let hitExStd = 0, hitExRed = 0, hitInStd = 0, hitInRed = 0;
  const nStd = Math.round(STD * 100), nRed = Math.round(RED * 100);
  for (let v = 1; v <= 20000; v++) {
    if (frac(v * nStd / 10000) === 0.5) hitExStd++;
    if (frac(v * nRed / 10000) === 0.5) hitExRed++;
    if (frac(v * nStd / (10000 + nStd)) === 0.5) hitInStd++;
    if (frac(v * nRed / (10000 + nRed)) === 0.5) hitInRed++;
  }
  ok(hitExStd > 0, '外税・標準で0.5円が1件も出ない＝この実測が壊れている');
  eq(hitExRed, 0, '外税・軽減で0.5円ちょうど');
  eq(hitInStd, 0, '内税・標準で0.5円ちょうど');
  eq(hitInRed, 0, '内税・軽減で0.5円ちょうど');
  console.log('     実測: 外税標準 ' + hitExStd + '件 / 外税軽減 0件 / 内税標準 0件 / 内税軽減 0件（1〜20000円）');
});

T('★境界：非課税（税率0）の行は税を生まないが、金額は合計に入る', () => {
  const r = TAX.compute({
    lines: [{ name: '課税', amount: 1100, rate: STD }, { name: '対象外', amount: 500, rate: 0 }],
    taxMode: 'inclusive', rounding: 'floor',
  });
  eq(r.exempt.base, 500, '対象外の額');
  eq(r.taxTotal, 100);
  eq(r.grandTotal, 1600, '税込合計に対象外も入る');
  eq(r.byRate.length, 1, '税率の区分は課税分だけ');
});

T('★境界(蓋)：1通1000行までは通り、1001行は赤で止める（黙って切らない）', () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ name: 'r' + i, amount: 100, rate: STD }));
  ok(TAX.compute({ lines: mk(1000), taxMode: 'exclusive', rounding: 'floor' }).ok, '1000行が通らない');
  const over = TAX.compute({ lines: mk(1001), taxMode: 'exclusive', rounding: 'floor' });
  ok(!over.ok, '1001行が通ってしまった');
  ok(over.errors.join('').indexOf('1000') >= 0, '理由に上限が書かれていない');
});

/* ⑤ 数量×単価から金額を作る ------------------------------------------ */
T('★数量×単価の丸めも会社の設定に従い、行の金額＝紙に出る数字と一致する', () => {
  const L = [{ name: '作業', qty: 1.5, price: 3333, rate: STD }]; // 4999.5円
  eq(TAX.compute({ lines: L, taxMode: 'exclusive', rounding: 'floor' }).lines[0].amount, 4999, '切捨て');
  eq(TAX.compute({ lines: L, taxMode: 'exclusive', rounding: 'ceil' }).lines[0].amount, 5000, '切上げ');
  eq(TAX.compute({ lines: L, taxMode: 'exclusive', rounding: 'round' }).lines[0].amount, 5000, '四捨五入');
});

T('★金額を直接打った行は、その額をそのまま使う（勝手に作り直さない）', () => {
  const r = TAX.compute({ lines: [{ name: '一式', amount: 12345, rate: STD }], taxMode: 'exclusive', rounding: 'floor' });
  eq(r.lines[0].amount, 12345);
});

T('★行の税額は「参考」として返るが、合計はそこから作らない', () => {
  const lines = [{ name: 'a', amount: 105, rate: STD }, { name: 'b', amount: 105, rate: STD }, { name: 'c', amount: 105, rate: STD }];
  const r = TAX.compute({ lines, taxMode: 'exclusive', rounding: 'floor' });
  const sumOfRefs = r.lines.reduce((s, x) => s + x.taxRef, 0);
  eq(sumOfRefs, 30, '参考の合計（＝法律が認めない額）');
  eq(r.taxTotal, 31, '本物の税額');
  ok(r.taxTotal !== sumOfRefs, '参考の合計と本物が同じ＝行ごとに丸めている疑い');
});

/* ⑥ 全パターンの網羅と矛盾ゼロ ---------------------------------------- */
T('★網羅：金額×税率×内外×丸め3種を全部流して 税抜+消費税=税込 が必ず一致・NaNゼロ', () => {
  const amounts = [0, 1, 2, 3, 5, 7, 8, 10, 11, 27, 54, 99, 100, 105, 108, 110, 111, 500, 999, 1000,
    1080, 1100, 5555, 12345, 100000, 999999, -1, -11, -105, -1100];
  const rates = [STD, RED, 0];
  let n = 0;
  for (const mode of ['inclusive', 'exclusive']) {
    for (const rd of ['floor', 'ceil', 'round']) {
      for (const a of amounts) {
        for (const rt of rates) {
          for (const a2 of [0, 1, 1080, -1]) {
            const r = TAX.compute({
              lines: [{ name: 'x', amount: a, rate: rt }, { name: 'y', amount: a2, rate: rt === 0 ? STD : 0 }],
              taxMode: mode, rounding: rd,
            });
            n++;
            if (!r.ok) throw new Error('通らない組合せ: ' + [mode, rd, a, rt, a2].join('/') + ' — ' + r.errors.join(','));
            for (const v of [r.subtotal, r.taxTotal, r.grandTotal]) {
              if (!Number.isFinite(v)) throw new Error('NaN/Infinity: ' + [mode, rd, a, rt, a2].join('/'));
              if (!Number.isInteger(v)) throw new Error('円未満が残っている: ' + v + ' @ ' + [mode, rd, a, rt, a2].join('/'));
            }
            if (r.subtotal + r.taxTotal !== r.grandTotal) {
              throw new Error('税抜+消費税≠税込: ' + [r.subtotal, r.taxTotal, r.grandTotal].join('/') + ' @ ' + [mode, rd, a, rt, a2].join('/'));
            }
            const byRateTax = r.byRate.reduce((s, x) => s + x.tax, 0);
            if (byRateTax !== r.taxTotal) throw new Error('区分の税の合計≠消費税');
          }
        }
      }
    }
  }
  if (n < 2000) throw new Error('組合せが少なすぎる（検査が空振り）: ' + n);
  console.log('     実測: ' + n + '通りを流して矛盾0件');
});

T('★内税は税込合計が入力額と1円もずれない（割戻しの誤差が出ない）', () => {
  for (let v = 1; v <= 5000; v++) {
    const r = TAX.compute({ lines: [{ name: 'x', amount: v, rate: STD }], taxMode: 'inclusive', rounding: 'floor' });
    if (r.grandTotal !== v) throw new Error('税込 ' + v + ' が ' + r.grandTotal + ' になった');
  }
});

/* ── ★非課税★（家賃・保険・切手）─────────────────────────────────
   ★「非課税」と「不課税（対象外）」は別物★。
     非課税 … 消費税の性質になじまない/政策的に非課税（住宅の家賃・保険料・切手・印紙）
     不課税 … そもそも取引でない（立替金・給与・寄付）
   紙の区分表で分けて出す必要があるので、集計も分ける。
   ★足すのは「区分の種類」であって「率」ではない★（率の一覧 shouhizei-ritsu.js は触らない）。 */
T('★非課税と対象外を別々に集計する（同じ0%でも混ぜない）', () => {
  const r = TAX.compute({
    lines: [
      { name: '事務所家賃', amount: 100000, rate: STD },
      { name: '住宅家賃', amount: 80000, rate: 0, nontax: true },
      { name: '立替金', amount: 5000, rate: 0 },
    ],
    taxMode: 'exclusive', rounding: 'floor',
  });
  ok(r.ok, r.errors.join(','));
  eq(r.exempt.base, 5000, '対象外（立替）');
  eq(r.nontaxable.base, 80000, '非課税（住宅家賃）');
  eq(r.subtotal, 185000, '小計は3つとも入る');
  eq(r.taxTotal, 10000, '非課税・対象外に消費税は付かない');
  eq(r.grandTotal, 195000);
});

T('★非課税だけの請求書（家賃だけ）でも成り立つ', () => {
  const r = TAX.compute({
    lines: [{ name: '住宅家賃 9月分', amount: 80000, rate: 0, nontax: true }],
    taxMode: 'exclusive', rounding: 'floor',
  });
  ok(r.ok);
  eq(r.nontaxable.base, 80000);
  eq(r.exempt.base, 0, '対象外に混ざっている');
  eq(r.taxTotal, 0);
  eq(r.grandTotal, 80000);
  eq(r.byRate.length, 0, '税率の区分は出ない');
});

T('★非課税の印は 0% の行にだけ効く（税率のある行に付いても税は消えない）', () => {
  const r = TAX.compute({
    lines: [{ name: 'あ', amount: 10000, rate: STD, nontax: true }],
    taxMode: 'exclusive', rounding: 'floor',
  });
  ok(r.ok);
  eq(r.taxTotal, 1000, '★税率のある行の税が消えた★');
  eq(r.nontaxable.base, 0, '税率のある行が非課税に入った');
});

T('★非課税は行にそのまま持って出る（紙で印を出せる）', () => {
  const r = TAX.compute({
    lines: [{ name: '住宅家賃', amount: 80000, rate: 0, nontax: true }, { name: '立替', amount: 100, rate: 0 }],
    taxMode: 'exclusive', rounding: 'floor',
  });
  eq(r.lines[0].nontax, true);
  eq(!!r.lines[1].nontax, false);
});

T('★網羅：非課税を混ぜても 税抜+消費税=税込 が必ず一致・NaNゼロ', () => {
  let n = 0;
  for (const mode of ['inclusive', 'exclusive']) {
    for (const rd of ['floor', 'ceil', 'round']) {
      for (const a of [0, 1, 105, 80000, -1000]) {
        const r = TAX.compute({
          lines: [
            { name: 'x', amount: 12345, rate: STD },
            { name: 'y', amount: a, rate: 0, nontax: true },
            { name: 'z', amount: 500, rate: 0 },
          ],
          taxMode: mode, rounding: rd,
        });
        n++;
        if (!r.ok) throw new Error('通らない: ' + r.errors.join(','));
        if (r.subtotal + r.taxTotal !== r.grandTotal) throw new Error('税抜+消費税≠税込');
        if (r.nontaxable.base !== a) throw new Error('非課税の集計がずれた: ' + r.nontaxable.base);
        if (r.exempt.base !== 500) throw new Error('対象外の集計がずれた: ' + r.exempt.base);
        for (const v of [r.subtotal, r.taxTotal, r.grandTotal, r.nontaxable.base, r.exempt.base]) {
          if (!Number.isFinite(v)) throw new Error('NaN');
        }
      }
    }
  }
  if (n < 25) throw new Error('組合せが少なすぎる（検査が空振り）: ' + n);
  console.log('     実測: ' + n + '通りで矛盾0件');
});


/* ── ★恒等式④ 行ごとの税額の合計 ＝ 税率ごとに1回 端数処理した税額★ ────────
   国税庁 インボイスQ&A 問57（確認日 2026-08-15）
     「一の適格請求書につき、★税率ごとに1回の端数処理★を行う」
     「★個々の商品ごとに…端数処理を行い、その合計額を消費税額等として記載することは
       認められません★」
   ＝★行ごとの税額を紙に出してもよいが、足したら 税率ごとに1回 処理した額に一致させる★
   （うちの実物32枚は行ごとの税額の列を持つが、たまたま端数が出ていないだけ） */
T('★★行ごとの税額を足すと、税率ごとに1回 端数処理した額に必ず一致する（端数が出る実数で）★★', () => {
  // ★手計算★ 税込1,005×3＝3,015 → 税 = floor(3015×10/110) = floor(274.09) = 274
  //           行ごとに丸めると floor(1005×10/110)=91 ×3 = 273 ＝★1円 足りない★
  const r = TAX.compute({
    lines: [1, 2, 3].map((i) => ({ name: 'x' + i, amount: 1005, rate: STD })),
    taxMode: 'inclusive', rounding: 'floor',
  });
  ok(r.ok, r.errors.join('/'));
  eq(r.taxTotal, 274, '税率ごとに1回 処理した額');
  eq(r.lines.reduce((a, l) => a + l.taxRef, 0), 273, '行ごとに丸めただけだと1円 足りない（前提の確認）');
  eq(r.lines.reduce((a, l) => a + l.tax, 0), 274, '★行ごとの税額を足すと合わない＝紙の中で辻褄が合わない★');
  eq(JSON.stringify(r.lines.map((l) => l.tax)), JSON.stringify([91, 91, 92]), '端数の寄せ先が最後の行でない');
  eq(r.spread.length, 1, '★寄せたのに記録が無い（黙って寄せている）★');
  eq(r.spread[0].residual, 1);
  eq(r.spread[0].line, 3, '寄せた行が最後でない');
});

T('★8%と10%が混ざる紙は、税率ごとに1回ずつ寄せる（1回にまとめない）', () => {
  const r = TAX.compute({
    lines: [
      { name: 'a', amount: 1005, rate: STD }, { name: 'b', amount: 1005, rate: STD }, { name: 'c', amount: 1005, rate: STD },
      { name: 'd', amount: 1005, rate: RED }, { name: 'e', amount: 1005, rate: RED }, { name: 'f', amount: 1005, rate: RED },
    ],
    taxMode: 'inclusive', rounding: 'floor',
  });
  ok(r.ok, r.errors.join('/'));
  const std = r.byRate.filter((b) => b.pct === STD)[0], red = r.byRate.filter((b) => b.pct === RED)[0];
  ok(std && red, '税率ごとに分かれていない');
  eq(r.taxTotal, std.tax + red.tax, '合計が税率ごとの和でない');
  for (const b of [std, red]) {
    const sum = r.lines.filter((l) => l.rate === b.pct).reduce((a, l) => a + l.tax, 0);
    eq(sum, b.tax, b.pct + '% の行ごとの税額の合計が、その税率の税額と違う');
  }
  ok(r.spread.length >= 1, '端数が出ているのに寄せた記録が無い');
  eq(r.subtotal + r.taxTotal, r.grandTotal, '恒等式① 合計＝小計＋消費税');
});

/* ★恒等式③ 税抜 ＋ 税額 ＝ 入れた税込★（案C＝税込から割り戻す道・実物の順序） */
T('★★税込で入れたら、税抜＋税額 が 入れた税込と1円もずれない★★', () => {
  for (const gross of [670000, 132000, 38500, 1, 999999, 52800]) {
    const r = TAX.compute({ lines: [{ name: '一式', amount: gross, rate: STD }], taxMode: 'inclusive', rounding: 'floor' });
    ok(r.ok, gross + ': ' + r.errors.join('/'));
    eq(r.subtotal + r.taxTotal, gross, '★' + gross + ' を入れたのに 税抜＋税額 が違う★');
    eq(r.grandTotal, gross, '★入れた税込と合計が違う★');
  }
});

T('★値引き行（明細の中のマイナス）は、課税の対象も税額も一緒に減る', () => {
  /* ★実物★ ちから「※出精値引 −4,110」は明細の中＝税も減る。
     実物の税は −410 と ★手打ち★（正しくは −411）＝★手で曲げた数は再現しない★。
     ここでは ★正しい計算★ を固定する。 */
  const r = TAX.compute({
    lines: [{ name: '本体', amount: 402000, rate: STD }, { name: '※出精値引', amount: -4110, rate: STD }],
    taxMode: 'exclusive', rounding: 'floor',
  });
  ok(r.ok, r.errors.join('/'));
  eq(r.subtotal, 397890, '値引きが小計に効いていない');
  eq(r.taxTotal, 39789, '値引きが税額に効いていない');
  eq(r.lines[1].tax, -411, '値引き行の税額（★−4,110×10%＝−411★）');
  eq(r.subtotal + r.taxTotal, r.grandTotal);
});

/* ★1円一致（実物2枚）★ ENEOS＝標準・単価なし・行ごとの税額 */
T('★★ENEOS の実物と1円も違わない（35,000 ＋ 3,500 ＝ 38,500）★★', () => {
  const r = TAX.compute({
    lines: [
      { name: 'エアコン取替', qty: 1, unit: '式', amount: 20000, rate: STD, memo: '石井町　岡田加代子　邸' },
      { name: 'エアコン取替', qty: 1, unit: '式', amount: 15000, rate: STD, memo: '株式会社朝蔵' },
    ],
    taxMode: 'exclusive', rounding: 'floor',
  });
  ok(r.ok, r.errors.join('/'));
  eq(r.subtotal, 35000, '小計');
  eq(r.taxTotal, 3500, '消費税');
  eq(r.grandTotal, 38500, '合計');
  // ★実物の =E12*0.1 / =E13*0.1 と同じ数が 行ごとの税額に出る★
  eq(JSON.stringify(r.lines.map((l) => l.tax)), JSON.stringify([2000, 1500]), '行ごとの税額が実物と違う');
  eq(r.spread.length, 0, '端数が出ないはずなのに寄せている');
});

/* ★行の消費税をマイナスにしない★（司さん 2026-08-17「検算は 描いた文字を1行ずつ足せ」で発見）
   切り上げ(ceil)だと 行ごとの和が 税率ごとの税額を ★上回る★ので、端数は ★マイナス★。
   それを最後の1行だけに押し付けると ★その行の税額がマイナスのまま紙に出る★。
   ★見本を1つ選んで測らない★（司さん 2026-08-17）
     ＝行数×区分×丸め方×税込税抜×単価の並び を ★全部 測って 何通り測ったかを出す★。 */
T('★★どの紙でも 行の消費税がマイナスにならない／足すと必ず税額に一致する★★', () => {
  const prices = [19000, 1900, 333, 1, 7, 99991, 12345, 2, 11];
  let pat = 0, spreadPapers = 0;
  const neg = [], mism = [], orphan = [];
  for (const rows of [1, 2, 3, 5, 9, 17, 26, 40, 60, 100]) {
    for (const kubun of [1, 2, 3, 4]) {
      for (const rounding of ['floor', 'round', 'ceil']) {
        for (const taxMode of ['exclusive', 'inclusive']) {
          for (const pi of [0, 1, 2, 3, 4, 5, 6]) {
            const lines = [];
            if (kubun >= 2) lines.push({ name: '弁当', qty: 3, unit: '個', price: 597, rate: RED });
            if (kubun >= 3) lines.push({ name: '駐車場', qty: 1, unit: '式', price: 30001, rate: 0, nontax: true });
            if (kubun >= 4) lines.push({ name: '立替', qty: 1, unit: '式', price: 5003, rate: 0 });
            for (let i = lines.length; i < rows; i++) {
              lines.push({ name: '工事 ' + (i + 1), qty: 3, unit: '人', price: prices[(i + pi) % prices.length], rate: STD });
            }
            const r = TAX.compute({ lines, taxMode, rounding });
            if (!r.ok) continue;
            pat++;
            const tag = rows + '行/' + kubun + '区分/' + rounding + '/' + taxMode + '/p' + pi;
            const bad = r.lines.filter((l) => Number(l.tax) < 0);
            if (bad.length) neg.push(tag + ' → ' + bad.map((l) => l.name + ' ' + l.tax + '円').join(','));
            const sum = r.lines.reduce((a, l) => a + (Number(l.tax) || 0), 0);
            if (sum !== r.taxTotal) mism.push(tag + ' 行の和 ' + sum + ' ≠ 税額 ' + r.taxTotal);
            if ((r.spread || []).some((x) => x.line === null)) orphan.push(tag);
            if ((r.spread || []).length) spreadPapers++;
          }
        }
      }
    }
  }
  console.log('      ★測った通り数 ' + pat + '★（うち端数を寄せた紙 ' + spreadPapers + '通り）');
  ok(pat >= 1000, '★測った数が少なすぎる＝見本を選んで測っている★ ' + pat);
  ok(spreadPapers > 0, '★端数を1回も寄せていない＝この検査が何も見ていない★');
  eq(neg.length, 0, '★行の消費税がマイナスで紙に出る★ ' + neg.slice(0, 4).join(' / '));
  eq(mism.length, 0, '★行を足しても税額に合わない＝紙の中で辻褄が崩れる★ ' + mism.slice(0, 4).join(' / '));
  eq(orphan.length, 0, '★寄せ先が無くて端数が余った★ ' + orphan.slice(0, 4).join(' , '));
});

T('★端数は「引き受けられる行」までさかのぼって分けて寄せる（1行に押し付けない）', () => {
  /* ★実測で出た形★＝最後の行の税が1円しかないのに −3円 を寄せようとして ★−2円★ になった。 */
  const r = TAX.compute({
    lines: [
      { name: '大', qty: 3, unit: '人', price: 99991, rate: STD },
      { name: '小1', qty: 3, unit: '人', price: 2, rate: STD },
      { name: '小2', qty: 3, unit: '人', price: 11, rate: STD },
    ],
    taxMode: 'exclusive', rounding: 'ceil',
  });
  ok(r.ok, r.errors.join('/'));
  ok(r.lines.every((l) => l.tax >= 0), '★マイナスの税額が残っている★ ' + JSON.stringify(r.lines.map((l) => l.tax)));
  eq(r.lines.reduce((a, l) => a + l.tax, 0), r.taxTotal, '足すと税額に合わない');
  ok(r.spread.length >= 1, '★寄せたのに記録が無い（黙って寄せている）★');
  ok(r.spread.every((x) => x.line !== null), '寄せ先が無い記録が残っている');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
