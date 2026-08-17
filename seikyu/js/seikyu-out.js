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

  /* 印刷（PDFで保存も同じ窓から）。
     ★書いた直後に print すると、端末によっては書式が当たる前に刷られる★ので
     読み込みが終わってから呼ぶ。 */
  function print(html, title) {
    var r = openPaper(html, title);
    if (!r.ok) return r;
    var w = r.win;
    var fired = false;
    function go() {
      if (fired) return;
      fired = true;
      try { w.focus(); w.print(); } catch (e) { /* 窓は開いている＝人が手で刷れる */ }
    }
    try {
      if (w.document.readyState === 'complete') global.setTimeout(go, 120);
      else w.addEventListener('load', function () { global.setTimeout(go, 120); });
    } catch (e) { global.setTimeout(go, 300); }
    // 保険（load が来ない端末でも刷れるように）
    global.setTimeout(go, 900);
    return { ok: true };
  }

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

  global.SeikyuOut = { print: print, preview: preview, excel: excel, openPaper: openPaper };
})(typeof window !== 'undefined' ? window : globalThis);
