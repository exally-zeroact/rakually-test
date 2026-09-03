/* load-before-delete-live.mjs — ★本当に 開いて 倉庫が 減るか 数える★
 * ============================================================================
 * ★源を 読むだけの 見張り（load-before-delete.test.mjs）とは 別★＝これは ★実物を 動かす★。
 * 倉庫は ★テスト線の supa-config が 指す倉庫★だけ＝本番の棚は 1行も 触らない
 *   （起動時に scripts/repo-env.mjs で 確かめて test でなければ 止まる。★倉庫の名前は ここに 書かない★）。
 *
 * ★やる事（1周）★
 *   ① 倉庫を「山田 太郎・鈴木 花子」の ★2人★に 戻す
 *   ② ★まっさらな端末★（localStorage 空）で 給与の画面を 開いて ログイン
 *   ③ ★何も 押さずに★ 待つ（自動保存が 走る時間）
 *   ④ 倉庫の 人数を 数える ⇒ ★2人のままなら 無事・減っていたら 消えた★
 *
 * ★直す前の 実測（2026-09-03）＝10周で ★6回 消えた★（2人→1人）
 * 使い方: node kyuyo/tests/load-before-delete-live.mjs [周の数(既定10)] [--slow=3000] [--fail-load]
 *   --slow=3000 … 読み込みだけ 3秒 遅らせる（遅い回線の 端末を 作って 試す）
 *   --fail-load … ★読み込みだけ 落とす★（圏外・倉庫が 死んでいる 端末）
 *                 ⇒★1人も 消えない★のが 正しい（読めていないのに 消すのが P0）
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { borrow, launch as pwLaunch } from '../../scripts/_borrow-playwright.mjs';
import { repoEnv } from '../../scripts/repo-env.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CFG = fs.readFileSync(path.join(ROOT, 'js/supa-config.js'), 'utf8');
const URL_ = (/url:\s*'([^']+)'/.exec(CFG) || [])[1];
const KEY = (/key:\s*'([^']+)'/.exec(CFG) || [])[1];
const MAIL = 'test@test.com', PW = 'test1234';
const N = Number(process.argv.find((a) => /^\d+$/.test(a)) || 10);
const SLOW = Number((/--slow=(\d+)/.exec(process.argv.join(' ')) || [])[1] || 0);
const FAILLOAD = process.argv.includes('--fail-load');

/* ★本番の棚を 触らない★＝テスト線でなければ ここで 止まる。
   ★倉庫の名前を ここに 書かない★＝向き先を 持ってよいのは js/supa-config.js だけ（決まり）。
   環境を 答えるのは scripts/repo-env.mjs ★1か所だけ★（repo名やフォルダ名は 証拠に しない）。 */
const ENV = repoEnv(ROOT);
if (ENV !== 'test') {
  console.error('★中止★ ここは test では ない（repo-env の答え … ' + ENV + '）／向き先 ' + URL_);
  process.exit(2);
}
console.log('  倉庫 … ' + URL_ + '（repo-env の答え … ' + ENV + '）');

const api = async (p, opt = {}) => {
  const r = await fetch(URL_ + p, { ...opt, headers: { apikey: KEY, 'content-type': 'application/json', ...(opt.headers || {}) } });
  const t = await r.text();
  return { status: r.status, body: t ? JSON.parse(t) : null };
};
const login = await api('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: MAIL, password: PW }) });
if (login.status !== 200) { console.error('★中止★ テスト用の 鍵で 入れない … ' + login.status); process.exit(2); }
const TOK = login.body.access_token, UID = login.body.user.id;
const H = { Authorization: 'Bearer ' + TOK };

const FUTARI = [
  { id: 'e-live-yamada', account_id: UID, sort: 0, data: { id: 'e-live-yamada', name: '山田 太郎', base: 260000 } },
  { id: 'e-live-suzuki', account_id: UID, sort: 1, data: { id: 'e-live-suzuki', name: '鈴木 花子', base: 240000 } }
];
async function modosu() { /* 倉庫を 2人に 戻す */
  await api('/rest/v1/pay_employees?account_id=eq.' + UID, { method: 'DELETE', headers: H });
  await api('/rest/v1/pay_employees', { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(FUTARI) });
  await api('/rest/v1/pay_companies', {
    method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ account_id: UID, data: { v: 1, company: { name: '実測用の会社' } }, updated_at: new Date().toISOString() })
  });
}
const kazu = async () => ((await api('/rest/v1/pay_employees?select=id,data&account_id=eq.' + UID, { headers: H })).body || []);

/* ふつうのファイル置き場（配信と同じ形で 出す） */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((rq, rs) => {
  let p = path.join(ROOT, decodeURIComponent(rq.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { rs.writeHead(404); rs.end(); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  rs.end(fs.readFileSync(p));
});
await new Promise((r) => srv.listen(0, r));
const PORT = srv.address().port;

const webkit = await borrow('load-before-delete-live', 'webkit');
const b = await pwLaunch('load-before-delete-live', webkit);

console.log('\n[load-before-delete-live] ★まっさらな端末で ' + N + '回 開く★'
  + (SLOW ? '（★読み込みだけ ' + SLOW + 'ms 遅らせる★）' : '') + (FAILLOAD ? '（★読み込みを 落とす★）' : '') + ' … 倉庫=DB-test');
let heru = 0;
const nokori = [];
for (let i = 1; i <= N; i++) {
  await modosu();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); /* ★毎回 空の端末★ */
  if (SLOW) { /* 読み込み（従業員の取り出し）だけ 遅らせる＝遅い回線の 端末 */
    await ctx.route('**/rest/v1/pay_employees?select=data*', async (route) => {
      await new Promise((r) => setTimeout(r, SLOW)); await route.continue();
    });
  }
  if (FAILLOAD) { /* ★読み込みだけ 落とす★（保存は 通す＝それでも 消さないか を 見る） */
    await ctx.route('**/rest/v1/pay_employees?select=data*', (route) => route.abort());
    await ctx.route('**/rest/v1/pay_companies?select=data*', (route) => route.abort());
  }
  const pg = await ctx.newPage();
  await pg.goto('http://localhost:' + PORT + '/kyuyo/index.html', { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 1500));
  if (await pg.$('#loginEmail')) {
    await pg.fill('#loginEmail', MAIL); await pg.fill('#loginPass', PW); await pg.click('#btnLogin');
  }
  await new Promise((r) => setTimeout(r, 6000 + SLOW)); /* ★何も 押さずに 待つ★ */
  /* ★物差しを 疑う★＝落としたつもりが 落ちていない事が ある。
     ★#emp-list を 数えたら 両方とも 空だった★（あの一覧は 設定の画面でしか 描かれない）＝物差しが 盲だった。
     ⇒★画面に 出ている字★と ★その端末が 持った 一覧★の 両方で 見る（★出る組と 出ない組の 両方で★ 確かめる）。 */
  const mita = await pg.evaluate(() => {
    const t = (document.body.innerText || '').replace(/\s+/g, ' ');
    let ls = [];
    try { ls = (JSON.parse(localStorage.getItem('payslip_state_v1') || '{}').employees || []).map((e) => e.name); } catch (e) {}
    return { ji: t.indexOf('山田') >= 0, teoto: ls.join('・') };
  });
  /* ★画面の字で 探すと 嘘に なる★＝app.js に ★見本の「山田 太郎」が 6か所★ 書いてあり、
     読み込みを 落とした 回でも「読めた=はい」に なった（2026-09-03 実測）。
     ⇒★その端末が 実際に 持った 一覧★だけで 決める（落とす組=「従業員 1」／落とさない組=「山田・鈴木」）。 */
  const yonda = mita.teoto.indexOf('山田') >= 0;
  const now = await kazu();
  const names = now.map((r) => (r.data && r.data.name) || r.id).join('・');
  const ng = now.length < 2;
  if (ng) heru++;
  nokori.push(now.length);
  console.log('  ' + String(i).padStart(2) + '周目 … 倉庫 ' + now.length + '人' + (ng ? ' ★★減った★★' : ' （無事）') + '　' + names
    + '　／この端末が 持った一覧 ' + (mita.teoto || '(空)') + '　★倉庫を 読めた=' + (yonda ? 'はい' : 'いいえ') + '★');
  await ctx.close();
}
await b.close(); srv.close();
await modosu();

console.log('\n  ★' + N + '回 開いて 倉庫が 減った回 = ' + heru + '/' + N + '★'
  + '（直す前の 実測 6/10）　人数の内訳 … ' + nokori.join(','));
process.exit(heru ? 1 : 0);
