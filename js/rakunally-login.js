/* rakunally-login.js — Exally 共通のログイン画面
 * ==================================================================
 * 全アプリ（売上管理・代行請求・給料明細…）で同じ見た目・同じ言い方にするための部品。
 * 画面の作りも文言もここが一次情報＝各アプリに書き写さない。
 *
 * 使い方:
 *   <script src="rakunally-login.js"></script>
 *   var LOGIN = RakunallyLogin.mount({
 *     app: "売上管理",          // カードに出すアプリ名
 *     sb: SB,                   // supabase クライアント
 *     onLogin: function (user) {…}, // ログインできたら呼ばれる
 *   });
 *   LOGIN.show();  // ログイン画面を出す
 *   LOGIN.hide();  // 閉じる
 *
 * 出す要素のid（テストや他アプリからも触れるよう固定）:
 *   #loginOv / #loginEmail / #loginPass / #loginErr / #btnLogin / #btnSignup
 */
(function (root) {
  "use strict";

  var CSS_ID = "rakunally-login-css";
  var CSS = [
    ".login-ov{position:fixed;inset:0;background:#eef7f1;z-index:400;display:none;",
    "align-items:center;justify-content:center;overflow:auto;",
    "padding:24px 18px calc(24px + env(safe-area-inset-bottom));}",
    ".login-ov.open{display:flex;}",
    ".login-card{width:100%;max-width:380px;background:#ffffff;border:1px solid #d4eae0;",
    "border-radius:20px;box-shadow:0 6px 22px rgba(30,80,46,.10);padding:26px 20px 22px;",
    "text-align:center;box-sizing:border-box;}",
    ".login-logo{font-family:'DM Mono',ui-monospace,monospace;font-size:27px;letter-spacing:2px;",
    "color:#52b788;}",
    ".login-logo span{font-family:'Noto Sans JP',sans-serif;font-size:11px;letter-spacing:1px;",
    "color:#7aa08c;margin-left:6px;}",
    ".login-title{font-size:15px;font-weight:700;color:#2f5d45;margin:10px 0 2px;}",
    ".login-sub{font-size:12px;color:#7aa08c;margin-bottom:16px;}",
    ".login-inp{width:100%;box-sizing:border-box;font-size:16px;padding:13px 14px;",
    "border:1px solid #d4eae0;border-radius:12px;background:#ffffff;color:#24422f;",
    "margin-bottom:10px;font-family:inherit;outline:none;-webkit-appearance:none;}",
    ".login-inp:focus{border-color:#52b788;}",
    ".login-err{min-height:18px;font-size:12px;color:#c0392b;margin-bottom:6px;white-space:pre-wrap;}",
    /* ログインと新規登録の間の案内。近い方（新規登録）に付いて見えるよう上を空けて下は詰める */
    ".login-mid{font-size:11.5px;color:#7aa08c;line-height:1.9;margin:16px 0 7px;word-break:keep-all;}",
    ".login-note{font-size:11px;color:#7aa08c;line-height:1.7;margin-top:14px;}",
    ".login-btn{width:100%;box-sizing:border-box;font-family:inherit;font-size:14px;",
    "font-weight:700;padding:14px 16px;border-radius:14px;cursor:pointer;border:1px solid transparent;}",
    ".login-btn-main{background:#2f8f5b;color:#ffffff;}",
    ".login-btn-sub{background:#eef7f1;color:#2f8f5b;border-color:#d4eae0;}",
    ".login-btn:disabled{opacity:.55;}",
    /* ★パスワードを忘れた人の逃げ道★（これが無いと、その人は二度と自分のデータに入れない）
       押せる物なので色を付ける。見た目は Rakunally の緑のまま＝他アプリから持ってこない。 */
    ".login-forgot{background:none;border:0;padding:8px 4px 0;font-family:inherit;",
    "font-size:12px;color:#2f8f5b;text-decoration:underline;cursor:pointer;}",
    ".login-forgot:disabled{opacity:.55;}",
  ].join("");

  function injectCss() {
    if (document.getElementById(CSS_ID)) return;
    var st = document.createElement("style");
    st.id = CSS_ID;
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // 出す言葉は全アプリ共通。生のエラー文をそのまま見せない。
  function friendly(e) {
    var m = String((e && e.message) || e || "");
    if (/Invalid login credentials/i.test(m)) return "メールかパスワードが違います";
    if (/User already registered/i.test(m))
      return "そのメールはもう登録されています。ログインしてください";
    if (/Password should be at least/i.test(m)) return "パスワードは6文字以上にしてください";
    if (/Email not confirmed/i.test(m))
      return "メールの確認がまだです。届いたメールを開いてください";
    if (/Failed to fetch|NetworkError|fetch failed/i.test(m))
      return "つながりませんでした。電波を確かめてください";
    return m;
  }

  /* ★「メールから戻ってきた人」の見分け方を3通り持つ★
       ①自分で付けた目印 pwreset=1（? でも # でも拾う）
       ②Supabase が付ける type=recovery
       ③Supabase からの合図 PASSWORD_RECOVERY（mount の中で拾う）
     1つの拾い方だけにすると、版が変わった日に静かに袋小路になる。 */
  var RESET_MARK = "pwreset=1";
  var recoveryOn = false;
  function isRecovery() {
    if (recoveryOn) return true;
    try {
      var h = String(location.hash || "") + "&" + String(location.search || "");
      if (h.indexOf(RESET_MARK) >= 0) return true;
      return /(^|[#&?])type=recovery(&|$)/.test(h);
    } catch (e) {
      return false;
    }
  }
  // 決め終わったら目印を消す（再読み込みで また再設定画面が出るのを防ぐ）
  function cleanUrl() {
    try {
      if (!history || !history.replaceState) return;
      var q = String(location.search || "").replace(RESET_MARK, "").replace(/[?&]+$/, "");
      if (q === "?") q = "";
      history.replaceState(null, "", location.pathname + q);
    } catch (e) { /* 消せなくても 動きは止めない */ }
  }

  function mount(opt) {
    var o = opt || {};
    var sb = o.sb;
    injectCss();

    var ov = document.getElementById("loginOv");
    if (!ov) {
      ov = document.createElement("div");
      ov.className = "login-ov";
      ov.id = "loginOv";
      document.body.appendChild(ov);
    }
    /* ★登録の直後に袋小路にしない★（2026-08-21 実機で読んで見つけた）
       いままで：確認メールが要る設定だと session が無いのに そのままログインを試し、
       失敗して「登録できました。そのままログインしてください」と出していた。
       ＝★まだ入れないのに『入ってください』と言う★ので 何度でも失敗する。
       これから：session が無い＝確認メールを送った、と分かるので ★待ち画面を出す★。 */
    function cardHTML(){ return ''+
      '<div class="login-card">' +
      /* ★客が読む字はここだけ替える（2026-08-17 司さん「Rakually は別アプリ」）。
           ファイル名と中の仕組み(SMTP・確認メールの分岐)は据え置き＝1行だけ。 */
      '<div class="login-logo">Rakunally <span>ラクナリー</span></div>' +
      '<div class="login-title">' +
      esc(o.app || "") +
      "</div>" +
      '<div class="login-sub">メールでログイン</div>' +
      '<input class="login-inp" id="loginEmail" type="email" inputmode="email" ' +
      'autocomplete="email" placeholder="メールアドレス">' +
      '<input class="login-inp" id="loginPass" type="password" ' +
      'autocomplete="current-password" placeholder="パスワード（6文字以上）">' +
      '<div class="login-err" id="loginErr"></div>' +
      '<button class="login-btn login-btn-main" type="button" id="btnLogin">ログイン</button>' +
      /* ★出来ない物のボタンは見せない★＝倉庫がこの機能を持っている時だけ出す */
      (sb && sb.auth && sb.auth.resetPasswordForEmail
        ? '<div><button class="login-forgot" type="button" id="btnForgot">パスワードを忘れた</button></div>'
        : "") +
      // 折り返しの位置は自分で決める（機種任せだと語の途中で割れる）
      '<div class="login-mid">はじめての方は、メールとパスワードを<br>' +
      "入力してから新規登録ボタンを押して下さい</div>" +
      '<button class="login-btn login-btn-sub" type="button" id="btnSignup">新規登録</button>' +
      '<div class="login-note">' +
      esc(o.note || "一度ログインすれば、次からは自動で入れます。") +
      "</div>" +
      "</div>"; }

    function confirmHTML(email){ return ''
      + '<div class="login-card" id="loginConfirmSent">'
      + '<div class="login-logo">Rakunally <span>ラクナリー</span></div>'
      + '<div class="login-title">確認メールを送りました</div>'
      + '<div class="login-sub">' + esc(email) + '</div>'
      + '<div class="login-mid">このメールに届いた リンクを押すと 登録が終わります。<br>'
      + '押してから ここへ戻って ログインしてください。</div>'
      + '<button class="login-btn login-btn-sub" type="button" id="btnBackLogin">ログイン画面へ戻る</button>'
      + '<div class="login-note">メールが見つからない時は、迷惑メールの箱も見てください。</div>'
      + '</div>'; }

    /* ★パスワードを忘れた（2026-08-23）★
       メールが本当に届くようになったので、逃げ道を作る。
       ①送った … 送った事だけを言う（「その住所が登録されているか」は言わない＝当てられてしまう）
       ②戻ってきた … 新しいパスワードを決める画面。決めるまでログイン画面に戻さない。 */
    function sentHTML(email){ return ''
      + '<div class="login-card" id="loginResetSent">'
      + '<div class="login-logo">Rakunally <span>ラクナリー</span></div>'
      + '<div class="login-title">パスワードの再設定メールを送りました</div>'
      + '<div class="login-sub">' + esc(email) + '</div>'
      + '<div class="login-mid">このメールに届いた リンクを押すと<br>'
      + '新しいパスワードを決める画面が開きます。</div>'
      + '<button class="login-btn login-btn-sub" type="button" id="btnBackLogin">ログイン画面へ戻る</button>'
      + '<div class="login-note">メールが見つからない時は、迷惑メールの箱も見てください。</div>'
      + '</div>'; }

    function resetHTML(){ return ''
      + '<div class="login-card" id="loginReset">'
      + '<div class="login-logo">Rakunally <span>ラクナリー</span></div>'
      + '<div class="login-title">新しいパスワードを決める</div>'
      + '<div class="login-sub">6文字以上</div>'
      + '<input class="login-inp" id="loginNew" type="password" '
      + 'autocomplete="new-password" placeholder="新しいパスワード">'
      + '<div class="login-err" id="loginResetErr"></div>'
      + '<button class="login-btn login-btn-main" type="button" id="btnSetPass">これにする</button>'
      + '</div>'; }

    function showLoginForm(){ ov.innerHTML = cardHTML(); bindCard(); }
    function showConfirmSent(email){
      ov.innerHTML = confirmHTML(email);
      document.getElementById("btnBackLogin").onclick = showLoginForm;
    }
    function showResetSent(email){
      ov.innerHTML = sentHTML(email);
      document.getElementById("btnBackLogin").onclick = showLoginForm;
    }
    function showResetForm(){ ov.innerHTML = resetHTML(); bindReset(); show(); }

    var $ = function (id) {
      return document.getElementById(id);
    };
    /* ★札(カード)を差し替える作りなので、今 出ていない部品を触りに行かない★
       （再設定の札には loginErr も loginPass も無い＝素で触ると そこで止まる） */
    function err(msg) {
      var e = $("loginErr");
      if (e) e.textContent = msg || "";
    }
    function busy(on) {
      ["btnLogin", "btnSignup", "btnForgot"].forEach(function (id) {
        var b = $(id);
        if (b) b.disabled = on;
      });
    }
    function ok(user) {
      err("");
      var p = $("loginPass");
      if (p) p.value = "";
      hide();
      if (o.onLogin) o.onLogin(user);
    }
    function show() {
      ov.classList.add("open");
    }
    function hide() {
      ov.classList.remove("open");
    }

    async function login() {
      var email = $("loginEmail").value.trim();
      var pass = $("loginPass").value;
      if (!email || !pass) {
        err("メールとパスワードを入れてください");
        return;
      }
      err("");
      busy(true);
      var r = await sb.auth.signInWithPassword({ email: email, password: pass });
      busy(false);
      if (r.error) {
        err(friendly(r.error));
        return;
      }
      ok(r.data.user);
    }

    async function signup() {
      var email = $("loginEmail").value.trim();
      var pass = $("loginPass").value;
      if (!email || pass.length < 6) {
        err("メールと、6文字以上のパスワードを入れてください");
        return;
      }
      err("");
      busy(true);
      var r = await sb.auth.signUp({ email: email, password: pass });
      if (r.error) {
        busy(false);
        err(friendly(r.error));
        return;
      }
      // メール確認オフのときは、登録の直後にそのまま入れる
      if (r.data.session) {
        busy(false);
        ok(r.data.user);
        return;
      }
      /* ★ここで もう一度ログインを試さない★＝確認が済むまで必ず失敗する（袋小路） */
      busy(false);
      showConfirmSent(email);
    }

    async function forgot() {
      var email = $("loginEmail").value.trim();
      if (!email) {
        err("メールアドレスを入れてから押してください");
        return;
      }
      err("");
      busy(true);
      /* ★戻り先に自分で目印を付ける★＝Supabase の付け方（# か ? か type=recovery）が
         版で変わっても、こちらで拾えるようにする。
         ★このURLは倉庫の「戻ってよい一覧」に入っていないと弾かれる★（2026-08-23 に登録済） */
      var back = location.origin + location.pathname + "?" + RESET_MARK;
      var r = await sb.auth.resetPasswordForEmail(email, { redirectTo: back });
      busy(false);
      if (r && r.error) {
        err(friendly(r.error));
        return;
      }
      showResetSent(email);
    }

    async function setNewPass() {
      var pw = $("loginNew").value;
      if (!pw || pw.length < 6) {
        $("loginResetErr").textContent = "6文字以上で決めてください";
        return;
      }
      $("loginResetErr").textContent = "";
      $("btnSetPass").disabled = true;
      var r = await sb.auth.updateUser({ password: pw });
      $("btnSetPass").disabled = false;
      if (r && r.error) {
        $("loginResetErr").textContent = friendly(r.error);
        return;
      }
      recoveryOn = false;
      cleanUrl();
      // 決め終わった時点で もう入れている＝ログイン画面に戻さない
      ok((r && r.data && r.data.user) || null);
    }

    function bindCard() {
      $("btnLogin").onclick = login;
      $("btnSignup").onclick = signup;
      if ($("btnForgot")) $("btnForgot").onclick = forgot;
      $("loginPass").onkeydown = function (ev) {
        if (ev.key === "Enter") login();
      };
    }
    function bindReset() {
      $("btnSetPass").onclick = setNewPass;
      $("loginNew").onkeydown = function (ev) {
        if (ev.key === "Enter") setNewPass();
      };
    }

    if (isRecovery()) showResetForm();
    else showLoginForm();
    /* ★Supabase 側からの合図でも受ける★＝目印が消えても袋小路にしない */
    try {
      if (sb && sb.auth && sb.auth.onAuthStateChange) {
        sb.auth.onAuthStateChange(function (ev) {
          if (ev === "PASSWORD_RECOVERY") { recoveryOn = true; showResetForm(); }
        });
      }
    } catch (e) { /* 合図が無い版でも 目印で拾えるので止めない */ }

    return { show: show, hide: hide, error: err, el: ov, isRecovery: isRecovery };
  }

  root.RakunallyLogin = { mount: mount, friendly: friendly };
})(typeof window !== "undefined" ? window : this);
