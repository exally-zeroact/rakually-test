/* ym-picker.js — 対象月の選択（「2026年8月」の1つの選択肢）
 *
 * なぜこの形か（2026-08-04・司さんの実機 iPhone）:
 *   ① もともと <input type="month"> を使っていたが ★iOS Safari は type="month" を持っていない★
 *      → ただの文字入力になって月が選べなかった。
 *   ② そこで「年」「月」の2つの選択肢にしたら、375px幅で
 *      ★「8月 ∨」が隣の「全員 ∨」の枠に食い込んで重なった★（幅が足りない）。
 *   ⇒ ★1つにまとめる。★ 端末や版で挙動が変わる物に頼らず、どこでも同じに動く select 1つ。
 *
 * 並べる月（★理由）:
 *   今日の月から【過去24ヶ月〜先1ヶ月】＝26件。
 *   ・給与は「今月」と「直近の過去月（訂正・再計算）」しか触らないので、これで足りる。
 *   ・全部の年月を並べると長すぎて選べない（スマホのホイールで探せない）。
 *   ・★今入っている値がこの範囲の外なら、その月も必ず足す★（過去の明細を開いた時に選べなくならない）。
 *
 * 使い方（HTML側）:
 *   <input type="hidden" data-ym class="finput scr-month" value="2026-08">
 *   → この部品が、その直前に「2026年8月」の select を差し込む。
 *   ★hidden の input はそのまま残す＝既存のコードは今までどおり
 *     `el.value` を読む／書く、`change` を待つ、で動く（呼び出し側を1行も変えない）。
 *
 * 差し込みは MutationObserver で自動＝あとから描き直される画面でも人が呼び忘れない。
 * 守り: tests/ym-picker.test.mjs（1つであること・重ならないこと）／
 *       tests/ios-unsupported.test.mjs（type=month の再発）
 */
(function (global) {
  'use strict';
  var doc = global.document;
  if (!doc) return;

  var MARK = 'ymPicked';
  var BACK = 24, FWD = 1;   // 過去24ヶ月 〜 先1ヶ月

  function pad2(n) { return ('0' + n).slice(-2); }
  function parseYm(v) {
    var m = /^(\d{4})-(\d{2})$/.exec(String(v || ''));
    if (!m) return null;
    return { y: +m[1], m: +m[2] };
  }
  function thisYm() { var d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 }; }
  function key(p) { return p.y + '-' + pad2(p.m); }
  function label(p) { return p.y + '年' + p.m + '月'; }
  function shift(p, n) {
    var t = p.y * 12 + (p.m - 1) + n;
    return { y: Math.floor(t / 12), m: (t % 12) + 1 };
  }

  /* 並べる月の一覧（新しい順）。今入っている値が範囲外なら必ず足す。 */
  function monthsFor(cur) {
    var base = thisYm(), out = [], seen = {};
    for (var i = FWD; i >= -BACK; i--) { var p = shift(base, i); out.push(p); seen[key(p)] = 1; }
    if (cur && !seen[key(cur)]) {
      out.push(cur);
      out.sort(function (a, b) { return (b.y * 12 + b.m) - (a.y * 12 + a.m); });
    }
    return out;
  }

  function enhance(input) {
    if (!input || input.dataset[MARK]) return;
    input.dataset[MARK] = '1';

    var value = input.value;
    var wrap = doc.createElement('span');
    wrap.className = 'ym-pick';
    var sel = doc.createElement('select');
    sel.className = 'finput ym-one';
    sel.setAttribute('aria-label', '対象月');
    wrap.appendChild(sel);
    if (input.parentNode) input.parentNode.insertBefore(wrap, input);

    function paint() {
      var cur = parseYm(value) || thisYm();
      var list = monthsFor(cur);
      var want = list.map(key).join(',');
      if (sel.dataset.list !== want) {
        sel.innerHTML = '';
        list.forEach(function (p) {
          var o = doc.createElement('option');
          o.value = key(p); o.textContent = label(p);
          sel.appendChild(o);
        });
        sel.dataset.list = want;
      }
      sel.value = key(cur);
    }

    // ★既存コードの `el.value = '2026-08'` で select も追随させる（呼び出し側を変えないため）
    try {
      Object.defineProperty(input, 'value', {
        configurable: true,
        get: function () { return value; },
        set: function (v) { value = String(v == null ? '' : v); paint(); },
      });
    } catch (e) { /* 定義できない環境では select 側の操作だけ効く */ }
    paint();

    sel.addEventListener('change', function () {
      value = sel.value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  function scan(root) {
    var host = root || doc;
    if (!host.querySelectorAll) return;
    Array.prototype.forEach.call(host.querySelectorAll('input[data-ym]'), enhance);
  }

  function start() {
    scan(doc);
    if (global.MutationObserver && doc.body) {
      new global.MutationObserver(function () { scan(doc); }).observe(doc.body, { childList: true, subtree: true });
    }
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();

  global.YmPicker = { scan: scan, enhance: enhance, parseYm: parseYm, monthsFor: monthsFor };
})(typeof window !== 'undefined' ? window : globalThis);
