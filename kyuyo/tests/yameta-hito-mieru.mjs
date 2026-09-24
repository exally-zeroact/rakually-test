/* yameta-hito-mieru.mjs — ★辞めた 人が 自分の 給与明細を ★本当に 開けるか★★（実ブラウザ）
 * =============================================================================
 * ★なぜ 要るか（司さん 2026-09-24「★1 見れた方がええやろが★」）★
 *   ★前★ … 会社が 従業員を 消すと `Store.unpublishMeisai` が
 *           `init_code / ★pw_hash★ / device_tokens / consent_at` を ★4つとも 空★に して いた。
 *           ⇒ ★★辞めた 人は 自分の 給与明細・源泉徴収票を 二度と 開けない★★
 *             （紙 `pay_meisai_docs` は 残る＝★会社は 見られる／本人は 見られない★）
 *   ★今★ … ★`pw_hash` は 消さない★＝★本人が 決めた 合言葉で 開ける★
 *
 * ★なぜ ★絵★で 見るか★
 *   同じ 所の 門（`kyuyo/tests/emp-kesu-meisai.test.mjs`）は ★ソースを 字として 読むだけ★だった。
 *   ⇒ ★★『字が 在る』と『押して 通る』は 別★★（2026-09-22 に 実物で 出た）。
 *   ⇒ ここは ★客の 画面を 本当に 開いて 出た 字で★ 見る。
 *
 * ★測る 事（★2本で 1組★）★
 *   ㋐ ★消した 後 ★本人の 合言葉★で 紙が 開ける★
 *   ㋑ ★消した 後 ★他人の 合言葉★では 開けない★（★開ける 方を 広げた 日に 隣も 広がって いないか★）
 *
 * ★★この 直しで 失う 物（紙にも 書いて あります）★★
 *   ★消した 人の リンクを 会社は ★二度と 止められません★★
 *   （止める 押し `.wm-reissue` は 在るが `listMeisaiPub(rosterIds())` が 名簿に 居ない 人を 外す）
 *   ⇒ ★『辞めた 人の リンクを 会社が 止められなくて よいか』は 司さんの 決め（棚）★
 *
 * 使い方:
 *   node kyuyo/tests/yameta-hito-mieru.mjs          … 測る
 *   node kyuyo/tests/yameta-hito-mieru.mjs --waza   … ★わざと 前の 形に 戻して 赤に なるか★
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WAZA = process.argv.includes('--waza');

{
  const { kagiAru } = await import('../../tests/_hairu.mjs');
  if (!(await kagiAru(ROOT))) {
    console.log('  — ★この repo（本番）には 試験の 鍵が 無いので ここでは 測れません★'
      + '（★テスト線で 測っています★／戻す条件＝本番CIに 鍵を 置いた日）');
    process.exit(0);
  }
}

let borrow, pwLaunch, hairu, osu, katazukeru, S;
try {
  ({ borrow, launch: pwLaunch } = await import('../../scripts/_borrow-playwright.mjs'));
  ({ hairu, osu } = await import('../../tests/_hairu.mjs'));
  ({ katazukeru } = await import('./_kyaku_no_michi_de_katazukeru.mjs'));
  S = await import('./_souko-kazoeru.mjs');
} catch (e) { console.log('🟡 ★未測定★ 道具が 読めない … ' + (e && e.message)); process.exit(2); }
const { toiawase, kankyoKa, kankyoIu, shikenNa, hitoTsukuru, hitoKesu, kagiTsukuru, kamiTsukuru, sekiIu } = S;

let pass = 0, fail = 0, mi = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };
const MI = (n, m) => { mi++; console.log('  🟡 ★未測定★ ' + n + (m ? ' … ' + m : '')); };
const machi = (ms) => new Promise((r) => setTimeout(r, ms));
const qs = (v) => "'" + String(v).replace(/'/g, "''") + "'";
const AI = 'tamesiAIkotoba1';      /* A の 合言葉 */
const BI = 'tamesiBIkotoba2';      /* B の 合言葉（★他人の★） */

console.log('[yameta-hito-mieru] ★辞めた 人が 自分の 明細を 開けるか（実ブラウザ）★'
  + (WAZA ? ' ★--waza＝わざと 前の 形（pw_hash も 空に する）に 戻す★' : ''));
console.log('  ★' + sekiIu() + '★');

{
  const t = await toiawase('select 1 as x');
  if (!t.ok) {
    if (kankyoKa(t.naze)) { kankyoIu('辞めた 人が 明細を 開けるか'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(0); }
    MI('倉庫に 問えない', t.naze); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(2);
  }
}

/* ── ①仕込み（★ここは SQL＝客の 道では ない★）────────────────────
   ★合言葉は 倉庫の crypt で 作る★＝`get_meisai` が 照らすのと ★同じ 関数★。 */
const tag = String(Date.now()).slice(-6);
const naA = shikenNa('試験' + tag + '　辞めた人');
const naB = shikenNa('試験' + tag + '　別の人');
async function shitaku(na, pw) {
  const h = await hitoTsukuru(na);
  if (!h.ok) return { ok: false, naze: h.naze };
  const k = await kagiTsukuru(h.id);
  if (!k.ok || !k.token) return { ok: false, id: h.id, naze: '鍵を 作れない … ' + (k.naze || '') };
  const m = await kamiTsukuru(k.token, { nakami: { person: { name: na, net: 234567 } } });
  if (!m.ok) return { ok: false, id: h.id, token: k.token, naze: '紙を 作れない … ' + (m.naze || '') };
  const u = await toiawase('update kyuyo.pay_meisai_pub set'
    + ' pw_hash = crypt(' + qs(pw) + ", gen_salt('bf')), consent_at = now(), init_code = null"
    + ' where token = ' + qs(k.token) + ' returning token');
  if (!u.ok || !(u.gyo || []).length) return { ok: false, id: h.id, token: k.token, naze: '合言葉を 置けない … ' + (u.naze || '0行') };
  return { ok: true, id: h.id, token: k.token };
}
const A = await shitaku(naA, AI);
const B = await shitaku(naB, BI);
const shimatsu = async () => {
  for (const x of [A, B]) {
    if (!x || !x.id) continue;
    await toiawase('delete from kyuyo.pay_payslips where employee_id = ' + qs(x.id));
    if (x.token) await toiawase('delete from kyuyo.pay_meisai_pub where token = ' + qs(x.token));
    await hitoKesu(x.id).catch(() => null);
  }
};
if (!A.ok || !B.ok) {
  MI('支度が 通らない', (A.naze || '') + ' / ' + (B.naze || ''));
  await shimatsu(); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(2);
}
console.log('  ★支度（SQL）★ A=' + naA + '（合言葉 在り）／ B=' + naB + '（★別人★）');

/* ── ②立てる（★--waza の 時だけ `store.js` を 前の 形に 戻して 出す★）──── */
const wk = await borrow('yameta-hito-mieru', 'webkit');
if (!wk) { MI('playwright を 借りられない'); await shimatsu(); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(2); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
let wazaAtta = false;
const srv = http.createServer((rq, rs) => {
  const url = decodeURIComponent(rq.url.split('?')[0]);
  let p = path.join(ROOT, url);
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { rs.writeHead(404); rs.end('x'); return; }
  let body = fs.readFileSync(p);
  if (WAZA && /kyuyo[\\/]js[\\/]store\.js$/.test(p)) {
    /* ★わざと 前の 形に 戻す★＝`unpublishMeisai` の update に `pw_hash:null` を 足す
       （★手元の ファイルは 1文字も 触りません★＝出す 時に だけ 差し替える） */
    const ji = body.toString('utf8');
    const mae = "update({ init_code:null, device_tokens:[], consent_at:null, fail_count:0, locked_until:null })";
    const ato = "update({ init_code:null, pw_hash:null, device_tokens:[], consent_at:null, fail_count:0, locked_until:null })";
    if (ji.indexOf(mae) >= 0) { wazaAtta = true; body = Buffer.from(ji.replace(mae, ato), 'utf8'); }
  }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  rs.end(body);
});
await new Promise((r) => srv.listen(0, r));
const PORT = srv.address().port;
const b = await pwLaunch('yameta-hito-mieru', wk);

/* ── ③客の 道で A を 消す ─────────────────────────────────── */
let keshita = false;
try {
  const pg = await b.newPage();
  const h = await hairu(pg, 'http://localhost:' + PORT + '/kyuyo/index.html', '.bn[data-scr="scr-settings"]');
  if (!h || h.ok === false) MI('会社の 画面に 入れない', (h && h.naze) || '');
  else {
    const r = await katazukeru(pg, { na: naA, machi, osu });
    r.michi.forEach((m) => console.log('     ' + m));
    keshita = !!r.ok;
    if (!r.ok) console.log('     ★消す 1押しが 通らなかった … ' + r.naze + '★');
  }
  await pg.close().catch(() => null);
} catch (e) { MI('消す 所で 転んだ', String((e && e.message) || e).slice(0, 120)); }

if (WAZA) T('★--waza の 差し替えが 効いた（字が 1か所 変わった）★', wazaAtta,
  wazaAtta ? '' : '★1文字も 変わって いない＝空振り★');
{
  const r = await toiawase('select count(*) filter (where pw_hash is not null) as pw, count(*) as zen'
    + ' from kyuyo.pay_meisai_pub where token = ' + qs(A.token));
  const g = r.ok ? ((r.gyo || [])[0] || {}) : {};
  console.log('  ★消した 後の A の 鍵★ … 行 ' + (g.zen === undefined ? '?' : g.zen)
    + ' ／ 合言葉が 生きて いる ' + (g.pw === undefined ? '?' : g.pw) + '本'
    + (WAZA ? '（★--waza なので 0本が 正しい★）' : '（★1本が 正しい★）'));
  /* ★★客の 本当の 形＝★消される 前に 配られた リンク★を そのまま 開く★★（指示役1 2026-09-24）
     ⇒ ★その リンク（token）が 消した 後も 同じ かを ★数で★ 見る★
       … 同じで ない なら ★この 試験は 客の 形では ありません★ */
  T('★★消す 前に 配られた リンク（token）が 消した 後も そのまま 在る★★',
    Number(g.zen) === 1, '行 ' + g.zen + '（★0なら 前の リンクは 使えない＝客の 形では 測れて いない★）');
}

/* ── ④従業員の 画面を 開く（★客の 道★）───────────────────────── */
async function hiraku(token, pw) {
  const pg = await b.newPage();
  const de = { deta: false, ji: '', kensu: -1, naze: '', michi: [] };
  try {
    await pg.goto('http://localhost:' + PORT + '/kyuyo/meisai.html?t=' + token, { waitUntil: 'domcontentloaded' });
    await machi(3500);
    const mieru = (sel) => pg.evaluate((s) => {
      const el = document.querySelector(s);
      return !!(el && !el.classList.contains('hidden'));
    }, sel).catch(() => false);
    /* ★通った 画面を 1枚ずつ 残す★＝★「開ける」の 中身（何回 訊かれるか）を 数に する★ */
    if (await mieru('#sc-login')) {
      de.michi.push('合言葉を 訊かれた');
      await pg.fill('#login-pw', pw).catch(() => null);
      await pg.click('#login-go').catch(() => null);
      await machi(3500);
    } else if (await mieru('#sc-setup')) { de.michi.push('★初回設定の 画面★'); de.naze = '★初回設定の 画面が 出た（合言葉が 効いて いない）★'; }
    else if (await mieru('#sc-bad')) { de.michi.push('★リンクが 死んで いる 画面★'); de.naze = '★リンクが 死んで いる 画面★'; }
    if (await mieru('#sc-consent')) { de.michi.push('★同意を もう一度 訊かれた★'); await pg.click('#consent-go').catch(() => null); await machi(3000); }
    de.deta = await mieru('#sc-list');
    de.kensu = await pg.evaluate(() => {
      const d = document.querySelector('#dlist');
      return d ? d.querySelectorAll('.drow, .dcard, a, button').length : -1;
    }).catch(() => -1);
    de.ji = await pg.evaluate(() => {
      const e = document.querySelector('#login-err');
      return ((e && e.textContent) || '').trim();
    }).catch(() => '');
  } catch (e) { de.naze = String((e && e.message) || e).slice(0, 110); }
  await pg.close().catch(() => null);
  return de;
}

const honnin = await hiraku(A.token, AI);
const tanin = await hiraku(A.token, BI);
srv.close();
await b.close().catch(() => null);

console.log('  ★本人が 通った 画面★ … ' + (honnin.michi.length ? honnin.michi.join(' → ') + ' → 明細' : '★1枚も 拾えない★'));
console.log('  ★本人の 合言葉で 開いた★ … 一覧が 出た＝' + honnin.deta
  + ' ／ 中の 物 ' + honnin.kensu + '個' + (honnin.naze ? ' ／ ' + honnin.naze : '')
  + (honnin.ji ? ' ／ 画面の 字「' + honnin.ji + '」' : ''));
console.log('  ★他人の 合言葉で 開いた★ … 一覧が 出た＝' + tanin.deta
  + ' ／ 中の 物 ' + tanin.kensu + '個' + (tanin.naze ? ' ／ ' + tanin.naze : '')
  + (tanin.ji ? ' ／ 画面の 字「' + tanin.ji + '」' : ''));

T('★消す 1押しが 通った（この 試験の 前提）★', keshita);
if (WAZA) {
  T('★★--waza … 前の 形なら ★本人でも 開けない★★', !honnin.deta,
    honnin.deta ? '★開けて しまった＝空振り★' : '');
} else {
  T('★★㋐ 消した 後 ★本人の 合言葉★で 明細の 一覧が 出る★★', honnin.deta && honnin.kensu > 0,
    '一覧 ' + honnin.deta + ' ／ 中の 物 ' + honnin.kensu + '個 ' + (honnin.naze || ''));
}
T('★★㋑ 消した 後 ★他人の 合言葉★では 一覧が 出ない★★', !tanin.deta,
  tanin.deta ? '★出て しまった＝他人の 紙が 見えます★' : '');

await shimatsu();
{
  const r = await toiawase('select count(*) as n from kyuyo.pay_meisai_pub where token in ('
    + qs(A.token) + ',' + qs(B.token) + ')');
  T('★後始末＝自分が 作った 鍵を 1本も 残して いない★', r.ok && Number(((r.gyo || [])[0] || {}).n) === 0,
    r.ok ? ('残り ' + ((r.gyo || [])[0] || {}).n + '本') : r.naze);
}
console.log('  ★この 試験が 測って いない 物★ … ★会社が その リンクを 止められるか★'
  + '（★止める 押しは 在るが 消した 人は 一覧に 出ない＝押せない★／★司さんの 決め待ち★）');
console.log('\n' + pass + ' passed, ' + fail + ' failed' + (mi ? ' / 未測定 ' + mi : ''));
process.exit(fail ? 1 : 0);
