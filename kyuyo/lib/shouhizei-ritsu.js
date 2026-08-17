/* shouhizei-ritsu.js — 消費税率（唯一の真実源）
 * ================================================================
 * 【出典】国税庁 https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6101.htm
 * 【現行】標準10% / 軽減8%（2019年10月1日から適用）
 * 【更新タイミング】消費税法の改正時のみ（変更頻度は極めて低い）
 * ================================================================
 * ★2026-08-02: リポジトリ直下にあった同名ファイルをここへ移した。
 *   直下版は「どのHTMLからも読まれていない」と見て消したが、api/claude.js（チャットの
 *   サーバ側）が require していたため /api/claude が毎回500になった。
 *   法定の数値は kyuyo/lib/ に1本だけ置き、画面もAPIもここを読む（写しを作らない）。
 * ★中央 statutory（kind='shouhizei'）へ投入する行も lib/statutory-rows.js が
 *   このファイルの値から作る＝数値の持ち場所はここ1箇所だけ。
 * 【利用】ブラウザ window.ShouhizeiRitsu / Node require('./shouhizei-ritsu.js')
 * ================================================================
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.ShouhizeiRitsu = api;
  else if (typeof globalThis !== 'undefined') globalThis.ShouhizeiRitsu = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SHOUHIZEI_RITSU = {

    // 適用開始日
    TEKIYO_KAISHI: '2019年10月1日',
    // ★この欄は「最後に一次情報で確かめた時点」。今日の日付を勝手に入れない。
    KAKUNIN_NENDO: '令和7年度（2025年度）現在変更なし',

    // ----------------------------------------------------------------
    // 税率
    // ----------------------------------------------------------------
    hyojun: 0.10,      // 標準税率：10%（一般商品・サービス）
    keigen: 0.08,      // 軽減税率：8%（飲食料品・新聞）

    // 表示用ラベル
    label: {
      hyojun: '10%',
      keigen: '8%（軽減）',
      hikazei: '非課税',
    },

    // ----------------------------------------------------------------
    // 軽減税率の対象（参考）
    // ----------------------------------------------------------------
    keigen_taisho: [
      '飲食料品（酒類・外食を除く）',
      '定期購読の新聞（週2回以上発行）',
    ],

    // ----------------------------------------------------------------
    // インボイス制度（適格請求書等保存方式）2023年10月1日から
    // ----------------------------------------------------------------
    invoice: {
      kaishi: '2023年10月1日',
      toroku_bangou_prefix: 'T', // 登録番号の先頭文字
      // 経過措置（免税事業者からの仕入について控除できる割合）
      keika_sochi: {
        '2023年10月〜2026年9月': 0.80,  // 80%控除可
        '2026年10月〜2029年9月': 0.50,  // 50%控除可
        '2029年10月〜': 0.00,           // 控除不可
      }
    },

    // 中央(Supabase statutory kind=shouhizei)の税率で上書き。不正なら何もしない=フォールバック。
    hydrate: function (data) {
      if (!data || typeof data !== 'object') return;
      if (typeof data.hyojun === 'number') this.hyojun = data.hyojun;
      if (typeof data.keigen === 'number') this.keigen = data.keigen;
    }

  };

  return SHOUHIZEI_RITSU;
});
