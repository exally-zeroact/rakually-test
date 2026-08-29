/* seikyu-pdf.js — ★Rakunally の紙を そのまま PDF にする★（自作PDF）
 * =============================================================================
 * ★司さん 2026-08-30★
 *   「自作PDFのやり方しか指示してないわ」
 *   「Rakunallyの請求書の形かえろなんか言うてなかろが」
 *   「八木工業なんか控除ありのカラム式やろが」
 *
 * ★だから こう作った★
 *   ・★紙の形は 今の紙のまま★（seikyu-paper.js が 作る HTML）。★design を 2つ 持たない★。
 *   ・この紙は ★描かれた物を そのまま 座標で 写す★だけ＝
 *     ★DOM を 測って（字の位置・大きさ・色・線）★ pdf-lib で 同じ所に 置く。
 *   ⇒ ★様式を増やしても・列を足しても・控除や繰越や振込先が 増えても、
 *      ここは 1行も 直らない★（写すだけだから）。
 *
 * ★なぜ 自作PDFなのか（代行のコードに書いてある理由）★
 *   「iOS Safari の window.print() は ★ページ最下部に URL＋日付を 勝手に付ける★
 *     （ブラウザの仕様で CSS では消せない）」
 *   ＋ 字を ★埋め込む★ので 相手の端末に その字が 無くても 化けない。
 *
 * ★借り物（道具だけ）★ vendor/pdf-lib.min.js ／ vendor/fontkit.umd.min.js
 *   ／ vendor/fonts/BIZUDPGothic-Regular.ttf（OFL）
 *   ★紙の形は 借りていない★（代行の様式は 使わない）。
 *
 * ★渡し口は 1本★＝出来たバイト列は ★FileOut.deliver★ へ渡す（ここでは 落とさない）。
 *
 * 【利用】ブラウザ window.SeikyuPdf
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SeikyuPdf = api;
  else if (typeof globalThis !== 'undefined') globalThis.SeikyuPdf = api;
})(this, function () {
  'use strict';

  /* ★紙の大きさ★ 画面の紙は A4 を 96dpi の px で 組んである（794×1123）。
     PDF は pt（72dpi）＝A4 595.28×841.89pt。★同じ紙なので 比で 写す★。 */
  var PX_W = 794, PX_H = 1123;
  var PT_W = 595.28, PT_H = 841.89;
  var K = PT_W / PX_W;                       // px → pt（縦横 同じ比）

  var ASSETS = {
    pdfLib: 'vendor/pdf-lib.min.js',
    fontkit: 'vendor/fontkit.umd.min.js',
    font: 'vendor/fonts/BIZUDPGothic-Regular.ttf',
  };
  var _cache = null;

  /** 道具を 1回だけ 読む（★押した時だけ 読む★＝画面を重くしない） */
  function loadAssets(base) {
    if (_cache) return _cache;
    var b = base || '../';
    _cache = script(b + ASSETS.pdfLib, 'PDFLib')
      .then(function () { return script(b + ASSETS.fontkit, 'fontkit'); })
      .then(function () { return fetch(b + ASSETS.font); })
      .then(function (r) {
        if (!r.ok) throw new Error('字が 読めません（' + b + ASSETS.font + '）');
        return r.arrayBuffer();
      })
      .then(function (buf) {
        return { PDFLib: window.PDFLib, fontkit: window.fontkit, fontBytes: buf };
      });
    return _cache;
  }
  function script(src, globalName) {
    if (window[globalName]) return Promise.resolve();
    return new Promise(function (ok, ng) {
      var el = document.createElement('script');
      el.src = src;
      el.onload = function () {
        if (!window[globalName]) ng(new Error(src + ' を読んでも ' + globalName + ' が出ません'));
        else ok();
      };
      el.onerror = function () { ng(new Error(src + ' が 読めません')); };
      document.head.appendChild(el);
    });
  }

  /* ═══ 描かれた紙を 測る（★箱ではなく 描かれた物★） ═══════════════ */

  /** 1ページぶんの「置いてある物」を 読む */
  function readPage(pageEl) {
    var doc = pageEl.ownerDocument;               // ★iframe の中の document★
    var win = doc.defaultView;
    var base = pageEl.getBoundingClientRect();
    var out = { texts: [], boxes: [] };

    /* ① 線と塗り（枠・下線・帯）＝computed style から 実際に 描かれている物だけ */
    var all = pageEl.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var r = el.getBoundingClientRect();
      if (r.width < 0.5 || r.height < 0.5) continue;
      var c = win.getComputedStyle(el);
      var bg = c.backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
        out.boxes.push({ kind: 'fill', x: r.left - base.left, y: r.top - base.top,
          w: r.width, h: r.height, color: bg });
      }
      ['Top', 'Right', 'Bottom', 'Left'].forEach(function (side) {
        var wpx = parseFloat(c['border' + side + 'Width']) || 0;
        var st = c['border' + side + 'Style'];
        if (!wpx || st === 'none' || st === 'hidden') return;
        var col = c['border' + side + 'Color'];
        var x = r.left - base.left, y = r.top - base.top, w = r.width, h = r.height;
        var seg = { kind: 'line', color: col, w: wpx };
        if (side === 'Top') { seg.x1 = x; seg.y1 = y; seg.x2 = x + w; seg.y2 = y; }
        if (side === 'Bottom') { seg.x1 = x; seg.y1 = y + h; seg.x2 = x + w; seg.y2 = y + h; }
        if (side === 'Left') { seg.x1 = x; seg.y1 = y; seg.x2 = x; seg.y2 = y + h; }
        if (side === 'Right') { seg.x1 = x + w; seg.y1 = y; seg.x2 = x + w; seg.y2 = y + h; }
        out.boxes.push(seg);
      });
    }

    /* ② 字（★Range で 1行ずつ 測る★＝折り返しも そのまま写る） */
    var walker = doc.createTreeWalker(pageEl, win.NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = walker.nextNode())) {
      var v = n.nodeValue;
      if (!v || !v.trim()) continue;
      var p = n.parentElement;
      if (!p) continue;
      var pc = win.getComputedStyle(p);
      if (pc.visibility === 'hidden' || pc.display === 'none') continue;
      var rg = doc.createRange();
      rg.selectNodeContents(n);
      var rects = rg.getClientRects();
      if (!rects.length) continue;
      /* 1行ごとに 切る（折り返した所で 別の行として 置く） */
      var lines = splitByLine(n, rects.length);
      for (var j = 0; j < rects.length; j++) {
        var rr = rects[j];
        if (rr.width < 0.5 || rr.height < 0.5) continue;
        out.texts.push({
          s: lines[j] !== undefined ? lines[j] : v.trim(),
          x: rr.left - base.left,
          /* ★字の下端（ベースラインの近く）★ pdf-lib は 左下から 置くので 下端で持つ */
          y: rr.bottom - base.top,
          w: rr.width, h: rr.height,
          size: parseFloat(pc.fontSize) || 12,
          color: pc.color,
          bold: (parseInt(pc.fontWeight, 10) || 400) >= 600,
          descent: descentOf(pc),
        });
      }
    }
    return out;
  }

  /** 折り返した行ごとの文字（Range を 1文字ずつ 進めて 行の変わり目で 切る） */
  function splitByLine(node, lineCount) {
    var v = node.nodeValue;
    if (lineCount <= 1) return [v.trim()];
    var out = [], cur = '', lastTop = null;
    var rg = node.ownerDocument.createRange();
    for (var i = 0; i < v.length; i++) {
      rg.setStart(node, i); rg.setEnd(node, i + 1);
      var r = rg.getBoundingClientRect();
      var top = Math.round(r.top);
      if (lastTop !== null && top !== lastTop) { out.push(cur); cur = ''; }
      cur += v[i];
      lastTop = top;
    }
    if (cur) out.push(cur);
    return out.map(function (s) { return s.replace(/^\s+|\s+$/g, ''); });
  }

  /** 字の下に出る分（y をベースラインへ戻す為の目安） */
  function descentOf(pc) {
    var size = parseFloat(pc.fontSize) || 12;
    return size * 0.18;                       // BIZ UD 系の 実測に近い値（下に出る分）
  }

  /* ═══ 色 ═══ */
  function rgbOf(css, rgb) {
    var m = /rgba?\(([^)]+)\)/.exec(String(css || ''));
    if (!m) return rgb(0, 0, 0);
    var p = m[1].split(',').map(function (x) { return parseFloat(x); });
    return rgb((p[0] || 0) / 255, (p[1] || 0) / 255, (p[2] || 0) / 255);
  }
  function alphaOf(css) {
    var m = /rgba\(([^)]+)\)/.exec(String(css || ''));
    if (!m) return 1;
    var p = m[1].split(',');
    return p.length >= 4 ? parseFloat(p[3]) : 1;
  }

  /* ═══ 出す ═══════════════════════════════════════════════════ */

  /**
   * 紙のHTMLを PDF のバイト列にする
   * @param {string} html seikyu-paper.js の build() が返す紙のHTML
   * @param {object} opt { base:'../', css:'…' }
   * @return {Promise<Uint8Array>}
   */
  function build(html, opt) {
    var o = opt || {};
    return loadAssets(o.base).then(function (a) {
      /* ★紙は まるごと1枚のHTML（<!DOCTYPE html> から）★＝
         ★iframe に そのまま 起こす★。div に入れると CSS が効かず ★真っ白になる★
         （2026-08-30 実際に 真っ白のPDFを 作った）。 */
      return stage(html, o.css).then(function (st) {
        try {
          var d = st.doc;
          /* ★1枚ぶんの入れ物★＝この紙は .sheet（様式が増えても ここだけ見る） */
          var pages = d.querySelectorAll('.sheet');
          if (!pages.length) pages = d.body ? [d.body] : [];
          if (!pages.length) throw new Error('紙の中身が 見つかりません（.sheet が 0個）');
          var read = [];
          for (var i = 0; i < pages.length; i++) read.push(readPage(pages[i]));
          var total = read.reduce(function (n, r) { return n + r.texts.length; }, 0);
          if (!total) throw new Error('紙に 字が 1つも ありません（測れていません）');
          return draw(a, read);
        } finally {
          st.close();
        }
      });
    });
  }

  /** 紙を 画面の外で 起こす（★本物のCSSが 効いた状態★で 測る） */
  function stage(html, extraCss) {
    return new Promise(function (ok, ng) {
      var fr = document.createElement('iframe');
      fr.setAttribute('aria-hidden', 'true');
      fr.style.cssText = 'position:fixed;left:-10000px;top:0;width:' + PX_W + 'px;height:'
        + (PX_H * 3) + 'px;border:0;background:#fff';
      fr.onload = function () {
        var d = fr.contentDocument;
        if (extraCss) {
          var st = d.createElement('style');
          st.textContent = extraCss;
          d.head.appendChild(st);
        }
        var go = function () {
          ok({ doc: d, close: function () { try { document.body.removeChild(fr); } catch (e) { /* もう無い */ } } });
        };
        /* ★字が 揃うまで 待つ★（揃う前に測ると 位置が ずれる） */
        if (d.fonts && d.fonts.ready) d.fonts.ready.then(go, go);
        else go();
      };
      fr.onerror = function () { ng(new Error('紙を 起こせません')); };
      /* ★中身を 入れてから 置く★（先に置くと about:blank の load が 先に鳴って
         ★空の紙を 測ってしまう★＝2026-08-30 に 実際に 0字で 出た） */
      fr.srcdoc = html;
      document.body.appendChild(fr);
    });
  }

  function draw(a, pages) {
    var PDFLib = a.PDFLib, rgb = PDFLib.rgb;
    return PDFLib.PDFDocument.create().then(function (doc) {
      doc.registerFontkit(a.fontkit);
      /* ★字は 全部 埋め込む★（相手の端末に 無くても 化けない） */
      /* ★字は 全部 埋める（subset を 使わない）★
         ★2026-08-30 実測★ subset:true にすると 40KB／0.33秒 まで 小さくなるが、
         ★字が 本当に 落ちる★（絵にして 目で見たら 「請求書」が「書」だけになった）。
         ★取り出した字は 出ている★ので ★字を数えるだけでは 騙される★。
         ＝代行のコードの注記と 同じ事が 起きた：
           「pdf-libのサブセッタは 大きいフォントで 字を落とすバグがある」
         ⇒ ★subset は 使わない★。重さ（約2.9MB）は その代金。
         ★太字は 代行と同じ「少しずらして 2度 描く」★（字体を もう1つ 埋めると 倍になる）。 */
      return doc.embedFont(a.fontBytes, { subset: false }).then(function (font) {
        pages.forEach(function (pg) {
          var page = doc.addPage([PT_W, PT_H]);
          /* 塗り → 線 → 字 の順（後から置いた物が 上） */
          pg.boxes.forEach(function (b) {
            if (b.kind === 'fill') {
              if (alphaOf(b.color) === 0) return;
              page.drawRectangle({ x: b.x * K, y: PT_H - (b.y + b.h) * K,
                width: b.w * K, height: b.h * K, color: rgbOf(b.color, rgb) });
            } else {
              page.drawLine({ start: { x: b.x1 * K, y: PT_H - b.y1 * K },
                end: { x: b.x2 * K, y: PT_H - b.y2 * K },
                thickness: Math.max(0.3, b.w * K), color: rgbOf(b.color, rgb) });
            }
          });
          pg.texts.forEach(function (t) {
            var s = sanitize(t.s, font);
            if (!s) return;
            var at = { x: t.x * K, y: PT_H - (t.y - t.descent) * K,
              size: t.size * K, font: font, color: rgbOf(t.color, rgb) };
            page.drawText(s, at);
            /* ★太字＝少しずらして もう1度★（代行と同じやり方）
               ★取り出すと その字だけ 二重に見える★が、★紙は 正しい★。
               字体を もう1つ 埋めると PDFが 倍（5.9MB）になるので こちらを 取る。 */
            if (t.bold) page.drawText(s, Object.assign({}, at, { x: at.x + at.size * 0.03 }));
          });
        });
        return doc.save();
      });
    });
  }

  /** 字体が 持っていない字は ★〓★（黙って 消さない） */
  var _missing = [];
  function sanitize(s, font) {
    _missing = _missing || [];
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      try {
        font.widthOfTextAtSize(ch, 10);
        out += ch;
      } catch (e) {
        if (_missing.indexOf(ch) < 0) _missing.push(ch);
        out += '〓';
      }
    }
    return out;
  }
  function lastMissing() { return (_missing || []).slice(); }

  return { build: build, lastMissing: lastMissing,
    PX_W: PX_W, PX_H: PX_H, PT_W: PT_W, PT_H: PT_H, K: K, ASSETS: ASSETS,
    _readPage: readPage, _splitByLine: splitByLine, _rgbOf: rgbOf, _alphaOf: alphaOf };
});
