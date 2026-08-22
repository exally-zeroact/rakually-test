// rakually-login-forgot.test.mjs — ★パスワードを忘れた（2026-08-23 追加）★
//  共通ログイン部品(js/rakually-login.js)の逃げ道を、実物のDOMで押して確かめる:
//   - 倉庫が resetPasswordForEmail を持つ時だけ ボタンを出す（出来ない物のボタンを見せない）
//   - メール未入力で押したら 送らずに言葉で返す
//   - 送ったら「送りました」の札。★その住所が登録されているかは言わない★
//   - 戻り先(redirectTo)に ★自分の目印 pwreset=1★ が付いている
//   - メールから戻ってきた人（?pwreset=1 / #type=recovery / 合図PASSWORD_RECOVERY）は
//     ★新しいパスワードを決める札★ が最初から出る
//   - 6文字未満は updateUser を呼ばない／決めたら onLogin が呼ばれ 目印がURLから消える
//   - 回帰: ふつうのログイン・新規登録は前のまま
//  依存: jsdom。使い方: node kyuyo/tests/rakually-login-forgot.test.mjs
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
let JSDOM; try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません。この検証は飛ばせません（SKIPを緑と呼ばない）。npm install してください。'); process.exit(1); }

let pass = 0, fail = 0;
function T(name, fn) { return Promise.resolve().then(fn).then(() => { pass++; console.log('  ✓ ' + name); }, e => { fail++; console.log('  ✗ ' + name + ' — ' + (e && e.message)); }); }
function ok(c, m) { if (!c) throw new Error(m || 'expected truthy'); }
function eq(a, b, m) { if (a !== b) throw new Error((m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); }

const SRC = fs.readFileSync(path.join(ROOT, '..', 'js/rakually-login.js'), 'utf8');
function loadLogin(url) {
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'dangerously', url: url || 'http://localhost/app.html', pretendToBeVisual: true });
  const win = dom.window;
  const el = win.document.createElement('script');
  el.textContent = SRC;
  win.document.body.appendChild(el);
  ok(win.RakuallyLogin && win.RakuallyLogin.mount, 'RakuallyLogin.mount 露出');
  return win;
}
// mock supabase auth。呼ばれた回数と 渡された中身を記録する。
function makeSb(opt) {
  const o = opt || {};
  const calls = { reset: 0, update: 0, signIn: 0, signUp: 0, resetArgs: null, updateArgs: null };
  const auth = {
    signInWithPassword: function () { calls.signIn++; return Promise.resolve(o.signIn || { data: { user: { email: 'a@b.com' } } }); },
    signUp: function () { calls.signUp++; return Promise.resolve(o.signUp || { data: { user: {}, session: { access_token: 't' } } }); },
    updateUser: function (a) { calls.update++; calls.updateArgs = a; return Promise.resolve(o.update || { data: { user: { email: 'a@b.com' } } }); },
    onAuthStateChange: function (cb) { calls.onAuth = cb; return { data: { subscription: { unsubscribe: function () {} } } }; },
  };
  if (!o.noReset) auth.resetPasswordForEmail = function (email, a) { calls.reset++; calls.resetArgs = [email, a]; return Promise.resolve(o.reset || {}); };
  return { calls, auth };
}
function fill(win, email, pw) {
  win.document.getElementById('loginEmail').value = email;
  if (pw != null) win.document.getElementById('loginPass').value = pw;
}
function clickAsync(win, id) { const b = win.document.getElementById(id); ok(b, '#' + id + ' が無い'); return Promise.resolve(b.onclick()); }

console.log('\n[rakually-login] パスワードを忘れた（逃げ道）');
const runs = [];

runs.push(T('倉庫が再設定を持たない版では ★ボタンを見せない★（出来ない物のボタンを出さない）', async function () {
  const win = loadLogin();
  const sb = makeSb({ noReset: true });
  win.RakuallyLogin.mount({ app: '給料明細', sb, onLogin: function () {} }).show();
  ok(!win.document.getElementById('btnForgot'), 'btnForgot は出ない');
  ok(win.document.getElementById('btnLogin'), 'ログインボタンは出ている');
}));

runs.push(T('持っている版では ボタンが出る／押せる字の色が付いている', async function () {
  const win = loadLogin();
  win.RakuallyLogin.mount({ app: '給料明細', sb: makeSb({}), onLogin: function () {} }).show();
  const b = win.document.getElementById('btnForgot');
  ok(b, 'btnForgot が出る');
  eq(b.textContent, 'パスワードを忘れた', '言い方');
  ok(/login-forgot/.test(b.className), 'Rakually の押せる字の見た目を使う');
}));

runs.push(T('メール未入力で押したら ★送らない★・言葉で返す', async function () {
  const win = loadLogin();
  const sb = makeSb({});
  win.RakuallyLogin.mount({ app: '給料明細', sb, onLogin: function () {} }).show();
  fill(win, '   ', '');
  await clickAsync(win, 'btnForgot');
  eq(sb.calls.reset, 0, '★1通も送らない★');
  ok(/メールアドレスを入れて/.test(win.document.getElementById('loginErr').textContent), '入れてくださいと言う');
}));

runs.push(T('送ったら「送りました」の札／★登録されているかは言わない★／宛先は出す', async function () {
  const win = loadLogin();
  const sb = makeSb({});
  win.RakuallyLogin.mount({ app: '給料明細', sb, onLogin: function () {} }).show();
  fill(win, 'z@b.com', '');
  await clickAsync(win, 'btnForgot');
  eq(sb.calls.reset, 1, '1回だけ送る');
  const box = win.document.getElementById('loginResetSent');
  ok(box, '送りましたの札が出る');
  const t = win.document.getElementById('loginOv').textContent;
  ok(/z@b\.com/.test(t), '宛先を出す');
  ok(!/登録されて|見つかりません|ありません/.test(t), '★その住所が有るか無いかを言わない（当てられてしまう）★');
  ok(!win.document.getElementById('btnLogin'), 'ログインの札は消えている');
}));

runs.push(T('戻り先に ★自分の目印 pwreset=1★ が付いている（版が変わっても拾えるように）', async function () {
  const win = loadLogin();
  const sb = makeSb({});
  win.RakuallyLogin.mount({ app: '給料明細', sb, onLogin: function () {} }).show();
  fill(win, 'z@b.com', '');
  await clickAsync(win, 'btnForgot');
  const [email, arg] = sb.calls.resetArgs;
  eq(email, 'z@b.com', '宛先');
  ok(arg && typeof arg.redirectTo === 'string', 'redirectTo を渡している');
  ok(/\?pwreset=1$/.test(arg.redirectTo), '★目印 pwreset=1★ が付いている: ' + arg.redirectTo);
  ok(arg.redirectTo.indexOf('http://localhost/app.html') === 0, '★自分のページに戻す（他アプリへ飛ばさない）★: ' + arg.redirectTo);
}));

runs.push(T('送信が失敗したら 札を出さず 言葉で返す', async function () {
  const win = loadLogin();
  const sb = makeSb({ reset: { error: { message: 'Failed to fetch' } } });
  win.RakuallyLogin.mount({ app: '給料明細', sb, onLogin: function () {} }).show();
  fill(win, 'z@b.com', '');
  await clickAsync(win, 'btnForgot');
  ok(!win.document.getElementById('loginResetSent'), '送りましたの札は出さない');
  ok(/つながりません/.test(win.document.getElementById('loginErr').textContent), '読める言葉で返す');
}));

for (const [name, url] of [['?pwreset=1', 'http://localhost/app.html?pwreset=1'],
                           ['#type=recovery', 'http://localhost/app.html#type=recovery&access_token=x']]) {
  runs.push(T('メールから戻ってきた人（' + name + '）は ★新しいパスワードの札★ が最初に出る', async function () {
    const win = loadLogin(url);
    win.RakuallyLogin.mount({ app: '給料明細', sb: makeSb({}), onLogin: function () {} });
    ok(win.document.getElementById('loginReset'), '再設定の札が出る');
    ok(win.document.getElementById('loginNew'), '新しいパスワードの欄がある');
    ok(!win.document.getElementById('btnLogin'), 'ログインの札は出ていない（袋小路にしない）');
  }));
}

runs.push(T('合図 PASSWORD_RECOVERY でも ★新しいパスワードの札★ に切り替わる', async function () {
  const win = loadLogin();
  const sb = makeSb({});
  win.RakuallyLogin.mount({ app: '給料明細', sb, onLogin: function () {} }).show();
  ok(win.document.getElementById('btnLogin'), 'はじめはログインの札');
  ok(typeof sb.calls.onAuth === 'function', '合図を受け取る用意がある');
  sb.calls.onAuth('PASSWORD_RECOVERY', {});
  ok(win.document.getElementById('loginReset'), '再設定の札に切り替わる');
}));

runs.push(T('6文字未満は ★倉庫を呼ばない★・言葉で返す', async function () {
  const win = loadLogin('http://localhost/app.html?pwreset=1');
  const sb = makeSb({});
  win.RakuallyLogin.mount({ app: '給料明細', sb, onLogin: function () {} });
  win.document.getElementById('loginNew').value = '12345';
  await clickAsync(win, 'btnSetPass');
  eq(sb.calls.update, 0, '★updateUser を呼ばない★');
  ok(/6文字以上/.test(win.document.getElementById('loginResetErr').textContent), '6文字以上と言う');
}));

runs.push(T('決めたら 倉庫に渡す／onLogin が呼ばれる／★目印がURLから消える★', async function () {
  const win = loadLogin('http://localhost/app.html?pwreset=1');
  const sb = makeSb({});
  let loggedIn = 'まだ';
  win.RakuallyLogin.mount({ app: '給料明細', sb, onLogin: function (u) { loggedIn = u; } });
  win.document.getElementById('loginNew').value = 'newpass1';
  await clickAsync(win, 'btnSetPass');
  eq(sb.calls.update, 1, 'updateUser を1回だけ呼ぶ');
  eq(sb.calls.updateArgs.password, 'newpass1', '決めたパスワードを渡す');
  ok(loggedIn !== 'まだ', '★決め終わったら そのまま入れる（ログイン画面に戻さない）★');
  ok(win.location.search.indexOf('pwreset') < 0, '★目印が消える（読み直しで また再設定画面が出ない）★: ' + win.location.search);
}));

runs.push(T('決めるのに失敗したら 入れない・言葉で返す', async function () {
  const win = loadLogin('http://localhost/app.html?pwreset=1');
  const sb = makeSb({ update: { error: { message: 'Password should be at least 6 characters' } } });
  let loggedIn = null;
  win.RakuallyLogin.mount({ app: '給料明細', sb, onLogin: function (u) { loggedIn = u; } });
  win.document.getElementById('loginNew').value = 'newpass1';
  await clickAsync(win, 'btnSetPass');
  ok(!loggedIn, '入れない');
  ok(/6文字以上/.test(win.document.getElementById('loginResetErr').textContent), 'friendly な言葉');
}));

// ── 回帰：前からの動きを壊していないか ──
runs.push(T('回帰: ふつうのログインは前のまま', async function () {
  const win = loadLogin();
  const sb = makeSb({});
  let loggedIn = null;
  win.RakuallyLogin.mount({ app: '給料明細', sb, onLogin: function (u) { loggedIn = u; } }).show();
  fill(win, 'a@b.com', 'secret1');
  await clickAsync(win, 'btnLogin');
  ok(loggedIn && loggedIn.email === 'a@b.com', 'onLogin が呼ばれる');
}));

runs.push(T('回帰: 確認メール待ちの札は前のまま出る', async function () {
  const win = loadLogin();
  const sb = makeSb({ signUp: { data: { user: { email: 'new@b.com' }, session: null } } });
  win.RakuallyLogin.mount({ app: '給料明細', sb, onLogin: function () {} }).show();
  fill(win, 'new@b.com', 'secret1');
  await clickAsync(win, 'btnSignup');
  ok(win.document.getElementById('loginConfirmSent'), '確認メール待ちの札');
}));

await Promise.all(runs);
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
