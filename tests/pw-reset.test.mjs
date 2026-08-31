/* pw-reset.test.mjs — ★パスワードの再設定が 最後まで できるか★
 * ============================================================================
 * ★司さん 2026-08-31（実機・本番）★
 *   「パスワード入れても入れんけん 再設定でメール送ったら、
 *     開いた瞬間は 新しいパスワードを打つ画面になるけど、
 *     打とうとしたら この画面に入って パスワード設定できん」
 *
 * ★正体★
 *   メールの合図（recovery）は ★その場で セッションを作る★。
 *   だから js/auth.js の getSession() が「入っている」と答え、
 *   afterLogin → hide() で ★再設定の欄ごと 消していた★（打つ前に 消える）。
 *
 * ★ここで見る事★
 *   ① 再設定の入口（#type=recovery）では ★セッションが在っても 中へ入らない★
 *   ② その画面に ★新しいパスワードを打つ欄と 決めるボタン★が 出ている
 *   ③ 決めたら（updateUser が通ったら）★そこで 初めて 中へ入る★
 *   ④ ふつうの入口（合図なし・セッション在り）では 今まで通り 中へ入る
 *      ＝★直し過ぎて 誰も入れない★を 作らない
 *
 * 使い方: node tests/pw-reset.test.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = process.argv.includes('--self-test');

let pass = 0, fail = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + ' — ' + m); } };

let JSDOM;
try { ({ JSDOM } = await import('jsdom')); }
catch { console.log('★jsdomが入っていません。この検証は飛ばせません。npm install してください。'); process.exit(1); }

/* ★偽の Supabase★＝メールから来た時と 同じ形（セッションが すでに在る） */
function fakeSb(opts) {
  const o = opts || {};
  const handlers = [];
  const session = o.session === undefined
    ? { user: { email: 'a@example.com' } } : o.session;
  return {
    _fire(ev, s) { handlers.forEach((h) => h(ev, s)); },
    _updated: null,
    auth: {
      getSession() { return Promise.resolve({ data: { session } }); },
      onAuthStateChange(fn) { handlers.push(fn); return { data: { subscription: { unsubscribe() {} } } }; },
      signInWithPassword() { return Promise.resolve({ data: {}, error: null }); },
      signUp() { return Promise.resolve({ data: {}, error: null }); },
      signOut() { return Promise.resolve({}); },
      resetPasswordForEmail() { return Promise.resolve({ data: {}, error: null }); },
      updateUser(p) { this._pw = p && p.password; return Promise.resolve({ data: { user: { email: 'a@example.com' } }, error: null }); },
    },
  };
}

async function boot(hash) {
  const file = path.join(ROOT, 'seikyu/index.html');
  const html = fs.readFileSync(file, 'utf8');
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''),
    { runScripts: 'dangerously', pretendToBeVisual: true,
      url: 'http://localhost/seikyu/index.html' + (hash || '') });
  const win = dom.window, doc = win.document;
  win.fetch = () => Promise.reject(new Error('no net'));
  win.scrollTo = () => {};
  /* ログインの部品だけ 読む（倉庫にも Hub にも つながない＝ここで見たいのは 入口の判断だけ） */
  for (const rel of ['js/rakunally-login.js']) {
    const el = doc.createElement('script');
    el.textContent = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    doc.body.appendChild(el);
  }
  return { win, doc };
}

console.log('\n[pw-reset] パスワードの再設定が 最後まで できるか');

/* ── ① 入口の判断（js/auth.js の中身を そのまま読む）───────────────── */
const authSrc = fs.readFileSync(path.join(ROOT, 'js/auth.js'), 'utf8');
T('★① 再設定の最中は 中へ入れない（入口の判断に 書いてある）',
  /inRecovery\(\)/.test(authSrc) && /if \(inRecovery\(\)\) \{ show\(\); return; \}/.test(authSrc),
  '★セッションが在るだけで 中へ入る作りのまま★');
T('★② 合図が あとから来ても 入られない（onAuthStateChange の側にも 蓋）',
  /onAuthStateChange\(function \([^)]*\) \{[\s\S]{0,200}inRecovery\(\)/.test(authSrc),
  '★あとから来た合図で 入ってしまう★');

/* ── ③ 画面：メールから来た形で 開くと 再設定の欄が 出る ───────────── */
{
  const { win, doc } = await boot('#access_token=xxx&type=recovery');
  const login = win.RakunallyLogin.mount({ sb: fakeSb() });
  await new Promise((r) => setTimeout(r, 50));
  const el = (id) => doc.getElementById(id);
  T('★③ メールから来た形なら 再設定と 分かる', login.isRecovery(), '★recovery と 見ていない★');
  T('★④ 新しいパスワードを打つ欄が 出ている', !!el('loginNew'), '★打つ欄が 無い★');
  T('★⑤ 決めるボタンが 出ている', !!el('btnSetPass'), '★決めるボタンが 無い★');
  T('★⑥ ふつうの「入る」ボタンは 出していない（迷わせない）', !el('btnLogin'),
    '★入るボタンが 一緒に出ている★');
}

/* ── ④ 決めたら 中へ入る（ok が呼ばれる）───────────────────────── */
{
  const { win, doc } = await boot('#access_token=xxx&type=recovery');
  const sb = fakeSb();
  let entered = 0;
  win.RakunallyLogin.mount({ sb: sb, onLogin: function () { entered++; } });
  await new Promise((r) => setTimeout(r, 50));
  doc.getElementById('loginNew').value = 'newpass123';
  doc.getElementById('btnSetPass').click();
  await new Promise((r) => setTimeout(r, 80));
  T('★⑦ 決めたら そこで 中へ入る', entered === 1, '入った回数 ' + entered);
  T('★⑧ 打った物が そのまま 渡っている', sb.auth._pw === 'newpass123', '渡った物: ' + sb.auth._pw);
}

/* ── ⑤ ふつうの入口は 今まで通り ───────────────────────────── */
{
  const { win, doc } = await boot('');
  const login = win.RakunallyLogin.mount({ sb: fakeSb() });
  await new Promise((r) => setTimeout(r, 50));
  T('★⑨ ふつうの入口では 再設定にしない', !login.isRecovery(), '★何でも再設定にしている★');
  T('★⑩ ふつうの入口には 入るボタンが 出ている', !!doc.getElementById('btnLogin'), '入るボタンが 無い');
}

if (SELF) {
  console.log('\n★自己確認★ 蓋を外した姿にすると 赤になるか');
  const broken = authSrc.replace(/if \(inRecovery\(\)\) \{ show\(\); return; \}/, '');
  const ok = !/if \(inRecovery\(\)\) \{ show\(\); return; \}/.test(broken);
  if (!ok) { console.log('  NG ★外しても 見つからない＝見張りが 効いていない★'); process.exit(1); }
  console.log('  ok  蓋の1行を 外すと ①が 赤になる形');
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
