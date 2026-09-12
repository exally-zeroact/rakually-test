/* statutory-rows.js — 中央 statutory テーブルへ投入する「あるべき行」をlib値から生成(単一ソース)。
 *   seed-statutory.mjs(node)と admin.html(browser)の両方が本モジュールを使い、行生成ロジックを二重持ちしない。
 *   値は payslip-app の検証済みlibからそのまま流し込む(捏造なし)。
 *   使い方: buildStatutoryRows({ SHH, SAI, KOYO, D, H, NI, SZ, N, WM })  ← 各libの「エクスポート実体オブジェクト」を渡す
 *     node : require('./shakaihoken-hyo.js') 等をそのまま
 *     browser: SHH()/SAI()/KH()/ShotokuzeiDensan/ShotokuzeiHei/NICHI()/SZ()/Nen_()/Warimashi で解決した実体
 *   ★ここを変えたら tests/statutory-rows.test.js が守る(seed と同一行を出す)。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.StatutoryRows = api;
  else if (typeof globalThis !== 'undefined') globalThis.StatutoryRows = api;
})(this, function () {
  'use strict';

  // 社保: 各年度を1行に束ねる(健保47県total/介護total/支援金total/厚年total)
  function shakaihokenRow(SHH, year) {
    var kenko = year >= 2026
      ? SHH.KENKO_2026
      : Object.keys(SHH.KENKO_RITSU).reduce(function (o, k) { o[k] = SHH.KENKO_RITSU[k].total; return o; }, {});
    var ym = year + '-06';
    return {
      kenko_total: kenko,
      kaigo_total: SHH.getKaigo(ym).total,
      shienkin_total: (year >= 2026 ? SHH.SHIENKIN_TOTAL_FROM_2026_04 : 0),
      kosei_total: SHH.KOSEI_NENKIN_RITSU_TOTAL
    };
  }

  // 中央(Supabase statutory)へ送る最賃の形。★中央は発効日を和暦で持つので和暦に直す。
  //  （lib は判定に使うので ISO で持つ。形の違いはここ1箇所だけで吸収する）
  //  ★2026-08-03に中央へ prev/hatsuko が入った（指示役が投入）。lib はその写し。
  //    ズレていないことは scripts/verify-statutory.mjs と scripts/pull-statutory.mjs --check が見張る。
  function saiteiForCentral(SAI) {
    return Object.keys(SAI.todofuken).reduce(function (o, k) {
      var p = SAI.todofuken[k];
      o[k] = { name: p.name, chingin: p.chingin, prev: p.prev,
        hatsuko: SAI.toWarekiHatsuko ? SAI.toWarekiHatsuko(p.hatsuko) : p.hatsuko };
      return o;
    }, {});
  }

  // L = { SHH, SAI, KOYO, D, H, NI, SZ, N, WM, SHZ }
  function buildStatutoryRows(L) {
    var SHH = L.SHH, SAI = L.SAI, KOYO = L.KOYO, D = L.D, H = L.H, NI = L.NI, SZ = L.SZ, N = L.N, WM = L.WM, SHZ = L.SHZ;
    /* ★労災保険率表★（2026-09-04 に 中央の 台帳へ 入れた）
       ★渡されない repo でも 落ちない★＝行を 足さないだけ（アプリごとに 持つ／持たないが 在る） */
    var RR = L.RR;
    // ★消費税もlibから取る(2026-08-02)。ここに 0.10/0.08 を直書きすると数値が2箇所になり、
    //   片方だけ直した時に静かにずれる。渡し忘れは黙って通さず、その場で止める。
    if (!SHZ || typeof SHZ.hyojun !== 'number') throw new Error('buildStatutoryRows: SHZ(lib/shouhizei-ritsu.js)が渡されていません');
    var heiTable = (H.HEI_BY_YEAR && H.HEI_BY_YEAR[2026]) || H.HEI_R8;
    var nichiTable = (NI.tableFor && NI.tableFor(2026)) || NI.TABLE_R8;
    var rows = [
      { kind: 'saitei_chingin', year: SAI.NENDO_YEAR, data: { todofuken: saiteiForCentral(SAI), zenkoku_heikin: SAI.ZENKOKU_HEIKIN, nendo: SAI.NENDO, hatsuko_chui: SAI.HATSUKO_CHUI || '' }, source_url: /* ★2026-09-12＝出典は 一覧ページでは なく 答申のPDFを 直接 指す（経営者1が 見つけた）★
        一覧ページを 実際に 取って 数えたら ★1,280 も 1,177 も 令和8年度 も 0回★＝
        ★出典を 開いても 数字が 確かめられない＝出典として 成立していない★。
        去年(2025)は PDFを 直接 指していた。同じ形に 揃える。 */
      'https://www.mhlw.go.jp/content/11302000/001745621.pdf' },
      { kind: 'shakaihoken', year: 2025, data: shakaihokenRow(SHH, 2025), source_url: 'https://www.kyoukaikenpo.or.jp/g7/cat330/' },
      { kind: 'shakaihoken', year: 2026, data: shakaihokenRow(SHH, 2026), source_url: 'https://www.kyoukaikenpo.or.jp/g7/cat330/' },
      { kind: 'koyo', year: 2025, data: KOYO.RATES[2025], source_url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyouhoken_ryouritsu.html' },
      { kind: 'koyo', year: 2026, data: KOYO.RATES[2026], source_url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyouhoken_ryouritsu.html' },
      { kind: 'shotokuzei_densan', year: 2025, data: { fuyouKojo: D.PARAMS[2025].fuyouKojo, kyuyo: D.PARAMS[2025].kyuyo, kiso: D.PARAMS[2025].kiso }, source_url: 'https://www.nta.go.jp/users/gensen/' },
      { kind: 'shotokuzei_densan', year: 2026, data: { fuyouKojo: D.PARAMS[2026].fuyouKojo, kyuyo: D.PARAMS[2026].kyuyo, kiso: D.PARAMS[2026].kiso, zeiKo: D.ZEI_KO, zeiOtsu: D.ZEI_OTSU }, source_url: 'https://www.nta.go.jp/users/gensen/2026kaisei/index.htm' },
      { kind: 'shotokuzei_hei', year: 2026, data: { start: heiTable.start, step: heiTable.step, arr: heiTable.arr }, source_url: 'https://www.nta.go.jp/publication/pamph/gensen/zeigakuhyo2026/02.htm' },
      { kind: 'shotokuzei_nichi', year: 2026, data: { start: nichiTable.start, step: nichiTable.step, ko: nichiTable.ko, otsu: nichiTable.otsu, koOver: nichiTable.koOver, otsuLowRate: nichiTable.otsuLowRate, otsuOver: nichiTable.otsuOver }, source_url: 'https://www.nta.go.jp/publication/pamph/gensen/zeigakuhyo2026/data/08-14.pdf' },
      { kind: 'shoyo', year: 2026, data: { rates: SZ.RATES, kou: SZ.KOU_BY_YEAR[2026], otsu: SZ.OTSU_BY_YEAR[2026], kenpo_year_cap: SZ.KENPO_YEAR_CAP, kosei_per_cap: SZ.KOSEI_PER_CAP, kosei_ritsu_jugyoin: SZ.KOSEI_RITSU_JUGYOIN }, source_url: 'https://www.nta.go.jp/publication/pamph/gensen/zeigakuhyo2026/03.htm' },
      { kind: 'nenmatsu', year: 2026, data: N.P, source_url: 'https://www.nta.go.jp/users/gensen/2026kaisei/index.htm' },
      { kind: 'warimashi', year: 2023, data: WM.RATE, source_url: 'https://www.mhlw.go.jp/hourei/doc/kouji/K060000-A5.pdf' },
      { kind: 'shouhizei', year: 2019, data: { hyojun: SHZ.hyojun, keigen: SHZ.keigen }, source_url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6101.htm' }
    ];
    /* ★労災保険率表（別表第１・53業種）★（2026-09-04）
       出どころ＝労働保険の保険料の徴収等に関する法律施行規則 別表第１（e-Gov 法令検索）
       年度＝附則「この省令は、★令和六年四月一日★から施行する」＋第二条（別表第一の規定）
       ★年は lib から 取る★（打ち込まない＝2026-09-04 に 最賃で 踏んだ 穴と 同じ型）
       ★RR を 渡していない repo では 行を 足さない★＝労災を 持たない アプリを 赤に しない */
    /* ★2026-09-11 指示役1＝ここが 今日の穴 3つの 根っこでした★
       11本の lib のうち ★RR(労災)だけ 渡し忘れても 黙って 1行 減る★（他10本は その場で止まる）。
       ⇒ 試験も verify も RR を 渡し忘れ、★労災が 一度も 見られない のに 緑★ だった。
       ★「持っていない」と「渡し忘れ」を 分ける★＝
         RR === undefined … ★渡し忘れ＝その場で止める★
         RR === null      … ★この repo は 労災を 持たない（payslip-app 等）＝行を足さずに 進む★
       ※元の作りは「RRが無ければ黙って飛ばす」だった。労災を持たないアプリを赤にしない為の
         わざとの緩さだが、★渡し忘れまで 一緒に 許していた★。 */
    if (RR === undefined) {
      throw new Error('buildStatutoryRows: RR(lib/rousai-ritsu.js)が渡されていません。'
        + '労災を持たない repo では 明示的に RR: null を渡してください（渡し忘れと区別する為）');
    }
    if (RR && RR.TABLE && RR.NENDO_YEAR) {
      rows.push({ kind: 'rousai_ritsu', year: RR.NENDO_YEAR,
        data: { hyo: RR.TABLE, senpaku_permil: RR.SENPAKU_PERMIL, higyomu_permil: RR.HIGYOMU_PERMIL },
        source_url: RR.SOURCE_URL });
    }
    return rows;
  }

  // 中央行(actual)と あるべき行(desired)を突き合わせ、差分(未収録=new / 値相違=changed)を返す。
  //   central: [{kind,year,data}] 現在の中央。desired: buildStatutoryRows()の結果。
  function diffRows(desired, central) {
    var idx = {};
    (central || []).forEach(function (r) { idx[r.kind + '\0' + r.year] = r.data; });
    var out = [];
    desired.forEach(function (d) {
      var cur = idx[d.kind + '\0' + d.year];
      var status = (cur === undefined) ? 'new' : (stableStr(cur) === stableStr(d.data) ? 'same' : 'changed');
      out.push({ kind: d.kind, year: d.year, data: d.data, source_url: d.source_url, status: status });
    });
    return out;
  }

  // キー順に安定化したJSON(オブジェクト比較用。数値/配列はそのまま)。
  function stableStr(v) { return JSON.stringify(sortDeep(v)); }
  function sortDeep(v) {
    if (Array.isArray(v)) return v.map(sortDeep);
    if (v && typeof v === 'object') {
      return Object.keys(v).sort().reduce(function (o, k) { o[k] = sortDeep(v[k]); return o; }, {});
    }
    return v;
  }

  return { buildStatutoryRows: buildStatutoryRows, saiteiForCentral: saiteiForCentral, diffRows: diffRows, stableStr: stableStr, ALLOWED_KINDS: ['saitei_chingin', 'shakaihoken', 'koyo', 'shotokuzei_densan', 'shotokuzei_hei', 'shotokuzei_nichi', 'shoyo', 'nenmatsu', 'warimashi', 'shouhizei', 'rousai_ritsu'] };
});
