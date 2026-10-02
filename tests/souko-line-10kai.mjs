/* souko-line-10kai.mjs — ★客の ログイン→倉庫 の 線が 詰まるのは この PC だけか★を 数える（測り専用・使い捨て）
 * =============================================================================
 * ★棚③（指示役と 合わせた・2026-10-03）★
 *   症状：①ログインの 再試し（3回目で 79.8秒 の 回が あった）／②倉庫への 線が ときどき 丸ごと
 *         止まり ★約19秒で 落ちて 返る★（実測 18,973〜18,983ms・WebKit/Chromium 両方・10回に1回）。
 *   問い：これは ★この PC の 網★か、★倉庫が その時だけ 遅い★か。客の ログインでも 起きるか。
 *   割り方：★同じ 時間帯★に GitHub（workflow_dispatch）で N回／手元で N回 回して 並べる。
 *
 * ★数える 物（2つ・別々に）★
 *   ㋐ ログインの 再試し … hairu() の kai（何回目で 入れたか）・1回の 秒（_hairu.mjs の 使い回し）
 *   ㋑ 線落ち … 網で 手を 入れて いない 要求（auth/v1・rest/v1 の GET 等）で
 *      requestfailed に なった／≥15秒 掛かった 物を 道（auth/v1・rest/v1/<棚>）と 方法で 分けて 数える
 *
 * ★書きの 扱い（指示役・案A＋穴ふさぎ）★
 *   客の 道「ログイン→読み」だけでも アプリは 自分で 書きに 行く 事が ある（auth.js:61→PersistSave 等）。
 *   ⇒ 網で `/rest/v1/pay_**` の GET/HEAD 以外を ★偽の 200（fulfill）★で 止める（abort は requestfailed に
 *      なり ㋑と 混ざるので 使わない）。倉庫は 1行も 動かない。
 *   ⇒ 止めた（偽200で 返した）書きの 本数は ★別に★ 出す（0＝書かない／1以上＝書きに 行ったが 倉庫に 届かず）。
 *   ⇒ ㋑で 数える requestfailed は ★網で 手を 入れて いない 要求だけ★（偽200の 物は 除く＝wazato）。
 *
 * ★安全★ 試験の 倉庫だけ（repoEnv==='test' 以外は 抜ける）・試験の 口だけ（test@test.com）・書き 0。
 *
 * 使い方:
 *   node tests/souko-line-10kai.mjs                 … WebKit+Chromium を 各10回
 *   node tests/souko-line-10kai.mjs --n=10 --kind=webkit
 *   node tests/souko-line-10kai.mjs --self-test     … ブラウザ 無しで 選び方だけ 見る
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const SELF = argv.includes('--self-test');
const N = (() => { const m = argv.find((a) => a.startsWith('--n=')); const n = m ? Number(m.slice(4)) : 10; return Number.isInteger(n) && n > 0 ? n : 10; })();
const KINDS = (() => {
  const m = argv.find((a) => a.startsWith('--kind='));
  const list = (m ? m.slice(7) : 'webkit,chromium').split(',').map((s) => s.trim()).filter(Boolean);
  return list.filter((k) => k === 'webkit' || k === 'chromium');
})();
/* GitHub か 手元か（出しの 頭に 出す・どちらの 数か 取り違えない） */
const BA = process.env.GITHUB_ACTIONS === 'true' ? 'GitHub' : '手元';
const OSOI_MS = 15000;   /* これ以上 掛かった 要求は「遅い」として 別に 数える（19秒の 線落ちを 拾う） */

/* ★要求の 道を 分ける★（auth/v1/<動作>・rest/v1/<棚>・その他） */
function michiWake(u) {
  const s = String(u || '');
  let m = s.match(/\/auth\/v1\/([^/?]+)/);
  if (m) return 'auth/v1/' + m[1];
  m = s.match(/\/rest\/v1\/([^/?]+)/);
  if (m) return 'rest/v1/' + m[1];
  m = s.match(/\/(storage|realtime|functions)\/v1\/([^/?]+)/);
  if (m) return m[1] + '/v1/' + m[2];
  return s.replace(/^https?:\/\/[^/]+/, '').split('?')[0].slice(0, 40) || '(空)';
}

/* ───────── --self-test（ブラウザ 無し）───────── */
if (SELF) {
  let ng = 0; const iu = (na, ok) => { console.log((ok ? '  ✓ ' : '  ✗ ') + na); if (!ok) ng++; };
  iu('N は 正の 整数（既定10）', N === 10);
  iu('kind は webkit/chromium だけ 通す', JSON.stringify(KINDS) === '["webkit","chromium"]');
  iu('auth の 道を 分ける', michiWake('https://x.supabase.co/auth/v1/token?grant_type=password') === 'auth/v1/token');
  iu('rest の 棚を 分ける', michiWake('https://x.supabase.co/rest/v1/pay_companies?select=*') === 'rest/v1/pay_companies');
  iu('その他は 道だけ', michiWake('https://x.supabase.co/health') === '/health');
  iu('OSOI_MS は 15秒（19秒の 線落ちを 拾う）', OSOI_MS === 15000);
  console.log('\n[souko-line-10kai] --self-test ' + (ng ? '★' + ng + '個 おかしい★' : '★全部 合う★'));
  process.exit(ng ? 1 : 0);
}

/* ───────── 本番の repo では 走らせない（字で 言ってから 抜ける）───────── */
{
  const { kagiAru } = await import('./_hairu.mjs');
  if (!(await kagiAru(ROOT))) {
    console.log('[souko-line-10kai] — ★この repo（本番）には 試験の 鍵が 無いので ここでは 測れません★'
      + '（★テスト線で 測っています★）');
    process.exit(0);
  }
}

/* ───────── playwright を 借りる ───────── */
let borrow, pwLaunch;
try { ({ borrow, launch: pwLaunch } = await import('../scripts/_borrow-playwright.mjs')); }
catch (e) { console.log('🟡 ★未測定★ playwright を 借りる 道具が 読めない … ' + (e && e.message)); process.exit(2); }

const { hairu, shizumaru } = await import('./_hairu.mjs');

/* ───────── アプリを 手元で 配信 ───────── */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const srv = http.createServer((rq, rs) => {
  let p = path.join(ROOT, decodeURIComponent(rq.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { rs.writeHead(404); rs.end('x'); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  rs.end(fs.readFileSync(p));
});
await new Promise((r) => srv.listen(0, r));
const PORT = srv.address().port;
const URL = 'http://127.0.0.1:' + PORT + '/kyuyo/';

/* 1回分の 測り */
async function hitokai(b) {
  const cx = await b.newContext();
  const pg = await cx.newPage();
  const wazato = new WeakSet();            /* 網で 偽200に した 要求（㋑から 除く） */
  const start = new Map();                 /* 要求→開始ms */
  const kekka = { tometa: 0, shizen: [], osoi: [] };  /* tometa=止めた書き／shizen=自然な失敗／osoi=≥15秒 */

  /* ★網★ pay_ の GET/HEAD 以外を 偽の 200 で 止める（abort は 使わない） */
  await pg.route('**/rest/v1/pay_**', (rt) => {
    const m = rt.request().method();
    if (m === 'GET' || m === 'HEAD') return rt.continue();
    kekka.tometa++;
    wazato.add(rt.request());
    return rt.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  pg.on('request', (r) => { start.set(r, Date.now()); });
  const owari = (r, ok) => {
    const t0 = start.get(r); start.delete(r);
    const ms = t0 ? Date.now() - t0 : null;
    const u = String(r.url());
    const host = /supabase|\/auth\/v1\/|\/rest\/v1\//.test(u);
    if (!host) return;                      /* 倉庫への 要求だけ 見る（手元の http は 除く） */
    if (!ok && !wazato.has(r)) kekka.shizen.push({ michi: michiWake(u), hou: r.method(), ms });
    if (ms != null && ms >= OSOI_MS && !wazato.has(r)) kekka.osoi.push({ michi: michiWake(u), hou: r.method(), ms, ok });
  };
  pg.on('requestfinished', (r) => owari(r, true));
  pg.on('requestfailed', (r) => owari(r, false));

  const t0 = Date.now();
  const hai = await hairu(pg, URL, '.bn[data-scr]');
  const loginMs = Date.now() - t0;
  /* 入った 後、初期読み（倉庫から batches/employees）が 静まるまで 待つ＝線落ちを 拾う 窓 */
  const sh = hai.haitta ? await shizumaru(pg, 1500, 25000) : null;

  await pg.close().catch(() => {});
  await cx.close().catch(() => {});
  return { kai: hai.kai, haitta: hai.haitta, loginMs, naze: hai.naze || '',
    tometa: kekka.tometa, shizen: kekka.shizen, osoi: kekka.osoi,
    shizuka: sh ? sh.shizuka : null, shizuMatta: sh ? sh.matta : null };
}

/* ───────── 回す ───────── */
console.log('\n[souko-line-10kai] ★客の ログイン→倉庫 の 線（' + BA + '・各 ' + N + '回）★  接続先=' + URL);
const subete = {};
for (const kind of KINDS) {
  const t = await borrow('souko-line-10kai', kind);
  if (!t) continue;                         /* borrow が 未測定で 抜ける（ここには 来ない） */
  const b = await pwLaunch('souko-line-10kai', t, { }, kind);
  if (!b) continue;
  const runs = [];
  for (let i = 1; i <= N; i++) {
    let r;
    try { r = await hitokai(b); }
    catch (e) { r = { kai: null, haitta: false, loginMs: null, naze: '転んだ … ' + String((e && e.message) || e).slice(0, 80), tometa: 0, shizen: [], osoi: [] }; }
    runs.push(r);
    const sa = r.shizen.length, os = r.osoi.length;
    console.log('  [' + kind + ' ' + i + '/' + N + '] '
      + (r.haitta ? '入れた(' + r.kai + '回目・' + r.loginMs + 'ms)' : '★入れず(' + r.kai + '回試・' + r.naze + ')★')
      + ' ／ 止めた書き ' + r.tometa + '本'
      + ' ／ 自然な失敗 ' + sa + '本' + (sa ? '（' + r.shizen.map((x) => x.hou + ' ' + x.michi + ' ' + x.ms + 'ms').join('／') + '）' : '')
      + ' ／ ≥15秒 ' + os + '本' + (os ? '（' + r.osoi.map((x) => x.hou + ' ' + x.michi + ' ' + x.ms + 'ms' + (x.ok ? '返' : '落')).join('／') + '）' : ''));
  }
  await b.close().catch(() => {});

  /* まとめ（この kind） */
  const haitta = runs.filter((r) => r.haitta).length;
  const saitameshi = runs.filter((r) => r.haitta && r.kai > 1).length;      /* ㋐ 再試しが 要った 回 */
  const saidaiKai = runs.reduce((a, r) => Math.max(a, r.kai || 0), 0);
  const senochi = runs.filter((r) => r.shizen.length || r.osoi.length).length;  /* ㋑ 線落ちが 出た 回 */
  const kakiIta = runs.filter((r) => r.tometa > 0).length;                   /* 書きに 行った 回 */
  const loginMss = runs.filter((r) => r.haitta).map((r) => r.loginMs).sort((a, b2) => a - b2);
  const chuou = loginMss.length ? loginMss[Math.floor(loginMss.length / 2)] : null;
  const saidaiMs = loginMss.length ? loginMss[loginMss.length - 1] : null;
  subete[kind] = { n: N, haitta, saitameshi, saidaiKai, senochi, kakiIta, chuou, saidaiMs,
    shizenZen: runs.flatMap((r) => r.shizen), osoiZen: runs.flatMap((r) => r.osoi) };
}

/* ───────── 出し（指示役の 形）───────── */
console.log('\n===== まとめ（' + BA + '・各 ' + N + '回）=====');
for (const kind of KINDS) {
  const s = subete[kind];
  if (!s) { console.log(kind + '：未測定（借りられない）'); continue; }
  console.log(kind + '：' + BA + ' ' + s.n + '回中  ㋐再試し ' + s.saitameshi + '回（最大 ' + (s.saidaiKai || '—') + '回目で 入れた）'
    + '・㋑線落ち ' + s.senochi + '回');
  console.log('    入れた ' + s.haitta + '/' + s.n + '回 ／ ログインの 秒 中央 ' + (s.chuou != null ? s.chuou + 'ms' : '—') + '・最長 ' + (s.saidaiMs != null ? s.saidaiMs + 'ms' : '—'));
  console.log('    書きに 行った 回 ' + s.kakiIta + '/' + s.n + '（偽200で 止めた＝倉庫には 届かず）');
  const byMichi = {};
  for (const x of s.shizenZen) { const k = x.hou + ' ' + x.michi; byMichi[k] = (byMichi[k] || 0) + 1; }
  console.log('    ㋑自然な失敗の 内訳：' + (Object.keys(byMichi).length ? Object.entries(byMichi).map(([k, v]) => k + '×' + v).join('／') : 'なし'));
  console.log('    ㋑≥15秒の 内訳：' + (s.osoiZen.length ? s.osoiZen.map((x) => x.hou + ' ' + x.michi + ' ' + x.ms + 'ms' + (x.ok ? '返' : '落')).join('／') : 'なし'));
}
/* 機械で 拾える 1行（workflow で 表に する 為） */
console.log('\nSUMMARY_JSON=' + JSON.stringify({ ba: BA, n: N, kinds: subete }));
process.exit(0);
