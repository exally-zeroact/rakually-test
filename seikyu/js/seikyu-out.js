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
  /* ★2026-11-04★ 開く → ★共有に PDF だけ 渡す★（司さん「LINE に 訳わからん URL も 送られる」）
     ＝FileOut.sharePdf。共有できない 端末は 中で 今まで通り openInViewer に 落ちる。 */
  /* ★2026-11-06 司さん「B」★ 共有に PDF と ★字1行★（text＝「請求書 2026年10月分 〇〇 御中」）を 渡す・url は 付けない
     ＝files だけ だと ホーム画面の アプリで LINE が 並ばない（10-30）。 */
  /* onShared＝帯から 押し直して 送れた 時に 呼ぶ（「送った」印・11-06 taiketsu 止3） */
  function pdfOpen(bytes, filename, text, onShared) {
    return global.FileOut.sharePdf(bytes, filename, { text: text, onShared: onShared });
  }

  /* ★未発行（下書き）の 紙は 見るだけ★（2026-11-06 コンサル談＝ダイコメと 揃える）
     ＝まだ 送る 物では ない＝共有に 渡さず 今まで通り 開く（openInViewer）。 */
  function pdfView(bytes, filename) {
    return global.FileOut.openInViewer(bytes, filename);
  }
  /* ★2026-11-16 司さん「まだなんでLINEで送ったらURLが出てきとんどぼけ」★
     下書き（未発行）の 紙を iPhone・iPad で 見る 時に Safari の PDF 画面へ 行くと、そこの 共有から LINE に
     送ると Safari が 頁の blob URL を 一緒に 渡す。＝下書きも 共有の 画面に 渡す（files と text だけ・url 無し）。
     パソコン・Android は FileOut.sharePdf が 今まで通り 開く／保存（pdfView と 同じ）。
     ★取り消した 紙は ここを 通さず pdfView（見るだけ）のまま★（本物と 見分けの つかない 紙を 1押しで LINE に 出さない・taiketsu 11-16 止1）。 */
  function pdfDraft(bytes, filename, text) {
    return global.FileOut.sharePdf(bytes, filename, { text: text });
  }
  /* ★領収書の「領収書PDF」（落とす）★＝iPhone・iPad は Safari の PDF 画面へ 行かず 共有の 画面（「ファイルに保存」「プリント」も 並ぶ）。
     パソコン・Android は 今まで通り 落とす（deliver）。 */
  function pdfSave(bytes, filename, text) {
    return global.FileOut.sharePdf(bytes, filename, { text: text, open: function () { return global.FileOut.deliver(bytes, filename); } });
  }

  global.SeikyuOut = { preview: preview, excel: excel, openPaper: openPaper,
    pdf: pdf, pdfOpen: pdfOpen, pdfView: pdfView, pdfDraft: pdfDraft, pdfSave: pdfSave };
})(typeof window !== 'undefined' ? window : globalThis);
