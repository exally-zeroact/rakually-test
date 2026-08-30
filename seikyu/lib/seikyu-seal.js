/* seikyu-seal.js — ★入れた判子が「会社の角印」か「個人の苗字の丸い印」かを 機械で見分ける★
 * ============================================================================
 * ★司さん 2026-08-30「判子も 個人の苗字の判子の大きさと 角印の判子の大きさも
 *   自動で選別してるか？」★
 *
 * ★今まで（2026-08-30 まで）★
 *   Rakunally も 代行請求も ★人が mm を打つ★だけだった（既定21mm・代行は hankoSizeMm）。
 *   ＝個人の苗字の印（実物 12〜15mm）を入れても 21mm で刷ってしまう＝★大きすぎる★。
 *
 * ★見分け方（実物の形から）★
 *   ・角印（会社の四角い印）… ★四角い枠★なので ★四隅に墨が在る★
 *   ・丸い印（個人の苗字）  … 丸なので ★四隅は 紙のまま（墨が無い）★
 *   ⇒ ★印影の四隅に 墨が在るか★ だけで 分かれる（字の内容は 見ない＝読めなくてよい）。
 *
 * ★大きさ（実物の決まり）★
 *   ・会社の角印 … 21mm 角（18〜24mmが多い）
 *   ・個人の印   … 認印 10.5〜13.5mm／銀行印・実印 15〜18mm
 *   ⇒ 角印 21mm ／ 丸い印 15mm を ★当てて見せる★。★違えば その場で直せる★
 *     （うちの決まり「聞いてあげる。埋めさせない」＝勝手に決め切らない）
 *
 * ★分からない時は 分からないと言う★
 *   四隅の墨が 中途半端な時（0.04〜0.12）は ★決めない★＝既定のまま・理由を出す。
 *   （★当てられない物を 当てたことにしない★）
 *
 * 公開API（window.SeikyuSeal / module.exports）:
 *   .guess({corner})            … ★純粋★ 数から 形と mm を決める（node で試せる）
 *   .measure(dataUrl)           … 画像を読んで 四隅の墨の割合を出す（ブラウザ・canvas）
 *   .guessFromUrl(dataUrl)      … measure → guess をつないだ物（ブラウザ）
 *   .MM_KAKU / .MM_MARU / .KAKU_MIN / .MARU_MAX / .CORNER
 */
(function (global) {
  'use strict';

  var MM_KAKU = 21;        // 会社の角印
  var MM_MARU = 15;        // 個人の苗字の丸い印
  var CORNER = 0.15;       // 四隅の 見る広さ（印影の短い辺の15%）
  var KAKU_MIN = 0.12;     // 四隅の墨が これ以上 → 四角い枠が在る
  var MARU_MAX = 0.04;     // 四隅の墨が これ以下 → 四隅は空いている＝丸

  /** ★純粋★ 四隅の墨の割合から 形と大きさを決める。
   *  m = { corner: 0〜1, w, h }  →  { shape, mm, sure, why } */
  function guess(m) {
    /* ★null を 0にしない★＝Number(null) は 0 になり「四隅が空＝丸」と 嘘をつく
       （2026-08-30 実際に そうなった）。数でない物は ぜんぶ「分からない」。 */
    var raw = m ? m.corner : undefined;
    var c = (typeof raw === 'number') ? raw : NaN;
    if (!Number.isFinite(c)) {
      return { shape: 'unknown', mm: MM_KAKU, sure: false,
        why: '判子の形が 読み取れませんでした。大きさは 既定の ' + MM_KAKU + 'mm にしています。' };
    }
    if (c >= KAKU_MIN) {
      return { shape: 'kaku', mm: MM_KAKU, sure: true,
        why: '四隅にも 印があるので、四角い印（会社の角印）と見ました。'
          + '角印の実物は 21mm角が多いので ' + MM_KAKU + 'mm にしました。' };
    }
    if (c <= MARU_MAX) {
      return { shape: 'maru', mm: MM_MARU, sure: true,
        why: '四隅が 空いているので、丸い印（個人の苗字の印）と見ました。'
          + '個人の印の実物は 12〜18mm なので ' + MM_MARU + 'mm にしました。' };
    }
    return { shape: 'unknown', mm: MM_KAKU, sure: false,
      why: '四角い印か 丸い印か 決められませんでした。'
        + '大きさは 既定の ' + MM_KAKU + 'mm のままにしています。' };
  }

  /* ── ここから下は ブラウザ（canvas が要る） ───────────────────────────── */

  function loadImage(src) {
    return new Promise(function (res, rej) {
      /* ★new Image() ではなく createElement('img')★
         見張り（dep-guard）は global.○○ を「誰かが作る物」として数えるので、
         ブラウザに元から在る物は こちらで作る＝★台帳を汚さない★ */
      var img = global.document.createElement('img');
      img.onload = function () { res(img); };
      img.onerror = function () { rej(new Error('この画像は読めませんでした')); };
      img.src = src;
    });
  }

  /** 画像の 四隅の墨の割合を出す。
   *  ★墨＝「透けていない かつ 白くない」点★（白抜き済みPNG も 白地JPEG も 同じに数える） */
  function measure(dataUrl) {
    return loadImage(dataUrl).then(function (img) {
      var W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
      if (!W || !H) throw new Error('画像の大きさが 取れませんでした');
      /* 大きい画像でも 同じ時間で終わるように 長辺240点に縮めて見る（形は変わらない） */
      var s = Math.min(1, 240 / Math.max(W, H));
      var w = Math.max(8, Math.round(W * s)), h = Math.max(8, Math.round(H * s));
      var c = global.document.createElement('canvas');
      c.width = w; c.height = h;
      var ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      var d = ctx.getImageData(0, 0, w, h).data;
      var ink = function (x, y) {
        var i = (y * w + x) * 4;
        if (d[i + 3] < 64) return false;                                  // 透けている＝紙
        return Math.min(d[i], d[i + 1], d[i + 2]) < 220;                  // 白くない＝墨
      };
      /* 印影の枠（周りの余白を外す）。1本あたり 0.5%以上 墨が在る線だけを 中身とみなす */
      var need = function (n) { return Math.max(1, Math.round(n * 0.005)); };
      var x0 = 0, x1 = w - 1, y0 = 0, y1 = h - 1, x, y, n;
      var colInk = function (xx) { var k = 0; for (var yy = 0; yy < h; yy++) if (ink(xx, yy)) k++; return k; };
      var rowInk = function (yy) { var k = 0; for (var xx = 0; xx < w; xx++) if (ink(xx, yy)) k++; return k; };
      while (x0 < x1 && colInk(x0) < need(h)) x0++;
      while (x1 > x0 && colInk(x1) < need(h)) x1--;
      while (y0 < y1 && rowInk(y0) < need(w)) y0++;
      while (y1 > y0 && rowInk(y1) < need(w)) y1--;
      var bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      if (bw < 4 || bh < 4) return { w: W, h: H, corner: null, boxW: bw, boxH: bh, ink: 0 };
      /* 四隅（印影の短い辺の CORNER 割） */
      var side = Math.max(2, Math.round(Math.min(bw, bh) * CORNER));
      var cnt = 0, tot = 0;
      var corners = [[x0, y0], [x1 - side + 1, y0], [x0, y1 - side + 1], [x1 - side + 1, y1 - side + 1]];
      corners.forEach(function (p) {
        for (y = 0; y < side; y++) for (x = 0; x < side; x++) { tot++; if (ink(p[0] + x, p[1] + y)) cnt++; }
      });
      /* 印影ぜんぶの墨の割合（空の画像を「丸」と言わない為に使う） */
      var all = 0;
      for (y = y0; y <= y1; y++) for (x = x0; x <= x1; x++) if (ink(x, y)) all++;
      n = all / (bw * bh);
      return { w: W, h: H, boxW: bw, boxH: bh, corner: tot ? cnt / tot : null, ink: n };
    });
  }

  /** 画像 → 形と mm（当てた理由つき）。★墨がほとんど無い画像は 当てない★ */
  function guessFromUrl(dataUrl) {
    return measure(dataUrl).then(function (m) {
      if (!m || m.corner === null || m.ink < 0.02) {
        return Object.assign({ shape: 'unknown', mm: MM_KAKU, sure: false,
          why: '印の形が 見つかりませんでした（薄すぎる／空の画像かもしれません）。'
            + '大きさは 既定の ' + MM_KAKU + 'mm のままにしています。' }, { measured: m });
      }
      return Object.assign(guess(m), { measured: m });
    });
  }

  /* ── ★入れた判子を 紙に押せる形に そろえる★ ────────────────────────────
     ★司さん 2026-08-30「ハンコの情報あるんやけんやれや」★
       ＝代行請求／Exally には ★hanko.js（白抜きの道具）★が 前から在った。
         うちだけ 持っていなかった＝★白い紙に押した判子を そのまま入れると
         白い四角が 社名の上に かぶさる★。
       ★借りてよいのは 道具★（うちの決まり）＝hanko.js は ★1文字も変えずに★ 写した
         （見張り tests/hanko-same.test.mjs が 中身の同じさを 機械で照らす）。

     ここでやる3つ（★どれも やったら 画面で言う。黙ってやらない★）:
       ① 白抜き   … 白〜薄い背景を 透かす（HankoTool.process の auto）
       ② 余白を切る … 印影の外側の空きを 落とす（写真は 余白だらけ＝小さく見える）
       ③ 縮める   … 長辺が MAX_PX を超える時だけ（倉庫は 1行に入れるので 上限が在る）
     ★勝手に「小さくして通す」はしない★＝上限を超えたままなら 上限の話は 呼ぶ側が 赤で返す。 */
  var MAX_PX = 600;

  function toPng(img, box, scale) {
    var c = global.document.createElement('canvas');
    c.width = Math.max(1, Math.round(box.w * scale));
    c.height = Math.max(1, Math.round(box.h * scale));
    var x = c.getContext('2d');
    x.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }

  /** 透けていない所（＝印影）の 四角を返す。無ければ null */
  function inkBox(img) {
    var W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    if (!W || !H) return null;
    var c = global.document.createElement('canvas');
    c.width = W; c.height = H;
    var ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    var d = ctx.getImageData(0, 0, W, H).data;
    var x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var i = (y * W + x) * 4;
        if (d[i + 3] < 64) continue;
        if (Math.min(d[i], d[i + 1], d[i + 2]) >= 220) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return null;
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, W: W, H: H };
  }

  /** 判子を そろえる。返り = Promise<{dataUrl, did:[…], w, h}>（did＝やった事の言葉） */
  function prepare(dataUrl, opts) {
    var o = opts || {};
    var max = o.maxPx || MAX_PX;
    var HK = global.HankoTool;
    var did = [];
    var step1 = HK
      /* ★返ってくる名前は dataURL（URLが大文字）★＝借りた道具の書き方に こちらが合わせる。
         ★道具は 1文字も変えない★ので、間違えたら ここが 直す所（2026-08-30 実際に間違えた）。 */
      ? HK.process(dataUrl, { mode: 'auto' }).then(function (r) {
        var u = r && (r.dataURL || r.dataUrl);
        if (u && u !== dataUrl) did.push('白い背景を 透かしました');
        return u || dataUrl;
      }).catch(function () { return dataUrl; })
      : Promise.resolve(dataUrl);

    return step1.then(function (url) {
      return loadImage(url).then(function (img) {
        var box = inkBox(img);
        if (!box) return { dataUrl: url, did: did, w: img.naturalWidth || img.width, h: img.naturalHeight || img.height };
        var margin = (box.w * box.h) / (box.W * box.H);
        var trimmed = (box.w !== box.W || box.h !== box.H);
        /* ★切るのは「余白が はっきり在る時」だけ★＝1〜2点の誤差で 毎回 切り直さない */
        if (trimmed && margin < 0.98) did.push('まわりの余白を 切りました');
        else { box = { x: 0, y: 0, w: box.W, h: box.H, W: box.W, H: box.H }; }
        var scale = 1, long = Math.max(box.w, box.h);
        if (long > max) { scale = max / long; did.push('大きすぎたので ' + max + '点に 縮めました'); }
        var out = (did.length || scale !== 1) ? toPng(img, box, scale) : url;
        return { dataUrl: out, did: did,
          w: Math.round(box.w * scale), h: Math.round(box.h * scale) };
      });
    }).catch(function () { return { dataUrl: dataUrl, did: [], w: 0, h: 0 }; });
  }

  var API = { guess: guess, measure: measure, guessFromUrl: guessFromUrl,
    prepare: prepare, inkBox: inkBox, MAX_PX: MAX_PX,
    MM_KAKU: MM_KAKU, MM_MARU: MM_MARU, KAKU_MIN: KAKU_MIN, MARU_MAX: MARU_MAX, CORNER: CORNER };
  global.SeikyuSeal = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
