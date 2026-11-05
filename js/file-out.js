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
 *        window.FileOut.sharePdf(bytes, 'name.pdf', { text: '請求書 2026年10月分 〇〇 御中' }) → Promise<{how:'share'|'need-tap'|'open'}>
 *
 * ★2026-11-04 追記★ 決まり②（端末で分けない）は ★落とす口（deliver）だけ★の 決まりに した。
 *   PDF を 送る 口（sharePdf・@share-begin〜end の 間）だけは 指で 触る 端末を 見て 共有に PDF と 字1行を 渡す（url は 付けない・11-06 司さん「B」）
 *   （司さん「LINE に 訳わからん URL も 送られる」）。共有へ 渡すのは iPhone・iPad だけ（他は 今まで通り 開く）。
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

  /* @share-begin ★PDF を 送る 口だけは 共有を 使う★（kyuyo/tests/file-out.test.mjs が この 間だけ 許す・deliver には 入れない） */
  /* ★PDFを 送る（iPhone の 共有に ★ファイルだけ★ 渡す）★（司さん 2026-11-04
     「請求書を LINE で 転送したら 訳わからん URL みたいなのも 送られる・開けんやつや・こんな作りにすんなや」）
     ・直す前＝openInViewer で blob の URL を Safari で 開き、その 共有から 送っていた
       ＝Safari は ★開いている 頁の URL（blob:https://…）も 一緒に 渡す★ → LINE に 開けない URL が 届いた。
     ・直した後＝navigator.share に ★files と text★ を 渡す（★url は 付けない★）＝届くのは 字1行と PDF 1つ。
       ★2026-11-06 司さん「B」★＝files だけ（11-04 の 1回目）は 10-30 に ホーム画面の アプリで 共有に LINE が 並ばなかった 形。
         text を 足した B は 司さんの 実機で LINE に 字と PDF が 両方 届いた（コンサル 11-06 01:5x）。
         ＝text は ★必ず 付ける★（呼ぶ側が 渡さない時は ファイル名から 作る・空の text で 送らない）。
       共有の 画面には LINE・メール・プリント・「ファイル」に保存 が 並ぶ＝印刷も ここから できる。
     ・指で 触らない 端末（パソコン）と ファイルを 共有できない 端末＝今まで通り openInViewer（開く）。
     ・iPhone は PDF を 作る 数秒の 間に「指で 押した」扱いが 切れて 断る 事が ある（NotAllowedError）
       ＝★黙らず★ 画面に「送る」ボタンを 1つ 出し、それを 押した 時に 共有を 開く。 */
  function shareFileOf(data, filename, mime) {
    var blob = toBlob(data, mime);
    if (!blob || typeof global.File !== 'function') return null;
    try { return new global.File([blob], filename, { type: mime }); } catch (e) { return null; }
  }
  /* ★指で 触る 端末だけ★（taiketsu 11-04 止2）＝パソコンの Chrome も canShare は true を 返す（08-04 の 実測）。
     パソコンで 共有の 画面を 出すと「印刷」が できなくなる＝パソコンは 今まで通り 開く。 */
  function touchDevice() {
    try { return !!(global.matchMedia && global.matchMedia('(pointer: coarse)').matches); } catch (e) { return false; }
  }
  function appleTouch() {
    var nv = global.navigator || {};
    var ua = String(nv.userAgent || '');
    return /iPhone|iPad|iPod/.test(ua) || (nv.platform === 'MacIntel' && Number(nv.maxTouchPoints) > 1);
  }
  function canShareFile(file) {
    var nv = global.navigator;
    if (!touchDevice()) return false;
    try { return !!(file && nv && typeof nv.share === 'function' && typeof nv.canShare === 'function' && nv.canShare({ files: [file] })); }
    catch (e) { return false; }
  }
  /* ★共有に 添える 字★＝呼ぶ側の 字（例「請求書 2026年10月分 〇〇株式会社 御中」）。無ければ ファイル名（拡張子を 外す）。
     ★URL に 見える 字は 入れない★（blob: http: を 落とす＝LINE に 開けない URL を 届けない）。 */
  function shareTextOf(text, filename) {
    var t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    if (!t) t = String(filename || '').replace(/\.[A-Za-z0-9]+$/, '').replace(/_/g, ' ').trim();
    t = t.replace(/(?:blob:|https?:\/\/)\S*/gi, '').replace(/\s+/g, ' ').trim();
    return t || 'PDF';
  }
  function sharePdf(data, filename, opts) {
    opts = opts || {};
    var mime = opts.type || mimeOf(filename);
    if (!mime) return Promise.reject(new Error('ファイルの種類が分かりません（' + filename + '）。'));
    /* ★共有へ 渡すのは iPhone・iPad だけ★（taiketsu 11-04 止め3回＝ボタンごとに 分けると 印刷・納品書・領収書が 漏れた）
       iPhone・iPad の 共有の 画面には プリント と「ファイル」に保存 が 在る＝印刷も 保存も 送るも ここで 足りる。
       Android・Windows の タブレット・パソコンは ★今までと 全く 同じ★ 開く（共有の 画面に 印刷が 無い 端末が 在る）。 */
    /* ★opts.open＝共有しない 時の 道を 呼ぶ側が 持っている 時★（給与＝前から window.open で 開く・11-06）。無ければ openInViewer */
    var hiraku = function () { return (typeof opts.open === 'function') ? Promise.resolve(opts.open()) : openInViewer(data, filename, opts); };
    if (!appleTouch()) return hiraku();
    var file = shareFileOf(data, filename, mime);
    if (!canShareFile(file)) return hiraku();
    var text = shareTextOf(opts.text, filename);
    var go = function () { return global.navigator.share({ files: [file], text: text }); };   // ★files と text・url は 付けない★
    return go().then(function () {
      /* ★送れた 時の 知らせは 呼ぶ側が 返りで 見る★（onShared は 帯で 押し直して 送れた 時だけ 呼ぶ＝二重に 付けない） */
      return { how: 'share', filename: filename };
    }, function (e) {
      var nm = e && e.name;
      if (nm === 'AbortError') return { how: 'share', cancelled: true, filename: filename };
      if (nm === 'NotAllowedError') return tapToShare(go, filename, opts.onShared);
      return hiraku();
    });
  }
  /* ★押し直しの「送る」ボタン★（共有は 指で 押した 時にしか 開けない）。確認の 画面（z-index 100）より 上に 出す */
  /* onShared＝帯から 押し直して ★送れた 時だけ★ 呼ぶ（「送った」印を ここで 付ける・やめた 時は 呼ばない・taiketsu 11-06 止3） */
  function tapToShare(go, filename, onShared) {
    var doc = global.document;
    if (!doc || !doc.body) return Promise.resolve({ how: 'need-tap', filename: filename });
    var old = doc.getElementById('fo-share');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var bar = doc.createElement('div');
    bar.id = 'fo-share';
    bar.setAttribute('role', 'dialog');
    bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:16px;z-index:1000;background:#fff;'
      + 'border:1px solid #c9d6cf;border-radius:14px;padding:12px;box-shadow:0 6px 24px rgba(0,0,0,.18);'
      + 'display:flex;gap:8px;align-items:center;';
    var msg = doc.createElement('div');
    msg.style.cssText = 'flex:1;font-size:14px;';
    msg.textContent = 'PDF が できました（' + filename + '）。';   /* ★どの 紙か 見える★（前の 紙を 送らない・taiketsu 任2） */
    var b = doc.createElement('button');
    b.type = 'button'; b.id = 'fo-share-go'; b.className = 'btn';
    b.textContent = '送る・印刷する';
    var x = doc.createElement('button');
    x.type = 'button'; x.className = 'btn'; x.textContent = '閉じる';
    var close = function () { if (bar.parentNode) bar.parentNode.removeChild(bar); };
    b.onclick = function () {
      go().then(function () { close(); if (typeof onShared === 'function') { try { onShared(); } catch (e2) {} } }, function (e) {
        if (e && e.name === 'AbortError') { close(); return; }
        msg.textContent = '送れませんでした（' + ((e && e.name) || '不明') + '）。閉じて もう一度 お試しください。';   /* ★黙らない★（taiketsu 任1） */
      });
    };
    x.onclick = close;
    bar.appendChild(msg); bar.appendChild(b); bar.appendChild(x);
    doc.body.appendChild(bar);
    return Promise.resolve({ how: 'need-tap', filename: filename });
  }

  /* @share-end */

  /* ファイル名の日時（YYYYMMDD_HHmm）。★毎回違う名前＝古いダウンロードと見分けがつく。
     代行請求アプリと同じ形。使うかどうかは呼ぶ側が決める。 */
  function stamp(d) {
    d = d || new Date();
    var z = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '_' + z(d.getHours()) + z(d.getMinutes());
  }

  global.FileOut = { deliver: deliver, openInViewer: openInViewer, sharePdf: sharePdf, shareTextOf: shareTextOf,
    mimeOf: mimeOf, MIME: MIME, stamp: stamp, extOf: extOf };
})(typeof window !== 'undefined' ? window : globalThis);
