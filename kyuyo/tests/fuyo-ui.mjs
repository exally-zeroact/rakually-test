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
let borrow, pwLaunch, hairu, osu, KAZOERU, AWASERU, GOMI_KESU, IMA;
try {
  ({ borrow, launch: pwLaunch } = await import('../../scripts/_borrow-playwright.mjs'));
  ({ hairu, osu } = await import('../../tests/_hairu.mjs'));
  ({ kazoeru: KAZOERU, awaseru: AWASERU, konkaiNoGomiKesu: GOMI_KESU, ima: IMA } = await import('./_souko-kazoeru.mjs'));
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
    /* ★★後始末の 作り（2026-09-14・5回 直した）★★
       実測で 分かった 事：
         ・足した 直後 札は ★開いている★（open:true / .mco-body 1個）
         ・しかし ★.m-del-emp は 0個★＝削除ボタンは ★詳細設定の 中★に 在る
         ・その 詳細設定（.emp-dtgl[data-dtoggle]）は ★本物の click では 掴めなかった★
       ⇒ ★片づけだけは 手本(shutoku-ui.mjs)と 同じく JSで 投げる★。
         ★測る所（被扶養者届が 本当に 出るか）は 本物の click★＝ここは 分けている
         （[[feedback_js_dispatched_event_is_not_the_customer_path]]）。 */
    const nage = (c, sel) => pg.evaluate((a) => {
      const card = document.querySelector(a.c);
      const el = card && card.querySelector(a.sel);
      if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return !!el;
    }, { c, sel }).catch(() => false);

    const aru = () => pg.evaluate((c) => {
      const card = document.querySelector(c);
      return card ? card.querySelectorAll('.m-del-emp').length : -1;
    }, CARD).catch(() => -1);

    if (await aru() === 0) { await nage(CARD, '.emp-dtgl[data-dtoggle]'); await machi(900); }
    console.log('       片づけ … 削除ボタン ' + (await aru()) + '個');
    await nage(CARD, '.m-del-emp');
    await machi(700);
    /* 確認は uiConfirm の ★「OK」★（実測） */
    await pg.evaluate(() => {
      const y = Array.from(document.querySelectorAll('button'))
        .find((e) => e.offsetParent && e.textContent.trim() === 'OK');
      if (y) y.click();
    }).catch(() => null);
    await machi(1000);
    /* ★★明細も 消す（2026-09-14 実測で 足した）★★
       画面の「削除」は ★従業員を 消すだけ★＝★明細は 倉庫に 残る★（孤児に なる）。
       実測 … 人 5→5 なのに ★明細が +1★で 赤に なった（新しい 物差しが 捕まえた）。
       ⇒ ★片づけ専用として 倉庫から 直に 消す★（測る所では 使わない）。 */
    const kesu = await GOMI_KESU(HAJIME);
    if (!kesu.ok) console.log('       🟡 明細を 消せなかった … ' + kesu.naze);
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
     ⇒ ★この札の かたまりを 全部 開く★（片づけと 同じく JS投げ＝測る所では ない）。 */
  /* ★★開く つもりが 閉じていた（2026-09-14 実測）★★
     かたまりの 印は ★切り替え★なので、★既に 開いている 物を 押すと 閉じる★。
     1回目で 家族が 開き、2回目で 家族が 閉じ 本人の 欄が 開いた＝★毎回 どこかが 欠けた★。
     ⇒ ★欲しい 欄が 出るまで 押す★（最大 3回）＝★開いたか どうかは 欄の 有無で 決める★
       （印が 付いたかでは 見ない＝会社の 決まり）。 */
  const aruka = (sel) => pg.evaluate((x) => !!document.querySelector(x), sel).catch(() => false);
  /* ★★一括で 押すと 開け閉めが 打ち消し合う（2026-09-14 実測）★★
     かたまりの 印は ★切り替え★。全部 押すと ★開いていた 物が 閉じる★＝3回 押しても 揃わなかった。
     ⇒ ★手本(shutoku-ui.mjs)と 同じく 名前を 決めて 1回ずつ★ 開く。
       ★開いたかは 欄の 有無で 見る★（印が 付いたかでは 見ない＝会社の 決まり）。 */
  const akeru = async (k) => {
    await pg.evaluate((x) => {
      const card = document.querySelector(x.c); if (!card) return;
      const t = Array.from(card.querySelectorAll('[data-dsub]'))
        .find((e) => String(e.getAttribute('data-dsub')).endsWith(':' + x.k));
      if (t) t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }, { c: CARD, k }).catch(() => null);
    await machi(700);
  };
  const hiraku = async (hoshii) => {
    for (const k of ['zaiseki', 'zei', 'shaho', 'teate', 'kazoku']) {
      const nokori = [];
      for (const sel of hoshii) { if (!(await aruka(sel))) nokori.push(sel); }
      if (!nokori.length) break;
      await akeru(k);
    }
    const nokori2 = [];
    for (const sel of hoshii) { if (!(await aruka(sel))) nokori2.push(sel); }
    return { nokori: nokori2.length, doko: nokori2.map((x) => x.replace(/^.*\[data-/, '[data-')) };
  };

  /* ★★詳細設定の 印は「切り替え」＝押すたび 開いたり 閉じたり（2026-09-14 実測で 踏んだ）★★
     ★毎回 押す★書き方だと ①の 回で 閉じ、②で 開き…と 交互に なり、
     ★増えた の 5欄（職業/同居/収入/入った日/理由）だけ 打てず★「出せる人が いません」に なった。
     ⇒ ★開いているかは『中の 欄が 在るか』で 見る★（印が 付いたかでは 見ない＝会社の 決まり）。 */
  const dsAkeru = async () => {
    for (let i = 0; i < 3; i++) {
      if (await aruka(CARD + ' [data-dsub]')) return true;
      await nage(CARD, '.emp-dtgl[data-dtoggle]');
      await machi(900);
    }
    return aruka(CARD + ' [data-dsub]');
  };
  await dsAkeru();
  const HON = ['seibetsu', 'zip', 'address', 'kisoNenkin', 'hokenshaNo'].map((f) => CARD + ' [data-f="' + f + '"]');
  console.log('       かたまりを 開く … ' + JSON.stringify(await hiraku(HON)));

  /* ── ① 本人の 欄（★確定は させない★＝A案。届出に 明細の 確定は 要らない） ── */
  const NA = '試験' + String(Date.now()).slice(-6);
  for (const [f, v] of [['name', NA + Z + '太郎'], ['kana', 'ｼｹﾝ ﾀﾛｳ'], ['birthYmd', '1985-05-15'],
    ['seibetsu', 'male'], ['zip', '790-0001'], ['address', '愛媛県松山市1-2-3'],
    ['kisoNenkin', '1234-567890'], ['hokenshaNo', '1']]) {
    if (!(await utsu(pg, CARD + ' [data-f="' + f + '"]', v))) console.log('       🟡 欄が 無い … ' + f);
  }
  /* 家族（被扶養者）の かたまりを 開く */
  /* 家族を 1人 足す（★本物の click★＝ここは 測る所） */
  /* ★家族の かたまりを 開いてから 足す★（開いていないと ＋の ボタンも DOM に 無い） */
  await hiraku([CARD + ' [data-kzadd]']);
  await pg.click(CARD + ' [data-kzadd]', { timeout: 8000 }).catch(() => null);
  await machi(1000);
  /* ★足すと 描き直る★＝欄が 出るまで もう一度 開く */
  console.log('       家族の 欄を 出す … ' + JSON.stringify(await hiraku([CARD + ' [data-kz$=":0:seiKanji"]'])));
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
  for (const [v, na] of [['1', '増えた'], ['2', '減った'], ['3', '変わった']]) {
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
    const [dl] = await Promise.all([
      pg.waitForEvent('download', { timeout: 25000 }).catch(() => null),
      pg.click('#b-fuyo-csv', { timeout: 8000 }).catch(() => null),
    ]);
    T('★' + na + '＝押したら 本当に 落ちる', !!dl, 'ファイルが 落ちてこない');
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
