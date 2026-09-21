/* fuyo-ui.mjs — ★被扶養者(異動)届を ★実ブラウザで お客さんの道どおり★ 出す★
 * =============================================================================
 * ★なぜ 作ったか（2026-09-14）★
 *   2026-09-14 に ★増えた／減った／変わった の 3通りを 本番へ 出した★。
 *   だが ★実ブラウザで 1回も 押していなかった★＝見たのは lib の 中だけ
 *   （fuyoRow / dasuKaFuyo / 139項目の 検め）。
 *   ★理屈では 揃っている は 測っていないと 同じ★。
 *   2026-09-08 に ★同じ場所で 同じ型★を 踏んでいる＝
 *     「ボタンは『出せます』なのに 押したら ★5件 断られた★」。
 *   ⇒ ★画面から 本当に ファイルが 落ちるか★を 押して 確かめる。
 *
 * ★測る事★
 *   ①家族を 入れる 画面に 要る 欄が 在る（姓/名 × 漢字/カナ・届出の 選び）
 *   ②★届出を 選ぶと 出る欄が 変わる★（増えた＝入った日/理由・減った＝外れた日/理由・変わった＝備考）
 *   ③足りない うちは ★ボタンが 押せない★（嘘を つかない）
 *   ④ぜんぶ 入れたら ★押せる★
 *   ⑤押したら ★SHFD0006.CSV が 本当に 落ちる★／様式コード・列の数・★異動の別★を 1文字ずつ 読む
 *   ⑥★3通りとも★ 出す（増えた／減った／変わった）
 *
 * ★後始末★（指示役1 の 注文・2026-09-14）
 *   ・★押す前と 後で 行数を 数える★（増えた分＝自分の ゴミ）
 *   ・★try/finally＋終了合図★で 消す（殺されても 残りにくい）
 *   ・★テスト倉庫だけ★（本番倉庫には 触らない）
 *
 * 使い方: node kyuyo/tests/fuyo-ui.mjs [--self-test]
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELF = process.argv.includes('--self-test');

/* ★物差しそのもの★（ブラウザを 使わずに 確かめられる 形）
   落ちた CSV を 読んで ★様式コード・列の数・異動の別★ を 数える。 */
export function csvMiru(text) {
  const gyo = String(text || '').split('\r\n').filter((x) => x.length);
  const data = gyo.filter((x) => x.indexOf('2202700') === 0);
  const retsu = data.map((x) => x.split(',').length);
  const zure = retsu.filter((n) => n !== 139).length;
  /* 異動の別＝21番目（0始まりで 20） */
  const idou = data.map((x) => x.split(',')[20]);
  return { gyo: gyo.length, data: data.length, retsu: retsu[0] || 0, zure, idou };
}

if (SELF) {
  console.log('\n[fuyo-ui] ★自己確認★（★物差しそのもの★・ブラウザを 使わない）');
  let ng = 0;
  const iu = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  const CR = String.fromCharCode(13) + String.fromCharCode(10);
  const gyo1 = ['2202700'].concat(new Array(138).fill('')).join(',');
  const seikaku = gyo1.slice(0, gyo1.length);
  const a = csvMiru('管理レコード' + CR + seikaku + CR);
  iu('データ行を 1本 数える', a.data === 1);
  iu('列は 139', a.retsu === 139);
  iu('ずれ 0', a.zure === 0);
  const kaketa = seikaku.split(',').slice(0, 138).join(',');
  iu('★1列 減らしたら ずれと 数える★', csvMiru(kaketa + CR).zure === 1);
  const ido2 = seikaku.split(','); ido2[20] = '2';
  iu('異動の別を 読める', csvMiru(ido2.join(',') + CR).idou[0] === '2');
  iu('空なら 0本', csvMiru('').data === 0);
  console.log(ng ? '\n★自己確認 ' + ng + '件 おかしい★' : '\n自己確認 OK');
  process.exit(ng ? 1 : 0);
}

/* ── ここから 実ブラウザ ───────────────────────────────── */

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
let borrow, pwLaunch, hairu, osu, KAZOERU, AWASERU, GOMI_KESU, IMA, KATAZUKERU, KAISHA_HIKAE, KAISHA_MODOSU, SHIKEN_NA;
try {
  ({ borrow, launch: pwLaunch } = await import('../../scripts/_borrow-playwright.mjs'));
  ({ hairu, osu } = await import('../../tests/_hairu.mjs'));
  ({ kazoeru: KAZOERU, awaseru: AWASERU, konkaiNoGomiKesu: GOMI_KESU, ima: IMA,
     kaishaHikaeru: KAISHA_HIKAE, kaishaModosu: KAISHA_MODOSU, shikenNa: SHIKEN_NA } = await import('./_souko-kazoeru.mjs'));
  ({ katazukeru: KATAZUKERU } = await import('./_kyaku_no_michi_de_katazukeru.mjs'));
} catch (e) { console.log('🟡 ★未測定★ 道具が 読めない … ' + (e && e.message)); process.exit(2); }
const wk = await borrow('fuyo-ui', 'webkit');
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
const b = await pwLaunch('fuyo-ui', wk);

let pass = 0, fail = 0, mihakari = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };
const machi = (ms) => new Promise((r) => setTimeout(r, ms));
const Z = String.fromCharCode(12288);   /* 全角スペース＝姓名の 区切り（項番72） */

/* ★後始末は 殺されても 効くように★（%TEMP% の 前科と 同じ手） */
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

console.log('\n[fuyo-ui] 被扶養者(異動)届を ★実ブラウザで お客さんの道どおり★ 出す');

const ctx = await b.newContext({ viewport: { width: 1000, height: 1400 }, acceptDownloads: true });
const pg = await ctx.newPage();
/* ★★「前」は ★ログインの 前★に 数える（2026-09-14 実測で 直した）★★
   ログインの 後に 数えたら ★人 4→3（-1）★で 赤に なった。
   訳＝★ログインした 途端に 既定の『従業員 1』が 倉庫に 書かれる★（今日 見つけた 幻の人）。
     その後 読み直しが 着いて 消えるので、★後に 数えると 1人 減って 見える★。
   ⇒ ★1行も 触っていない 時の 数★を 土台に する。 */
/* ★始まりは ★倉庫の 時計★に 聞く★＝手元の 時計から 遡ると
   ★直前の 試験の ゴミまで 窓に 入り、自分が 作っていない 物を 消す★（総なめで 捕まった）。 */
const HAJIME = await IMA().then((x) => (x.ok ? x.t : new Date(Date.now() - 5000).toISOString()));  /* ★この回の 始まり★＝これ以降の 孤児だけ 消す */
  /* ★会社の 欄も 控える★＝この試験は `#c-pref` ほか 会社の 欄に 打つ（363-380行）が ★戻す 字が 無かった★
     ⇒ 手元の 総なめ #25 で ★kyuyo.pay_companies の 指紋 ずれ★で 赤に なった。 */
  const KAISHA_MAE = await KAISHA_HIKAE();
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

try {
  /* ── 従業員を 1人 足す（★今 足した 人だけ 触る★） ────────────── */
  await osu(pg, '.bn[data-scr="scr-settings"]'); await machi(500);
  await osu(pg, '#set-seg .seg-b[data-set="emp"]'); await machi(800);
  const mae = await pg.evaluate(() => document.querySelectorAll('#emp-list .mco').length);
  /* ★★置き土産は ★倉庫の 行数★ で 数える（2026-09-14 私の 不始末）★★
     前は ★画面の 札の 数★だけを 見て「ゴミ0」と 緑を 出していた。
     ところが 倉庫には ★今日 足した 人が 2人 残っていた★
       （画面からは 消えた／★保存が 後から 走って 書き戻る・消しが 届かない★）。
     ＝★今日 ずっと 潰してきた「測ったつもり」を 私の 後始末が やっていた★。
     ⇒ ★倉庫の pay_employees と pay_payslips の 行数を 前後で 突き合わせる★。
       ★画面から 消えた は 緑の 根拠に しない★。 */
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
  if (IDX === null) { console.log('  🟡 ★未測定★ 従業員の 札が 1枚も 無い'); throw new Error('no-card'); }
  const CARD = '#emp-list .mco[data-i="' + IDX + '"]';
  console.log('  （はじめに 居た 人 ' + mae + '人 → 今 足した 人＝札 ' + IDX + '番目）');
  katazukeSuru = async () => {
    /* ★★片づけは 客の 道で★★（2026-09-15・裏口を 閉じた）
       前は ここで ★JSで イベントを 投げて★ 削除ボタンを 叩いていた
       ＝[[feedback_js_dispatched_event_is_not_the_customer_path]] の 通り ★門を 迂回する★。
       実物で 測り直した ところ ★4段とも 本物の click で 通りました★
       （札を 開く → 詳細設定 → 削除 → 確認）。⇒ ★裏口は 要らない★。
       ★名前では なく 札の 番号で 渡す★＝この 試験は ★人を 足してから 後で 名前を 打つ★ので、
       途中で 落ちた 時は まだ 名前が 無い。 */
    const r = await KATAZUKERU(pg, { ban: IDX, machi, osu });
    r.michi.forEach((m) => console.log('       片づけ … ' + m));
    if (!r.ok) console.log('       🟡 ★客の 道で 消せなかった★ … ' + r.naze);

    /* ★★ここは 裏口を 残す（2026-09-15・指示役1 と 決めた）★★
       ★訳＝アプリに 明細を 消す 道が 無い★（字で 数えた）:
         ・app.js 5355〜 の「この従業員を削除」は ★state.employees から 抜くだけ★
         ・store.js:206 が pay_employees の 行は 本当に 消す
         ・★pay_payslips を delete している 所は 1か所も 無い★
           （消しているのは payslip_batches:87 と pay_meisai_docs:448 だけ）
       ⇒ ★人は 消える／明細は 倉庫に 残る＝孤児に なる★。★実測★（2026-09-15・本物の click 1回）
         … 人 4→3 なのに ★孤児 3,716→3,717＝+1★。
       ⇒ ★これは 客にも 起きる 欠陥＝別件（司さん待ち・指示役1 が 持つ）★。
       ★★この 裏口を 外す 条件★★
         ＝★アプリが 削除の時に その人の pay_payslips も 消すように なったら★ ここを 消す。
       ★条件を 書かない 裏口は 永久に 残る★ので、必ず この 3行を 一緒に 動かす事。 */
    const kesu = await GOMI_KESU(HAJIME);
    if (!kesu.ok) console.log('       🟡 明細を 消せなかった … ' + kesu.naze);
    const ks = await KAISHA_MODOSU(KAISHA_MAE);
    console.log('       片づけ … ' + (ks.ok ? '★会社の 欄を 控えに 戻した ' + ks.n + '行★（媒体通番は 戻さない）'
      : '🟡 会社の 欄を 戻せなかった … ' + ks.naze));
  };

  console.log('  ★この先は 後始末つき★（殺されても 足した 人を 消す）');
  T('★従業員を 1人 足せた（画面の ボタンから）', true);

  /* ★詳細設定を 開く★＝本人の 欄も 家族も この中に 在る（実測） */
  const nage = (c, sel) => pg.evaluate((x) => {
    const card = document.querySelector(x.c);
    const el = card && card.querySelector(x.sel);
    if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return !!el;
  }, { c, sel }).catch(() => false);
  /* ★かたまりは 1つずつ 閉じている★＝本人の 欄も 家族も その中（実測で 6欄 見つからなかった）。
     ⇒ ★この札の かたまりを 全部 開く★。
     ★ここの JS投げが 許される 訳（2026-09-15 に 線を 引き直した）★
       ＝★開け閉めは ★打ち込みの 道★／★測る所（届が 本当に 出るか）は 本物の click★
       ＝★門を 迂回しない★のが 決まりの 訳で、「JSを 一切 使うな」では ない。
     ★注意★＝★片づけは もう JS投げでは ありません★（客の道＝_kyaku_no_michi_de_katazukeru.mjs）。 */
  /* ★★開く つもりが 閉じていた（2026-09-14 実測）★★
     かたまりの 印は ★切り替え★なので、★既に 開いている 物を 押すと 閉じる★。
     1回目で 家族が 開き、2回目で 家族が 閉じ 本人の 欄が 開いた＝★毎回 どこかが 欠けた★。
     ⇒ ★欲しい 欄が 出るまで 押す★＝★開いたか どうかは ★欄の 有無★で 決める★
       （印が 付いたかでは 見ない＝会社の 決まり）。 */
  const aruka = (sel) => pg.evaluate((x) => !!document.querySelector(x), sel).catch(() => false);

  /* ★★時間では なく ★数★で 待つ（2026-09-15・CI で 4回中 2回 落ちた）★★
     ★落ちていた 形★ … 押した 後 ★決まった 秒（700ms）だけ 待って★ 欄が 在るかを 見て いた。
       ⇒ ★CI は 手元より 遅い★＝★まだ 出ていない のに「無い」と 判じ★、
         次の かたまりを 押して ★開いていた 物を 閉じる★（印は 切り替え）
       ⇒ ★増えた/減った/変わった の 3つとも「ボタンが 押せない」で 赤★。
       ★数★ … 手元 3回とも 緑／CI ★2勝2敗★（258027e緑・067c35e赤・b4148ae緑・55367c2赤）
     ⇒ ★★欲しい 欄が 何本 出たかを 数え、★増えるまで★ 待つ★★（上限つき）。
     ★待った 秒を 出す★＝★上限が 妥当かを 次の 人が 直せる★（今日 何度も 使った 形）。
     ★★『上限 ◯秒』は『◯秒で 止まる』では ない★★＝1回の 見に 時間が 掛かる ぶん はみ出す。 */
  const kazoeru2 = async (hoshii) => {
    let n = 0;
    for (const sel of hoshii) { if (await aruka(sel)) n++; }
    return n;
  };
  const matsu = async (hoshii, mae, ue) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ue) {
      const n = await kazoeru2(hoshii);
      if (n > mae || n === hoshii.length) return { n, matta: (Date.now() - t0) / 1000 };
      await machi(300);
    }
    return { n: await kazoeru2(hoshii), matta: (Date.now() - t0) / 1000 };
  };
  const akeru = async (k) => {
    await pg.evaluate((x) => {
      const card = document.querySelector(x.c); if (!card) return;
      const t = Array.from(card.querySelectorAll('[data-dsub]'))
        .find((e) => String(e.getAttribute('data-dsub')).endsWith(':' + x.k));
      if (t) t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }, { c: CARD, k }).catch(() => null);
  };
  const hiraku = async (hoshii) => {
    let mae = await kazoeru2(hoshii);
    let mattaKei = 0;
    for (const k of ['zaiseki', 'zei', 'shaho', 'teate', 'kazoku']) {
      if (mae === hoshii.length) break;
      await akeru(k);
      /* ★探す ための 待ちは 短いまま（1つ ぶん 6秒）★
         ★一度 18秒に 上げて 測ったら 手元が 18.2秒 → ★54.3秒★に なった★
         ＝★欄が 入って いない かたまりでも 18秒 待つ★から。
         ⇒ ★探す 待ちは 元へ戻し、下の ★まとめ待ち★だけ 長くする★（そこが 遅い 機械の 効く所）
         ＝★外れた 見込みも 残す★[[feedback_hazureta_mikomi_wo_sutenai]] */
      const r = await matsu(hoshii, mae, 6000);
      mattaKei += r.matta;
      mae = r.n;
    }
    if (mae !== hoshii.length) {
      /* ★最後に もう一度 まとめて 待つ★＝★遅い 機械で 出そろう のを 逃さない★ */
      /* ★★まとめ待ち 12秒 → 36秒★★（2026-09-19 CI の 実測で 上げた）
         ★測った★ … 同じ 機械・同じ 回で ★「かたまりを 開く」に 18.2秒★
           次の 段は ★30.2秒 待って 1個 足りない★で 赤（★手元は 0.0秒★）。
         ⇒ ★遅さは 手元の 何十倍★＝★12秒は 近すぎた★（「たまに 赤」の 正体）
         ⇒ ★早く 出れば すぐ 抜ける★＝手元の 速さは 変わらない。
         ＝[[feedback_yure_to_yobu_mae_ni_dore_dake_tarinai_ka_hakare]] */
      /* ★★`mae - 1` だと ★まとめ待ちが 1度も 効きません★★（2026-09-21 字で 決めた）
         `matsu` は ★`n > mae` なら すぐ 戻る★。何も 見つかって いない 時は mae = 0 なので
         ★`0 > -1` が ★最初から 真★★ ⇒ ★★「36秒 待つ」が ★即 戻る★★
         ⇒ ★実際の 上限は かたまり 5つ × 6秒 ⇒ ★丁度 30秒★だけだった★
         ★実測★ … 赤の 回 ★待った 31.1秒 / 31.4秒★＝★上限 そのもの（余り 0）★
         ⇒ ★★「揺れ」では なく 「足りない」★★（★揺れと 呼ぶ 前に どれだけ 足りないか 測れ★）
         ★これは 09-19 に 「12秒 → 36秒 に 上げた」と 紙に 書いた 当の 待ちです★
         ⇒ ★★「変えた つもり」は 出しの 字で 確かめろ★★＝★上げた はずの 待ちが 一度も 動いて いなかった★ */
      const r2 = await matsu(hoshii, mae, 36000);
      mattaKei += r2.matta;
      mae = r2.n;
    }
    const nokori2 = [];
    for (const sel of hoshii) { if (!(await aruka(sel))) nokori2.push(sel); }
    return { nokori: nokori2.length, matta: mattaKei.toFixed(1) + '秒',
      doko: nokori2.map((x) => x.replace(/^.*\[data-/, '[data-')) };
  };

  /* ★★詳細設定の 印は「切り替え」＝押すたび 開いたり 閉じたり（2026-09-14 実測で 踏んだ）★★
     ★毎回 押す★書き方だと ①の 回で 閉じ、②で 開き…と 交互に なり、
     ★増えた の 5欄（職業/同居/収入/入った日/理由）だけ 打てず★「出せる人が いません」に なった。
     ⇒ ★開いているかは『中の 欄が 在るか』で 見る★（印が 付いたかでは 見ない＝会社の 決まり）。 */
  const dsAkeru = async () => {
    /* ★ここも 時間では なく 数で 待つ★（上と 同じ 訳） */
    const t0 = Date.now();
    let atta = null;
    for (let i = 0; i < 3; i++) {
      if (await aruka(CARD + ' [data-dsub]')) return true;
      /* ★★`nage` は ★押す 物が 在ったか★ を 返して いるのに 捨てて いました★★
         （2026-09-21＝今日 4つ目の「飲む」。★押す 物が 無い★と
          ★押したが 開かない★は ★全く 別の 枝★なのに 同じ 顔に なる） */
      atta = await nage(CARD, '.emp-dtgl[data-dtoggle]');
      const r = await matsu([CARD + ' [data-dsub]'], 0, 6000);
      if (r.n > 0) return true;
    }
    /* ★★ここも ★上限 そのもの★ で 落ちて いました★★（2026-09-21）
       ★上★ … 3回 × 6秒 ⇒ ★丁度 18秒★／★実測 ★待った 18.7秒★＝★余り 0★
       ⇒ ★揺れでは なく 足りない★。`hiraku` と 同じ 形で ★最後に まとめて 待つ★。
       ★遅く ならない 訳★ … `matsu` は ★出た すぐ 戻る★＝★待ちの 代金は 落ちる 時だけ★ */
    if (!(await aruka(CARD + ' [data-dsub]'))) {
      const r3 = await matsu([CARD + ' [data-dsub]'], 0, 36000);
      if (r3.n > 0) { console.log('       ★詳細設定は まとめ待ちで 開きました … ' + r3.matta.toFixed(1) + '秒★'); return true; }
    }
    const ok = await aruka(CARD + ' [data-dsub]');
    if (!ok) {
      /* ★★「開かない」だけでは 因が 決まらない★★＝★番を 全部 出す★
         ★見る 物★ … ★札自体が 在るか★／★切り替えの 印が 何個★／★中身が 何個★
           ／★覚い（モーダル）が 出て いないか★（今日 `.wm-qrall` で 捕まえた 形）
           ／★印の 真ん中に 居る 物★（`elementFromPoint`） */
      const mi = await pg.evaluate((c) => {
        const card = document.querySelector(c);
        const tg = card && card.querySelector('.emp-dtgl[data-dtoggle]');
        let ue = null;
        if (tg) {
          const b = tg.getBoundingClientRect();
          const e2 = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          ue = e2 ? (e2.tagName.toLowerCase() + (e2.className ? '.' + String(e2.className).split(' ').join('.') : '')).slice(0, 60) : '(誰も 居ない)';
        }
        return { fuda: !!card, tgl: card ? card.querySelectorAll('.emp-dtgl[data-dtoggle]').length : -1,
          dsub: card ? card.querySelectorAll('[data-dsub]').length : -1,
          ooi: document.querySelectorAll('.ui-modal-ov').length, ue: ue, sai: window.__saiKazu,
          fudaKazu: document.querySelectorAll('#emp-list .mco').length };
      }, CARD).catch((e) => ({ dame: String((e && e.message) || e).slice(0, 60) }));
      console.log('       🟡 詳細設定が ' + ((Date.now() - t0) / 1000).toFixed(1) + '秒 待っても 開かない'
        + ' … ★押す 物が 在ったか ' + JSON.stringify(atta) + '★ ／ ' + JSON.stringify(mi));
    }
    return ok;
  };
  await dsAkeru();
  const HON = ['seibetsu', 'zip', 'address', 'kisoNenkin', 'hokenshaNo'].map((f) => CARD + ' [data-f="' + f + '"]');
  /* ★★描き直しを 数える★★（2026-09-21＝指示役1 の ★枝★）
     ★見立て★ … ★開けて いる★のに ★読み込みが 遅れて 返り 画面ごと 描き直され★
       ★開いた 物が 閉じる★のでは ないか
       （実測済み … `reloadCloud` → `applyCloudState` → `showScreen(...)` で 描き直す／
         ★時間切れが 0か所★＝読み込みは ★何秒でも 遅れて 返る★）
     ★当てません★ … ★描き直しの 回数を 数えて 出すだけ★ */
  await pg.evaluate(() => {
    if (window.__saiKazu != null) return;
    window.__saiKazu = 0;
    const t = document.querySelector('#emp-list');
    if (!t) { window.__saiKazu = -1; return; }
    new MutationObserver((ms) => {
      for (const m of ms) {
        if (m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length)) window.__saiKazu++;
      }
    }).observe(t, { childList: true, subtree: true });
  }).catch(() => null);
  const saiYomu = () => pg.evaluate(() => window.__saiKazu).catch(() => null);
  const saiMae = await saiYomu();
  console.log('       かたまりを 開く … ' + JSON.stringify(await hiraku(HON)));
  console.log('       描き直しの 回数 … 開く前 ' + saiMae + ' → 開いた後 ' + (await saiYomu()));

  /* ── ① 本人の 欄（★確定は させない★＝A案。届出に 明細の 確定は 要らない） ── */
  /* ★★名前の 頭に 席の 印を 付ける★★（2026-09-19）
     ★訳★＝★同じ 試験の 倉庫を ★この 機械★と ★GitHub の 機械★が 使う★
       ⇒ ★増えた 人が どちらの 物か 名前で 分かる★＝★門が 相手の 分で 赤に しない★
       （印が 無いと ★「どちらか 決められない」＝赤★の まま＝★CI が 走る たび 赤★）
     ★印★ … 手元＝`手` ／ 会社の 検査＝`CI`（`_souko-kazoeru.mjs` の `SEKI_SHIRUSHI`） */
  const NA = SHIKEN_NA('試験' + String(Date.now()).slice(-6));
  for (const [f, v] of [['name', NA + Z + '太郎'], ['kana', 'ｼｹﾝ ﾀﾛｳ'], ['birthYmd', '1985-05-15'],
    ['seibetsu', 'male'], ['zip', '790-0001'], ['address', '愛媛県松山市1-2-3'],
    ['kisoNenkin', '1234-567890'], ['hokenshaNo', '1']]) {
    if (!(await utsu(pg, CARD + ' [data-f="' + f + '"]', v))) console.log('       🟡 欄が 無い … ' + f);
  }
  /* 家族（被扶養者）の かたまりを 開く */
  /* 家族を 1人 足す（★本物の click★＝ここは 測る所） */
  /* ★家族の かたまりを 開いてから 足す★（開いていないと ＋の ボタンも DOM に 無い） */
  /* ★★ここの 出しを 出さないと 因が 決められません★★（2026-09-21 実測で 踏んだ）
     ★何が 起きたか★ … 家族の 欄が ★約31秒 待っても 0個★（2回 連続）
       ★しかし ★＋の ボタンを 開けたか・押せたか★ が ★字に 出て いなかった★
       （`.catch(() => null)` で ★黙って 死ぬ★＝★口を 確かめずに 書いた コードは 静かに 死ぬ★）
     ⇒ ★★見られない 物は 見張れない★★＝★開けたか・押せたか・何個 在るかを 全部 出す★ */
  const kzAke = await hiraku([CARD + ' [data-kzadd]']);
  const kzBtn = await pg.evaluate((c) => document.querySelectorAll(c + ' [data-kzadd]').length, CARD);
  let kzOsu = 'OK';
  /* ★★playwright の 「なぜ 押せないか」は ★後ろの 行に 出る★★（2026-09-21 CI で 踏んだ）
     ★前★ … ★行を 切って 頭の 80字だけ★ ⇒ `page.click: Timeout 8000ms exceeded.` だけ 残った
       ⇒ ★★訳（見えない／動いて いる／★覆いに 遮られて いる★）を 私が 切って 捨てて いた★★
     ⇒ ★行を 繋げて 400字まで 残す★（★出しを 自分で 切ったら 書く★） */
  await pg.click(CARD + ' [data-kzadd]', { timeout: 8000 }).catch((e) => {
    /* ★★切った 事を ★数で★ 出す★★（2026-09-21＝400字では 足りなかった）
       ★実測★ … 400字で `scrolling into view if needed` まで。
         ★`intercepts pointer events` の 行まで 届いて いない★
       ⇒ ★上限を 上げる★＋★★全何字のうち 何字 出したかを 必ず 書く★★
         （★次に 足りたか 余ったかを ★数で★ 決められる★） */
    const zenji = String((e && e.message) || e).split(String.fromCharCode(10)).join(' / ');
    const UE = 1600;
    kzOsu = zenji.slice(0, UE) + '【全 ' + zenji.length + '字のうち '
      + Math.min(UE, zenji.length) + '字 出した' + (zenji.length > UE ? '＝★足りて いません★' : '＝足りて います') + '】';
  });
  console.log('       家族の ＋ボタン … 開けた ' + JSON.stringify(kzAke)
    + ' ／ DOMに ' + kzBtn + '個 ／ 押した ' + kzOsu);
  /* ★★押せなかった 瞬間の 番★★（2026-09-21＝指示役1 の ①）
     playwright の click が 待つ 物は 4つ … ★見える／動いて いない／押せる／覚いが 無い★
     ⇒ ★どれが 揃わなかったかを その場で 取る★（★今朝 `.wm-qrall` で 使った 形★）
     ★画面の 大きさも 取る★ … ★手元では 押せて CI で 押せない★ので ★違いを 探す★ */
  if (kzOsu !== 'OK') {
    const ban = await pg.evaluate((c) => {
      const card = document.querySelector(c);
      const el = card && card.querySelector('[data-kzadd]');
      if (!el) return { nai: true };
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const x = b.left + b.width / 2, y = b.top + b.height / 2;
      const ue = document.elementFromPoint(x, y);
      const na = (n) => n ? (n.tagName.toLowerCase()
        + (n.id ? '#' + n.id : '')
        + (n.className ? '.' + String(n.className).trim().split(/\s+/).join('.') : '')).slice(0, 70) : '(誰も 居ない)';
      return {
        mieru: !!(b.width && b.height) && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0',
        hako: { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) },
        gamen: { w: innerWidth, h: innerHeight },
        nakaKa: b.top >= 0 && b.left >= 0 && b.bottom <= innerHeight && b.right <= innerWidth,
        ue: na(ue), jibunKa: ue === el || (ue && el.contains(ue)),
        ooi: document.querySelectorAll('.ui-modal-ov, .modal, [aria-modal="true"]').length,
        /* ★★覚いの 正体を 名指しする★★（2026-09-21 実測）
           `.ui-modal-ov` は ★読み込み中の 覚いでは なく★
           ★`uiModal()` が 作る 確認・お知らせの 箱★（app.js:2182）
           ＝★ボタンを 押すまで 消えない★＝★お客さんも 下を 押せない★
           ⇒ ★★どの 箱かを 出さないと 直せません★★ */
        hako_no_ji: Array.prototype.slice.call(document.querySelectorAll('.ui-modal-ov')).map((o) => ({
          dai: (o.querySelector('.ui-modal-t') || {}).textContent || '(題 無し)',
          hon: ((o.querySelector('.ui-modal-b') || {}).textContent || '(文 無し)').slice(0, 200),
          botan: Array.prototype.slice.call(o.querySelectorAll('.ui-modal-btn')).map((b2) => b2.textContent),
        })),
        pe: cs.pointerEvents, disabled: !!el.disabled,
      };
    }, CARD).catch((e) => ({ dame: String((e && e.message) || e).slice(0, 80) }));
    console.log('       ★押せなかった 瞬間の 番★ … ' + JSON.stringify(ban));
  }
  await machi(1000);
  /* ★足すと 描き直る★＝欄が 出るまで もう一度 開く */
  console.log('       家族の 欄を 出す … ' + JSON.stringify(await hiraku([CARD + ' [data-kz$=":0:seiKanji"]'])));
  console.log('       描き直しの 回数（家族の 欄を 待った 後） … ' + (await saiYomu()));
  const kzAru = await pg.evaluate((c) => document.querySelectorAll(c + ' [data-kz]').length, CARD);
  T('★家族を 1人 足せた（欄が 出た）', kzAru > 0, '家族の 欄が ' + kzAru + '個');

  /* 家族の 欄を 埋める（★姓と 名は 分けて★＝2026-09-14 に そう した） */
  /* ★★2026-09-14 実測で 踏んだ★★
     data-i（札の 番号）で 家族の 欄を 指していたが、★描き直すと 番号が 変わり得る★。
     実際 異動の別を 変えても ★3通りとも 同じ 言い分★が 出た＝★切り替わっていなかった★。
     ⇒ ★番号に 頼らず「後ろが :欄の名前 で 終わる」で 指す★（この札の 中の 1人目）。 */
  const KZ = (f) => CARD + ' [data-kz$=":0:' + f + '"]';
  for (const [f, v] of [['seiKanji', '試験'], ['meiKanji', '一郎'], ['seiKana', 'ｼｹﾝ'], ['meiKana', 'ｲﾁﾛｳ'],
    ['birthYmd', '2015-06-06'], ['seibetsu', 'male'], ['zokugara', '01'],
    ['zip', '790-0001'], ['jusho', '愛媛県松山市1-2-3']]) {
    if (!(await utsu(pg, KZ(f), v))) console.log('       🟡 家族の 欄が 無い … ' + f);
  }

  /* ── ② 会社の 欄（事業所）＝帳票の 箱の 中で 聞いている ───────── */
  const chohyo = async () => {
    await osu(pg, '.bn[data-scr="scr-list"]'); await machi(600);
    await osu(pg, '.seg-b[data-view="cho"]'); await machi(600);
    await osu(pg, '.seg-b[data-cho="shikaku"]'); await machi(1300);
    return pg.evaluate(() => {
      const btn = document.querySelector('#b-fuyo-csv');
      const c = document.querySelector('#view-cho');
      const box = btn ? btn.closest('.card') : null;
      return { fuda: btn ? btn.textContent.trim() : '（無い）', osenai: btn ? btn.disabled : null,
        hako: box ? box.textContent.replace(/\s+/g, ' ').trim().slice(0, 600) : '（箱が 無い）',
        chui: Array.from(c ? c.querySelectorAll('.cr-warn') : []).map((x) => x.textContent.replace(/\s+/g, ' ').trim()) };
    });
  };
  await osu(pg, '.bn[data-scr="scr-settings"]'); await machi(500);
  await osu(pg, '#set-seg .seg-b[data-set="company"]'); await machi(700);
  if (!(await utsu(pg, '#c-pref', 'ehime'))) console.log('       🟡 県の 欄に 打てない');
  /* ★★会社の 住所は「ログインの 後に 遅れて 届く 写し」（2026-09-14 CIで 実測）★★
     給与の 会社情報は ★入口の 共有データが 持ち主★で、ここに 在るのは 写し。
     写しは window.PayslipSyncOrg() が ★ログインの 後に 1回だけ★ 取りに行く。
     ★手元は 速いので 届いた後に 触っていた／CI では 届く前に 判じていた★
       ＝「⚠ まだ 出せません／事業所所在地が まだです」で ★3通りとも 赤★に なった。
       ＝★アプリの 穴では なく 私が 待っていなかった★。
     ⇒ ★住所が 画面に 出るまで 待つ★（お客さんも 出るまでは 押せない）。
       ★届かなければ ✗では なく 🟡未測定★＝★測れていない事を 測れたと 言わない★。 */
  const jushoMatsu = async (byo) => {
    for (let i = 0; i < byo * 2; i++) {
      const t = await pg.evaluate(() => {
        const e = document.querySelector('#c-addr-ro');
        return e ? e.textContent.trim() : null;
      }).catch(() => null);
      if (t && t !== '—' && t.indexOf('入っていません') < 0) return t;
      await machi(500);
    }
    return null;
  };
  const jusho = await jushoMatsu(20);
  if (jusho) console.log('       会社の 住所が 届いた … ' + jusho);
  else {
    mihakari++;
    console.log('  🟡 ★未測定★ 会社の 住所が 20秒 待っても 届かない'
      + '（＝この先の 届出は 測れない。★赤では なく 未測定★）');
  }
  await chohyo();
  for (const [k, v] of [['seiriKigou', '01-ｱｲ'], ['jigyoshoNo', '12345'],
    ['zip', '790-0001'], ['tel', '089-123-4567'], ['nushi', '健保' + Z + '良一']]) {
    await utsu(pg, '#view-cho [data-fc="' + k + '"]', v);
  }

  /* ── ③ 異動の別 3通りで ボタンの 様子を 見る ───────────────── */
  const idouKae = async (v) => {
    await osu(pg, '.bn[data-scr="scr-settings"]'); await machi(500);
    await osu(pg, '#set-seg .seg-b[data-set="emp"]'); await machi(700);
    await dsAkeru();
    await hiraku([CARD + ' [data-kz$=":0:idou"]']);
    if (!(await utsu(pg, KZ('idou'), v))) console.log('       🟡 異動の別の 欄が 無い');
    await machi(400);
    /* ★1欄ごとに『在るか』を 見てから 打つ★＝描き直しで 消えていたら 開き直す。
       ★打てなかった事を 黙って 通さない★（前は 黙って 通し「出せる人が いません」の 訳が 見えなかった）。 */
    const kzu = async (f, val) => {
      await hiraku([KZ(f)]);
      if (!(await utsu(pg, KZ(f), val))) console.log('       🟡 家族の 欄が 無い … ' + f);
    };
    if (v === '1') { await kzu('shokugyo', '4'); await kzu('doukyo', '1');
      await kzu('shunyu', '0'); await kzu('nattaYmd', '2026-04-01');
      await kzu('nattaRiyu', '1'); }
    if (v === '2') { await kzu('yametaYmd', '2026-08-31'); await kzu('yametaRiyu', '2'); }
    if (v === '3') { await kzu('bikou', '氏名変更（旧：試験' + Z + '一朗）'); }
    return chohyo();
  };
  /* ★★1枚目だけ 落ちない★ の 訳を 割る 為の ◆順番を 入れ替える◆★★（2026-09-21）
     ★問い★ … ★1枚目だけ 何が 違うか★
       㞊 ★順番★（前に 何も 無い／落とす 仕組みが まだ 温まって いない）
       㞋 ★中身★（異動の別 [1] だけ 別の 道を 通る）
     ★割り方★ … ★FUYO_JUN=gyaku で [3] を 1枚目に する★
       ・入れ替えても 1枚目が 落ちない ⇒ ★順番の 話★
       ・[1] が 何番目でも 落ちない ⇒ ★中身の 話★
     ＝★2通りの 入れ方で 比を 見る★（今日 何度も 使った 形） */
  const KUMI = [['1', '増えた'], ['2', '減った'], ['3', '変わった']];
  if (String(process.env.FUYO_JUN || '') === 'gyaku') KUMI.reverse();
  console.log('  ★試す 順番★ … ' + KUMI.map((x) => x[1] + '[' + x[0] + ']').join(' → ')
    + (String(process.env.FUYO_JUN || '') === 'gyaku' ? '（★逆★）' : '（並）'));
  for (const [v, na] of KUMI) {
    /* ★材料（会社の 住所）が 届いていないなら ★赤では なく 未測定★★
       ＝★押せない 訳が アプリの 側に 在るのか 私の 側に 在るのか 分からない★時に
         赤を 出すと ★狼少年★に なる（[[feedback_mimisokutei_to_kikai_ga_maikai_mite_inai_wa_betsumono]]）。 */
    if (!jusho) { mihakari++; console.log('  🟡 ★未測定★ ' + na + ' … 会社の 住所が 届いていない'); continue; }
    const r = await idouKae(v);
    console.log('  ── 異動の別「' + na + '」 … ボタン「' + r.fuda + '」／押せない ' + r.osenai);
    if (r.chui.length) console.log('       画面の 言い分 … ' + r.chui.join(' ／ ').slice(0, 220));
    if (r.osenai !== false) console.log('       ★箱の 字★ … ' + r.hako);
    T('★' + na + '＝ボタンが 押せる', r.osenai === false,
      '押せない（上の 言い分を 見る）');
    if (r.osenai !== false) continue;
    /* ★★押せる は 出る では ない（2026-09-08 に 同じ場所で 踏んだ）★★
       ⇒ ★本当に 押して 落として 中の 字を 読む★。
       Shift_JIS の 2バイト目は 0x40-0x7E / 0x80-0xFC＝★カンマ(0x2C)に ならない★ので、
       列を 数えるだけなら latin1 で 読んで よい（字を 出す 所では 使わない）。 */
    /* ★★「落ちて こない」には 2つ 在る★★（2026-09-21＝指示役1 の 㞎）
       㞊 ★本当に 1つも 無い★／㞋 ★落ちて いるが ★私が 見て いる 所に 無い★★
       （★今日 何度も 出た 形★）
       ★待ちの 上限と 実測を 並べる★／★押した 時の 訳を 飲まない★／
       ★別の 窓（popup）・画面の 叫びも 数える★ */
    const DL_UE = 25000;
    const t0dl = Date.now();
    const sakebi = [];
    const onErr = (e) => sakebi.push('pageerror: ' + String((e && e.message) || e).slice(0, 90));
    const onCon = (m) => { if (m.type() === 'error') sakebi.push('console: ' + m.text().slice(0, 90)); };
    const onPop = () => sakebi.push('★別の 窓が 開いた（popup）★');
    pg.on('pageerror', onErr); pg.on('console', onCon); pg.on('popup', onPop);
    let osuDame = 'OK';
    const dlP = pg.waitForEvent('download', { timeout: DL_UE }).catch(() => null);
    await pg.click('#b-fuyo-csv', { timeout: 8000 }).catch((e) => {
        /* ★★また 切って いました（今日 3度目）★★（2026-09-21）
           80字 → 400字 → ★300字★。どれも ★playwright の 訳の 手前★で 切れた。
           ★数で 見る★ … 前回の 出しは `- e` で 終わって いた（`element ...` の 頭）
           ⇒ ★★切らない★★＋★全何字 のうち 何字 出したかを 書く★
              （★次に 足りたかを 数で 決められる★） */
        const zenji2 = String((e && e.message) || e).split(String.fromCharCode(10)).join(' / ');
        const UE2 = 2000;
        osuDame = zenji2.slice(0, UE2) + '【全 ' + zenji2.length + '字のうち '
          + Math.min(UE2, zenji2.length) + '字 出した'
          + (zenji2.length > UE2 ? '＝★足りて いません★' : '＝足りて います') + '】';
    });
    /* ★★押せなかったのに 25秒 待って いました★★（2026-09-21）
       ★押した 結果を 見てから 待つ★＝★赤 1回あたり 25秒 得する★
       ★でも 待ちは 消さない★ … ★「押した OK」でも 落ちない 事が 在りうる★
       ⇒ ★押せたなら 上限まで／押せなかったなら ★あと 1秒だけ★ 待つ★
       （★黙って 打ち切らない★＝待った 秒を 必ず 出す） */
    const dl = (osuDame === 'OK')
      ? await dlP
      : await Promise.race([dlP, new Promise((r) => setTimeout(() => r(null), 1000))]);
    const mattaDl = ((Date.now() - t0dl) / 1000).toFixed(1);
    pg.off('pageerror', onErr); pg.off('console', onCon); pg.off('popup', onPop);
    console.log('       落ちるのを 待った … 上限 ' + (DL_UE / 1000) + '秒 ／ 実測 ' + mattaDl + '秒'
      + ' ／ 余り ' + (DL_UE / 1000 - Number(mattaDl)).toFixed(1) + '秒'
      + ' ／ 押した ' + osuDame + ' ／ 画面の 叫び ' + (sakebi.length ? sakebi.join(' ／ ') : '無し')
      + ' ／ 窓の 数 ' + ctx.pages().length);
    /* ★★押せなかった 時の 番★★（2026-09-21＝★＋ボタンと 同じ 形★）
       ★実測★ … 1枚目だけ ★page.click: Timeout 8000ms exceeded★（2枚目・3枚目は OK）
       ⇒ ★「落ちて こない」では なく ★押せて いない★★
       ⇒ ★＋ボタンと 同じ ★最初の 1回が 押せない★ が 2か所★
       ⇒ ★同じ 覚いか 別の 訳かを ここで 割る★ */
    if (osuDame !== 'OK') {
      const ban2 = await pg.evaluate(() => {
        const el = document.querySelector('#b-fuyo-csv');
        if (!el) return { nai: true };
        const b = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const ue = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        const na3 = (nd) => nd ? (nd.tagName.toLowerCase()
          + (nd.id ? '#' + nd.id : '')
          + (nd.className ? '.' + String(nd.className).trim().split(/\s+/).join('.') : '')).slice(0, 70) : '(誰も 居ない)';
        return {
          mieru: !!(b.width && b.height) && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0',
          hako: { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) },
          gamen: { w: innerWidth, h: innerHeight },
          nakaKa: b.top >= 0 && b.left >= 0 && b.bottom <= innerHeight && b.right <= innerWidth,
          ue: na3(ue), jibunKa: ue === el || (ue && el.contains(ue)),
          ooi: document.querySelectorAll('.ui-modal-ov, .modal, [aria-modal="true"]').length,
          hako_no_ji: Array.prototype.slice.call(document.querySelectorAll('.ui-modal-ov')).map((o) => ({
            dai: (o.querySelector('.ui-modal-t') || {}).textContent || '(題 無し)',
            hon: ((o.querySelector('.ui-modal-b') || {}).textContent || '(文 無し)').slice(0, 200),
          })),
          pe: cs.pointerEvents, disabled: !!el.disabled,
        };
      }).catch((e2) => ({ dame: String((e2 && e2.message) || e2).slice(0, 80) }));
      console.log('       ★CSVの ボタンを 押せなかった 瞬間の 番★ … ' + JSON.stringify(ban2));
    }
    T('★' + na + '＝押したら 本当に 落ちる', !!dl,
      osuDame !== 'OK' ? '★押せて いません★（上の 番を 見る）' : 'ファイルが 落ちてこない（上の 数を 見る）');
    if (!dl) continue;
    const na2 = dl.suggestedFilename();
    const fp = await dl.path();
    const buf = fp ? fs.readFileSync(fp) : Buffer.alloc(0);
    const m = csvMiru(buf.toString('latin1'));
    console.log('       落ちた … ' + na2 + ' ' + buf.length + 'バイト'
      + ' sha256 ' + crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12)
      + ' ／ 行' + m.gyo + ' データ' + m.data + ' 列' + m.retsu + ' ずれ' + m.zure
      + ' 異動の別[' + m.idou.join(' ') + ']');
    T('★' + na + '＝名前が SHFD0006.CSV', na2 === 'SHFD0006.CSV', '落ちた 名前は ' + na2);
    T('★' + na + '＝様式 2202700 の 行が 1本', m.data === 1, 'データ行 ' + m.data + '本');
    T('★' + na + '＝列が 139（ずれ 0）', m.retsu === 139 && m.zure === 0,
      '列 ' + m.retsu + '／ずれ ' + m.zure);
    T('★' + na + '＝項番21 異動の別が「' + v + '」', m.idou[0] === v,
      '紙に 入っていたのは 「' + m.idou[0] + '」★＝画面で 選んだ物と 違う★');
  }

  /* ★★自分の ゴミを 自分で 数える（2026-09-14 指示役1 の 注文）★★
     ★後始末したつもり★を 緑に しない＝★押す前と 後で 人数を 数えて 合わせる★。 */
  await katazuke();
  await machi(400);
  const ato2 = await pg.evaluate(() => document.querySelectorAll('#emp-list .mco').length);
  console.log('  画面の 札 … 前 ' + mae + ' → 後 ' + ato2 + '（★これは 緑の 根拠に しません★）');
  /* ★★『緑の 根拠に しない』と『見ない』は 別★★（2026-09-21 実測で 踏んだ）
     ★実物（5c5ea3b の CI）★
        片づけ … ⑥開き直して 数えた … ★残り 0人★
        画面の 札 … ★前 2 → 後 3★
        🟡 ★未測定★ ★この環境では 倉庫を 数えていません★（試験の 鍵が 無い）
     ⇒ ★★同じ 出しの 中で 食い違って いたのに 誰も 止めなかった★★
     ⇒ ★倉庫を 数えられない CI では ★これが 唯一 見える 印★★
     ⇒ ★★置き去りが 黙って 残り、次の 回の 紙を 壊した★★（扶養CSV が データ2行）
     ★決め★ … ★★札が 増えたら 赤★★
        ＝★この 試験は 1人 足して 1人 消す★＝★元に 戻るのが 当たり前★
     ★増えて いない 時は 緑の 根拠に しない★（減る・同じ には 別の 訳が 在りうる）
        ＝★★片側だけ 使う★★（今日 何度も 出た「0件は 0件では ない」の 裏） */
  T('★片づけの 後 画面の 札が 増えて いない（前 ' + mae + ' → 後 ' + ato2 + '）', ato2 <= mae,
    '★札が ' + (ato2 - mae) + ' 増えました★＝★片づけの「残り 0人」と 食い違って います★'
    + '（★倉庫を 数えられない 席でも これは 見えます★）');
  /* ★本当の 判じは 倉庫★＝消えるまで 待ち、待っても 消えなければ 赤 */
  const sou = await AWASERU(soukoMae, 20);
  if (sou.han === '環境') console.log('  ' + sou.iu);   /* ★緑で 通すが 数は 出す★（総なめが 拾う 字） */
  else if (sou.han === '未測定') { mihakari++; console.log('  🟡 ★未測定★ 後始末を 倉庫で 数えられない … ' + sou.iu); }
  else T('★後始末＝★倉庫の 行数★が 元に 戻った', sou.han === '緑', sou.iu);
  if (sou.han === '緑') console.log('       ' + sou.iu);
} catch (e) {
  fail++; console.log('  ✗ 途中で 止まった … ' + (e && e.message));
} finally {
  await katazuke();
  await b.close(); srv.close();
}

console.log('\n' + pass + ' passed, ' + fail + ' failed'
  + (mihakari ? ' ／ 🟡未測定 ' + mihakari : ''));
process.exit(fail ? 1 : 0);
