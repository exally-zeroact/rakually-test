/* seirino-ui.mjs — ★被保険者整理番号が 画面から 入り 紙まで 届くか★（実ブラウザ）
 * =============================================================================
 * ★なぜ（2026-09-14）★
 *   被扶養者(異動)届の 実ブラウザ試験で ★項番8 被保険者整理番号の 入力欄が 1つも 無い★事が出た。
 *   ★入れる所が 無いのに 6本の CSV 組み立てが e.hokenshaNo を 読んでいた★
 *   （app.js＝賞与・算定・月変・資格取得・喪失・被扶養者）。
 *   一方 ★表/Excel の 整理番号 列は '' の 決め打ち★＝★同じ画面の CSV と Excel が ずれる★形。
 *
 * ★この試験が 測る事（測っていない物は 緑と 呼ばない）★
 *   ①資格取得届の 画面の 表に ★整理番号の 列★が 在る
 *   ②その マスに 出る 字を ★そのまま 出す★（sha256 も 一緒に）
 *   ③Excel（xlsx）を ★本当に 落として★ バイト数と sha256 を 出す
 *   ④従業員マスタに ★入力欄が 在るか★（無い間は 🟡＝欄を 足す 前後で 見比べる為）
 *   ★賞与・算定・月額変更は 確定した明細が 要る＝この試験では ★未測定★と はっきり 出す★
 *
 * ★使い方★
 *   node kyuyo/tests/seirino-ui.mjs            … 測って 出す（★出た 字を 見る★）
 *   node kyuyo/tests/seirino-ui.mjs --utsu=77  … 欄に 77 を 打ってから 測る（欄が 在る時）
 *   ★同じ 木で 2回 走らせて 同じ sha256 が 出るか★＝物差しが ぶれない事を 先に 見る。
 *
 * ★後始末★＝足した 人を 必ず 消す（try/finally＋終了合図）。★テスト倉庫だけ★。
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const UTSU = (process.argv.find((a) => a.indexOf('--utsu=') === 0) || '').split('=')[1] || '';

let borrow, pwLaunch, hairu, osu;

/* ★★本番の repo には 試験の 鍵が 無い（2026-09-05 の 決まりと 同じ形）★★
   ★本番の repo は 本番の 倉庫を 指す★＝test@test.com は 本番には 居ない。
   ★黙って 緑に しない★＝「ここでは 測れない・テスト線で 測っている」と 字で 言ってから 抜ける。
   ★戻す条件★＝本番の CI に 試験用の 鍵を 置いた日。 */
{
  const { kagiAru } = await import('../../tests/_hairu.mjs');
  if (!(await kagiAru(ROOT))) {
    console.log('  — ★この repo（本番）には 試験の 鍵が 無いので ここでは 測れません★'
      + '（★テスト線で 測っています★／戻す条件＝本番CIに 鍵を 置いた日）');
    process.exit(0);
  }
}
try {
  ({ borrow, launch: pwLaunch } = await import('../../scripts/_borrow-playwright.mjs'));
  ({ hairu, osu } = await import('../../tests/_hairu.mjs'));
} catch (e) { console.log('🟡 ★未測定★ 道具が 読めない … ' + (e && e.message)); process.exit(2); }
const wk = await borrow('seirino-ui', 'webkit');
if (!wk) { console.log('🟡 ★未測定★ playwright を 借りられない（0件＝合格 とは 書かない）'); process.exit(2); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const srv = http.createServer((rq, rs) => {
  const url = decodeURIComponent(rq.url.split('?')[0]);
  let p = path.join(ROOT, url);
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { rs.writeHead(404); rs.end('x'); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  rs.end(fs.readFileSync(p));
});
await new Promise((r) => srv.listen(0, r));
const PORT = srv.address().port;
const b = await pwLaunch('seirino-ui', wk);

let pass = 0, fail = 0, mi = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };
const MI = (n, m) => { mi++; console.log('  🟡 ★未測定★ ' + n + (m ? ' … ' + m : '')); };
const machi = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (x) => crypto.createHash('sha256').update(x).digest('hex').slice(0, 16);

let katazukeSuru = null;
const katazuke = async () => { if (katazukeSuru) { const f = katazukeSuru; katazukeSuru = null; try { await f(); } catch (e) { /* 既に 消えている */ } } };
process.on('exit', () => { try { srv.close(); } catch (e) { /* もう 閉じている */ } });
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => { try { srv.close(); } catch (e) { /* 同上 */ } process.exit(130); });

/* ★★打った値が「本当に 入ったか」を 見てから 次へ進む（2026-09-14 CIで 実測）★★
   ★手元(Windows の WebKit)では 緑・CI(Linux の WebKit)では 赤★に なった。
   落ちた 中身は ★日付の 欄だけ★＝「本人の 生年月日が まだです」「扶養に 入った日が まだです」。
   訳 … input[type=date] に ★1字ずつ 打って いた★（type()）。
        日付の 欄は ★engine と 土地の 決まりで 打ち方が 変わる★ので、1字ずつは 当てに ならない。
   ⇒ ①★fill() で 入れる★（date も そのまま 入る）
     ②★入れた後に 読み返して 見比べる★／違えば ★開き直して もう一度★（既定 3回）
     ③それでも 違えば ★false を 返す★＝呼んだ側が 🟡で 言う（★黙って 次へ進まない★）
   ★これは shutoku-ui / soshitsu-ui を CI から 外している 訳（戻す条件）と 同じ物★。 */
async function utsu(pg, sel, val, kai = 3) {
  const nozomi = String(val);
  for (let i = 0; i < kai; i++) {
    const el = await pg.$(sel);
    if (!el) { await machi(250); continue; }
    let tag = 'input';
    try { tag = await el.evaluate((e) => e.tagName.toLowerCase()); } catch (e) { await machi(250); continue; }
    try {
      if (tag === 'select') await el.selectOption(nozomi);
      else await el.fill(nozomi);
      await el.evaluate((e) => { e.dispatchEvent(new Event('change', { bubbles: true })); });
    } catch (e) { await machi(300); continue; }
    await machi(180);
    /* ★描き直った後の 物を 見る★＝掴んだ 古い 物では ない */
    const ima = await pg.$(sel).then((e2) => (e2 ? e2.inputValue() : null)).catch(() => null);
    if (ima === nozomi) return true;
    await machi(320);
  }
  return false;
}

console.log('\n[seirino-ui] 被保険者整理番号が ★画面から 入り 紙まで 届くか★'
  + (UTSU ? '（打つ 字＝' + UTSU + '）' : '（打たない＝今の 姿を 見るだけ）'));

const ctx = await b.newContext({ viewport: { width: 1200, height: 1400 }, acceptDownloads: true });
const pg = await ctx.newPage();
/* ★★置き土産は ★倉庫の 行数★ で 数える（2026-09-14 私の 不始末）★★
   前は ★画面の 札の 数★だけで「ゴミ0」と 緑を 出していた＝★倉庫には 残っていた★。
   ★「前」は ログインの 前に 数える★＝ログインした 途端に 既定の『従業員 1』が 倉庫に 書かれ、
   後から 読み直しで 消えるので、後に 数えると 1人 減って 見える（今日 実測）。 */
const { kazoeru: KAZOERU, awaseru: AWASERU, konkaiNoGomiKesu: GOMI_KESU, ima: IMA } = await import('./_souko-kazoeru.mjs');
const { katazukeru: KATAZUKERU } = await import('./_kyaku_no_michi_de_katazukeru.mjs');
/* ★始まりは ★倉庫の 時計★に 聞く★＝手元の 時計から 遡ると
   ★直前の 試験の ゴミまで 窓に 入り、自分が 作っていない 物を 消す★（総なめで 捕まった）。 */
const HAJIME = await IMA().then((x) => (x.ok ? x.t : new Date(Date.now() - 5000).toISOString()));
const soukoMae = await KAZOERU();
console.log('  倉庫（前） … ' + (soukoMae.ok
  ? '人 ' + soukoMae.hito + ' ／ 明細 ' + soukoMae.meisai
  : '🟡 ★読めない★ ' + soukoMae.naze));

const h = await hairu(pg, 'http://localhost:' + PORT + '/kyuyo/index.html', '.bn[data-scr="scr-settings"]');
if (!h.haitta) {
  console.log('  🟡 ★未測定★ ' + h.kai + '回 試して 入れなかった … ' + (h.naze || '（無し）'));
  await b.close(); srv.close(); process.exit(2);
}
await machi(600);

/* ★人の 名前も 入社日も 毎回 同じ★＝★sha256 を 見比べる為★（時計に 頼らない） */
const NA = '整理試験';
const JOIN = '2026-04-01';
try {
  await osu(pg, '.bn[data-scr="scr-settings"]'); await machi(500);
  await osu(pg, '#set-seg .seg-b[data-set="emp"]'); await machi(800);
  /* ★★札が 増えるのを 待つ（2026-09-14 CIで 捕まった）★★
     前は ★足して 0.9秒 待つだけ★で 一番 後ろの 札を 読んでいた。
     ★CI は 遅い★ので 描き直しが 間に合わず、★増える前の 札★を 掴んだ:
       「（はじめに 居た 人 1人 → 今 足した 人＝★札 0番目★）」
       ⇒ その後 ★欄が 1つも 見つからない★（name/kana/… 全部）＝赤。
     ＝★手元は 緑・CIは 赤★の 一番 見つけにくい 形（今日 3回目）。
     ⇒ ★数が 増えた事を 見てから 読む★（★時間では なく 数で 待つ★）。 */
    {
      const kazuMae = await pg.evaluate(() => document.querySelectorAll('#emp-list .mco').length);
      await osu(pg, '#b-add-emp');
      let fueta = false;
      for (let i = 0; i < 40; i++) {                 /* 20秒 */
        const n = await pg.evaluate(() => document.querySelectorAll('#emp-list .mco').length).catch(() => -1);
        if (n > kazuMae) { fueta = true; break; }
        await machi(500);
      }
      if (!fueta) console.log('       🟡 ★札が 増えない★（20秒 待った）＝この先は 当てに ならない');
      await machi(400);
    }
  const IDX = await pg.evaluate(() => {
    const c = Array.from(document.querySelectorAll('#emp-list .mco'));
    return c.length ? c[c.length - 1].getAttribute('data-i') : null;
  });
  if (IDX === null) { MI('従業員の 札が 1枚も 無い'); throw new Error('no-card'); }
  const CARD = '#emp-list .mco[data-i="' + IDX + '"]';

  const nage = (c, sel) => pg.evaluate((a) => {
    const card = document.querySelector(a.c);
    const el = card && card.querySelector(a.sel);
    if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return !!el;
  }, { c, sel }).catch(() => false);
  katazukeSuru = async () => {
    /* ★★片づけは 客の 道で★★（2026-09-15・裏口を 閉じた）
       前は ここで ★JSで イベントを 投げて★ 削除ボタンを 叩いていた＝★門を 迂回していた★
       （[[feedback_js_dispatched_event_is_not_the_customer_path]]）。
       実物で 測り直したら ★札を 開く→詳細設定→削除→確認 の 4段とも 本物の click で 通った★。
       ⇒ ★裏口は 要らない★／★消せないなら それ自体が 客の 困り事★＝そのまま 出す。 */
    const r = await KATAZUKERU(pg, { na: NA, machi, osu });
    r.michi.forEach((m) => console.log('       片づけ … ' + m));
    if (!r.ok) console.log('       🟡 ★客の 道で 消せなかった★ … ' + r.naze);
  };

  console.log('  ★この先は 後始末つき★（殺されても 足した 人を 消す）');

  const aruka = (sel) => pg.evaluate((x) => !!document.querySelector(x), sel).catch(() => false);
  /* ★詳細設定の 印は 切り替え★＝押すたび 開閉する。★中の 欄が 在るか★で 見る
     （2026-09-14 fuyo-ui で 踏んだ＝毎回 押す 書き方だと 1回おきに 閉じる）。 */
  const dsAkeru = async () => {
    for (let i = 0; i < 3; i++) {
      if (await aruka(CARD + ' [data-dsub]')) return true;
      await nage(CARD, '.emp-dtgl[data-dtoggle]'); await machi(900);
    }
    return aruka(CARD + ' [data-dsub]');
  };
  const akeru = async (k) => {
    await pg.evaluate((x) => {
      const card = document.querySelector(x.c); if (!card) return;
      const t = Array.from(card.querySelectorAll('[data-dsub]')).find((e) => String(e.getAttribute('data-dsub')).endsWith(':' + x.k));
      if (t) t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }, { c: CARD, k }).catch(() => null);
    await machi(700);
  };
  const hiraku = async (sel) => {
    for (const k of ['zaiseki', 'zei', 'shaho', 'teate', 'kazoku']) {
      if (await aruka(sel)) break;
      await akeru(k);
    }
    return aruka(sel);
  };

  await dsAkeru();
  await utsu(pg, CARD + ' [data-f="name"]', NA);
  const SEL = CARD + ' [data-f="hokenshaNo"]';
  const ranAru = await hiraku(SEL);
  /* 入社日＝資格取得日。これが 無いと 表に 1行も 出ない */
  if (!(await hiraku(CARD + ' [data-f="joinYmd"]'))) MI('入社日の 欄が 見つからない');
  await utsu(pg, CARD + ' [data-f="joinYmd"]', JOIN);

  if (ranAru) {
    T('④★被保険者整理番号の 入力欄が 在る', true);
    if (UTSU) {
      await hiraku(SEL);
      T('★打てた（' + UTSU + '）', await utsu(pg, SEL, UTSU), '欄は 在るのに 打てない');
    }
  } else {
    MI('被保険者整理番号の 入力欄', '★1つも 無い＝この 木には まだ 欄が 無い★');
    if (UTSU) { fail++; console.log('  ✗ ★--utsu を 頼まれたのに 欄が 無い★'); }
  }

  /* ── 資格取得届の 画面 ───────────────────────────────── */
  await osu(pg, '.bn[data-scr="scr-list"]'); await machi(600);
  await osu(pg, '.seg-b[data-view="cho"]'); await machi(600);
  await osu(pg, '.seg-b[data-cho="shikaku"]'); await machi(1400);
  /* ★★表は 1枚では ない（2026-09-14 実測で 踏んだ）★★
     #view-cho の th を まとめて 数えたら ★別の 表の 見出しと 混ざり★、
     列 4番目＝資格取得日 を 整理番号だと 読んだ（マスに 日付が 出た）。
     ⇒ ★「被保険者整理番号」を 見出しに 持つ 表を 名指しして★、その 中で 数える。 */
  const hyo = await pg.evaluate(() => {
    const c = document.querySelector('#view-cho'); if (!c) return null;
    const hyous = Array.from(c.querySelectorAll('table'));
    const atari = hyous.find((t) => Array.from(t.querySelectorAll('th')).some((x) => x.textContent.trim() === '被保険者整理番号'));
    if (!atari) return { th: hyous.map((t) => Array.from(t.querySelectorAll('th')).map((x) => x.textContent.trim()).join('/')), i: -1, gyo: [], ji: '' };
    const th = Array.from(atari.querySelectorAll('th')).map((x) => x.textContent.trim());
    const i = th.indexOf('被保険者整理番号');
    const gyo = Array.from(atari.querySelectorAll('tbody tr')).map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.textContent.trim()));
    return { th, i, gyo, ji: gyo.map((r) => r.join('|')).join('\n'), hyouKazu: hyous.length };
  });
  if (!hyo || hyo.i < 0) MI('資格取得の 表に 整理番号の 列が 無い', JSON.stringify(hyo && hyo.th));
  else {
    const mas = hyo.gyo.map((r) => r[hyo.i]);
    console.log('       表 … 行 ' + hyo.gyo.length + '本 ／ 整理番号の 列は ' + hyo.i + '番目 ／ そのマス [' + mas.join(' | ') + ']');
    console.log('       ★表の 字の sha256★ … ' + sha(hyo.ji) + '（' + Buffer.byteLength(hyo.ji) + 'バイト）');
    T('①★整理番号の 列が 在る', true);
    if (UTSU) {
      T('②★表の マスに 打った 字が そのまま 出る（' + UTSU + '）', mas.indexOf(UTSU) >= 0,
        '出ていたのは [' + mas.join(' | ') + ']★＝空でない だけでは 緑に しない★');
    } else {
      console.log('       （--utsu を 付けていないので ★字の 突き合わせは していない★）');
    }
  }

  /* ── Excel を 本当に 落とす ───────────────────────────── */
  const [dl] = await Promise.all([
    pg.waitForEvent('download', { timeout: 25000 }).catch(() => null),
    pg.click('#view-cho [data-choxlsx="shikaku"]', { timeout: 8000 }).catch(() => null),
  ]);
  if (!dl) MI('資格取得の Excel', '★落ちてこない★');
  else {
    const fp = await dl.path();
    const buf = fp ? fs.readFileSync(fp) : Buffer.alloc(0);
    console.log('       ★落ちた Excel★ … ' + dl.suggestedFilename() + ' ' + buf.length + 'バイト sha256 ' + sha(buf));
    T('③★Excel が 本当に 落ちる', buf.length > 0, '0バイト');
    /* ★★中の 字を 読む（2026-09-14 指示役1 の 注文 ㋑②）★★
       ★「空でない」で 緑に しない★＝★打った 字と 出た 字を 突き合わせる★。
       この xlsx は ★縮めずに 入っている★ので 生の バイトに 字が そのまま 在る。
       ★縮められていたら 探せない★＝その時は 🟡未測定と 言う（黙って 緑に しない）。 */
    if (UTSU) {
      const nama = buf.toString('utf8');
      const nakaAru = nama.indexOf('<t>' + UTSU + '</t>') >= 0 || nama.indexOf('>' + UTSU + '<') >= 0;
      const naiHazu = String(Number(UTSU) + 1);   /* ★居ないはず の 字★＝探し方が 甘くない事を 見る */
      const usoAru = nama.indexOf('<t>' + naiHazu + '</t>') >= 0;
      if (nama.indexOf('sheet1.xml') < 0) MI('Excel の 中の 字', '★縮めて 入っている＝生では 読めない★');
      else {
        T('⑤★Excel の 中に 打った 字が 在る（' + UTSU + '）', nakaAru, '★中に 見つからない★');
        T('⑤-2★居ないはず の 字（' + naiHazu + '）は 無い', !usoAru, '★探し方が 甘い＝何でも 当たる★');
      }
    }
  }

  MI('賞与支払届・算定基礎届・月額変更届', '★確定した明細が 要る＝この回は 1度も 押していない★');
} catch (e) {
  fail++; console.log('  ✗ 途中で 止まった … ' + (e && e.message));
} finally {
  await katazuke();
  const ato = await pg.evaluate(() => document.querySelectorAll('#emp-list .mco').length).catch(() => -1);
  console.log('       後始末の 後の 人数 … ' + ato + '人');
  await b.close().catch(() => null);
  srv.close();
}
console.log('\n' + pass + ' passed, ' + fail + ' failed, ' + mi + ' ★未測定★');
/* ★本当の 判じは 倉庫★＝画面の 数では ない */
{
  const kesu = await GOMI_KESU(HAJIME);      /* ★この回で 出た 孤児だけ★ */
  if (!kesu.ok) console.log('       🟡 この回の 明細を 消せなかった … ' + kesu.naze);
  const sou = await AWASERU(soukoMae, 20);
  if (sou.han === '環境') console.log('  ' + sou.iu);   /* ★緑で 通すが 数は 出す★（総なめが 拾う 字） */
  else if (sou.han === '未測定') { mi++; console.log('  🟡 ★未測定★ 後始末を 倉庫で 数えられない … ' + sou.iu); }
  else if (sou.han === '緑') { pass++; console.log('  ✓ ★後始末＝★倉庫の 行数★が 元に 戻った'); }
  else { fail++; console.log('  ✗ ★後始末＝★倉庫の 行数★が 元に 戻った — ' + sou.iu); }
}
console.log(String.fromCharCode(10) + '★締め★ ' + pass + ' passed, ' + fail + ' failed, ' + mi + ' はかれない');
process.exit(fail ? 1 : 0);
