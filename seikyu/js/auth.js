/* auth.js — 請求書のログイン（メール+パスワード / Supabase auth）
 * ==============================================================================
 * ★Exally・給与(Kyually)と同じ倉庫・同じアカウント★＝1回のログインで全部使える。
 * ログイン画面そのものは全アプリ共通の部品（js/exally-login.js）が一次情報。ここには書き写さない。
 *
 * ★中身(#app)は hidden のまま出発する★
 *   接続設定が読めない端末・JSが落ちた端末でも、データが露出したままにならない。
 *
 * ★利用権（課金）の関所はまだ付けない★
 *   請求書の課金は後（指示役の方針）。ここで中途半端に締めると、誤って締め出す side だけが増える。
 *   付ける時は js/auth.js の gateCheck と同じ形にする（exally_entitlements の app='invoice'）。
 */
(function (global) {
  'use strict';
  var hasSupa = !!(global.SUPA && global.SUPA.url && global.SUPA.key && global.supabase);

  function $(id) { return document.getElementById(id); }

  var LOGIN = null;
  function mountLogin(sbForLogin) {
    if (LOGIN) return LOGIN;
    LOGIN = global.ExallyLogin.mount({
      app: '請求書',
      sb: sbForLogin,
      note: 'ホーム・給料明細も、同じメールとパスワードで入れます。',
      onLogin: function (user) { afterLogin((user && user.email) || ''); },
    });
    return LOGIN;
  }
  function show() { if (LOGIN) LOGIN.show(); var a = $('app'); if (a) a.hidden = true; }
  function hide() { if (LOGIN) LOGIN.hide(); var a = $('app'); if (a) a.hidden = false; }
  function fail(t) { if (LOGIN) LOGIN.error(t || ''); }

  var NG = function () { return Promise.resolve({ error: { message: '接続設定が読み込めませんでした' } }); };
  if (!hasSupa) {
    mountLogin({ auth: { signInWithPassword: NG, signUp: NG } });
    show();
    fail('この端末では接続設定が読み込めませんでした');
    return;
  }

  var sb = global.supabase.createClient(global.SUPA.url, global.SUPA.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  mountLogin(sb);
  var curEmail = '';

  function header() {
    var w = $('who'); if (w) { w.textContent = curEmail || ''; w.title = curEmail || ''; }
    var o = $('b-logout');
    if (o) o.onclick = function () { sb.auth.signOut().then(function () { location.reload(); }); };
  }

  function afterLogin(email) {
    curEmail = email || curEmail;
    if (!(global.SeikyuApp && global.SeikyuApp.attach)) { hide(); header(); return; }
    global.SeikyuApp.attach(sb).then(function () {
      hide();
      header();
    }).catch(function (e) {
      // ★読めなかったのに画面だけ出さない。何が起きたかを言う。
      fail((global.ExallyLogin ? global.ExallyLogin.friendly(e) : (e && e.message)) || '読み込めませんでした');
    });
  }

  sb.auth.getSession().then(function (r) {
    var s = r && r.data && r.data.session;
    if (s) afterLogin((s.user && s.user.email) || ''); else show();
  }).catch(function () { show(); });
  sb.auth.onAuthStateChange(function (_e, s) { if (!s) show(); });
})(window);
