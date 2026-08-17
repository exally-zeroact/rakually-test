/* env-badge.js — ★テスト環境の帯（見た瞬間に本番でないと分かる）★
 * ==============================================================================
 * なぜ要るのか（2026-08-11 指示役の実測）:
 *   うちの他の5アプリは URL に "-test" が入っているのに、Exally だけ
 *     本番   https://exally.vercel.app/          （Vercel）
 *     テスト https://exally-zeroact.github.io/exally-staging/  （GitHub Pages）
 *   ＝★名前も配り方も違い、見た目で本番かテストか分からない★。
 *   一番 危ないのは URL ではなく画面です。★本番だと思ってテストに打つ／
 *   テストのつもりで本番を触る★が起きます。だから画面の一番上に帯を出します。
 *
 * ★何を見て決めるか＝ js/supa-config.js の env（この配信の名札）★
 *   ホスト名（github.io / vercel.app）では決めません。配り方は変わるが、
 *   ★本当に大事なのは「本番のデータか、テストのデータか」★だからです。
 *   倉庫のIDをこのファイルに書くのも禁じ手です（★向き先を持つのは supa-config.js だけ★
 *   という約束を tests/no-hardcoded-supa.test.mjs が守っている）。名札もそこに置きます。
 *
 * ★安全側の倒し方★
 *   ・env が 'test' と分かった時 ★だけ★ 出す
 *   ・本番(env:'prod')なら ★絶対に出さない★
 *   ・名札が無い／知らない値なら ★出さない★
 *   理由: 本番に「テスト環境」と出るのが一番 危ない（本番を軽く触ってしまう）。
 *        出ない事故は「気づかない」だけだが、誤って出る事故は「壊す」に繋がる。
 *
 * ★頭が隠れないようにする★
 *   帯は画面の一番上に固定するので、そのぶん中身を下げないと
 *   アプリの上の帯（sticky）や1行目が隠れます（iOSの status-bar と同じ前科）。
 *   ★帯の高さを測って body の上余白と sticky の top を足す★＝どの画面でも隠れない。
 *
 * 【利用】各HTMLの <head> ではなく本文の最後で読む（他のCSSより後に当てるため）
 */
(function (global) {
  'use strict';

  /* ★どの環境かは js/supa-config.js の env が唯一の正★
     倉庫のIDをここに書かない（★向き先を持つのは supa-config.js だけ★という約束。
     tests/no-hardcoded-supa.test.mjs が、他のファイルに書いたら赤にする）。 */
  var TEST = 'test';

  /**
   * 帯を出すか。★'test' と分かった時だけ true★
   *   本番(env:'prod')／名札が無い／知らない値 → ★出さない（安全側）★
   *   理由: 本番に「テスト環境」と出るのが一番 危ない（本番を軽く扱って壊す）。
   */
  function shouldShow(cfg) {
    var env = (cfg && typeof cfg === 'object') ? cfg.env : cfg;
    return String(env || '') === TEST;
  }

  /* 帯の見た目。★色は共通の皮に無い「注意」の色を使う（緑と混ぜない＝気づける）★
     文字は白・地は橙。うちの警告の橙(#92500A)より濃く、UIの緑とはっきり違う色にする。 */
  var CSS = [
    '#envbar{position:fixed;top:0;left:0;right:0;z-index:2147483000;',
    'background:#92500A;color:#FFFFFF;',
    "font-family:'Noto Sans JP',system-ui,-apple-system,sans-serif;",
    'font-size:12px;font-weight:700;line-height:1.5;text-align:center;',
    'padding:calc(6px + env(safe-area-inset-top)) 12px 6px;',
    'box-shadow:0 1px 4px rgba(0,0,0,.18);',
    /* ★文は1文字ずつ縦に割れない書き方（block・折り返し可・最低幅）★ */
    'white-space:normal;word-break:normal;overflow-wrap:break-word;}',
    '#envbar b{font-weight:700;}',
    '#envbar .envbar-sub{display:block;font-weight:400;font-size:10.5px;opacity:.92;}',
    '@media print{#envbar{display:none !important;}}',
  ].join('');

  function mount() {
    if (!shouldShow(global.SUPA)) return null;
    var d = global.document;
    if (!d || d.getElementById('envbar')) return null;

    var st = d.createElement('style');
    st.id = 'envbar-css';
    st.textContent = CSS;
    d.head.appendChild(st);

    var bar = d.createElement('div');
    bar.id = 'envbar';
    bar.setAttribute('role', 'status');
    bar.innerHTML = '<b>テスト環境</b>'
      + '<span class="envbar-sub">ここで入れた内容は本番には入りません（練習用の倉庫です）</span>';
    d.body.insertBefore(bar, d.body.firstChild);

    fit(bar);
    // 画面を回した・幅が変わった時も合わせ直す（帯が2行になると高さが変わる）
    global.addEventListener('resize', function () { fit(bar); });
    return bar;
  }

  /* ★帯のぶんだけ中身を下げる★（アプリの上の帯や1行目が隠れないように） */
  function fit(bar) {
    var d = global.document;
    var h = bar.offsetHeight || 0;
    if (!h) return;
    d.body.style.paddingTop = h + 'px';
    /* 画面の上に貼り付く物（appbar など）は、その下に来るよう top をずらす。
       ★動かすのは position:sticky だけ★
         fixed は「画面いっぱいに被せる物」（ログイン画面・小窓・下のナビ）に使われている。
         それを下げると ★被せ物に隙間が空き、下がはみ出す★（2026-08-11 実機で確認）。
         被せ物は帯より下に描かれるだけでよい（帯の z-index が上）。 */
    var all = d.querySelectorAll('body *');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.id === 'envbar') continue;
      var cs = global.getComputedStyle(el);
      if (cs.position !== 'sticky') continue;
      if (cs.top !== '0px' && el.getAttribute('data-envbar-top') !== '1') continue;
      el.style.top = h + 'px';
      el.setAttribute('data-envbar-top', '1');   // 幅が変わった時に測り直せるよう印を残す
    }
  }

  var API = { shouldShow: shouldShow, mount: mount, TEST: TEST, CSS: CSS };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else {
    global.ExallyEnvBadge = API;
    if (global.document) {
      if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', mount);
      } else {
        mount();
      }
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
