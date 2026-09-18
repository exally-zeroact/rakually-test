/* shutoku-ui.mjs — ★資格取得届を ★実ブラウザで お客さんの道どおり★ 出す★
 * =============================================================================
 * ★なぜ 作ったか（2026-09-05 指示役の 注文①）★
 *   前の回、私は ★実ブラウザで ボタンを 押して ファイルを 落とす所まで やれず★
 *   「★穴が 在るのでは なく 私が 測れていない★」と 書いて 出した。
 *   ⇒★先に 道具を 直せ★＝★通せない 道が 在る間は、そこは ずっと 未測定のまま★。
 *
 * ★道具を 直した その日に 本物の 穴が 出た（実測）★
 *   ★氏名（カナ）を 入れる 欄が 従業員マスタに 1つも 無かった★
 *   ⇒ e.kana は ★誰も 入れられない＝必ず 空★
 *   ⇒ それでも 画面は「CSVを作る（1人・SHFD0006.CSV）」と ★言えて しまっていた★
 *      （dasuKa* が カナを 見ていなかった）
 *   ⇒ 押すと 門で 止まって 0バイト＝★「出せます」と 言われてから 断られる★
 *   ★算定・月変・賞与・取得の 4つ ぜんぶ 同じ★だった。
 *   ⇒★欄を 足し／dasuKa* を 直し／warn が 名前と 理由を 出すように した★
 *   ★jsdom の 統合試験では 見つからなかった★＝材料に カナを 手で 入れていたから。
 *     ★実物の 画面から 入れる 道を 通すまで 分からない★＝この 試験が 要る 理由。
 *
 * ★測る事★
 *   ①欄が 実物に 在る（氏名カナ・性別・住所カナ）
 *   ②何も 入れない 人は ★出せない★＝ボタンが 嘘を つかない
 *   ③ぜんぶ 入れたら ★ボタンが 押せる★
 *   ④押したら ★SHFD0006.CSV が 本当に 落ちてくる★（バイト数・様式コード・列の数）
 *
 * 使い方: node kyuyo/tests/shutoku-ui.mjs [--self-test]
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

{
  /* ★★本番の repo では 測らない（2026-09-16 足した）★★
     ★訳★＝この試験は ★試験用の 口で ログインする★。本番の repo には ★その 鍵が 無い★
       ⇒ 入れない ⇒ 終わり値 2 ⇒ ★本番の WebKit が 毎回 必ず 赤★（実測 2026-09-16）。
     ★中身の 不具合では ありません★＝★測る 場所が 違うだけ★。
     ★数えた★ … webkit.yml に 載る 8本の うち ★この門を 持って いなかったのは 2本★
       （shutoku-ui／soshitsu-ui）。他の 6本は 前から 持って いた。
     ★戻す条件★＝本番CIに 試験の 鍵を 置いた日。 */
  const { kagiAru } = await import('../../tests/_hairu.mjs');
  if (!(await kagiAru(ROOT))) {
    console.log('  — ★この repo（本番）には 試験の 鍵が 無いので ここでは 測れません★'
      + '（★テスト線で 測っています★／戻す条件＝本番CIに 鍵を 置いた日）');
    process.exit(0);
  }
}

const SELF = process.argv.includes('--self-test');

/* ★物差しそのもの★（ブラウザを 使わずに 確かめられる 形） */
export function csvOk(text) {
  const gyo = String(text || '').split('\r\n').filter((x) => x.length);
  const data = gyo.filter((x) => x.indexOf('2200700') === 0);
  /* ★列が ずれた 行が 1本でも 在れば 見つける★（1行目だけ 見ると 2人目の ずれを 見落とす） */
  const zure = data.filter((x) => x.split(',').length !== 34).length;
  return { gyo: gyo.length, data: data.length, zure: zure,
    retsu: data.length ? data[0].split(',').length : 0 };
}

if (SELF) {
  console.log('\n[shutoku-ui] ★自己確認★（★物差しそのもの★・ブラウザを 使わない）');
  let ng = 0;
  const say = (nm, good) => { if (!good) ng++; console.log('  ' + (good ? '✓' : '✗') + ' ' + nm + (good ? '' : '  ★思っていたのと 違う★')); };
  const r34 = '2200700' + ','.repeat(33);
  say('データ行を 数える（34列）', JSON.stringify(csvOk('a,b\r\n' + r34 + '\r\n')) === '{"gyo":2,"data":1,"zure":0,"retsu":34}');
  say('★1つ ずれた 行（33列）を 見つける★', csvOk(r34.slice(0, -1) + '\r\n').zure === 1);
  say('★2人目だけ ずれていても 見つける★', csvOk(r34 + '\r\n' + r34.slice(0, -1) + '\r\n').zure === 1);
  say('データ行が 無ければ 0', csvOk('a,b\r\n').data === 0);
  say('空なら ぜんぶ 0', csvOk('').gyo === 0);
  if (ng) { console.log('\n★自己確認 ' + ng + '件 おかしい★'); process.exit(1); }
  console.log('  ★5通り ぜんぶ 思った通り★');
  process.exit(0);
}

/* ── ここから 実ブラウザ ───────────────────────────────── */
let borrow, pwLaunch, hairu, osu;
try {
  ({ borrow, launch: pwLaunch } = await import('../../scripts/_borrow-playwright.mjs'));
  ({ hairu, osu } = await import('../../tests/_hairu.mjs'));
} catch (e) { console.log('🟡 ★未測定★ 道具が 読めない … ' + (e && e.message)); process.exit(2); }
const wk = await borrow('shutoku-ui', 'webkit');
if (!wk) { console.log('🟡 ★未測定★ playwright を 借りられない（0件＝合格 とは 書かない）'); process.exit(2); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
/* ★倉庫は 本物（DB-test）を 使う★
   ★会社名・事業所所在地は 共有データ（SuiteData）から しか 来ない★（app.js の org 同期）
   ＝★端末だけモードでは 所在地が 永久に 空★＝門の 項番7 で 必ず 止まる。
   ⇒ ここは ★倉庫あり＝お客さんと 同じ形★で 測る（2026-09-05 実測で 分かった）。
   ★後始末★＝この 試験が 足した 人は ★最後に 自分で 消す★（前は 消さずに 19人 溜めた＝私のゴミ）。 */
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
const b = await pwLaunch('shutoku-ui', wk);

let pass = 0, fail = 0, mihakari = 0;
const T = (n, c, m) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (m ? ' — ' + m : '')); } };
const machi = (ms) => new Promise((r) => setTimeout(r, ms));

/* 欄に 打つ（本物の 入力＝アプリが change を 拾う） */
/* ★★打った値が「本当に 入ったか」を 見てから 次へ進む（2026-09-14）★★
   ★この 試験が CI から 外されていた 訳そのもの★＝
     「★CIでは 打った 値が 次の 描き直しに 間に合わず 落ちる★（私の 待ち方が 足りない）」。
   同じ日に fuyo-ui が ★手元 緑・CI 赤★で 同じ所に 落ち、中身は ★日付の 欄だけ★だった:
     input[type=date] に ★1字ずつ 打っていた★＝engine と 土地で 打ち方が 変わる。
   ⇒ ①★fill() で 入れる★ ②★読み返して 見比べる／違えば もう一度（3回）★
     ③それでも 違えば ★false を 返す★＝呼んだ側が 🟡で 言う（★黙って 次へ進まない★）。 */
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
    const ima = await pg.$(sel).then((e2) => (e2 ? e2.inputValue() : null)).catch(() => null);
    if (ima === nozomi) return true;
    await machi(320);
  }
  return false;
}
/* ★本物の マウスで 押す★（JSで イベントを 投げた 物は「お客さんの 道」では ない＝会社の決まり） */
async function tataku(pg, sel) {
  const el = await pg.$(sel);
  if (!el) return false;
  try { await el.scrollIntoViewIfNeeded({ timeout: 3000 }); } catch (e) { /* 見えていれば よい */ }
  try { await el.click({ timeout: 5000 }); return true; } catch (e) { return false; }
}

console.log('\n[shutoku-ui] 資格取得届を ★実ブラウザで お客さんの道どおり★ 出す');

/* ★会社名・所在地は 入口の「共有データ」が 持ち主★（給与の 画面では 読むだけ）
   ⇒ 門は 項番7「事業所所在地／入力されていること」で 止める。★お客さんの 道どおり そこで 入れる★ */
const ctx = await b.newContext({ viewport: { width: 1000, height: 1400 }, acceptDownloads: true });
const pg = await ctx.newPage();
/* ★★「前」は ★ログインの 前★に 数える（2026-09-14 実測で 直した）★★
   ログインの 後に 数えたら ★人 4→3（-1）★で 赤に なった。
   訳＝★ログインした 途端に 既定の『従業員 1』が 倉庫に 書かれる★（今日 見つけた 幻の人）。
     その後 読み直しが 着いて 消えるので、★後に 数えると 1人 減って 見える★。
   ⇒ ★1行も 触っていない 時の 数★を 土台に する。 */
const { kazoeru: KAZOERU, awaseru: AWASERU, konkaiNoGomiKesu: GOMI_KESU, ima: IMA, hitoNoId: HITO_ID, hitoNoMeisai: HITO_MEISAI, hitoNoKagi: HITO_KAGI, kagiTsukuru: KAGI_TSUKURU, kamiTsukuru: KAMI_TSUKURU, hitoNoKami: HITO_KAMI, shitakuKesu: SHITAKU_KESU, kankyoKa: KANKYO, kankyoIu: KANKYO_IU } = await import('./_souko-kazoeru.mjs');
const { katazukeru: KATAZUKERU } = await import('./_kyaku_no_michi_de_katazukeru.mjs');
/* ★始まりは ★倉庫の 時計★に 聞く★＝手元の 時計から 遡ると
   ★直前の 試験の ゴミまで 窓に 入り、自分が 作っていない 物を 消す★（総なめで 捕まった）。 */
const HAJIME = await IMA().then((x) => (x.ok ? x.t : new Date(Date.now() - 5000).toISOString()));
const soukoMae = await KAZOERU();
console.log('  倉庫（前） … ' + (soukoMae.ok
  ? '人 ' + soukoMae.hito + ' ／ 明細 ' + soukoMae.meisai
  : '🟡 ★読めない★ ' + soukoMae.naze));

const h = await hairu(pg, 'http://localhost:' + PORT + '/kyuyo/index.html', '.bn[data-scr="scr-settings"]');
if (!h.haitta) { console.log('  🟡 ★未測定★ ' + h.kai + '回 試して 入れなかった … 画面の 言い分 … ' + (h.naze || '（無し）')); await b.close(); srv.close(); process.exit(2); }
await machi(600);
await osu(pg, '.bn[data-scr="scr-settings"]'); await machi(500);
await osu(pg, '#set-seg .seg-b[data-set="emp"]'); await machi(800);
const hito0 = await pg.evaluate(() => document.querySelectorAll('#emp-list .mco').length);
/* ★人数は 決め打ちしない★（共有の 試験口座＝他の 回の 人も 居る）。
   ★数は 出す★＝増え続けていたら ここで 見える（前は 気づかず 19人 溜めた）。 */
console.log('  （はじめに 居た 人 … ' + hito0 + '人）');

/* ── ① 従業員を 1人 足して、要る 欄を 開く ─────────────────── */
await osu(pg, '.bn[data-scr="scr-settings"]'); await machi(500);
await osu(pg, '#set-seg .seg-b[data-set="emp"]'); await machi(700);
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
/* ★この 口座には 前の 回の 人が 残る★（実測 2026-09-05）＝★今 足した 人＝一番 下の 札★だけを 触る。
   1人目を 触ると ★前の 回の 人を 書き換える★事に なる（実際 1回 やって 空振りした）。 */
const IDX = await pg.evaluate(() => {
  const c = Array.from(document.querySelectorAll('#emp-list .mco'));
  return c.length ? c[c.length - 1].getAttribute('data-i') : null;
});
if (IDX === null) { console.log('  🟡 ★未測定★ 従業員の 札が 1枚も 無い'); await b.close(); srv.close(); process.exit(2); }
const CARD = '#emp-list .mco[data-i="' + IDX + '"]';
console.log('  （今 足した 人＝札 ' + IDX + '番目／全 '
  + (await pg.evaluate(() => document.querySelectorAll('#emp-list .mco').length)) + '枚）');
/* ★足した その場で もう 開いている★（#b-add-emp が state.open[e.id]=true を している）
   ⇒★ここで 押すと 逆に 閉じる★（2026-09-05 実測＝これで 1時間 空振りした） */
await tataku(pg, CARD + ' [data-dtoggle]'); await machi(800);          /* 「詳細設定」 */
for (const k of ['zaiseki', 'shaho', 'teate']) {
  await pg.evaluate((a2) => {
    const c = document.querySelector(a2.c); if (!c) return;
    const t = Array.from(c.querySelectorAll('[data-dsub]'))
      .find((e) => String(e.getAttribute('data-dsub')).endsWith(':' + a2.k));
    if (t) t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, { c: CARD, k: k });
  await machi(700);
}
const aru = await pg.evaluate((c) => Array.from(document.querySelectorAll(c + ' [data-f]'))
  .filter((e) => e.offsetParent).map((e) => e.getAttribute('data-f')), CARD);
T('★① 届出に 要る 欄が 実物に 在る（氏名カナ・性別・住所カナ）',
  aru.indexOf('kana') >= 0 && aru.indexOf('seibetsu') >= 0 && aru.indexOf('jushoKana') >= 0,
  '欄 ' + aru.length + '個 … カナ ' + (aru.indexOf('kana') >= 0) + '／性別 ' + (aru.indexOf('seibetsu') >= 0) + '／住所カナ ' + (aru.indexOf('jushoKana') >= 0));

/* ── ② 何も 入れないまま 帳票を 見る＝★出せないと 言うか★ ─────── */
async function chohyo() {
  await osu(pg, '.bn[data-scr="scr-list"]'); await machi(600);
  await osu(pg, '.seg-b[data-view="cho"]'); await machi(600);
  await osu(pg, '.seg-b[data-cho="shikaku"]'); await machi(1200);
  return pg.evaluate(() => {
    const btn = document.querySelector('#b-shutoku-csv');
    const c = document.querySelector('#view-cho');
    return { fuda: btn ? btn.textContent.trim() : '（無い）', osenai: btn ? btn.disabled : null,
      chui: Array.from(c ? c.querySelectorAll('.cr-warn') : []).map((x) => x.textContent.replace(/\s+/g, ' ').trim()) };
  });
}
/* ★名前は 毎回 変える★＝この 試験の 口座には ★前の 回の 人が 残る★（実測 2026-09-05）。
   「誰も 出せない はず」で 見ると ★前の 回の 人が 出せてしまい 赤に なる★＝時によって 変わる。
   ⇒★今 足した その人★だけを 名指しで 見る。 */
/* ★★置き土産は ★倉庫の 行数★ で 数える（2026-09-14 私の 不始末）★★
   前は ★画面に その 名前の 札が 残っていないか★だけを 見て 緑を 出していた。
   ★倉庫には 残る★＝画面の 削除は ★従業員を 消すだけ／明細は 孤児に なる★（実測 3,599行）。
   ⇒ ★pay_employees と pay_payslips の 行数を 前後で 突き合わせる★。
     ★画面から 消えた は 緑の 根拠に しない★。 */

const NA = '試験' + String(Date.now()).slice(-6);
/* ★★倉庫に 入る 名は これ★★（2026-09-15・webkit で 2度 外した）
   ★氏名（漢字）は ★姓と 名の 間に 全角スペース1つ★★（項番8＝届の 決まり）。
   ★★画面に 打つ のも 倉庫から 引く のも ★この 字★を 使う★★＝★字を 1か所に する★。
   ★なぜ 1か所か★＝前は 下の 一覧で `NA + '　太郎'` を 打ち、
     ★引く時は `NA` だけ★で 探して いた ⇒ ★倉庫には 居るのに 0人★＝★21.6秒 待っても 現れない★。
     ＝★同じ 字が 2か所に 在ると ずれる★。
   ★★`NA` で 引かないで ください★★（★素直に 見えますが 倉庫の 名は これでは ありません★）。 */
const NA_FULL = NA + '　太郎';
await utsu(pg, CARD + ' [data-f="name"]', NA);
await utsu(pg, CARD + ' [data-f="joinYmd"]', '2026-04-01');
const mae = await chohyo();
T('★② 何も 入れていない その人を「出せる」と 言わない（ボタンが 嘘を つかない）',
  mae.chui.join('／').indexOf(NA) >= 0, '「' + NA + '」を 注意に 出していない … ' + mae.chui.join(' ／ ').slice(0, 160));
T('★② 足りない 物を 名前つきで 言う（氏名カナ）',
  mae.chui.join('／').indexOf('氏名（カナ）') >= 0, mae.chui.join(' ／ ').slice(0, 160));

/* ── ③ ぜんぶ 入れる ───────────────────────────────── */

await osu(pg, '.bn[data-scr="scr-settings"]'); await machi(600);
await osu(pg, '#set-seg .seg-b[data-set="emp"]'); await machi(700);
for (const [f, v] of [['name', NA_FULL], ['kana', 'ﾔﾏﾀﾞ ﾀﾛｳ'], ['birthYmd', '1985-05-15'],
  ['joinYmd', '2026-04-01'], ['seibetsu', 'male'], ['zip', '790-0001'],
  ['address', '愛媛県松山市1-2-3'], ['jushoKana', 'ｴﾋﾒｹﾝ ﾏﾂﾔﾏｼ 1-2-3'], ['base', '260000']]) {
  if (!(await utsu(pg, CARD + ' [data-f="' + f + '"]', v))) console.log('       🟡 欄が 無い … ' + f);
}
/* 社会保険＝「詳しく」→「入社時の 見込み」→ 金額 */
await tataku(pg, CARD + ' [data-shd]'); await machi(800);
await pg.evaluate((sel) => {
  const c = document.querySelector(sel); if (!c) return;
  const t = Array.from(c.querySelectorAll('.sh-mode')).find((e) => e.getAttribute('data-mode') === 'shutoku');
  if (t) t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}, CARD);
await machi(800);
const mikomiAru = await utsu(pg, CARD + ' .sh-mikomi', '260000');
T('★③ 「入社時の 見込み」に 切り替えて 金額を 入れられる', mikomiAru, '見込み月額の 欄が 出ない');
/* 会社の 都道府県 */
await osu(pg, '#set-seg .seg-b[data-set="company"]'); await machi(700);
await utsu(pg, '#c-pref', 'ehime');

/* 事業所の 5欄（帳票の 箱の 中で 聞いている） */
await chohyo();
for (const [k, v] of [['seiriKigou', '01-ｱｲ'], ['jigyoshoNo', '12345'],
  ['zip', '790-0001'], ['tel', '089-123-4567'], ['nushi', '健保　良一']]) {
  await utsu(pg, '#view-cho [data-fc="' + k + '"]', v);
}
const ato = await chohyo();
T('★③ ぜんぶ 入れたら ボタンが 押せる', ato.osenai === false,
  'ボタン「' + ato.fuda + '」／押せない ' + ato.osenai + '／注意 ' + ato.chui.join(' ／ ').slice(0, 160));

/* ── ④ 押して ファイルが 本当に 落ちるか ─────────────────── */
if (ato.osenai === false) {
  const [dl] = await Promise.all([
    pg.waitForEvent('download', { timeout: 20000 }).catch(() => null),
    pg.click('#b-shutoku-csv'),
  ]);
  if (!dl) {
    fail++;
    /* ★落ちてこない 時は 画面が 何か 言っている★＝それを そのまま 出す（推し量らない） */
    const iu = await pg.evaluate(() => {
      const m = document.querySelector('.ui-modal-ov');
      return m ? m.textContent.replace(/\s+/g, ' ').trim().slice(0, 300) : '（画面は 何も 言っていない）';
    });
    console.log('  ✗ ★④ 押したのに ファイルが 落ちてこない★ … 画面の 言い分 … ' + iu);
  }
  else {
    const tmp = await dl.path();
    const buf = fs.readFileSync(tmp);
    const m = csvOk(buf.toString('latin1'));
    T('★④ 名前は SHFD0006.CSV', dl.suggestedFilename() === 'SHFD0006.CSV', dl.suggestedFilename());
    T('★④ 1バイト以上 出ている', buf.length > 0, buf.length + ' bytes');
    /* ★人数は 決め打ちしない★（前の回の 人が 残るので 1人とは 限らない）
       見るのは ★1人以上 居る事★と ★1行も 列が ずれていない事★ */
    T('★④ データ行が 1人以上・★どの行も 34列★（1つも ずれていない）',
      m.data >= 1 && m.zure === 0, JSON.stringify(m));
    console.log('       ' + dl.suggestedFilename() + '  ' + buf.length + ' bytes  sha256 '
      + crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12) + '  ' + JSON.stringify(m));
  }
} else { mihakari++; console.log('  🟡 ★未測定★ ボタンが 押せないので ファイルまで 行けていない'); }

/* ── ★後始末＝★客の 道で★ 片づける★ ───────────────────────
   ★前は 消していなかった★＝走らせる たびに 1人 増え、★19人 溜めた★（私が 作った ゴミ）。
   ★2026-09-15 裏口を 閉じた★
     前は ここで ★JSで イベントを 投げて★ .m-del-emp を 叩いていた
     ＝[[feedback_js_dispatched_event_is_not_the_customer_path]]＝★門を 迂回していた★。
     しかも ★札が 閉じていると 何も せず「（消す ボタンが 出ていない）」で 終わって いた★
     ＝★片づけたつもり★。
   ★実測（2026-09-15・本物の click 1回）★
     札を 開く → 詳細設定 → 削除 → 確認 の ★4段とも 本物の click で 通った★（人 4→3）。
   ★消すのは 今 足した 人だけ★（名前で 引く＝他の 人には 触らない）。
   ★アプリが 消させないなら ok:false で 返る★＝★裏口で 抜けない★。 */
{
  /* ★★本当の 証し＝★その人の 明細が 倉庫から 消えるか★★（2026-09-15 司さん「倉庫に 残すな」）
     ★全体の 行数では 足りない★＝他の 試験が 同時に 書くので ★±0 に 見える★事が 在る
     （今日 1度 それで 騙された）。⇒ ★その人の id で 数える★。
     ★id は 消す前に 控える★＝消した 後は 名簿から 居なく なる（画面は id を 出さない）。
     ★分母★＝★消す前に 何行 出来ていたか★。0行なら ★消える所を 見ていない＝はかれない★。 */
  /* ★★倉庫に 届くのを ★数で★ 待つ（2026-09-15 webkit で 1度 外した）★★
     ★外した 訳★＝人を 足すと まず ★既定の 名「従業員 1」★で 作られ、
       その後 名前を 打つ。★保存は 間を 置いて 走る（debounce）★ので
       ★打った 名前が 倉庫に 届く 前に 引いて「0人」に なった★。
       ＝★今日 何度も 言った「時間では なく 数で 待つ」を 自分の 新しい 道具で 踏んだ★。
     ★★待った 量を 出す★★＝★上限 20秒が 妥当かは 今 誰も 知らない★ので
       ★毎回 何秒で 現れたかを 出す★＝★次の 人が 上限を 直せる★。
     ★上限に 当たったら「20秒 待っても 現れない」と 書く★＝★どれだけ 待ったかを 残す★。
     ★★『上限 20秒』は『20秒で 止まる』では ありません★★（2026-09-15 実測 ★21.6秒★）
       ＝★1回の 引き（倉庫への 問い）が 終わってから 上限を 見る★ので ★最後の 1回ぶん はみ出す★。
       ⇒ ★出す 秒は ★実際に 待った 秒★（上限では ない）★＝だから 21.6 と 出る。
     ★★実測 0.8秒★★（2026-09-15・webkit）＝★上限 20秒は 25倍の 余裕★。
       ★★それでも 上限は 縮めません★★（2026-09-15 指示役1）:
         ・★0.8秒は ★1回の 目★★＝★1点で 判じない★
         ・★上限は ★安い 保険★★＝★当たらない 限り 1秒も 損しない★
         ・★21.6秒 掛かったのは 上限の せいでは ない★（名前が 違って 一生 見つからなかった）
           ＝★縮めても 速く なりません★
         ・★縮めると 機械が 混んだ 日に 🟡 が 出る＝★偽の 未測定★★
       ⇒ ★縮めたく なったら ★この 実測（0.8秒）を もう1回 取り直して から★★。 */
  const MACHI_UE = 20000;
  const hajimari = Date.now();
  let EID = { ok: false, naze: 'まだ 引いていない' };
  while (Date.now() - hajimari < MACHI_UE) {
    EID = await HITO_ID(NA_FULL);
    if (EID.ok) break;
    /* ★★答えが 変わり得ない 時は 待たない★★（2026-09-15 CI が 捕まえた）
       ★鍵が 読めない★は「まだ 来ない」では なく「★そもそも 読めない★」＝
       ★1秒おきに 20回 同じ 答えを 聞くだけ★＝★毎回 20秒 まるごと 無駄★。 */
    if (KANKYO(EID.naze)) break;
    await machi(1000);
  }
  const matta = ((Date.now() - hajimari) / 1000).toFixed(1);
  if (EID.ok) console.log('       倉庫に 現れた … ' + matta + '秒（上限 ' + (MACHI_UE / 1000) + '秒）');
  else if (KANKYO(EID.naze)) console.log('       — 倉庫を 数えません（試験の 鍵が 無い）＝★' + matta + '秒で 抜けました★');
  else console.log('       🟡 ' + matta + '秒 待っても 倉庫に 現れない（上限 ' + (MACHI_UE / 1000) + '秒）… ' + EID.naze);
  const meisaiMae = EID.ok ? await HITO_MEISAI(EID.id) : { ok: false, naze: matta + '秒 待っても 現れない（' + EID.naze + '）' };
  if (meisaiMae.ok) console.log('       消す前 … 「' + NA_FULL + '」の 明細 ' + meisaiMae.n + '行');
  else console.log('       🟡 消す前の 明細を 数えられない … ' + meisaiMae.naze);

  /* ★★支度＝この人に「Web明細の 鍵」を 1本 作る★★（2026-09-18）
     ★訳★＝★分母 0 で 緑に しない★。鍵が 元から 0行なら「消えた」も 言えない。
     ★作るのは 支度／測るのは ★客の 道（削除ボタン）で 消えるか★★。
     ★本物の 鍵の 出来かた（月を 確定＝全員に 公開）は 使わない★
       ＝★他人の 月まで 巻き込む★（app.js:5502 の 取り消しが まさに その 形で 事故を 起こした
          ＝2026-09-18 実測 確定 4→1／元から 在った 3件を 壊した）。 */
  /* ★鍵を ★2本★ 作る★
       ㋐ぶら下がり 無し … ★消えるはず★
       ㋑紙を 1枚 ぶら下げる … ★消えては いけない★（紙は CASCADE で 一緒に 消える＝お金の 記録） */
  /* ★★鍵が 無い＝★環境★（★はかれない では ない）★★＝09-14 の 決め①
       ★人の id が 分からない★と だけ 書くと ★KANKYO() に 当たらず 赤に なる★
       （2026-09-18 … WebKit の CI が これで 赤＝★9 passed 0 failed なのに 終わり値 1★）。
     ⇒ ★訳を そのまま 持ち越す★＝EID の 訳（鍵の 紙が 読めない…）を 渡す。 */
  const idNashi = EID.ok ? '' : (EID.naze || '人の id が 分からない');
  let kagiMae = { ok: false, n: 0, naze: idNashi };
  let kamiMae = { ok: false, n: 0, naze: idNashi };
  if (EID.ok) {
    const t1 = await KAGI_TSUKURU(EID.id);                 /* ㋐裸の 鍵 */
    const t2 = await KAGI_TSUKURU(EID.id);                 /* ㋑紙を 付ける 鍵 */
    let kami = { ok: false, naze: '鍵が 作れて いない' };
    if (t2.ok && t2.token) kami = await KAMI_TSUKURU(t2.token);
    if (!t1.ok || !t2.ok) kagiMae = { ok: false, n: 0, naze: '鍵を 作れない … ' + (t1.naze || t2.naze) };
    else kagiMae = await HITO_KAGI(EID.id);
    kamiMae = kami.ok ? await HITO_KAMI(EID.id) : { ok: false, n: 0, naze: '紙を 作れない … ' + kami.naze };
  }
  if (kagiMae.ok) console.log('       消す前 … 「' + NA_FULL + '」の Web明細の 鍵 ' + kagiMae.n + '行'
    + '（うち 紙が ぶら下がる 鍵 1本）／紙 ' + (kamiMae.ok ? kamiMae.n + '枚' : '数えられない'));
  else console.log('       🟡 消す前の 鍵を 数えられない … ' + kagiMae.naze);

  const r = await KATAZUKERU(pg, { na: NA, machi, osu });
  r.michi.forEach((m) => console.log('       片づけ … ' + m));
  const nokori = await pg.evaluate((na) => Array.from(document.querySelectorAll('#emp-list .mco'))
    .filter((x) => ((x.querySelector('.mco-nm') || {}).textContent || '').indexOf(na) >= 0).length, NA);
  T('★⑤ 後始末＝この 試験が 足した 人を ★客の 道で★ 消した（ゴミを 残さない）', nokori === 0,
    '「' + NA + '」が ' + nokori + '人 残っている（' + (r.naze || 'ok') + '）');

  /* ★★消した 後に もう一度 数える★★＝★人は 消えたが 明細は 残る★が 直ったかの 1点 */
  if (KANKYO(EID.naze) || KANKYO(meisaiMae.naze)) {
    /* ★★鍵が 無い＝★環境★（★未測定では ない★）★★＝09-14 の 決め①
       ★`未測定も 赤` は そのまま★＝★本当の 未測定（測れるはずなのに 測れない）は 今までどおり 赤★。
       ⇒ ★ここは 数えない／★字は 出す★★（★0件＝合格 とは 書かない★）。 */
    KANKYO_IU('人を 消した後の 明細を 数えていません');
  } else if (!meisaiMae.ok || !EID.ok) {
    mihakari++;
    console.log('  🟡 ★はかれない★ その人の 明細を 倉庫で 数えられない … ' + (meisaiMae.naze || EID.naze));
  } else if (meisaiMae.n === 0) {
    mihakari++;
    console.log('  🟡 ★はかれない★ 消す前に 明細が 0行＝★消える所を 見ていません★（分母 0）');
  } else {
    await machi(2500);
    const meisaiAto = await HITO_MEISAI(EID.id);
    if (!meisaiAto.ok) { mihakari++; console.log('  🟡 ★はかれない★ 消した後を 数えられない … ' + meisaiAto.naze); }
    else {
      console.log('       消した後 … 「' + NA_FULL + '」の 明細 ' + meisaiAto.n + '行（消す前 ' + meisaiMae.n + '行）');
      T('★⑤-2 ★消した 人の 給与明細が 倉庫から 消えた★（' + meisaiMae.n + '行 → ' + meisaiAto.n + '行）',
        meisaiAto.n === 0, '★' + meisaiAto.n + '行 残っている＝孤児に なりました★');
    }
  }

  /* ★★⑤-3 ★消した 人の「Web明細の 鍵」も 消えた★★（2026-09-18 に 足した）
     ★訳★＝人を 消しても 鍵の 行が 残って いた（テスト線 78行中 ★73行が 居ない人★）。
       ★リンクは 失効して いる（unpublishMeisai）＝危険では なく 残骸★だが、
       司さん「いらん従業員なら 消せや 倉庫に 残すな」に 当たって いなかった。
     ★分母 0 では 緑に しない★＝作れて いなければ ★はかれない★と 言う。 */
  if (KANKYO(kagiMae.naze || '')) {
    KANKYO_IU('人を 消した後の Web明細の 鍵を 数えていません');
  } else if (!kagiMae.ok) {
    mihakari++;
    console.log('  🟡 ★はかれない★ 消す前の 鍵を 数えられない … ' + kagiMae.naze);
  } else if (kagiMae.n === 0) {
    mihakari++;
    console.log('  🟡 ★はかれない★ 消す前に 鍵が 0行＝★消える所を 見ていません★（分母 0）');
  } else {
    await machi(1500);
    const kagiAto = await HITO_KAGI(EID.id);
    if (!kagiAto.ok) { mihakari++; console.log('  🟡 ★はかれない★ 消した後の 鍵を 数えられない … ' + kagiAto.naze); }
    else {
      const kamiAto = await HITO_KAMI(EID.id);
      console.log('       消した後 … 鍵 ' + kagiAto.n + '行（消す前 ' + kagiMae.n + '行）'
        + '／紙 ' + (kamiAto.ok ? kamiAto.n + '枚' : '数えられない') + '（消す前 ' + kamiMae.n + '枚）');
      /* ★裸の 鍵は 消える★＝2本 中 1本に なる（残る 1本は 紙が ぶら下がって いる 方） */
      T('★⑤-3 ★裸の 鍵は 倉庫から 消えた★（鍵 ' + kagiMae.n + '行 → ' + kagiAto.n + '行）',
        kagiAto.n === 1, kagiAto.n > 1
          ? '★' + kagiAto.n + '行＝裸の 鍵が 消えて いません（居ない人の 鍵が 残ります）★'
          : '★0行＝★守るはずの 鍵まで 消えました★（紙が 道連れに なります）★');
      /* ★★紙が ぶら下がる 鍵は 消さない★★＝消すと ★お金の 記録が CASCADE で 道連れ★
         （2026-09-18 実測 … 私が これを 数えずに 消し 紙を 15行→2行に した） */
      T('★⑤-4 ★お金の 記録（公開された 紙）は 道連れに しない★（紙 ' + kamiMae.n + '枚 → '
        + (kamiAto.ok ? kamiAto.n : '?') + '枚）',
        kamiAto.ok && kamiAto.n === kamiMae.n && kamiMae.n > 0,
        '★紙が 減った／数えられない＝鍵を 消す時に 紙まで 消えて います★');
      /* ★支度の 後始末★＝この 試験が わざと 作った「守られる 鍵と 紙」を 自分で 片づける
         （★守られる 物を 作った＝店は 消せない★ので ★試験が 消す★／門が 赤に して 気付かせた） */
      const sk = await SHITAKU_KESU(EID.id);
      console.log('       支度の 後始末 … ' + (sk.ok ? '紙 ' + sk.kami + '枚／鍵 ' + sk.kagi + '行 消した'
        : '★消せなかった★ ' + sk.naze));
    }
  }
}

/* ★本当の 判じは 倉庫★＝画面の 数では ない */
{
  const kesu = await GOMI_KESU(HAJIME);      /* ★この回で 出た 孤児だけ★（前からの 分には 触らない） */
  if (!kesu.ok) console.log('       🟡 この回の 明細を 消せなかった … ' + kesu.naze);
  const sou = await AWASERU(soukoMae, 20);
  if (sou.han === '環境') console.log('  ' + sou.iu);   /* ★緑で 通すが 数は 出す★（総なめが 拾う 字） */
  else if (sou.han === '未測定') { mihakari++; console.log('  🟡 ★未測定★ 後始末を 倉庫で 数えられない … ' + sou.iu); }
  else T('★⑥ 後始末＝★倉庫の 行数★が 元に 戻った', sou.han === '緑', sou.iu);
  if (sou.han === '緑') console.log('       ' + sou.iu);
}

await pg.close(); await b.close(); srv.close();
console.log('\n  ' + pass + ' passed, ' + fail + ' failed' + (mihakari ? ' ／ 🟡未測定 ' + mihakari : ''));
process.exit((fail || mihakari) ? 1 : 0);
