/* statutory-central.generated.js — ★機械が作るファイル。手で編集しない。★
 *
 *  作り方: node scripts/pull-statutory.mjs   （中央 statutory から取ってくる）
 *  中身  : kind:year → 出典URL / 確認日 / 指紋（中央のdataから計算）
 *
 *  ★なぜ生成にしたか（2026-08-03）
 *    出典・確認日を lib にも手書きすると、中央と lib の2箇所に手書きが残る。
 *    どちらを触っても片方が腐るので、★人が直すのは中央だけ★にした。
 *    ズレていないことは scripts/pull-statutory.mjs --check と
 *    tests/statutory-freshness.test.mjs がCIで見張る。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.StatutoryCentral = api;
  else if (typeof globalThis !== 'undefined') globalThis.StatutoryCentral = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var META = {
    'koyo:2025': { source_url: "https://www.mhlw.go.jp/content/001401966.pdf", verified_at: "2026-08-04", fingerprint: '36dc8e47' },
    'koyo:2026': { source_url: "https://jsite.mhlw.go.jp/aichi-hellowork/list/okazaki/news/koyouhokennryouR08.html", verified_at: "2026-08-03", fingerprint: 'd7ad3a44' },
    'nenmatsu:2026': { source_url: "https://www.nta.go.jp/users/gensen/2026kaisei/index.htm", verified_at: "2026-07-09", fingerprint: '4f3b1829' },
    'saitei_chingin:2025': { source_url: "https://www.mhlw.go.jp/content/11200000/001571192.pdf", verified_at: "2026-08-03", fingerprint: '5566dc03' },
    'shakaihoken:2025': { source_url: "https://www.kyoukaikenpo.or.jp/g7/cat330/", verified_at: "2026-07-08", fingerprint: 'c8dda132' },
    'shakaihoken:2026': { source_url: "https://www.kyoukaikenpo.or.jp/about/business/insurance_rate/rate_prefectures/r08/index.html", verified_at: "2026-08-03", fingerprint: '4554fe20' },
    'shotokuzei_densan:2025': { source_url: "https://www.nta.go.jp/publication/pamph/gensen/nencho2025/pdf/03.pdf", verified_at: "2026-07-09", fingerprint: '2e37e55a' },
    'shotokuzei_densan:2026': { source_url: "https://www.nta.go.jp/users/gensen/2026kaisei/index.htm", verified_at: "2026-07-09", fingerprint: '17488f72' },
    'shotokuzei_hei:2026': { source_url: "https://www.nta.go.jp/publication/pamph/gensen/zeigakuhyo2026/02.htm", verified_at: "2026-07-09", fingerprint: 'aa20a8f0' },
    'shotokuzei_nichi:2026': { source_url: "https://www.nta.go.jp/publication/pamph/gensen/zeigakuhyo2026/data/08-14.pdf", verified_at: "2026-07-13", fingerprint: '02bdb081' },
    'shouhizei:2019': { source_url: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6101.htm", verified_at: "2026-08-03", fingerprint: '4a4d2a88' },
    'shoyo:2026': { source_url: "https://www.nta.go.jp/publication/pamph/gensen/zeigakuhyo2026/03.htm", verified_at: "2026-07-09", fingerprint: '8c199970' },
    'warimashi:2023': { source_url: "https://jsite.mhlw.go.jp/wakayama-roudoukyoku/newpage_00470.html", verified_at: "2026-08-04", fingerprint: '0423f4c3' },
  };
  return { META: META };
});
