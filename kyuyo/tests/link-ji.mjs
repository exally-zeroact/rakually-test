/* link-ji.mjs — ★従業員に 渡る リンクの ★字★★を 実ブラウザで 1本 通す
 * ============================================================================
 * ★なぜ（2026-09-19 指示役1 の 指摘で 実測）★
 *   従業員に 渡す 鍵＝★リンク（QR）★は `kyuyo/js/app.js` の ★2か所★で 組み立てる。
 *     :5904 … Web明細の カードに 出す リンク（入力欄の 値／コピー／QR の 3つに 同じ 字）
 *     :5831 … ★全員の QRコードを 印刷★（初回コードも 一緒に 埋める）
 *   どちらも `location.origin + location.pathname.replace(/[^/]*$/,'')` で 頭を 作る。
 *   ⇒ ★この 字を 見る 試験は 0本だった★
 *   ★今 壊れて いるとは 言わない★（本番は `/kyuyo/` で 合う）。
 *   ★言えるのは「壊れても 誰も 気づかない」★＝★だから ここで 押さえる★。
 *
 * ★ここで見る事★
 *   ① ★リンクの 字を そのまま 出す★（切らない・伏せない＝試験の 倉庫の 鍵だから 出せる）
 *   ② ★同じ 字が 3か所★（入力欄の 値／コピーの 札／QR の 札）に ★1字も 違わず★ 在る
 *   ③ ★頭に `/kyuyo/` が 付いて いる★（＝置き場が 落ちて いない）
 *   ④ ★`meisai.html?t=<鍵>` と `&c=<初回コード>` が 入って いる★
 *   ⑤ ★その 字を そのまま 開いたら 明細の 入口が 出る★（`sc-bad` では ない）
 *   ⑥ ★全員の QRコード（もう 1本の 道）も 同じ 字★（:5831 と :5904 が 揃って いる）
 *   ⑦ 倉庫が 支度の ぶん しか 動いて いない
 *
 * ★わざと 壊す 回（--waza）★
 *   配る 時だけ `js/app.js` の ★2か所とも★
 *     `location.origin+location.pathname.replace` → `location.origin+'/'+''.replace`
 *   に 差し替える（＝★置き場 `/kyuyo/` が 落ちた 世界★）。repo は 1バイトも 触らない。
 *   ★はず★ … ③が 赤／⑤が 赤（開いても 明細が 出ない）＝★この 試験は 本当に 見張って いる★
 *
 * ★本物の 名前・金額は 入れない★（rakually-test は 公開 repo）／★名前には 席の 印★
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const { kagiAru, hairu } = await import('../../tests/_hairu.mjs');
if (!(await kagiAru(ROOT))) {
  console.log('🟡 ★未測定★ ★本番の repo では 測りません★（試験用の 口が 居ません）');
  process.exit(0);
}
const { borrow, launch } = await import('../../scripts/_borrow-playwright.mjs');
const G = await import('./_souko-kazoeru.mjs');
const wk = await borrow('link-ji', 'webkit');
if (!wk) { console.log('🟡 ★未測定★ playwright を 借りられない（0件＝合格 とは 書かない）'); process.exit(2); }

/* ★わざと 壊す 回★＝★置き場が 落ちた 世界★を 配る 時だけ 作る（repo は 触らない） */
const WAZA = process.argv.indexOf('--waza') >= 0;
const Q = String.fromCharCode(39);
const MICHI_MAE = 'location.origin+location.pathname.replace';
const MICHI_ATO = 'location.origin+' + Q + '/' + Q + '+' + Q + Q + '.replace';
const MICHI_HONSU = 2;                 /* ★作る道が 2本★＝片方だけ 差し替えたら 赤 */
let michikae = 0;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const srv = http.createServer((rq, rs) => {
  const u = decodeURIComponent(rq.url.split('?')[0]);
  let p = path.join(ROOT, u);
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { rs.writeHead(404); rs.end('x'); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  if (WAZA && u.indexOf('/kyuyo/js/app.js') === 0) {
    const src = fs.readFileSync(p, 'utf8');
    michikae = src.split(MICHI_MAE).length - 1;
    rs.end(src.split(MICHI_MAE).join(MICHI_ATO));
    return;
  }
  rs.end(fs.readFileSync(p));
});
await new Promise((r) => srv.listen(0, r));
const PORT = srv.address().port;
const b = await launch('link-ji', wk);

let pass = 0, fail = 0, mi = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };
const MI = (n, m) => { mi++; console.log('  🟡 ★はかれない★ ' + n + (m ? ' … ' + m : '')); };

console.log('\n[link-ji] 従業員に 渡る リンクの ★字★（実ブラウザ）'
  + (WAZA ? '  ★★わざと 置き場を 落とした 回★★' : ''));
console.log('  ★席★ ' + G.seki());
console.log('  ★この 測りは ★試験の 倉庫★の 数です／★本番の 倉庫では 未測定★');

const soukoMae = await G.kazoeru();
if (!soukoMae.ok) {
  if (G.kankyoKa(soukoMae.naze)) { console.log('  ' + G.kankyoIu('リンクの 字を 測って いません')); await b.close(); srv.close(); process.exit(0); }
  MI('倉庫を 数えられない', soukoMae.naze); await b.close(); srv.close(); process.exit(1);
}
console.log('  ★土台★ 人 ' + soukoMae.hito + '／公開 ' + soukoMae.koukai + '／紙 ' + soukoMae.kami);

const NA = G.shikenNa('リンク試験' + String(Date.now()).slice(-6)) + '　太郎';
let hito = null, tok = null, code = null;
/* ★片づけの しくじりを 黙って 飲まない★（2026-09-19 実測＝人が 1人 残ったのに 出しは 無言だった） */
const shimau = async () => {
  if (!hito) return;
  /* ★アプリが 自動で 作る 物まで 数えて 消す★
     ＝人を 1人 足して 画面を 開くと ★その月の 明細が 1枚 自動保存される★（app.js の 月次自動保存）。
       ★自分が 押して いない 物でも 自分の 回で 増えた なら 自分の ゴミ★。 */
  const m = await G.meisaiKesu(hito).catch((e) => ({ ok: false, naze: String(e && e.message || e) }));
  if (m && m.ok === false) console.log('  🟡 明細を 消せなかった … ' + m.naze);
  const a = await G.shitakuKesu(hito).catch((e) => ({ ok: false, naze: String(e && e.message || e) }));
  const b2 = await G.hitoKesu(hito).catch((e) => ({ ok: false, naze: String(e && e.message || e) }));
  if (a && a.ok === false) console.log('  🟡 支度を 消せなかった … ' + a.naze);
  if (b2 && b2.ok === false) console.log('  🟡 人を 消せなかった … ' + b2.naze);
};

try {
  /* ── 支度（★倉庫に 直に★＝測る 所では ない） ───────────── */
  const h = await G.hitoTsukuru(NA);
  if (!h.ok) { MI('支度＝人を 作れない', h.naze); throw new Error('skip'); }
  hito = h.id;
  const k = await G.kagiTsukuru(hito);
  if (!k.ok || !k.token) { MI('支度＝鍵を 作れない', k.naze); throw new Error('skip'); }
  tok = k.token; code = k.initCode || k.init_code || 'TESTCODE';
  console.log('  ★支度★ 人 1／鍵 1（初回コード ' + code + '）');

  /* ── 会社の 道（本物の ログイン → 印刷の 画面） ───────── */
  const pg = await b.newPage();
  const APP = 'http://localhost:' + PORT + '/kyuyo/index.html';
  const hai = await hairu(pg, APP, '.bn[data-scr]');
  if (!hai.haitta) { MI('アプリに 入れない', hai.naze || ('試した ' + hai.kai + '回')); throw new Error('skip'); }
  /* ★★覆いは ★画面を 移る 前★に 片づける★★
     「OK」は `app.js:6016` で ★`location.reload()`★＝★画面が 最初に 戻る★。
     画面を 移った 後に 答えると ★印刷の 画面から 追い出される★＝行が 出ない。 */
  /* ★★アプリの 覆いに ★お客さんと 同じく★ 答える★★（2026-09-19 実測で 名指しした）
     ログインの 後、アプリが ★「クラウドに この会社の 保存済みデータが あります。最新を
     読み込みますか？」★の 覆い（`.ui-modal-ov`）を ★出す 時と 出ない 時が 在る★。
     これが 出て いると ★下の ボタンに 本物の click が 届かない★
     ⇒ 私は 最初 これを「揺れ」と 見た（1回目 届く／2回目 30秒 落ちる／3回目 25回 届かない）。
     ★名指しで 数えたら 揺れでは なく「覆いが 在る／無い」の 2通りだった★。
     ⇒ ★JS で 押し替えず・消しもせず★、★「はい（最新を 読み込む）」を 本物の click で 押す★。 */
  const ooiNiKotaeru = async () => {
    const aru = await pg.evaluate(() => {
      const ov = document.querySelector('.ui-modal-ov');
      return ov ? (ov.textContent || '').split(String.fromCharCode(10)).join(' ').trim().slice(0, 40) : '';
    }).catch(() => '');
    if (!aru) return '';
    /* ★札は 覆いの 外に 在る★／★字は「OK／キャンセル」★（実測＝uiConfirm app.js:2102）
       ⇒ ★お客さんが 押す 方（primary＝OK）★を 押す。 */
    const bs = await pg.$$('.ui-modal-btn').catch(() => []);
    for (const btn of bs) {
      const ji = (await btn.textContent().catch(() => '')) || '';
      const oya = await btn.evaluate((e) => e.className.indexOf('primary') >= 0).catch(() => false);
      if (oya || ji.indexOf('OK') >= 0 || ji.indexOf('はい') >= 0) {
        const ok = await btn.click({ timeout: 4000 }).then(() => true).catch(() => false);
        if (ok) { console.log('  ★覆いに 答えた【本物の click】★ 「' + ji.trim().slice(0, 14) + '」 … ' + aru); return ji; }
      }
    }
    if (!ooiGuchi) { ooiGuchi = 1; console.log('  🟡 覆いが 在るのに 答える 札が 無い … ' + aru + '（札 ' + bs.length + '個）'); }
    return '';
  };
  let ooiGuchi = 0;
  for (let i = 0; i < 24; i++) { if (await ooiNiKotaeru()) { await new Promise((r) => setTimeout(r, 2500)); break; } await new Promise((r) => setTimeout(r, 250)); }

  /* ★押す 前に 札の 姿を 数える★（押せない 時 「無い」と 決めつけない＝2026-09-19 実測で
     `.bn[data-scr="scr-print"]` は ★在るのに 押せず★ 30秒で 落ちた） */
  const sugata = await pg.evaluate(() => {
    const e = document.querySelector('.bn[data-scr="scr-print"]');
    if (!e) return { aru: false };
    const r = e.getBoundingClientRect();
    const c = getComputedStyle(e);
    const oya = e.parentElement ? getComputedStyle(e.parentElement) : null;
    return { aru: true, haba: Math.round(r.width), takasa: Math.round(r.height),
      disp: c.display, mie: c.visibility, oyaDisp: oya ? oya.display : '', ue: Math.round(r.top) };
  }).catch(() => null);
  console.log('  ★印刷の 札★ ' + JSON.stringify(sugata));
  await pg.click('.bn[data-scr="scr-print"]', { timeout: 20000 })
    .catch(async () => { await pg.evaluate(() => document.querySelector('.bn[data-scr="scr-print"]').click()); });

  /* ★リンクの 行が 出そろう まで 待つ★（時間では なく ★数★で 待つ） */
  let matta = 0, gyo = null;
  for (let i = 0; i < 160; i++) {
    matta++;
    gyo = await pg.evaluate((t) => {
      const cp = [...document.querySelectorAll('#webmeisai-body .wm-copy')]
        .find((x) => (x.dataset.link || '').indexOf(t) >= 0);
      if (!cp) return null;
      const box = cp.parentElement;
      const inp = box ? box.querySelector('input.finput') : null;
      const qr = box ? box.querySelector('.wm-qr') : null;
      return {
        link: cp.dataset.link || '',
        ran: inp ? inp.value : '',
        qr: qr ? (qr.dataset.qrUrl || '') : '',
      };
    }, tok);
    if (gyo) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!gyo) {
    /* ★材料が 足りない 時は ★何が 出て いるか★を 数えて から 止まる★（当てずっぽうで 直さない） */
    const ima = await pg.evaluate(() => {
      const scr = Array.from(document.querySelectorAll('[data-scr]'))
        .filter((x) => x.classList.contains('active')).map((x) => x.dataset.scr);
      const card = document.getElementById('webmeisai-card');
      const body = document.getElementById('webmeisai-body');
      return {
        gamen: scr,
        card: card ? (card.style.display === 'none' ? '隠れ' : '出て いる') : '札 無し',
        copy: document.querySelectorAll('#webmeisai-body .wm-copy').length,
        michi: [...document.querySelectorAll('#webmeisai-body .wm-copy')]
          .map((x) => String(x.dataset.link || '').split('?t=').pop().slice(0, 8)),
        ji: body ? (body.textContent || '').trim().length : -1,
        fuda: document.querySelectorAll('#emp-list .mco').length,
      };
    }).catch(() => null);
    MI('リンクの 行が 出ない', '40秒 待っても この 鍵の 行が 出なかった'
      + ' ／ 探した 鍵 ' + String(tok).slice(0, 8) + ' ／ 今 … ' + JSON.stringify(ima));
    throw new Error('skip');
  }
  console.log('  ★待った★ ' + matta + '回（0.25秒ずつ）');

  /* ── ① 字を そのまま 出す ─────────────────────── */
  console.log('    ── ① 従業員に 渡る リンクの 字（★そのまま★）');
  console.log('       ' + gyo.link);

  /* ── ② 3か所が 同じ ───────────────────────── */
  T('★② 同じ 字が 3か所（入力欄 ' + gyo.ran.length + '字／コピー ' + gyo.link.length + '字／QR ' + gyo.qr.length + '字）★',
    gyo.link.length > 0 && gyo.ran === gyo.link && gyo.qr === gyo.link,
    '★3か所が 揃って いない★ 欄「' + gyo.ran + '」／QR「' + gyo.qr + '」');

  /* ── ③ 置き場が 落ちて いない ───────────────── */
  const ATAMA = 'http://localhost:' + PORT + '/kyuyo/';
  const atamaOk = gyo.link.indexOf(ATAMA) === 0;
  if (WAZA) T('★わざ③ 置き場を 落としたら ★③が 崩れる★（頭が ' + ATAMA + ' で なくなる）★',
    atamaOk === false, '★落としたのに 頭が 変わらない＝③は 何を しても 緑★');
  else T('★③ 頭が ' + ATAMA + '（★/kyuyo/ が 落ちて いない★）★', atamaOk, '★頭が 違う★＝置き場が 落ちた');

  /* ── ④ 鍵と 初回コードが 入って いる ───────────── */
  T('★④ `meisai.html?t=<鍵>` が 入って いる★',
    gyo.link.indexOf('meisai.html?t=' + tok) >= 0, '鍵の 形が 違う');
  T('★④ `&c=<初回コード>` が 入って いる（従業員は 打ち込まなくて よい）★',
    gyo.link.indexOf('&c=' + code) >= 0, '初回コードが 入って いない');

  /* ── ⑤ その 字を そのまま 開く（★お客さんの 道★） ───── */
  const pg2 = await b.newPage();
  await pg2.goto(gyo.link, { waitUntil: 'domcontentloaded' });
  let deta = null;
  for (let i = 0; i < 120; i++) {
    deta = await pg2.evaluate(() => ['sc-bad', 'sc-setup', 'sc-login', 'sc-list', 'sc-consent']
      .filter((x) => { const e = document.getElementById(x); return e && !e.classList.contains('hidden'); }));
    if (deta.length) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log('    ── ⑤ その 字を そのまま 開いた ⇒ 出た 画面 ' + JSON.stringify(deta));
  const akeru = deta.length > 0 && deta.indexOf('sc-bad') < 0;
  if (WAZA) T('★わざ⑤ 置き場を 落としたら ★従業員は 開けない★（出た 画面 ' + JSON.stringify(deta) + '）★',
    akeru === false, '★落としたのに 開けた＝⑤は 何を しても 緑★');
  else T('★⑤ 渡した 字を そのまま 開くと ★明細の 入口★が 出る（`sc-bad` では ない）★',
    akeru, '★従業員が 開けない 字を 渡して いる★');
  await pg2.close();

  /* ── ⑥ もう 1本の 道（全員の QRコード）も 同じ 字 ───── */
  /* ★本物の click のまま 粘る★（2026-09-19 実測＝札が 描き直されて 30秒で 落ちた）
     ★JS で 押し替えない★＝[[feedback_js_dispatched_event_is_not_the_customer_path]]
     ★何回で 届いたかを 出す★＝黙って 何十回も 押して いるのを 隠さない。 */
  let osita = false, kai = 0;
  for (let i = 0; i < 25 && !osita; i++) {
    kai++;
    osita = await pg.click('.wm-qrall', { timeout: 2500 }).then(() => true).catch(() => false);
    if (!osita) { await ooiNiKotaeru(); await new Promise((r) => setTimeout(r, 300)); }
  }
  console.log('    ── ⑥ 全員の QR の 札を 押した … ' + (osita ? kai + '回目で 届いた' : '★25回 押しても 届かない★'));
  if (!osita) {
    /* ★「押せない」で 止めない★＝★何が 被って いるか★を 名指しで 出す */
    const ue = await pg.evaluate(() => {
      const e = document.querySelector('.wm-qrall');
      if (!e) return { aru: false };
      const r = e.getBoundingClientRect();
      const c = getComputedStyle(e);
      const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
      const ue2 = document.elementFromPoint(x, y);
      const na = (el) => !el ? '（無し）'
        : el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className ? '.' + String(el.className).split(' ')[0] : '');
      return { aru: true, haba: Math.round(r.width), takasa: Math.round(r.height), x, y,
        disp: c.display, mie: c.visibility, pe: c.pointerEvents,
        mado: { w: innerWidth, h: innerHeight }, ueNo: na(ue2), jibun: na(e),
        ooi: Array.from(document.querySelectorAll('.ui-modal-ov'))
          .map((x) => (x.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)),
        qu: document.querySelectorAll('.qu').length };
    }).catch(() => null);
    console.log('       ★押せない 訳を 数えた★ … ' + JSON.stringify(ue));
    MI('★⑥ 全員の QRコードの 字★', '札を 押せない（25回）');
  }
  let qall = null;
  for (let i = 0; i < 120; i++) {
    qall = await pg.evaluate(() => [...document.querySelectorAll('.qu')].map((x) => x.textContent || ''));
    if (qall.length) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  const ore = (qall || []).filter((x) => x.indexOf(tok) >= 0);
  console.log('    ── ⑥ 全員の QRコード（:5831 の 道）… 出た 字 ' + (qall || []).length + '件');
  if (!qall || !qall.length) MI('★⑥ 全員の QRコードの 字★', '覆いが 出なかった');
  else T('★⑥ もう 1本の 道（全員の QR）も ★1字も 違わず 同じ★（この 鍵の 分 ' + ore.length + '件）★',
    ore.length === 1 && ore[0] === gyo.link,
    '★2つの 道で 字が 違う★ QR側「' + (ore[0] || '（無し）') + '」');

  if (WAZA) T('★わざ 差し替えが 2か所とも 効いた（' + michikae + 'か所）★',
    michikae === MICHI_HONSU, '★片方だけ／0か所＝外したつもり★');
} catch (e) {
  if (String(e && e.message) !== 'skip') MI('途中で 止まった', String(e && e.message || e).slice(0, 120));
} finally {
  await shimau();
  await b.close().catch(() => null);
  srv.close();
}

/* ── ⑦ 倉庫が 支度の ぶん しか 動いて いない ───────────── */
const sou = await G.awaseru(soukoMae, 20);
if (sou.han === '環境') { mi++; console.log('  ' + sou.iu); }
else if (sou.han === '未測定') { mi++; console.log('  🟡 ★未測定★ 後始末を 倉庫で 数えられない … ' + sou.iu); }
else if (sou.han === '緑') { pass++; console.log('  ✓ ★⑦ 倉庫が 支度の ぶん しか 動いて いない★ … ' + sou.iu); }
else { fail++; console.log('  ✗ ★⑦ 倉庫が 戻って いない★ — ' + sou.iu); }

if (WAZA) console.log('\n★わざと 落とした 回の 読み方★ … ★③⑤が 崩れる 事を 確かめた 回★（崩れなければ ここが 赤）＝★この 試験は 本当に 見張って いる★');
console.log('\n' + pass + ' passed, ' + fail + ' failed' + (mi ? ', ' + mi + ' ★はかれない★' : ''));
process.exit(fail ? 1 : 0);
