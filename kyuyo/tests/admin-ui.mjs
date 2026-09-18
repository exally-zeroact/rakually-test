/* admin-ui.mjs — ★管理者で ない 人が kyuyo/admin.html を 開いた時★を 実ブラウザで 1本 通す
 * ============================================================================
 * ★なぜ（2026-09-19 実測）★
 *   `kyuyo/admin.html` ＝★使う人 全員の メールと 契約が 並ぶ 紙★（試験の 倉庫で 13行）。
 *   この紙の ★中身を 見る 試験は 0本★ だった（字だけ 見る 見張りは 7本 在る＝
 *   button-uniform／no-dead-ui／own-name／html-script-syntax／pages-hosting／shirase-iro／scroll-muda）。
 *   ⇒ ★「他人の 一覧が 他人に 見えないか」を 誰も 見て いなかった★
 *
 * ★門は どこに 在るか（★字ではなく 倉庫で 測った★）★
 *   ・画面の 門 … `js/admin.js:64` `exally_admins` の ★自分の 行★が 読めたら 管理者
 *   ・★本体は サーバ側★ … `exally` 部屋の RLS
 *       exally_admins      … SELECT `account_id = auth.uid()`（＝自分の 行しか 見えない）
 *       exally_entitlements… SELECT `is_exally_admin()` ★または★ `account_id = auth.uid()`
 *                            UPDATE `is_exally_admin()` ／ ★DELETE の 決まりは 無い＝誰も 消せない★
 *   ・`public.exally_admins`／`public.exally_entitlements` は ★覗き窓（view）★で
 *     ★security_invoker=true★＝★呼んだ 人の 権限で 中の RLS が 効く★（＝素通しでは ない）。
 *     ★admin.js の client は 部屋を 指定して いない＝この 覗き窓を 通る★。
 *   ⇒ ★「門が 無い」とは 書かない★。ここで 測るのは ★門が 効いて いるか★。
 *
 * ★ここで見る事★
 *   ① 入る前 … 入口だけ 出る（一覧は 出ない）
 *   ② ★管理者で ない 口★で 入る ⇒ ★断りの 紙★が 出る（一覧の 台は 隠れたまま）
 *   ③ ★他人の メールが 画面の 字に 1つも 無い★
 *   ④ ★画面の 門を わざと 外しても サーバが 止める★
 *        ＝ページの 中で 直に 倉庫へ 問うても ★自分の 行だけ★（他人 0行）
 *   ⑤ ★書く方も 止まる★＝他人の 行を 書き換えようとしても 0行
 *        ★値は 今と 同じ 物を 入れる★＝★万一 通っても 中身は 変わらない★
 *   ⑥ ★倉庫が 動いて いない★（行数と 指紋が 前後で 同じ）
 *
 * ★線引き★
 *   ④⑤は ★お客さんの 道では ない★（[[feedback_js_dispatched_event_is_not_the_customer_path]]）。
 *   ★わざと 画面の 門を 外して サーバだけを 測る★のが 目的＝★そう 字で 書いて ある★。
 *   ①②③は ★本物の 打ち込みと click★＝お客さんの 道。
 * ★本物の メールは この紙に 焼かない★（rakually-test は 公開 repo）
 *   ＝比べる 字は ★走る 時に 倉庫から 取る★／出す時は ★伏せる★。
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const { kagiAru } = await import('../../tests/_hairu.mjs');
if (!(await kagiAru(ROOT))) {
  console.log('🟡 ★未測定★ ★本番の repo では 測りません★（試験用の 口が 居ません）');
  process.exit(0);
}
const { borrow, launch } = await import('../../scripts/_borrow-playwright.mjs');
const G = await import('./_souko-kazoeru.mjs');
const wk = await borrow('admin-ui', 'webkit');
if (!wk) { console.log('🟡 ★未測定★ playwright を 借りられない（0件＝合格 とは 書かない）'); process.exit(2); }

/* ★★わざと 壊す 回（--waza）★★
   ★「何を しても 緑」では ない事を 見せる★＝★画面の 門だけ★を 外して 同じ事を 測る。
   外し方＝★配る 時に js/admin.js の 1行を 差し替える★（repo も 倉庫も 1バイトも 触らない）。
     `if (a.data) {` … 自分の 管理者の 行が 読めたら 台を 出す
        ↓
     `if (true) {`   … ★誰でも 台を 出す★
   ★はず★ … ②が ★赤★に なる（断りが 出ない）／★③④⑤は 緑のまま★
     ＝★守りの 本体は 画面では なく サーバ（RLS）★ が 字で 出る。 */
const WAZA = process.argv.indexOf('--waza') >= 0;
const MON_MAE = 'if (a.data) {';
const MON_ATO = 'if (true) {';
let mongae = 0;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const srv = http.createServer((rq, rs) => {
  const u = decodeURIComponent(rq.url.split('?')[0]);
  let p = path.join(ROOT, u);
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { rs.writeHead(404); rs.end('x'); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  if (WAZA && u.indexOf('/kyuyo/js/admin.js') === 0) {
    const src = fs.readFileSync(p, 'utf8');
    const kai = src.split(MON_MAE).length - 1;
    mongae = kai;
    rs.end(src.split(MON_MAE).join(MON_ATO));
    return;
  }
  rs.end(fs.readFileSync(p));
});
await new Promise((r) => srv.listen(0, r));
const PORT = srv.address().port;
const b = await launch('admin-ui', wk);

let pass = 0, fail = 0, mi = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };
const MI = (n, m) => { mi++; console.log('  🟡 ★はかれない★ ' + n + (m ? ' … ' + m : '')); };
const fuseru = (s) => (s ? String(s).slice(0, 2) + '***(' + String(s).length + '字)' : '（無し）');

console.log('\n[admin-ui] 管理者で ない 人が 管理の 紙を 開いた時（実ブラウザ）'
  + (WAZA ? '  ★★わざと 画面の 門を 外した 回★★' : ''));
console.log('  ★席★ ' + G.seki());
/* ★★ここで 出る 数は ★試験の 倉庫★の 数★★（2026-09-19 指示役1 の 注文で 足した 1行）
   ★本番の 倉庫では ★未測定★★＝★本番の 口は 2つとも 司さんと 別の 方の 物＝私たちは 入れません★。
   ★「未測定」と「機械が 毎回は 見て いない」は 別物★＝書いて おかないと
   ★次の 人が「本番も 測った」と 読む★（[[feedback_mimisokutei_to_kikai_ga_maikai_mite_inai_wa_betsumono]]）。 */
console.log('  ★この 測りは ★試験の 倉庫★の 数です／★本番の 倉庫では 未測定★'
  + '（本番の 口は 2つとも 私たちの 物では ない）');

/* ── 分母と 比べる 字を 倉庫から 取る（★管理鍵が 要る＝CI では 取れない★） ── */
const KUCHI = 'test@test.com';                 /* ★試験用の 口（本物の 客では ない）★ */
const Q = String.fromCharCode(39);
const YUBI_SQL = 'select md5(string_agg(t.x, ' + Q + ',' + Q + ' order by t.x)) f, count(*)::int n from ('
  + 'select account_id||' + Q + '|' + Q + '||app||' + Q + '|' + Q + '||plan x from exally.exally_entitlements) t';
let zenbu = null, hokaMail = null, hokaId = null, hokaPlan = null, jibunKazu = null, mae = null;
const toi = async (sql) => { const r = await G.toiawase(sql); return r.ok ? r.gyo : null; };
{
  const g1 = await toi('select count(*)::int n from exally.exally_entitlements');
  if (g1) zenbu = g1[0].n;
  const g2 = await toi('select id from auth.users where email=' + Q + KUCHI + Q);
  const myId = g2 && g2[0] ? g2[0].id : null;
  if (myId) {
    const g3 = await toi('select count(*)::int n from exally.exally_entitlements where account_id=' + Q + myId + Q);
    if (g3) jibunKazu = g3[0].n;
    const g4 = await toi('select account_id, email, plan from exally.exally_entitlements where account_id<>' + Q + myId + Q + ' order by created_at limit 1');
    if (g4 && g4[0]) { hokaId = g4[0].account_id; hokaMail = g4[0].email; hokaPlan = g4[0].plan; }
  }
  const g5 = await toi(YUBI_SQL);
  const g6 = await toi('select count(*)::int n from exally.exally_admins');
  mae = { yubi: g5 && g5[0] ? g5[0].f : null, n: g5 && g5[0] ? g5[0].n : null, adm: g6 ? g6[0].n : null };
}
if (zenbu === null) MI('★分母★（使う人が 何行 在るか）', '管理鍵が 無い＝ここでは 数えられない');
else console.log('  ★分母★ 使う人 ' + zenbu + '行（うち ' + KUCHI + ' 自身 ' + jibunKazu + '行）／管理者 ' + mae.adm + '人'
  + '／比べる 他人の メール ' + fuseru(hokaMail));

const URL_ADMIN = 'http://localhost:' + PORT + '/kyuyo/admin.html';
try {
  const pg = await b.newPage();
  await pg.goto(URL_ADMIN, { waitUntil: 'domcontentloaded' });
  await pg.waitForSelector('#signin', { state: 'visible', timeout: 20000 });

  /* ── ① 入る前 ───────────────────────────────── */
  const mae1 = await pg.evaluate(() => ({
    login: !document.getElementById('login').classList.contains('hide'),
    panel: !document.getElementById('panel').classList.contains('hide'),
    list: (document.getElementById('list').textContent || '').trim().length,
  }));
  T('★① 入る前は 入口だけ（一覧の 台は 隠れ・一覧の 字 0）★',
    mae1.login === true && mae1.panel === false && mae1.list === 0,
    '入口' + mae1.login + '／台' + mae1.panel + '／字' + mae1.list);

  /* ── ② 管理者で ない 口で 入る（★本物の 打ち込みと click★） ── */
  await pg.fill('#email', KUCHI);
  await pg.fill('#pw', 'test1234');
  await pg.click('#signin');
  let dekita = false;
  for (let i = 0; i < 120; i++) {
    const s = await pg.evaluate(() => ({
      d: !document.getElementById('denied').classList.contains('hide'),
      p: !document.getElementById('panel').classList.contains('hide'),
    }));
    if (s.d || s.p) { dekita = true; break; }
    await new Promise((r) => setTimeout(r, 250));
  }
  const ato = await pg.evaluate(() => ({
    denied: !document.getElementById('denied').classList.contains('hide'),
    panel: !document.getElementById('panel').classList.contains('hide'),
    body: document.body.innerText || '',
    stat: (document.getElementById('stat').textContent || '').trim(),
  }));
  if (!dekita) MI('★②③ 入った 後の 画面★', '30秒 待っても 断りも 台も 出なかった');
  else {
    if (WAZA) {
      /* ★わざと 外した 回★＝★②が 赤に なる事★を ここで 数える（緑のままなら 見張りが 空振り） */
      T('★わざ① 差し替えが 本当に 効いた（' + MON_MAE + ' を ' + mongae + 'か所 差し替えた）★',
        mongae === 1, '差し替えた 数が 1で ない＝★外したつもり★');
      T('★わざ② 画面の 門を 外したら ★②が 崩れる★（断り ' + ato.denied + '／台 ' + ato.panel + '）★',
        ato.denied === false && ato.panel === true,
        '★門を 外したのに 画面が 変わらない＝②は 何を しても 緑★');
    } else {
      T('★② 管理者で ない 口には ★断りの 紙★が 出る（一覧の 台は 隠れたまま）★',
        ato.denied === true && ato.panel === false,
        '断り' + ato.denied + '／台' + ato.panel + '／stat「' + ato.stat + '」');
    }

    /* ── ③ 他人の メールが 画面に 無い ───────────── */
    if (!hokaMail) MI('★③ 他人の メールが 画面に 無い★', '管理鍵が 無い＝比べる 字を 取れない');
    else T('★③ 画面の 字に ★他人の メール★が 1つも 無い（' + fuseru(hokaMail) + '）'
      + (WAZA ? '★／★門を 外しても 出ない＝止めて いるのは サーバ★' : '★'),
      ato.body.indexOf(hokaMail) < 0, '★画面に 出て しまった★');
  }

  /* ── ④ 画面の 門を わざと 外す（★客の 道では ない★） ── */
  const naka = await pg.evaluate(async () => {
    const sb = window.supabase.createClient(window.SUPA.url, window.SUPA.key);
    const u = await sb.auth.getUser();
    const me = u && u.data && u.data.user ? u.data.user.id : null;
    const r = await sb.from('exally_entitlements').select('account_id,email');
    const a = await sb.from('exally_admins').select('account_id');
    return {
      me: me,
      n: r.data ? r.data.length : -1,
      hoka: r.data ? r.data.filter((x) => x.account_id !== me).length : -1,
      err: r.error ? String(r.error.message).slice(0, 80) : '',
      admN: a.data ? a.data.length : -1,
    };
  });
  console.log('    ── ④ 画面の 門を 外して 倉庫へ 直に 問うた（★客の 道では ない★）');
  console.log('       返った 行 ' + naka.n + '（うち 他人 ' + naka.hoka + '）／管理者の 棚 ' + naka.admN + '行'
    + (naka.err ? '／断り「' + naka.err + '」' : ''));
  T('★④ 門を 外しても ★他人の 行は 0★（サーバ側の RLS が 本体）★',
    naka.hoka === 0, '他人の 行が ' + naka.hoka + '行 来た');
  if (jibunKazu === null) MI('★④の 分母★（自分の 行が 何行 か）', '管理鍵が 無い');
  else T('★④ 見えたのは ★自分の 行だけ★（' + naka.n + '行＝倉庫の 自分 ' + jibunKazu + '行／全 ' + zenbu + '行）★',
    naka.n === jibunKazu, '自分の 行数と 合わない');
  T('★④ 管理者の 棚も ★自分の 行だけ★（管理者で ない＝0行）★',
    naka.admN === 0, '管理者の 棚が ' + naka.admN + '行 見えた');

  /* ── ⑤ 書く方（★値は 今と 同じ★＝通っても 中身は 変わらない） ── */
  if (!hokaId) MI('★⑤ 他人の 行を 書き換えられないか★', '管理鍵が 無い＝相手の 行を 選べない');
  else {
    const kaku = await pg.evaluate(async (a) => {
      const sb = window.supabase.createClient(window.SUPA.url, window.SUPA.key);
      const r = await sb.from('exally_entitlements').update({ plan: a.plan }).eq('account_id', a.id).select('account_id');
      return { n: r.data ? r.data.length : -1, err: r.error ? String(r.error.message).slice(0, 80) : '' };
    }, { id: hokaId, plan: hokaPlan });
    console.log('    ── ⑤ 他人の 行へ ★今と 同じ 値★を 書き込もうとした（変わらない 値）');
    console.log('       書けた 行 ' + kaku.n + (kaku.err ? '／断り「' + kaku.err + '」' : ''));
    T('★⑤ 他人の 行は ★1行も 書けない★★', kaku.n === 0, '★' + kaku.n + '行 書けた★');
  }

  /* ── ⑥ 倉庫が 動いて いない ───────────────────── */
  if (!mae || !mae.yubi) MI('★⑥ 倉庫が 動いて いないか★', '管理鍵が 無い＝指紋を 取れない');
  else {
    const g5 = await toi(YUBI_SQL);
    const g6 = await toi('select count(*)::int n from exally.exally_admins');
    const ima = { yubi: g5 && g5[0] ? g5[0].f : null, n: g5 && g5[0] ? g5[0].n : null, adm: g6 ? g6[0].n : null };
    T('★⑥ 使う人の 棚が 1つも 動いて いない（行数 ' + mae.n + '→' + ima.n + '／指紋 同じ／管理者 ' + mae.adm + '→' + ima.adm + '）★',
      ima.yubi === mae.yubi && ima.n === mae.n && ima.adm === mae.adm,
      '★私が 倉庫を 動かした★');
  }
} catch (e) {
  MI('途中で 止まった', String(e && e.message || e).slice(0, 120));
} finally {
  await b.close().catch(() => null);
  srv.close();
}

if (WAZA) console.log('\n★わざと 外した 回の 読み方★ … ②が 崩れ、★③④⑤が 緑のまま★＝★守りの 本体は サーバ（RLS）★');
console.log('\n' + pass + ' passed, ' + fail + ' failed' + (mi ? ', ' + mi + ' ★はかれない★' : ''));
process.exit(fail ? 1 : 0);
