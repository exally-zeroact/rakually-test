/* calc.test.js — 給与計算ラッパ＋エンジン検証（監査指摘の回帰込み） */
'use strict';
var PayslipCalc = require('../lib/calc.js');
var PayrollCalc = require('../lib/payroll-calc.js');
var Densan = require('../lib/shotokuzei-densan.js');
var SHAKAIHOKEN_HYO = require('../lib/shakaihoken-hyo.js');

/* ---- 無効入力ガード(対立監査L1・2026-07-05) ---- */
T('扶養マイナスは0にクランプ(甲欄・負値で税額過大化しない)', function () {
  function emp(fuyou){ return { shikyu:[{label:'基本給',value:300000}], birthYmd:'1990-01-01', payYm:'2026-06', fuyou:fuyou, taxClass:'甲', healthRate:0.04955, hyojunBase:300000 }; }
  var t0 = PayslipCalc.computePayslip(emp(0)).incomeTax;
  var tNeg = PayslipCalc.computePayslip(emp(-3)).incomeTax;
  eq(tNeg, t0); // 扶養-3 は 扶養0 と同じ(負値で税額が増えない)
});

/* ---- 公式「電算機計算の特例」例(国税庁PDF)・年度自動選択 ---- */
// 令和8年分(denshi_01) 公式例：基礎控除引上げで令和7より低い
T('特例R8 公式例1: A=175,000/扶養2 → 210円', function () { eq(Densan.calc(175000, 2, { year: 2026 }), 210); });
T('特例R8 公式例2: A=446,000/扶養8 → 940円', function () { eq(Densan.calc(446000, 8, { year: 2026 }), 940); });
T('特例R8 公式例3: A=775,200/扶養3 → 59,470円', function () { eq(Densan.calc(775200, 3, { year: 2026 }), 59470); });
T('既定(opts無し)は令和8扱い', function () { eq(Densan.calc(175000, 2), 210); });
// 令和7年分(denshi_10) 公式例：year=2025で従来値
T('特例R7 公式例: A=175,000/扶養2→640・446,000/8→1,370・775,200/3→61,170', function () {
  eq(Densan.calc(175000, 2, { year: 2025 }), 640);
  eq(Densan.calc(446000, 8, { year: 2025 }), 1370);
  eq(Densan.calc(775200, 3, { year: 2025 }), 61170);
});
// 乙欄(令和8・denshi_02)
T('乙欄R8: A<105,000は3.063%(100,000→3,063)', function () { eq(Densan.calcOtsu(100000), 3063); });
T('乙欄R8: 740,001〜は259,200+超過40.84% / 甲より高い', function () {
  eq(Densan.calcOtsu(800000), Math.floor(259200 + (800000 - 740000) * 0.4084));
  ok(Densan.calcOtsu(300000) > Densan.calc(300000, 0, { year: 2026 }), '乙>甲(扶養0)');
});
// 公式(denshi_02)明示アンカー値でロック。★一次情報リテラル(自己参照でない)★
T('乙欄R8: A=1,710,000は655,400(公式注3が明記)', function () { eq(Densan.calcOtsu(1710000), 655400); });
T('乙欄R8: A=740,000の計算基準額法は259,200(740,001〜帯の起点と連続)', function () {
  eq(Densan.calcOtsu(740000), 259200);                       // 計算基準額=740,000特例→259,200
  eq(Densan.calcOtsu(740001), Math.floor(259200 + 1 * 0.4084)); // 隣接帯の起点も259,200で連続
});
T('calcByClass: otsu→乙・既定→甲', function () {
  eq(Densan.calcByClass(100000, 0, 'otsu'), 3063);
  eq(Densan.calcByClass(175000, 2, 'ko', { year: 2026 }), 210);
});
/* ★P0-① 乙欄は扶養を加味しない(甲欄の扶養数を渡しても税額不変)。従たる申告書ありの時だけ1,610円/人控除 */
T('乙欄は扶養控除を加味しない(扶養数を渡しても税額不変)', function () {
  var base = Densan.calcByClass(300000, 0, 'otsu', { year: 2026 });
  eq(Densan.calcByClass(300000, 3, 'otsu', { year: 2026 }), base, '扶養3でも乙税額は不変');
  eq(Densan.calcByClass(300000, 1, 'otsu', { year: 2026 }), base, '扶養1(既定)でも不変');
  // 従たる給与の扶養控除等申告書ありのケースのみ 1,610×人数
  eq(Densan.calcByClass(300000, 0, 'otsu', { year: 2026, jyuubetsuFuyou: 2 }), base - 1610 * 2, '従たる申告書ありなら控除');
});
T('非課税 自動判定: 出張旅費は非課税(課税対象から除外)', function () {
  var nt = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 200000 }, { label: '出張旅費', value: 30000 }], payYm: '2026-06' });
  var tx = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 200000 }, { label: '役職手当', value: 30000 }], payYm: '2026-06' });
  ok(nt.kazei < tx.kazei, '出張旅費分だけ課税対象が小さい');
});

/* ---- 社保（標準報酬分離・50銭ルール） ---- */
T('アンカー 支給292,931/扶養1/介護対象: 社保46,311(健14865 厚27450 介2385 雇1611)', function () {
  var r = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 292931 }], birthYmd: '1980-05-15', payYm: '2025-06', fuyou: 1 });
  eq(r.si.health, 14865); eq(r.si.pension, 27450); eq(r.si.kaigo, 2385); eq(r.si.employ, 1611); eq(r.si.total, 46311);
  eq(r.kazei, 246620, 'A=社保控除後');
  eq(r.incomeTax, 4810, '令和7 特例での所得税');
  eq(r.net, 241810); eq(r.kojoTotal, 51121);
});

T('不変条件: net=支給-控除, 控除合計=Σ控除', function () {
  var r = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 250000 }], birthYmd: '1990-01-01', payYm: '2026-06', fuyou: 0 });
  var s = r.kojo.reduce(function (a, x) { return a + x.value; }, 0);
  eq(r.kojoTotal, s); eq(r.net, r.shikyuTotal - r.kojoTotal);
});

/* ---- C-1: 高給でも所得税が0にならない（旧バグ回帰） ---- */
T('C-1 月給45万・独身 → 所得税>0（旧:課税302,000超で0）', function () {
  var r = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 450000 }], birthYmd: '1990-01-01', payYm: '2025-06', fuyou: 0 });
  eq(r.kazei, 385463, 'A');
  ok(r.incomeTax > 0, '所得税>0'); eq(r.incomeTax, 15360, '令和7 特例での税額');
});
T('C-1b 課税が非常に高くても税額が出る(¥150万課税)', function () { ok(Densan.calc(1500000, 0) > 0); });

/* ---- H-1: 50銭ルール（.5は切捨て） ---- */
T('H-1 介護 標準110,000×0.00795=874.5 → 874(切捨), 875でない', function () {
  var si = PayrollCalc.calcSocialInsurance({ payTotal: 110000, hasKaigo: true });
  eq(si.hyojunHealth, 110000); eq(si.kaigo, 874);
});

/* ---- 再監査NEW-BUG: 50銭ちょうどのFP誤差で切上げない ---- */
T('han50 FP: 健保0.04855×650,000=31,557.5 → 31,557(切捨), 31,558でない', function () {
  eq(PayrollCalc.calcSocialInsurance({ payTotal: 650000, healthRate: 0.04855 }).health, 31557);
});
T('han50 FP: 介護0.00795×1,030,000=8,188.5 → 8,188', function () {
  // payTotal 1,030,000 → 健保標準1,030,000(>=1,005,000,<1,055,000)
  eq(SHAKAIHOKEN_HYO ? SHAKAIHOKEN_HYO.han50(8188.5) : 8188, 8188);
});
/* ★50銭1厘以上は 切り上げ★（2026-11-06 実測で 直した）
     前の han50 は 銭に 丸めてから 見ていた＝端数 0.5010〜0.5049 円が 0.50 に なって 切り捨て。
     雇用保険料は 実際の 賃金×率＝端数が 厘より 下まで 出る（例 273円×0.55%＝1.5015 → 前は 1 円・正しくは 2 円）。
     数えた＝賃金 1〜100万円×率 0.5/0.55/0.6/0.65/0.7% の 500万組中 16,000 組。
     ★端数 0.5001〜0.5009 円（厘より 下）は 今まで 通り 切り捨て★（厚労省の「50銭以下は切り捨て、50銭1厘以上は切り上げ」で 決まらない 所＝決めを 変えない）。
     見る 物＝整数で 出した 答え（端数を 1e4 の 整数で 持つ）と 全部 同じか。 */
T('han50: 端数 0.5010〜0.5049 円は 切り上げ／0.5000 以下は 切り捨て／0.5001〜0.5009 は 今まで 通り 切り捨て（雇用保険の 率で 全部）', function () {
  var H = SHAKAIHOKEN_HYO;
  eq(H.han50(273 * 0.0055), 2, '273円×0.55%＝1.5015');
  eq(H.han50(182 * 0.0055), 1, '182円×0.55%＝1.001');
  eq(H.han50(91 * 0.0055), 0, '91円×0.55%＝0.5005＝今まで 通り 切り捨て');
  eq(H.han50(31557.5), 31557, '50銭 ちょうどは 切り捨て');
  var SZ50 = require('../lib/shoyo-zei.js').han50;   /* 賞与の lib は 自分の 写しを 持つ＝同じ 答えか も 見る */
  var kumi = 0, chigau = 0, rei = '';
  [50, 55, 60, 65, 70, 75].forEach(function (q) {
    for (var w = 1; w <= 400000; w++) {
      var a = w * q, yen = Math.floor(a / 10000), r = a % 10000;
      var want = (r >= 5010) ? yen + 1 : yen;   /* 0.5010 以上は 切り上げ・それ未満（0.5001〜0.5009 含む）は 切り捨て */
      [H.han50.bind(H), SZ50].forEach(function (fn, j) {
        kumi++; var got = fn(w * q / 10000);
        if (got !== want) { chigau++; if (!rei) rei = (j ? '賞与の 写し ' : '') + w + '円×' + (q / 100) + '%＝' + (w * q / 10000) + ' → ' + got + '（正 ' + want + '）'; }
      });
    }
  });
  eq(chigau, 0, '整数の 答えと 違う 組（' + kumi + '組中）例 ' + rei);
});

/* ---- 通勤以外の非課税(出張旅費等)は限度なく全額非課税 ---- */
T('非課税の出張旅費20万は全額非課税(15万で切られない)', function () {
  var r = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 300000 }, { label: '出張旅費', value: 200000, hikazei: true }], birthYmd: '1990-01-01', payYm: '2026-06', fuyou: 0 });
  eq(r.nonTaxable, 200000);
});
/* ★P0-③ 実費弁償(出張/旅費/宿泊/日当の非課税)は社保・雇用保険の基礎から除外・通勤は含む */
T('実費弁償(出張旅費)は雇用保険/社保の基礎から除外・通勤は含む', function () {
  var jihi = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 300000 }, { label: '出張旅費', value: 60000, hikazei: true }], birthYmd: '1990-01-01', payYm: '2026-06', fuyou: 0 });
  var kazei = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 300000 }, { label: '役職手当', value: 60000 }], birthYmd: '1990-01-01', payYm: '2026-06', fuyou: 0 });
  var tsukin = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 300000 }, { label: '通勤手当', value: 60000, hikazei: true }], birthYmd: '1990-01-01', payYm: '2026-06', fuyou: 0 });
  ok(jihi.si.employ < kazei.si.employ, '旅費は雇用保険基礎から除外(30万ベース): ' + jihi.si.employ + ' vs ' + kazei.si.employ);
  eq(tsukin.si.employ, kazei.si.employ, '通勤は雇用保険基礎に含む(36万ベース)');
  // 課税の日当(hikazei=false)は報酬=基礎に含む
  var kazeiNitto = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 300000 }, { label: '日当', value: 60000, hikazei: false }], birthYmd: '1990-01-01', payYm: '2026-06', fuyou: 0 });
  eq(kazeiNitto.si.employ, kazei.si.employ, '課税の日当は基礎に含む');
});

/* ---- M-3: 健保上限は1,390,000・厚年は650,000 ---- */
T('M-3 支給80万: 健保標準=790,000 / 厚年標準=650,000（健保は上限が高い）', function () {
  var si = PayrollCalc.calcSocialInsurance({ payTotal: 800000, hasKaigo: false });
  eq(si.hyojunHealth, 790000); eq(si.hyojunPension, 650000);
  ok(si.health > Math.round(650000 * 0.04955) - 2, '健保は790,000ベースで650,000より高い');
});
T('M-3b 超高給150万: 健保標準=1,390,000(上限) / 厚年=650,000', function () {
  var si = PayrollCalc.calcSocialInsurance({ payTotal: 1500000, hasKaigo: false });
  eq(si.hyojunHealth, 1390000); eq(si.hyojunPension, 650000);
});

/* ---- M-1: 通勤手当 非課税限度(15万) 超過分は課税 ---- */
T('M-1 通勤20万(非課税)→非課税は15万まで・超過5万は課税', function () {
  var r = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 300000 }, { label: '通勤手当', value: 200000, hikazei: true }], birthYmd: '1990-01-01', payYm: '2026-06', fuyou: 0 });
  eq(r.nonTaxable, 150000, '非課税は限度まで');
});

/* ---- 通勤 マイカー距離別 非課税(nonTaxLimit) ---- */
T('通勤マイカー10km(非課税7,300)・支給10,000→非課税7,300・超過2,700課税', function () {
  var r = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 300000 }, { label: '通勤手当', value: 10000, hikazei: true, nonTaxLimit: 7300 }], birthYmd: '1990-01-01', payYm: '2026-06', fuyou: 0 });
  eq(r.nonTaxable, 7300);
});

/* ---- M-4: 差引マイナスは警告フラグ ---- */
T('M-4 控除過大で差引マイナス → netNegative=true', function () {
  var r = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 100000 }], birthYmd: '1990-01-01', payYm: '2026-06', fuyou: 0, extraKojo: [{ label: '社宅費', value: 200000 }] });
  ok(r.net < 0); eq(r.netNegative, true);
});

/* ---- M-2: 雇用保険は業種率を渡せば反映（総支給ベース） ---- */
T('M-2 雇用保険率0.0065(建設)を渡すと反映', function () {
  var a = PayrollCalc.calcSocialInsurance({ payTotal: 600000 });
  var b = PayrollCalc.calcSocialInsurance({ payTotal: 600000, employRate: 0.0065 });
  eq(a.employ, 3300); eq(b.employ, 3900);
});

/* ---- L-1/8: 介護 40歳到達 1日生まれの境界 ---- */
T('介護境界 1986-06-01生: 2026-05は対象/2026-04は非対象', function () {
  eq(PayrollCalc.isKaigoTarget('1986-06-01', '2026-05'), true);
  eq(PayrollCalc.isKaigoTarget('1986-06-01', '2026-04'), false);
});

/* ---- ⑤ 年少者(満18歳未満)判定 isMinor(労基60/61条) ---- */
T('isMinor(保護判定): 対象月初日時点で18歳未満なら年少者(誕生月の一部が年少者でも保護)', function () {
  eq(PayrollCalc.isMinor('2008-06-15', '2026-05'), true);   // 前月=17歳
  eq(PayrollCalc.isMinor('2008-06-15', '2026-06'), true);   // 誕生月=初日は17歳(15日に18歳)=保護対象(安全側)
  eq(PayrollCalc.isMinor('2008-06-15', '2026-07'), false);  // 翌月=18歳
  eq(PayrollCalc.isMinor('2008-06-01', '2026-06'), false);  // 1日生=誕生月初日で満18=過剰警告しない
  eq(PayrollCalc.isMinor('2008-06-01', '2026-05'), true);   // 1日生の前月=17歳
  eq(PayrollCalc.isMinor('2010-01-15', '2026-06'), true);   // 16歳=年少者
  eq(PayrollCalc.isMinor('1990-01-01', '2026-06'), false);  // 成人
  eq(PayrollCalc.isMinor('', '2026-06'), false);            // 生年月日不明=安全側でfalse
  eq(PayrollCalc.isMinor('2010-01-15', ''), false);         // 月不明=false
});

/* ---- 標準報酬の決め方(社会保険) ---- */
T('shahoBase 定時: 支払基礎日数17日未満の月を除外して平均', function () {
  var r = PayslipCalc.shahoBase({ mode: 'teiji', months: [{ pay: 320000, days: 30 }, { pay: 340000, days: 30 }, { pay: 180000, days: 15 }] });
  eq(r.hoshu, 330000, '4・5月平均'); eq(r.months, 2); ok(r.excluded.indexOf(2) >= 0, '6月除外');
});
T('shahoBase 短時間しきい値15日', function () {
  var r = PayslipCalc.shahoBase({ mode: 'teiji', threshold: 15, months: [{ pay: 200000, days: 16 }, { pay: 200000, days: 15 }, { pay: 100000, days: 10 }] });
  eq(r.months, 2); eq(r.hoshu, 200000);
});
T('shahoBase 資格取得=見込み / 直接入力=その額', function () {
  eq(PayslipCalc.shahoBase({ mode: 'shutoku', mikomi: 300000 }).hoshu, 300000);
  eq(PayslipCalc.shahoBase({ mode: 'manual', value: 360000 }).hoshu, 360000);
});
T('shahoBase 未入力/全月除外 → undetermined=true・hoshu0', function () {
  eq(PayslipCalc.shahoBase({ mode: 'teiji', months: [{ pay: '', days: '30' }, { pay: '', days: '30' }, { pay: '', days: '30' }] }).undetermined, true);
  eq(PayslipCalc.shahoBase({ mode: 'teiji', months: [{ pay: 300000, days: 10 }, { pay: 300000, days: 12 }] }).hoshu, 0, '全月17日未満→平均0');
  eq(PayslipCalc.shahoBase({ mode: 'manual', value: 340000 }).undetermined, false);
});
T('直接入力→computePayslipまで標準報酬が届く', function () {
  var sb = PayslipCalc.shahoBase({ mode: 'manual', value: 360000 });
  var r = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 200000 }], birthYmd: '1990-01-01', payYm: '2026-06', fuyou: 0, hyojunBase: sb.hoshu });
  eq(r.si.hyojunHealth, 360000, '当月20万でも標準報酬36万で社保');
});
/* ★2026-09-03 に 2つ 直した★（指示役の裁定）
   ①★県を 書く（pref:'tokyo'）★＝前は 県を 書かず ★黙って 代用された 率★で 通っていた。
     ★この試験が 見たいのは「標準報酬で 決まる」事★＝率は 決め打ちに して ぶれさせない。
   ②★期待額 16,847 → 17,136★＝代用の 率を ★表 1か所★（令和8 東京 0.04925＋子育て支援金 0.00115＝0.0504）に
     揃えた為。★340,000 × 0.0504 = 17,136★。★お金の 決まりを 変えたのでは なく、
     古い既定（令7・支援金なし）が ここに 残っていた★。 */
T('hyojunBase固定: 社保は当月支給でなく標準報酬基礎で計算(残業でブレない)', function () {
  // 当月支給は残業で50万でも、確定した報酬月額34万で社保が決まる
  var r = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 500000 }], birthYmd: '1980-05-15', payYm: '2026-06', pref: 'tokyo', fuyou: 0, hyojunBase: 340000 });
  eq(r.si.hyojunHealth, 340000); eq(r.si.health, 17136); eq(r.si.pension, 31110); eq(r.si.kaigo, 2754); // 介護=令和8年度0.81%: 340000×0.0081
});

/* ---- 法定控除の従業員ごとオン/オフ（役員・非加入対応） ---- */
T('apply.employ=false → 雇用保険を引かない(役員等)', function () {
  var r = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 300000 }], birthYmd: '1980-05-15', payYm: '2026-06', fuyou: 0, apply: { employ: false } });
  ok(!r.kojo.some(function (k) { return k.label === '雇用保険'; }), '雇用保険なし');
  ok(r.kojo.some(function (k) { return k.label === '健康保険'; }), '健保は残る');
});
T('社保を全部オフ → 課税Aは社保控除なし(所得税が増える)', function () {
  var base = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 300000 }], birthYmd: '1990-01-01', payYm: '2026-06', fuyou: 0 });
  var off = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 300000 }], birthYmd: '1990-01-01', payYm: '2026-06', fuyou: 0, apply: { health: false, pension: false, employ: false } });
  ok(!off.kojo.some(function (k) { return /健康保険|厚生年金|雇用保険/.test(k.label); }), '社保3つ消える');
  ok(off.kazei > base.kazei, '社保控除なしで課税Aが増える');
  ok(off.incomeTax > base.incomeTax, '所得税が増える');
});
T('apply.incomeTax=false → 所得税0(明細に出さない)', function () {
  var r = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 450000 }], birthYmd: '1990-01-01', payYm: '2026-06', fuyou: 0, apply: { incomeTax: false } });
  ok(!r.kojo.some(function (k) { return k.label === '所得税'; }));
});

/* ---- 既存の健全性 ---- */
T('住民税を渡すと控除に住民税が入る', function () {
  var r = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 250000 }], birthYmd: '1990-01-01', payYm: '2026-06', fuyou: 0, residentTax: 12500 });
  ok(r.kojo.some(function (k) { return k.label === '住民税' && k.value === 12500; }));
});
T('40歳未満は介護保険なし', function () {
  var r = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 250000 }], birthYmd: '2000-01-01', payYm: '2026-06', fuyou: 0 });
  eq(r.hasKaigo, false); ok(!r.kojo.some(function (k) { return k.label === '介護保険'; }));
});
T('空入力でも例外なく数値', function () { var r = PayslipCalc.computePayslip({}); eq(typeof r.net, 'number'); eq(r.shikyuTotal, 0); });

/* ── 統合テスト(対立監査2026-06-28の配線漏れ回帰防止・computePayslip通し) ── */
T('乙欄配線: taxClass=otsu を computePayslip に渡すと乙欄(甲より高い源泉)で計算される', function () {
  var ko = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 300000 }], birthYmd: '1990-01-01', payYm: '2026-06', fuyou: 1, taxClass: 'ko' });
  var ot = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 300000 }], birthYmd: '1990-01-01', payYm: '2026-06', fuyou: 1, taxClass: 'otsu' });
  ok(ot.incomeTax > 0, '乙欄の所得税が計算される'); ok(ot.incomeTax > ko.incomeTax, '乙欄は甲欄より高い(' + ot.incomeTax + '>' + ko.incomeTax + ')');
});
T('無給休業(payTotal=0)でも標準報酬が確定していれば 健保/厚年 は継続徴収(介護休・病休)', function () {
  var r = PayslipCalc.computePayslip({ shikyu: [], birthYmd: '1980-01-01', payYm: '2026-06', hyojunBase: 300000, apply: {} });
  ok(r.si.health > 0, '健保は標準報酬ベースで継続'); ok(r.si.pension > 0, '厚年も継続');
  eq(r.si.employ, 0, '雇用保険は実支給0なので0');
});
T('産休育休は apply で社保オフ(=0)になる(免除・継続徴収と区別)', function () {
  var r = PayslipCalc.computePayslip({ shikyu: [], birthYmd: '1980-01-01', payYm: '2026-06', hyojunBase: 300000, apply: { health: false, pension: false, kaigo: false } });
  ok(!r.kojo.some(function (k) { return k.label === '健康保険' || k.label === '厚生年金'; }), '免除で控除に出ない');
});

/* 最低賃金テーブル(配線=index.htmlに読込・dead code解消の回帰防止) */
var Saitei = require('../lib/saitei-chingin.js');
var W2 = require('../lib/warimashi.js');
T('最低賃金: getChingin(tokyo)=1280 / 未知prefはnull', function () {
  /* ★2026-09-12 令和8年度へ更新（東京1226→1280・大阪1177→1231）★ */
  eq(Saitei.getChingin('tokyo'), 1280); eq(Saitei.getChingin('osaka'), 1231); eq(Saitei.getChingin('xxx'), null);
});
T('最低賃金チェック: 時給<最賃で割れ判定(warimashi.minWageOk)', function () {
  ok(W2 && W2.minWageOk(1100 * 160, 160 * 60, 1226) === false, '時給1100は東京1226を下回る=NG');
  ok(W2.minWageOk(1300 * 160, 160 * 60, 1226) === true, '時給1300はOK');
});

/* ---- ④ 36協定 時間外上限(労基36条) overtimeLimitLevel ---- */
T('残業上限: 45h以下=none / 45h超=over45 / 100h以上=over100', function () {
  eq(W2.overtimeLimitLevel(0), 'none');
  eq(W2.overtimeLimitLevel(45 * 60), 'none');           // ちょうど45hは原則内
  eq(W2.overtimeLimitLevel(45 * 60 + 1), 'over45');     // 45h超=特別条項が必要
  eq(W2.overtimeLimitLevel(80 * 60), 'over45');
  eq(W2.overtimeLimitLevel(100 * 60), 'over100');       // 時間外だけで100h以上
  eq(W2.overtimeLimitLevel(120 * 60), 'over100');
  eq(W2.overtimeLimitLevel(''), 'none');                // 空=0=none(誤警告しない)
});
T('残業上限: 単月100hは時間外＋法定休日の合計で判定(45hは時間外のみ)', function () {
  eq(W2.overtimeLimitLevel(90 * 60, 30 * 60), 'over100'); // 時間外90+休日30=120h≧100=over100
  eq(W2.overtimeLimitLevel(40 * 60, 65 * 60), 'over100'); // 時間外40+休日65=105h≧100(時間外単体は45未満でも合計で違反)
  eq(W2.overtimeLimitLevel(50 * 60, 0), 'over45');        // 時間外50>45・休日0=over45(原則超は時間外のみで判定)
  eq(W2.overtimeLimitLevel(40 * 60, 40 * 60), 'none');    // 時間外40(≤45)＋休日40=80<100=none
});
/* ★36協定 特別条項の複数月/年 上限(overtime36Check)★ */
var mo = function (otH, hdH) { return { otMin: otH * 60, holidayMin: (hdH || 0) * 60 }; };
T('36協定: 複数月平均80h超(時間外+休日)を検知', function () {
  // 直近3ヶ月 時間外85h(休日0)→平均85>80 → over80
  var r = W2.overtime36Check([mo(85), mo(85), mo(85)]);
  ok(r.over80 && Math.round(r.over80.avgMin / 60) === 85, 'over80(平均85h): ' + JSON.stringify(r.over80));
});
T('36協定: 時間外75h+休日10hで合計85h平均→複数月80h超(休日も算入)', function () {
  var r = W2.overtime36Check([mo(75, 10), mo(75, 10)]);
  ok(r.over80 && r.over80.months === 2, '2ヶ月平均85h: ' + JSON.stringify(r.over80));
});
T('36協定: 各月70h(平均70<80)は複数月違反なし', function () {
  eq(W2.overtime36Check([mo(70), mo(70), mo(70), mo(70)]).over80, null);
});
T('36協定: 年720h(時間外のみ)超を検知(休日は年720に含めない)', function () {
  // 12ヶ月×時間外61h=732h>720 → over720
  var many = []; for (var i = 0; i < 12; i++) many.push(mo(61));
  var r = W2.overtime36Check(many);
  ok(r.over720 && Math.round(r.over720.totalMin / 60) === 732, 'over720(732h): ' + JSON.stringify(r.over720));
  // 時間外60h×12=720ちょうどは超えない
  var many2 = []; for (var j = 0; j < 12; j++) many2.push(mo(60));
  eq(W2.overtime36Check(many2).over720, null);
});
T('36協定: 時間外45h超が年6回まで(7回目で違反=over45count>6)', function () {
  var arr = []; for (var i = 0; i < 7; i++) arr.push(mo(46)); for (var j = 0; j < 5; j++) arr.push(mo(30));
  eq(W2.overtime36Check(arr).over45count, 7);
  // 6回は違反でない(count=6)
  var arr6 = []; for (var k = 0; k < 6; k++) arr6.push(mo(46)); for (var l = 0; l < 6; l++) arr6.push(mo(30));
  eq(W2.overtime36Check(arr6).over45count, 6);
});
T('36協定: 空/1ヶ月は複数月・年とも違反なし(材料不足で誤検知しない)', function () {
  var r = W2.overtime36Check([mo(90)]); // 単月90(単月上限はovertimeLimitLevel側)・複数月/年は不足
  eq(r.over80, null); eq(r.over720, null); eq(r.over45count, 1);
  var e = W2.overtime36Check([]); eq(e.over80, null); eq(e.over720, null); eq(e.over45count, 0);
});

/* ★全角の 数字が 0 に なっていた（lib の num の 写し 14本）★（2026-11-06 叩きで 見つけた・直した）
     前は calc.js 等の num が 全角を 半角に しない＝支給・控除の 行「住宅手当 ２００００」が 総支給から 黙って 抜けた（総支給 300,000 正 320,000）・
     社保の 報酬月額「３０００００」が 読めず 当月の 支給で 計算・pay-rule／daily-pay は 全角を 消した。payroll-monthly.js の num と 同じく 全角を 読む。
     各 lib の num の 定義を 字から 取り出して 呼ぶ（写しが 増えても 1本ずつ 見る）。 */
T('lib の num: 全角の 数字・全角カンマ・読点を 読む（全部の 写しで ２０，０００→20000・半角は 前の まま）', function () {
  var fs = require('fs'), path = require('path'), dir = path.join(__dirname, '..', 'lib'), mita = 0, dame = [];
  fs.readdirSync(dir).filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) {
    var src = fs.readFileSync(path.join(dir, f), 'utf8');
    if (f === 'zengin.js') return; // 全銀（番号は 別の 試験）は 外す
    /* ★1ファイルの 中の 写しを 全部・`var num = function (v)` の 形も 拾う★（2026-11-06 ⑰の 叩きの 止め1＝
       前は `function num(v)` の 字の 1本目だけ＝payroll-calc.js の 関数の 中の 2本・payroll-monthly.js を 見ていなかった） */
    var re = /^[ \t]*(function num\s*\(v\)|var num = function\s*\(v\))[^\n]*$/mg, m;
    while ((m = re.exec(src))) {
      var line = m[0].replace(/\}\s*;?\s*\/\/[^\n]*$/, '}'); // 行末の 注を 外す
      if (/Number\(v\)/.test(line)) continue; // 型の 数だけを 受ける 物（ledger-agg 等）
      if (/PM\(\)\.num\(v\)/.test(line)) continue; // payroll-monthly の num へ 渡すだけ（写しでない＝payroll-warnings）
      mita++;
      var num = new Function(line + '; return num;')();
      [['２０，０００', 20000], ['２７、６００', 27600], ['８３７４１', 83741], ['1,234', 1234], ['300000', 300000], ['', 0], [null, 0]].forEach(function (c) {
        if (num(c[0]) !== c[1]) dame.push(f + ':' + (src.slice(0, m.index).split('\n').length) + ' ' + JSON.stringify(c[0]) + '→' + num(c[0]));
      });
    }
  });
  ok(mita >= 17, 'num の 写しを 見た 数 ' + mita);
  eq(dame.length, 0, '全角を 読まない ' + dame.join(' / '));
  var r = PayslipCalc.computePayslip({ shikyu: [{ label: '基本給', value: 300000 }, { label: '住宅手当', value: '２００００' }], kojo: [{ label: '旅行積立', value: '５０００' }], birthYmd: '1990-01-01', payYm: '2026-06', fuyou: 0, taxClass: '甲', healthRate: 0.04955, hyojunBase: 320000 });
  eq(r.shikyuTotal, 320000, '総支給に 全角の 手当');
});
/* ★支払基礎日数も 全角を 読む★（2026-11-06 ⑰の 叩きの 止め1）＝前は 勤怠の「出勤日数 ２０」で 給与は 20日・
   支払基礎日数は 0（月給の「欠勤 ３」は 控除は 3日・基礎日数は 暦日の 30）＝算定の 17日の 判定が ずれた。 */
T('支払基礎日数: 勤怠と 所定日数が 全角でも 半角と 同じ', function () {
  var PC = require('../lib/payroll-calc.js');
  var kt = function (o) { return Object.keys(o).map(function (k) { return { label: k, value: o[k] }; }); };
  eq(PC.calcPaymentDays({ payType: '時給', kintai: kt({ '出勤日数': '２０' }) }, '2026-06', ''), 20, '時給の 出勤 ２０');
  eq(PC.calcPaymentDays({ payType: '時給', kintai: kt({ '出勤日数': '20' }) }, '2026-06', ''), 20, '時給の 出勤 20（前の まま）');
  eq(PC.calcPaymentDays({ payType: '月給', scheduledDays: '２１', kintai: kt({ '欠勤日数': '３' }) }, '2026-06', ''),
     PC.calcPaymentDays({ payType: '月給', scheduledDays: '21', kintai: kt({ '欠勤日数': '3' }) }, '2026-06', ''), '月給の 欠勤 ３・所定 ２１');
  eq(PC.calcPaymentDays({ payType: '月給', scheduledDays: '21', kintai: kt({ '欠勤日数': '3' }) }, '2026-06', ''), 18, '所定21−欠勤3');
});

/* ★欠勤控除の 年間所定休日も 全角を 読む★（2026-11-06 ⑱の 叩きの 止め2＝額が 変わる 道を 押さえる）
   payroll-monthly.js は 年間所定休日を 字の まま calcKekkin へ 渡す。⑱ の 前は 全角「１０５」を 0 と 読み 既定の 120 に 戻っていた
   ＝月給 30万・欠勤1日で 控除 14,694（正しくは 105日の 13,846）。今は 入れた 日数どおり＝半角と 同じ 額。 */
T('欠勤控除: 従業員の 年間所定休日が 全角でも 半角と 同じ 額（１０５→105・前は 120 に 戻って 848円 多く 引いた）', function () {
  if (typeof global.PayrollCalc === 'undefined') global.PayrollCalc = require('../lib/payroll-calc.js');
  if (typeof global.Warimashi === 'undefined') { try { global.Warimashi = require('../lib/warimashi.js'); } catch (_) {} }
  var PMk = require('../lib/payroll-monthly.js');
  var kek = function (ah) {
    var e = { payType: '月給', base: '300000', shikyu: [{ label: '基本給', value: 300000 }], kojo: [], kintai: [{ label: '欠勤日数', value: '1' }], annualHolidays: ah, birthYmd: '1990-01-01', joinYmd: '2020-04-01', workStatus: 'normal' };
    var r = PMk.compute(e, { month: '2026-06', company: { annualHolidays: '120', dailyWorkH: '8', dailyWorkM: '0', prefecture: '東京都' } });
    var k = (r.shikyu || []).filter(function (x) { return /欠勤控除/.test(x.label); })[0];
    return { k: k && k.value, net: r.net };
  };
  var z = kek('１０５'), h = kek('105'), d = kek('120');
  eq(z.k, h.k, '全角 １０５ と 半角 105 の 欠勤控除'); eq(z.net, h.net, '手取り');
  ok(h.k !== d.k, '105 と 120 で 控除が 変わらない＝この 試験が 道を 見ていない（' + h.k + '/' + d.k + '）');
});
