/* rousai-ritsu.js — ★労災保険率表（法令の 本文から そのまま）★
 * ============================================================================
 * ★出どころ（2026-09-04 に e-Gov 法令検索の API から 機械で 取った）★
 *   ★労働保険の保険料の徴収等に関する法律施行規則★（昭和四十七年労働省令第八号）
 *     ★別表第１（第６条、第１６条関係）「労災保険率表」★
 *     https://laws.e-gov.go.jp/api/1/lawdata/347M50002000008
 *   ★第十六条 原文★
 *     「…以外の事業に係る労災保険率は★別表第一のとおり★とし、
 *       ★船舶所有者の事業に係る労災保険率は千分の四十二★とし、
 *       別表第一に掲げる事業及び船舶所有者の事業の種類の★細目は、厚生労働大臣が別に定めて告示する★。
 *      ２ 法第十二条第三項の★非業務災害率は、千分の〇・六★とする。」
 *
 * ★なぜ 要るか（2026-09-04 実測）★
 *   うちは ★労災率を 会社が 手で 打ち込む★ようにしていた＝★間違えても 誰も 気づけない★。
 *   最賃・健保と 同じで ★表を 持って 選ばせる★のが 筋。
 *
 * ★数（機械で 数えた）★ … ★事業の種類 53★／分類 8／率 2.5‰〜88.0‰／★落とした行 0★
 *   （★XML の 行は 3列の 物と 2列の 物が 混ざっている★＝2列を 落とすと 41本に 減る。
 *     一度 41本で 作りかけて 気づいた＝[[feedback_silent_shrinking_total_beats_error]]）
 *
 * ★細目は 告示★＝この表は「事業の種類」まで。★細目で 決まる 会社は 労働局に 確認★。
 *
 * 【利用】ブラウザ window.RousaiRitsu / Node require('./rousai-ritsu.js')
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.RousaiRitsu = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ★別表第１ そのまま★（bunrui＝事業の種類の分類／shurui＝事業の種類／permil＝千分の） */
  var TABLE = [
    { bunrui: "林業", shurui: "林業", permil: 52.0 },
    { bunrui: "漁業", shurui: "海面漁業（定置網漁業又は海面魚類養殖業を除く。）", permil: 18.0 },
    { bunrui: "漁業", shurui: "定置網漁業又は海面魚類養殖業", permil: 37.0 },
    { bunrui: "鉱業", shurui: "金属鉱業、非金属鉱業（石灰石鉱業又はドロマイト鉱業を除く。）又は石炭鉱業", permil: 88.0 },
    { bunrui: "鉱業", shurui: "石灰石鉱業又はドロマイト鉱業", permil: 13.0 },
    { bunrui: "鉱業", shurui: "原油又は天然ガス鉱業", permil: 2.5 },
    { bunrui: "鉱業", shurui: "採石業", permil: 37.0 },
    { bunrui: "鉱業", shurui: "その他の鉱業", permil: 26.0 },
    { bunrui: "建設事業", shurui: "水力発電施設、ずい道等新設事業", permil: 34.0 },
    { bunrui: "建設事業", shurui: "道路新設事業", permil: 11.0 },
    { bunrui: "建設事業", shurui: "舗装工事業", permil: 9.0 },
    { bunrui: "建設事業", shurui: "鉄道又は軌道新設事業", permil: 9.0 },
    { bunrui: "建設事業", shurui: "建築事業（既設建築物設備工事業を除く。）", permil: 9.5 },
    { bunrui: "建設事業", shurui: "既設建築物設備工事業", permil: 12.0 },
    { bunrui: "建設事業", shurui: "機械装置の組立て又は据付けの事業", permil: 6.0 },
    { bunrui: "建設事業", shurui: "その他の建設事業", permil: 15.0 },
    { bunrui: "製造業", shurui: "食料品製造業", permil: 5.5 },
    { bunrui: "製造業", shurui: "繊維工業又は繊維製品製造業", permil: 4.0 },
    { bunrui: "製造業", shurui: "木材又は木製品製造業", permil: 13.0 },
    { bunrui: "製造業", shurui: "パルプ又は紙製造業", permil: 7.0 },
    { bunrui: "製造業", shurui: "印刷又は製本業", permil: 3.5 },
    { bunrui: "製造業", shurui: "化学工業", permil: 4.5 },
    { bunrui: "製造業", shurui: "ガラス又はセメント製造業", permil: 6.0 },
    { bunrui: "製造業", shurui: "コンクリート製造業", permil: 13.0 },
    { bunrui: "製造業", shurui: "陶磁器製品製造業", permil: 17.0 },
    { bunrui: "製造業", shurui: "その他の窯業又は土石製品製造業", permil: 23.0 },
    { bunrui: "製造業", shurui: "金属精錬業（非鉄金属精錬業を除く。）", permil: 6.5 },
    { bunrui: "製造業", shurui: "非鉄金属精錬業", permil: 7.0 },
    { bunrui: "製造業", shurui: "金属材料品製造業（鋳物業を除く。）", permil: 5.0 },
    { bunrui: "製造業", shurui: "鋳物業", permil: 16.0 },
    { bunrui: "製造業", shurui: "金属製品製造業又は金属加工業（洋食器、刃物、手工具又は一般金物製造業及びめつき業を除く。）", permil: 9.0 },
    { bunrui: "製造業", shurui: "洋食器、刃物、手工具又は一般金物製造業（めつき業を除く。）", permil: 6.5 },
    { bunrui: "製造業", shurui: "めつき業", permil: 6.5 },
    { bunrui: "製造業", shurui: "機械器具製造業（電気機械器具製造業、輸送用機械器具製造業、船舶製造又は修理業及び計量器、光学機械、時計等製造業を除く。）", permil: 5.0 },
    { bunrui: "製造業", shurui: "電気機械器具製造業", permil: 3.0 },
    { bunrui: "製造業", shurui: "輸送用機械器具製造業（船舶製造又は修理業を除く。）", permil: 4.0 },
    { bunrui: "製造業", shurui: "船舶製造又は修理業", permil: 23.0 },
    { bunrui: "製造業", shurui: "計量器、光学機械、時計等製造業（電気機械器具製造業を除く。）", permil: 2.5 },
    { bunrui: "製造業", shurui: "貴金属製品、装身具、皮革製品等製造業", permil: 3.5 },
    { bunrui: "製造業", shurui: "その他の製造業", permil: 6.0 },
    { bunrui: "運輸業", shurui: "交通運輸事業", permil: 4.0 },
    { bunrui: "運輸業", shurui: "貨物取扱事業（港湾貨物取扱事業及び港湾荷役業を除く。）", permil: 8.5 },
    { bunrui: "運輸業", shurui: "港湾貨物取扱事業（港湾荷役業を除く。）", permil: 9.0 },
    { bunrui: "運輸業", shurui: "港湾荷役業", permil: 12.0 },
    { bunrui: "電気、ガス、水道又は熱供給の事業", shurui: "電気、ガス、水道又は熱供給の事業", permil: 3.0 },
    { bunrui: "その他の事業", shurui: "農業又は海面漁業以外の漁業", permil: 13.0 },
    { bunrui: "その他の事業", shurui: "清掃、火葬又はと畜の事業", permil: 13.0 },
    { bunrui: "その他の事業", shurui: "ビルメンテナンス業", permil: 6.0 },
    { bunrui: "その他の事業", shurui: "倉庫業、警備業、消毒又は害虫駆除の事業又はゴルフ場の事業", permil: 6.5 },
    { bunrui: "その他の事業", shurui: "通信業、放送業、新聞業又は出版業", permil: 2.5 },
    { bunrui: "その他の事業", shurui: "卸売業・小売業、飲食店又は宿泊業", permil: 3.0 },
    { bunrui: "その他の事業", shurui: "金融業、保険業又は不動産業", permil: 2.5 },
    { bunrui: "その他の事業", shurui: "その他の各種事業", permil: 3.0 },
  ];

  /* ★船舶所有者の 事業★（別表には 無い＝第十六条 本文） */
  var SENPAKU_PERMIL = 42;
  /* ★非業務災害率★（第十六条第2項）＝メリット制の 計算で 使う */
  var HIGYOMU_PERMIL = 0.6;

  var FINGERPRINT = "6eefaa74";  /* ★JS 側の 数え方で 出した 指紋★（2026-09-04＝Python で 出した 指紋と 作り方が 違い、見張りが 自分で 見つけた） */      /* 表の 中身の 指紋（変わったら 見張りが 鳴る） */
  var SOURCE_URL = 'https://laws.e-gov.go.jp/api/1/lawdata/347M50002000008';
  var LAW_NAME = '労働保険の保険料の徴収等に関する法律施行規則 別表第１（労災保険率表）';

  function list() { return TABLE.slice(); }
  function bunruiList() {
    var out = [], seen = {};
    for (var i = 0; i < TABLE.length; i++) if (!seen[TABLE[i].bunrui]) { seen[TABLE[i].bunrui] = 1; out.push(TABLE[i].bunrui); }
    return out;
  }
  /* ★事業の種類の 名前で 引く★（★見つからない時は null★＝0を 返さない） */
  function permilOf(shurui) {
    for (var i = 0; i < TABLE.length; i++) if (TABLE[i].shurui === shurui) return TABLE[i].permil;
    if (shurui === '船舶所有者の事業') return SENPAKU_PERMIL;
    return null;
  }
  function rateOf(shurui) { var p = permilOf(shurui); return (p == null) ? null : p / 1000; }

  return { TABLE: TABLE, list: list, bunruiList: bunruiList, permilOf: permilOf, rateOf: rateOf,
    SENPAKU_PERMIL: SENPAKU_PERMIL, HIGYOMU_PERMIL: HIGYOMU_PERMIL,
    FINGERPRINT: FINGERPRINT, SOURCE_URL: SOURCE_URL, LAW_NAME: LAW_NAME, COUNT: TABLE.length };
}));
