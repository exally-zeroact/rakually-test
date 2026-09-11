/* seikyu-out.js — ★出す（印刷/PDF・Excel）★
 * ==============================================================================
 * ★印刷/PDFは「紙だけの新しい窓」で刷る（司さんの決まり）★
 *   画面に @media print を掛けて隠す作りは隠し忘れが必ず出るので採らない。
 *   seikyu/lib/seikyu-paper.js が返す1枚のHTML（アプリの画面が1バイトも入っていない）を
 *   新しい窓に書いて刷る。PDFは同じ窓の「送信先＝PDFに保存」で出す。
 *
 * ★落とす口は js/file-out.js の1本だけ★
 *   ここで Blob を作らない・XLSX.writeFile を呼ばない（tests/ios-unsupported.test.mjs が破りを赤にする）。
 *
 * ★名前は先に出して直させる★
 *   seikyu/lib/seikyu-name.js が中身から作った推奨名を、落とす前に人へ見せる。
 *   ここは「見せた結果の名前」を受け取るだけ＝勝手な名前で落とさない。
 *
 * 【利用】window.SeikyuOut
 */
(function (global) {
  'use strict';

  /* 新しい窓に紙を書く。窓が開けなかった（ポップアップが止められた）時は理由を返す。
     ★開けなかったのに「印刷しました」と言わない★ */
  function openPaper(html, title) {
    var w = null;
    try { w = global.open('', '_blank'); } catch (e) { w = null; }
    if (!w) {
      return { ok: false, reason: 'この端末で新しい窓が開けませんでした（ブラウザのポップアップの設定を確かめてください）' };
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    try { if (title) w.document.title = title; } catch (e) { /* 名前が付けられなくても紙は出る */ }
    return { ok: true, win: w };
  }

  /* ★★2026-09-10 ブラウザの 印刷は 外しました★★
     司さん「印刷するのに ★この左下のやつ 消えてない★／
       なんで 他のアプリで ちゃんと やれとんのに」
     ＝ブラウザの 印刷は ★端末が 勝手に URL・日付・ページ番号を 足す★。
       実物で 確認＝紙の 左下に「https://rakually.vercel.app/seikyu/」。
       ★CSS では 消せない★（端末の 印刷の 設定）。
     ⇒ ★紙は 自前の PDF に して 出す★（seikyu-app.js の pdfDase 1本）。
       印刷は その PDF の 共有ボタンから する。
     ★見張り★ seikyu/tests/insatsu-url.mjs が
       「アプリの どこも window.print() を 呼ばない」を 機械で 見ている。

  /* 中身を見るだけ（刷らない） */
  function preview(html, title) { return openPaper(html, title); }

  /* Excel。★XLSX.writeFile は使わない★（種類が付かず iPhone で開けない） */
  function excel(sheet, filename) {
    var X = global.XLSX;
    if (!X) return Promise.reject(new Error('Excelの部品(SheetJS)が読み込めていません'));
    if (!global.FileOut) return Promise.reject(new Error('ファイルの渡し口(file-out.js)が読み込めていません'));
    var wb = X.utils.book_new();
    var ws = X.utils.aoa_to_sheet(sheet.aoa);
    if (sheet.cols) ws['!cols'] = sheet.cols;          // ★これが無いと相手の画面で ######## になる
    (sheet.numFmt || []).forEach(function (f) {
      var ref = X.utils.encode_cell({ r: f.r, c: f.c });
      if (ws[ref] && typeof ws[ref].v === 'number') ws[ref].z = f.z;
    });
    X.utils.book_append_sheet(wb, ws, sheet.name || 'Sheet1');
    var bytes = X.write(wb, { bookType: 'xlsx', type: 'array' });
    return global.FileOut.deliver(bytes, filename);
  }

  /** ★自作PDFを 落とす★（司さん 2026-08-30）
      ★落とし口は 1本★＝ここも FileOut.deliver を 通す（自前で Blob を作らない）。 */
  function pdf(bytes, filename) {
    return global.FileOut.deliver(bytes, filename);
  }
  /* ★PDFを その場で開く★＝iPhoneのビューアに渡す。そこの共有ボタンで メールに乗る。
     （司さん 2026-08-30「代行では メールなど選べる」＝代行と同じ道を こちらにも付けた） */
  function pdfOpen(bytes, filename) {
    return global.FileOut.openInViewer(bytes, filename);
  }

  global.SeikyuOut = { preview: preview, excel: excel, openPaper: openPaper,
    pdf: pdf, pdfOpen: pdfOpen };
})(typeof window !== 'undefined' ? window : globalThis);
