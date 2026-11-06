/* taishoku-shotoku.test.js — 退職所得(退職金)の源泉徴収(実数リテラルで検算) */
'use strict';
var TS = require('../lib/taishoku-shotoku.js');

T('退職所得控除: 20年以下=40万×年(最低80万) / 20年超=800万+70万×(年-20)', function () {
  eq(TS.taishokuKojo(1), 800000);      // 40万×1=40万 < 80万 → 80万
  eq(TS.taishokuKojo(10), 4000000);    // 40万×10
  eq(TS.taishokuKojo(20), 8000000);    // 40万×20
  eq(TS.taishokuKojo(25), 11500000);   // 800万+70万×5
  eq(TS.taishokuKojo(30), 15000000);   // 800万+70万×10
});
T('勤続年数は1年未満切上(20年1ヶ月→21年)', function () {
  eq(TS.taishokuKojo(20.1), 8700000);  // 21年=800万+70万
});

T('課税退職所得金額=(退職金-控除)×1/2・1000円未満切捨', function () {
  // 退職金2000万・勤続30年 → 控除1500万 → base500万 → ×1/2=250万
  eq(TS.kazeiTaishoku(20000000, 30), 2500000);
  // 控除超で0
  eq(TS.kazeiTaishoku(3000000, 10), 0); // 控除400万>退職金300万
});

T('短期退職手当等(勤続5年以下・非役員): 300万超部分は1/2しない', function () {
  // 退職金500万・勤続3年 → 控除120万 → base380万 → 300万超80万は1/2なし → 150万+80万=230万
  eq(TS.kazeiTaishoku(5000000, 3, { shortTerm: true }), 2300000);
  // 300万以下は通常の1/2(退職金380万・勤続3年→控除120万→base260万≤300万→×1/2=130万)
  eq(TS.kazeiTaishoku(3800000, 3, { shortTerm: true }), 1300000);
});
T('特定役員(役員等・勤続5年以下): 1/2しない(全額)', function () {
  // 退職金500万・勤続3年・役員 → 控除120万 → base380万 → 全額課税380万
  eq(TS.kazeiTaishoku(5000000, 3, { officer: true }), 3800000);
});

T('所得税(源泉)=速算表×1.021・1円未満切捨', function () {
  // 課税退職所得250万 → 速算(10%-97,500)=152,500 → ×1.021=155,702.5→155,702
  eq(TS.incomeTax(20000000, 30), 155702);
  // 課税0 → 税0
  eq(TS.incomeTax(3000000, 10), 0);
});
/* ★×1.021 が 小数の 誤差で 1円 少なかった★（2026-11-06 実測で 直した）
     前は Math.floor(速算の 税額×1.021)＝1,000×1.021 が 1,020.99… で 1,020（正 1,021）。
     数えた＝税額 1〜2,000万円の 2,000万通り中 12,704通り。答えは 整数（×1021÷1000）で 出した物。 */
T('所得税(源泉): ×1.021 が 小数の 誤差で 1円 落ちない（退職金84万・勤続1年→速算 1,000→1,021・課税 1,000円刻み 1,000万円まで 整数と 照合）', function () {
  eq(TS.incomeTax(840000, 1, {}), 1021, '84万・1年');
  var N = require('../lib/nenmatsu.js'), kumi = 0, chigau = 0, rei = '';
  for (var kazei = 1000; kazei <= 10000000; kazei += 1000) {
    kumi++;
    var gross = 800000 + kazei * 2;   /* 勤続1年＝控除80万・×1/2 */
    var got = TS.incomeTax(gross, 1, {}), want = Math.floor(N.sanshutuShotokuZei(kazei) * 1021 / 1000);
    if (got !== want) { chigau++; if (!rei) rei = '課税' + kazei + '→' + got + '（正 ' + want + '）'; }
  }
  eq(chigau, 0, '整数の 答えと 違う（' + kumi + '通り中）例 ' + rei);
});
T('申告書なし=退職金×20.42%(一律)', function () {
  eq(TS.incomeTax(5000000, 10, { noReport: true }), 1021000);
});

T('住民税(分離)=課税退職所得金額×10%(市6%+県4%・各1円未満切捨)', function () {
  // 課税250万 → 6%=150,000 + 4%=100,000 = 250,000
  eq(TS.residentTax(20000000, 30), 250000);
});

T('compute: まとめ(退職金2000万・勤続30年)', function () {
  var r = TS.compute({ gross: 20000000, years: 30 });
  eq(r.kojo, 15000000); eq(r.kazei, 2500000); eq(r.incomeTax, 155702); eq(r.residentTax, 250000);
  eq(r.net, 20000000 - 155702 - 250000);
});
