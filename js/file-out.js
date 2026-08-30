/* file-out.js — ★ファイルを客に渡す唯一の口★（種類を正しく付けて、ふつうに落とす）
 *
 * なぜ必要か（2026-08-04・司さんの実機で判明）:
 *   iPhone に Excel が入っているのに、落としたファイルを ★Excelで開けなかった★。
 *   原因は端末ではなく実装で、★種類が application/octet-stream（＝種類の分からないデータ）だった1点★。
 *   iPhone は種類を見てアプリと紐づけるので、Excelが入っていても開けない。
 *
 * ★2026-08-04 に共有シート(navigator.share)をやめました。
 *   一度は「iPhoneは共有シートを出す」形にしたが、★これは間違い★でした。
 *   navigator.share は【人に送る】ための仕組みで【開く】ための仕組みではない。
 *   だからAirDrop・メッセージ・LINEが並ぶ＝客から見て回りくどい。
 *   ★社内の代行請求アプリ(daikou-seikyu.html)が、正しい種類を付けて【ふつうに落とすだけ】で
 *     iPhoneの「"Excel" で開く」を出していました。★ そのやり方に揃えます。
 *   ＝端末で分けない。全部 <a download>。種類を正しく付けるのが本体。
 *
 * 決まり:
 *   ① ★octet-stream を既定にしない。★ 種類の分からない物は落とさせない（拡張子から必ず決める）
 *   ② 端末で分岐しない（pointer や UA を見ない）
 *   ③ ★渡し口はこの1箇所だけ。★ 他の場所で Blob を作らない・writeFile を呼ばない
 *      （tests/ios-unsupported.test.mjs が破りを赤にする）
 *
 * ★2026-08-30 追記（司さん「代行請求書のアプリでは PDFで送る あと 赤丸のところから
 *   メールなど選べるけど これではダメなのか？」）
 *   ★ダメではない。こちらに その道が 無かった★。
 *   代行請求アプリ(daikou-seikyu.html:7099)には ★2つの口★が在る:
 *     ① InvoicePDF.save()      … <a download> で ふつうに落とす（＝こちらの deliver と同じ）
 *     ② window.open(blobURL)   … ★PDFを その場で開く★
 *        → iPhone自身の ビューアが出る → ★共有ボタンから メール/メッセージ/AirDrop★
 *   ＝「送る」は うちが作る物ではなく ★iPhoneが 元から持っている★。
 *     落とすだけでは そこへ行けない（ファイルアプリまで 人が探しに行く事になる）。
 *   ⇒ ★openInViewer を ここに足す★。★Blobを作るのは この1箇所のまま★。
 *   （2026-08-04 に やめた navigator.share とは 別物。あれは「開く」為に使ったのが 間違いだった。
 *     ここは ★開く★＝iPhoneのビューアに渡すだけで、送る先は 人が選ぶ）
 *
 * 【利用】window.FileOut.deliver(bytes, 'name.xlsx') → Promise<{how:'download'}>
 *        window.FileOut.openInViewer(bytes, 'name.pdf') → Promise<{how:'open'}>
 */
(function (global) {
  'use strict';

  /* 拡張子 → 種類。★ここに無い拡張子は落とさない（黙って octet-stream にしない）。 */
  var MIME = {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    csv: 'text/csv',
    txt: 'text/plain',
    pdf: 'application/pdf',
    json: 'application/json',
    png: 'image/png',
  };

  function extOf(filename) {
    var m = /\.([A-Za-z0-9]+)$/.exec(String(filename || ''));
    return m ? m[1].toLowerCase() : '';
  }
  function mimeOf(filename) {
    var e = extOf(filename);
    return MIME[e] || null;      // ★分からなければ null（呼ぶ側で止める）
  }

  function toBlob(data, mime) {
    if (typeof Blob === 'undefined') return null;
    if (data instanceof Blob) return data;
    return new Blob([data], { type: mime });
  }

  /* ★代行請求アプリと同じ形（動いている実物に揃える）。
     後始末（URLの取り消しと要素の削除）は 1.5秒後＝落とし始める前に消えないように。
     ★target="_blank" は必須（2026-08-09）★
       ホーム画面から開いたアプリ（standalone）では、download が効かない端末だと
       ★同じ窓でファイルが開いてしまい、アプリに戻れなくなる★（既知の罠）。
       別の窓で開けば、閉じるだけでアプリへ戻れる。
       download が効く端末では target は無視されるので、PCの落ち方は変わらない。 */
  function anchorDownload(blob, filename) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); if (a.parentNode) a.parentNode.removeChild(a); }, 1500);
    return { how: 'download', type: blob.type, filename: filename };
  }

  /* ファイルを渡す。返りは Promise（共有シートは非同期のため）。
     opts.title … 共有シートの見出し（省略時はファイル名） */
  function deliver(data, filename, opts) {
    opts = opts || {};
    var mime = opts.type || mimeOf(filename);
    if (!mime) {
      // ★種類が分からない物は落とさない。落とすと iPhone で「開けないファイル」になる。
      return Promise.reject(new Error('ファイルの種類が分かりません（' + filename + '）。FileOut.MIME に足してください。'));
    }
    var blob = toBlob(data, mime);
    if (!blob) return Promise.reject(new Error('この環境ではファイルを作れません'));

    // ★端末で分けない。全部これ。種類が正しければ iPhone は「"Excel" で開く」を出す。
    return Promise.resolve(anchorDownload(blob, filename));
  }

  /* ★PDFを その場で開く★（＝iPhoneのビューアに渡す。そこの共有ボタンで メールに乗る）
     ・代行請求アプリと同じ形（window.open(blobURL, '_blank')）
     ・★開けなかった時は 黙らない★（ポップアップを止められている端末が在る）
       ＝落とす方へ 自分で切り替えて、切り替えた事を 呼ぶ側に返す
     ・取り消しは60秒後＝ビューアが読み終わる前に 消さない（代行と同じ間） */
  function openInViewer(data, filename, opts) {
    opts = opts || {};
    var mime = opts.type || mimeOf(filename);
    if (!mime) return Promise.reject(new Error('ファイルの種類が分かりません（' + filename + '）。'));
    var blob = toBlob(data, mime);
    if (!blob) return Promise.reject(new Error('この環境ではファイルを作れません'));
    var url = URL.createObjectURL(blob);
    var w = null;
    try { w = global.open(url, '_blank', 'noopener'); } catch (e) { w = null; }
    if (!w) {
      URL.revokeObjectURL(url);
      return Promise.resolve(Object.assign(anchorDownload(blob, filename), { fellBack: true }));
    }
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    return Promise.resolve({ how: 'open', type: blob.type, filename: filename });
  }

  /* ファイル名の日時（YYYYMMDD_HHmm）。★毎回違う名前＝古いダウンロードと見分けがつく。
     代行請求アプリと同じ形。使うかどうかは呼ぶ側が決める。 */
  function stamp(d) {
    d = d || new Date();
    var z = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '_' + z(d.getHours()) + z(d.getMinutes());
  }

  global.FileOut = { deliver: deliver, openInViewer: openInViewer,
    mimeOf: mimeOf, MIME: MIME, stamp: stamp, extOf: extOf };
})(typeof window !== 'undefined' ? window : globalThis);
